import type { PlayStep } from '@/lib/babel-engine/types';
import {
  normalizeCalibrationAssumptionIds,
  normalizeCalibrationTargetFields,
  normalizeOutcomeAssessment,
  type PlayExecutionCalibrationRequest,
  type PlayExecutionOutcomeAssessment,
} from '@/lib/strategic-play-attribution-calibration';

export const PLAY_STEP_EXECUTION_STATUSES = ['planned', 'in_progress', 'done', 'blocked', 'invalidated'] as const;

export type PlayStepExecutionStatus = typeof PLAY_STEP_EXECUTION_STATUSES[number];
export type LegacyPlayStepStatus = 'pending' | 'completed' | 'skipped';
export type CompatiblePlayStepStatus = PlayStepExecutionStatus | LegacyPlayStepStatus;

export type PlayExecutionWarning = 'source_records_unavailable' | 'source_record_write_failed' | 'calibration_write_failed';

export interface PlayStepExecutionInput {
  status: CompatiblePlayStepStatus;
  owner?: unknown;
  assignedToUserId?: unknown;
  linkedTaskId?: unknown;
  executionOwnerSource?: unknown;
  dueDate?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  executionNote?: unknown;
  actualOutcome?: unknown;
  actualResult?: unknown;
  nextAction?: unknown;
  blockerReason?: unknown;
  outcomeAssessment?: unknown;
  calibrationNote?: unknown;
  calibrates?: PlayExecutionCalibrationRequest;
}

export interface PlayExecutionUpdateContext {
  now?: string;
}

export interface PlayExecutionEventRecord {
  org_id: string;
  account_id: string;
  source_kind: 'play_execution_event';
  source_table: 'strategic_plays';
  source_row_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  metadata: {
    schemaVersion: 1;
    playExecutionEvent: PlayExecutionEvent;
    scopeNote: string;
  };
}

