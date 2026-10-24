import { getMeddiccScore } from '@/lib/meddicc';
import { getOpportunityOwnerUserId } from '@/lib/opportunity-ownership';
import type { Account, Opportunity, OrgMember, SavedDecode, StrategicPlay, Task } from '@/lib/babel-engine/types';

const CLOSED_WON = 'closed_won';
const CLOSED_LOST = 'closed_lost';

export type RepScorecardSortKey =
  | 'overall'
  | 'judgment'
  | 'forecast'
  | 'execution'
  | 'coverage'
  | 'pipeline'
  | 'revenue';

export interface RepQuotaInput {
  userId?: string | null;
  teamId?: string | null;
  targetAmount?: number | null;
}

export interface RepScorecard {
  userId: string;
  name: string;
  email?: string;
  role?: string;
  teamId?: string;
  activeDeals: number;
  wonDeals: number;
  lostDeals: number;
  pipelineValue: number;
  wonValue: number;
  quota: number;
  quotaAttainment: number;
  winRate: number;
  avgMeddicc: number;
  decodeCount: number;
  tasksDone: number;
  tasksOverdue: number;
  strategicPlayCount: number;
  strategicPlayStepCompletion: number;
  forecastRiskAmount: number;
  forecastContradictions: number;
  judgmentGaps: number;
  coverageGaps: number;
  executionRisks: number;
  relationshipCoverageScore: number;
  revenueOutcomeScore: number;
  forecastCalibrationScore: number;
  judgmentQualityScore: number;
  executionReliabilityScore: number;
  overallScore: number;
  coachingActions: string[];
  primaryCoachingFocus: string;
  hiddenSignalCount: number;
  reviewSignals: RepReviewSignal[];
}

export type RepReviewSignalSeverity = 'critical' | 'warning' | 'stable';

export interface RepReviewSignal {
  id: string;
  severity: RepReviewSignalSeverity;
  label: string;
  summary: string;
  detail: string;
}

