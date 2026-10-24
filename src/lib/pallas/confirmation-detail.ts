import type {
  PallasActionProposal,
  PallasProposalRiskLevel,
  PallasProposalStatus,
} from './types';

export type PallasConfirmationBoundaryKind =
  | 'permission'
  | 'expiration'
  | 'rejection'
  | 'execution'
  | 'audit';

export type PallasConfirmationControlName = 'confirm' | 'reject' | 'expire' | 'execute';

export interface PallasConfirmationBoundary {
  kind: PallasConfirmationBoundaryKind;
  title: string;
  description: string;
}

export interface PallasConfirmationControl {
  name: PallasConfirmationControlName;
  label: string;
  enabled: boolean;
  reason: string;
}

export interface PallasConfirmationDetailContract {
  mode: 'preview' | 'persisted';
  proposalId: string;
  status: PallasProposalStatus;
  statusLabel: string;
  statusDescription: string;
  riskLabel: string;
  createdAt: string;
  expiresAt: string;
  isStale: boolean;
  controls: PallasConfirmationControl[];
  boundaries: PallasConfirmationBoundary[];
}

const STATUS_COPY: Record<PallasProposalStatus, { label: string; description: string }> = {
  draft: {
    label: '草稿',
    description: '仅用于确认前预览；当前不会持久化为可确认提案。',
  },
  awaiting_confirmation: {
    label: '等待确认',
    description: '持久化提案停在此状态，必须由用户显式确认、拒绝或过期处理。',
  },
  confirmed: {
    label: '已确认',
    description: '确认只代表用户意图，执行仍应走独立 endpoint 和权限复查。',
  },
  executing: {
    label: '执行中',
    description: '执行状态只应由独立执行链路写入，不能从预览面板触发。',
  },
  succeeded: {
    label: '已完成',
    description: '执行结果需要写入审计摘要，供后续回放。',
  },
  failed: {
    label: '失败',
    description: '失败状态需要保留错误摘要，不能静默重试。',
  },
  rejected: {
    label: '已拒绝',
    description: '拒绝后不能继续确认或执行；需要重新生成新的提案。',
  },
  expired: {
    label: '已过期',
    description: '过期后不能继续确认或执行；需要重新生成新的提案。',
  },
};

const RISK_COPY: Record<PallasProposalRiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  external: '外部副作用',
};

function addMinutes(iso: string, minutes: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + minutes * 60_000).toISOString();
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export function buildPallasConfirmationDetailContract(
  proposal: Pick<PallasActionProposal, 'id' | 'status' | 'riskLevel' | 'createdAt' | 'expiresAt'>,
  options: { mode?: 'preview' | 'persisted'; now?: Date; ttlMinutes?: number } = {},
): PallasConfirmationDetailContract {
  const mode = options.mode ?? (proposal.status === 'draft' ? 'preview' : 'persisted');
  const ttlMinutes = options.ttlMinutes ?? 24 * 60;
  const expiresAt = proposal.expiresAt ?? addMinutes(proposal.createdAt, ttlMinutes);
  const nowMs = (options.now ?? new Date()).getTime();
  const expiresMs = new Date(expiresAt).getTime();
  const isStale = proposal.status === 'expired' || (!Number.isNaN(expiresMs) && nowMs > expiresMs);
  const statusCopy = STATUS_COPY[proposal.status];
  const canManagePersistedLifecycle = mode === 'persisted' && proposal.status === 'awaiting_confirmation';
  const canConfirmPersistedProposal = canManagePersistedLifecycle && !isStale;
  const canExecutePersistedProposal = mode === 'persisted' && proposal.status === 'confirmed' && !isStale;

  return {
    mode,
    proposalId: proposal.id,
    status: proposal.status,
    statusLabel: isStale && proposal.status === 'draft' ? '草稿已过期' : statusCopy.label,
    statusDescription: isStale && proposal.status === 'draft'
      ? '这个草稿已经超过预览建议有效期；当前 UI 只提示边界，不执行服务器过期写入。'
      : statusCopy.description,
    riskLabel: RISK_COPY[proposal.riskLevel],
    createdAt: proposal.createdAt,
    expiresAt,
    isStale,
    controls: [
      {
        name: 'confirm',
        label: canConfirmPersistedProposal ? '确认提案' : '确认（不可用）',
        enabled: canConfirmPersistedProposal,
        reason: canConfirmPersistedProposal
          ? '只记录用户确认意图并写入 confirmed 状态；创建任务必须再走单独执行动作。'
          : '只有未过期、等待确认的持久化提案可以确认；确认不等于执行。',
      },
      {
        name: 'reject',
        label: canManagePersistedLifecycle ? '拒绝提案（不创建任务）' : '拒绝（不可用）',
        enabled: canManagePersistedLifecycle,
        reason: canManagePersistedLifecycle
          ? '只把持久化提案标记为 rejected；不会创建任务，也不会调用工具。'
          : '只有等待确认的持久化提案可以拒绝。',
      },
      {
        name: 'expire',
        label: canManagePersistedLifecycle ? '标记过期（不执行工具）' : '标记过期（不可用）',
        enabled: canManagePersistedLifecycle,
        reason: canManagePersistedLifecycle
          ? '只把持久化提案标记为 expired；不会创建任务，也不会调用工具。'
          : '只有等待确认的持久化提案可以标记过期。',
      },
      {
        name: 'execute',
        label: canExecutePersistedProposal ? '创建 Closr 任务' : '创建任务（不可用）',
        enabled: canExecutePersistedProposal,
        reason: canExecutePersistedProposal
          ? '已确认的持久化提案可以通过独立 endpoint 创建 Closr 内部任务；不会调用 execute-tools 或第三方连接器。'
          : '只有未过期、已确认的持久化提案可以执行；预览永远不调用 execute-tools。',
      },
    ],
    boundaries: [
      {
        kind: 'permission',
        title: '权限边界',
        description: '只允许通过现有 org / account / strategic play 访问检查的用户查看；确认时必须重新校验同一上下文。',
      },
      {
        kind: 'expiration',
        title: '过期边界',
        description: '预览草稿建议 24 小时内重新生成；持久化提案过期后只能重新生成，不能继续确认。',
      },
      {
        kind: 'rejection',
        title: '拒绝边界',
        description: '拒绝只改变提案生命周期，不创建任务，不调用工具，并保留拒绝审计痕迹。',
      },
      {
        kind: 'execution',
        title: '执行边界',
        description: '确认不等于执行；创建任务必须走单独接口、重新鉴权、幂等写入，并且不能从预览面板隐式触发。',
      },
      {
        kind: 'audit',
        title: '审计边界',
        description: '持久化后需要记录来源、字段差异、确认人、确认时间、执行结果；当前本地预览不写审计表。',
      },
    ],
  };
}
