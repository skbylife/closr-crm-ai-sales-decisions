import { createHash } from 'node:crypto';

export const ENGINE_SCHEMA_VERSION = 'closr_judgment_engine_v1' as const;

export type EngineSourceType =
  | 'email'
  | 'meeting'
  | 'call'
  | 'chat'
  | 'rfp'
  | 'crm_note'
  | 'document'
  | 'news'
  | 'task'
  | 'outcome';

export type EngineAuthorSide = 'customer' | 'seller' | 'partner' | 'external' | 'unknown';
export type EngineRisk = 'low' | 'medium' | 'high' | 'critical';
export type EngineMomentum = 'warming' | 'stable' | 'cooling' | 'volatile';
export type EngineImpact = 'low' | 'medium' | 'high' | 'critical';

export interface EngineSourceRecord {
  id: string;
  tenantId: string;
  sourceType: EngineSourceType;
  externalSourceId?: string;
  accountId?: string;
  opportunityId?: string;
  contactIds?: string[];
  occurredAt: string;
  author?: {
    side: EngineAuthorSide;
    name?: string;
    email?: string;
  };
  content?: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedEngineSourceRecord extends EngineSourceRecord {
  contentHash: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export interface EngineEvidenceRef {
  id: string;
  tenantId: string;
  sourceRecordId: string;
  evidenceType: 'support' | 'counter' | 'missing' | 'context';
  quote: string;
  summary: string;
  qualityScore: number;
  freshnessScore: number;
}

export interface EngineJudgment {
  id: string;
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  dimension: 'commercial' | 'relationship' | 'process' | 'competition' | 'evidence' | 'progression' | 'finance' | 'security' | 'rfp';
  answer: string;
  status: 'proposed' | 'accepted' | 'challenged' | 'revised' | 'invalidated' | 'confirmed';
  confidence: number;
  impact: EngineImpact;
  supportEvidenceIds: string[];
  counterEvidenceIds: string[];
  missingEvidence: string[];
  rationale: string;
}

export interface EngineWinGap {
  id: string;
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  dimension: string;
  currentState: string;
  desiredState: string;
  impact: string;
  linkedJudgmentIds: string[];
  evidenceGap: string;
  status: 'open' | 'addressed' | 'invalidated' | 'accepted_risk';
}

export interface EngineMove {
  id: string;
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  winGapId: string;
  intent: string;
  targetPerson: string;
  ask: string;
  expectedJudgmentDelta: string;
  successTest: string;
  failureTest: string;
  status: 'proposed' | 'approved' | 'in_progress' | 'done' | 'failed' | 'skipped';
  approvalRequired: boolean;
}

export interface EngineJudgmentSnapshotInput {
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  sources: EngineSourceRecord[];
}

export interface EngineJudgmentSnapshot {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  judgmentSummary: {
    health: 'healthy' | 'at_risk' | 'critical';
    momentum: EngineMomentum;
    primaryRisk: string;
    confidence: number;
    evidenceQuality: 'low' | 'medium' | 'high';
  };
  sources: NormalizedEngineSourceRecord[];
  evidenceRefs: EngineEvidenceRef[];
  judgments: EngineJudgment[];
  winGaps: EngineWinGap[];
  moves: EngineMove[];
  writebackPolicy: {
    mode: 'proposal_only';
    prohibitedFields: string[];
  };
  crmFieldUpdates: [];
}

// ── Decode API types ──────────────────────────────────────
export interface EngineDecodeResult {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  sources: NormalizedEngineSourceRecord[];
  evidenceRefs: EngineEvidenceRef[];
  signalProfile: {
    primaryRisk: string;
    patterns: string[];
    signalStrength: 'strong' | 'weak';
  };
}

// ── Strategic Play API types ──────────────────────────────
export interface EngineStrategicPlayInput {
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  playGoal?: string;
  judgments: EngineJudgment[];
  winGaps: EngineWinGap[];
}

export interface EngineStrategicPlayResult {
  schemaVersion: typeof ENGINE_SCHEMA_VERSION;
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  judgments: EngineJudgment[];
  winGaps: EngineWinGap[];
  moves: EngineMove[];
}

// ── Internal types ────────────────────────────────────────
interface SignalProfile {
  primaryRisk: string;
  dimension: 'finance' | 'security' | 'rfp' | 'evidence';
  gapDimension: string;
  evidencePattern: RegExp;
  evidenceSummary: string;
  answer: string;
  missingEvidence: string[];
  currentState: string;
  desiredState: string;
  impact: string;
  moveIntent: string;
  targetPerson: string;
  ask: string;
  expectedJudgmentDelta: string;
  successTest: string;
  failureTest: string;
}

interface SignalDetectResult {
  profile: SignalProfile;
  strongSignal: boolean;
  patterns: string[];
}

// ── Helpers ───────────────────────────────────────────────
const SOURCE_TYPES = new Set<EngineSourceType>([
  'email', 'meeting', 'call', 'chat', 'rfp', 'crm_note', 'document', 'news', 'task', 'outcome',
]);

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableId(prefix: string, ...parts: Array<string | undefined>): string {
  return `${prefix}_${sha256(parts.filter(Boolean).join(':')).slice(0, 12)}`;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceText(sources: NormalizedEngineSourceRecord[]): string {
  return sources.map((source) => source.content ?? '').join('\\n').toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/** Extract relevant quote around first keyword match, with sentence-level awareness */
function extractQuote(content: string, pattern: RegExp, maxLen: number = 220): string {
  if (!content) return '';
  const lower = content.toLowerCase();
  pattern.lastIndex = 0;
  const match = pattern.exec(lower);
  if (!match) return content.slice(0, maxLen) + (content.length > maxLen ? '…' : '');

  const kwStart = match.index;
  const kwLen = match[0].length;
  const ctxBefore = 60;
  const ctxAfter = 120;
  const start = Math.max(0, kwStart - ctxBefore);
  const end = Math.min(content.length, kwStart + kwLen + ctxAfter);

  let quote = content.slice(start, end).trim();
  if (start > 0) {
    // Back up to sentence boundary if close
    const beforeSlice = content.slice(start - 1, start + 1);
    if (beforeSlice.match(/[。！？\n.!?]/) === null) {
      quote = '…' + quote;
    }
  }
  if (end < content.length) {
    // Clip to sentence boundary
    const afterSlice = content.slice(end - 2, end);
    if (afterSlice.match(/[。！？\n.!?]/) === null) {
      quote = quote + '…';
    }
  }
  if (quote.length > maxLen + 40) {
    quote = quote.slice(0, maxLen + 37) + '…';
  }
  return quote;
}

/** Compute freshness 0-1 based on how recent the occurredAt is */
function computeFreshness(occurredAt: string, nowMs?: number): number {
  const age = (nowMs ?? Date.now()) - new Date(occurredAt).getTime();
  if (age < 0) return 1.0; // future dates = max
  const hours = age / 3600000;
  if (hours <= 24) return 1.0;
  if (hours <= 72) return 0.92;
  if (hours <= 168) return 0.8;   // 7 days
  if (hours <= 336) return 0.6;   // 14 days
  if (hours <= 720) return 0.4;   // 30 days
  return 0.2;
}

/** Check if content contains counter (opposing/negative) signals */
function hasCounterSignals(text: string): boolean {
  return hasAny(text, [/报价更低/, /更便宜/, /价格高/, /太贵/, /budget cut/, /预算削减/, /降本/, /年降/, /cost reduction/]);
}

/** Check if content has relationship/access signals */
function hasRelationshipSignals(text: string): boolean {
  return hasAny(text, [/高层/, /vp/, /cfo/, /ceo/, /champion/, /决策人/, /引荐/, /executive/]);
}

/** Check if content has commercial/expansion signals */
function hasCommercialSignals(text: string): boolean {
  return hasAny(text, [/扩容/, /扩展/, /新场景/, /加单/, /追加/, /试用效果/]);
}

/** Check for progression/timeline signals */
function hasProgressionSignals(text: string): boolean {
  return hasAny(text, [/紧急/, /时间表/, /deadline/, /月底/, /年底/, /Q[1-4]/, /approval/, /批/]);
}

// ── Phase 1: Validate + Normalize Sources ─────────────────
export function normalizeSources(
  sources: EngineSourceRecord[],
  defaults: { tenantId: string; accountId: string; opportunityId?: string },
): NormalizedEngineSourceRecord[] {
  const normalized: NormalizedEngineSourceRecord[] = [];
  for (const source of sources) {
    const result = validateEngineSourceRecord({
      ...source,
      tenantId: source.tenantId || defaults.tenantId,
      accountId: source.accountId || defaults.accountId,
      opportunityId: source.opportunityId || defaults.opportunityId,
    });
    if (!result.ok) {
      throw new Error(`Invalid engine source record ${source.id || '(missing id)'}: ${result.errors.join(', ')}`);
    }
    normalized.push(result.value);
  }
  return normalized;
}

export function validateEngineSourceRecord(source: EngineSourceRecord): ValidationResult<NormalizedEngineSourceRecord> {
  const errors: string[] = [];

  if (!hasText(source.id)) errors.push('id is required');
  if (!hasText(source.tenantId)) errors.push('tenantId is required');
  if (!SOURCE_TYPES.has(source.sourceType)) errors.push('sourceType is invalid');
  if (!hasText(source.occurredAt) || Number.isNaN(Date.parse(source.occurredAt))) {
    errors.push('occurredAt must be an ISO date');
  }
  if (!hasText(source.content) && !hasText(source.contentHash)) {
    errors.push('content or contentHash is required');
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      ...source,
      content: source.content?.trim(),
      tenantId: source.tenantId.trim(),
      contentHash: source.contentHash ?? sha256(source.content ?? ''),
    },
  };
}

// ── Phase 1b: Detect signal profile from normalized sources ──
function detectSignalProfile(normalizedSources: NormalizedEngineSourceRecord[]): SignalDetectResult {
  const text = sourceText(normalizedSources);
  const financeSignals = hasAny(text, [/cfo/, /roi/, /回本/, /预算/, /财务/]);
  const procurementSignals = hasAny(text, [/采购/, /年降/, /降价/, /cost reduction/]);
  const competitorSignals = hasAny(text, [/tcs/, /竞品/, /competitor/, /报价更低/]);
  const securitySignals = hasAny(text, [/安全/, /合规/, /审计/, /权限/, /数据驻留/, /法务/, /私有化/, /production/]);
  const rfpSignals = hasAny(text, [/rfp/, /投标/, /招采/, /评标/, /评分标准/, /陪标/, /澄清/]);
  const strongFinanceSignal = financeSignals && (procurementSignals || competitorSignals);
  const strongSecuritySignal = securitySignals && hasAny(text, [/评审/, /法务/, /审计/, /数据处理/, /权限隔离/]);
  const strongRfpSignal = rfpSignals && hasAny(text, [/两周/, /评分/, /评标/, /倾向供应商/, /陪标/]);

  const patterns: string[] = [];
  if (financeSignals) patterns.push('finance');
  if (procurementSignals) patterns.push('procurement');
  if (competitorSignals) patterns.push('competitor');
  if (securitySignals) patterns.push('security');
  if (rfpSignals) patterns.push('rfp');

  const { profile, strongSignal } = strongSecuritySignal
    ? {
        strongSignal: true,
        profile: {
          primaryRisk: 'security/compliance blocker',
          dimension: 'security' as const,
          gapDimension: 'security_review',
          evidencePattern: /安全|合规|审计|权限|数据驻留|法务|私有化|production|评审|数据处理/,
          evidenceSummary: '客户信号指向安全合规、数据处理、权限审计或私有化部署阻塞。',
          answer: '当前核心不是业务认可问题，而是安全合规评审和部署边界问题。',
          missingEvidence: ['approved security/compliance packet'],
          currentState: '安全合规和数据处理边界尚未通过评审',
          desiredState: '安全、法务和业务 sponsor 接受试点边界和部署方案',
          impact: 'blocks production pilot',
          moveIntent: 'clear security review blocker',
          targetPerson: '安全合规负责人 / 法务 / 业务 sponsor',
          ask: '确认数据驻留、审计日志、权限隔离和模型供应商材料是否满足试点准入。',
          expectedJudgmentDelta: '若安全合规接受边界，security_review confidence 提升；若拒绝，更新缺失证据。',
          successTest: '安全或法务确认材料足以进入试点审批',
          failureTest: '对方继续要求补充数据处理、审计或部署证明',
        },
      }
    : strongRfpSignal
      ? {
          strongSignal: true,
          profile: {
            primaryRisk: 'rfp/tender process blocker',
            dimension: 'rfp' as const,
            gapDimension: 'tender_process',
            evidencePattern: /rfp|投标|招采|评标|评分标准|陪标|澄清|oss\/bss|mttr|故障预测/,
            evidenceSummary: '客户信号指向 RFP 时间、评分标准、技术澄清或陪标风险。',
            answer: '当前核心是 RFP 评标路径和技术澄清窗口，而不是常规商机推进。',
            missingEvidence: ['validated tender scoring path'],
            currentState: 'RFP 评分标准和倾向供应商风险尚未被验证',
            desiredState: '在技术澄清前证明关键评分项并确认是否存在陪标风险',
            impact: 'blocks credible bid decision',
            moveIntent: 'validate tender scoring path',
            targetPerson: '招采办公室 / 技术澄清联系人',
            ask: '确认 OSS/BSS、MTTR 和故障预测证明是否覆盖关键评分项，以及是否存在已倾向供应商。',
            expectedJudgmentDelta: '若评分路径明确，更新 bid/no-bid 判断和投标资源请求。',
            successTest: '客户确认关键评分项和技术澄清要求',
            failureTest: '客户拒绝澄清评分路径或继续释放陪标信号',
          },
        }
      : strongFinanceSignal
        ? {
            strongSignal: true,
            profile: {
              primaryRisk: 'finance/procurement blocker',
              dimension: 'finance' as const,
              gapDimension: 'financial_case',
              evidencePattern: /cfo|roi|回本|预算|财务|年降|降价|采购|tcs|竞品/,
              evidenceSummary: '客户信号同时指向财务证明、采购价格压力或竞品锚点。',
              answer: '当前核心不是技术验证，而是财务 ROI 证明与采购价格锚点。',
              missingEvidence: ['direct CFO confirmation'],
              currentState: 'CFO ROI 口径尚未被验证',
              desiredState: 'CFO 接受可进入预算评审的 ROI/风险降低口径',
              impact: 'blocks expansion',
              moveIntent: 'validate financial blocker',
              targetPerson: 'CFO / 财务评审人',
              ask: '确认 AIOps ROI 或风险降低口径是否可进入预算评审。',
              expectedJudgmentDelta: '若 CFO 接受口径，financial_case confidence 提升；若拒绝，更新 win gap。',
              successTest: 'CFO 同意使用该模型进入预算评审',
              failureTest: '对方继续只讨论采购降价或转回竞品报价',
            },
          }
        : {
            strongSignal: false,
            profile: {
              primaryRisk: 'unverified deal risk',
              dimension: 'evidence' as const,
              gapDimension: 'evidence_quality',
              evidencePattern: /客户|预算|采购|安全|合规|rfp|投标|延期|风险/,
              evidenceSummary: '客户信号较弱，需要补充直接确认。',
              answer: '当前信号不足以支撑高置信判断，必须先补充财务、采购、安全或流程直接证据。',
              missingEvidence: ['direct finance/procurement confirmation'],
              currentState: '缺少可追溯的直接证据',
              desiredState: '获得可追溯的关键阻塞确认',
              impact: 'blocks reliable judgment',
              moveIntent: 'collect missing evidence',
              targetPerson: '采购、财务、安全或流程确认人',
              ask: '确认当前 delay 是预算、采购、安全、RFP 还是时间安排问题。',
              expectedJudgmentDelta: '若获得直接确认，将 unverified deal risk 改为具体风险判断。',
              successTest: '对方给出明确原因和责任人',
              failureTest: '对方继续模糊回应或无响应',
            },
          };

  return { profile, strongSignal, patterns };
}

// ── Phase 1c: Extract evidence refs from source content ───
function buildEvidenceRefs(params: {
  tenantId: string;
  normalizedSources: NormalizedEngineSourceRecord[];
  strongSignal: boolean;
  evidencePattern: RegExp;
  patterns: string[];
}): EngineEvidenceRef[] {
  const refs: EngineEvidenceRef[] = [];
  const text = params.normalizedSources.map((s) => s.content ?? '').join('\\n').toLowerCase();
  const hasCounter = hasCounterSignals(text);
  const hasRelationship = hasRelationshipSignals(text);
  const hasCommercial = hasCommercialSignals(text);
  const hasProgression = hasProgressionSignals(text);

  for (const source of params.normalizedSources) {
    const content = source.content ?? '';
    if (!content) continue;
    const lower = content.toLowerCase();

    // 1. Check for counter/negative evidence
    if (hasCounter && hasAny(lower, [/报价更低/, /更便宜/, /年降/, /降本/, /cost reduction/])) {
      refs.push({
        id: stableId('ev', source.tenantId, source.id, 'counter', source.contentHash),
        tenantId: source.tenantId,
        sourceRecordId: source.id,
        evidenceType: 'counter',
        quote: extractQuote(content, /报价更低|更便宜|年降|降本|cost reduction/),
        summary: '检测到竞品价格或降本压力信号',
        qualityScore: params.strongSignal ? 0.82 : 0.55,
        freshnessScore: computeFreshness(source.occurredAt),
      });
    }

    // 2. Check for primary signal (support for judgment)
    params.evidencePattern.lastIndex = 0;
    const matchesPrimary = params.evidencePattern.test(lower);
    if (matchesPrimary) {
      refs.push({
        id: stableId('ev', source.tenantId, source.id, 'support', source.contentHash),
        tenantId: source.tenantId,
        sourceRecordId: source.id,
        evidenceType: 'support',
        quote: extractQuote(content, params.evidencePattern),
        summary: params.strongSignal
          ? '检测到关键判断信号'
          : '信号较弱，需要补充确认',
        qualityScore: params.strongSignal ? 0.78 : 0.42,
        freshnessScore: computeFreshness(source.occurredAt),
      });
    }

    // 3. Check for relationship/commercial/progression signals as context
    if (hasRelationship && hasAny(lower, [/高层/, /vp/, /cfo/, /ceo/, /champion/, /executive/])) {
      refs.push({
        id: stableId('ev', source.tenantId, source.id, 'rel', source.contentHash),
        tenantId: source.tenantId,
        sourceRecordId: source.id,
        evidenceType: 'context',
        quote: extractQuote(content, /高层|vp|cfo|ceo|champion|executive/),
        summary: '检测到高层/决策人接触信号',
        qualityScore: 0.7,
        freshnessScore: computeFreshness(source.occurredAt),
      });
    }

    if (hasProgression && hasAny(lower, [/紧急/, /deadline/, /Q[1-4]/, /approval/, /批/])) {
      refs.push({
        id: stableId('ev', source.tenantId, source.id, 'time', source.contentHash),
        tenantId: source.tenantId,
        sourceRecordId: source.id,
        evidenceType: 'context',
        quote: extractQuote(content, /紧急|deadline|Q[1-4]|approval|批/),
        summary: '检测到时间/推进信号',
        qualityScore: 0.65,
        freshnessScore: computeFreshness(source.occurredAt),
      });
    }
  }

  return refs;
}

// ── Phase 2: Build judgment + win gap from profile ───────
function buildJudgmentFromProfile(params: {
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  evidenceRefs: EngineEvidenceRef[];
  profile: SignalProfile;
  strongSignal: boolean;
}): { judgment: EngineJudgment; winGap: EngineWinGap; judgmentSummary: EngineJudgmentSnapshot['judgmentSummary'] } {
  const supportEvidenceIds = params.evidenceRefs
    .filter((ref) => ref.evidenceType === 'support')
    .map((ref) => ref.id);
  const hasSupportEvidence = supportEvidenceIds.length > 0;
  const confidence = params.strongSignal && hasSupportEvidence ? 0.72 : 0.55;

  const judgmentId = stableId('judg', params.tenantId, params.accountId, params.opportunityId, params.profile.primaryRisk);
  const winGapId = stableId('gap', judgmentId, params.profile.gapDimension);

  const judgment: EngineJudgment = {
    id: judgmentId,
    tenantId: params.tenantId,
    accountId: params.accountId,
    opportunityId: params.opportunityId,
    dimension: params.profile.dimension,
    answer: params.profile.answer,
    status: 'proposed',
    confidence,
    impact: 'high',
    supportEvidenceIds,
    counterEvidenceIds: [],
    missingEvidence: params.profile.missingEvidence,
    rationale: hasSupportEvidence
      ? `判断来自客户原始信号中的 ${params.profile.primaryRisk} 证据。`
      : '缺少可追溯证据，禁止提升为高置信结论。',
  };

  const winGap: EngineWinGap = {
    id: winGapId,
    tenantId: params.tenantId,
    accountId: params.accountId,
    opportunityId: params.opportunityId,
    dimension: params.profile.gapDimension,
    currentState: params.profile.currentState,
    desiredState: params.profile.desiredState,
    impact: params.profile.impact,
    linkedJudgmentIds: [judgment.id],
    evidenceGap: params.profile.missingEvidence[0],
    status: 'open',
  };

  const judgmentSummary: EngineJudgmentSnapshot['judgmentSummary'] = {
    health: 'at_risk',
    momentum: params.strongSignal ? 'cooling' : 'stable',
    primaryRisk: params.profile.primaryRisk,
    confidence,
    evidenceQuality: params.strongSignal && hasSupportEvidence ? 'medium' : 'low',
  };

  return { judgment, winGap, judgmentSummary };
}

// ── Phase 3: Generate move from judgment + win gap ───────
function buildMoveFromProfile(params: {
  tenantId: string;
  accountId: string;
  opportunityId?: string;
  judgment: EngineJudgment;
  winGap: EngineWinGap;
  profile: SignalProfile;
}): EngineMove {
  return {
    id: stableId('move', params.winGap.id, 'next'),
    tenantId: params.tenantId,
    accountId: params.accountId,
    opportunityId: params.opportunityId,
    winGapId: params.winGap.id,
    intent: params.profile.moveIntent,
    targetPerson: params.profile.targetPerson,
    ask: params.profile.ask,
    expectedJudgmentDelta: params.profile.expectedJudgmentDelta,
    successTest: params.profile.successTest,
    failureTest: params.profile.failureTest,
    status: 'proposed',
    approvalRequired: true,
  };
}

// ── Standalone Decode API ────────────────────────────────
export function decodeEngineSignals(input: EngineJudgmentSnapshotInput): EngineDecodeResult {
  const normalizedSources = normalizeSources(input.sources, {
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
  });

  const { profile, strongSignal, patterns } = detectSignalProfile(normalizedSources);

  const evidenceRefs = buildEvidenceRefs({
    tenantId: input.tenantId,
    normalizedSources,
    strongSignal,
    evidencePattern: profile.evidencePattern,
    patterns,
  });

  return {
    schemaVersion: ENGINE_SCHEMA_VERSION,
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    sources: normalizedSources,
    evidenceRefs,
    signalProfile: {
      primaryRisk: profile.primaryRisk,
      patterns,
      signalStrength: strongSignal ? 'strong' : 'weak',
    },
  };
}

// ── Standalone Strategic Play API ────────────────────────
export function generateEngineMoves(input: EngineStrategicPlayInput): EngineStrategicPlayResult {
  const moves: EngineMove[] = [];

  for (const judgment of input.judgments) {
    for (const winGap of input.winGaps) {
      const profile: SignalProfile = {
        primaryRisk: judgment.dimension === 'finance' ? 'finance/procurement blocker'
          : judgment.dimension === 'security' ? 'security/compliance blocker'
          : judgment.dimension === 'rfp' ? 'rfp/tender process blocker'
          : 'unverified deal risk',
        dimension: judgment.dimension as SignalProfile['dimension'],
        gapDimension: winGap.dimension,
        evidencePattern: /./,
        evidenceSummary: `判断维度：${judgment.dimension}；赢单缺口：${winGap.dimension}`,
        answer: judgment.answer,
        missingEvidence: judgment.missingEvidence,
        currentState: winGap.currentState,
        desiredState: winGap.desiredState,
        impact: winGap.impact,
        moveIntent: judgment.dimension === 'finance' ? 'validate financial blocker'
          : judgment.dimension === 'security' ? 'clear security review blocker'
          : judgment.dimension === 'rfp' ? 'validate tender scoring path'
          : 'collect missing evidence',
        targetPerson: judgment.dimension === 'finance' ? 'CFO / 财务评审人'
          : judgment.dimension === 'security' ? '安全合规负责人 / 法务 / 业务 sponsor'
          : judgment.dimension === 'rfp' ? '招采办公室 / 技术澄清联系人'
          : '采购、财务、安全或流程确认人',
        ask: judgment.dimension === 'finance'
          ? '确认 ROI 或风险降低口径是否可进入预算评审。'
          : judgment.dimension === 'security'
            ? '确认数据驻留、审计日志、权限隔离和模型供应商材料是否满足试点准入。'
            : judgment.dimension === 'rfp'
              ? '确认评分项覆盖和技术澄清要求。'
              : '确认当前 delay 是预算、采购、安全、RFP 还是时间安排问题。',
        expectedJudgmentDelta: `若动作成功，${judgment.dimension} 相关置信度提升。`,
        successTest: judgment.dimension === 'finance' ? '对方同意使用该口径进入预算评审'
          : judgment.dimension === 'security' ? '对方确认材料足以进入试点审批'
          : judgment.dimension === 'rfp' ? '对方确认关键评分项和技术澄清要求'
          : '对方给出明确原因和责任人',
        failureTest: judgment.dimension === 'finance' ? '对方继续只讨论降价或竞品报价'
          : judgment.dimension === 'security' ? '对方继续要求补充安全证明'
          : judgment.dimension === 'rfp' ? '对方拒绝澄清评分路径或继续释放陪标信号'
          : '对方继续模糊回应或无响应',
      };

      moves.push(buildMoveFromProfile({
        tenantId: input.tenantId,
        accountId: input.accountId,
        opportunityId: input.opportunityId,
        judgment,
        winGap,
        profile,
      }));
    }
  }

  return {
    schemaVersion: ENGINE_SCHEMA_VERSION,
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    judgments: input.judgments,
    winGaps: input.winGaps,
    moves,
  };
}

// ── All-in-one snapshot (composes all three phases) ─────
export function buildEngineJudgmentSnapshot(input: EngineJudgmentSnapshotInput): EngineJudgmentSnapshot {
  const normalizedSources = normalizeSources(input.sources, {
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
  });

  const { profile, strongSignal } = detectSignalProfile(normalizedSources);

  const evidenceRefs = buildEvidenceRefs({
    tenantId: input.tenantId,
    normalizedSources,
    strongSignal,
    evidencePattern: profile.evidencePattern,
    patterns: [profile.primaryRisk],
  });

  const { judgment, winGap, judgmentSummary } = buildJudgmentFromProfile({
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    evidenceRefs,
    profile,
    strongSignal,
  });

  const move = buildMoveFromProfile({
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    judgment,
    winGap,
    profile,
  });

  return {
    schemaVersion: ENGINE_SCHEMA_VERSION,
    tenantId: input.tenantId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    judgmentSummary,
    sources: normalizedSources,
    evidenceRefs,
    judgments: [judgment],
    winGaps: [winGap],
    moves: [move],
    writebackPolicy: {
      mode: 'proposal_only',
      prohibitedFields: [
        'opportunity.stage',
        'opportunity.amount',
        'opportunity.forecast_category',
        'opportunity.close_date',
        'opportunity.owner',
      ],
    },
    crmFieldUpdates: [],
  };
}
