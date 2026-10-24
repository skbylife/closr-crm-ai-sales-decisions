import type {
  AccountMemoryConflict,
  AccountMemorySummary,
  AccountTimelineItem,
  EvidenceSourceKind,
  JudgmentEvidenceRef,
} from '@/lib/babel-engine/types';
import type { AccountMomentumSnapshot } from '@/lib/judgment/momentum';
import type { StakeholderInterpretation } from '@/lib/judgment/stakeholder';

export type AccountOpenQuestionPriority = 'high' | 'medium' | 'low';
export type AccountOpenQuestionBlockedJudgment = 'momentum' | 'risk' | 'stakeholder' | 'rfp' | 'unknown';

export interface AccountOpenQuestionWhoToAsk {
  name?: string;
  contactId?: string;
  title?: string;
}

export interface AccountOpenQuestion {
  id: string;
  question: string;
  priority: AccountOpenQuestionPriority;
  whyItMatters: string;
  whoToAsk?: AccountOpenQuestionWhoToAsk;
  blockedJudgment: AccountOpenQuestionBlockedJudgment;
  nextVerificationAction: string;
  evidenceRefs: JudgmentEvidenceRef[];
  confidence: number;
  provisional: boolean;
  updatedAt: string;
}

export interface OpenQuestionMemoryInput {
  id?: unknown;
  sourceId?: unknown;
  sourceKind?: unknown;
  sourceRecordId?: unknown;
  sourceTable?: unknown;
  sourceRowId?: unknown;
  title?: unknown;
  currentJudgment?: unknown;
  risk?: unknown;
  nextAction?: unknown;
  uncertainty?: unknown;
  confidence?: unknown;
  provisional?: unknown;
  evidenceRefs?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface BuildAccountOpenQuestionsParams {
  summary?: AccountMemorySummary | null;
  conflicts?: AccountMemoryConflict[] | null;
  timelineItems?: AccountTimelineItem[] | null;
  judgmentMemories?: OpenQuestionMemoryInput[] | null;
  stakeholderInterpretations?: StakeholderInterpretation[] | null;
  accountMomentum?: AccountMomentumSnapshot | null;
  updatedAt?: string;
  limit?: number;
}

type NormalizedMemory = {
  id: string;
  sourceId: string;
  sourceKind: string;
  sourceTable?: string;
  sourceRowId?: string;
  sourceRecordId?: string;
  title: string;
  currentJudgment: string;
  risk: string;
  nextAction: string;
  uncertainty: string;
  confidence: number | null;
  provisional: boolean;
  evidenceRefs: JudgmentEvidenceRef[];
  updatedAt: string;
};

type CandidateQuestion = Omit<AccountOpenQuestion, 'id'> & {
  idSeed: string;
  score: number;
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

const SOURCE_KIND_FALLBACK: Record<string, EvidenceSourceKind> = {
  decode: 'email_decode',
  rfp_analysis: 'source_record',
  strategic_play: 'strategic_play',
};

const RFP_RE = /rfp|投标|标书|bid|no_bid|cautious_bid|need_more_intel|评分|采购标准|竞对/i;
const RISK_RE = /风险|阻碍|blocker|blocking|冻结|压价|采购|legal|法务|预算不足|竞对|顾虑|risk|concern|competitor/i;
const MOMENTUM_RE = /动量|推进|停滞|降温|升温|延后|推迟|下一步|承诺|回复|demo|评审|momentum|stalled|cooling|heating/i;
const STAKEHOLDER_RE = /champion|sponsor|blocker|stakeholder|支持|反对|阻碍|立场|关键人|决策|CFO|CEO|采购|法务|技术|预算控制/i;
const BUDGET_RE = /预算|CFO|finance|经济买家|economic buyer|ROI|价格|报价|采购|procurement/i;
const DECISION_RE = /决策|审批|签字|拍板|decision|approval|CEO|CFO|COO|VP|总裁|负责人|高管/i;
const TECH_RE = /技术|安全|IT|集成|POC|pilot|demo|评估|security|technical/i;

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

function validIso(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

function latestIso(values: string[], fallback?: string): string {
  const valid = values
    .map((value) => validIso(value))
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return valid[0] ?? validIso(fallback) ?? new Date().toISOString();
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s·・.。,_:：-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'question';
}

function normalizeEvidenceRefs(value: unknown): JudgmentEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const sourceId = text(record.sourceId);
    const sourceKind = text(record.sourceKind) as EvidenceSourceKind;
    if (!sourceId || !EVIDENCE_SOURCE_KINDS.has(sourceKind)) return [];
    return [{
      sourceId,
      sourceKind,
      title: text(record.title) || undefined,
      sourceTable: text(record.sourceTable) || undefined,
      sourceRowId: text(record.sourceRowId) || undefined,
    } satisfies JudgmentEvidenceRef];
  });
}

