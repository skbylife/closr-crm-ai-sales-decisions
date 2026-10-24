import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentFeedbackRevisionRecord } from '@/lib/judgment/feedback';
import { JUDGMENT_MEMORY_SOURCE_LABELS, type JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import { TASK_OUTCOME_LABEL, type TaskOutcomeItem } from '@/lib/judgment/task-outcome';
import type { WinLossCalibrationItem } from '@/lib/judgment/win-loss-calibration';
import { INTERVENTION_ACTION_LABEL, INTERVENTION_STATUS_LABEL, INTERVENTION_TYPE_LABEL, type JudgmentInterventionItem } from '@/lib/judgment/intervention';
import { INTERVENTION_IMPACT_LABEL, INTERVENTION_OUTCOME_LABEL, type InterventionOutcomeItem } from '@/lib/judgment/intervention-learning';
import { PLAY_EXECUTION_STATUS_LABEL, type PlayExecutionEvent } from '@/lib/strategic-play-execution';

export type JudgmentTimelineKind = 'judgment_memory' | 'feedback' | 'win_loss_calibration' | 'task_outcome' | 'intervention' | 'intervention_outcome' | 'play_execution_event';
export type JudgmentTimelineTraceStatus = 'persisted' | 'derived' | 'invalid' | 'missing';

export type JudgmentTimelineItem = {
  id: string;
  accountId: string;
  kind: JudgmentTimelineKind;
  sourceKind?: string;
  sourceId?: string;
  sourceTable?: string;
  sourceRowId?: string;
  title: string;
  summary: string;
  signal?: string;
  risk?: string;
  nextAction?: string;
  occurredAt: string;
  traceStatus?: JudgmentTimelineTraceStatus;
  evidenceRefs?: JudgmentEvidenceRef[];
  meta?: Record<string, unknown>;
};

export type BuildJudgmentTimelineParams = {
  accountId: string;
  judgmentMemories?: JudgmentMemorySourceItem[] | null;
  feedbackRevisionRecords?: JudgmentFeedbackRevisionRecord[] | null;
  winLossCalibrations?: WinLossCalibrationItem[] | null;
  taskOutcomes?: TaskOutcomeItem[] | null;
  interventions?: JudgmentInterventionItem[] | null;
  interventionOutcomes?: InterventionOutcomeItem[] | null;
  playExecutionEvents?: PlayExecutionEvent[] | null;
  limit?: number;
};

const DEFAULT_LIMIT = 20;

const FEEDBACK_KIND_LABEL: Record<string, string> = {
  accurate: '判断准确',
  inaccurate: '判断不准',
  over_optimistic: '过度乐观',
  missed_risk: '漏看风险',
  missing_evidence: '缺证据',
  over_inferred: '过度推断',
  stale: '已过期',
};

const FEEDBACK_TARGET_LABEL: Record<string, string> = {
  account_momentum: '动量',
  stakeholder: '干系人',
  open_question: '待验证问题',
  judgment: '综合判断',
  rfp: 'RFP',
  decode: 'Decode',
  strategic_play: '谋局',
  unknown: '未知目标',
};

const OUTCOME_LABEL: Record<string, string> = {
  won: '赢单',
  lost: '丢单',
  stalled: '停滞',
  unknown: '未知结果',
};

function timeValue(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(0, Math.floor(limit));
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function timelineItemFromJudgmentMemory(accountId: string, item: JudgmentMemorySourceItem): JudgmentTimelineItem {
  const label = JUDGMENT_MEMORY_SOURCE_LABELS[item.sourceKind] ?? '判断来源';
  return {
    id: `judgment_memory:${item.id}`,
    accountId,
    kind: 'judgment_memory',
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    sourceTable: item.sourceTable,
    sourceRowId: item.sourceRowId,
    title: item.title || label,
    summary: item.currentJudgment,
    signal: item.uncertainty ? `不确定性：${item.uncertainty}` : item.currentJudgment,
    risk: item.risk,
    nextAction: item.nextAction,
    occurredAt: item.updatedAt,
    traceStatus: item.traceStatus ?? 'derived',
    evidenceRefs: item.evidenceRefs,
    meta: {
      sourceLabel: label,
      confidence: item.confidence,
      provisional: item.provisional,
      traceNote: item.traceNote,
    },
  };
}

function timelineItemFromFeedback(record: JudgmentFeedbackRevisionRecord): JudgmentTimelineItem {
  const feedback = record.feedback;
  const kindLabel = FEEDBACK_KIND_LABEL[feedback.kind] ?? feedback.kind;
  const targetLabel = FEEDBACK_TARGET_LABEL[feedback.targetType] ?? feedback.targetType;
  const summary = firstNonEmpty(record.revisedPreview?.revisedSummary, feedback.content) ?? '用户反馈已记录。';
  return {
    id: `feedback:${feedback.id}`,
    accountId: feedback.accountId,
    kind: 'feedback',
    sourceKind: feedback.targetType,
    sourceId: feedback.targetId,
    sourceTable: 'judgment_feedback',
    sourceRowId: feedback.id,
    title: `用户反馈 · ${targetLabel} · ${kindLabel}`,
    summary,
    signal: feedback.content,
    occurredAt: feedback.createdAt,
    traceStatus: 'persisted',
    evidenceRefs: feedback.evidenceRefs,
    meta: {
      feedbackType: feedback.feedbackType,
      revisionStatus: record.revisionStatus,
      revisionError: record.revisionError,
      scope: feedback.scope,
      status: feedback.status,
      whyChanged: record.revisedPreview?.whyChanged,
      provisional: record.revisedPreview?.provisional,
    },
  };
}

function timelineItemFromWinLossCalibration(item: WinLossCalibrationItem): JudgmentTimelineItem {
  const outcomeLabel = OUTCOME_LABEL[item.outcome] ?? item.outcome;
  const firstLesson = firstNonEmpty(item.lessons[0], item.notes) ?? '成交/丢单结果已记录为判断校准样本。';
  return {
    id: `win_loss_calibration:${item.id}`,
    accountId: item.accountId,
    kind: 'win_loss_calibration',
    sourceKind: item.outcome,
    sourceId: item.opportunityId ?? item.id,
    sourceTable: item.opportunityId ? 'opportunities' : 'win_loss_calibration',
    sourceRowId: item.opportunityId ?? item.id,
    title: `Win/Loss calibration · ${outcomeLabel}`,
    summary: `${outcomeLabel}校准：${firstLesson}`,
    signal: firstNonEmpty(item.validatedSignals[0], item.disprovenSignals[0], item.notes),
    risk: firstNonEmpty(item.previousRisk, item.disprovenSignals[0]),
    nextAction: item.previousNextAction,
    occurredAt: item.outcomeAt,
    traceStatus: 'persisted',
    evidenceRefs: item.evidenceRefs,
    meta: {
      outcome: item.outcome,
      opportunityId: item.opportunityId,
      validatedSignals: item.validatedSignals,
      disprovenSignals: item.disprovenSignals,
      overOptimistic: item.overOptimistic,
      overConservative: item.overConservative,
      lessons: item.lessons,
      createdAt: item.createdAt,
    },
  };
}


function timelineItemFromTaskOutcome(item: TaskOutcomeItem): JudgmentTimelineItem {
  const outcomeLabel = TASK_OUTCOME_LABEL[item.outcome] ?? TASK_OUTCOME_LABEL.unknown;
  const summary = `${outcomeLabel}：${firstNonEmpty(item.reason, item.outcomeNote) ?? '用户确认了任务执行结果。'}`;
  return {
    id: `task_outcome:${item.id}`,
    accountId: item.accountId,
    kind: 'task_outcome',
    sourceKind: 'task_outcome',
    sourceId: item.id,
    sourceTable: 'source_records',
    sourceRowId: item.id,
    title: `任务执行反馈 · ${outcomeLabel}`,
    summary,
    signal: item.outcomeNote,
    risk: item.outcome === 'blocked' || item.outcome === 'delayed' ? firstNonEmpty(item.reason, item.judgmentImpact, item.outcomeNote) : undefined,
    nextAction: item.judgmentImpact,
    occurredAt: item.outcomeAt,
    traceStatus: 'persisted',
    evidenceRefs: item.evidenceRefs,
    meta: {
      outcome: item.outcome,
      taskId: item.taskId,
      opportunityId: item.opportunityId,
      contactId: item.contactId,
      previousTaskStatus: item.previousTaskStatus,
      newTaskStatus: item.newTaskStatus,
      judgmentImpact: item.judgmentImpact,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
    },
  };
}

function timelineItemFromIntervention(item: JudgmentInterventionItem): JudgmentTimelineItem {
  const typeLabel = INTERVENTION_TYPE_LABEL[item.type];
  const actionLabel = INTERVENTION_ACTION_LABEL[item.action];
  const statusLabel = INTERVENTION_STATUS_LABEL[item.status];
  return {
    id: `intervention:${item.id}`,
    accountId: item.accountId,
    kind: 'intervention',
    sourceKind: item.type,
    sourceId: item.id,
    sourceTable: 'source_records',
    sourceRowId: item.sourceRecordId ?? item.id,
    title: `${typeLabel} · ${actionLabel}`,
    summary: `${statusLabel}：${firstNonEmpty(item.outcomeNote, item.reason) ?? '介入动作已记录。'}`,
    signal: item.reason,
    nextAction: item.recommendedAction,
    occurredAt: item.createdAt,
    traceStatus: 'persisted',
    evidenceRefs: item.evidenceRefs,
    meta: {
      type: item.type,
      action: item.action,
      status: item.status,
      role: item.role,
      opportunityId: item.opportunityId,
      signalId: item.signalId,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
      sourceRecordId: item.sourceRecordId,
    },
  };
}

function timelineItemFromInterventionOutcome(item: InterventionOutcomeItem): JudgmentTimelineItem {
  const outcomeLabel = INTERVENTION_OUTCOME_LABEL[item.outcome];
  const impactLabel = INTERVENTION_IMPACT_LABEL[item.impact];
  return {
    id: `intervention_outcome:${item.id}`,
    accountId: item.accountId,
    kind: 'intervention_outcome',
    sourceKind: 'intervention_outcome',
    sourceId: item.id,
    sourceTable: 'source_records',
    sourceRowId: item.sourceRecordId,
    title: `介入结果/学习结论 · ${outcomeLabel}`,
    summary: `${outcomeLabel} · ${impactLabel}：${firstNonEmpty(item.learningSummary, item.outcomeNote) ?? '介入结果已记录为校准证据。'}`,
    signal: item.outcomeNote,
    nextAction: item.learningSummary,
    occurredAt: item.createdAt,
    traceStatus: 'persisted',
    evidenceRefs: item.evidenceRefs,
    meta: {
      interventionId: item.interventionId,
      sourceRecordId: item.sourceRecordId,
      opportunityId: item.opportunityId,
      role: item.role,
      reason: item.reason,
      outcome: item.outcome,
      impact: item.impact,
      confidence: item.confidence,
      createdBy: item.createdBy,
      createdAt: item.createdAt,
    },
  };
}

function timelineItemFromPlayExecutionEvent(item: PlayExecutionEvent): JudgmentTimelineItem {
  const statusLabel = PLAY_EXECUTION_STATUS_LABEL[item.status];
  const summary = item.status === 'blocked'
    ? `${statusLabel}：${firstNonEmpty(item.blockerReason, item.executionNote, item.stepTitle) ?? '谋局步骤受阻。'}`
    : item.status === 'invalidated'
      ? `${statusLabel}：${firstNonEmpty(item.executionNote, item.actualOutcome, item.stepTitle) ?? '谋局假设或打法需要调整。'}`
      : `${statusLabel}：${firstNonEmpty(item.actualOutcome, item.executionNote, item.stepTitle) ?? '谋局步骤已记录执行结果。'}`;

  return {
    id: `play_execution_event:${item.id}`,
    accountId: item.accountId,
    kind: 'play_execution_event',
    sourceKind: 'play_execution_event',
    sourceId: item.playId,
    sourceTable: 'strategic_plays',
    sourceRowId: item.playId,
    title: `谋局执行 · ${statusLabel}`,
    summary,
    signal: firstNonEmpty(item.actualOutcome, item.executionNote, item.blockerReason),
    risk: item.status === 'blocked' || item.status === 'invalidated' ? firstNonEmpty(item.blockerReason, item.executionNote, item.actualOutcome) : undefined,
    nextAction: item.nextAction,
    occurredAt: item.occurredAt,
    traceStatus: 'persisted',
    evidenceRefs: item.sourceRecordId ? [{ sourceKind: 'source_record', sourceId: item.sourceRecordId, sourceTable: 'source_records', sourceRowId: item.sourceRecordId, title: item.stepTitle }] : [],
    meta: {
      playId: item.playId,
      sourceRecordId: item.sourceRecordId,
      opportunityId: item.opportunityId,
      goalDescription: item.goalDescription,
      stepIndex: item.stepIndex,
      stepTitle: item.stepTitle,
      status: item.status,
      owner: item.owner,
      dueDate: item.dueDate,
      createdBy: item.createdBy,
    },
  };
}

export function buildJudgmentTimeline(params: BuildJudgmentTimelineParams): JudgmentTimelineItem[] {
  const limit = normalizeLimit(params.limit);
  if (limit === 0) return [];

  const items: JudgmentTimelineItem[] = [
    ...(params.judgmentMemories ?? []).map((item) => timelineItemFromJudgmentMemory(params.accountId, item)),
    ...(params.feedbackRevisionRecords ?? []).map(timelineItemFromFeedback),
    ...(params.winLossCalibrations ?? []).map(timelineItemFromWinLossCalibration),
    ...(params.taskOutcomes ?? []).map(timelineItemFromTaskOutcome),
    ...(params.interventions ?? []).map(timelineItemFromIntervention),
    ...(params.interventionOutcomes ?? []).map(timelineItemFromInterventionOutcome),
    ...(params.playExecutionEvents ?? []).map(timelineItemFromPlayExecutionEvent),
  ];

  if (items.length === 0) return [];

  return items
    .sort((a, b) => timeValue(b.occurredAt) - timeValue(a.occurredAt))
    .slice(0, limit);
}
