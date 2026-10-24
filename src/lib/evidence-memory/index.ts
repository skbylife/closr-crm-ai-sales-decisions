import type {
  AccountMemoryConflict,
  AccountMemoryPerson,
  AccountMemorySourceCoverage,
  AccountMemorySummary,
  AccountTimelineItem,
  ContactRole,
  EvidenceSourceKind,
  MomentumShift,
  RecommendationEvidenceBundle,
  RecommendationEvidenceItem,
  StrategicPlay,
} from '@/lib/babel-engine/types';
import { buildRecommendationProvenance } from '@/lib/evidence-provenance';

export interface EvidenceRecord {
  sourceId: string;
  sourceKind: EvidenceSourceKind;
  sourceLabel?: string;
  sourceTable?: string;
  sourceRowId?: string;
  occurredAt: string;
  title: string;
  summary: string;
  signal: 'positive' | 'neutral' | 'risk';
  weight: number;
  contactId?: string;
  contactName?: string;
  contactTitle?: string;
  contactRole?: ContactRole;
}

const ROLE_LABEL_MAP: Record<string, string> = {
  decision_maker: '决策者',
  economic_buyer: '经济买家',
  executive_sponsor: '高管支持者',
  champion: '内部拥护者',
  coach: '教练',
  influencer: '影响者',
  project_manager: '项目经理',
  technical_evaluator: '技术评估人',
  it_admin: 'IT 管理员',
  procurement: '采购',
  legal: '法务',
  finance: '财务',
  operations: '运营',
  blocker: '阻碍者',
  gate_keeper: '守门人',
  committee_member: '委员会成员',
  end_user: '最终用户',
  contact: '联系人',
  unknown: '未知',
};

const POSITIVE_RE = /(推进|支持|认可|同意|预算|champion|approved|positive|meeting|回复|合作|扩展|启动|签约)/i;
const RISK_RE = /(风险|阻塞|卡住|延迟|担忧|反对|预算冻结|合规|法务|竞品|block|stall|delay|concern|hesitat|negative|lost)/i;
const SUPPORT_RE = /(支持|推动|认可|champion|help|合作|积极|配合)/i;
const BLOCK_RE = /(阻塞|反对|卡住|担忧|hesitat|negative|风险|预算冻结|法务)/i;

function scoreSignal(text: string): 'positive' | 'neutral' | 'risk' {
  if (RISK_RE.test(text)) return 'risk';
  if (POSITIVE_RE.test(text)) return 'positive';
  return 'neutral';
}

function buildTensions(records: EvidenceRecord[]): string[] {
  const tensions = new Set<string>();
  if (records.some((r) => r.signal === 'risk')) tensions.add('近期存在阻力信号，需要人工确认是否影响推进节奏。');
  if (records.some((r) => /竞品|competitor/i.test(`${r.title} ${r.summary}`))) tensions.add('竞品或替代方案信号已出现，需要强化差异化叙事。');
  if (records.some((r) => /预算|采购|法务|合规/i.test(`${r.title} ${r.summary}`))) tensions.add('预算 / 采购 / 合规流程已成为推进约束。');
  return Array.from(tensions).slice(0, 4);
}

function buildMomentum(records: EvidenceRecord[]) {
  const recent = records.slice(0, 6);
  const positive = recent.filter((r) => r.signal === 'positive').length;
  const risk = recent.filter((r) => r.signal === 'risk').length;

  if (risk >= positive + 2) {
    return { status: 'at_risk' as const, label: '承压', reasoning: '最近风险信号明显多于正向推进信号。' };
  }
  if (positive >= risk + 2) {
    return { status: 'rising' as const, label: '升温', reasoning: '最近出现更多推进、回复或会面类信号。' };
  }
  if (positive === 0 && risk > 0) {
    return { status: 'stalled' as const, label: '停滞', reasoning: '缺少新的推进证据，且已有风险未解除。' };
  }
  return { status: 'steady' as const, label: '平稳', reasoning: '当前推进与风险信号相对均衡。' };
}

function getMomentumRank(status: AccountMemorySummary['momentum']['status']) {
  switch (status) {
    case 'rising': return 4;
    case 'steady': return 3;
    case 'slowing': return 2;
    case 'stalled': return 1;
    case 'at_risk': return 0;
    default: return 0;
  }
}

