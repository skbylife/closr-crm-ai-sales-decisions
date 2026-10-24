// BABEL Engine — Core Types
// The Human Intelligence API: emotional decode, psychological profiling,
// cultural context, and response strategy.

// ─── Shared Enums & Literals ───────────────────────────────────────────

export type Domain =
  | 'dating'
  | 'b2b_sales'
  | 'workplace'
  | 'family'
  | 'negotiation'
  | 'customer_service';

export type DecodeMode = 'real' | 'drama' | 'strategic';

export type SentimentTrend = 'warming' | 'cooling' | 'stable' | 'volatile';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type BuyerState =
  | 'engaged'
  | 'evaluating'
  | 'stalling'
  | 'ghosting'
  | 'evaluator_to_ghost'
  | 'ready_to_buy';

export type ContactRole =
  | 'decision_maker'        // 最终决策者
  | 'economic_buyer'        // 预算控制者
  | 'champion'              // 内部推动者
  | 'technical_evaluator'   // 技术评估
  | 'influencer'            // 影响者
  | 'external_advisor'      // 外部顾问（不进入权限层）
  | 'consultant'            // 咨询顾问
  | 'channel_influencer'    // 渠道影响者
  | 'blocker'               // 阻碍者
  | 'end_user'              // 最终用户
  | 'procurement'           // 采购
  | 'legal'                 // 法务
  | 'project_manager'       // 项目经理
  | 'executive_sponsor'     // 高管支持者
  | 'gate_keeper'           // 守门人（秘书/助理）
  | 'coach'                 // 教练（指导我们的内部人）
  | 'committee_member'      // 评审委员会成员
  | 'it_admin'              // IT 管理员
  | 'operations'            // 运营
  | 'finance'               // 财务
  | 'contact'               // 一般联系人
  | 'unknown';

export type DecisionStyle =
  | 'analytical'
  | 'driver'
  | 'amiable'
  | 'expressive';

export type DealHealth = 'healthy' | 'at_risk' | 'critical';

// ─── Layer 1: Emotional Decode ─────────────────────────────────────────

export interface DecodeMessage {
  speaker: 'them' | 'me';
  text: string;
}

export interface DecodeInput {
  messages: DecodeMessage[];
  context?: string;
  mode: DecodeMode;
  language?: string;
  outputLocale?: 'zh' | 'en';
  domain: Domain;
  contactDiscType?: string;
}

export interface DecodedMessage {
  speaker: 'them' | 'me';
  original: string;
  decode: {
    meaning: string;
    emotion: string;
    urgency: number; // 1-10
    confidence: number; // 0-1
  };
}

export interface ThreadAnalysis {
  sentimentTrend: SentimentTrend;
  riskLevel: RiskLevel;
  buyerState: BuyerState;
  keySignal: string;
}

export interface DecodeOutput {
  messages: DecodedMessage[];
  threadAnalysis: ThreadAnalysis;
  actionItems?: DecodeActionItem[];
  /**
   * P0 Judgment Stability Layer: comparable, normalized judgment fields.
   * Free-form copy can vary, but these fields are intended for repeat decode comparison.
   */
  stableJudgment?: StableDecodeJudgment;
  /** Captures what context this decode was based on. */
  contextSnapshot?: DecodeContextSnapshot;
  /** Compares this decode against the previous matching decode when available. */
  judgmentDiff?: DecodeJudgmentDiff;
}

export type StableDecodeIntent =
  | 'active_interest'
  | 'evaluation'
  | 'delay_or_stall'
  | 'disengagement'
  | 'ready_to_buy'
  | 'unclear';

export interface StableJudgmentEvidenceItem {
  id: string;
  source: 'input' | 'analysis' | 'action' | 'context';
  summary: string;
}

export interface StableDecodeJudgment {
  schema_version: 'stable_decode_judgment_v1';
  intent: StableDecodeIntent;
  momentum_or_temperature: SentimentTrend;
  risk: RiskLevel;
  confidence: number;
  evidence: StableJudgmentEvidenceItem[];
  uncertainty: string[];
  recommended_next_action: string;
}

export interface DecodeContextEvidenceRef {
  id: string;
  kind: 'input' | 'account' | 'contact' | 'opportunity' | 'memory' | 'knowledge' | 'prompt';
  summary: string;
}

export interface DecodeContextSnapshot {
  schema_version: 'decode_context_snapshot_v1';
  fingerprint: string;
  input_fingerprint: string;
  context_fingerprint: string;
  input_summary: string;
  account_context?: { id?: string; name?: string };
  contact_context?: { id?: string; name?: string };
  deal_context?: { id?: string; stage?: string };
  request_context: {
    clientName?: string;
    dealStage?: string;
    signalSource?: string;
    analysisGoal?: string;
    signalContext?: string;
    hasUserContext: boolean;
    hasKnowledgeBase: boolean;
    hasCilContext: boolean;
    hasContextMemory: boolean;
    detectedCulture?: string;
  };
  relevant_evidence: DecodeContextEvidenceRef[];
  prompt: {
    route: string;
    prompt_version: string;
    schema_version: string;
    model_tier: string;
  };
  created_at: string;
}

export type DecodeJudgmentDiffStatus =
  | 'no_previous'
  | 'same_judgment'
  | 'changed_context'
  | 'unstable_same_context';

export interface DecodeJudgmentChangedField {
  field: keyof StableDecodeJudgment;
  previous: string | number | string[];
  current: string | number | string[];
}

export interface DecodeJudgmentDiff {
  status: DecodeJudgmentDiffStatus;
  previous_decode_id?: string;
  context_changed: boolean;
  judgment_changed: boolean;
  unstable: boolean;
  changed_fields: DecodeJudgmentChangedField[];
  confidence_delta: number;
  explanation: string;
}

// ─── Layer 2: Psychological Profiling ──────────────────────────────────

export interface InteractionRecord {
  type: 'email' | 'meeting' | 'call' | 'chat';
  date: string;
  metadata?: {
    replyTimeHours?: number;
    ccCount?: number;
    wordCount?: number;
  };
}

export interface ProfileInput {
  contactId: string;
  interactions: InteractionRecord[];
  updateMode: 'full' | 'incremental';
}

export interface CommunicationProfile {
  responseSpeed: string;
  formality: 'formal' | 'semi_formal' | 'casual';
  lengthPreference: 'short' | 'medium' | 'long';
  activeHours?: string;
  languagePreference?: string;
}

export interface EmotionalPatterns {
  baseline: string;
  positiveTriggers: string[];
  negativeTriggers: string[];
  landmines: string[];
}

export interface EngagementStrategy {
  approach: string;
  meetingTips: string;
  avoid: string;
}

export interface PsychologicalProfile {
  contactId: string;
  profile: {
    decisionStyle: {
      primary: DecisionStyle;
      secondary?: DecisionStyle;
      evidence: string[];
    };
    riskAppetite: 'aggressive' | 'moderate' | 'cautious';
    powerPosition: string;
    communication: CommunicationProfile;
    emotionalPatterns: EmotionalPatterns;
    engagementStrategy: EngagementStrategy;
  };
  confidence: number;
  basedOn: string;
  lastUpdated: string;
}