export interface BuildRepScorecardsParams {
  members: OrgMember[];
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
  decodes: SavedDecode[];
  strategicPlays?: StrategicPlay[];
  quotas?: RepQuotaInput[];
  now?: Date;
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function round(n: number): number {
  return Math.round(clamp(n));
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function memberName(member: OrgMember): string {
  if (member.displayName?.trim()) return member.displayName.trim();
  if (member.email?.trim()) {
    return member.email.split('@')[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return member.userId.slice(0, 8);
}

function isOpenOpportunity(opp: Opportunity): boolean {
  return opp.stage !== CLOSED_WON && opp.stage !== CLOSED_LOST;
}

function isOverdue(task: Task, now: Date): boolean {
  if (task.status === 'done' || !task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due.getTime() < now.getTime();
}

function assignedTask(task: Task, userId: string): boolean {
  return task.assignedTo === userId || (!task.assignedTo && task.userId === userId);
}

function quotaForMember(member: OrgMember, members: OrgMember[], quotas: RepQuotaInput[]): number {
  const direct = quotas
    .filter((quota) => quota.userId === member.userId)
    .reduce((sum, quota) => sum + numberValue(quota.targetAmount), 0);
  if (direct > 0) return direct;

  const teamQuota = member.teamId
    ? quotas.filter((quota) => quota.teamId === member.teamId && !quota.userId)
      .reduce((sum, quota) => sum + numberValue(quota.targetAmount), 0)
    : 0;
  if (teamQuota > 0) {
    const teamSize = Math.max(1, members.filter((item) => item.teamId === member.teamId).length);
    return Math.round(teamQuota / teamSize);
  }

  const orgQuota = quotas
    .filter((quota) => !quota.userId && !quota.teamId)
    .reduce((sum, quota) => sum + numberValue(quota.targetAmount), 0);
  return orgQuota > 0 ? Math.round(orgQuota / Math.max(1, members.length)) : 0;
}

function meddiccGapCount(opp: Opportunity, account?: Account): number {
  const meddicc = opp.meddicc;
  let gaps = 0;
  if (!meddicc || getMeddiccScore(meddicc, account?.contacts ?? []) <= 0) return 4;
  if (!meddicc.metrics?.evidence && meddicc.metrics?.status !== 'confirmed') gaps += 1;
  if (!meddicc.economicBuyer?.status || meddicc.economicBuyer.status === 'unknown') gaps += 1;
  if ((meddicc.decisionCriteria ?? []).length === 0) gaps += 1;
  if ((meddicc.identifiedPain ?? []).length === 0) gaps += 1;
  if (!meddicc.champion?.strength || meddicc.champion.strength <= 2) gaps += 1;
  return gaps;
}

function relationshipCoverage(account: Account | undefined, opportunities: Opportunity[]): { score: number; gaps: number } {
  const contacts = account?.contacts ?? [];
  if (contacts.length === 0 && opportunities.length > 0) return { score: 20, gaps: opportunities.length };
  if (contacts.length === 0) return { score: 0, gaps: 0 };

  const roles = new Set(contacts.map((contact) => contact.role).filter(Boolean));
  let score = Math.min(35, contacts.length * 10);
  let gaps = 0;
  if (roles.has('champion')) score += 25;
  else gaps += 1;
  if (roles.has('decision_maker') || roles.has('economic_buyer')) score += 25;
  else gaps += 1;
  if (contacts.some((contact) => contact.lastContactedAt)) score += 15;
  return { score: round(score), gaps };
}

function strategicPlayCompletion(plays: StrategicPlay[]): number {
  const steps = plays.flatMap((play) => play.steps ?? []);
  if (steps.length === 0) return 0;
  const done = steps.filter((step) => step.status === 'completed' || step.status === 'done').length;
  return round((done / steps.length) * 100);
}

export function buildRepScorecards(params: BuildRepScorecardsParams): RepScorecard[] {
  const now = params.now ?? new Date();
  const accountsById = new Map(params.accounts.map((account) => [account.id, account]));
  const opportunitiesByOwner = new Map<string, Opportunity[]>();
  for (const opp of params.opportunities) {
    const owner = getOpportunityOwnerUserId(opp);
    if (!owner) continue;
    const list = opportunitiesByOwner.get(owner) ?? [];
    list.push(opp);
    opportunitiesByOwner.set(owner, list);
  }

  return params.members.map((member) => {
    const myOpps = opportunitiesByOwner.get(member.userId) ?? [];
    const activeOpps = myOpps.filter(isOpenOpportunity);
    const wonOpps = myOpps.filter((opp) => opp.stage === CLOSED_WON);
    const lostOpps = myOpps.filter((opp) => opp.stage === CLOSED_LOST);
    const closedOpps = [...wonOpps, ...lostOpps];
    const myTasks = params.tasks.filter((task) => assignedTask(task, member.userId));
    const tasksDone = myTasks.filter((task) => task.status === 'done').length;
    const tasksOverdue = myTasks.filter((task) => isOverdue(task, now)).length;
    const myDecodes = params.decodes.filter((decode) => decode.userId === member.userId);
    const myPlays = (params.strategicPlays ?? []).filter((play) => {
      if (play.userId === member.userId) return true;
      if (play.opportunityId) return activeOpps.some((opp) => opp.id === play.opportunityId);
      return false;
    });

    const pipelineValue = activeOpps.reduce((sum, opp) => sum + numberValue(opp.value), 0);
    const wonValue = wonOpps.reduce((sum, opp) => sum + numberValue(opp.value), 0);
    const winRate = closedOpps.length > 0 ? round((wonOpps.length / closedOpps.length) * 100) : 0;
    const quota = quotaForMember(member, params.members, params.quotas ?? []);
    const quotaAttainment = quota > 0 ? round((wonValue / quota) * 100) : 0;

    const meddiccScores = activeOpps
      .map((opp) => getMeddiccScore(opp.meddicc, accountsById.get(opp.accountId)?.contacts ?? []))
      .filter((score) => score > 0);
    const avgMeddicc = meddiccScores.length > 0
      ? round(meddiccScores.reduce((sum, score) => sum + score, 0) / meddiccScores.length)
      : 0;

    let judgmentGaps = 0;
    let coverageGaps = 0;
    let relationshipScoreTotal = 0;
    let forecastContradictions = 0;
    let forecastRiskAmount = 0;
    const accountIds = new Set(activeOpps.map((opp) => opp.accountId));

    for (const opp of activeOpps) {
      const account = accountsById.get(opp.accountId);
      const meddiccScore = getMeddiccScore(opp.meddicc, account?.contacts ?? []);
      const evidenceProbability = Math.max(10, meddiccScore);
      const probabilityGap = numberValue(opp.probability) - evidenceProbability;
      if (probabilityGap >= 25 || (numberValue(opp.probability) >= 70 && meddiccScore < 55)) {
        forecastContradictions += 1;
        forecastRiskAmount += numberValue(opp.value);
      }
      judgmentGaps += meddiccGapCount(opp, account);
    }

    for (const accountId of accountIds) {
      const accountOpps = activeOpps.filter((opp) => opp.accountId === accountId);
      const coverage = relationshipCoverage(accountsById.get(accountId), accountOpps);
      relationshipScoreTotal += coverage.score;
      coverageGaps += coverage.gaps;
    }

    const relationshipCoverageScore = accountIds.size > 0 ? round(relationshipScoreTotal / accountIds.size) : 0;
    const strategicPlayStepCompletion = strategicPlayCompletion(myPlays);
    const executionRisks = tasksOverdue + myPlays.filter((play) => play.momentum === 'stalled' || play.momentum === 'blocked' || play.daysSinceProgress >= 14).length;

    const revenueOutcomeScore = round(Math.min(50, quotaAttainment * 0.5) + Math.min(35, pipelineValue / 100_000) + Math.min(15, winRate * 0.15));
    const forecastCalibrationScore = round(100 - Math.min(75, forecastContradictions * 22 + (pipelineValue > 0 ? (forecastRiskAmount / pipelineValue) * 45 : 0)));
    const judgmentQualityScore = round((avgMeddicc || 35) * 0.7 + Math.max(0, 30 - judgmentGaps * 4));
    const executionReliabilityScore = round(
      (myTasks.length > 0 ? (tasksDone / myTasks.length) * 65 : 45)
      + (strategicPlayStepCompletion || 0) * 0.25
      - tasksOverdue * 12
    );
    const overallScore = round(
      revenueOutcomeScore * 0.2
      + forecastCalibrationScore * 0.2
      + judgmentQualityScore * 0.25
      + executionReliabilityScore * 0.2
      + relationshipCoverageScore * 0.15
    );

    const reviewSignals: RepReviewSignal[] = [];
    if (forecastContradictions > 0) {
      reviewSignals.push({
        id: 'forecast',
        severity: forecastRiskAmount >= 500_000 ? 'critical' : 'warning',
        label: '预测校准',
        summary: forecastContradictions + ' 个机会的销售概率高于证据支撑',
        detail: '涉及 ' + formatScorecardAmount(forecastRiskAmount) + ' 商机金额。经理复盘时先看概率口径、销售方法论证据和客户下一步承诺是否一致。',
      });
    }
    if (judgmentGaps > 0) {
      reviewSignals.push({
        id: 'judgment',
        severity: judgmentGaps >= 4 ? 'warning' : 'stable',
        label: '判断证据',
        summary: judgmentGaps + ' 个关键判断缺口',
        detail: '优先补齐指标、经济买方、决策标准、痛点或支持者证据；不需要把所有原始证据默认铺开。',
      });
    }
    if (coverageGaps > 0) {
      reviewSignals.push({
        id: 'coverage',
        severity: 'warning',
        label: '关系覆盖',
        summary: coverageGaps + ' 个关键人覆盖缺口',
        detail: '检查支持者、决策人或经济买方是否明确，以及最近互动是否足以支撑当前推进判断。',
      });
    }
    if (tasksOverdue > 0 || executionRisks > tasksOverdue) {
      reviewSignals.push({
        id: 'execution',
        severity: tasksOverdue > 0 ? 'warning' : 'stable',
        label: '执行可靠性',
        summary: tasksOverdue > 0 ? tasksOverdue + ' 个逾期动作' : '谋局推进存在停滞信号',
        detail: '只把影响本周推进的动作带进 1:1；低价值历史任务不默认占用管理层注意力。',
      });
    }

    const coachingActions = reviewSignals.map((signal) => signal.summary);
    if (coachingActions.length === 0 && activeOpps.length > 0) coachingActions.push('保持当前节奏，继续校准下一步判断');
    const primaryCoachingFocus = reviewSignals[0]?.summary
      ?? (activeOpps.length > 0 ? '当前没有明显管理介入信号' : '暂无活跃机会可评估');

    return {
      userId: member.userId,
      name: memberName(member),
      email: member.email,
      role: member.jobTitle,
      teamId: member.teamId,
      activeDeals: activeOpps.length,
      wonDeals: wonOpps.length,
      lostDeals: lostOpps.length,
      pipelineValue,
      wonValue,
      quota,
      quotaAttainment,
      winRate,
      avgMeddicc,
      decodeCount: myDecodes.length,
      tasksDone,
      tasksOverdue,
      strategicPlayCount: myPlays.length,
      strategicPlayStepCompletion,
      forecastRiskAmount,
      forecastContradictions,
      judgmentGaps,
      coverageGaps,
      executionRisks,
      relationshipCoverageScore,
      revenueOutcomeScore,
      forecastCalibrationScore,
      judgmentQualityScore,
      executionReliabilityScore,
      overallScore,
      coachingActions: coachingActions.slice(0, 3),
      primaryCoachingFocus,
      hiddenSignalCount: Math.max(0, reviewSignals.length - 1),
      reviewSignals,
    };
  });
}

function formatScorecardAmount(amount: number): string {
  if (amount >= 1_000_000) return (amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (amount >= 1_000) return Math.round(amount / 1_000) + 'K';
  return String(Math.round(amount));
}

export function sortRepScorecards(scorecards: RepScorecard[], sortBy: RepScorecardSortKey): RepScorecard[] {
  const value = (scorecard: RepScorecard): number => {
    if (sortBy === 'judgment') return scorecard.judgmentQualityScore;
    if (sortBy === 'forecast') return scorecard.forecastCalibrationScore;
    if (sortBy === 'execution') return scorecard.executionReliabilityScore;
    if (sortBy === 'coverage') return scorecard.relationshipCoverageScore;
    if (sortBy === 'pipeline') return scorecard.pipelineValue;
    if (sortBy === 'revenue') return scorecard.wonValue;
    return scorecard.overallScore;
  };

  return [...scorecards].sort((a, b) => value(b) - value(a) || b.pipelineValue - a.pipelineValue);
}