function buildMomentumChangeReason(current: AccountMemorySummary, previous: AccountMemorySummary, changeRecords: EvidenceRecord[]) {
  const positive = changeRecords.filter((record) => record.signal === 'positive');
  const risk = changeRecords.filter((record) => record.signal === 'risk');
  const latest = changeRecords.slice(0, 3).map((record) => record.title);

  if (getMomentumRank(current.momentum.status) > getMomentumRank(previous.momentum.status)) {
    return [
      positive.length > 0 ? `最近新增 ${positive.length} 个正向推进信号` : null,
      latest.length > 0 ? `关键变化包括：${latest.join('、')}` : null,
      current.momentum.reasoning,
    ].filter(Boolean).join('；');
  }

  if (getMomentumRank(current.momentum.status) < getMomentumRank(previous.momentum.status)) {
    return [
      risk.length > 0 ? `最近出现 ${risk.length} 个风险信号` : null,
      latest.length > 0 ? `主要拖累因素：${latest.join('、')}` : null,
      current.momentum.reasoning,
    ].filter(Boolean).join('；');
  }

  return [
    '最近新增信号尚未改变整体动量级别',
    latest.length > 0 ? `最新观察：${latest.join('、')}` : null,
    current.momentum.reasoning,
  ].filter(Boolean).join('；');
}

export function buildMomentumShift(params: {
  accountId: string;
  currentSummary: AccountMemorySummary;
  previousSummary: AccountMemorySummary;
  changeRecords: EvidenceRecord[];
}): MomentumShift {
  const { accountId, currentSummary, previousSummary, changeRecords } = params;
  const changed = currentSummary.momentum.status !== previousSummary.momentum.status;
  const summary = changed
    ? `动量由“${previousSummary.momentum.label}”变为“${currentSummary.momentum.label}”`
    : `动量维持“${currentSummary.momentum.label}”`;
  const whyChanged = buildMomentumChangeReason(currentSummary, previousSummary, changeRecords);

  return {
    id: `${accountId}:momentum-shift`,
    accountId,
    previous: previousSummary.momentum.status,
    previousLabel: previousSummary.momentum.label,
    previousSummary: previousSummary.momentum.reasoning,
    current: currentSummary.momentum.status,
    currentLabel: currentSummary.momentum.label,
    currentSummary: currentSummary.momentum.reasoning,
    changed,
    summary,
    whyChanged,
    evidenceRefs: changeRecords.slice(0, 3).map((record) => ({
      sourceId: record.sourceId,
      sourceKind: record.sourceKind,
      title: record.title,
      sourceTable: record.sourceTable,
      sourceRowId: record.sourceRowId,
    })),
    occurredAt: currentSummary.lastComputedAt,
  };
}

export function toTimelineItems(accountId: string, records: EvidenceRecord[], limit = 12): AccountTimelineItem[] {
  return records.slice(0, limit).map((record, index) => ({
    id: `${record.sourceKind}:${record.sourceId}:${index}`,
    accountId,
    sourceId: record.sourceId,
    sourceKind: record.sourceKind,
    title: record.title,
    summary: record.summary,
    occurredAt: record.occurredAt,
    signal: record.signal,
  }));
}

export function buildMemoryPeople(records: EvidenceRecord[]): AccountMemoryPerson[] {
  const grouped = new Map<string, EvidenceRecord[]>();
  for (const record of records) {
    if (!record.contactId || !record.contactName) continue;
    const list = grouped.get(record.contactId) ?? [];
    list.push(record);
    grouped.set(record.contactId, list);
  }

  return Array.from(grouped.entries()).map(([contactId, items]) => {
    const latest = items[0];
    const positive = items.filter((item) => scoreSignal(`${item.title} ${item.summary}`) === 'positive').length;
    const risk = items.filter((item) => scoreSignal(`${item.title} ${item.summary}`) === 'risk').length;
    const stance: AccountMemoryPerson['stance'] = risk > positive ? 'blocking' : positive > risk ? 'supportive' : items.length > 1 ? 'neutral' : 'unclear';
    return {
      contactId,
      name: latest.contactName ?? '未知联系人',
      title: latest.contactTitle,
      role: latest.contactRole,
      influenceLabel: latest.contactRole ? (ROLE_LABEL_MAP[latest.contactRole] ?? String(latest.contactRole).replaceAll('_', ' ')) : '相关方',
      stance,
      summary: latest.summary,
      sourceIds: items.map((item) => item.sourceId).slice(0, 4),
    };
  }).sort((a, b) => b.sourceIds.length - a.sourceIds.length).slice(0, 5);
}