// ─── Layer 3: Cultural Context ─────────────────────────────────────────

export type CultureCode =
  | 'chinese_business'
  | 'american_business'
  | 'japanese_business'
  | 'korean_business'
  | 'middle_eastern_business'
  | 'european_business';

export interface CulturalDecodeInput {
  text: string;
  sourceCulture: CultureCode;
  relationship?: string;
  formality?: 'formal' | 'informal';
}

export interface CulturalDecodeOutput {
  literal: string;
  actualMeaning: string;
  culturalContext: string;
  confidence: number;
  counterStrategy: string;
  crossCulturalNote?: string;
}

// ─── Layer 4: Response Strategy ────────────────────────────────────────

export interface CompanyContext {
  financialHealth?: string;
  strategicPriority?: string;
  painPoints?: string[];
}

export interface CompetitiveContext {
  knownCompetitors?: string[];
  threatLevel?: RiskLevel;
}

// 任务摘要，用于策略评估上下文
export interface TaskSummaryForStrategy {
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  isOverdue: boolean;
  assignedTo?: string;
}

// 情报摘要，注入谋局 prompt 让 AI 基于最新情报生成策略
export interface IntelSummaryForStrategy {
  title: string;
  summary: string;
  type: string;
  date: string;
  urgency: string;
}

export interface StrategyInput {
  decodedMessage: DecodeOutput;
  contactProfile?: PsychologicalProfile;
  culturalContext?: CulturalDecodeOutput;
  companyContext?: CompanyContext;
  competitiveContext?: CompetitiveContext;
  numStrategies?: number;
  contactDiscType?: string;
  // 相关任务数据，帮助 AI 基于任务执行情况给出更精准建议
  tasks?: TaskSummaryForStrategy[];
  // 最新情报数据，帮助 AI 基于情报生成更精准策略
  intelItems?: IntelSummaryForStrategy[];
  // CIL 编译智能层上下文（可选，Phase 3 注入）
  cilContext?: string;
  outputLocale?: 'zh' | 'en';
}

export interface ReplyStrategy {
  name: string;
  goal: string;
  approach: string;
  tone: string;
  urgency: string;
  draft: string;
  successProbability: number;
}

export interface StrategyOutput {
  strategies: ReplyStrategy[];
  recommended: number;
  reasoning: string;
}

// ─── Contact Profile (AI-Generated) ──────────────────────────────────

export interface ContactProfileResult {
  decisionStyle: {
    type: DecisionStyle;
    confidence: number;
    evidence: string;
  };
  riskAppetite: 'aggressive' | 'moderate' | 'cautious';
  communication: {
    responseSpeed: string;
    lengthPreference: string;
    formality: string;
    bestContactTime: string;
  };
  positiveTriggers: string[];
  negativeTriggers: string[];
  landmines: string[];
  engagementTips: string[];
  // DISC inference from email communication
  discType?: 'D' | 'I' | 'S' | 'C';
  discConfidence?: number;
  discEvidence?: string[];
  discApproach?: string;
  // Inferred organizational role from email signals
  inferredRole?: ContactRole;
  inferredRoleConfidence?: number;
  inferredRoleEvidence?: string;
  generatedAt: string;
  basedOnCount: number;
  basedOnIntelCount?: number;
}

// ─── Enhanced Account Strategy ────────────────────────────────────────

export interface EnhancedAccountStrategy {
  healthScore: number;
  healthScoreReasoning: string;
  winPath: { step: string; who: string; what: string }[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  competitorStrategy: string[];
  timeline: { week: string; action: string }[];
  keyRisks: { risk: string; mitigation: string }[];
  strategyNarrative: string;
  playRecommendations?: string[];
}

// ─── Market Intel Cache ───────────────────────────────────────────────

export interface NewsAnalysisResult {
  news: { date: string; title: string; summary: string }[];
  dealRelevance: string;
  talkingPoints: string[];
  opportunities: { text: string; type: 'opportunity' | 'risk' }[];
  risks: { text: string; type: 'opportunity' | 'risk' }[];
  generatedAt: string;
}

export interface FinancialAnalysisResult {
  keyMetrics: { name: string; value: string; trend: 'up' | 'down' | 'stable'; note: string }[];
  strategicKeywords: { keyword: string; frequency: 'high' | 'medium' | 'low'; significance: string }[];
  digitalSignals: string[];
  riskSignals: string[];
  salesTalkingPoints: string[];
  overallAssessment: string;
  generatedAt: string;
}

export type MeetingType =
  | 'first_contact'
  | 'discovery'
  | 'demo'
  | 'technical_review'
  | 'negotiation'
  | 'contract_review'
  | 'quarterly_review'
  | 'other';

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  first_contact: '首次接触',
  discovery: '需求发现',
  demo: '方案演示',
  technical_review: '技术评审',
  negotiation: '商务谈判',
  contract_review: '合同审核',
  quarterly_review: '季度复盘',
  other: '其他',
};

export interface MeetingPrepInput {
  meetingTitle: string;
  meetingDate: string;
  meetingType: MeetingType;
  agenda: string;
  topics: string[];
  attendeeContactIds: string[];
  externalAttendees: string[];
  ourTeam: string;
  meetingObjective: string;
  specialConcerns: string;
}

export interface MeetingPrepResult {
  meetingSummary: { title: string; date: string; type: string; ourTeam: string };
  winProbability: number;
  winProbabilityReasoning: string;
  contactAnalysis: {
    name: string;
    title?: string;
    role?: string;
    attitudePrediction: string;
    communicationTips: string[];
    warnings: string[];
  }[];
  agendaPrep: {
    topic: string;
    keyInfo: string;
    recommendedApproach: string;
    expectedReaction: string;
    counterStrategy: string;
  }[];
  talkingPoints: { topic: string; angle: string }[];
  suggestedScripts: {
    opening: string;
    keyTransitions: string[];
    closing: string;
  };
  questionsToAsk: { question: string; priority: 'high' | 'medium' | 'low' }[];
  topicsToAvoid: string[];
  actionItems: { phase: 'before' | 'during' | 'after'; action: string }[];
  suggestedMaterials: string[];
  recentDynamics: string;
  knowledgeTraces?: {
    id: string;
    title: string;
    category: string;
    source?: string;
    sourceType?: string;
    relevanceReason: string;
    contentSnippet: string;
  }[];
  knowledgeGaps?: string[];
  generatedAt: string;
}

export interface MeetingPrepRecord {
  id: string;
  accountId: string;
  input: MeetingPrepInput;
  result: MeetingPrepResult;
  createdAt: string;
}

export interface MarketIntelCache {
  newsAnalysis?: NewsAnalysisResult;
  financialAnalysis?: FinancialAnalysisResult;
  meetingPrep?: MeetingPrepResult;
}

// ─── User Role Levels ───────────────────────────────────────────────
// 业务职级（数据可见性），由 jobLevel 派生：0=AE, 1=Director, 2=Executive

