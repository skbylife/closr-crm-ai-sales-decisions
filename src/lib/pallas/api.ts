import type {
  PallasArtifactKind,
  PallasEntityContext,
  PallasJson,
  PallasProposalStatus,
  PallasProposedAction,
  PallasSourceRef,
} from './types';

const ARTIFACT_KINDS: ReadonlySet<string> = new Set([
  'customer_research_card',
  'strategic_play_action_board',
  'communication_draft_preview',
  'evidence_pack',
  'ask_data_result',
]);

const ENTITY_TYPES: ReadonlySet<string> = new Set([
  'account',
  'contact',
  'opportunity',
  'strategic_play',
  'task',
  'global',
]);

const PROPOSAL_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'awaiting_confirmation',
  'confirmed',
  'executing',
  'succeeded',
  'failed',
  'rejected',
  'expired',
]);

const PALLAS_PREVIEW_GATES: ReadonlySet<string> = new Set([
  '1',
  'action-board',
  'strategic-play-action-board',
]);

const PALLAS_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'rejected',
  'expired',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  if (value == null) return value as null | undefined;
  return typeof value === 'string' ? value : undefined;
}

export function parsePallasEntityContext(value: unknown): PallasEntityContext | null {
  if (!isRecord(value)) return null;
  const entityType = value.entityType;
  if (typeof entityType !== 'string' || !ENTITY_TYPES.has(entityType)) return null;
  const entityId = optionalString(value.entityId);
  if (entityId === undefined) return null;

  return {
    entityType: entityType as PallasEntityContext['entityType'],
    entityId,
    accountId: optionalString(value.accountId),
    contactId: optionalString(value.contactId),
    opportunityId: optionalString(value.opportunityId),
    strategicPlayId: optionalString(value.strategicPlayId),
  };
}

export function parsePallasArtifactBody(value: unknown): {
  kind: PallasArtifactKind;
  title: string;
  context: PallasEntityContext;
  data: PallasJson;
  sourceRefs: PallasSourceRef[];
} | null {
  if (!isRecord(value)) return null;
  const context = parsePallasEntityContext(value.context);
  if (!context) return null;
  if (typeof value.kind !== 'string' || !ARTIFACT_KINDS.has(value.kind)) return null;
  if (typeof value.title !== 'string' || !value.title.trim()) return null;

  return {
    kind: value.kind as PallasArtifactKind,
    title: value.title.trim(),
    context,
    data: (value.data ?? {}) as PallasJson,
    sourceRefs: Array.isArray(value.sourceRefs) ? value.sourceRefs as PallasSourceRef[] : [],
  };
}

export function parsePallasProposalBody(value: unknown): {
  artifactId: string | null;
  conversationId: string;
  context: PallasEntityContext;
  actions: PallasProposedAction[];
  sourceRefs: PallasSourceRef[];
  expiresAt: string | null;
} | null {
  if (!isRecord(value)) return null;
  const context = parsePallasEntityContext(value.context);
  if (!context) return null;
  if (typeof value.conversationId !== 'string' || !value.conversationId.trim()) return null;
  if (!Array.isArray(value.actions) || value.actions.length === 0) return null;

  return {
    artifactId: optionalString(value.artifactId) ?? null,
    conversationId: value.conversationId.trim(),
    context,
    actions: value.actions as PallasProposedAction[],
    sourceRefs: Array.isArray(value.sourceRefs) ? value.sourceRefs as PallasSourceRef[] : [],
    expiresAt: optionalString(value.expiresAt) ?? null,
  };
}

export function parsePallasStatusBody(value: unknown): {
  status: PallasProposalStatus;
  resultSummary: string | null;
} | null {
  if (!isRecord(value)) return null;
  if (typeof value.status !== 'string' || !PROPOSAL_STATUSES.has(value.status)) return null;
  const resultSummary = optionalString(value.resultSummary);
  if (resultSummary === undefined) return null;
  return {
    status: value.status as PallasProposalStatus,
    resultSummary: resultSummary ?? null,
  };
}

export function isPallasPreviewGateValue(value: unknown): boolean {
  return typeof value === 'string' && PALLAS_PREVIEW_GATES.has(value);
}

export function parsePallasLifecycleStatusBody(value: unknown): {
  status: Extract<PallasProposalStatus, 'confirmed' | 'rejected' | 'expired'>;
  reason: string | null;
} | null {
  if (!isRecord(value)) return null;
  if (!isPallasPreviewGateValue(value.pallas)) return null;
  if (typeof value.status !== 'string' || !PALLAS_LIFECYCLE_STATUSES.has(value.status)) return null;

  const reason = optionalString(value.reason);
  if (reason === undefined) return null;

  return {
    status: value.status as Extract<PallasProposalStatus, 'confirmed' | 'rejected' | 'expired'>,
    reason: reason?.trim() || null,
  };
}

export function buildPallasLifecycleAuditSummary(params: {
  status: Extract<PallasProposalStatus, 'confirmed' | 'rejected' | 'expired'>;
  reason?: string | null;
}): string {
  const base = params.status === 'confirmed'
    ? '用户确认此 Pallas 提案，仅记录确认意图。未创建任务，未调用工具，未执行外部动作。'
    : params.status === 'rejected'
      ? '用户拒绝此 Pallas 提案。未创建任务，未调用工具。'
      : '此 Pallas 提案已标记过期。未创建任务，未调用工具。';
  const reason = params.reason?.trim();
  if (!reason) return base;
  return `${base} 原因：${reason.slice(0, 500)}`;
}