export function detectConflicts(accountId: string, records: EvidenceRecord[]): AccountMemoryConflict[] {
  const conflicts: AccountMemoryConflict[] = [];
  const now = new Date().toISOString();

  // ── 1. Budget contradiction (existing, enhanced with severity) ──
  const budgetPositive = records.find((r) => /预算|采购|approve|approved/i.test(`${r.title} ${r.summary}`) && r.signal === 'positive');
  const budgetRisk = records.find((r) => /预算|采购|冻结|压缩|法务|合规/i.test(`${r.title} ${r.summary}`) && r.signal === 'risk');
  if (budgetPositive && budgetRisk) {
    const daysBetween = Math.abs(+new Date(budgetPositive.occurredAt) - +new Date(budgetRisk.occurredAt)) / (24 * 60 * 60 * 1000);
    conflicts.push({
      id: `conflict-budget-${accountId}`,
      accountId,
      summary: '预算 / 采购信号出现矛盾：既有推进表态，也有冻结或审查风险。',
      status: 'open',
      sourceIds: [budgetPositive.sourceId, budgetRisk.sourceId],
      detectedAt: now,
      kind: 'budget_contradiction',
      severity: daysBetween <= 14 ? 'high' : 'medium',
    });
  }

  // ── 2. General stance contradiction (existing, enhanced) ──
  const championPositive = records.find((r) => /支持|champion|推进|认可/i.test(`${r.title} ${r.summary}`));
  const championRisk = records.find((r) => /反对|阻塞|hesitat|担忧|negative/i.test(`${r.title} ${r.summary}`));
  if (championPositive && championRisk) {
    conflicts.push({
      id: `conflict-stance-${accountId}`,
      accountId,
      summary: '关键干系人立场不一致：存在支持信号，也存在明显保留/阻塞信号。',
      status: 'open',
      sourceIds: [championPositive.sourceId, championRisk.sourceId],
      detectedAt: now,
      kind: 'stance_contradiction',
      severity: 'medium',
    });
  }

  // ── 3. Person stance flip — same contact has both supportive and blocking signals ──
  const contactRecords = new Map<string, EvidenceRecord[]>();
  for (const r of records) {
    if (!r.contactId) continue;
    const list = contactRecords.get(r.contactId) ?? [];
    list.push(r);
    contactRecords.set(r.contactId, list);
  }
  for (const [contactId, items] of contactRecords) {
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt));
    const hasSupport = sorted.some((r) => SUPPORT_RE.test(`${r.title} ${r.summary}`));
    const hasBlock = sorted.some((r) => BLOCK_RE.test(`${r.title} ${r.summary}`));
    if (hasSupport && hasBlock) {
      const supportItem = sorted.find((r) => SUPPORT_RE.test(`${r.title} ${r.summary}`))!;
      const blockItem = sorted.find((r) => BLOCK_RE.test(`${r.title} ${r.summary}`))!;
      const contactName = items[0].contactName ?? '未知联系人';
      conflicts.push({
        id: `conflict-person-flip-${accountId}-${contactId}`,
        accountId,
        summary: `${contactName} 的立场信号出现翻转：既有支持/推进表态，也有阻碍/担忧信号。`,
        status: 'open',
        sourceIds: [supportItem.sourceId, blockItem.sourceId],
        detectedAt: now,
        kind: 'person_stance_flip',
        severity: 'high',
        involvedContactIds: [contactId],
      });
    }
  }

  // ── 4. Temporal reversal — positive signals followed by risk signals within 14 days ──
  const sorted = [...records].sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt));
  const REVERSAL_WINDOW = 14 * 24 * 60 * 60 * 1000;
  const reversalPairs: { positive: EvidenceRecord; risk: EvidenceRecord }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].signal !== 'positive') continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].signal !== 'risk') continue;
      const gap = +new Date(sorted[j].occurredAt) - +new Date(sorted[i].occurredAt);
      if (gap > 0 && gap <= REVERSAL_WINDOW) {
        reversalPairs.push({ positive: sorted[i], risk: sorted[j] });
        break;
      }
    }
  }
  // Only flag if there are multiple reversal pairs (pattern, not noise)
  if (reversalPairs.length >= 2) {
    const pair = reversalPairs[reversalPairs.length - 1];
    conflicts.push({
      id: `conflict-temporal-reversal-${accountId}`,
      accountId,
      summary: `近期出现信号反转模式：正向推进信号后短期内出现风险信号（${reversalPairs.length} 次），可能存在隐藏阻力。`,
      status: 'open',
      sourceIds: [pair.positive.sourceId, pair.risk.sourceId],
      detectedAt: now,
      kind: 'temporal_reversal',
      severity: reversalPairs.length >= 3 ? 'high' : 'medium',
    });
  }

  // ── 5. Engagement gap — active engagement followed by prolonged silence ──
  const freshCutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
  const recentRecords = records.filter((r) => +new Date(r.occurredAt) >= freshCutoff);
  const olderActive = records.filter((r) => +new Date(r.occurredAt) < freshCutoff && r.signal === 'positive');
  if (olderActive.length >= 3 && recentRecords.length <= 1) {
    conflicts.push({
      id: `conflict-engagement-gap-${accountId}`,
      accountId,
      summary: '参与度断崖：此前有较活跃的正向互动，但近 3 周几乎沉默，需确认是否遇到内部变故。',
      status: 'open',
      sourceIds: olderActive.slice(0, 2).map((r) => r.sourceId),
      detectedAt: now,
      kind: 'engagement_gap',
      severity: 'high',
    });
  }

  // ── 6. Cross-source disagreement — different source kinds give conflicting signals on same topic ──
  const topicPatterns = [
    { topic: '项目进展', re: /进展|启动|项目|initiative|timeline|排期|里程碑/i },
    { topic: '关系状态', re: /关系|合作|配合|relationship|partner/i },
    { topic: '技术评估', re: /技术|评估|POC|测试|集成|integration/i },
  ];
  for (const { topic, re } of topicPatterns) {
    const matching = records.filter((r) => re.test(`${r.title} ${r.summary}`));
    if (matching.length < 2) continue;
    const sourceKinds = new Set(matching.map((r) => r.sourceKind));
    if (sourceKinds.size < 2) continue;
    const positiveFromKind = matching.find((r) => r.signal === 'positive');
    const riskFromKind = matching.find((r) => r.signal === 'risk' && r.sourceKind !== positiveFromKind?.sourceKind);
    if (positiveFromKind && riskFromKind) {
      conflicts.push({
        id: `conflict-cross-source-${accountId}-${topic}`,
        accountId,
        summary: `「${topic}」信号在不同来源间矛盾：${positiveFromKind.sourceKind === 'email_decode' ? '邮件解读' : '情报/记录'}显示正向，而${riskFromKind.sourceKind === 'email_decode' ? '邮件解读' : '其他来源'}显示风险。`,
        status: 'open',
        sourceIds: [positiveFromKind.sourceId, riskFromKind.sourceId],
        detectedAt: now,
        kind: 'cross_source_disagreement',
        severity: 'medium',
      });
    }
  }

  // ── 7. Competitor displacement — deal progressing but competitor signals appearing ──
  const dealProgress = records.find((r) => r.signal === 'positive' && /推进|签约|合同|合作|启动|POC/i.test(`${r.title} ${r.summary}`));
  const competitorSignal = records.find((r) => /竞品|competitor|替代|换供应商|比价|选型/i.test(`${r.title} ${r.summary}`));
  if (dealProgress && competitorSignal) {
    const daysBetween = Math.abs(+new Date(dealProgress.occurredAt) - +new Date(competitorSignal.occurredAt)) / (24 * 60 * 60 * 1000);
    if (daysBetween <= 30) {
      conflicts.push({
        id: `conflict-competitor-${accountId}`,
        accountId,
        summary: '交易推进中出现竞品/替代方案信号，客户可能在同步评估其他选项。',
        status: 'open',
        sourceIds: [dealProgress.sourceId, competitorSignal.sourceId],
        detectedAt: now,
        kind: 'competitor_displacement',
        severity: 'high',
      });
    }
  }

  // Deduplicate by id and sort by severity
  const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const seen = new Set<string>();
  return conflicts
    .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
    .sort((a, b) => (SEVERITY_RANK[b.severity ?? 'low'] ?? 0) - (SEVERITY_RANK[a.severity ?? 'low'] ?? 0));
}

