import type { AccountMemoryPerson, AccountTimelineItem, ContactRole, EvidenceSourceKind, JudgmentEvidenceRef } from '@/lib/babel-engine/types';

export type StakeholderRole = 'champion' | 'blocker' | 'evaluator' | 'decision_maker' | 'sponsor' | 'unknown';
export type StakeholderStance = 'supportive' | 'resistant' | 'neutral' | 'mixed' | 'unknown';
export type StakeholderRelationshipDistance = 'close' | 'warm' | 'distant' | 'unknown';

export interface StakeholderInterpretation {
  contactId: string;
  name: string;
  title?: string;
  role: StakeholderRole;
  stance: StakeholderStance;
  relationshipDistance: StakeholderRelationshipDistance;
  confidence: number;
  provisional: boolean;
  whyThisRole: string;
  uncertainty?: string;
  nextAction: string;
  evidenceRefs: JudgmentEvidenceRef[];
  updatedAt: string;
}

export interface StakeholderContactInput {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  role?: unknown;
  jobLevel?: unknown;
  job_level?: unknown;
  relationshipStrength?: unknown;
  relationship_strength?: unknown;
  lastContactedAt?: unknown;
  last_contacted_at?: unknown;
  roleConfidence?: unknown;
  role_confidence?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  attitudeTrend?: unknown;
  attitude_trend?: unknown;
}