export interface PlayExecutionSourceRecordLike {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  title?: string | null;
  summary?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PlayExecutionEvent {
  id: string;
  sourceRecordId?: string;
  orgId: string;
  accountId: string;
  playId: string;
  opportunityId?: string;
  goalDescription?: string;
  stepIndex: number;
  stepTitle?: string;
  status: PlayStepExecutionStatus;
  owner?: string;
  assignedToUserId?: string;
  linkedTaskId?: string;
  dueDate?: string;
  executionNote?: string;
  actualOutcome?: string;
  nextAction?: string;
  blockerReason?: string;
  outcomeAssessment: PlayExecutionOutcomeAssessment;
  calibrationNote?: string;
  targetFields: string[];
  assumptionIds: string[];
  occurredAt: string;
  createdBy?: string;
}

const STATUS_SET = new Set<string>(PLAY_STEP_EXECUTION_STATUSES);
const KEY_STATUSES = new Set<PlayStepExecutionStatus>(['done', 'blocked', 'invalidated']);
const MAX_TEXT = 3000;

export const PLAY_EXECUTION_STATUS_LABEL: Record<PlayStepExecutionStatus, string> = {
  planned: '计划中',
  in_progress: '执行中',
  done: '已完成',
  blocked: '受阻',
  invalidated: '打法失效',
};

export function cleanExecutionText(value: unknown, maxLength = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
  return cleaned || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeIso(value: unknown): string | undefined {
  const text = cleanExecutionText(value, 120);
  if (!text) return undefined;
  const time = new Date(text).getTime();
  if (Number.isNaN(time)) return undefined;
  return new Date(time).toISOString();
}

export function normalizePlayStepExecutionStatus(value: unknown): PlayStepExecutionStatus {
  const text = cleanExecutionText(value, 80);
  if (text === 'pending' || text === 'skipped') return 'planned';
  if (text === 'completed') return 'done';
  if (text && STATUS_SET.has(text)) return text as PlayStepExecutionStatus;
  return 'planned';
}

export function isPlayStepDone(step: { status?: unknown }): boolean {
  return normalizePlayStepExecutionStatus(step.status) === 'done';
}

export function isPlayStepPlanned(step: { status?: unknown }): boolean {
  return normalizePlayStepExecutionStatus(step.status) === 'planned';
}

export function normalizePlayStepExecution<T extends Record<string, unknown>>(step: T): T & {
  status: PlayStepExecutionStatus;
  actualOutcome?: string;
} {
  const status = normalizePlayStepExecutionStatus(step.status);
  const actualOutcome = cleanExecutionText(step.actualOutcome) ?? cleanExecutionText(step.actualResult);
  return {
    ...step,
    status,
    ...(actualOutcome ? { actualOutcome } : {}),
  };
}

export function isKeyPlayExecutionStatus(status: unknown): boolean {
  return KEY_STATUSES.has(normalizePlayStepExecutionStatus(status));
}

export function updateStepExecution<T extends Record<string, unknown>>(
  steps: T[],
  stepIndex: number,
  input: PlayStepExecutionInput,
  context: PlayExecutionUpdateContext = {},
): { steps: Array<T & Record<string, unknown>>; step: T & Record<string, unknown>; status: PlayStepExecutionStatus } {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
    throw new Error('stepIndex 无效');
  }

  const now = normalizeIso(context.now) ?? new Date().toISOString();
  const status = normalizePlayStepExecutionStatus(input.status);
  const owner = cleanExecutionText(input.owner, 160);
  const assignedToUserId = cleanExecutionText(input.assignedToUserId, 160);
  const linkedTaskId = cleanExecutionText(input.linkedTaskId, 160);
  const executionOwnerSource = cleanExecutionText(input.executionOwnerSource, 80);
  const dueDate = normalizeIso(input.dueDate) ?? cleanExecutionText(input.dueDate, 80);
  const startedAt = normalizeIso(input.startedAt);
  const completedAt = normalizeIso(input.completedAt);
  const executionNote = cleanExecutionText(input.executionNote);
  const actualOutcome = cleanExecutionText(input.actualOutcome) ?? cleanExecutionText(input.actualResult);
  const nextAction = cleanExecutionText(input.nextAction);
  const blockerReason = cleanExecutionText(input.blockerReason);
  const outcomeAssessment = normalizeOutcomeAssessment(input.outcomeAssessment);
  const calibrationNote = cleanExecutionText(input.calibrationNote);
  const targetFields = normalizeCalibrationTargetFields({ stepIndex, fields: input.calibrates?.fields });
  const assumptionIds = normalizeCalibrationAssumptionIds(input.calibrates?.assumptionIds);

  if (status === 'blocked' && !blockerReason) {
    throw new Error('blocked 状态必须填写 blockerReason');
  }

  const current = normalizePlayStepExecution(steps[stepIndex]);
  const updated: T & Record<string, unknown> = {
    ...current,
    status,
    ...(owner ? { owner } : {}),
    ...(assignedToUserId ? { assignedToUserId } : {}),
    ...(linkedTaskId ? { linkedTaskId } : {}),
    ...(executionOwnerSource ? { executionOwnerSource } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(startedAt ? { startedAt } : status === 'in_progress' && !current.startedAt ? { startedAt: now } : {}),
    ...(completedAt ? { completedAt } : status === 'done' && !current.completedAt ? { completedAt: now } : {}),
    ...(executionNote ? { executionNote } : {}),
    ...(actualOutcome ? { actualOutcome, actualResult: actualOutcome } : {}),
    ...(nextAction ? { nextAction } : {}),
    ...(blockerReason ? { blockerReason } : {}),
    ...(outcomeAssessment !== 'unknown' ? { outcomeAssessment } : {}),
    ...(calibrationNote ? { calibrationNote } : {}),
    ...(targetFields.length > 0 ? { calibrationTargetFields: targetFields } : {}),
    ...(assumptionIds.length > 0 ? { calibrationAssumptionIds: assumptionIds } : {}),
    ...(status === 'invalidated'
      ? { executionCaveat: '该步骤执行信号显示原谋局假设或打法已失效，需要重新谋局或调整打法。' }
      : {}),
  };

  const nextSteps = [...steps] as Array<T & Record<string, unknown>>;
  nextSteps[stepIndex] = updated;
  return { steps: nextSteps, step: updated, status };
}

export function buildPlayExecutionSourceRecord(params: {
  orgId: string;
  accountId: string;
  playId: string;
  opportunityId?: string | null;
  goalDescription?: string | null;
  stepIndex: number;
  step: Partial<PlayStep> & Record<string, unknown>;
  status: PlayStepExecutionStatus;
  actorId?: string;
  occurredAt?: string;
}): PlayExecutionEventRecord {
  const occurredAt = normalizeIso(params.occurredAt) ?? new Date().toISOString();
  const title = cleanExecutionText(params.step.title, 200) ?? `Step ${params.stepIndex + 1}`;
  const label = PLAY_EXECUTION_STATUS_LABEL[params.status];
  const assignedToUserId = cleanExecutionText(params.step.assignedToUserId, 160);
  const linkedTaskId = cleanExecutionText(params.step.linkedTaskId, 160);
  const outcome = cleanExecutionText(params.step.actualOutcome) ?? cleanExecutionText(params.step.actualResult);
  const note = cleanExecutionText(params.step.executionNote);
  const blockerReason = cleanExecutionText(params.step.blockerReason);
  const nextAction = cleanExecutionText(params.step.nextAction);
  const outcomeAssessment = normalizeOutcomeAssessment(params.step.outcomeAssessment);
  const calibrationNote = cleanExecutionText(params.step.calibrationNote);
  const targetFields = normalizeCalibrationTargetFields({ stepIndex: params.stepIndex, fields: params.step.calibrationTargetFields });
  const assumptionIds = normalizeCalibrationAssumptionIds(params.step.calibrationAssumptionIds);
  const summary = params.status === 'blocked'
    ? `${label}：${blockerReason ?? note ?? title}`
    : params.status === 'invalidated'
      ? `${label}：${note ?? outcome ?? '需要重新谋局或调整打法'}`
      : `${label}：${outcome ?? note ?? title}`;

  const event: PlayExecutionEvent = {
    id: `${params.playId}:${params.stepIndex}:${params.status}:${occurredAt}`,
    orgId: params.orgId,
    accountId: params.accountId,
    playId: params.playId,
    ...(params.opportunityId ? { opportunityId: params.opportunityId } : {}),
    ...(cleanExecutionText(params.goalDescription, 500) ? { goalDescription: cleanExecutionText(params.goalDescription, 500) } : {}),
    stepIndex: params.stepIndex,
    stepTitle: title,
    status: params.status,
    ...(cleanExecutionText(params.step.owner, 160) ? { owner: cleanExecutionText(params.step.owner, 160) } : {}),
    ...(assignedToUserId ? { assignedToUserId } : {}),
    ...(linkedTaskId ? { linkedTaskId } : {}),
    ...(cleanExecutionText(params.step.dueDate, 80) ? { dueDate: cleanExecutionText(params.step.dueDate, 80) } : {}),
    ...(note ? { executionNote: note } : {}),
    ...(outcome ? { actualOutcome: outcome } : {}),
    ...(nextAction ? { nextAction } : {}),
    ...(blockerReason ? { blockerReason } : {}),
    outcomeAssessment,
    ...(calibrationNote ? { calibrationNote } : {}),
    targetFields,
    assumptionIds,
    occurredAt,
    ...(params.actorId ? { createdBy: params.actorId } : {}),
  };

  return {
    org_id: params.orgId,
    account_id: params.accountId,
    source_kind: 'play_execution_event',
    source_table: 'strategic_plays',
    source_row_id: event.id,
    title: `谋局执行 · ${label}`,
    summary,
    occurred_at: occurredAt,
    metadata: {
      schemaVersion: 1,
      playExecutionEvent: event,
      scopeNote: '谋局执行事件仅作为当前 account 的谋局实施与复盘证据，不自动泛化为全局判断规则。',
    },
  };
}

export function normalizePlayExecutionEventSourceRow(row: PlayExecutionSourceRecordLike): PlayExecutionEvent | null {
  if (row.source_kind && row.source_kind !== 'play_execution_event') return null;

  const metadata = asRecord(row.metadata);
  const raw = asRecord(metadata?.playExecutionEvent);
  if (!raw) return null;

  const rowAccountId = cleanExecutionText(row.account_id, 160);
  const rowOrgId = cleanExecutionText(row.org_id, 160);
  const rawAccountId = cleanExecutionText(raw.accountId, 160);
  const rawOrgId = cleanExecutionText(raw.orgId, 160);
  if (rowAccountId && rawAccountId && rowAccountId !== rawAccountId) return null;
  if (rowOrgId && rawOrgId && rowOrgId !== rawOrgId) return null;

  const accountId = rawAccountId ?? rowAccountId;
  const orgId = rawOrgId ?? rowOrgId;
  const playId = cleanExecutionText(raw.playId, 160) ?? cleanExecutionText(row.source_row_id, 160);
  const stepIndex = Number(raw.stepIndex);
  const status = normalizePlayStepExecutionStatus(raw.status);
  const occurredAt = normalizeIso(raw.occurredAt) ?? normalizeIso(row.occurred_at) ?? normalizeIso(row.created_at) ?? new Date(0).toISOString();
  const id = cleanExecutionText(raw.id, 300) ?? cleanExecutionText(row.id, 160) ?? `${playId}:${stepIndex}:${status}:${occurredAt}`;

  if (!id || !orgId || !accountId || !playId || !Number.isInteger(stepIndex) || stepIndex < 0) return null;

  const sourceRecordId = cleanExecutionText(row.id, 160);
  const opportunityId = cleanExecutionText(raw.opportunityId, 160);
  const goalDescription = cleanExecutionText(raw.goalDescription, 500);
  const stepTitle = cleanExecutionText(raw.stepTitle, 240);
  const owner = cleanExecutionText(raw.owner, 160);
  const assignedToUserId = cleanExecutionText(raw.assignedToUserId, 160);
  const linkedTaskId = cleanExecutionText(raw.linkedTaskId, 160);
  const dueDate = cleanExecutionText(raw.dueDate, 80);
  const executionNote = cleanExecutionText(raw.executionNote);
  const actualOutcome = cleanExecutionText(raw.actualOutcome);
  const nextAction = cleanExecutionText(raw.nextAction);
  const blockerReason = cleanExecutionText(raw.blockerReason);
  const createdBy = cleanExecutionText(raw.createdBy, 160);
  const outcomeAssessment = normalizeOutcomeAssessment(raw.outcomeAssessment);
  const calibrationNote = cleanExecutionText(raw.calibrationNote);
  const targetFields = normalizeCalibrationTargetFields({ stepIndex, fields: raw.targetFields });
  const assumptionIds = normalizeCalibrationAssumptionIds(raw.assumptionIds);

  return {
    id,
    ...(sourceRecordId ? { sourceRecordId } : {}),
    orgId,
    accountId,
    playId,
    ...(opportunityId ? { opportunityId } : {}),
    ...(goalDescription ? { goalDescription } : {}),
    stepIndex,
    ...(stepTitle ? { stepTitle } : {}),
    status,
    ...(owner ? { owner } : {}),
    ...(assignedToUserId ? { assignedToUserId } : {}),
    ...(linkedTaskId ? { linkedTaskId } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(executionNote ? { executionNote } : {}),
    ...(actualOutcome ? { actualOutcome } : {}),
    ...(nextAction ? { nextAction } : {}),
    ...(blockerReason ? { blockerReason } : {}),
    outcomeAssessment,
    ...(calibrationNote ? { calibrationNote } : {}),
    targetFields,
    assumptionIds,
    occurredAt,
    ...(createdBy ? { createdBy } : {}),
  };
}