function computeSourceCoverage(records: EvidenceRecord[]): AccountMemorySourceCoverage {
  const kinds = [...new Set(records.map((r) => r.sourceKind))];
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const freshRecords = records.filter((r) => +new Date(r.occurredAt) >= thirtyDaysAgo).length;
  const dates = records.map((r) => r.occurredAt).filter(Boolean).sort();
  return {
    kinds,
    totalRecords: records.length,
    freshRecords,
    oldestRecordAt: dates[0],
    newestRecordAt: dates[dates.length - 1],
  };
}

function computeConfidence(records: EvidenceRecord[], coverage: AccountMemorySourceCoverage): number {
  if (records.length === 0) return 0;
  // Volume factor: up to 0.35 — more records = more confidence
  const volumeFactor = Math.min(records.length / 15, 1) * 0.35;
  // Freshness factor: up to 0.35 — proportion of fresh records
  const freshnessFactor = (coverage.freshRecords / Math.max(records.length, 1)) * 0.35;
  // Diversity factor: up to 0.30 — more source kinds = more confidence
  const diversityFactor = Math.min(coverage.kinds.length / 4, 1) * 0.30;
  return Math.round((volumeFactor + freshnessFactor + diversityFactor) * 100) / 100;
}

export function buildMemorySummary(accountId: string, accountName: string, records: EvidenceRecord[]): AccountMemorySummary {
  const sorted = [...records].sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
  const timelineHighlights = toTimelineItems(accountId, sorted, 5);
  const momentum = buildMomentum(sorted);
  const people = buildMemoryPeople(sorted);
  const tensions = buildTensions(sorted);
  const lastComputedAt = new Date().toISOString();
  const sourceCoverage = computeSourceCoverage(sorted);
  const confidence = computeConfidence(sorted, sourceCoverage);

  const latestTitles = timelineHighlights.slice(0, 3).map((item) => item.title).join('；');
  const narrativeSummary = sorted.length === 0
    ? `${accountName} 目前缺少足够的一手互动记录，系统仅能提供基础记忆框架。`
    : `${accountName} 当前整体动量${momentum.label}。最近的关键信号包括：${latestTitles || '暂无高价值事件'}。${tensions[0] ?? '当前暂无显著冲突，但仍需持续补充真实互动证据。'}`;

  return {
    accountId,
    narrativeSummary,
    momentum,
    people,
    tensions,
    timelineHighlights,
    lastComputedAt,
    confidence,
    sourceCoverage,
  };
}

