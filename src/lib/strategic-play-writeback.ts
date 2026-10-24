import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyStrategicPlayAttributionCalibration,
  buildExecutionSourceRef,
  normalizeCalibrationTargetFields,
  normalizeOutcomeAssessment,
} from '@/lib/strategic-play-attribution-calibration';
import type { EvidenceTraceRef } from '@/lib/evidence-provenance';
import type { PlayExecutionEventRecord, PlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import {
  buildPlayExecutionSourceRecord,
  isKeyPlayExecutionStatus,
  updateStepExecution,
  type CompatiblePlayStepStatus,
  type PlayExecutionWarning,
  type PlayStepExecutionInput,
} from '@/lib/strategic-play-execution';
import { calculateConfidence, calculateDaysSinceProgress, calculateMomentum } from '@/lib/play-utils';

type StrategicPlayWritebackAdminClient = SupabaseClient<any, 'public', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StrategicPlayExecutionPatchInput {
  stepStatus?: CompatiblePlayStepStatus;
  executionStatus?: CompatiblePlayStepStatus;
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
  calibrates?: {
    fields?: unknown;
    assumptionIds?: unknown;
  };
}

export interface StrategicPlayExecutionRow {
  account_id?: string | null;
  opportunity_id?: string | null;
  goal_description?: string | null;
  steps?: unknown;
  last_step_at?: string | null;
  status?: string | null;
  confidence?: unknown;
  assumptions?: unknown;
  evidence_provenance?: unknown;
}

export interface StrategicPlayExecutionWritebackResult {
  status: 'updated' | 'update_failed';
  steps: Array<Record<string, unknown>>;
  warnings: PlayExecutionWarning[];
  normalizedStatus: PlayStepExecutionStatus;
  updateError?: { message?: string } | null;
  calibration?: StrategicPlayExecutionCalibrationResponse;
  routeRevisionProposal?: StrategicPlayExecutionRouteRevisionProposal;
}

export interface StrategicPlayExecutionCalibrationResponse {
  status: 'applied' | 'skipped';
  targetFields: string[];
  sourceRef?: EvidenceTraceRef;
  calibratedAt: string;
}

export interface StrategicPlayExecutionRouteRevisionProposal {
  status: 'proposed';
  requiresHumanConfirmation: true;
  triggerKind: 'execution_outcome';
  changedMoveIds: string[];
  changedWinGapIds: string[];
  diffSummary: string;
  proposedNextMove: string;
  failureTest: string;
  createdAt: string;
  sourceRef?: EvidenceTraceRef;
}

export class StrategicPlayExecutionValidationError extends Error {
  override name = 'StrategicPlayExecutionValidationError';
}

export function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

export function buildPlayStepExecutionInput(input: StrategicPlayExecutionPatchInput): PlayStepExecutionInput {
  return {
    status: (input.executionStatus ?? input.stepStatus ?? (input.actualOutcome || input.actualResult ? 'done' : 'planned')) as CompatiblePlayStepStatus,
    owner: input.owner,
    assignedToUserId: input.assignedToUserId,
    linkedTaskId: input.linkedTaskId,
    executionOwnerSource: input.executionOwnerSource,
    dueDate: input.dueDate,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    executionNote: input.executionNote,
    actualOutcome: input.actualOutcome,
    actualResult: input.actualResult,
    nextAction: input.nextAction,
    blockerReason: input.blockerReason,
    outcomeAssessment: input.outcomeAssessment,
    calibrationNote: input.calibrationNote,
    calibrates: input.calibrates,
  };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function buildExecutionRouteRevisionProposal(params: {
  playId: string;
  stepIndex: number;
  step: Record<string, unknown>;
  normalizedStatus: PlayStepExecutionStatus;
  executionInput: PlayStepExecutionInput;
  now: string;
  sourceRef?: EvidenceTraceRef;
}): StrategicPlayExecutionRouteRevisionProposal | undefined {
  const outcomeAssessment = cleanText(params.executionInput.outcomeAssessment);
  const shouldRevise = params.normalizedStatus === 'blocked'
    || params.normalizedStatus === 'invalidated'
    || outcomeAssessment === 'missed_expected'
    || outcomeAssessment === 'blocked'
    || outcomeAssessment === 'invalidated';
  if (!shouldRevise) return undefined;

  const moveId = cleanText(params.step.id) || 'move-' + (params.stepIndex + 1);
  const moveTitle = cleanText(params.step.title) || '当前步骤';
  const blocker = cleanText(params.executionInput.blockerReason)
    || cleanText(params.step.blockerReason)
    || cleanText(params.executionInput.actualOutcome)
    || cleanText(params.executionInput.actualResult)
    || '执行反馈显示当前步骤未按预期推进';
  const proposedNextMove = cleanText(params.executionInput.nextAction)
    || cleanText(params.step.nextAction)
    || cleanText(params.step.fallback)
    || '先复核该步骤失败原因，再重新规划后续路线';
  const winGapId = 'win-gap-execution-' + params.playId + '-' + (params.stepIndex + 1);

  return {
    status: 'proposed',
    requiresHumanConfirmation: true,
    triggerKind: 'execution_outcome',
    changedMoveIds: [moveId],
    changedWinGapIds: [winGapId],
    diffSummary: '执行反馈显示「' + moveTitle + '」未按预期推进：' + blocker + '。建议改为：' + proposedNextMove + '。',
    proposedNextMove,
    failureTest: '如果不能解除「' + blocker + '」，后续路线不得继续机械推进原步骤。',
    createdAt: params.now,
    ...(params.sourceRef ? { sourceRef: params.sourceRef } : {}),
  };
}

export function buildStrategicPlayExecutionUpdatePayload(params: {
  play: StrategicPlayExecutionRow;
  steps: Array<Record<string, unknown>>;
  normalizedStatus: PlayStepExecutionStatus;
  now: string;
}): Record<string, unknown> {
  const { play, steps, normalizedStatus, now } = params;
  const updatePayload: Record<string, unknown> = {
    steps,
    updated_at: now,
  };

  if (normalizedStatus === 'done') {
    updatePayload.last_step_at = now;
    updatePayload.momentum = calculateMomentum({
      steps,
      lastStepAt: now,
      status: play.status as string,
    });
  }

  if (normalizedStatus === 'blocked') {
    updatePayload.momentum = 'blocked';
  }

  updatePayload.days_since_progress = calculateDaysSinceProgress({ steps });
  updatePayload.confidence = calculateConfidence({
    confidence: Number(play.confidence),
    steps,
    assumptions: (play.assumptions as Record<string, unknown>[]) ?? [],
    lastStepAt: (normalizedStatus === 'done' ? now : play.last_step_at) as string | undefined,
  });

  return updatePayload;
}

export async function writePlayExecutionSourceRecord(params: {
  admin: StrategicPlayWritebackAdminClient;
  orgId: string;
  userId: string;
  playId: string;
  stepIndex: number;
  play: StrategicPlayExecutionRow;
  step: Record<string, unknown>;
  normalizedStatus: PlayStepExecutionStatus;
  occurredAt: string;
}): Promise<{ warnings: PlayExecutionWarning[]; sourceRecord?: PlayExecutionEventRecord; sourceRef?: EvidenceTraceRef }> {
  const { admin, orgId, userId, playId, stepIndex, play, step, normalizedStatus, occurredAt } = params;
  if (!isKeyPlayExecutionStatus(normalizedStatus)) return { warnings: [] };

  const sourceRecord = buildPlayExecutionSourceRecord({
    orgId,
    accountId: play.account_id as string,
    playId,
    opportunityId: play.opportunity_id as string | null,
    goalDescription: play.goal_description as string | null,
    stepIndex,
    step,
    status: normalizedStatus,
    actorId: userId,
    occurredAt,
  });

  const { error: sourceRecordError } = await admin
    .from('source_records')
    .insert(sourceRecord);

  if (!sourceRecordError) {
    const sourceRef = buildExecutionSourceRef({
      sourceId: sourceRecord.source_row_id,
      sourceType: 'play_execution_event',
      sourceKind: 'source_record',
      sourceTable: 'source_records',
      sourceRowId: sourceRecord.source_row_id,
      title: sourceRecord.title,
      excerpt: sourceRecord.summary,
      occurredAt: sourceRecord.occurred_at,
      weight: 1,
    });
    return { warnings: [], sourceRecord, sourceRef };
  }

  console.warn('[strategic-play] play execution source_record skipped:', sourceRecordError.message);
  return { warnings: [isSourceRecordsUnavailable(sourceRecordError) ? 'source_records_unavailable' : 'source_record_write_failed'] };
}

export async function applyStrategicPlayStepExecutionWriteback(params: {
  admin: StrategicPlayWritebackAdminClient;
  orgId: string;
  userId: string;
  playId: string;
  stepIndex: number;
  play: StrategicPlayExecutionRow;
  executionInput: PlayStepExecutionInput;
  now: string;
}): Promise<StrategicPlayExecutionWritebackResult> {
  const { admin, orgId, userId, playId, stepIndex, play, executionInput, now } = params;
  const rawSteps = Array.isArray(play.steps) ? play.steps as Record<string, unknown>[] : [];
  let executionUpdate;
  try {
    executionUpdate = updateStepExecution(rawSteps, stepIndex, executionInput, { now });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'step execution update 无效';
    throw new StrategicPlayExecutionValidationError(message);
  }
  const steps = executionUpdate.steps;
  const normalizedStatus = executionUpdate.status;
  const updatePayload = buildStrategicPlayExecutionUpdatePayload({ play, steps, normalizedStatus, now });

  const { error } = await admin
    .from('strategic_plays')
    .update(updatePayload)
    .eq('id', playId)
    .eq('org_id', orgId)
    .eq('account_id', play.account_id);

  if (error) {
    return { status: 'update_failed', steps, warnings: [], normalizedStatus, updateError: error };
  }

  const sourceWrite = await writePlayExecutionSourceRecord({
    admin,
    orgId,
    userId,
    playId,
    stepIndex,
    play,
    step: executionUpdate.step,
    normalizedStatus,
    occurredAt: now,
  });

  const warnings = [...sourceWrite.warnings];
  const targetFields = normalizeCalibrationTargetFields({ stepIndex, fields: executionInput.calibrates?.fields });
  let calibration: StrategicPlayExecutionCalibrationResponse | undefined;

  if (isKeyPlayExecutionStatus(normalizedStatus)) {
    calibration = {
      status: 'skipped',
      targetFields,
      ...(sourceWrite.sourceRef ? { sourceRef: sourceWrite.sourceRef } : {}),
      calibratedAt: now,
    };
  }

  if (sourceWrite.sourceRef && calibration) {
    const outcomeAssessment = normalizeOutcomeAssessment(executionInput.outcomeAssessment);
    const calibrationResult = applyStrategicPlayAttributionCalibration({
      evidenceProvenance: play.evidence_provenance,
      stepIndex,
      executionStatus: normalizedStatus,
      outcomeAssessment,
      sourceRef: sourceWrite.sourceRef,
      targetFields,
      note: typeof executionInput.calibrationNote === 'string' ? executionInput.calibrationNote : undefined,
      occurredAt: now,
      createdBy: userId,
    });

    const { error: calibrationError } = await admin
      .from('strategic_plays')
      .update({ evidence_provenance: calibrationResult.provenance, updated_at: now })
      .eq('id', playId)
      .eq('org_id', orgId)
      .eq('account_id', play.account_id);

    if (calibrationError) {
      console.warn('[strategic-play] attribution calibration skipped:', calibrationError.message);
      warnings.push('calibration_write_failed');
    } else {
      calibration = {
        status: 'applied',
        targetFields: calibrationResult.targetFields,
        sourceRef: calibrationResult.sourceRef,
        calibratedAt: calibrationResult.calibratedAt,
      };
    }
  }

  const routeRevisionProposal = buildExecutionRouteRevisionProposal({
    playId,
    stepIndex,
    step: executionUpdate.step,
    normalizedStatus,
    executionInput,
    now,
    ...(sourceWrite.sourceRef ? { sourceRef: sourceWrite.sourceRef } : {}),
  });

  return {
    status: 'updated',
    steps,
    warnings,
    normalizedStatus,
    ...(calibration ? { calibration } : {}),
    ...(routeRevisionProposal ? { routeRevisionProposal } : {}),
  };
}

export function buildStrategicPlayExecutionResponse(params: {
  steps: Array<Record<string, unknown>>;
  warnings: PlayExecutionWarning[];
  judgmentMemory?: unknown;
  calibration?: StrategicPlayExecutionCalibrationResponse;
  routeRevisionProposal?: StrategicPlayExecutionRouteRevisionProposal;
}): {
  ok: true;
  steps: Array<Record<string, unknown>>;
  warnings: PlayExecutionWarning[];
  judgmentMemory?: unknown;
  calibration?: StrategicPlayExecutionCalibrationResponse;
  routeRevisionProposal?: StrategicPlayExecutionRouteRevisionProposal;
} {
  const { steps, warnings, judgmentMemory, calibration, routeRevisionProposal } = params;
  return {
    ok: true,
    steps,
    warnings,
    ...(judgmentMemory ? { judgmentMemory } : {}),
    ...(calibration ? { calibration } : {}),
    ...(routeRevisionProposal ? { routeRevisionProposal } : {}),
  };
}
