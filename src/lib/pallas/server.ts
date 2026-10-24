import {
  ApiError,
  requireAccountAccess,
  requireAdmin,
  requireContactAccess,
  requireOpportunityAccess,
  requireOwnership,
} from '@/lib/api-guard';
import { createHash } from 'node:crypto';
import type { UserContext } from '@/lib/permissions';
import type {
  PallasActionProposal,
  PallasArtifact,
  PallasArtifactKind,
  PallasEntityContext,
  PallasJson,
  PallasToolRun,
  PallasProposalStatus,
  PallasProposedAction,
  PallasSourceRef,
} from './types';
import { classifyPallasRisk } from './proposals';

type PallasContextColumns = {
  entity_type: PallasEntityContext['entityType'];
  entity_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  opportunity_id: string | null;
  strategic_play_id: string | null;
};

const PALLAS_REUSE_UNIQUE_INDEX = 'pallas_action_proposals_active_reuse_key_uidx';
const PALLAS_AUTO_EXPIRED_RESULT_SUMMARY = '此 Pallas 提案已因超过确认有效期自动标记过期。未创建任务，未调用工具。';
const PALLAS_CREATE_TASK_SOURCE_PREFIX = 'pallas_proposal:';

export type PallasCreatedTaskResult = {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  accountId: string | null;
  opportunityId: string | null;
  contactId: string | null;
};

export type PallasCreateTaskExecutionResult = {
  proposal: PallasActionProposal;
  toolRun: PallasToolRun | null;
  task: PallasCreatedTaskResult;
  reused: boolean;
};

export class PallasActionProposalReuseConflictError extends Error {
  constructor(message = 'Pallas Action Proposal reuse key already exists') {
    super(message);
    this.name = 'PallasActionProposalReuseConflictError';
  }
}

function errorValue(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;
}