export interface StakeholderMemoryInput {
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

export interface StakeholderActivityInput {
  id?: unknown;
  sourceId?: unknown;
  sourceKind?: unknown;
  title?: unknown;
  summary?: unknown;
  occurredAt?: unknown;
  signal?: unknown;
  contactId?: unknown;
  contactName?: unknown;
  contactTitle?: unknown;
  contactRole?: unknown;
}

export interface BuildStakeholderInterpretationsParams {
  contacts?: StakeholderContactInput[] | null;
  judgmentMemories?: StakeholderMemoryInput[] | null;
  recentActivities?: StakeholderActivityInput[] | AccountTimelineItem[] | null;
  summaryPeople?: AccountMemoryPerson[] | null;
  updatedAt?: string;
  limit?: number;
}

type NormalizedContact = {
  id: string;
  name: string;
  title: string;
  role: ContactRole | '';
  jobLevel: number | null;
  relationshipStrength: number | null;
  lastContactedAt: string;
  roleConfidence: number | null;
  updatedAt: string;
  attitudeText: string;
};

type NormalizedPerson = {
  contactId: string;
  name: string;
  title: string;
  role: ContactRole | '';
  influenceLabel: string;
  stance: AccountMemoryPerson['stance'] | '';
  summary: string;
  sourceIds: string[];
};

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

type NormalizedActivity = {
  id: string;
  sourceId: string;
  sourceKind: EvidenceSourceKind;
  title: string;
  summary: string;
  occurredAt: string;
  signal: 'positive' | 'neutral' | 'risk';
  contactId: string;
  contactName: string;
  contactTitle: string;
  contactRole: ContactRole | '';
};

type Candidate = {
  contactId: string;
  name: string;
  title: string;
  contact?: NormalizedContact;
  person?: NormalizedPerson;
  memories: NormalizedMemory[];
  activities: NormalizedActivity[];
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

const VALID_CONTACT_ROLES = new Set<ContactRole>([
  'decision_maker',
  'economic_buyer',
  'champion',
  'technical_evaluator',
  'influencer',
  'external_advisor',
  'consultant',
  'channel_influencer',
  'blocker',
  'end_user',
  'procurement',
  'legal',
  'project_manager',
  'executive_sponsor',
  'gate_keeper',
  'coach',
  'committee_member',
  'it_admin',
  'operations',
  'finance',
  'contact',
  'unknown',
]);

const SOURCE_KIND_FALLBACK: Record<string, EvidenceSourceKind> = {
  decode: 'email_decode',
  rfp_analysis: 'source_record',
  strategic_play: 'strategic_play',
};

const ROLE_WEIGHT: Record<StakeholderRole, number> = {
  champion: 0,
  blocker: 0,
  evaluator: 0,
  decision_maker: 0,
  sponsor: 0,
  unknown: 0,
};

const CHAMPION_RE = /champion|coach|advocate|支持者|支持|推动|推进|内部推动|愿意帮|愿意牵头|认可价值|champion strength/i;
const BLOCKER_RE = /blocker|blocking|阻碍|反对|抵触|不支持|压价|冻结|预算不足|采购卡|顾虑强|拒绝|放弃|risk|风险/i;
const EVALUATOR_RE = /evaluator|technical|IT|security|评估|技术|测试|审查|POC|pilot|demo|方案评审|安全|集成|使用者|end user/i;
const DECISION_RE = /decision.?maker|economic buyer|决策|批准|审批|签字|预算|CFO|CEO|采购负责人|最终拍板|decision|approval|finance|procurement/i;
const SPONSOR_RE = /sponsor|executive sponsor|高管支持|高层|VP|SVP|CRO|COO|CTO|CIO|CMO|Chief|总裁|副总|负责人|赞助人/i;
const SUPPORTIVE_RE = /supportive|supports?|支持|认可|积极|愿意|推进|承诺|确认下一步|champion|sponsor|positive|warming|赞同/i;
const RESISTANT_RE = /resistant|blocking|blocker|反对|阻碍|抵触|顾虑|压价|冻结|降温|推迟|拒绝|风险|竞对|negative|cooling|no[_ -]?bid/i;
const NEUTRAL_RE = /neutral|中立|观望|待定|评估中|unclear|unknown|不明|待验证/i;
const CLOSE_RE = /close|trusted|strong relationship|关系近|信任|熟悉|密切|直接沟通/i;

const CONTACT_ROLE_VISIBLE_LABELS: Record<string, string> = {
  champion: '内部推动者',
  blocker: '阻力点',
  evaluator: '评估者',
  technical_evaluator: '技术评估人',
  decision_maker: '决策人',
  economic_buyer: '预算负责人',
  executive_sponsor: '高层支持者',
  sponsor: '高层支持者',
  procurement: '采购流程负责人',
  legal: '法务把关人',
  finance: '预算把关人',
  influencer: '影响者',
  coach: '内线教练',
  gate_keeper: '入口把关人',
};

function visibleContactRole(rawRole: unknown): string {
  const value = typeof rawRole === 'string' ? rawRole.trim() : '';
  return CONTACT_ROLE_VISIBLE_LABELS[value] ?? '角色待验证';
}
const WARM_RE = /warm|关系暖|有联系|有互动|回应|reply|engaged|正常沟通/i;
const DISTANT_RE = /distant|cold|冷淡|疏远|未回复|无回应|失联|ghost|很少互动/i;
const TENSION_RE = /但|however|矛盾|张力|不确定|uncertain|unclear|待验证|conflict|contradiction|mixed|一方面|另一方面/i;

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

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s·・.。,_-]+/g, ' ').trim();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function normalizeConfidence(value: unknown): number | null {
  const number = normalizeNumber(value);
  if (number == null) return null;
  return clamp01(number > 1 ? number / 100 : number);
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

function normalizeRole(value: unknown): ContactRole | '' {
  const role = text(value) as ContactRole;
  return VALID_CONTACT_ROLES.has(role) ? role : '';
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

function normalizeContact(input: StakeholderContactInput): NormalizedContact | null {
  const id = text(input.id);
  const name = compact(input.name);
  if (!id && !name) return null;
  return {
    id: id || `contact:${normalizeKey(name)}`,
    name: name || '未知联系人',
    title: compact(input.title),
    role: normalizeRole(input.role),
    jobLevel: normalizeNumber(input.jobLevel) ?? normalizeNumber(input.job_level),
    relationshipStrength: normalizeNumber(input.relationshipStrength) ?? normalizeNumber(input.relationship_strength),
    lastContactedAt: validIso(input.lastContactedAt) || validIso(input.last_contacted_at),
    roleConfidence: normalizeConfidence(input.roleConfidence) ?? normalizeConfidence(input.role_confidence),
    updatedAt: validIso(input.updatedAt) || validIso(input.updated_at),
    attitudeText: JSON.stringify(input.attitudeTrend ?? input.attitude_trend ?? '').slice(0, 400),
  };
}

function normalizePerson(input: AccountMemoryPerson): NormalizedPerson | null {
  const contactId = text(input.contactId);
  const name = compact(input.name);
  if (!contactId && !name) return null;
  const stance = input.stance === 'supportive' || input.stance === 'neutral' || input.stance === 'unclear' || input.stance === 'blocking' ? input.stance : '';
  return {
    contactId: contactId || `person:${normalizeKey(name)}`,
    name: name || '未知联系人',
    title: compact(input.title),
    role: normalizeRole(input.role),
    influenceLabel: compact(input.influenceLabel),
    stance,
    summary: compact(input.summary),
    sourceIds: Array.isArray(input.sourceIds) ? input.sourceIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : [],
  };
}

function normalizeMemory(input: StakeholderMemoryInput): NormalizedMemory | null {
  const sourceKind = text(input.sourceKind);
  const sourceId = text(input.sourceId) || text(input.id) || text(input.sourceRecordId);
  const title = compact(input.title, sourceKind || '判断来源');
  const currentJudgment = compact(input.currentJudgment);
  const risk = compact(input.risk);
  const nextAction = compact(input.nextAction);
  const uncertainty = compact(input.uncertainty);
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs);
  if (!sourceId && !currentJudgment && !risk && !nextAction && evidenceRefs.length === 0) return null;

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
    sourceRecordId,
    sourceTable: text(input.sourceTable) || undefined,
    sourceRowId: text(input.sourceRowId) || undefined,
    title,
    currentJudgment,
    risk,
    nextAction,
    uncertainty,
    confidence: normalizeConfidence(input.confidence),
    provisional: input.provisional === true,
    evidenceRefs: [...fallbackEvidence, ...evidenceRefs],
    updatedAt: validIso(input.updatedAt) || validIso(input.createdAt),
  };
}

