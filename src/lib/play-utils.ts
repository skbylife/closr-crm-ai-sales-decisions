// Play Utilities — momentum calculation, progress tracking

import type { PlayMomentum } from '@/lib/babel-engine/types';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';

/**
 * 根据最近活动时间自动计算谋局动量
 */
export function calculateMomentum(play: { steps: Record<string, unknown>[]; lastStepAt?: string; status: string }): PlayMomentum {
  if (play.status === 'completed' || play.status === 'abandoned') return 'active';

  const lastActivity = play.lastStepAt ? new Date(play.lastStepAt) : null;
  if (!lastActivity) return 'active';

  const daysSince = Math.floor((Date.now() - lastActivity.getTime()) / 86400000);

  if (daysSince <= 3) return 'progressing';
  if (daysSince <= 7) return 'active';
  if (daysSince <= 14) return 'slowing';
  return 'stalled';
  // 'blocked' is only set manually or by upstream dependency
}

/**
 * 动态计算谋局置信度
 * 
 * 规则：
 * - 基础 = AI 初始置信度
 * - 已完成步骤占比 × 20  （做得越多越有信心）
 * - 被跳过步骤 × -5      （跳步说明计划有偏差）
 * - 已验证假设 × +5       （假设验证增强信心）
 * - 已推翻假设 × -10      （假设错了，信心下降）
 * - 停滞天数 > 14 → -1/天 （太久没动，信心衰减）
 * - 结果范围：5 ~ 99
 */
export function calculateConfidence(play: {
  confidence: number;
  steps: Record<string, unknown>[];
  assumptions?: Record<string, unknown>[];
  lastStepAt?: string;
}): number {
  const baseConfidence = play.confidence;
  const steps = play.steps;
  const total = steps.length;
  if (total === 0) return baseConfidence;

  const completed = steps.filter((s) => normalizePlayStepExecutionStatus(s.status) === 'done').length;
  const skipped = steps.filter((s) => s.status === 'skipped' || normalizePlayStepExecutionStatus(s.status) === 'invalidated').length;

  // Step progress bonus: up to +20 at 100% completion
  const progressBonus = Math.round((completed / total) * 20);

  // Skip penalty: -5 per skipped step
  const skipPenalty = skipped * 5;

  // Assumption modifiers
  const assumptions = play.assumptions ?? [];
  const verified = assumptions.filter((a) => a.status === 'verified').length;
  const invalidated = assumptions.filter((a) => a.status === 'invalidated').length;
  const assumptionBonus = verified * 5;
  const assumptionPenalty = invalidated * 10;

  // Staleness penalty: -1 per day after 14 days of no progress
  let stalenessPenalty = 0;
  if (play.lastStepAt) {
    const daysSince = Math.floor((Date.now() - new Date(play.lastStepAt).getTime()) / 86400000);
    if (daysSince > 14) {
      stalenessPenalty = daysSince - 14;
    }
  }

  const result = baseConfidence + progressBonus - skipPenalty + assumptionBonus - assumptionPenalty - stalenessPenalty;

  // Clamp to 5-99
  return Math.max(5, Math.min(99, Math.round(result)));
}

/**
 * 计算距离上次完成步骤的天数
 */
export function calculateDaysSinceProgress(play: { steps: Record<string, unknown>[] }): number {
  const completedSteps = play.steps.filter(
    (s) => normalizePlayStepExecutionStatus(s.status) === 'done' && s.completedAt
  );
  if (completedSteps.length === 0) return 0;

  const lastCompleted = completedSteps.sort(
    (a, b) =>
      new Date(b.completedAt as string).getTime() -
      new Date(a.completedAt as string).getTime()
  )[0];

  return Math.floor(
    (Date.now() - new Date(lastCompleted.completedAt as string).getTime()) / 86400000
  );
}