function isPallasActionProposalReuseConflict(error: unknown): boolean {
  const code = errorValue(error, 'code');
  const message = String(errorValue(error, 'message') ?? errorValue(error, 'details') ?? '');
  return code === '23505' && message.includes(PALLAS_REUSE_UNIQUE_INDEX);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function actionReuseKey(action: PallasProposedAction): string {
  if (action.toolName === 'create_task') {
    const args = (action.args ?? {}) as Record<string, unknown>;
    return stableJson({
      toolName: action.toolName,
      accountId: args.accountId ?? null,
      strategicPlayId: args.strategicPlayId ?? null,
      strategicPlayStepIndex: args.strategicPlayStepIndex ?? null,
    });
  }

  return stableJson({
    toolName: action.toolName,
    args: action.args ?? null,
  });
}

function actionReuseSignature(actions: PallasProposedAction[]): string {
  return actions.map(actionReuseKey).sort().join('\n');
}

export function buildPallasActionProposalReuseKey(params: {
  conversationId: string;
  context: PallasEntityContext;
  actions: PallasProposedAction[];
}): string {
  const columns = pallasContextColumns(params.context);
  const digest = createHash('sha256')
    .update(stableJson({
      conversationId: params.conversationId,
      entityType: columns.entity_type,
      entityId: columns.entity_id,
      accountId: columns.account_id,
      contactId: columns.contact_id,
      opportunityId: columns.opportunity_id,
      strategicPlayId: columns.strategic_play_id,
      actionSignature: actionReuseSignature(params.actions),
    }))
    .digest('hex');

  return `pallas-action-proposal:v1:${digest}`;
}

function isProposalUnexpired(proposal: PallasActionProposal, now: Date): boolean {
  if (proposal.status !== 'awaiting_confirmation') return false;
  if (!proposal.expiresAt) return true;

  const expiresAt = new Date(proposal.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();
}

export function isReusablePallasActionProposalCandidate(params: {
  proposal: PallasActionProposal;
  ctx: Pick<UserContext, 'orgId'>;
  conversationId: string;
  context: PallasEntityContext;
  actions: PallasProposedAction[];
  reuseKey?: string | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const proposal = params.proposal;
  if (proposal.orgId !== params.ctx.orgId) return false;
  if (proposal.conversationId !== params.conversationId) return false;
  if (!isProposalUnexpired(proposal, now)) return false;

  const requestedColumns = pallasContextColumns(params.context);
  const proposalColumns = pallasContextColumns(proposal.context);
  if (proposalColumns.account_id !== requestedColumns.account_id) return false;
  if (proposalColumns.strategic_play_id !== requestedColumns.strategic_play_id) return false;

  if (proposal.reuseKey && params.reuseKey) return proposal.reuseKey === params.reuseKey;
  return actionReuseSignature(proposal.actions) === actionReuseSignature(params.actions);
}

export async function assertPallasContextAccess(ctx: UserContext, context: PallasEntityContext): Promise<void> {
  if (context.accountId) await requireAccountAccess(ctx, context.accountId);
  if (context.contactId) await requireContactAccess(ctx, context.contactId);
  if (context.opportunityId) await requireOpportunityAccess(ctx, context.opportunityId);

  if (!context.accountId && context.entityType === 'account' && context.entityId) {
    await requireAccountAccess(ctx, context.entityId);
  }
  if (!context.contactId && context.entityType === 'contact' && context.entityId) {
    await requireContactAccess(ctx, context.entityId);
  }
  if (!context.opportunityId && context.entityType === 'opportunity' && context.entityId) {
    await requireOpportunityAccess(ctx, context.entityId);
  }

  const strategicPlayId = context.strategicPlayId ?? (context.entityType === 'strategic_play' ? context.entityId : null);
  if (strategicPlayId) {
    const admin = requireAdmin();
    const { data: play, error } = await admin
      .from('strategic_plays')
      .select('id, account_id, opportunity_id')
      .eq('id', strategicPlayId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (error) throw new Error(`读取 Pallas 谋局上下文失败：${error.message}`);
    if (!play) throw new ApiError(404, '谋局不存在');

    const playRow = play as { account_id: string | null; opportunity_id: string | null };
    if (context.accountId && playRow.account_id && context.accountId !== playRow.account_id) {
      throw new ApiError(400, 'Pallas context 与谋局客户不匹配');
    }
    if (context.opportunityId && playRow.opportunity_id && context.opportunityId !== playRow.opportunity_id) {
      throw new ApiError(400, 'Pallas context 与谋局商机不匹配');
    }
    if (playRow.account_id && !context.accountId) await requireAccountAccess(ctx, playRow.account_id);
  }

  if (context.entityType === 'task' && context.entityId) {
    const admin = requireAdmin();
    const { data: task, error } = await admin
      .from('tasks')
      .select('id, account_id, contact_id, opportunity_id, user_id, assigned_to')
      .eq('id', context.entityId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (error) throw new Error(`读取 Pallas 任务上下文失败：${error.message}`);
    if (!task) throw new ApiError(404, '任务不存在');

    const taskRow = task as {
      account_id: string | null;
      contact_id: string | null;
      opportunity_id: string | null;
      user_id: string | null;
      assigned_to: string | null;
    };
    if (taskRow.account_id && !context.accountId) {
      await requireAccountAccess(ctx, taskRow.account_id);
      return;
    }
    if (taskRow.contact_id && !context.contactId) {
      await requireContactAccess(ctx, taskRow.contact_id);
      return;
    }
    if (taskRow.opportunity_id && !context.opportunityId) {
      await requireOpportunityAccess(ctx, taskRow.opportunity_id);
      return;
    }

    const ownerId = taskRow.assigned_to ?? taskRow.user_id;
    if (ownerId) requireOwnership(ctx, ownerId);
  }
}

export function pallasContextColumns(context: PallasEntityContext): PallasContextColumns {
  return {
    entity_type: context.entityType,
    entity_id: context.entityId,
    account_id: context.accountId ?? (context.entityType === 'account' ? context.entityId : null),
    contact_id: context.contactId ?? (context.entityType === 'contact' ? context.entityId : null),
    opportunity_id: context.opportunityId ?? (context.entityType === 'opportunity' ? context.entityId : null),
    strategic_play_id: context.strategicPlayId ?? (context.entityType === 'strategic_play' ? context.entityId : null),
  };
}

function normalizeArtifact(row: Record<string, unknown>): PallasArtifact {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    userId: String(row.user_id),
    kind: row.kind as PallasArtifactKind,
    title: String(row.title),
    context: {
      entityType: row.entity_type as PallasEntityContext['entityType'],
      entityId: row.entity_id ? String(row.entity_id) : null,
      accountId: row.account_id ? String(row.account_id) : null,
      contactId: row.contact_id ? String(row.contact_id) : null,
      opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
      strategicPlayId: row.strategic_play_id ? String(row.strategic_play_id) : null,
    },
    data: row.data as PallasJson,
    sourceRefs: (row.source_refs as PallasSourceRef[] | null) ?? [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeProposal(row: Record<string, unknown>): PallasActionProposal {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    userId: String(row.user_id),
    artifactId: row.artifact_id ? String(row.artifact_id) : null,
    conversationId: String(row.conversation_id),
    reuseKey: row.reuse_key ? String(row.reuse_key) : null,
    context: {
      entityType: row.entity_type as PallasEntityContext['entityType'],
      entityId: row.entity_id ? String(row.entity_id) : null,
      accountId: row.account_id ? String(row.account_id) : null,
      contactId: row.contact_id ? String(row.contact_id) : null,
      opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
      strategicPlayId: row.strategic_play_id ? String(row.strategic_play_id) : null,
    },
    status: row.status as PallasActionProposal['status'],
    riskLevel: row.risk_level as PallasActionProposal['riskLevel'],
    actions: (row.actions as PallasProposedAction[] | null) ?? [],
    sourceRefs: (row.source_refs as PallasSourceRef[] | null) ?? [],
    createdAt: String(row.created_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : null,
    resultSummary: row.result_summary ? String(row.result_summary) : null,
  };
}

function normalizeToolRun(row: Record<string, unknown>): PallasToolRun {
  return {
    id: String(row.id),
    proposalId: String(row.proposal_id),
    toolName: row.tool_name as PallasToolRun['toolName'],
    status: row.status as PallasToolRun['status'],
    input: row.input as PallasJson,
    result: row.result as PallasJson | undefined,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  };
}

export async function createPallasArtifact(params: {
  ctx: UserContext;
  kind: PallasArtifactKind;
  title: string;
  context: PallasEntityContext;
  data: PallasJson;
  sourceRefs?: PallasSourceRef[];
}): Promise<PallasArtifact> {
  await assertPallasContextAccess(params.ctx, params.context);

  const admin = requireAdmin();
  const { data, error } = await admin
    .from('pallas_artifacts')
    .insert({
      org_id: params.ctx.orgId,
      user_id: params.ctx.userId,
      kind: params.kind,
      title: params.title,
      ...pallasContextColumns(params.context),
      data: params.data,
      source_refs: params.sourceRefs ?? [],
    })
    .select('*')
    .single();

  if (error) throw new Error(`创建 Pallas Artifact 失败：${error.message}`);
  return normalizeArtifact(data as Record<string, unknown>);
}

export async function createPallasActionProposal(params: {
  ctx: UserContext;
  artifactId?: string | null;
  conversationId: string;
  context: PallasEntityContext;
  actions: PallasProposedAction[];
  sourceRefs?: PallasSourceRef[];
  expiresAt?: string | null;
  reuseKey?: string | null;
}): Promise<PallasActionProposal> {
  await assertPallasContextAccess(params.ctx, params.context);

  const admin = requireAdmin();

  if (params.reuseKey) {
    const { error: expireError } = await admin
      .from('pallas_action_proposals')
      .update({
        status: 'expired',
        result_summary: PALLAS_AUTO_EXPIRED_RESULT_SUMMARY,
      })
      .eq('org_id', params.ctx.orgId)
      .eq('reuse_key', params.reuseKey)
      .eq('status', 'awaiting_confirmation')
      .lte('expires_at', new Date().toISOString());

    if (expireError) {
      throw new Error(`自动过期旧 Pallas Action Proposal 失败：${expireError.message}`);
    }
  }

  const { data, error } = await admin
    .from('pallas_action_proposals')
    .insert({
      org_id: params.ctx.orgId,
      user_id: params.ctx.userId,
      artifact_id: params.artifactId ?? null,
      conversation_id: params.conversationId,
      reuse_key: params.reuseKey ?? null,
      ...pallasContextColumns(params.context),
      status: 'awaiting_confirmation',
      risk_level: classifyPallasRisk(params.actions),
      actions: params.actions,
      source_refs: params.sourceRefs ?? [],
      expires_at: params.expiresAt ?? null,
    })
    .select('*')
    .single();

  if (error) {
    if (isPallasActionProposalReuseConflict(error)) {
      throw new PallasActionProposalReuseConflictError();
    }
    throw new Error(`创建 Pallas Action Proposal 失败：${error.message}`);
  }
  return normalizeProposal(data as Record<string, unknown>);
}

export async function findReusablePallasActionProposal(params: {
  ctx: UserContext;
  conversationId: string;
  context: PallasEntityContext;
  actions: PallasProposedAction[];
  reuseKey?: string | null;
  now?: Date;
}): Promise<PallasActionProposal | null> {
  await assertPallasContextAccess(params.ctx, params.context);

  const columns = pallasContextColumns(params.context);
  const admin = requireAdmin();
  let query = admin
    .from('pallas_action_proposals')
    .select('*')
    .eq('org_id', params.ctx.orgId)
    .eq('conversation_id', params.conversationId)
    .eq('status', 'awaiting_confirmation')
    .order('created_at', { ascending: false })
    .limit(20);

  if (columns.account_id) query = query.eq('account_id', columns.account_id);
  if (columns.strategic_play_id) query = query.eq('strategic_play_id', columns.strategic_play_id);
  if (params.reuseKey) query = query.eq('reuse_key', params.reuseKey);

  const { data, error } = await query;
  if (error) throw new Error(`读取可复用 Pallas Action Proposal 失败：${error.message}`);

  const candidates = ((data ?? []) as Record<string, unknown>[]).map(normalizeProposal);
  return candidates.find((proposal) => isReusablePallasActionProposalCandidate({
    proposal,
    ctx: params.ctx,
    conversationId: params.conversationId,
    context: params.context,
    actions: params.actions,
    reuseKey: params.reuseKey,
    now: params.now,
  })) ?? null;
}

export async function updatePallasProposalStatus(params: {
  ctx: UserContext;
  proposalId: string;
  status: PallasProposalStatus;
  resultSummary?: string | null;
}): Promise<PallasActionProposal> {
  const admin = requireAdmin();
  const { data: existing, error: existingError } = await admin
    .from('pallas_action_proposals')
    .select('*')
    .eq('id', params.proposalId)
    .eq('org_id', params.ctx.orgId)
    .maybeSingle();

  if (existingError) throw new Error(`读取 Pallas Action Proposal 失败：${existingError.message}`);
  if (!existing) throw new ApiError(404, 'Pallas Action Proposal 不存在');

  const existingProposal = normalizeProposal(existing as Record<string, unknown>);
  await assertPallasContextAccess(params.ctx, existingProposal.context);

  const patch: Record<string, unknown> = {
    status: params.status,
    result_summary: params.resultSummary ?? null,
  };

  if (params.status === 'confirmed') {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by = params.ctx.userId;
  }

  const { data, error } = await admin
    .from('pallas_action_proposals')
    .update(patch)
    .eq('id', params.proposalId)
    .eq('org_id', params.ctx.orgId)
    .select('*')
    .single();

  if (error) throw new Error(`更新 Pallas Action Proposal 失败：${error.message}`);
  return normalizeProposal(data as Record<string, unknown>);
}

export async function getPallasActionProposal(params: {
  ctx: UserContext;
  proposalId: string;
}): Promise<PallasActionProposal> {
  const admin = requireAdmin();
  const { data, error } = await admin
    .from('pallas_action_proposals')
    .select('*')
    .eq('id', params.proposalId)
    .eq('org_id', params.ctx.orgId)
    .maybeSingle();

  if (error) throw new Error(`读取 Pallas Action Proposal 失败：${error.message}`);
  if (!data) throw new ApiError(404, 'Pallas Action Proposal 不存在');

  const proposal = normalizeProposal(data as Record<string, unknown>);
  await assertPallasContextAccess(params.ctx, proposal.context);
  return proposal;
}

export async function updatePallasProposalLifecycleStatus(params: {
  ctx: UserContext;
  proposalId: string;
  status: Extract<PallasProposalStatus, 'confirmed' | 'rejected' | 'expired'>;
  resultSummary: string;
}): Promise<PallasActionProposal> {
  const existingProposal = await getPallasActionProposal({
    ctx: params.ctx,
    proposalId: params.proposalId,
  });

  if (existingProposal.status !== 'awaiting_confirmation') {
    throw new ApiError(409, '只有等待确认的 Pallas 提案可以确认、拒绝或过期');
  }

  if (params.status === 'confirmed' && existingProposal.expiresAt) {
    const expiresAt = new Date(existingProposal.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'Pallas 提案已过期，不能确认；请标记过期后重新生成');
    }
  }

  const admin = requireAdmin();
  const patch: Record<string, unknown> = {
    status: params.status,
    result_summary: params.resultSummary,
  };
  if (params.status === 'confirmed') {
    patch.confirmed_at = new Date().toISOString();
    patch.confirmed_by = params.ctx.userId;
  }

  const { data, error } = await admin
    .from('pallas_action_proposals')
    .update(patch)
    .eq('id', params.proposalId)
    .eq('org_id', params.ctx.orgId)
    .select('*')
    .single();

  if (error) throw new Error(`更新 Pallas Action Proposal 生命周期失败：${error.message}`);
  return normalizeProposal(data as Record<string, unknown>);
}

function nullableActionString(action: PallasProposedAction, key: string): string | null {
  const argValue = action.args?.[key];
  if (typeof argValue === 'string' && argValue.trim()) return argValue.trim();
  if (typeof argValue === 'number' || typeof argValue === 'boolean') return String(argValue);

  const fieldValue = action.fields.find((field) => field.field === key || field.field.toLowerCase() === key.toLowerCase())?.value;
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue.trim() : null;
}

function normalizeCreatedTask(row: Record<string, unknown>): PallasCreatedTaskResult {
  return {
    id: String(row.id),
    title: String(row.title),
    status: row.status ? String(row.status) : null,
    priority: row.priority ? String(row.priority) : null,
    dueDate: row.due_date ? String(row.due_date) : null,
    accountId: row.account_id ? String(row.account_id) : null,
    opportunityId: row.opportunity_id ? String(row.opportunity_id) : null,
    contactId: row.contact_id ? String(row.contact_id) : null,
  };
}

function proposalSourceId(proposalId: string): string {
  return `${PALLAS_CREATE_TASK_SOURCE_PREFIX}${proposalId}`;
}

function assertConfirmedProposalExecutable(proposal: PallasActionProposal): PallasProposedAction {
  if (proposal.status !== 'confirmed') {
    throw new ApiError(409, '只有已确认且未执行的 Pallas 提案可以执行');
  }

  if (proposal.expiresAt) {
    const expiresAt = new Date(proposal.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'Pallas 提案已过期，不能执行；请重新生成');
    }
  }

  if (proposal.actions.length !== 1 || proposal.actions[0]?.toolName !== 'create_task') {
    throw new ApiError(400, '此 Pallas 执行切片只允许单个 create_task 动作');
  }

  return proposal.actions[0];
}

async function buildPallasCreateTaskRow(params: {
  ctx: UserContext;
  proposal: PallasActionProposal;
  action: PallasProposedAction;
  taskId: string;
  now: string;
}): Promise<Record<string, unknown>> {
  const title = nullableActionString(params.action, 'title');
  if (!title) throw new ApiError(400, 'create_task 缺少任务标题');

  const rawPriority = nullableActionString(params.action, 'priority') ?? 'medium';
  if (!['high', 'medium', 'low'].includes(rawPriority)) {
    throw new ApiError(400, 'create_task priority 只能是 high / medium / low');
  }

  const context = params.proposal.context;
  let accountId = nullableActionString(params.action, 'accountId') ?? context.accountId ?? (context.entityType === 'account' ? context.entityId : null);
  const opportunityId = nullableActionString(params.action, 'opportunityId') ?? context.opportunityId ?? (context.entityType === 'opportunity' ? context.entityId : null);
  const contactId = nullableActionString(params.action, 'contactId') ?? context.contactId ?? (context.entityType === 'contact' ? context.entityId : null);
  const strategicPlayId = nullableActionString(params.action, 'strategicPlayId');

  if (context.accountId && accountId && context.accountId !== accountId) {
    throw new ApiError(400, 'create_task 客户与 Pallas context 不一致');
  }
  if (context.opportunityId && opportunityId && context.opportunityId !== opportunityId) {
    throw new ApiError(400, 'create_task 商机与 Pallas context 不一致');
  }
  if (context.contactId && contactId && context.contactId !== contactId) {
    throw new ApiError(400, 'create_task 联系人与 Pallas context 不一致');
  }
  if (context.strategicPlayId && strategicPlayId && context.strategicPlayId !== strategicPlayId) {
    throw new ApiError(400, 'create_task 谋局与 Pallas context 不一致');
  }

  if (accountId) await requireAccountAccess(params.ctx, accountId);
  if (opportunityId) {
    const opportunity = await requireOpportunityAccess(params.ctx, opportunityId);
    if (accountId && opportunity.account_id && opportunity.account_id !== accountId) {
      throw new ApiError(400, 'create_task 商机不属于目标客户');
    }
    accountId = accountId ?? opportunity.account_id;
  }
  if (contactId) {
    const contact = await requireContactAccess(params.ctx, contactId);
    if (accountId && contact.account_id && contact.account_id !== accountId) {
      throw new ApiError(400, 'create_task 联系人不属于目标客户');
    }
    accountId = accountId ?? contact.account_id;
  }

  const dueDate = nullableActionString(params.action, 'dueDate');
  const description = nullableActionString(params.action, 'description');

  return {
    id: params.taskId,
    org_id: params.ctx.orgId,
    user_id: params.ctx.userId,
    assigned_to: params.ctx.userId,
    account_id: accountId,
    opportunity_id: opportunityId,
    contact_id: contactId,
    title,
    description,
    status: 'todo',
    priority: rawPriority,
    due_date: dueDate,
    source: context.strategicPlayId ? 'strategic_play' : 'system',
    source_id: proposalSourceId(params.proposal.id),
    ai_generated: true,
    attachments: [],
    created_at: params.now,
    updated_at: params.now,
  };
}

async function findPallasCreatedTask(admin: ReturnType<typeof requireAdmin>, params: {
  orgId: string;
  proposalId: string;
}): Promise<PallasCreatedTaskResult | null> {
  const { data, error } = await admin
    .from('tasks')
    .select('id, title, status, priority, due_date, account_id, opportunity_id, contact_id')
    .eq('org_id', params.orgId)
    .eq('source_id', proposalSourceId(params.proposalId))
    .maybeSingle();

  if (error) throw new Error(`读取 Pallas 已创建任务失败：${error.message}`);
  return data ? normalizeCreatedTask(data as Record<string, unknown>) : null;
}

async function findLatestPallasToolRun(admin: ReturnType<typeof requireAdmin>, params: {
  orgId: string;
  proposalId: string;
}): Promise<PallasToolRun | null> {
  const { data, error } = await admin
    .from('pallas_tool_runs')
    .select('*')
    .eq('org_id', params.orgId)
    .eq('proposal_id', params.proposalId)
    .eq('tool_name', 'create_task')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`读取 Pallas Tool Run 失败：${error.message}`);
  return data ? normalizeToolRun(data as Record<string, unknown>) : null;
}

export async function executePallasConfirmedCreateTaskProposal(params: {
  ctx: UserContext;
  proposalId: string;
}): Promise<PallasCreateTaskExecutionResult> {
  const initialProposal = await getPallasActionProposal({
    ctx: params.ctx,
    proposalId: params.proposalId,
  });

  if (initialProposal.status === 'succeeded') {
    const admin = requireAdmin();
    const task = await findPallasCreatedTask(admin, {
      orgId: params.ctx.orgId,
      proposalId: initialProposal.id,
    });
    if (!task) throw new ApiError(409, 'Pallas 提案已成功，但找不到对应任务记录');
    return {
      proposal: initialProposal,
      toolRun: await findLatestPallasToolRun(admin, {
        orgId: params.ctx.orgId,
        proposalId: initialProposal.id,
      }),
      task,
      reused: true,
    };
  }

  const action = assertConfirmedProposalExecutable(initialProposal);
  const now = new Date().toISOString();
  const taskId = `pallas_task_${initialProposal.id}`;
  const taskRow = await buildPallasCreateTaskRow({
    ctx: params.ctx,
    proposal: initialProposal,
    action,
    taskId,
    now,
  });

  const admin = requireAdmin();
  const { data: claimed, error: claimError } = await admin
    .from('pallas_action_proposals')
    .update({
      status: 'executing',
      result_summary: 'Pallas 正在创建 Closr 内部任务。未调用外部工具，未触发第三方连接器。',
    })
    .eq('id', params.proposalId)
    .eq('org_id', params.ctx.orgId)
    .eq('status', 'confirmed')
    .select('*')
    .maybeSingle();

  if (claimError) throw new Error(`锁定 Pallas Action Proposal 执行权失败：${claimError.message}`);
  if (!claimed) {
    const latest = await getPallasActionProposal({ ctx: params.ctx, proposalId: params.proposalId });
    if (latest.status === 'succeeded') {
      const task = await findPallasCreatedTask(admin, { orgId: params.ctx.orgId, proposalId: latest.id });
      if (!task) throw new ApiError(409, 'Pallas 提案已成功，但找不到对应任务记录');
      return {
        proposal: latest,
        toolRun: await findLatestPallasToolRun(admin, { orgId: params.ctx.orgId, proposalId: latest.id }),
        task,
        reused: true,
      };
    }
    throw new ApiError(409, 'Pallas 提案当前状态不能执行或已被其他请求接管');
  }

  let toolRun: PallasToolRun | null = null;
  try {
    const { data: runData, error: runError } = await admin
      .from('pallas_tool_runs')
      .insert({
        org_id: params.ctx.orgId,
        proposal_id: params.proposalId,
        tool_name: 'create_task',
        status: 'running',
        input: taskRow,
        started_at: now,
      })
      .select('*')
      .single();

    if (runError) throw new Error(`记录 Pallas Tool Run 失败：${runError.message}`);
    toolRun = normalizeToolRun(runData as Record<string, unknown>);

    const existingTask = await findPallasCreatedTask(admin, {
      orgId: params.ctx.orgId,
      proposalId: params.proposalId,
    });
    const task = existingTask ?? await (async () => {
      const { data: taskData, error: taskError } = await admin
        .from('tasks')
        .insert(taskRow)
        .select('id, title, status, priority, due_date, account_id, opportunity_id, contact_id')
        .single();

      if (taskError) throw new Error(`创建 Closr 内部任务失败：${taskError.message}`);
      return normalizeCreatedTask(taskData as Record<string, unknown>);
    })();

    const finishedAt = new Date().toISOString();
    const runResult = {
      taskId: task.id,
      title: task.title,
      sourceId: proposalSourceId(params.proposalId),
    } satisfies PallasJson;
    const { data: finishedRun, error: finishRunError } = await admin
      .from('pallas_tool_runs')
      .update({
        status: 'succeeded',
        result: runResult,
        finished_at: finishedAt,
      })
      .eq('id', toolRun.id)
      .eq('org_id', params.ctx.orgId)
      .select('*')
      .single();

    if (finishRunError) throw new Error(`更新 Pallas Tool Run 成功状态失败：${finishRunError.message}`);

    const { data: finishedProposal, error: finishProposalError } = await admin
      .from('pallas_action_proposals')
      .update({
        status: 'succeeded',
        result_summary: `已创建 Closr 内部任务：${task.title}。未调用外部工具，未触发第三方连接器。`,
      })
      .eq('id', params.proposalId)
      .eq('org_id', params.ctx.orgId)
      .select('*')
      .single();

    if (finishProposalError) throw new Error(`更新 Pallas Action Proposal 成功状态失败：${finishProposalError.message}`);

    return {
      proposal: normalizeProposal(finishedProposal as Record<string, unknown>),
      toolRun: normalizeToolRun(finishedRun as Record<string, unknown>),
      task,
      reused: Boolean(existingTask),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pallas 本地任务创建失败';
    if (toolRun) {
      await admin
        .from('pallas_tool_runs')
        .update({
          status: 'failed',
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', toolRun.id)
        .eq('org_id', params.ctx.orgId);
    }
    await admin
      .from('pallas_action_proposals')
      .update({
        status: 'failed',
        result_summary: `Pallas 创建 Closr 内部任务失败：${message}`,
      })
      .eq('id', params.proposalId)
      .eq('org_id', params.ctx.orgId);
    throw error;
  }
}

export async function listPallasArtifacts(params: {
  ctx: UserContext;
  context?: PallasEntityContext;
  limit?: number;
}): Promise<PallasArtifact[]> {
  const admin = requireAdmin();
  let query = admin
    .from('pallas_artifacts')
    .select('*')
    .eq('org_id', params.ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 20);

  if (params.context) {
    await assertPallasContextAccess(params.ctx, params.context);
    const columns = pallasContextColumns(params.context);
    query = query.eq('entity_type', columns.entity_type);
    if (columns.entity_id) query = query.eq('entity_id', columns.entity_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(`读取 Pallas Artifacts 失败：${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeArtifact);
}