function normalizeActivity(input: StakeholderActivityInput | AccountTimelineItem): NormalizedActivity | null {
  const sourceKindRaw = text(input.sourceKind) as EvidenceSourceKind;
  const sourceKind = EVIDENCE_SOURCE_KINDS.has(sourceKindRaw) ? sourceKindRaw : 'source_record';
  const sourceId = text(input.sourceId) || text(input.id);
  const title = compact(input.title, '账户活动');
  const summary = compact(input.summary);
  const signal = input.signal === 'positive' || input.signal === 'risk' || input.signal === 'neutral' ? input.signal : 'neutral';
  if (!sourceId && !summary && !title) return null;
  return {
    id: text(input.id) || sourceId || title,
    sourceId: sourceId || text(input.id) || title,
    sourceKind,
    title,
    summary,
    occurredAt: validIso(input.occurredAt),
    signal,
    contactId: text((input as StakeholderActivityInput).contactId),
    contactName: compact((input as StakeholderActivityInput).contactName),
    contactTitle: compact((input as StakeholderActivityInput).contactTitle),
    contactRole: normalizeRole((input as StakeholderActivityInput).contactRole),
  };
}

function roleFromContactRole(role: ContactRole | ''): StakeholderRole {
  switch (role) {
    case 'champion':
    case 'coach':
      return 'champion';
    case 'blocker':
      return 'blocker';
    case 'technical_evaluator':
    case 'external_advisor':
    case 'consultant':
    case 'channel_influencer':
    case 'committee_member':
    case 'it_admin':
    case 'end_user':
      return 'evaluator';
    case 'decision_maker':
    case 'economic_buyer':
    case 'procurement':
    case 'legal':
    case 'finance':
      return 'decision_maker';
    case 'executive_sponsor':
      return 'sponsor';
    default:
      return 'unknown';
  }
}

function scoreRoleFromText(scores: Record<StakeholderRole, number>, raw: string, weight: number) {
  if (!raw) return;
  if (CHAMPION_RE.test(raw)) scores.champion += weight;
  if (BLOCKER_RE.test(raw)) scores.blocker += weight;
  if (EVALUATOR_RE.test(raw)) scores.evaluator += weight;
  if (DECISION_RE.test(raw)) scores.decision_maker += weight;
  if (SPONSOR_RE.test(raw)) scores.sponsor += weight;
}

