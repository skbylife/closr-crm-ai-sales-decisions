import type { PlayStep, StrategicPlay, StrategicPlayEvidenceTraceRef, StrategicPlayFieldEvidenceAttribution } from '@/lib/babel-engine/types';

export type StrategicPlayFieldKey =
  | 'situationJudgment'
  | 'strategicObjective'
  | 'stakeholderPath'
  | 'evidenceBasis'
  | 'riskCounterEvidence'
  | 'successCriteria';

export const STRATEGIC_PLAY_ATTRIBUTION_FIELDS: ReadonlyArray<{ field: StrategicPlayFieldKey; label: string }> = [
  { field: 'situationJudgment', label: '局势判断' },
  { field: 'strategicObjective', label: '战略目标' },
  { field: 'stakeholderPath', label: '关键路径' },
  { field: 'evidenceBasis', label: '证据依据' },
  { field: 'riskCounterEvidence', label: '风险/反证' },
  { field: 'successCriteria', label: '成功标准' },
] as const;

export function fieldAttributionFor(
  attributions: StrategicPlayFieldEvidenceAttribution[] | undefined,
  field: string,
): StrategicPlayFieldEvidenceAttribution | null {
  return attributions?.find((item) => item.field === field) ?? null;
}

export function expectedOutcomeAttributionFor(
  attributions: StrategicPlayFieldEvidenceAttribution[] | undefined,
  step: PlayStep,
  arrayIndex: number,
): StrategicPlayFieldEvidenceAttribution | null {
  const candidates = new Set([
    `steps[${arrayIndex}].expectedOutcome`,
    `steps[${step.index}].expectedOutcome`,
    `actionPlan[${arrayIndex}].expectedOutcome`,
    `actionPlan[${step.index}].expectedOutcome`,
  ]);
  return attributions?.find((item) => candidates.has(item.field)) ?? null;
}

function compactList(values: string[] | undefined, emptyText: string, locale: 'zh' | 'en' = 'zh'): string {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (cleaned.length === 0) return emptyText;
  const preview = cleaned.slice(0, 2).join(locale === 'en' ? '; ' : '；');
  if (cleaned.length <= 2) return preview;
  return locale === 'en' ? `${preview} and ${cleaned.length - 2} more` : `${preview} 等 ${cleaned.length} 条`;
}

export function formatStrategicPlayFieldValue(play: StrategicPlay, field: StrategicPlayFieldKey, locale: 'zh' | 'en' = 'zh'): string {
  if (field === 'evidenceBasis' || field === 'riskCounterEvidence' || field === 'stakeholderPath') {
    return compactList(play[field], locale === 'en' ? 'No structured content yet' : '暂无结构化内容', locale);
  }
  const value = play[field];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : locale === 'en' ? 'No structured content yet' : '暂无结构化内容';
}

const SOURCE_TABLE_LABELS: Record<string, string> = {
  discovery_notes: '发现记录',
  email_decodes: '邮件解读',
  account_evidence: '账户证据',
  source_records: '原始记录',
  integration_emails: '邮件',
  activity_logs: '活动记录',
  meeting_preps: '会议准备',
  intel_items: '情报',
  knowledge_items: '知识库',
  strategic_plays: '谋局',
};

const SOURCE_TABLE_LABELS_EN: Record<string, string> = {
  discovery_notes: 'Discovery Note',
  email_decodes: 'Email Decode',
  account_evidence: 'Account Evidence',
  source_records: 'Source Record',
  integration_emails: 'Email',
  activity_logs: 'Activity Log',
  meeting_preps: 'Meeting Prep',
  intel_items: 'Intel Item',
  knowledge_items: 'Knowledge Item',
  strategic_plays: 'Strategic Play',
};

export function sourceTableLabel(value: string | null | undefined, locale: 'zh' | 'en' = 'zh'): string {
  const key = value?.trim();
  if (!key) return '';
  const labels = locale === 'en' ? SOURCE_TABLE_LABELS_EN : SOURCE_TABLE_LABELS;
  return labels[key] ?? key.replace(/_/g, ' ');
}

