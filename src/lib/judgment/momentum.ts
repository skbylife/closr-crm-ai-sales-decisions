import type {
  AccountMemorySummary,
  AccountTimelineItem,
  EvidenceSourceKind,
  JudgmentEvidenceRef,
  MomentumShift,
} from '@/lib/babel-engine/types';

export type AccountMomentumSnapshotStatus = 'heating' | 'cooling' | 'stalled' | 'risk_rising' | 'mixed' | 'unknown';

export interface AccountMomentumSnapshot {
  status: AccountMomentumSnapshotStatus;
  confidence: number;
  currentJudgment: string;
  whyChanged: string;
  biggestTension: string;
  nextAction: string;
  evidenceRefs: JudgmentEvidenceRef[];
  provisional: boolean;
  updatedAt: string;
}

export interface AccountMomentumMemoryInput {
  id?: unknown;
  sourceKind?: unknown;
  sourceId?: unknown;
  sourceRecordId?: unknown;
  sourceTable?: unknown;
  sourceRowId?: unknown;
  title?: unknown;
  currentJudgment?: unknown;
  risk?: unknown;
  nextAction?: unknown;
  confidence?: unknown;
  uncertainty?: unknown;
  provisional?: unknown;
  evidenceRefs?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface AccountMomentumActivityInput {
  id?: unknown;
  sourceId?: unknown;
  sourceKind?: unknown;
  title?: unknown;
  summary?: unknown;
  occurredAt?: unknown;
  signal?: unknown;
}

export interface BuildAccountMomentumSnapshotParams {
  accountId?: string;
  summary?: AccountMemorySummary | null;
  previousSummary?: AccountMemorySummary | null;
  momentumShift?: MomentumShift | null;
  judgmentMemories?: AccountMomentumMemoryInput[] | null;
  recentActivities?: AccountMomentumActivityInput[] | AccountTimelineItem[] | null;
  updatedAt?: string;
}

type NormalizedMemory = {
  id: string;
  sourceKind: string;
  sourceId: string;
  sourceRecordId?: string;
  sourceTable?: string;
  sourceRowId?: string;
  title: string;
  currentJudgment: string;
  risk: string;
  nextAction: string;
  confidence: number | null;
  uncertainty: string;
  provisional: boolean;
  evidenceRefs: JudgmentEvidenceRef[];
  updatedAt: string;
};

type NormalizedActivity = {
  id: string;
  sourceId: string;
  sourceKind: EvidenceSourceKind;
  title: string;
  summary: string;
  occurredAt: string;
  signal: 'positive' | 'neutral' | 'risk';
};

const EVIDENCE_SOURCE_KINDS = new Set<EvidenceSourceKind>([
  'intel_item',
  'email_decode',
  'integration_email',
  'meeting_prep',
  'activity_log',
  'strategic_play',
  'source_record',
]);

const MEMORY_TO_EVIDENCE_KIND: Record<string, EvidenceSourceKind> = {
  decode: 'email_decode',
  rfp_analysis: 'source_record',
  strategic_play: 'strategic_play',
};

const HEATING_RE = /推进|升温|上升|积极|支持|愿意|确认|承诺|下一步|回复|评审|demo|ROI|预算通过|sponsor|champion|bid|win|rising|warming|positive|move forward|committed|approval/i;
const COOLING_RE = /降温|下降|转弱|变慢|冷淡|延后|推迟|放缓|slowing|cooling|declined|weaker|delayed/i;
const STALLED_RE = /停滞|卡住|卡点|待验证|pending|stalled|未回复|无回应|缺乏|缺少|没有推进|等待|延迟|no response|waiting|blocked/i;
const RISK_RE = /风险|阻碍|冻结|压价|放弃|采购|竞对|预算不足|高风险|不确定|顾虑|反对|blocker|blocking|risk|no_bid|need_more_intel|competitor|concern/i;
const TENSION_RE = /张力|不确定|待验证|仍需|需要确认|但|however|tension|uncertain|pending|stalled|risk|风险/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function compact(value: unknown, fallback = ''): string {
  const cleaned = text(value).replace(/；/g, '，');
  if (!cleaned) return fallback;
  return cleaned.split(/[。!?！？]/)[0]?.trim() || cleaned;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return clamp01(value > 1 ? value / 100 : value);
}

function validIso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function latestIso(values: Array<string | null | undefined>, fallback?: string): string {
  const valid = values
    .map((value) => validIso(value))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return valid[0] ?? validIso(fallback) ?? new Date().toISOString();
}

function normalizeEvidenceRefs(value: unknown): JudgmentEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const sourceId = text(record?.sourceId);
    const sourceKind = text(record?.sourceKind) as EvidenceSourceKind;
    if (!sourceId || !EVIDENCE_SOURCE_KINDS.has(sourceKind)) return [];
    return [{
      sourceId,
      sourceKind,
      title: text(record?.title) || undefined,
      sourceTable: text(record?.sourceTable) || undefined,
      sourceRowId: text(record?.sourceRowId) || undefined,
    } satisfies JudgmentEvidenceRef];
  });
}

