import type { AccountMemoryConflict, AccountTimelineItem, EvidenceSourceKind, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import { buildAccountVerificationSignals } from './contradiction-signals';
import type { JudgmentMemorySourceKind } from './memory';
import { JUDGMENT_MEMORY_SOURCE_LABELS, type JudgmentMemorySourceItem } from './memory-sources';

export type AccountTimelineInterpretationSourceType =
  | 'timeline_event'
  | 'judgment_memory'
  | 'conflict';

export interface AccountTimelineInterpretationItem {
  id: string;
  sourceType: AccountTimelineInterpretationSourceType;
  sourceId: string;
  sourceKind: EvidenceSourceKind | JudgmentMemorySourceKind | 'conflict';
  sourceLabel: string;
  title: string;
  occurredAt: string;
  interpretationSummary: string;
  judgmentImpact: string;
  riskImpact: string;
  nextAction: string;
  hasConflictSignal: boolean;
  hasUncertaintySignal: boolean;
  evidenceRefs: JudgmentEvidenceRef[];
  confidence?: number | null;
  provisional?: boolean;
}

const TIMELINE_SOURCE_LABELS: Record<EvidenceSourceKind, string> = {
  intel_item: '情报',
  email_decode: '邮件解读',
  integration_email: '邮件',
  meeting_prep: '会议准备',
  activity_log: '活动记录',
  strategic_play: '谋局',
  source_record: '原始记录',
};

const SIGNAL_LABEL: Record<AccountTimelineItem['signal'], string> = {
  positive: '增强正向判断',
  neutral: '补充背景判断',
  risk: '增强风险判断',
};

function compactText(value: string | null | undefined, fallback: string) {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? value : new Date(0).toISOString();
}

function normalizeConfidence(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function sourceFromTimeline(item: AccountTimelineItem): JudgmentEvidenceRef {
  return {
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    title: item.title,
    sourceRowId: item.sourceId,
  };
}

function sourceFromJudgmentMemory(item: JudgmentMemorySourceItem): JudgmentEvidenceRef {
  return {
    sourceId: item.sourceRecordId,
    sourceKind: 'source_record',
    title: item.title,
    sourceTable: item.sourceTable,
    sourceRowId: item.sourceRowId ?? item.sourceRecordId,
  };
}

function fallbackSourceRef(sourceId: string): JudgmentEvidenceRef {
  return { sourceId, sourceKind: 'source_record', sourceRowId: sourceId };
}

function dedupeEvidenceRefs(refs: JudgmentEvidenceRef[]): JudgmentEvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.sourceKind}:${ref.sourceRowId ?? ref.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSourceIndex(params: {
  timelineItems: AccountTimelineItem[];
  judgmentMemories: JudgmentMemorySourceItem[];
}) {
  const index = new Map<string, JudgmentEvidenceRef>();

  for (const item of params.timelineItems) {
    const ref = sourceFromTimeline(item);
    index.set(item.sourceId, ref);
    index.set(ref.sourceRowId ?? item.sourceId, ref);
  }

  for (const item of params.judgmentMemories) {
    const memoryRef = sourceFromJudgmentMemory(item);
    index.set(item.sourceRecordId, memoryRef);
    index.set(item.sourceId, memoryRef);
    if (item.sourceRowId) index.set(item.sourceRowId, memoryRef);
    for (const ref of item.evidenceRefs) {
      index.set(ref.sourceId, ref);
      if (ref.sourceRowId) index.set(ref.sourceRowId, ref);
    }
  }

  return index;
}

function toTimelineInterpretationItem(item: AccountTimelineItem, flags: { hasConflictSignal: boolean }): AccountTimelineInterpretationItem {
  const interpretationSummary = compactText(
    item.summary,
    `${item.title} 已进入账户记录，需要结合当前判断复核。`,
  );

  return {
    id: `timeline:${item.id}`,
    sourceType: 'timeline_event',
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    sourceLabel: TIMELINE_SOURCE_LABELS[item.sourceKind] ?? '记录',
    title: compactText(item.title, '未命名事件'),
    occurredAt: normalizeDate(item.occurredAt),
    interpretationSummary,
    judgmentImpact: `${SIGNAL_LABEL[item.signal]}：${interpretationSummary}`,
    riskImpact: item.signal === 'risk' ? interpretationSummary : '暂未形成新的显著风险，但会影响后续判断权重。',
    nextAction: item.signal === 'risk'
      ? '确认该风险是否仍然有效，并明确责任人、影响范围和缓解动作。'
      : '继续观察后续信号；若同类事件重复出现，再更新账户判断。',
    hasConflictSignal: flags.hasConflictSignal,
    hasUncertaintySignal: false,
    evidenceRefs: [sourceFromTimeline(item)],
  };
}

function toJudgmentMemoryInterpretationItem(
  item: JudgmentMemorySourceItem,
  flags: { hasUncertaintySignal: boolean },
): AccountTimelineInterpretationItem {
  const currentJudgment = compactText(item.currentJudgment, `${item.title} 更新了账户判断。`);
  const risk = compactText(item.risk, '暂无明确新增风险。');
  const nextAction = compactText(item.nextAction, '继续补充证据并复核下一步动作。');

  return {
    id: `judgment:${item.id}`,
    sourceType: 'judgment_memory',
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    sourceLabel: JUDGMENT_MEMORY_SOURCE_LABELS[item.sourceKind] ?? '判断来源',
    title: compactText(item.title, '判断更新'),
    occurredAt: normalizeDate(item.updatedAt),
    interpretationSummary: currentJudgment,
    judgmentImpact: currentJudgment,
    riskImpact: risk,
    nextAction,
    hasConflictSignal: false,
    hasUncertaintySignal: flags.hasUncertaintySignal,
    evidenceRefs: dedupeEvidenceRefs([sourceFromJudgmentMemory(item), ...item.evidenceRefs]),
    confidence: normalizeConfidence(item.confidence),
    provisional: item.provisional,
  };
}

function toConflictInterpretationItem(
  conflict: AccountMemoryConflict,
  sourceIndex: Map<string, JudgmentEvidenceRef>,
): AccountTimelineInterpretationItem {
  const summary = compactText(conflict.summary, '账户出现需要复核的矛盾信号。');
  const isOpen = conflict.status === 'open';

  return {
    id: `conflict:${conflict.id}`,
    sourceType: 'conflict',
    sourceId: conflict.id,
    sourceKind: 'conflict',
    sourceLabel: isOpen ? '待验证矛盾' : '已解决矛盾',
    title: isOpen ? '发现矛盾信号' : '矛盾已标记解决',
    occurredAt: normalizeDate(conflict.detectedAt),
    interpretationSummary: summary,
    judgmentImpact: isOpen
      ? '现有判断出现相互冲突的来源，不能只按单一正向或风险信号推进。'
      : '该矛盾已解决，后续判断可降低这条冲突的权重。',
    riskImpact: isOpen ? summary : '该矛盾已标记解决，暂不作为当前主要风险。',
    nextAction: isOpen
      ? '优先核对相关来源，确认矛盾是否影响下一步推进节奏。'
      : '保留来源记录，若后续出现同类反向信号再重新打开判断。',
    hasConflictSignal: isOpen,
    hasUncertaintySignal: false,
    evidenceRefs: dedupeEvidenceRefs(conflict.sourceIds.map((sourceId) => sourceIndex.get(sourceId) ?? fallbackSourceRef(sourceId))),
  };
}

export function buildAccountTimelineInterpretationItems({
  timelineItems,
  judgmentMemories,
  conflicts,
  limit = 5,
}: {
  timelineItems: AccountTimelineItem[];
  judgmentMemories: JudgmentMemorySourceItem[];
  conflicts: AccountMemoryConflict[];
  limit?: number;
}): AccountTimelineInterpretationItem[] {
  const safeLimit = Math.max(0, limit);
  if (safeLimit === 0) return [];

  const verificationSignals = buildAccountVerificationSignals({
    timelineItems,
    judgmentMemories,
    conflicts,
    limit: Math.max(timelineItems.length + judgmentMemories.length + conflicts.length, 20),
  });
  const conflictSourceIds = new Set(
    verificationSignals
      .filter((signal) => signal.kind === 'conflict')
      .flatMap((signal) => signal.sourceRefs.map((ref) => ref.sourceRowId ?? ref.sourceId)),
  );
  const uncertainJudgmentIds = new Set(
    verificationSignals
      .filter((signal) => signal.kind === 'judgment_uncertainty')
      .map((signal) => signal.id.replace(/^judgment:/, '')),
  );
  const sourceIndex = buildSourceIndex({ timelineItems, judgmentMemories });

  return [
    ...timelineItems.map((item) => toTimelineInterpretationItem(item, {
      hasConflictSignal: conflictSourceIds.has(item.sourceId),
    })),
    ...judgmentMemories.map((item) => toJudgmentMemoryInterpretationItem(item, {
      hasUncertaintySignal: uncertainJudgmentIds.has(item.id),
    })),
    ...conflicts.map((conflict) => toConflictInterpretationItem(conflict, sourceIndex)),
  ]
    .sort((a, b) => {
      const timeDelta = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, safeLimit);
}