export function evidenceRefLabel(ref: StrategicPlayEvidenceTraceRef, locale: 'zh' | 'en' = 'zh'): string {
  return ref.title?.trim() || ref.excerpt?.trim() || sourceTableLabel(ref.sourceTable, locale) || ref.sourceId;
}

function refKey(ref: StrategicPlayEvidenceTraceRef): string {
  return [ref.sourceKind ?? ref.sourceType, ref.sourceTable ?? '', ref.sourceRowId ?? ref.sourceId].join(':');
}

function dedupeRefs(refs: StrategicPlayEvidenceTraceRef[]): StrategicPlayEvidenceTraceRef[] {
  const seen = new Set<string>();
  const result: StrategicPlayEvidenceTraceRef[] = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function toTraceRef(value: unknown): StrategicPlayEvidenceTraceRef | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sourceId = typeof record.sourceId === 'string' && record.sourceId.trim()
    ? record.sourceId.trim()
    : typeof record.evidenceId === 'string' && record.evidenceId.trim()
      ? record.evidenceId.trim()
      : null;
  if (!sourceId) return null;
  return {
    ...(typeof record.evidenceId === 'string' ? { evidenceId: record.evidenceId } : {}),
    sourceId,
    sourceType: typeof record.sourceType === 'string' ? record.sourceType : 'unknown',
    ...(typeof record.sourceKind === 'string' ? { sourceKind: record.sourceKind as StrategicPlayEvidenceTraceRef['sourceKind'] } : {}),
    ...(typeof record.sourceTable === 'string' ? { sourceTable: record.sourceTable } : {}),
    ...(typeof record.sourceRowId === 'string' ? { sourceRowId: record.sourceRowId } : {}),
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
    ...(typeof record.excerpt === 'string' ? { excerpt: record.excerpt } : {}),
    ...(typeof record.occurredAt === 'string' ? { occurredAt: record.occurredAt } : {}),
    ...(Number.isFinite(Number(record.weight)) ? { weight: Number(record.weight) } : {}),
  };
}

type StrategicPlayWithEvidenceTrace = StrategicPlay & {
  evidenceTrace?: {
    fieldEvidenceAttributions?: StrategicPlayFieldEvidenceAttribution[];
  };
};

export function getStrategicPlayFieldAttributions(play: StrategicPlayWithEvidenceTrace): StrategicPlayFieldEvidenceAttribution[] {
  return play.fieldEvidenceAttributions ?? play.evidenceTrace?.fieldEvidenceAttributions ?? [];
}

export function buildStrategicPlayTraceRefs(play: StrategicPlayWithEvidenceTrace): StrategicPlayEvidenceTraceRef[] {
  const attributionRefs = getStrategicPlayFieldAttributions(play).flatMap((item) => item.evidenceRefs ?? []);
  const provenanceRefs = (play.provenance?.traces ?? []).map(toTraceRef).filter((ref): ref is StrategicPlayEvidenceTraceRef => ref !== null);
  const knowledgeRefs: StrategicPlayEvidenceTraceRef[] = (play.knowledgeTraces ?? []).map((trace) => ({
    evidenceId: trace.id,
    sourceId: trace.id,
    sourceType: trace.sourceType ?? 'knowledge_base',
    sourceTable: trace.sourceType,
    title: trace.title,
    excerpt: trace.contentSnippet,
  }));
  return dedupeRefs([...attributionRefs, ...provenanceRefs, ...knowledgeRefs]);
}

export function summarizeFieldEvidenceAttributions(attributions: StrategicPlayFieldEvidenceAttribution[]) {
  return attributions.reduce(
    (summary, attribution) => {
      summary.total += 1;
      summary[attribution.classification] += 1;
      summary.evidenceRefs += attribution.evidenceRefs?.length ?? 0;
      summary.gaps += attribution.gaps?.length ?? 0;
      summary.calibrations += attribution.calibrations?.length ?? 0;
      return summary;
    },
    { total: 0, fact: 0, inference: 0, gap: 0, mixed: 0, evidenceRefs: 0, gaps: 0, calibrations: 0 },
  );
}

export function normalizeStrategicPlayConfidence(confidence: number | null | undefined): number | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence));
}