function inferRole(candidate: Candidate): { role: StakeholderRole; why: string; roleSignals: string[]; tension: boolean } {
  const scores = { ...ROLE_WEIGHT };
  const roleSignals: string[] = [];
  const directRole = roleFromContactRole(candidate.contact?.role || candidate.person?.role || '');
  if (directRole !== 'unknown') {
    scores[directRole] += 3;
    roleSignals.push(`联系人资料显示为${visibleContactRole(candidate.contact?.role || candidate.person?.role)}`);
  }

  const titleText = `${candidate.title} ${candidate.name}`;
  scoreRoleFromText(scores, titleText, 1.1);
  if (SPONSOR_RE.test(titleText) || DECISION_RE.test(titleText) || EVALUATOR_RE.test(titleText)) roleSignals.push(`职位信号：${candidate.title || candidate.name}`);

  const jobLevel = candidate.contact?.jobLevel;
  if (jobLevel != null && jobLevel >= 4) {
    scores.sponsor += 1.2;
    roleSignals.push('组织层级接近高管');
  } else if (jobLevel != null && jobLevel >= 3) {
    scores.decision_maker += 0.8;
  }

  const personText = [candidate.person?.influenceLabel, candidate.person?.summary].filter(Boolean).join(' ');
  scoreRoleFromText(scores, personText, 1.4);
  if (personText) roleSignals.push(candidate.person?.influenceLabel || candidate.person?.summary || '人物摘要信号');

  for (const memory of candidate.memories.slice(0, 4)) {
    scoreRoleFromText(scores, `${memory.title} ${memory.currentJudgment} ${memory.risk} ${memory.nextAction}`, 0.9);
  }
  for (const activity of candidate.activities.slice(0, 4)) {
    scoreRoleFromText(scores, `${activity.title} ${activity.summary}`, 0.7);
    const activityRole = roleFromContactRole(activity.contactRole);
    if (activityRole !== 'unknown') scores[activityRole] += 0.6;
  }

  const ranked = (Object.keys(scores) as StakeholderRole[])
    .filter((role) => role !== 'unknown')
    .sort((a, b) => scores[b] - scores[a]);
  const top = ranked[0] ?? 'unknown';
  const runnerUp = ranked[1];
  const topScore = scores[top] ?? 0;
  const tension = topScore > 0 && Boolean(runnerUp) && scores[runnerUp] > 0 && topScore - scores[runnerUp] < 0.8;
  const role = topScore >= 1.1 ? top : 'unknown';
  const why = role === 'unknown'
    ? '现有证据不足以稳定判断此人在交易叙事中的角色。'
    : roleSignals[0] || '由联系人字段与近期判断信号共同推断。';
  return { role, why, roleSignals, tension };
}

function inferStance(candidate: Candidate): { stance: StakeholderStance; tension: boolean; signals: string[] } {
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  const signals: string[] = [];

  if (candidate.person?.stance === 'supportive') { positive += 2; signals.push('人物记忆显示支持'); }
  if (candidate.person?.stance === 'blocking') { negative += 2; signals.push('人物记忆显示阻碍'); }
  if (candidate.person?.stance === 'neutral') { neutral += 1; signals.push('人物记忆显示中立'); }
  const crmRole = roleFromContactRole(candidate.contact?.role || candidate.person?.role || '');
  if (crmRole === 'champion' || crmRole === 'sponsor') positive += 0.8;
  if (crmRole === 'blocker') negative += 0.8;

  const texts = [
    candidate.person?.summary,
    candidate.contact?.attitudeText,
    ...candidate.memories.flatMap((memory) => [memory.title, memory.currentJudgment, memory.risk, memory.nextAction, memory.uncertainty]),
    ...candidate.activities.flatMap((activity) => [activity.title, activity.summary]),
  ].filter(Boolean).join(' ');

  if (SUPPORTIVE_RE.test(texts)) positive += 1;
  if (RESISTANT_RE.test(texts)) negative += 1;
  if (NEUTRAL_RE.test(texts)) neutral += 0.6;
  for (const activity of candidate.activities) {
    if (activity.signal === 'positive') positive += 0.4;
    if (activity.signal === 'risk') negative += 0.4;
  }

  if (positive > 0 && negative > 0) {
    if (crmRole === 'blocker' && negative >= positive) return { stance: 'resistant', tension: true, signals };
    if (positive - negative >= 1.2) return { stance: 'supportive', tension: true, signals };
    if (negative - positive >= 1.2) return { stance: 'resistant', tension: true, signals };
    return { stance: 'mixed', tension: true, signals };
  }
  if (positive > 0) return { stance: 'supportive', tension: false, signals };
  if (negative > 0) return { stance: 'resistant', tension: false, signals };
  if (neutral > 0) return { stance: 'neutral', tension: false, signals };
  return { stance: 'unknown', tension: false, signals };
}

