import type { Opportunity, StrategicPlay } from "@/lib/babel-engine/types";
import { normalizeProductLocale, type ProductLocale } from "@/lib/locale-contract";

export type MoujuStateStatus =
  | "no_plan"
  | "needs_calibration"
  | "in_progress"
  | "needs_executive_intervention"
  | "stale";

export interface MoujuState {
  status: MoujuStateStatus;
  label: string;
  tone: "muted" | "warning" | "positive" | "danger" | "accent";
  situation: string;
  risk: string;
  strategy: string;
  nextAction: string;
  evidence: string;
  confidence: number;
  playId?: string;
}

const ACTIVE_PLAY_STATUSES = new Set(["active", "in_progress"]);
const STALE_DAYS = 14;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function l(locale: ProductLocale, zh: string, en: string): string {
  return locale === "en" ? en : zh;
}

function activePlaysForTarget(plays: StrategicPlay[], target: { accountId: string; opportunityId?: string | null }): StrategicPlay[] {
  return plays
    .filter((play) => ACTIVE_PLAY_STATUSES.has(play.status))
    .filter((play) => play.accountId === target.accountId)
    .filter((play) => !target.opportunityId || !play.opportunityId || play.opportunityId === target.opportunityId);
}

function rankPlay(play: StrategicPlay): number {
  let score = 0;
  if (play.momentum === "blocked") score += 80;
  if (play.momentum === "stalled") score += 65;
  if (play.momentum === "slowing") score += 45;
  if ((play.daysSinceProgress ?? 0) >= STALE_DAYS) score += 40;
  if (play.assumptions?.some((assumption) => assumption.status === "invalidated")) score += 35;
  if (play.steps?.some((step) => step.status === "blocked" || step.status === "invalidated")) score += 30;
  if ((play.confidence ?? 0) < 50) score += 20;
  return score + Math.max(0, 100 - (play.confidence ?? 0));
}

function pickPrimaryPlay(plays: StrategicPlay[]): StrategicPlay | undefined {
  return [...plays].sort((a, b) => rankPlay(b) - rankPlay(a))[0];
}

function findObstacle(play: StrategicPlay): string {
  const invalidated = play.assumptions?.find((assumption) => assumption.status === "invalidated");
  if (invalidated) return `假设需要校准：${invalidated.text}`;
  const blockedStep = play.steps?.find((step) => step.status === "blocked" || step.status === "invalidated");
  if (blockedStep) return blockedStep.blockerReason || blockedStep.risk || `步骤受阻：${blockedStep.title}`;
  if (play.momentum === "blocked") return "谋局已阻塞，需要人工判断阻力来源。";
  if (play.momentum === "stalled") return "谋局停滞，当前路径没有带来新进展。";
  if (play.momentum === "slowing") return "谋局推进放缓，需要确认下一步是否仍有效。";
  if ((play.daysSinceProgress ?? 0) >= STALE_DAYS) return `${play.daysSinceProgress} 天无进展，判断可能已经过期。`;
  return firstNonEmpty(play.riskCounterEvidence?.[0], play.knowledgeGaps?.[0], "暂无明显阻力，但仍需要持续用客户反馈校准。");
}

function findObstacleEn(play: StrategicPlay): string {
  const invalidated = play.assumptions?.find((assumption) => assumption.status === "invalidated");
  if (invalidated) return `Assumption needs calibration: ${invalidated.text}`;
  const blockedStep = play.steps?.find((step) => step.status === "blocked" || step.status === "invalidated");
  if (blockedStep) return blockedStep.blockerReason || blockedStep.risk || `Step blocked: ${blockedStep.title}`;
  if (play.momentum === "blocked") return "The play is blocked and needs human judgment on the source of resistance.";
  if (play.momentum === "stalled") return "The play has stalled and the current path is not producing progress.";
  if (play.momentum === "slowing") return "The play is slowing; confirm whether the next move is still valid.";
  if ((play.daysSinceProgress ?? 0) >= STALE_DAYS) return `${play.daysSinceProgress} days without progress; the judgment may be stale.`;
  return firstNonEmpty(play.riskCounterEvidence?.[0], play.knowledgeGaps?.[0], "No obvious blocker yet, but keep calibrating with customer feedback.");
}

function findNextAction(play: StrategicPlay): string {
  const executableStep = play.steps?.find((step) => step.status === "planned" || step.status === "pending" || step.status === "in_progress" || step.status === "blocked");
  return firstNonEmpty(
    executableStep?.nextAction,
    executableStep?.action,
    executableStep?.title,
    play.actionPlan?.[0]?.action,
    "确认当前谋局是否仍成立，并把下一步动作分配给 owner。",
  );
}

function findNextActionEn(play: StrategicPlay): string {
  const executableStep = play.steps?.find((step) => step.status === "planned" || step.status === "pending" || step.status === "in_progress" || step.status === "blocked");
  return firstNonEmpty(
    executableStep?.nextAction,
    executableStep?.action,
    executableStep?.title,
    play.actionPlan?.[0]?.action,
    "Confirm whether the current play still holds and assign the next move to an owner.",
  );
}