function normalizeMemory(input: AccountMomentumMemoryInput): NormalizedMemory | null {
  const sourceKind = text(input.sourceKind);
  const sourceId = text(input.sourceId) || text(input.id) || text(input.sourceRecordId);
  const currentJudgment = compact(input.currentJudgment);
  const risk = compact(input.risk);
  const nextAction = compact(input.nextAction);
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
  const updatedAt = validIso(input.updatedAt) ?? validIso(input.createdAt) ?? '';
  if (!sourceId && !currentJudgment && !risk && !nextAction && evidenceRefs.length === 0) return null;

  const title = compact(input.title, sourceKind || '判断来源');
  const sourceRecordId = text(input.sourceRecordId) || undefined;
  const fallbackKind = MEMORY_TO_EVIDENCE_KIND[sourceKind];
  const fallbackEvidence = sourceId && fallbackKind ? [{
    sourceId: sourceRecordId ?? sourceId,
    sourceKind: fallbackKind,
    title,
    sourceTable: text(input.sourceTable) || undefined,
    sourceRowId: text(input.sourceRowId) || sourceRecordId || sourceId,
  } satisfies JudgmentEvidenceRef] : [];

  return {
    id: `${sourceKind || 'memory'}:${sourceId || title}`,
    sourceKind,
    sourceId,
    sourceRecordId,
    sourceTable: text(input.sourceTable) || undefined,
    sourceRowId: text(input.sourceRowId) || undefined,
    title,
    currentJudgment,
    risk,
    nextAction,
    confidence: normalizeConfidence(input.confidence),
    uncertainty: compact(input.uncertainty),
    provisional: input.provisional === true,
    evidenceRefs: [...fallbackEvidence, ...evidenceRefs],
    updatedAt,
  };
}

function normalizeActivity(input: AccountMomentumActivityInput | AccountTimelineItem): NormalizedActivity | null {
  const sourceKindRaw = text(input.sourceKind) as EvidenceSourceKind;
  const sourceKind = EVIDENCE_SOURCE_KINDS.has(sourceKindRaw) ? sourceKindRaw : 'source_record';
  const sourceId = text(input.sourceId) || text(input.id);
  const title = compact(input.title, '账户活动');
  const summary = compact(input.summary);
  const occurredAt = validIso(input.occurredAt) ?? '';
  const signal = input.signal === 'positive' || input.signal === 'risk' || input.signal === 'neutral' ? input.signal : 'neutral';
  if (!sourceId && !summary && !title) return null;
  return { id: text(input.id) || sourceId || title, sourceId: sourceId || text(input.id) || title, sourceKind, title, summary, occurredAt, signal };
}