function daysSince(iso: string): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function inferRelationshipDistance(candidate: Candidate): StakeholderRelationshipDistance {
  const strength = candidate.contact?.relationshipStrength;
  if (strength != null) {
    if (strength >= 70) return 'close';
    if (strength >= 35) return 'warm';
    return 'distant';
  }
  const texts = [candidate.person?.summary, candidate.person?.influenceLabel, ...candidate.activities.map((a) => `${a.title} ${a.summary}`)].join(' ');
  if (CLOSE_RE.test(texts)) return 'close';
  if (WARM_RE.test(texts)) return 'warm';
  if (DISTANT_RE.test(texts)) return 'distant';

  const lastContactedDays = daysSince(candidate.contact?.lastContactedAt ?? '');
  if (lastContactedDays != null) {
    if (lastContactedDays <= 14) return 'close';
    if (lastContactedDays <= 60) return 'warm';
    if (lastContactedDays > 90) return 'distant';
  }
  return 'unknown';
}

function buildEvidenceRefs(candidate: Candidate): JudgmentEvidenceRef[] {
  const refs: JudgmentEvidenceRef[] = [];
  candidate.person?.sourceIds.forEach((sourceId) => refs.push({ sourceId, sourceKind: 'source_record', title: '人物记忆来源' }));
  candidate.memories.forEach((memory) => refs.push(...memory.evidenceRefs));
  candidate.activities.forEach((activity) => refs.push({
    sourceId: activity.sourceId,
    sourceKind: activity.sourceKind,
    title: activity.title,
  }));
  return dedupeEvidence(refs);
}

function nextActionFor(interp: Pick<StakeholderInterpretation, 'role' | 'stance' | 'relationshipDistance'>, candidate: Candidate): string {
  const memoryNextAction = candidate.memories.map((memory) => memory.nextAction).find(Boolean);
  if (memoryNextAction) return memoryNextAction;
  if (interp.stance === 'mixed') return '先确认此人的真实顾虑与支持边界，避免把矛盾信号抹平。';
  switch (interp.role) {
    case 'champion':
      return '请 TA 帮忙补全内部决策地图，并确认谁会阻碍下一步。';
    case 'blocker':
      return '单独澄清反对点，把顾虑拆成可验证的预算、风险或流程问题。';
    case 'evaluator':
      return '给出评估标准、技术证据和下一次验证材料。';
    case 'decision_maker':
      return '对齐商业价值、预算口径和最终批准时间线。';
    case 'sponsor':
      return '用高层语言确认战略优先级，并请求为内部推进背书。';
    default:
      return '下一步先确认此人在交易中的角色、立场和影响范围。';
  }
}