export type UserRoleLevel = 'ae' | 'director' | 'executive';

export const ROLE_LEVEL_LABELS: Record<UserRoleLevel, string> = {
  ae: '销售代表 (AE)',
  director: '总监 (Director)',
  executive: '高管 (Executive)',
};

// ─── App-Level Types ───────────────────────────────────────────────────

export interface EmailThread {
  id: string;
  subject: string;
  participants: string[];
  lastMessageAt: string;
  messageCount: number;
  decode?: DecodeOutput;
}

export interface Account {
  id: string;
  /** 创建者 user_id（历史兼容），新数据中 transfer 时会同步更新 */
  userId?: string;
  /** 当前负责人，来自 DB owner_id 列；未交接过的账户为 undefined，此时以 userId 为准 */
  ownerId?: string;
  /** Business Team ownership; does not affect P0 visibility or owner transfer semantics. */
  businessTeamId?: string;
  name: string;
  industry?: string;
  website?: string;
  dealValue?: number;
  dealStage?: string;
  dealHealth?: DealHealth;
  notes?: string;
  contacts: Contact[];
  marketIntel?: MarketIntelCache;
  strategy?: EnhancedAccountStrategy;
  meddicc?: MeddiccData;
  meetingPreps?: MeetingPrepRecord[];
  opportunityIds?: string[];
  lastActivity?: string;
  createdAt?: string;
}

export type SalesLeadStatus = 'new' | 'qualified' | 'nurture' | 'disqualified' | 'converted';
export type SalesLeadPriority = 'high' | 'medium' | 'low';

export interface SalesLead {
  id: string;
  companyName: string;
  contactName: string;
  email?: string;
  phone?: string;
  title?: string;
  source: string;
  need: string;
  estimatedValue: number;
  currency: string;
  priority: SalesLeadPriority;
  status: SalesLeadStatus;
  ownerId?: string;
  nextStep?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
  convertedAccountId?: string;
  convertedContactId?: string;
  convertedOpportunityId?: string;
}

export type RiskAppetite = 'aggressive' | 'moderate' | 'cautious';

// ─── Attitude Trend ──────────────────────────────────────────────────

export interface AttitudeTrendPoint {
  date: string;
  score: number;
  label: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  mobilePhone?: string;
  title?: string;
  role?: ContactRole;
  reportsTo?: string; // contact id of manager within same account
  department?: string;
  // Social & professional links
  linkedin?: string;
  wechat?: string;
  twitter?: string;
  // Location
  location?: string; // city/office
  timezone?: string;
  // Preferred communication
  preferredChannel?: 'email' | 'phone' | 'wechat' | 'teams' | 'in_person';
  preferredLanguage?: string;
  // Notes & personality
  decisionStyle?: DecisionStyle;
  riskAppetite?: RiskAppetite;
  communicationNotes?: string;
  landmines?: string;
  personalNotes?: string; // interests, hobbies, family info for rapport building
  // Relationship strength (0-100): how well we know / can influence this contact
  // Higher = stronger relationship, more trust, better access
  relationship_strength?: number;
  // AI generated
  profile?: PsychologicalProfile;
  contactProfile?: ContactProfileResult;
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  lastContactedAt?: string;
  attitudeTrend?: AttitudeTrendPoint[];
  // Enrichment metadata
  jobLevel?: number;           // 0=IC, 1=Manager, 2=Director, 3=VP, 4=CxO
  roleConfidence?: number;     // 0-1
  roleSource?: string;         // 'manual' | 'decode_infer' | 'intel_agent' | 'agent_tool'
  roleUpdatedAt?: string;
  enrichmentStatus?: string;   // 'pending' | 'enriched' | 'failed' | 'stale'
  enrichedAt?: string;
}

export type IntelSource =
  | 'supplier'
  | 'industry_event'
  | 'news'
  | 'internal'
  | 'social_media'
  | 'client_direct'
  | 'meeting'
  | 'call'
  | 'email'
  | 'chat'
  | 'other'
  | 'ai_decode'
  | 'ai_play';

export type Credibility = 'high' | 'medium' | 'low';
export type Urgency = 'high' | 'medium' | 'low';

export interface IntelItem {
  id: string;
  accountId: string;
  accountName: string;
  type: 'news' | 'earnings' | 'leadership_change' | 'competitor' | 'manual' | 'discovery' | 'email_decode' | 'play_created';
  source: IntelSource;
  title: string;
  content: string;
  summary: string;
  credibility: Credibility;
  urgency: Urgency;
  relevance: string;
  date: string;
  analysis?: IntelAnalysis;
  relatedContactIds: string[];
  opportunityId?: string;
  spinClassification?: SpinItem[];
}

export interface IntelAnalysis {
  crossValidation: string[];
  implications: string;
  suggestedActions: string[];
  riskAssessment: {
    level: RiskLevel;
    description: string;
  };
}

export interface SavedDecode {
  id: string;
  userId?: string;
  accountId?: string;
  accountName?: string;
  opportunityId?: string;
  emailText: string;
  clientName?: string;
  dealStage?: string;
  signalSource?: 'email' | 'meeting' | 'call' | 'chat' | 'intel' | 'other';
  analysisGoal?: 'auto' | 'attitude' | 'risk' | 'reply' | 'deal_update' | 'next_action';
  signalContext?: string;
  signalStatus?: 'new' | 'task_created' | 'in_play' | 'ignored';
  signalTaskId?: string;
  signalStatusUpdatedAt?: string;
  decode: DecodeOutput;
  strategy?: StrategyOutput;
  date: string;
  // Email forwarding enrichment
  originalSenderEmail?: string;
  originalSenderName?: string;
  matchedContactId?: string;
  matchedAccountId?: string;
  matchedAccountName?: string;
  direction?: 'inbound' | 'outbound';
}

// ─── Knowledge Base ──────────────────────────────────────────────────

export type KnowledgeCategory =
  | 'product_proposal' // 产品方案
  | 'company_info'    // 公司资料
  | 'competitor'      // 竞品资料
  | 'industry'        // 行业资料
  | 'sales_tools'     // 销售工具
  | 'methodology'     // 方法论
  | 'case_study'      // 案例文档
  | 'other';          // 其他

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  category: KnowledgeCategory;
  fileSize?: number;
  createdAt: string;
}

// ─── MEDDICC Qualification ───────────────────────────────────────────

export type MeddiccStatus = 'confirmed' | 'partial' | 'unconfirmed';
export type ContactStatus = 'contacted' | 'identified' | 'unidentified';
export type CriteriaFit = 'meets' | 'partial' | 'not_meets';
export type PainQuantified = 'quantified' | 'not_quantified';

export interface MeddiccMetrics {
  notes: string;
  status: MeddiccStatus;
}

export interface MeddiccEconomicBuyer {
  status: ContactStatus;
}

export interface MeddiccDecisionCriteria {
  items: { criterion: string; fit: CriteriaFit }[];
}