function dedupeEvidence(refs: JudgmentEvidenceRef[], limit = 6): JudgmentEvidenceRef[] {
  const seen = new Set<string>();
  const result: JudgmentEvidenceRef[] = [];
  for (const ref of refs) {
    if (!ref.sourceId || !EVIDENCE_SOURCE_KINDS.has(ref.sourceKind)) continue;
    const key = `${ref.sourceKind}:${ref.sourceTable ?? ''}:${ref.sourceRowId ?? ref.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
    if (result.length >= limit) break;
  }
  return result;
}

function includesAny(pattern: RegExp, ...values: string[]): boolean {
  return values.some((value) => pattern.test(value));
}

function chooseNewest(memories: NormalizedMemory[], predicate: (memory: NormalizedMemory) => boolean): NormalizedMemory | null {
  return memories.find(predicate) ?? null;
}

function statusLabel(status: AccountMomentumSnapshotStatus): string {
  switch (status) {
    case 'heating': return '升温';
    case 'cooling': return '降温';
    case 'stalled': return '停滞';
    case 'risk_rising': return '风险上升';
    case 'mixed': return '混合信号';
    default: return '证据不足';
  }
}

function concreteSignalFromMemory(memory: NormalizedMemory | null): string {
  if (!memory) return '';
  const detail = memory.currentJudgment || memory.risk || memory.uncertainty || memory.nextAction;
  return detail ? `${memory.title}：${detail}` : memory.title;
}

function concreteSignalFromActivity(activity: NormalizedActivity | null): string {
  if (!activity) return '';
  const detail = activity.summary || activity.title;
  return `${activity.title}${detail && detail !== activity.title ? `：${detail}` : ''}`;
}

function statusFromSummary(status?: AccountMemorySummary['momentum']['status']): AccountMomentumSnapshotStatus | null {
  switch (status) {
    case 'rising': return 'heating';
    case 'slowing': return 'cooling';
    case 'stalled': return 'stalled';
    case 'at_risk': return 'risk_rising';
    default: return null;
  }
}

export function buildAccountMomentumSnapshot(params: BuildAccountMomentumSnapshotParams): AccountMomentumSnapshot {
  const memories = (params.judgmentMemories ?? [])
    .map(normalizeMemory)
    .filter((item): item is NormalizedMemory => Boolean(item))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const activities = (params.recentActivities ?? [])
    .map(normalizeActivity)
    .filter((item): item is NormalizedActivity => Boolean(item))
    .sort((a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime());
  const timeline = [
    ...(Array.isArray(params.summary?.timelineHighlights) ? params.summary.timelineHighlights.map(normalizeActivity).filter((item): item is NormalizedActivity => Boolean(item)) : []),
    ...activities,
  ];

  const summaryStatus = statusFromSummary(params.summary?.momentum?.status);
  let positiveScore = 0;
  let riskScore = 0;
  let stalledScore = 0;
  let coolingScore = 0;
  let tensionScore = 0;

  if (summaryStatus === 'heating') positiveScore += 2;
  if (summaryStatus === 'cooling') coolingScore += 2;
  if (summaryStatus === 'stalled') stalledScore += 2;
  if (summaryStatus === 'risk_rising') riskScore += 2;

  for (const memory of memories) {
    const combined = `${memory.title} ${memory.currentJudgment} ${memory.risk} ${memory.uncertainty} ${memory.nextAction}`;
    if (includesAny(HEATING_RE, combined)) positiveScore += 1;
    if (includesAny(COOLING_RE, combined)) coolingScore += 1;
    if (includesAny(STALLED_RE, combined)) stalledScore += 1;
    if (includesAny(RISK_RE, memory.risk, memory.uncertainty, memory.currentJudgment)) riskScore += 1;
    if (includesAny(TENSION_RE, memory.risk, memory.uncertainty, memory.currentJudgment)) tensionScore += 1;
  }

  for (const item of timeline.slice(0, 12)) {
    if (item.signal === 'positive') positiveScore += 1;
    if (item.signal === 'risk') riskScore += 1;
    if (includesAny(HEATING_RE, item.title, item.summary)) positiveScore += 1;
    if (includesAny(COOLING_RE, item.title, item.summary)) coolingScore += 1;
    if (includesAny(STALLED_RE, item.title, item.summary)) stalledScore += 1;
    if (includesAny(RISK_RE, item.title, item.summary)) riskScore += item.signal === 'risk' ? 1 : 0.5;
    if (includesAny(TENSION_RE, item.title, item.summary)) tensionScore += 0.5;
  }

  const summaryTensions = Array.isArray(params.summary?.tensions)
    ? params.summary.tensions.map((item) => compact(item)).filter(Boolean)
    : [];
  tensionScore += summaryTensions.length;
  if (summaryTensions.some((item) => includesAny(RISK_RE, item))) riskScore += 1;
  if (summaryTensions.some((item) => includesAny(STALLED_RE, item))) stalledScore += 1;

  const hasAnySignal = memories.length > 0 || timeline.length > 0 || Boolean(params.summary?.momentum?.label || params.summary?.narrativeSummary);
  const hasConflictingDirection = positiveScore >= 2 && (riskScore >= 2 || coolingScore >= 2 || stalledScore >= 2 || tensionScore >= 2);

  let status: AccountMomentumSnapshotStatus = 'unknown';
  if (hasConflictingDirection) status = 'mixed';
  else if (riskScore >= 2 && riskScore >= Math.max(coolingScore, stalledScore)) status = 'risk_rising';
  else if (stalledScore >= 2 && stalledScore >= coolingScore) status = 'stalled';
  else if (coolingScore >= 2) status = 'cooling';
  else if (positiveScore >= 2) status = 'heating';
  else if (hasAnySignal && tensionScore > 0) status = 'mixed';

  const positiveMemory = chooseNewest(memories, (memory) => includesAny(HEATING_RE, `${memory.currentJudgment} ${memory.nextAction}`));
  const riskMemory = chooseNewest(memories, (memory) => includesAny(RISK_RE, `${memory.risk} ${memory.uncertainty} ${memory.currentJudgment}`));
  const stalledMemory = chooseNewest(memories, (memory) => includesAny(STALLED_RE, `${memory.risk} ${memory.uncertainty} ${memory.currentJudgment} ${memory.nextAction}`));
  const coolingMemory = chooseNewest(memories, (memory) => includesAny(COOLING_RE, `${memory.risk} ${memory.currentJudgment}`));
  const newestMemory = memories[0] ?? null;

  const currentJudgment = (() => {
    if (status === 'unknown') return '当前证据不足，暂时无法判断账户动量。';
    if (status === 'heating') return positiveMemory?.currentJudgment || compact(params.summary?.momentum?.label, '账户动量正在升温，可以争取下一次明确承诺。');
    if (status === 'cooling') return coolingMemory?.currentJudgment || compact(params.summary?.momentum?.label, '账户互动热度正在下降，需要确认是否仍有推进意愿。');
    if (status === 'stalled') return stalledMemory?.currentJudgment || compact(params.summary?.momentum?.label, '账户推进出现停滞，关键假设仍待验证。');
    if (status === 'risk_rising') return riskMemory?.currentJudgment || compact(params.summary?.momentum?.label, '账户风险正在上升，需要先处理阻碍信号。');
    return newestMemory?.currentJudgment || '推进信号与风险/张力同时存在，不能只按单一方向解读。';
  })();

  const biggestTension = compact(
    summaryTensions[0]
      || riskMemory?.risk
      || stalledMemory?.uncertainty
      || newestMemory?.uncertainty
      || newestMemory?.risk,
    status === 'heating'
      ? '最大张力是升温信号能否转化为带日期、带责任人的下一步承诺。'
      : status === 'unknown'
        ? '缺少足够新鲜证据，当前判断仍需补充客户互动。'
        : '需要区分短期噪音与真正影响推进节奏的结构性张力。',
  );

  const nextAction = compact(
    newestMemory?.nextAction
      || (status === 'heating' ? '趁窗口期推进下一次明确承诺，把时间、参与人和预期产出一起敲定。' : '')
      || (status === 'risk_rising' ? '先逐个确认关键顾虑，把风险转成可验证的问题清单。' : '')
      || (status === 'stalled' ? '补一轮验证动作，确认卡点来自人、预算、采购流程还是优先级下降。' : '')
      || (status === 'cooling' ? '用低摩擦触达确认客户是否仍愿意推进，并重新锁定下一步。' : '')
      || (status === 'mixed' ? '同时验证正向推进信号和最大张力，避免只看表面活跃度。' : '')
      || '先补充最新客户互动，再更新账户动量判断。',
  );

  const changedLabel = params.momentumShift?.changed
    ? `动量从“${params.momentumShift.previousLabel}”变为“${params.momentumShift.currentLabel}”`
    : '';
  const topRiskActivity = timeline.find((item) => item.signal === 'risk') ?? null;
  const topPositiveActivity = timeline.find((item) => item.signal === 'positive') ?? null;
  const concreteReason = status === 'risk_rising'
    ? concreteSignalFromMemory(riskMemory) || concreteSignalFromActivity(topRiskActivity)
    : status === 'stalled'
      ? concreteSignalFromMemory(stalledMemory) || concreteSignalFromActivity(topRiskActivity)
      : status === 'cooling'
        ? concreteSignalFromMemory(coolingMemory) || concreteSignalFromActivity(topRiskActivity)
        : status === 'heating'
          ? concreteSignalFromMemory(positiveMemory) || concreteSignalFromActivity(topPositiveActivity)
          : concreteSignalFromMemory(newestMemory) || concreteSignalFromActivity(topRiskActivity ?? topPositiveActivity);
  const whyChanged = compact(
    params.momentumShift?.whyChanged
      || (changedLabel && concreteReason ? `${changedLabel}，关键依据：${concreteReason}` : '')
      || (changedLabel ? `${changedLabel}，但仍需补充具体证据确认变化原因。` : '')
      || (status !== 'unknown' && concreteReason ? `当前归因为${statusLabel(status)}，关键依据：${concreteReason}` : '暂无足够历史变化信号。'),
  );

  const confidenceValues = [
    normalizeConfidence(params.summary?.confidence),
    ...memories.map((memory) => memory.confidence),
  ].filter((value): value is number => value != null);
  const avgConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0.35;
  const evidenceCount = dedupeEvidence([
    ...memories.flatMap((memory) => memory.evidenceRefs),
    ...timeline.map((item) => ({ sourceId: item.sourceId, sourceKind: item.sourceKind, title: item.title } satisfies JudgmentEvidenceRef)),
    ...(params.momentumShift?.evidenceRefs ?? []),
  ], 8).length;
  const signalStrength = Math.min(0.2, Math.max(positiveScore, riskScore, stalledScore, coolingScore, tensionScore) * 0.02);
  const evidenceBoost = Math.min(0.12, evidenceCount * 0.025);
  const statusPenalty = status === 'unknown' ? 0.2 : status === 'mixed' ? 0.08 : 0;
  const confidence = clamp01(Number((avgConfidence + evidenceBoost + signalStrength - statusPenalty).toFixed(2)));

  const evidenceRefs = dedupeEvidence([
    ...memories.flatMap((memory) => memory.evidenceRefs),
    ...timeline.map((item) => ({ sourceId: item.sourceId, sourceKind: item.sourceKind, title: item.title } satisfies JudgmentEvidenceRef)),
    ...(params.momentumShift?.evidenceRefs ?? []),
  ]);

  const updatedAt = latestIso([
    params.updatedAt,
    params.summary?.lastComputedAt,
    params.momentumShift?.occurredAt,
    newestMemory?.updatedAt,
    timeline[0]?.occurredAt,
  ]);

  return {
    status,
    confidence,
    currentJudgment,
    whyChanged,
    biggestTension,
    nextAction,
    evidenceRefs,
    provisional: status === 'unknown' || status === 'mixed' || status === 'stalled' || confidence < 0.75 || memories.some((memory) => memory.provisional || Boolean(memory.uncertainty)),
    updatedAt,
  };
}
