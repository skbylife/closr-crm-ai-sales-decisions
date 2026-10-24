import { formatCurrency } from '@/lib/format-currency';
import type { DealHealth, OpportunityStage, TaskPriority, TaskStatus } from '@/lib/babel-engine/types';

export type PortfolioEvidenceHealth = 'sufficient' | 'thin' | 'missing';
export type PortfolioJudgmentSignalTone = 'critical' | 'warning' | 'focus' | 'muted' | 'positive';

export type PortfolioJudgmentSignalKind =
  | 'stuck_deal'
  | 'coaching_candidate'
  | 'manager_verify'
  | 'executive_intervention'
  | 'forecast_contradiction'
  | 'false_activity'
  | 'evidence_health'
  | 'ownership_gap';

export interface PortfolioAccountInput {
  id: string;
  name: string;
  userId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  businessTeamId?: string | null;
  businessTeamName?: string | null;
  dealValue?: number | null;
  dealHealth?: DealHealth | null;
  lastActivity?: string | null;
}

export interface PortfolioOpportunityInput {
  id: string;
  accountId: string;
  name: string;
  value?: number | null;
  stage?: OpportunityStage | string | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
  updatedAt?: string | null;
  meddicc?: {
    overallScore?: number | null;
    metrics?: { status?: string | null; evidence?: string | null } | null;
    economicBuyer?: { status?: string | null; accessLevel?: string | null } | null;
    decisionCriteria?: unknown[] | null;
    decisionProcess?: Array<{ status?: string | null; owner?: string | null; dueDate?: string | null }> | null;
    identifiedPain?: unknown[] | null;
    champion?: { strength?: number | null; lastEngagement?: string | null; notes?: string | null } | null;
  } | null;
  mutualActionPlan?: {
    confidence?: number | null;
    milestones?: Array<{ status?: string | null; dueDate?: string | null; title?: string | null }> | null;
  } | null;
}

export interface PortfolioTaskInput {
  id: string;
  accountId?: string | null;
  opportunityId?: string | null;
  title: string;
  status?: TaskStatus | string | null;
  priority?: TaskPriority | string | null;
  dueDate?: string | null;
  updatedAt?: string | null;
}

export interface PortfolioPursuitTeamInput {
  id: string;
  accountId: string;
  opportunityId?: string | null;
  name: string;
  status?: string | null;
  leadUserId?: string | null;
  leadName?: string | null;
  memberCount?: number | null;
  responsibilityLabels?: string[] | null;
}

export interface PortfolioConflictInput {
  id: string;
  accountId: string;
  summary: string;
  severity?: string | null;
  kind?: string | null;
  detectedAt?: string | null;
}

export interface PortfolioQuestionInput {
  id: string;
  accountId: string;
  question: string;
  priority?: number | null;
  context?: string | null;
}

export interface PortfolioJudgmentSignal {
  id: string;
  kind: PortfolioJudgmentSignalKind;
  accountId: string;
  accountName: string;
  opportunityId?: string;
  opportunityName?: string;
  opportunityValue?: number;
  reason: string;
  recommendedAction: string;
  drilldownHref: string;
  evidenceHealth: PortfolioEvidenceHealth;
  confidence?: number;
  tone: PortfolioJudgmentSignalTone;
  rankScore: number;
  tags: string[];
}

export type PortfolioManagementQueueType =
  | 'intervene'
  | 'verify'
  | 'cool_down'
  | 'false_activity'
  | 'ownership_gap';

export interface PortfolioManagementQueueItem {
  id: string;
  queueType: PortfolioManagementQueueType;
  accountId: string;
  accountName: string;
  opportunityId?: string;
  opportunityName?: string;
  value?: number;
  stage?: string;
  currentJudgment: string;
  whyThisMatters: string;
  recommendedAction: string;
  evidenceHealth: PortfolioEvidenceHealth;
  ownerSummary: {
    status: 'assigned' | 'recommended' | 'gap';
    ownerUserId?: string;
    ownerName?: string;
    responsibility?: string;
    dueDate?: string;
  };
  drilldownHref: string;
  rankScore: number;
  tags: string[];
}