export interface MeddiccDecisionProcess {
  steps: { name: string; completed: boolean }[];
}

export interface MeddiccPain {
  items: { pain: string; quantified: PainQuantified }[];
}

export interface MeddiccChampion {
  strength: number; // 1-5
  lastInteraction?: string;
}

export interface MeddiccCompetitor {
  name: string;
  theirAdvantage: string;
  ourCounter: string;
}

export interface MeddiccData {
  metrics: MeddiccMetrics;
  economicBuyer: MeddiccEconomicBuyer;
  decisionCriteria: MeddiccDecisionCriteria;
  decisionProcess: MeddiccDecisionProcess;
  pain: MeddiccPain;
  champion: MeddiccChampion;
  competition: MeddiccCompetitor[];
}

// ─── Opportunity & Pipeline ─────────────────────────────────────────

export type OpportunityStage =
  | 'lead_identified'
  | 'discovery'
  | 'solution_presented'
  | 'proposal_sent'
  | 'negotiation'
  | 'contract_review'
  | 'closed_won'
  | 'closed_lost';

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  lead_identified: '已识别线索',
  discovery: '需求发现中',
  solution_presented: '方案已呈现',
  proposal_sent: '报价已发送',
  negotiation: '商务谈判中',
  contract_review: '合同审核中',
  closed_won: '已成交',
  closed_lost: '已丢失',
};

export const STAGE_ORDER: OpportunityStage[] = [
  'lead_identified',
  'discovery',
  'solution_presented',
  'proposal_sent',
  'negotiation',
  'contract_review',
  'closed_won',
  'closed_lost',
];

export interface StageRequirement {
  stage: OpportunityStage;
  label: string;
  requiredFields: string[];
  requiredMeddicc: string[];
  checklist: string[];
}

export const STAGE_REQUIREMENTS: StageRequirement[] = [
  { stage: 'lead_identified', label: '已识别线索', requiredFields: [], requiredMeddicc: [], checklist: [] },
  { stage: 'discovery', label: '需求发现中', requiredFields: ['contacts'], requiredMeddicc: [], checklist: ['至少 1 个联系人'] },
  { stage: 'solution_presented', label: '方案已呈现', requiredFields: ['champion_role'], requiredMeddicc: ['metrics_partial', 'identifiedPain'], checklist: ['Metrics 至少部分确认', '至少 1 条痛点', '至少 1 个 Champion'] },
  { stage: 'proposal_sent', label: '报价已发送', requiredFields: ['value'], requiredMeddicc: ['decisionCriteria'], checklist: ['至少 1 条决策标准', '金额已填写'] },
  { stage: 'negotiation', label: '商务谈判中', requiredFields: [], requiredMeddicc: ['economicBuyer_identified', 'decisionProcess'], checklist: ['Economic Buyer 至少已识别', '至少 1 步决策流程'] },
  { stage: 'contract_review', label: '合同审核中', requiredFields: ['meddicc_score_40', 'map_milestones_3'], requiredMeddicc: [], checklist: ['MEDDICC 评分 >= 40', 'MAP 至少 3 个里程碑'] },
  { stage: 'closed_won', label: '已成交', requiredFields: ['meddicc_score_60', 'map_no_blocked'], requiredMeddicc: [], checklist: ['MEDDICC 评分 >= 60', 'MAP 无阻塞里程碑'] },
  { stage: 'closed_lost', label: '已丢失', requiredFields: ['lostReason'], requiredMeddicc: [], checklist: ['丢失原因必填'] },
];

// ─── MEDDICC Assessment (Opportunity-level) ─────────────────────────

export interface DecisionCriterion {
  id: string;
  criterion: string;
  ourFit: 'strong' | 'partial' | 'weak' | 'unknown';
  notes: string;
}

export interface DecisionStep {
  id: string;
  step: string;
  status: 'completed' | 'in_progress' | 'pending' | 'blocked';
  owner: string;
  dueDate: string;
}

export interface PainPoint {
  id: string;
  pain: string;
  quantified: boolean;
  impactValue: string;
  notes: string;
}

export interface Competitor {
  id: string;
  name: string;
  strengths: string;
  ourAdvantage: string;
  threatLevel: 'high' | 'medium' | 'low';
}

export interface MeddiccAssessment {
  metrics: { notes: string; status: 'confirmed' | 'partial' | 'unconfirmed'; evidence: string };
  economicBuyer: { status: 'engaged' | 'identified' | 'unknown'; accessLevel: string };
  decisionCriteria: DecisionCriterion[];
  decisionProcess: DecisionStep[];
  identifiedPain: PainPoint[];
  champion: { strength: number; lastEngagement: string; notes: string };
  competition: Competitor[];
  overallScore: number;
}

// ─── Mutual Action Plan ─────────────────────────────────────────────

export type MilestoneCategory = 'discovery' | 'technical' | 'procurement' | 'legal' | 'security' | 'implementation' | 'signature' | 'other';
export type MilestoneOwner = 'buyer' | 'seller' | 'both';
export type MilestoneStatus = 'completed' | 'in_progress' | 'pending' | 'blocked' | 'at_risk';

export interface MapMilestone {
  id: string;
  title: string;
  category: MilestoneCategory;
  owner: MilestoneOwner;
  assignee: string;
  dueDate: string;
  status: MilestoneStatus;
  completedDate?: string;
  notes: string;
}

export interface MutualActionPlan {
  targetSignDate: string;
  confidence: number;
  milestones: MapMilestone[];
}

// ─── Opportunity ────────────────────────────────────────────────────

export interface Opportunity {
  id: string;
  /** 创建者 user_id（created by），用于审计与回溯 */
  userId?: string;
  /** 当前负责人 user_id，对应 DB 的 assigned_to，是权限过滤与负责人展示的唯一用户语义字段 */
  assignedTo?: string;
  accountId: string;
  name: string;
  value: number;
  currency: string;
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate: string;
  /** 兼容历史数据的人类可读负责人名称快照，不参与权限判断 */
  owner: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  lostReason?: string;
  wonDate?: string;
  meddicc: MeddiccAssessment;
  mutualActionPlan: MutualActionPlan;
  competitorIds: string[];
  notes: string;
}

// ─── Composed Email ─────────────────────────────────────────────────

export type EmailType =
  | 'cold_outreach'
  | 'follow_up'
  | 'meeting_invite'
  | 'proposal_send'
  | 'quote_follow_up'
  | 'holiday_greeting'
  | 'reactivation'
  | 'custom';

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  cold_outreach: '首次接触',
  follow_up: '跟进',
  meeting_invite: '会议邀请',
  proposal_send: '方案发送',
  quote_follow_up: '报价跟进',
  holiday_greeting: '节日问候',
  reactivation: '重新激活',
  custom: '自定义',
};

export interface ComposedEmail {
  id: string;
  accountId: string;
  contactId: string;
  contactName: string;
  opportunityId?: string;
  type: EmailType;
  goal: string;
  subject: string;
  body: string;
  sendingAdvice: string;
  status: 'draft' | 'sent';
  finalContent?: string;
  sentAt?: string;
  suggestedCc?: string[];
  createdAt: string;
}

