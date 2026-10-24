import type { AccountMemoryConflict, AccountTimelineItem, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentMemorySourceItem } from './memory-sources';

export type VerificationSignalKind = 'conflict' | 'judgment_uncertainty' | 'risk_signal';
export type VerificationSignalSeverity = 'high' | 'medium' | 'low';

export interface AccountVerificationSignal {
  id: string;
  kind: VerificationSignalKind;
  typeLabel: string;
  severity: VerificationSignalSeverity;
  summary: string;
  sourceRefs: JudgmentEvidenceRef[];
  suggestedAction: string;
  detectedAt?: string;
  conflictId?: string;
}

const CONFLICT_KIND_LABEL: Record<string, string> = {
  budget_contradiction: '预算矛盾',
  stance_contradiction: '立场分歧',
  person_stance_flip: '干系人翻转',
  temporal_reversal: '信号反转',
  engagement_gap: '参与断崖',
  cross_source_disagreement: '来源分歧',
  competitor_displacement: '竞品冲击',
};

const CONFLICT_ACTION: Record<string, string> = {
  budget_contradiction: '向经济买家或采购确认预算状态、审批口径和是否存在冻结/压价。',
  stance_contradiction: '分别确认支持方与保留方的真实诉求，找出谁能做最终裁决。',
  person_stance_flip: '回访该干系人，确认立场变化原因以及是否有新的内部压力。',
  temporal_reversal: '复盘最近两周正向信号后出现的风险事件，确认是否存在隐藏阻力。',
  engagement_gap: '用低摩擦触达恢复联系，并确认沉默是否代表优先级下降。',
  cross_source_disagreement: '对齐不同来源的时间点和语境，优先获取一手确认。',
  competitor_displacement: '确认竞品/替代方案的评估标准，补强差异化与商业边界。',
};

const SEVERITY_RANK: Record<VerificationSignalSeverity, number> = { high: 3, medium: 2, low: 1 };
const KIND_RANK: Record<VerificationSignalKind, number> = { conflict: 3, risk_signal: 2, judgment_uncertainty: 1 };

function normalizeSeverity(value: AccountMemoryConflict['severity'] | undefined): VerificationSignalSeverity {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function normalizeConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence));
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

function dedupeSourceRefs(refs: JudgmentEvidenceRef[]): JudgmentEvidenceRef[] {
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

function fallbackSourceRef(sourceId: string): JudgmentEvidenceRef {
  return { sourceId, sourceKind: 'source_record', sourceRowId: sourceId };
}

function toConflictSignal(conflict: AccountMemoryConflict, sourceIndex: Map<string, JudgmentEvidenceRef>): AccountVerificationSignal | null {
  if (conflict.status !== 'open') return null;
  const sourceRefs = dedupeSourceRefs(conflict.sourceIds.map((sourceId) => sourceIndex.get(sourceId) ?? fallbackSourceRef(sourceId)));
  const typeLabel = conflict.kind ? CONFLICT_KIND_LABEL[conflict.kind] ?? conflict.kind : '矛盾信号';
  return {
    id: `conflict:${conflict.id}`,
    kind: 'conflict',
    typeLabel,
    severity: normalizeSeverity(conflict.severity),
    summary: conflict.summary,
    sourceRefs,
    suggestedAction: conflict.kind ? CONFLICT_ACTION[conflict.kind] ?? '人工复核相关来源，确认该矛盾是否影响下一步推进。' : '人工复核相关来源，确认该矛盾是否影响下一步推进。',
    detectedAt: conflict.detectedAt,
    conflictId: conflict.id,
  };
}

function toJudgmentUncertaintySignal(item: JudgmentMemorySourceItem): AccountVerificationSignal | null {
  const confidence = normalizeConfidence(item.confidence);
  const hasUncertainty = Boolean(item.uncertainty?.trim());
  if (!hasUncertainty && !item.provisional && (confidence === null || confidence >= 0.7)) return null;

  const severity: VerificationSignalSeverity = confidence !== null && confidence < 0.45 ? 'medium' : 'low';
  return {
    id: `judgment:${item.id}`,
    kind: 'judgment_uncertainty',
    typeLabel: '判断待验证',
    severity,
    summary: item.uncertainty?.trim() || `${item.title} 仍是暂定判断，需要用新证据复核。`,
    sourceRefs: dedupeSourceRefs([sourceFromJudgmentMemory(item), ...item.evidenceRefs]).slice(0, 4),
    suggestedAction: '补齐缺失信息后重新生成或更新该判断，尤其确认反向证据是否存在。',
    detectedAt: item.updatedAt,
  };
}

function toRiskSignal(item: AccountTimelineItem, sourceIdsInConflicts: Set<string>): AccountVerificationSignal | null {
  if (item.signal !== 'risk') return null;
  if (sourceIdsInConflicts.has(item.sourceId)) return null;
  return {
    id: `risk:${item.id}`,
    kind: 'risk_signal',
    typeLabel: '风险信号',
    severity: 'medium',
    summary: item.summary,
    sourceRefs: [sourceFromTimeline(item)],
    suggestedAction: '确认该风险是否仍然有效；如果有效，明确责任人、影响范围和缓解动作。',
    detectedAt: item.occurredAt,
  };
}

export function buildAccountVerificationSignals({
  conflicts,
  judgmentMemories,
  timelineItems,
  limit = 5,
}: {
  conflicts: AccountMemoryConflict[];
  judgmentMemories: JudgmentMemorySourceItem[];
  timelineItems: AccountTimelineItem[];
  limit?: number;
}): AccountVerificationSignal[] {
  const sourceIndex = buildSourceIndex({ timelineItems, judgmentMemories });
  const sourceIdsInConflicts = new Set(conflicts.flatMap((conflict) => conflict.status === 'open' ? conflict.sourceIds : []));

  const signals = [
    ...conflicts.map((conflict) => toConflictSignal(conflict, sourceIndex)),
    ...timelineItems.map((item) => toRiskSignal(item, sourceIdsInConflicts)),
    ...judgmentMemories.map(toJudgmentUncertaintySignal),
  ].filter((signal): signal is AccountVerificationSignal => Boolean(signal));

  return signals
    .sort((a, b) => {
      const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (severityDelta !== 0) return severityDelta;
      const kindDelta = KIND_RANK[b.kind] - KIND_RANK[a.kind];
      if (kindDelta !== 0) return kindDelta;
      return +new Date(b.detectedAt ?? 0) - +new Date(a.detectedAt ?? 0);
    })
    .slice(0, Math.max(0, limit));
}