export interface PortfolioRoleJudgmentView {
  stuckDeals: PortfolioJudgmentSignal[];
  coachingCandidates: PortfolioJudgmentSignal[];
  verifyBeforeEscalate: PortfolioJudgmentSignal[];
  forecastContradictions: PortfolioJudgmentSignal[];
  falseActivity: PortfolioJudgmentSignal[];
  evidenceHealth: PortfolioJudgmentSignal[];
  resourceAllocationCandidates?: PortfolioJudgmentSignal[];
  executiveInterventionCandidates?: PortfolioJudgmentSignal[];
  nonInterventionCandidates?: PortfolioJudgmentSignal[];
}

export interface PortfolioJudgmentView {
  schemaVersion: 1;
  generatedFrom: 'portfolio_judgment_core';
  summary: {
    openAccounts: number;
    openOpportunities: number;
    stuckDeals: number;
    executiveCandidates: number;
    verifyBeforeEscalate: number;
    evidenceThin: number;
    ownershipGaps: number;
    forecastContradictions: number;
    falseActivityCount: number;
  };
  managementQueue: PortfolioManagementQueueItem[];
  manager: PortfolioRoleJudgmentView;
  executive: PortfolioRoleJudgmentView;
}

export interface BuildPortfolioJudgmentViewParams {
  accounts: PortfolioAccountInput[];
  opportunities: PortfolioOpportunityInput[];
  tasks?: PortfolioTaskInput[] | null;
  pursuitTeams?: PortfolioPursuitTeamInput[] | null;
  conflicts?: PortfolioConflictInput[] | null;
  questions?: PortfolioQuestionInput[] | null;
  now?: Date;
  highValueThreshold?: number;
}

const CLOSED_STAGES = new Set(['closed_won', 'closed_lost']);
const LATE_STAGES = new Set(['proposal_sent', 'negotiation', 'contract_review']);
const CRITICAL_SEVERITIES = new Set(['critical', 'high']);