// ─── SPIN Discovery Framework ──────────────────────────────────────

export type SpinCategory = 'situation' | 'problem' | 'implication' | 'need_payoff';

export const SPIN_LABELS: Record<SpinCategory, string> = {
  situation: 'Situation (现状)',
  problem: 'Problem (问题)',
  implication: 'Implication (后果)',
  need_payoff: 'Need-payoff (需求回报)',
};

export const SPIN_COLORS: Record<SpinCategory, { bg: string; text: string; border: string }> = {
  situation: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  problem: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  implication: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  need_payoff: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
};

export type DiscoveryNoteSource = 'meeting' | 'call' | 'email' | 'other';

export const DISCOVERY_SOURCE_LABELS: Record<DiscoveryNoteSource, string> = {
  meeting: '会议',
  call: '电话',
  email: '邮件',
  other: '其他',
};

export interface SpinItem {
  text: string;
  category: SpinCategory;
  confidence: number;
}

export interface DiscoveryNote {
  id: string;
  opportunityId: string;
  date: string;
  content: string;
  source: DiscoveryNoteSource;
  spinClassification?: SpinItem[];
  createdAt: string;
}

export interface DiscoveryScore {
  situation: number;   // 0-25
  problem: number;     // 0-25
  implication: number; // 0-25
  needPayoff: number;  // 0-25
  total: number;       // 0-100
  missingCategories: SpinCategory[];
  recommendedQuestions: string[];
}

// ─── Task (看板) ──────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSource = 'manual' | 'decode' | 'intel' | 'meddicc' | 'strategic_play' | 'system';

export interface TaskAttachment {
  name: string;
  url: string;
  type: string;
  size: number;          // 文件大小（字节）
  storagePath: string;   // Supabase Storage 路径
}

export interface Task {
  id: string;
  userId?: string;
  accountId?: string;
  opportunityId?: string;
  contactId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  assignedTo?: string;
  labels?: string[];
  source: TaskSource;
  sourceId?: string;
  aiGenerated: boolean;
  attachments?: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

// ─── Organization & Membership ──────────────────────────────────────

export type OrgRole = 'owner' | 'admin' | 'manager' | 'member';

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  settings: OrgSettings;
  createdAt: string;
  updatedAt: string;
}

export interface OrgSettings {
  managerCanViewMemberDecodes?: boolean;
}

export interface OrgMember {
  id: string;       // membership id
  userId: string;
  orgId: string;
  teamId?: string;
  role: OrgRole;
  jobTitle?: UserRoleLevel;  // ae | director | executive — 由 jobLevel 派生
  jobLevel?: number;         // 0=AE, 1=Director, 2=Executive
  displayName?: string;
  email?: string;    // from auth.users, joined at query time
  invitedBy?: string;
  joinedAt: string;
}

export interface BusinessTeamSummary {
  id: string;
  name: string;
  memberCount?: number;
  createdAt?: string;
}

export type PursuitTeamStatus = 'active' | 'paused' | 'closed' | 'archived';

export interface ResponsibilityCatalogItem {
  id: string;
  orgId?: string | null;
  key: string;
  label: string;
  description?: string | null;
  category?: string | null;
  isSystem: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
}