export function buildMoujuStateForTarget(args: {
  plays: StrategicPlay[];
  accountId: string;
  opportunity?: Pick<Opportunity, "id" | "value" | "meddicc" | "stage"> | null;
  accountName?: string;
  locale?: ProductLocale;
}): MoujuState {
  const { plays, accountId, opportunity, accountName } = args;
  const locale = normalizeProductLocale(args.locale);
  const targetPlays = activePlaysForTarget(plays, { accountId, opportunityId: opportunity?.id });
  const play = pickPrimaryPlay(targetPlays);
  const highValue = (opportunity?.value ?? 0) >= 1_000_000;
  const lowDealEvidence = (opportunity?.meddicc?.overallScore ?? 100) < 50;

  if (!play) {
    const needsExecutive = highValue && lowDealEvidence;
    return {
      status: needsExecutive ? "needs_executive_intervention" : "no_plan",
      label: needsExecutive ? l(locale, "需要高层介入", "Needs executive intervention") : l(locale, "无谋局", "No play"),
      tone: needsExecutive ? "danger" : "muted",
      situation: accountName ? l(locale, `${accountName} 还没有活跃谋局承接当前判断。`, `${accountName} does not have an active play carrying the current judgment.`) : l(locale, "当前对象还没有活跃谋局承接判断。", "This target does not have an active play carrying the judgment."),
      risk: needsExecutive ? l(locale, "高价值商机缺少清晰推进路径，预测可信度不足。", "A high-value opportunity lacks a clear path, so forecast confidence is weak.") : l(locale, "没有谋局时，风险和下一步容易停留在人脑里。", "Without a play, risk and next moves tend to stay implicit."),
      strategy: l(locale, "先建立一条最小可执行谋局：目标、阻力、证据、owner、下一步。", "Create the smallest executable play first: goal, resistance, evidence, owner, and next move."),
      nextAction: l(locale, "创建谋局或从现有客户判断生成一条推进路径。", "Create a play or generate a path from the existing account judgment."),
      evidence: l(locale, `活跃谋局 0 条${opportunity ? ` · MEDDICC ${opportunity.meddicc?.overallScore ?? 0}` : ""}`.trim(), `Active plays 0${opportunity ? ` · MEDDICC ${opportunity.meddicc?.overallScore ?? 0}` : ""}`.trim()),
      confidence: 0.42,
    };
  }

  const obstacle = locale === "en" ? findObstacleEn(play) : findObstacle(play);
  const nextAction = locale === "en" ? findNextActionEn(play) : findNextAction(play);
  const hasInvalidatedAssumption = play.assumptions?.some((assumption) => assumption.status === "invalidated") ?? false;
  const hasBlockedStep = play.steps?.some((step) => step.status === "blocked" || step.status === "invalidated") ?? false;
  const isStale = (play.daysSinceProgress ?? 0) >= STALE_DAYS;
  const needsCalibration = hasInvalidatedAssumption || hasBlockedStep || play.momentum === "blocked" || play.momentum === "stalled" || play.momentum === "slowing" || (play.confidence ?? 0) < 50;
  const needsExecutive = highValue && (needsCalibration || lowDealEvidence);
  const status: MoujuStateStatus = needsExecutive
    ? "needs_executive_intervention"
    : isStale
      ? "stale"
      : needsCalibration
        ? "needs_calibration"
        : "in_progress";

  const labels: Record<MoujuStateStatus, string> = {
    no_plan: l(locale, "无谋局", "No play"),
    needs_calibration: l(locale, "需要校准", "Needs calibration"),
    in_progress: l(locale, "推进中", "In progress"),
    needs_executive_intervention: l(locale, "需要高层介入", "Needs executive intervention"),
    stale: l(locale, "已过期", "Stale"),
  };
  const tones: Record<MoujuStateStatus, MoujuState["tone"]> = {
    no_plan: "muted",
    needs_calibration: "warning",
    in_progress: "positive",
    needs_executive_intervention: "danger",
    stale: "accent",
  };

  return {
    status,
    label: labels[status],
    tone: tones[status],
    situation: firstNonEmpty(play.situationJudgment, play.goalDescription),
    risk: obstacle,
    strategy: firstNonEmpty(play.strategicObjective, play.goalDescription),
    nextAction,
    evidence: l(locale, `置信度 ${play.confidence ?? 0}% · ${play.steps?.filter((step) => step.status === "done" || step.status === "completed").length ?? 0}/${play.steps?.length ?? 0} 步完成 · ${play.daysSinceProgress ?? 0} 天无进展`, `Confidence ${play.confidence ?? 0}% · ${play.steps?.filter((step) => step.status === "done" || step.status === "completed").length ?? 0}/${play.steps?.length ?? 0} steps done · ${play.daysSinceProgress ?? 0} days without progress`),
    confidence: Math.max(0, Math.min(1, (play.confidence ?? 0) / 100)),
    playId: play.id,
  };
}