function buildUncertainty(params: {
  role: StakeholderRole;
  stance: StakeholderStance;
  relationshipDistance: StakeholderRelationshipDistance;
  roleTension: boolean;
  stanceTension: boolean;
  candidate: Candidate;
}): string | undefined {
  const notes: string[] = [];
  if (params.role === 'unknown') notes.push('角色仍未被证据稳定确认');
  if (params.stance === 'unknown') notes.push('态度信号不足');
  if (params.relationshipDistance === 'unknown') notes.push('关系距离缺少直接证据');
  if (params.roleTension) notes.push('角色信号存在张力，可能同时承担多种内部角色');
  if (params.stanceTension || params.stance === 'mixed') notes.push('支持与阻碍信号并存，暂按立场摇摆处理');
  const explicitUncertainty = params.candidate.memories.map((memory) => memory.uncertainty).find(Boolean);
  if (explicitUncertainty) notes.push(explicitUncertainty);
  const tensionText = [params.candidate.person?.summary, ...params.candidate.memories.map((memory) => `${memory.currentJudgment} ${memory.risk} ${memory.uncertainty}`)].join(' ');
  if (TENSION_RE.test(tensionText) && notes.length === 0) notes.push('当前叙事中存在待验证张力');
  return notes.length > 0 ? Array.from(new Set(notes)).slice(0, 3).join('；') : undefined;
}

function calculateConfidence(params: {
  role: StakeholderRole;
  stance: StakeholderStance;
  relationshipDistance: StakeholderRelationshipDistance;
  candidate: Candidate;
  evidenceCount: number;
  hasUncertainty: boolean;
}): number {
  let confidence = 0.24;
  if (params.candidate.contact) confidence += 0.12;
  if (params.candidate.person) confidence += 0.12;
  confidence += Math.min(0.18, params.evidenceCount * 0.04);
  if (params.role !== 'unknown') confidence += 0.16;
  if (params.stance !== 'unknown') confidence += params.stance === 'mixed' ? 0.08 : 0.14;
  if (params.relationshipDistance !== 'unknown') confidence += 0.08;
  const memoryConfidence = params.candidate.memories.map((memory) => memory.confidence).find((value): value is number => value != null);
  if (memoryConfidence != null) confidence = (confidence + memoryConfidence) / 2;
  if (params.candidate.contact?.roleConfidence != null) confidence = (confidence + params.candidate.contact.roleConfidence) / 2 + 0.04;
  if (params.hasUncertainty) confidence -= 0.06;
  return Math.round(clamp01(confidence) * 100) / 100;
}

function matchCandidateText(candidate: Candidate, textValue: string): boolean {
  const raw = normalizeKey(textValue);
  if (!raw) return false;
  const name = normalizeKey(candidate.name);
  const title = normalizeKey(candidate.title);
  return Boolean(
    (name && raw.includes(name))
    || (title && title.length >= 3 && raw.includes(title))
    || (candidate.contactId && raw.includes(normalizeKey(candidate.contactId)))
  );
}

function upsertCandidate(candidates: Map<string, Candidate>, key: string, patch: Partial<Candidate> & Pick<Candidate, 'contactId' | 'name'>) {
  const existing = candidates.get(key);
  if (!existing) {
    candidates.set(key, {
      contactId: patch.contactId,
      name: patch.name,
      title: patch.title ?? '',
      contact: patch.contact,
      person: patch.person,
      memories: patch.memories ?? [],
      activities: patch.activities ?? [],
    });
    return;
  }
  existing.contactId = existing.contactId || patch.contactId;
  existing.name = existing.name || patch.name;
  existing.title = existing.title || patch.title || existing.contact?.title || existing.person?.title || '';
  existing.contact = existing.contact ?? patch.contact;
  existing.person = existing.person ?? patch.person;
  existing.memories.push(...(patch.memories ?? []));
  existing.activities.push(...(patch.activities ?? []));
}