export interface PursuitTeamMember {
  id: string;
  orgId: string;
  pursuitTeamId: string;
  userId: string;
  isLead: boolean;
  coverageNote?: string | null;
  responsibilityIds: string[];
  responsibilities?: ResponsibilityCatalogItem[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PursuitTeam {
  id: string;
  orgId: string;
  parentTeamId?: string | null;
  accountId: string;
  opportunityId?: string | null;
  strategicPlayId?: string | null;
  name: string;
  status: PursuitTeamStatus;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  members?: PursuitTeamMember[];
}

export const JOB_LEVEL_LABELS: Record<number, string> = {
  0: '销售代表 (AE)',
  1: '总监 (Director)',
  2: '高管 (Executive)',
};

export interface OrgInvitation {
  id: string;
  orgId: string;
  email: string;
  role: Exclude<OrgRole, 'owner'>;
  token: string;
  invitedBy?: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

// ─── Decode Action Item (AI 生成) ──────────────────────────────────

export interface DecodeActionItem {
  title: string;
  priority: TaskPriority;
  dueInDays: number;
  reasoning: string;
  targetPerson?: string;
  targetRole?: string;
}

// ─── AI Event Pipeline Types ──────────────────────────────────────────

export type AIEventType =
  | 'decode.completed'
  | 'intel.created'
  | 'deal.stage_changed'
  | 'contact.updated'
  | 'contact.profile_updated'
  | 'news.discovered'
  | 'meeting.scheduled'
  | 'no_reply.detected'
  | 'email.synced';

export type AIEntityType = 'email_decode' | 'intel_item' | 'opportunity' | 'contact' | 'account' | 'news' | 'strategic_play' | 'integration_email';

export type InsightType = 'health' | 'risk' | 'action' | 'strategy' | 'profile_summary' | 'impact' | 'play_impact_alert' | 'latest_email_signal' | 'cil_health' | 'competitive_analysis' | 'competitive_matrix' | 'financial_analysis' | 'pattern_recognition' | 'meddicc_assessment';

export type AIEventStatus = 'pending' | 'processing' | 'completed' | 'partial_failure' | 'failed';

export interface AIEvent {
  id: string;
  orgId: string;
  userId?: string;
  eventType: AIEventType;
  entityType: AIEntityType;
  entityId: string;
  payload: Record<string, unknown>;
  status: AIEventStatus;
  error?: string;
  processedAt?: string;
  createdAt: string;
}

export interface AIInsight {
  id: string;
  orgId: string;
  entityType: AIEntityType;
  entityId: string;
  insightType: InsightType;
  data: Record<string, unknown>;
  version: number;
  lastTrigger?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Strategic Play Engine (谋局引擎) Types ──────────────────────────

export type StrategicGoalType =
  | 'reach_key_person'             // 接触关键人物
  | 'remove_blocker'               // 消除 Blocker
  | 'create_urgency'               // 制造紧迫感
  | 'block_competitor'             // 阻击竞品
  | 'expand_deal'                  // 扩大 deal 范围
  | 'reactivate'                   // 重新激活死单
  | 'build_relationship'           // 建立长期关系
  | 'build_executive_relationship' // 建立高层关系
  | 'expand_network'               // 拓展内部人脉网络
  | 'org_mapping'                  // 组织架构摸排
  | 'competitive_defense'          // 竞品防御
  | 'custom';                      // 自定义

export const STRATEGIC_GOAL_LABELS: Record<StrategicGoalType, string> = {
  reach_key_person: '接触关键人物',
  remove_blocker: '消除 Blocker',
  create_urgency: '制造紧迫感',
  block_competitor: '阻击竞品',
  expand_deal: '扩大 Deal 范围',
  reactivate: '重新激活',
  build_relationship: '建立长期关系',
  build_executive_relationship: '建立高层关系',
  expand_network: '拓展内部人脉网络',
  org_mapping: '组织架构摸排',
  competitive_defense: '竞品防御',
  custom: '自定义',
};

export type PlayStatus = 'active' | 'in_progress' | 'completed' | 'abandoned';

export type PlayMomentum = 'progressing' | 'active' | 'slowing' | 'stalled' | 'blocked';

export type PlayRelationshipType = 'supports' | 'depends_on' | 'conflicts';

export type PlayStepExecutionStatus = 'planned' | 'in_progress' | 'done' | 'blocked' | 'invalidated';
export type LegacyPlayStepStatus = 'pending' | 'completed' | 'skipped';
export type CompatiblePlayStepStatus = PlayStepExecutionStatus | LegacyPlayStepStatus;

export interface PlayStep {
  index: number;
  title: string;
  description: string;
  who: string;              // 谁执行
  target: string;           // 目标联系人
  action: string;           // 具体行动
  timing: string;           // 时间安排（如 '本周'、'下周'）
  purpose: string;          // 目的
  rationale?: string;       // 理论依据 — 引用谈判学/心理学/博弈论/销售方法论
  expectedOutcome?: string; // 预期产出/成功信号
  risk: string;             // 风险
  fallback: string;         // 备选
  prerequisite?: string;    // 前提条件
  culturalNote?: string;    // 文化注意事项
  status: CompatiblePlayStepStatus;
  owner?: string;
  assignedToUserId?: string;
  linkedTaskId?: string;
  executionOwnerSource?: 'ai_suggestion' | 'manual' | 'task' | 'task_sync';
  dueDate?: string;
  startedAt?: string;
  completedAt?: string;
  executionNote?: string;
  actualOutcome?: string;
  actualResult?: string;
  nextAction?: string;
  blockerReason?: string;
  executionCaveat?: string;
  aiAdjusted?: boolean;
  assumptionBeingTested?: string;
  successSignal?: string;
  learning?: string;
  newSignals?: string[];
  preparationChecklist?: { text: string; done: boolean }[];
}

export interface AlternativePath {
  name: string;
  confidence: number;
  steps: PlayStep[];
  reason: string;
}

export interface PlayAssumption {
  id: string;
  text: string;
  status: 'pending' | 'verified' | 'invalidated';
  evidence?: string;
  impact?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PlayLearning {
  stepIndex: number;
  learning: string;
  newSignal?: string;
  timestamp: string;
}

export interface PlayReview {
  result: 'achieved' | 'partially_achieved' | 'failed' | 'abandoned';
  whatWorked: string[];
  whatSurprised: string[];
  assumptionsReview: { assumptionId: string; outcome: string }[];
  lessonsForFuture: string[];
  reviewedAt: string;
}

export interface PlayRelationship {
  id: string;
  sourcePlayId: string;
  targetPlayId: string;
  relationship: PlayRelationshipType;
  note?: string;
  createdAt: string;
}

export type StrategicPlayFieldEvidenceClassification = 'fact' | 'inference' | 'gap' | 'mixed';
export type StrategicPlayFieldEvidenceCalibrationClassification = StrategicPlayFieldEvidenceClassification | 'observed' | 'verified' | 'blocked' | 'invalidated';
export type StrategicPlayFieldEvidenceCalibrationOutcomeAssessment = 'matched_expected' | 'partially_matched' | 'missed_expected' | 'blocked' | 'invalidated' | 'unknown';

export interface StrategicPlayEvidenceTraceRef {
  evidenceId?: string;
  sourceId: string;
  sourceType: string;
  sourceKind?: EvidenceSourceKind;
  sourceTable?: string;
  sourceRowId?: string;
  title?: string;
  excerpt?: string;
  occurredAt?: string;
  weight?: number;
}

export interface StrategicPlayFieldEvidenceCalibration {
  id: string;
  sourceRef: StrategicPlayEvidenceTraceRef;
  executionStatus: 'planned' | 'in_progress' | 'done' | 'blocked' | 'invalidated';
  outcomeAssessment: StrategicPlayFieldEvidenceCalibrationOutcomeAssessment;
  previousClassification: StrategicPlayFieldEvidenceCalibrationClassification;
  calibratedClassification: StrategicPlayFieldEvidenceCalibrationClassification;
  note?: string;
  occurredAt: string;
  createdBy?: string;
}

export interface StrategicPlayFieldEvidenceAttribution {
  field: string;
  classification: StrategicPlayFieldEvidenceClassification;
  evidenceRefs: StrategicPlayEvidenceTraceRef[];
  gaps: string[];
  rationale?: string;
  calibrations?: StrategicPlayFieldEvidenceCalibration[];
}

export interface StrategicPlay {
  id: string;
  orgId: string;
  userId?: string;
  accountId: string;
  opportunityId?: string;
  targetContactId?: string;
  goalType: StrategicGoalType;
  goalDescription: string;
  steps: PlayStep[];
  alternativePaths: AlternativePath[];
  confidence: number;
  status: PlayStatus;
  aiModel?: string;
  momentum: PlayMomentum;
  situationJudgment?: string;
  strategicObjective?: string;
  stakeholderPath?: string[];
  evidenceBasis?: string[];
  riskCounterEvidence?: string[];
  fieldEvidenceAttributions?: StrategicPlayFieldEvidenceAttribution[];
  actionPlan?: PlayStep[];
  successCriteria?: string;
  knowledgeTraces?: {
    id: string;
    title: string;
    category: string;
    source?: string;
    sourceType?: string;
    relevanceReason: string;
    contentSnippet: string;
  }[];
  knowledgeGaps?: string[];
  provenance?: {
    evidenceIds: string[];
    sourceIds: string[];
    sourceTypes: string[];
    confidence: number;
    contradictions: unknown[];
    tensions: string[];
    rationale: string;
    traces: unknown[];
    generatedAt: string;
  } | null;
  deadline?: string | null;
  assumptions: PlayAssumption[];
  learnings: PlayLearning[];
  review?: PlayReview;
  lastStepAt?: string;
  daysSinceProgress: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Evidence Memory V1 ─────────────────────────────────────────────

export type EvidenceSourceKind =
  | 'intel_item'
  | 'email_decode'
  | 'integration_email'
  | 'meeting_prep'
  | 'activity_log'
  | 'strategic_play'
  | 'source_record';

export type AccountMomentum = 'rising' | 'steady' | 'slowing' | 'stalled' | 'at_risk';

export interface EvidenceSourceRef {
  id: string;
  kind: EvidenceSourceKind;
  label: string;
  occurredAt: string;
}

export interface AccountMemoryPerson {
  contactId: string;
  name: string;
  title?: string;
  role?: ContactRole;
  influenceLabel: string;
  stance: 'supportive' | 'neutral' | 'unclear' | 'blocking';
  summary: string;
  sourceIds: string[];
}

export interface AccountTimelineItem {
  id: string;
  accountId: string;
  sourceId: string;
  sourceKind: EvidenceSourceKind;
  title: string;
  summary: string;
  occurredAt: string;
  signal: 'positive' | 'neutral' | 'risk';
}

export type ConflictKind =
  | 'budget_contradiction'
  | 'stance_contradiction'
  | 'person_stance_flip'
  | 'temporal_reversal'
  | 'engagement_gap'
  | 'cross_source_disagreement'
  | 'competitor_displacement';

export interface AccountMemoryConflict {
  id: string;
  accountId: string;
  summary: string;
  status: 'open' | 'resolved';
  sourceIds: string[];
  detectedAt: string;
  /** Classification of the conflict pattern */
  kind?: ConflictKind;
  /** Severity: high = needs immediate attention, medium = monitor, low = informational */
  severity?: 'high' | 'medium' | 'low';
  /** Contact IDs involved in this conflict, if applicable */
  involvedContactIds?: string[];
}

export interface AccountMemorySourceCoverage {
  kinds: EvidenceSourceKind[];
  totalRecords: number;
  freshRecords: number;      // records within last 30 days
  oldestRecordAt?: string;
  newestRecordAt?: string;
}

export interface AccountMemorySummarySnapshot {
  id: string;
  label: string;
  summary: AccountMemorySummary;
}

export interface AccountMemorySummary {
  accountId: string;
  narrativeSummary: string;
  momentum: {
    status: AccountMomentum;
    label: string;
    reasoning: string;
  };
  people: AccountMemoryPerson[];
  tensions: string[];
  timelineHighlights: AccountTimelineItem[];
  lastComputedAt: string;
  confidence: number;                          // 0-1 overall snapshot confidence
  sourceCoverage: AccountMemorySourceCoverage;  // source diversity & freshness
}

export interface RecommendationEvidenceItem {
  sourceId: string;
  sourceKind: EvidenceSourceKind;
  sourceLabel: string;
  sourceTable?: string;
  sourceRowId?: string;
  title: string;
  excerpt: string;
  occurredAt: string;
  weight: number;
  ageDays?: number;
}

export interface RecommendationEvidenceBundle {
  accountId: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendationSummary: string;
  recommendationSurface?: 'strategic_play' | 'ad_hoc';
  isCoreRecommendationSurface?: boolean;
  confidence: number;
  evidenceStrengthLabel: string;
  lowEvidence: boolean;
  lowEvidenceReasons?: string[];
  conflictDetected: boolean;
  evidenceItems: RecommendationEvidenceItem[];
  relatedConflictIds: string[];
  /** Evidence Provenance v1: non-breaking trace metadata for explainable AI judgments. */
  provenance?: {
    evidenceIds: string[];
    sourceIds: string[];
    sourceTypes: string[];
    confidence: number;
    contradictions: { id: string; summary: string; severity?: 'high' | 'medium' | 'low'; kind?: string; sourceIds: string[] }[];
    tensions: string[];
    rationale: string;
    traces: {
      evidenceId?: string;
      sourceId: string;
      sourceType: string;
      sourceKind?: EvidenceSourceKind;
      sourceTable?: string;
      sourceRowId?: string;
      title?: string;
      excerpt?: string;
      occurredAt?: string;
      weight?: number;
    }[];
    generatedAt: string;
  };
  generatedAt: string;
}

export type JudgmentKind =
  | 'momentum'
  | 'champion_strength'
  | 'internal_alignment'
  | 'buying_urgency'
  | 'deal_risk'
  | 'stakeholder_assessment'
  | 'budget_signal'
  | 'procurement_signal'
  | 'relationship_signal'
  | 'general';

export type JudgmentStatus = 'provisional' | 'active' | 'revised' | 'resolved';

export type JudgmentValue = 'very_low' | 'low' | 'medium' | 'high' | 'very_high' | 'mixed' | 'unknown';

export interface JudgmentEvidenceRef {
  sourceId: string;
  sourceKind: EvidenceSourceKind;
  title?: string;
  sourceTable?: string;
  sourceRowId?: string;
}

export interface JudgmentRevisionItem {
  id: string;
  title: string;
  summary: string;
  changedAt: string;
  whyChanged?: string;
  evidenceRefs?: JudgmentEvidenceRef[];
}

export interface Judgment {
  id: string;
  accountId: string;
  kind: JudgmentKind;
  title: string;
  summary: string;
  rationale?: string;
  value: JudgmentValue;
  confidence: number;
  status: JudgmentStatus;
  evidenceRefs: JudgmentEvidenceRef[];
  contradictionIds?: string[];
  updatedAt: string;
  createdAt?: string;
  previousSummary?: string;
  previousTitle?: string;
  whyChanged?: string;
  changeEvidenceRefs?: JudgmentEvidenceRef[];
  revisionHistory?: JudgmentRevisionItem[];
}

export interface Contradiction {
  id: string;
  accountId: string;
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved';
  sourceIds: string[];
  detectedAt: string;
}

export interface MomentumShift {
  id: string;
  accountId: string;
  previous: AccountMomentum;
  previousLabel: string;
  previousSummary: string;
  current: AccountMomentum;
  currentLabel: string;
  currentSummary: string;
  changed: boolean;
  summary: string;
  whyChanged: string;
  evidenceRefs: JudgmentEvidenceRef[];
  occurredAt: string;
}

export interface DealPulseMetric {
  kind: 'momentum' | 'champion_strength' | 'internal_alignment' | 'buying_urgency' | 'deal_risk';
  label: string;
  value: JudgmentValue;
  summary: string;
  observations?: string[];
  confidence: number;
  previousSummary?: string;
  changeSummary?: string;
  changeSignals?: string[];
}

// 关系图谱节点
export interface RelationshipNode {
  contactId: string;
  name: string;
  title?: string;
  role?: ContactRole;
  decisionStyle?: DecisionStyle;
  reportsTo?: string;
  relationshipStrength: number;  // 0-100
  side: 'our_team' | 'their_team';
  profile?: ContactProfileResult;  // Babel Decode 深度画像
  jobLevel?: number;  // 0=AE, 1=Manager, 2=Director, 3=VP, 4=CxO
}

// 关系图谱边
export interface RelationshipEdge {
  from: string;     // contact id (our side)
  to: string;       // contact id (their side)
  strength: number; // 0-100
  lastInteraction?: string;
  interactionCount: number;
}

// 完整关系图谱
export interface RelationshipGraph {
  ourTeam: RelationshipNode[];
  theirTeam: RelationshipNode[];
  edges: RelationshipEdge[];
}

// Deal Health AI Insight data shape
export interface DealHealthInsight {
  level: DealHealth;
  score: number;           // 0-100
  reasons: string[];
  riskFactors: string[];
  recommendations: string[];
  lastDecodeSignal?: string;
  lastIntelSignal?: string;
}

// Action Suggestion AI Insight data shape
export interface ActionInsight {
  actions: {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    dueInDays: number;
    triggerEvent: string;
    relatedEntityId?: string;
  }[];
  generatedAt: string;
}

// Impact Analysis AI Insight data shape
export interface ImpactInsight {
  impactedDeals: {
    dealId: string;
    dealName: string;
    previousRisk: RiskLevel;
    newRisk: RiskLevel;
    reason: string;
  }[];
  summary: string;
  generatedAt: string;
}

// Play Impact Alert — decode → play 影响检测
export interface PlayImpactAlertInsight {
  impacted: boolean;
  playId: string;
  reason: string;
  affectedAssumptions: string[];
  suggestedAction: 'replan' | 'verify_assumption' | 'no_action';
  needs_replan?: boolean;
  sourceDecodeId: string;
  timestamp: string;
  dismissed?: boolean;
}

// ─── RFP Management Types ──────────────────────────────────────────

export type RfpStatus = 'identified' | 'preparing' | 'submitted' | 'shortlisted' | 'won' | 'lost' | 'no_bid';

export const RFP_STATUS_LABELS: Record<RfpStatus, string> = {
  identified: '已识别',
  preparing: '准备中',
  submitted: '已提交',
  shortlisted: '入围',
  won: '中标',
  lost: '落标',
  no_bid: '放弃',
};

export interface RfpDocument {
  name: string;
  type: 'rfp' | 'response' | 'clarification' | 'amendment' | 'other';
  url?: string;
  uploadedAt: string;
}

export interface RfpMilestone {
  id: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'overdue';
  assignedTo?: string;
}

export type RfpJudgmentDecision = 'bid' | 'no_bid' | 'cautious_bid' | 'need_more_intel';

export interface RfpJudgmentSignal {
  label: string;
  source: 'rfp' | 'competitor' | 'milestone' | 'opportunity' | 'account' | 'knowledge' | 'ai_inference';
  valence: 'positive' | 'negative' | 'uncertain';
  evidence: string;
}

export interface RfpJudgment {
  decision: RfpJudgmentDecision;
  confidence: number; // 0-100, confidence in the judgment itself, not win rate
  rationale: string;
  uncertainty: string;
  keyRisks: string[];
  tensions: string[];
  contradictions: string[];
  evidenceSignals: RfpJudgmentSignal[];
  narrativeChange?: string;
}

export interface Rfp {
  id: string;
  opportunityId: string;
  accountId: string;
  title: string;
  issuer: string;
  issuedDate: string;
  dueDate: string;
  status: RfpStatus;
  budget?: number;
  currency: string;
  competitors?: string[];
  requirements?: string[];
  documents: RfpDocument[];
  milestones: RfpMilestone[];
  aiAnalysis?: {
    winProbability: number;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    competitorAnalysis?: string;
    judgment?: RfpJudgment;
  };
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── RFP DB Row Types (snake_case, mirrors Supabase schema) ─────────

export interface RfpRow {
  id: string;
  org_id: string;
  opportunity_id: string;
  account_id: string;
  linked_play_id: string | null;
  title: string;
  issuer: string;
  issued_date: string | null;
  due_date: string | null;
  status: RfpStatus;
  budget: number | null;
  currency: string;
  requirements: string[];
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfpDocumentRow {
  id: string;
  org_id: string;
  rfp_id: string;
  name: string;
  doc_type: 'rfp' | 'response' | 'clarification' | 'amendment' | 'other';
  url: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface RfpMilestoneRow {
  id: string;
  org_id: string;
  rfp_id: string;
  title: string;
  due_date: string | null;
  status: 'pending' | 'completed' | 'overdue';
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfpCompetitorRow {
  id: string;
  org_id: string;
  rfp_id: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
  estimated_price: number | null;
  win_probability: number | null;
  intel_source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RfpAnalysisRow {
  id: string;
  org_id: string;
  rfp_id: string;
  analysis_type: 'full' | 'quick' | 'competitor_focused' | 'requirement_gap';
  win_probability: number | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  competitor_analysis: string | null;
  raw_output: unknown;
  ai_model: string | null;
  created_at: string;
}

// ─── AI Advice Tracking ──────────────────────────────────────────────

export interface AIAdvice {
  id: string;
  text: string;
  source: 'strategy' | 'intel' | 'meddicc';
  status: 'pending' | 'adopted' | 'ignored' | 'completed';
  accountId?: string;
  opportunityId?: string;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecodeFeedback {
  decodeId: string;
  accurate: boolean;
  comment?: string;
  createdAt: string;
}

// ─── Compiled Intelligence Layer (CIL) ─────────────────────────────

export type CILPageType =
  | 'overview'
  | 'stakeholders'
  | 'initiatives'
  | 'risks'
  | 'timeline'
  | 'open_questions';

export type CILClaimType =
  | 'stakeholder_assessment'
  | 'risk_hypothesis'
  | 'initiative_judgment'
  | 'budget_signal'
  | 'procurement_signal'
  | 'general';

export type CILClaimStatus = 'active' | 'stale' | 'archived' | 'invalidated';

export type CILEvidenceSourceType =
  | 'call_transcript'
  | 'email'
  | 'meeting_note'
  | 'news'
  | 'crm_event'
  | 'note'
  | 'upload';

export type CILEvidenceType =
  | 'commitment'
  | 'objection'
  | 'budget_signal'
  | 'procurement_signal'
  | 'champion_signal'
  | 'risk_signal'
  | 'initiative_signal'
  | 'general';

export type CILQuestionPriority = 'high' | 'medium' | 'low';
export type CILQuestionStatus = 'open' | 'answered' | 'dismissed';
export type CILUpdateType = 'ingest' | 'refresh' | 'lint' | 'manual';

export interface AccountKnowledgePage {
  id: string;
  orgId: string;
  accountId: string;
  pageType: CILPageType;
  title: string;
  contentJson: Record<string, unknown>;
  contentMd?: string;
  version: number;
  updatedBy: 'system' | 'user' | 'ai';
  createdAt: string;
  updatedAt: string;
}

export interface AccountClaim {
  id: string;
  orgId: string;
  accountId: string;
  claimType: CILClaimType;
  statement: string;
  status: CILClaimStatus;
  confidence: number;
  supportingEvidenceIds: string[];
  counterEvidenceIds: string[];
  affectedObjectIds: string[];
  lastRevalidatedAt: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountEvidence {
  id: string;
  orgId: string;
  accountId: string;
  sourceId: string;
  sourceType: CILEvidenceSourceType;
  evidenceType: CILEvidenceType;
  quoteText?: string;
  summary?: string;
  speaker?: string;
  occurredAt?: string;
  relevanceScore: number;
  linkedClaimIds: string[];
  linkedPageTypes: CILPageType[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AccountOpenQuestion {
  id: string;
  orgId: string;
  accountId: string;
  question: string;
  priority: CILQuestionPriority;
  status: CILQuestionStatus;
  relatedObjects: string[];
  blockingOutputs: string[];
  answer?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface KnowledgeUpdateLogEntry {
  id: string;
  orgId: string;
  accountId: string;
  triggerSourceId?: string;
  updateType: CILUpdateType;
  changedPages: string[];
  changedClaims: string[];
  summary?: string;
  createdAt: string;
}