function computeLowEvidenceReasons(records: RecommendationEvidenceItem[]) {
  const reasons: string[] = [];
  if (records.length < 2) {
    reasons.push('supporting_evidence_count_below_minimum');
  }

  const freshCount = records.filter((record) => (record.ageDays ?? Number.POSITIVE_INFINITY) <= 30).length;
  if (records.length > 0 && freshCount === 0) {
    reasons.push('all_supporting_evidence_is_stale');
  }

  const sourceKinds = new Set(records.map((record) => record.sourceKind));
  if (records.length >= 2 && sourceKinds.size === 1) {
    reasons.push('supporting_evidence_is_single_source');
  }

  return reasons;
}

function selectRelevantEvidence(params: {
  records: EvidenceRecord[];
  queryText: string;
}) {
  const { records, queryText } = params;
  const normalized = queryText.toLowerCase();
  const words = normalized.split(/[\s，。、“”‘’,.!?:：；\-_/()\[\]]+/).filter((word) => word.length >= 2);

  return records
    .map((record, index) => {
      const hay = `${record.title} ${record.summary}`.toLowerCase();
      const keywordHits = words.filter((word) => hay.includes(word)).length;
      const signalBoost = record.signal === 'risk' ? 0.18 : record.signal === 'positive' ? 0.12 : 0.05;
      const recencyBoost = Math.max(0, 0.15 - index * 0.02);
      const score = record.weight + keywordHits * 0.22 + signalBoost + recencyBoost;
      return { record, score, keywordHits, index };
    })
    .filter(({ keywordHits, index }) => keywordHits > 0 || index < 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map<RecommendationEvidenceItem>(({ record }) => ({
      sourceId: record.sourceId,
      sourceKind: record.sourceKind,
      sourceLabel: record.sourceLabel ?? record.title,
      sourceTable: record.sourceTable,
      sourceRowId: record.sourceRowId,
      title: record.title,
      excerpt: record.summary,
      occurredAt: record.occurredAt,
      weight: record.weight,
      ageDays: Math.max(0, Math.floor((Date.now() - +new Date(record.occurredAt)) / (24 * 60 * 60 * 1000))),
    }));
}

export function buildAdHocRecommendationEvidenceBundle(params: {
  accountId: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendationSummary: string;
  confidence: number;
  records: EvidenceRecord[];
  conflicts: AccountMemoryConflict[];
}): RecommendationEvidenceBundle {
  const { accountId, recommendationId, recommendationTitle, recommendationSummary, confidence, records, conflicts } = params;
  const relevant = selectRelevantEvidence({
    records,
    queryText: `${recommendationTitle} ${recommendationSummary}`,
  });

  const lowEvidenceReasons = computeLowEvidenceReasons(relevant);
  const lowEvidence = lowEvidenceReasons.length > 0;
  const relatedConflictIds = conflicts
    .filter((conflict) => conflict.sourceIds.some((sourceId) => relevant.some((item) => item.sourceId === sourceId)))
    .map((conflict) => conflict.id);
  const conflictDetected = relatedConflictIds.length > 0;
  const evidenceStrengthLabel = lowEvidence
    ? '低证据支持'
    : conflictDetected
      ? '有冲突证据'
      : relevant.length >= 4
        ? '证据较强'
        : '中等证据';

  return {
    accountId,
    recommendationId,
    recommendationTitle,
    recommendationSummary,
    recommendationSurface: 'ad_hoc',
    isCoreRecommendationSurface: false,
    confidence,
    evidenceStrengthLabel,
    lowEvidence,
    lowEvidenceReasons,
    conflictDetected,
    evidenceItems: relevant,
    relatedConflictIds,
    provenance: buildRecommendationProvenance({
      evidenceItems: relevant,
      conflicts,
      confidence,
      rationale: '基于与推荐目标最相关的证据、来源多样性、新鲜度以及冲突信号生成。冲突不会被抹平，会作为 contradiction 暴露给上层判断。',
    }),
    generatedAt: new Date().toISOString(),
  };
}

export function buildRecommendationEvidenceBundle(params: {
  accountId: string;
  play: StrategicPlay;
  records: EvidenceRecord[];
  conflicts: AccountMemoryConflict[];
}): RecommendationEvidenceBundle {
  const { accountId, play, records, conflicts } = params;
  const bundle = buildAdHocRecommendationEvidenceBundle({
    accountId,
    recommendationId: play.id,
    recommendationTitle: play.goalDescription,
    recommendationSummary: play.steps[0]?.description ?? play.goalDescription,
    confidence: play.confidence,
    records,
    conflicts,
  });

  return {
    ...bundle,
    recommendationSurface: 'strategic_play',
    isCoreRecommendationSurface: true,
  };
}

export function hydrateRecordSignal<T extends { title: string; summary: string }>(record: T): EvidenceRecord['signal'] {
  return scoreSignal(`${record.title} ${record.summary}`);
}

export function getContactStanceLabel(summary: string) {
  if (BLOCK_RE.test(summary)) return 'blocking';
  if (SUPPORT_RE.test(summary)) return 'supportive';
  return 'neutral';
}