export function buildStakeholderInterpretations(params: BuildStakeholderInterpretationsParams = {}): StakeholderInterpretation[] {
  const contacts = (params.contacts ?? []).map(normalizeContact).filter((item): item is NormalizedContact => Boolean(item));
  const people = (params.summaryPeople ?? []).map(normalizePerson).filter((item): item is NormalizedPerson => Boolean(item));
  const memories = (params.judgmentMemories ?? []).map(normalizeMemory).filter((item): item is NormalizedMemory => Boolean(item));
  const activities = (params.recentActivities ?? []).map(normalizeActivity).filter((item): item is NormalizedActivity => Boolean(item));
  const candidates = new Map<string, Candidate>();
  const aliases = new Map<string, string>();

  for (const contact of contacts) {
    const key = contact.id;
    upsertCandidate(candidates, key, { contactId: contact.id, name: contact.name, title: contact.title, contact });
    aliases.set(contact.id, key);
    aliases.set(normalizeKey(contact.name), key);
  }

  for (const person of people) {
    const alias = aliases.get(person.contactId) ?? aliases.get(normalizeKey(person.name)) ?? person.contactId;
    upsertCandidate(candidates, alias, { contactId: person.contactId, name: person.name, title: person.title, person });
    aliases.set(person.contactId, alias);
    aliases.set(normalizeKey(person.name), alias);
  }

  for (const activity of activities) {
    let key = activity.contactId ? aliases.get(activity.contactId) : undefined;
    key = key ?? (activity.contactName ? aliases.get(normalizeKey(activity.contactName)) : undefined);
    if (!key && activity.contactName) {
      key = `activity:${normalizeKey(activity.contactName)}`;
      upsertCandidate(candidates, key, { contactId: activity.contactId || key, name: activity.contactName, title: activity.contactTitle, activities: [] });
      aliases.set(normalizeKey(activity.contactName), key);
    }
    if (key) candidates.get(key)?.activities.push(activity);
  }

  for (const memory of memories) {
    for (const candidate of candidates.values()) {
      if (matchCandidateText(candidate, `${memory.title} ${memory.currentJudgment} ${memory.risk} ${memory.nextAction} ${memory.uncertainty}`)) {
        candidate.memories.push(memory);
      }
    }
  }

  const results = Array.from(candidates.values()).map((candidate): StakeholderInterpretation => {
    candidate.memories = Array.from(new Map(candidate.memories.map((memory) => [memory.id, memory])).values());
    candidate.activities = Array.from(new Map(candidate.activities.map((activity) => [activity.id, activity])).values());
    const { role, why, roleSignals, tension: roleTension } = inferRole(candidate);
    const stanceResult = inferStance(candidate);
    const relationshipDistance = inferRelationshipDistance(candidate);
    const evidenceRefs = buildEvidenceRefs(candidate);
    const uncertainty = buildUncertainty({
      role,
      stance: stanceResult.stance,
      relationshipDistance,
      roleTension,
      stanceTension: stanceResult.tension,
      candidate,
    });
    const confidence = calculateConfidence({
      role,
      stance: stanceResult.stance,
      relationshipDistance,
      candidate,
      evidenceCount: evidenceRefs.length,
      hasUncertainty: Boolean(uncertainty),
    });
    const interpretation: StakeholderInterpretation = {
      contactId: candidate.contactId,
      name: candidate.name,
      title: candidate.title || undefined,
      role,
      stance: stanceResult.stance,
      relationshipDistance,
      confidence,
      provisional: confidence < 0.68 || Boolean(uncertainty) || role === 'unknown' || stanceResult.stance === 'unknown',
      whyThisRole: roleSignals.length > 1 ? `${why}；另有 ${roleSignals.length - 1} 个辅助信号。` : why,
      uncertainty,
      nextAction: nextActionFor({ role, stance: stanceResult.stance, relationshipDistance }, candidate),
      evidenceRefs,
      updatedAt: latestIso([
        candidate.contact?.updatedAt ?? '',
        ...candidate.memories.map((memory) => memory.updatedAt),
        ...candidate.activities.map((activity) => activity.occurredAt),
      ], params.updatedAt),
    };
    return interpretation;
  });

  const roleRank: Record<StakeholderRole, number> = {
    champion: 0,
    blocker: 1,
    decision_maker: 2,
    sponsor: 3,
    evaluator: 4,
    unknown: 5,
  };

  return results
    .filter((item) => item.name || item.contactId)
    .sort((a, b) => roleRank[a.role] - roleRank[b.role] || b.confidence - a.confidence || b.evidenceRefs.length - a.evidenceRefs.length)
    .slice(0, Math.max(1, params.limit ?? 12));
}