const DEAL_HEALTH_LABELS: Record<string, string> = {
  critical: '高风险',
  at_risk: '有风险',
  healthy: '健康',
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function numeric(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isOpenOpportunity(opp: PortfolioOpportunityInput): boolean {
  return !CLOSED_STAGES.has(cleanText(opp.stage).toLowerCase());
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  const text = cleanText(value);
  if (!text) return null;
  const time = new Date(text).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((now.getTime() - time) / 86_400_000);
}

function isOverdue(value: string | null | undefined, now: Date): boolean {
  const text = cleanText(value);
  if (!text) return false;
  const time = new Date(text).getTime();
  return Number.isFinite(time) && time < now.getTime();
}

function accountDrilldown(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=overview`;
}

function playDrilldown(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=plays`;
}

function accountTeamDrilldown(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=team`;
}

function meddiccScore(opp: PortfolioOpportunityInput): number {
  return Math.max(0, Math.min(100, numeric(opp.meddicc?.overallScore, 0)));
}

function countEvidenceIndicators(args: {
  account: PortfolioAccountInput;
  opp: PortfolioOpportunityInput;
  tasks: PortfolioTaskInput[];
  conflicts: PortfolioConflictInput[];
  questions: PortfolioQuestionInput[];
  now: Date;
}): number {
  const { account, opp, tasks, conflicts, questions, now } = args;
  let count = 0;
  if (opp.meddicc?.metrics?.status === 'confirmed' || opp.meddicc?.metrics?.status === 'partial') count += 1;
  if (cleanText(opp.meddicc?.metrics?.evidence)) count += 1;
  if (opp.meddicc?.economicBuyer?.status && opp.meddicc.economicBuyer.status !== 'unknown') count += 1;
  if ((opp.meddicc?.decisionCriteria?.length ?? 0) > 0) count += 1;
  if ((opp.meddicc?.identifiedPain?.length ?? 0) > 0) count += 1;
  if ((opp.meddicc?.decisionProcess?.length ?? 0) > 0) count += 1;
  if (numeric(opp.meddicc?.champion?.strength, 0) >= 3 && (cleanText(opp.meddicc?.champion?.lastEngagement) || cleanText(opp.meddicc?.champion?.notes))) count += 1;
  if (tasks.length > 0) count += 1;
  if (conflicts.length > 0 || questions.length > 0) count += 1;
  const lastActivityDays = daysSince(account.lastActivity ?? opp.updatedAt, now);
  if (lastActivityDays !== null && lastActivityDays <= 30) count += 1;
  return count;
}

function getEvidenceHealth(args: {
  account: PortfolioAccountInput;
  opp: PortfolioOpportunityInput;
  tasks: PortfolioTaskInput[];
  conflicts: PortfolioConflictInput[];
  questions: PortfolioQuestionInput[];
  now: Date;
}): PortfolioEvidenceHealth {
  const indicators = countEvidenceIndicators(args);
  if (indicators >= 4 || meddiccScore(args.opp) >= 65) return 'sufficient';
  if (indicators >= 2 || meddiccScore(args.opp) >= 35) return 'thin';
  return 'missing';
}

function confidenceFromEvidence(health: PortfolioEvidenceHealth, score: number): number {
  const base = health === 'sufficient' ? 0.78 : health === 'thin' ? 0.48 : 0.25;
  return Math.max(0.1, Math.min(0.95, base + (score - 50) / 300));
}

function isHighValueOrStrategic(account: PortfolioAccountInput, opp: PortfolioOpportunityInput, threshold: number): boolean {
  const value = Math.max(numeric(opp.value, 0), numeric(account.dealValue, 0));
  const stage = cleanText(opp.stage).toLowerCase();
  return value >= threshold || LATE_STAGES.has(stage);
}

function getDecisionOwners(opp: PortfolioOpportunityInput): string[] {
  return (opp.meddicc?.decisionProcess ?? [])
    .map((step) => cleanText(step.owner))
    .filter(Boolean)
    .slice(0, 2);
}

function executiveCanInfluence(opp: PortfolioOpportunityInput): boolean {
  const economicBuyer = cleanText(opp.meddicc?.economicBuyer?.status).toLowerCase();
  const access = cleanText(opp.meddicc?.economicBuyer?.accessLevel).toLowerCase();
  return economicBuyer === 'engaged' || economicBuyer === 'identified' || access.includes('executive') || access.includes('cxo') || getDecisionOwners(opp).length > 0;
}

function buildExecutiveReason(params: {
  opp: PortfolioOpportunityInput;
  score: number;
  value: number;
  staleDays: number | null;
  blockedMap: boolean;
  overdueTasks: PortfolioTaskInput[];
  contradictionConflict?: PortfolioConflictInput;
  probabilityContradiction: boolean;
  lateStageWeakEvidence: boolean;
}): string {
  const { opp, score, value, staleDays, blockedMap, overdueTasks, contradictionConflict, probabilityContradiction, lateStageWeakEvidence } = params;
  const reasons: string[] = [];
  const owners = getDecisionOwners(opp);
  const buyerStatus = cleanText(opp.meddicc?.economicBuyer?.status).toLowerCase();
  const buyerAccess = cleanText(opp.meddicc?.economicBuyer?.accessLevel).toLowerCase();
  if (owners.length > 0) reasons.push(`决策流程已有负责人：${owners.join('、')}，需要高层确认谁能给最终承诺。`);
  else if (buyerStatus === 'engaged' || buyerStatus === 'identified') reasons.push('预算/决策人已被识别或正在接触，需要高层校准对方真实授权和承诺边界。');
  else if (buyerAccess.includes('executive') || buyerAccess.includes('cxo')) reasons.push('当前路径已经触达高层入口，需要同级别资源承接，避免销售单点推进。');

  if (blockedMap) reasons.push('行动计划里已有受阻或高风险里程碑，需要高层协调资源或重排优先级。');
  if (overdueTasks.length > 0) reasons.push(`${overdueTasks.length} 个关键动作已逾期，需要明确责任人和截止时间。`);
  if (staleDays !== null && staleDays > 21) reasons.push(`${staleDays} 天没有有效推进，继续由一线单独跟进容易变成静默丢单。`);
  if (probabilityContradiction) reasons.push(`预测概率 ${numeric(opp.probability)}% 但资格评分只有 ${score}，需要高层重新校准预测口径。`);
  if (lateStageWeakEvidence) reasons.push('机会已进入后期阶段，但证据不足以支撑提交承诺，需要高层决定是否继续投入资源。');
  if (contradictionConflict?.summary) reasons.push(`存在判断冲突：${contradictionConflict.summary}`);
  if (value > 0) reasons.push(`机会金额约 ${formatCurrency(value)}，资源投入和承诺口径需要高层拍板。`);
  return reasons.slice(0, 3).join(' ');
}

function buildExecutiveAction(params: {
  opp: PortfolioOpportunityInput;
  overdueTasks: PortfolioTaskInput[];
  blockedMap: boolean;
}): string {
  const owners = getDecisionOwners(params.opp);
  const ownerText = owners.length > 0 ? `约 ${owners.join('、')} 做一次决策路径确认` : '先确认预算/决策人和采购负责人';
  const riskText = params.blockedMap
    ? '同时处理已受阻里程碑'
    : params.overdueTasks.length > 0
      ? `同时清理 ${params.overdueTasks.length} 个逾期动作`
      : '同时确认下一步责任人和时间';
  return `高层介入建议：${ownerText}，${riskText}，会后更新预测概率和资源承诺。`;
}

function hasBlockedMap(opp: PortfolioOpportunityInput): boolean {
  return (opp.mutualActionPlan?.milestones ?? []).some((m) => m.status === 'blocked' || m.status === 'at_risk');
}

function rankByScore<T extends PortfolioJudgmentSignal>(items: T[], limit: number): T[] {
  return [...items].sort((a, b) => b.rankScore - a.rankScore || (b.opportunityValue ?? 0) - (a.opportunityValue ?? 0)).slice(0, limit);
}

function dedupeByAccountAndKind(items: PortfolioJudgmentSignal[]): PortfolioJudgmentSignal[] {
  const seen = new Set<string>();
  const result: PortfolioJudgmentSignal[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.accountId}:${item.opportunityId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildSignal(params: Omit<PortfolioJudgmentSignal, 'drilldownHref'> & { drilldownHref?: string }): PortfolioJudgmentSignal {
  return {
    ...params,
    drilldownHref: params.drilldownHref ?? accountDrilldown(params.accountId),
  };
}

function buildQueueItemFromSignal(signal: PortfolioJudgmentSignal, queueType: PortfolioManagementQueueType): PortfolioManagementQueueItem {
  const hasOpportunity = Boolean(cleanText(signal.opportunityName));
  const subject = hasOpportunity
    ? `${signal.opportunityName} 需要管理层判断。`
    : `${signal.accountName} 需要管理层判断。`;
  const currentJudgment = queueType === 'intervene'
    ? `${subject}当前已满足高层介入候选条件。`
    : queueType === 'verify'
      ? `${subject}当前还不能直接升级，需要先核验证据。`
      : queueType === 'false_activity'
        ? `${subject}当前动作数量不等于判断进展。`
        : `${subject}当前需要进入管理判断队列。`;

  return {
    id: `${queueType}:${signal.id}`,
    queueType,
    accountId: signal.accountId,
    accountName: signal.accountName,
    ...(signal.opportunityId ? { opportunityId: signal.opportunityId } : {}),
    ...(signal.opportunityName ? { opportunityName: signal.opportunityName } : {}),
    ...(typeof signal.opportunityValue === 'number' ? { value: signal.opportunityValue } : {}),
    currentJudgment,
    whyThisMatters: signal.reason,
    recommendedAction: signal.recommendedAction,
    evidenceHealth: signal.evidenceHealth,
    ownerSummary: { status: 'gap', responsibility: '需要明确判断责任人' },
    drilldownHref: signal.drilldownHref,
    rankScore: signal.rankScore,
    tags: signal.tags,
  };
}

function selectPursuitTeamForOpportunity(teams: PortfolioPursuitTeamInput[], opp: PortfolioOpportunityInput): PortfolioPursuitTeamInput | undefined {
  const activeTeams = teams.filter((team) => cleanText(team.status || 'active') === 'active');
  return activeTeams.find((team) => team.opportunityId === opp.id)
    ?? activeTeams.find((team) => team.accountId === opp.accountId && !team.opportunityId)
    ?? activeTeams.find((team) => team.accountId === opp.accountId);
}

function buildOwnershipGapItem(params: {
  account: PortfolioAccountInput;
  opp: PortfolioOpportunityInput;
  team?: PortfolioPursuitTeamInput;
  evidenceHealth: PortfolioEvidenceHealth;
  value: number;
  score: number;
  highPriorityQuestion: boolean;
  highValueThreshold: number;
}): PortfolioManagementQueueItem | null {
  const { account, opp, team, evidenceHealth, value, score, highPriorityQuestion, highValueThreshold } = params;
  const hasAccountOwner = Boolean(cleanText(account.ownerId) || cleanText(account.userId));
  const hasBusinessTeam = Boolean(cleanText(account.businessTeamId));
  const hasPursuitTeam = Boolean(team);
  const memberCount = numeric(team?.memberCount, 0);
  const responsibilityLabels = (team?.responsibilityLabels ?? []).map(cleanText).filter(Boolean);

  const gaps: string[] = [];
  if (!hasAccountOwner) gaps.push('客户负责人未明确');
  if (!hasBusinessTeam) gaps.push('管理团队归属未设置');
  if (!hasPursuitTeam) gaps.push('项目推进责任未拆分');
  else if (memberCount === 0) gaps.push('推进组暂无成员');
  if (hasPursuitTeam && memberCount > 0 && responsibilityLabels.length === 0) gaps.push('推进组已有成员，但关键职责标签未覆盖');

  if (gaps.length === 0) return null;

  const shouldSurface = isHighValueOrStrategic(account, opp, highValueThreshold)
    || evidenceHealth !== 'sufficient'
    || account.dealHealth === 'critical'
    || account.dealHealth === 'at_risk'
    || highPriorityQuestion;
  if (!shouldSurface) return null;

  const accountOwnerId = cleanText(account.ownerId) || cleanText(account.userId);
  const teamLeadUserId = cleanText(team?.leadUserId);
  const ownerUserId = accountOwnerId || teamLeadUserId;
  const ownerName = cleanText(account.ownerName) || cleanText(team?.leadName);
  const ownerStatus: PortfolioManagementQueueItem['ownerSummary']['status'] = accountOwnerId
    ? 'assigned'
    : teamLeadUserId
      ? 'recommended'
      : 'gap';
  const responsibility = ownerStatus === 'assigned'
    ? '当前客户负责人'
    : ownerStatus === 'recommended'
      ? '建议由项目牵头人先核验判断'
      : '需要管理者确认判断责任人';

  return {
    id: `ownership-gap:${opp.id}`,
    queueType: 'ownership_gap',
    accountId: account.id,
    accountName: account.name,
    opportunityId: opp.id,
    opportunityName: opp.name,
    value,
    stage: cleanText(opp.stage) || undefined,
    currentJudgment: `${opp.name} 仍在推进，但${gaps[0]}。`,
    whyThisMatters: `${gaps.join('；')}。这会让关键判断没人负责核验，管理层看到风险但无法追到责任闭环。`,
    recommendedAction: ownerStatus === 'gap'
      ? '先在账户页确认客户负责人或项目推进组；AI 只提示缺口，不自动指派 owner。'
      : `建议由${ownerName}先核验这条判断，并在账户团队里补齐缺失职责。`,
    evidenceHealth,
    ownerSummary: {
      status: ownerStatus,
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(ownerName ? { ownerName } : {}),
      responsibility,
    },
    drilldownHref: accountTeamDrilldown(account.id),
    rankScore: value / 1200 + gaps.length * 35 + (100 - score) + (highPriorityQuestion ? 20 : 0),
    tags: ['ownership-gap', evidenceHealth, ...gaps.slice(0, 2)],
  };
}

export function buildPortfolioJudgmentView(params: BuildPortfolioJudgmentViewParams): PortfolioJudgmentView {
  const now = params.now ?? new Date();
  const highValueThreshold = params.highValueThreshold ?? 100_000;
  const accounts = new Map(params.accounts.map((account) => [account.id, account]));
  const tasks = params.tasks ?? [];
  const pursuitTeams = params.pursuitTeams ?? [];
  const conflicts = params.conflicts ?? [];
  const questions = params.questions ?? [];
  const openOpps = params.opportunities.filter(isOpenOpportunity);

  const managerSignals: PortfolioJudgmentSignal[] = [];
  const executiveEligible: PortfolioJudgmentSignal[] = [];
  const nonIntervention: PortfolioJudgmentSignal[] = [];
  const forecastContradictions: PortfolioJudgmentSignal[] = [];
  const falseActivity: PortfolioJudgmentSignal[] = [];
  const evidenceSignals: PortfolioJudgmentSignal[] = [];
  const ownershipGapItems: PortfolioManagementQueueItem[] = [];

  for (const opp of openOpps) {
    const account = accounts.get(opp.accountId);
    if (!account) continue;

    const accountTasks = tasks.filter((task) => task.accountId === account.id || task.opportunityId === opp.id);
    const openTasks = accountTasks.filter((task) => task.status !== 'done');
    const overdueTasks = openTasks.filter((task) => isOverdue(task.dueDate, now));
    const accountConflicts = conflicts.filter((conflict) => conflict.accountId === account.id);
    const accountQuestions = questions.filter((question) => question.accountId === account.id);
    const evidenceHealth = getEvidenceHealth({ account, opp, tasks: accountTasks, conflicts: accountConflicts, questions: accountQuestions, now });
    const score = meddiccScore(opp);
    const value = numeric(opp.value, numeric(account.dealValue, 0));
    const stage = cleanText(opp.stage).toLowerCase();
    const staleDays = daysSince(account.lastActivity ?? opp.updatedAt, now);
    const criticalHealth = account.dealHealth === 'critical' || account.dealHealth === 'at_risk';
    const blockedMap = hasBlockedMap(opp);
    const weakChampion = numeric(opp.meddicc?.champion?.strength, 0) > 0 && numeric(opp.meddicc?.champion?.strength, 0) <= 2;
    const unknownBuyer = cleanText(opp.meddicc?.economicBuyer?.status).toLowerCase() === 'unknown';
    const highPriorityQuestion = accountQuestions.some((q) => numeric(q.priority, 0) >= 2);
    const stuck = criticalHealth || score < 50 || blockedMap || overdueTasks.length > 0 || (staleDays !== null && staleDays > 21 && value > 0);
    const ownershipGap = buildOwnershipGapItem({
      account,
      opp,
      team: selectPursuitTeamForOpportunity(pursuitTeams.filter((team) => team.accountId === account.id), opp),
      evidenceHealth,
      value,
      score,
      highPriorityQuestion,
      highValueThreshold,
    });
    if (ownershipGap) ownershipGapItems.push(ownershipGap);

    if (stuck) {
      const reasons = [
        criticalHealth ? `账户健康度为 ${DEAL_HEALTH_LABELS[cleanText(account.dealHealth)] ?? account.dealHealth}` : '',
        score < 50 ? `资格评分 ${score}` : '',
        blockedMap ? 'MAP 有阻塞/风险里程碑' : '',
        overdueTasks.length > 0 ? `${overdueTasks.length} 个逾期动作` : '',
        staleDays !== null && staleDays > 21 ? `${staleDays} 天无新活动` : '',
      ].filter(Boolean).join('；');

      managerSignals.push(buildSignal({
        id: `stuck:${opp.id}`,
        kind: 'stuck_deal',
        accountId: account.id,
        accountName: account.name,
        opportunityId: opp.id,
        opportunityName: opp.name,
        opportunityValue: value,
        reason: reasons || '开放机会出现推进停滞信号。',
        recommendedAction: evidenceHealth === 'sufficient' ? '让经理复盘卡点并决定是否升级资源。' : '先让经理与销售核验证据，再决定是否升级。',
        evidenceHealth,
        confidence: confidenceFromEvidence(evidenceHealth, score),
        tone: account.dealHealth === 'critical' || overdueTasks.length > 1 ? 'critical' : 'warning',
        rankScore: value / 1000 + (100 - score) + overdueTasks.length * 15 + (account.dealHealth === 'critical' ? 80 : 0),
        tags: ['stuck-deal', evidenceHealth],
      }));
    }

    if (weakChampion || unknownBuyer || highPriorityQuestion || score < 60) {
      const reason = weakChampion
        ? '内部推动者影响力偏弱，需要辅导销售重新验证内部推动力。'
        : unknownBuyer
          ? '经济决策人仍未知，团队判断不能直接上升到高层动作。'
          : highPriorityQuestion
            ? '存在高优先级未决问题，先把判断变成验证动作。'
            : '资格评分偏低，适合经理辅导而非直接升级。';
      managerSignals.push(buildSignal({
        id: `coach:${opp.id}`,
        kind: 'coaching_candidate',
        accountId: account.id,
        accountName: account.name,
        opportunityId: opp.id,
        opportunityName: opp.name,
        opportunityValue: value,
        reason,
        recommendedAction: '安排一次 15 分钟机会复盘：只问证据、下一步验证对象、升级条件。',
        evidenceHealth,
        confidence: confidenceFromEvidence(evidenceHealth, score),
        tone: evidenceHealth === 'missing' ? 'critical' : 'focus',
        rankScore: value / 1500 + (100 - score) + (highPriorityQuestion ? 25 : 0),
        tags: ['coaching', evidenceHealth],
      }));
    }

    const contradictionConflict = accountConflicts.find((conflict) => {
      const kind = cleanText(conflict.kind).toLowerCase();
      return kind.includes('forecast') || kind.includes('contradiction') || CRITICAL_SEVERITIES.has(cleanText(conflict.severity).toLowerCase());
    });
    const probabilityContradiction = numeric(opp.probability, 0) >= 70 && (score < 50 || account.dealHealth === 'critical');
    const lateStageWeakEvidence = LATE_STAGES.has(stage) && evidenceHealth !== 'sufficient';
    if (contradictionConflict || probabilityContradiction || lateStageWeakEvidence) {
      forecastContradictions.push(buildSignal({
        id: `forecast:${contradictionConflict?.id ?? opp.id}`,
        kind: 'forecast_contradiction',
        accountId: account.id,
        accountName: account.name,
        opportunityId: opp.id,
        opportunityName: opp.name,
        opportunityValue: value,
        reason: contradictionConflict?.summary || (probabilityContradiction ? `预测概率 ${numeric(opp.probability)}% 但资格评分/健康度不支持。` : '机会进入后期阶段，但证据健康度不足以支撑预测承诺。'),
        recommendedAction: evidenceHealth === 'sufficient' ? '在预测会议上单独校准承诺、风险和资源动作。' : '先交给经理核验证据，补足证据后再进入预测承诺。',
        evidenceHealth,
        confidence: confidenceFromEvidence(evidenceHealth, score),
        tone: evidenceHealth === 'sufficient' ? 'critical' : 'warning',
        rankScore: value / 1000 + (probabilityContradiction ? 50 : 0) + (lateStageWeakEvidence ? 30 : 0),
        tags: ['forecast', evidenceHealth],
      }));
    }

    if (openTasks.length >= 3 && evidenceHealth !== 'sufficient' && score < 55) {
      falseActivity.push(buildSignal({
        id: `false-activity:${opp.id}`,
        kind: 'false_activity',
        accountId: account.id,
        accountName: account.name,
        opportunityId: opp.id,
        opportunityName: opp.name,
        opportunityValue: value,
        reason: `${openTasks.length} 个动作在推进，但关键证据仍薄，存在“忙但没有判断进展”。`,
        recommendedAction: '暂停新增动作，要求销售用一条客户证据更新判断核心。',
        evidenceHealth,
        confidence: confidenceFromEvidence(evidenceHealth, score),
        tone: 'warning',
        rankScore: openTasks.length * 20 + value / 2000 + (55 - score),
        tags: ['false-activity', evidenceHealth],
      }));
    }

    if (evidenceHealth !== 'sufficient' && (stuck || isHighValueOrStrategic(account, opp, highValueThreshold))) {
      evidenceSignals.push(buildSignal({
        id: `evidence:${opp.id}`,
        kind: 'evidence_health',
        accountId: account.id,
        accountName: account.name,
        opportunityId: opp.id,
        opportunityName: opp.name,
        opportunityValue: value,
        reason: evidenceHealth === 'missing' ? '缺少足够判断证据，任何升级都可能只是猜测。' : '证据仍薄，只能作为经理核验输入。',
        recommendedAction: '补一条来自客户、采购或内部推动者的一手证据，再重算团队判断。',
        evidenceHealth,
        confidence: confidenceFromEvidence(evidenceHealth, score),
        tone: evidenceHealth === 'missing' ? 'critical' : 'warning',
        rankScore: value / 1200 + (evidenceHealth === 'missing' ? 60 : 30),
        tags: ['evidence-health', evidenceHealth],
      }));
    }

    if (stuck || contradictionConflict || probabilityContradiction || lateStageWeakEvidence) {
      const strategic = isHighValueOrStrategic(account, opp, highValueThreshold);
      const influenceable = executiveCanInfluence(opp);
      const executiveEligibleSignal = evidenceHealth === 'sufficient' && strategic && influenceable;
      const baseSignal = buildSignal({
        id: `exec:${opp.id}`,
        kind: executiveEligibleSignal ? 'executive_intervention' : 'manager_verify',
        accountId: account.id,
        accountName: account.name,
        opportunityId: opp.id,
        opportunityName: opp.name,
        opportunityValue: value,
        reason: evidenceHealth !== 'sufficient'
          ? '证据不足，不能直接推荐高层介入。'
          : !strategic
            ? '不是高价值/战略机会，高层介入会稀释注意力。'
            : !influenceable
              ? '尚未发现高层可影响的对象或决策路径。'
              : buildExecutiveReason({
                opp,
                score,
                value,
                staleDays,
                blockedMap,
                overdueTasks,
                contradictionConflict,
                probabilityContradiction,
                lateStageWeakEvidence,
              }),
        recommendedAction: executiveEligibleSignal
          ? buildExecutiveAction({ opp, overdueTasks, blockedMap })
          : '保持在经理核验：补证据、确认对象、定义升级条件。',
        evidenceHealth,
        confidence: confidenceFromEvidence(evidenceHealth, score),
        tone: executiveEligibleSignal ? 'critical' : 'muted',
        rankScore: value / 1000 + (strategic ? 40 : 0) + (influenceable ? 25 : 0) + (evidenceHealth === 'sufficient' ? 30 : -30),
        tags: ['executive-gate', evidenceHealth, strategic ? 'strategic' : 'non-strategic', influenceable ? 'influenceable' : 'not-influenceable'],
      });
      if (baseSignal.kind === 'executive_intervention') executiveEligible.push(baseSignal);
      else nonIntervention.push(baseSignal);
    }
  }

  const managerStuck = rankByScore(managerSignals.filter((s) => s.kind === 'stuck_deal'), 5);
  const managerCoaching = rankByScore(managerSignals.filter((s) => s.kind === 'coaching_candidate'), 5);
  const managerVerify = rankByScore([
    ...nonIntervention,
    ...evidenceSignals.map((signal) => ({ ...signal, kind: 'manager_verify' as const, id: `verify:${signal.opportunityId ?? signal.accountId}` })),
  ], 5);
  const rankedForecast = rankByScore(dedupeByAccountAndKind(forecastContradictions), 5);
  const rankedFalseActivity = rankByScore(falseActivity, 5);
  const rankedEvidence = rankByScore(evidenceSignals, 5);
  const rankedExecutive = rankByScore(executiveEligible, 5);
  const rankedNonIntervention = rankByScore(nonIntervention, 5);
  const rankedOwnershipGaps = [...ownershipGapItems].sort((a, b) => b.rankScore - a.rankScore).slice(0, 5);
  const managementQueue = [
    ...rankedExecutive.map((signal) => buildQueueItemFromSignal(signal, 'intervene')),
    ...managerVerify.map((signal) => buildQueueItemFromSignal(signal, 'verify')),
    ...rankedFalseActivity.map((signal) => buildQueueItemFromSignal(signal, 'false_activity')),
    ...rankedOwnershipGaps,
  ].sort((a, b) => b.rankScore - a.rankScore).slice(0, 8);

  return {
    schemaVersion: 1,
    generatedFrom: 'portfolio_judgment_core',
    summary: {
      openAccounts: new Set(openOpps.map((opp) => opp.accountId)).size,
      openOpportunities: openOpps.length,
      stuckDeals: managerStuck.length,
      executiveCandidates: rankedExecutive.length,
      verifyBeforeEscalate: managerVerify.length,
      evidenceThin: rankedEvidence.length,
      ownershipGaps: rankedOwnershipGaps.length,
      forecastContradictions: rankedForecast.length,
      falseActivityCount: rankedFalseActivity.length,
    },
    managementQueue,
    manager: {
      stuckDeals: managerStuck,
      coachingCandidates: managerCoaching,
      verifyBeforeEscalate: managerVerify,
      forecastContradictions: rankedForecast,
      falseActivity: rankedFalseActivity,
      evidenceHealth: rankedEvidence,
    },
    executive: {
      stuckDeals: [],
      coachingCandidates: [],
      verifyBeforeEscalate: managerVerify,
      forecastContradictions: rankedForecast,
      falseActivity: rankedFalseActivity,
      evidenceHealth: rankedEvidence,
      resourceAllocationCandidates: rankedExecutive,
      executiveInterventionCandidates: rankedExecutive,
      nonInterventionCandidates: rankedNonIntervention,
    },
  };
}