function dedupeEvidence(refs: JudgmentEvidenceRef[], limit = 5): JudgmentEvidenceRef[] {
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

function normalizeMemory(input: OpenQuestionMemoryInput): NormalizedMemory | null {
  const sourceKind = text(input.sourceKind);
  const sourceId = text(input.sourceId) || text(input.id) || text(input.sourceRecordId);
  const title = compact(input.title, sourceKind || '判断来源');
  const currentJudgment = compact(input.currentJudgment);
  const risk = compact(input.risk);
  const nextAction = compact(input.nextAction);
  const uncertainty = compact(input.uncertainty);
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
  if (!sourceId && !currentJudgment && !risk && !nextAction && !uncertainty && evidenceRefs.length === 0) return null;

  const fallbackKind = SOURCE_KIND_FALLBACK[sourceKind];
  const sourceRecordId = text(input.sourceRecordId) || undefined;
  const fallbackEvidence = sourceId && fallbackKind ? [{
    sourceId: sourceRecordId ?? sourceId,
    sourceKind: fallbackKind,
    title,
    sourceTable: text(input.sourceTable) || undefined,
    sourceRowId: text(input.sourceRowId) || sourceRecordId || sourceId,
  } satisfies JudgmentEvidenceRef] : [];

  return {
    id: `${sourceKind || 'memory'}:${sourceId || title}`,
    sourceId,
    sourceKind,
    sourceTable: text(input.sourceTable) || undefined,
    sourceRowId: text(input.sourceRowId) || undefined,
    sourceRecordId,
    title,
    currentJudgment,
    risk,
    nextAction,
    uncertainty,
    confidence: normalizeConfidence(input.confidence),
    provisional: input.provisional === true,
    evidenceRefs: dedupeEvidence([...fallbackEvidence, ...evidenceRefs]),
    updatedAt: validIso(input.updatedAt) || validIso(input.createdAt),
  };
}

function stakeholderLabel(person?: AccountOpenQuestionWhoToAsk): string {
  if (!person?.name) return '待确认的负责人';
  return person.title ? `${person.name}（${person.title}）` : person.name;
}

function chooseWhoToAsk(params: {
  text: string;
  stakeholders: StakeholderInterpretation[];
  people: AccountMemorySummary['people'];
  contactIds?: string[];
}): AccountOpenQuestionWhoToAsk | undefined {
  const { text: rawText, stakeholders, people, contactIds = [] } = params;
  const lowered = rawText.toLowerCase();

  const byId = stakeholders.find((item) => contactIds.includes(item.contactId))
    ?? people.find((item) => contactIds.includes(item.contactId));
  if (byId) return { contactId: byId.contactId, name: byId.name, title: byId.title };

  const namedStakeholder = stakeholders.find((item) => item.name && lowered.includes(item.name.toLowerCase()));
  if (namedStakeholder) return { contactId: namedStakeholder.contactId, name: namedStakeholder.name, title: namedStakeholder.title };
  const namedPerson = people.find((item) => item.name && lowered.includes(item.name.toLowerCase()));
  if (namedPerson) return { contactId: namedPerson.contactId, name: namedPerson.name, title: namedPerson.title };

  const ranked = [...stakeholders].sort((a, b) => {
    const score = (item: StakeholderInterpretation) => {
      let value = 0;
      if (BUDGET_RE.test(rawText) && (item.role === 'decision_maker' || /cfo|finance|采购|procurement/i.test(`${item.title} ${item.name}`))) value += 8;
      if (DECISION_RE.test(rawText) && (item.role === 'decision_maker' || item.role === 'sponsor')) value += 7;
      if (TECH_RE.test(rawText) && item.role === 'evaluator') value += 7;
      if (RISK_RE.test(rawText) && (item.role === 'blocker' || item.stance === 'resistant' || item.stance === 'mixed')) value += 6;
      if (item.stance === 'mixed') value += 5;
      if (item.role === 'champion') value += 4;
      if (item.role === 'sponsor') value += 3;
      if (item.role === 'decision_maker') value += 3;
      if (item.stance === 'supportive') value += 1;
      return value;
    };
    return score(b) - score(a);
  });
  const top = ranked[0];
  if (top) return { contactId: top.contactId, name: top.name, title: top.title };

  const person = people.find((item) => item.stance === 'supportive') ?? people[0];
  return person ? { contactId: person.contactId, name: person.name, title: person.title } : undefined;
}

function blockedJudgmentFromText(rawText: string): AccountOpenQuestionBlockedJudgment {
  if (RFP_RE.test(rawText)) return 'rfp';
  if (STAKEHOLDER_RE.test(rawText)) return 'stakeholder';
  if (RISK_RE.test(rawText)) return 'risk';
  if (MOMENTUM_RE.test(rawText)) return 'momentum';
  return 'unknown';
}

function priorityFrom(params: { blockedJudgment: AccountOpenQuestionBlockedJudgment; severity?: string; confidence?: number | null; hasConflict?: boolean; text: string }): AccountOpenQuestionPriority {
  if (params.severity === 'high' || params.hasConflict || params.blockedJudgment === 'risk' || /冻结|反对|阻碍|预算|CFO|采购|legal|法务|竞对/i.test(params.text)) return 'high';
  if (params.severity === 'medium' || params.blockedJudgment === 'stakeholder' || params.blockedJudgment === 'momentum' || (params.confidence != null && params.confidence < 0.55)) return 'medium';
  return 'low';
}

function normalizePriorityScore(priority: AccountOpenQuestionPriority): number {
  if (priority === 'high') return 100;
  if (priority === 'medium') return 60;
  return 30;
}

function contactQuestionPrefix(who?: AccountOpenQuestionWhoToAsk): string {
  return who?.name ? `向 ${stakeholderLabel(who)} 确认` : '确认';
}

function buildQuestion(params: {
  who?: AccountOpenQuestionWhoToAsk;
  fact: string;
  blocker: AccountOpenQuestionBlockedJudgment;
  reason?: string;
}): string {
  const fact = compact(params.fact, '本账户缺少哪位客户方负责人能验证预算、决策链和下一步承诺');
  const reason = compact(params.reason);
  const blockerLabel: Record<AccountOpenQuestionBlockedJudgment, string> = {
    momentum: '账户动量',
    risk: '交易风险',
    stakeholder: '关键人判断',
    rfp: 'RFP 投标判断',
    unknown: '下一步推进判断',
  };
  return `${contactQuestionPrefix(params.who)}「${fact}」是否属实，因为${reason || `它会阻塞${blockerLabel[params.blocker]}。`}`;
}

function buildNextAction(who: AccountOpenQuestionWhoToAsk | undefined, fact: string, fallbackSource: string): string {
  const target = who?.name ? `向${who.name}` : '向账户负责人或最近互动联系人';
  return `${target}只确认一件事：${compact(fact, fallbackSource)}。拿到答复后，再更新联系人角色、风险或动量判断。`;
}

function isWeakQuestion(question: string): boolean {
  return /^(需要|需|继续|进一步|持续)(确认|跟进|校准|验证)/.test(question.trim()) || question.length < 18;
}

function addQuestion(candidates: CandidateQuestion[], candidate: CandidateQuestion) {
  const question = compact(candidate.question);
  if (!question || isWeakQuestion(question)) return;
  const key = normalizeKey(`${candidate.blockedJudgment}:${question}`);
  if (candidates.some((item) => normalizeKey(`${item.blockedJudgment}:${item.question}`) === key)) return;
  candidates.push({
    ...candidate,
    question,
    evidenceRefs: dedupeEvidence(candidate.evidenceRefs, 4),
    confidence: clamp01(Number(candidate.confidence.toFixed(2))),
  });
}

function tensionFact(tension: string): string {
  const cleaned = compact(tension);
  if (!cleaned) return '当前最大账户张力对应的真实阻碍点是什么';
  if (/是否|能否|有没有|哪位|谁/.test(cleaned)) return cleaned;
  return cleaned.length > 80 ? `${cleaned.slice(0, 78)}…` : cleaned;
}

function evidenceFromTimeline(items: AccountTimelineItem[], rawText: string, limit = 2): JudgmentEvidenceRef[] {
  const textKey = rawText.toLowerCase();
  return items
    .filter((item) => item.title || item.summary)
    .sort((a, b) => {
      const score = (item: AccountTimelineItem) => {
        const haystack = `${item.title} ${item.summary}`.toLowerCase();
        let value = item.signal === 'risk' ? 2 : 0;
        for (const token of textKey.split(/\s+/).filter((part) => part.length >= 3).slice(0, 6)) {
          if (haystack.includes(token)) value += 1;
        }
        return value;
      };
      return score(b) - score(a);
    })
    .slice(0, limit)
    .map((item) => ({ sourceId: item.sourceId, sourceKind: item.sourceKind, title: item.title, sourceRowId: item.sourceId } satisfies JudgmentEvidenceRef));
}

export function buildAccountOpenQuestions(params: BuildAccountOpenQuestionsParams): AccountOpenQuestion[] {
  const summary = params.summary ?? null;
  const conflicts = (params.conflicts ?? []).filter((item) => item.status !== 'resolved');
  const timelineItems = params.timelineItems ?? [];
  const memories = (params.judgmentMemories ?? [])
    .map(normalizeMemory)
    .filter((item): item is NormalizedMemory => Boolean(item))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  const stakeholders = params.stakeholderInterpretations ?? [];
  const people = summary?.people ?? [];
  const candidates: CandidateQuestion[] = [];
  const updatedAt = latestIso([
    params.updatedAt ?? '',
    summary?.lastComputedAt ?? '',
    params.accountMomentum?.updatedAt ?? '',
    stakeholders[0]?.updatedAt ?? '',
    memories[0]?.updatedAt ?? '',
    timelineItems[0]?.occurredAt ?? '',
  ]);

  for (const conflict of conflicts.slice(0, 5)) {
    const fact = compact(conflict.summary, '两条客户信号互相冲突，真实状态需要指定一位客户方负责人判定');
    const who = chooseWhoToAsk({ text: fact, stakeholders, people, contactIds: conflict.involvedContactIds });
    const blockedJudgment = blockedJudgmentFromText(`${conflict.kind ?? ''} ${fact}`);
    const priority = priorityFrom({ blockedJudgment, severity: conflict.severity, hasConflict: true, text: fact });
    const evidenceRefs = dedupeEvidence([
      ...conflict.sourceIds.map((sourceId) => ({ sourceId, sourceKind: 'source_record' as const, title: '矛盾来源', sourceRowId: sourceId })),
      ...evidenceFromTimeline(timelineItems, fact),
    ]);
    addQuestion(candidates, {
      idSeed: `conflict:${conflict.id}`,
      question: buildQuestion({ who, fact, blocker: blockedJudgment, reason: `这条矛盾会让${blockedJudgment === 'stakeholder' ? '关键人立场' : blockedJudgment === 'rfp' ? '投标/放弃' : blockedJudgment === 'momentum' ? '推进节奏' : '风险优先级'}判断失真。` }),
      priority,
      whyItMatters: `当前存在未解决矛盾：${fact}。不先判定真假，系统会把相反信号同时计入判断。`,
      whoToAsk: who,
      blockedJudgment,
      nextVerificationAction: buildNextAction(who, fact, '请对方指出哪条说法仍然有效'),
      evidenceRefs,
      confidence: priority === 'high' ? 0.78 : 0.64,
      provisional: true,
      updatedAt: validIso(conflict.detectedAt) || updatedAt,
      score: normalizePriorityScore(priority) + 20 + evidenceRefs.length,
    });
  }

  for (const stakeholder of stakeholders.filter((item) => item.stance === 'mixed' || item.provisional || item.role === 'unknown').slice(0, 5)) {
    const fact = stakeholder.stance === 'mixed'
      ? `${stakeholder.name} 到底是支持推进，还是正在保留/阻碍关键承诺`
      : stakeholder.role === 'unknown'
        ? `${stakeholder.name} 在本交易中负责决策、评估、采购还是只提供信息`
        : `${stakeholder.name} 的 ${stakeholder.role} 判断是否仍成立，尤其是 ${compact(stakeholder.uncertainty || stakeholder.nextAction, '支持边界和下一步承诺')}`;
    const who = { contactId: stakeholder.contactId, name: stakeholder.name, title: stakeholder.title };
    const priority = stakeholder.stance === 'mixed' ? 'high' : 'medium';
    addQuestion(candidates, {
      idSeed: `stakeholder:${stakeholder.contactId}:${stakeholder.stance}:${stakeholder.role}`,
      question: buildQuestion({ who, fact, blocker: 'stakeholder', reason: '它决定我们该把此人当内部推动者、评估者还是风险来源。' }),
      priority,
      whyItMatters: stakeholder.uncertainty
        ? `${stakeholder.name} 的判断带不确定性：${compact(stakeholder.uncertainty)}。`
        : `${stakeholder.name} 的角色/立场仍是临时判断，错误分类会导致下一步找错人。`,
      whoToAsk: who,
      blockedJudgment: 'stakeholder',
      nextVerificationAction: buildNextAction(who, fact, '请对方明确自己能推动哪一步、不能承诺哪一步'),
      evidenceRefs: stakeholder.evidenceRefs,
      confidence: Math.max(0.42, Math.min(0.72, stakeholder.confidence)),
      provisional: true,
      updatedAt: validIso(stakeholder.updatedAt) || updatedAt,
      score: normalizePriorityScore(priority) + (stakeholder.stance === 'mixed' ? 14 : 6) + stakeholder.evidenceRefs.length,
    });
  }

  for (const tension of (summary?.tensions ?? []).slice(0, 6)) {
    const fact = tensionFact(tension);
    const who = chooseWhoToAsk({ text: fact, stakeholders, people });
    const blockedJudgment = blockedJudgmentFromText(fact);
    const priority = priorityFrom({ blockedJudgment, text: fact, confidence: summary?.confidence });
    const evidenceRefs = evidenceFromTimeline([...(summary?.timelineHighlights ?? []), ...timelineItems], fact, 3);
    addQuestion(candidates, {
      idSeed: `tension:${fact}`,
      question: buildQuestion({ who, fact, blocker: blockedJudgment, reason: `这是当前账户张力，未验证前不能把它当成已解决背景。` }),
      priority,
      whyItMatters: `张力不是脏数据：${fact}。它会影响${blockedJudgment === 'risk' ? '风险排序' : blockedJudgment === 'stakeholder' ? '关键人判断' : blockedJudgment === 'rfp' ? '投标策略' : '推进节奏'}。`,
      whoToAsk: who,
      blockedJudgment,
      nextVerificationAction: buildNextAction(who, fact, '请对方给出当前有效口径和下一步责任人'),
      evidenceRefs,
      confidence: Math.max(0.38, Math.min(0.68, (summary?.confidence ?? 0.45) - 0.03)),
      provisional: true,
      updatedAt,
      score: normalizePriorityScore(priority) + evidenceRefs.length,
    });
  }

  const riskyMemories = memories.filter((memory) => memory.uncertainty || memory.provisional || RISK_RE.test(`${memory.risk} ${memory.currentJudgment}`) || RFP_RE.test(`${memory.title} ${memory.risk} ${memory.uncertainty}`));
  for (const memory of riskyMemories.slice(0, 5)) {
    const raw = memory.uncertainty || memory.risk || memory.currentJudgment || memory.nextAction;
    const fact = compact(raw, `${memory.title} 中的风险口径是否仍然有效`);
    const who = chooseWhoToAsk({ text: `${memory.title} ${fact}`, stakeholders, people });
    const blockedJudgment = blockedJudgmentFromText(`${memory.sourceKind} ${memory.title} ${fact}`);
    const priority = priorityFrom({ blockedJudgment, confidence: memory.confidence, text: fact });
    addQuestion(candidates, {
      idSeed: `memory:${memory.id}:${fact}`,
      question: buildQuestion({ who, fact, blocker: blockedJudgment, reason: `这条判断来自 ${memory.title}，但仍有未验证口径。` }),
      priority,
      whyItMatters: `判断来源“${memory.title}”留下待验证点：${fact}。如果放任它成为背景，会生成空泛或错误建议。`,
      whoToAsk: who,
      blockedJudgment,
      nextVerificationAction: memory.nextAction && !/进一步|持续|继续|校准/.test(memory.nextAction)
        ? memory.nextAction
        : buildNextAction(who, fact, '请客户确认该风险是否仍存在'),
      evidenceRefs: memory.evidenceRefs,
      confidence: Math.max(0.34, Math.min(0.7, memory.confidence ?? 0.48)),
      provisional: true,
      updatedAt: validIso(memory.updatedAt) || updatedAt,
      score: normalizePriorityScore(priority) + (memory.provisional ? 8 : 0) + memory.evidenceRefs.length,
    });
  }

  const momentum = params.accountMomentum;
  if (momentum && (momentum.status === 'risk_rising' || momentum.status === 'stalled' || momentum.status === 'mixed' || momentum.status === 'cooling')) {
    const fact = momentum.biggestTension || momentum.currentJudgment || momentum.nextAction;
    const who = chooseWhoToAsk({ text: fact, stakeholders, people });
    const blockedJudgment: AccountOpenQuestionBlockedJudgment = momentum.status === 'risk_rising' ? 'risk' : 'momentum';
    const priority: AccountOpenQuestionPriority = momentum.status === 'risk_rising' || momentum.status === 'mixed' ? 'high' : 'medium';
    addQuestion(candidates, {
      idSeed: `momentum:${momentum.status}:${fact}`,
      question: buildQuestion({ who, fact, blocker: blockedJudgment, reason: `当前动量是“${momentum.status}”，最大张力会决定是推进、降速还是先排雷。` }),
      priority,
      whyItMatters: `动量判断显示“${momentum.currentJudgment}”；若不验证“${compact(fact)}”，下一步动作可能只是在制造活动量。`,
      whoToAsk: who,
      blockedJudgment,
      nextVerificationAction: momentum.nextAction && !/进一步|持续|继续|校准/.test(momentum.nextAction)
        ? momentum.nextAction
        : buildNextAction(who, fact, '请客户明确下一步时间、参与人和产出'),
      evidenceRefs: momentum.evidenceRefs,
      confidence: Math.max(0.36, Math.min(0.74, momentum.confidence)),
      provisional: momentum.provisional,
      updatedAt: validIso(momentum.updatedAt) || updatedAt,
      score: normalizePriorityScore(priority) + 10 + momentum.evidenceRefs.length,
    });
  }

  if (candidates.length === 0) {
    const who = chooseWhoToAsk({ text: '预算控制者 最终拍板人 下一步承诺', stakeholders, people });
    const fallbackFact = who?.name
      ? `${stakeholderLabel(who)} 是否能指出本账户的预算控制者、最终拍板人和下一步承诺日期`
      : '本账户的预算控制者、最终拍板人和下一步承诺日期分别是谁/是什么';
    addQuestion(candidates, {
      idSeed: 'fallback:missing-account-verification-map',
      question: buildQuestion({ who, fact: fallbackFact, blocker: 'unknown', reason: '当前缺少联系人立场、矛盾或时间线证据，系统无法判断该问谁推进。' }),
      priority: 'medium',
      whyItMatters: '当前缺少可用的张力、矛盾、时间线或判断来源；先补一条决策链事实，后续判断才不会停留在占位摘要。',
      whoToAsk: who,
      blockedJudgment: 'unknown',
      nextVerificationAction: buildNextAction(who, fallbackFact, '请对方补齐决策链和下一步日期'),
      evidenceRefs: [],
      confidence: 0.28,
      provisional: true,
      updatedAt,
      score: 40,
    });
  }

  const seen = new Set<string>();
  return candidates
    .sort((a, b) => b.score - a.score || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter((item) => {
      const key = normalizeKey(item.question.replace(/向 .*? 确认/, '确认'));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, params.limit ?? 5)
    .map((item, index) => ({
      id: `oq_${index + 1}_${normalizeKey(item.idSeed)}`,
      question: item.question,
      priority: item.priority,
      whyItMatters: item.whyItMatters,
      whoToAsk: item.whoToAsk,
      blockedJudgment: item.blockedJudgment,
      nextVerificationAction: item.nextVerificationAction,
      evidenceRefs: item.evidenceRefs,
      confidence: item.confidence,
      provisional: item.provisional,
      updatedAt: item.updatedAt,
    }));
}
