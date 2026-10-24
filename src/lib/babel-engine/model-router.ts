// BABEL Engine — Model Router
// Intelligent routing: selects Flash or Pro based on task context.

import type { ModelTier } from './gemini';

export interface RoutingContext {
  task:
    | 'decode'
    | 'strategy'
    | 'profile'
    | 'cultural'
    | 'meeting_prep'
    | 'account_strategy'
    | 'compose_email'
    | 'general';
  dealValue?: number;       // deal value in USD
  complexity?: 'low' | 'medium' | 'high';
  contactCount?: number;
}

export function selectTier(ctx: RoutingContext): ModelTier {
  // 谋局（strategy）永远用 Pro，不管单子大小——这是核心功能
  if (ctx.task === 'strategy') return 'pro';

  // 其他高价值任务也用 Pro
  if (ctx.task === 'account_strategy' || ctx.task === 'meeting_prep') return 'pro';

  // 大单任何任务都用 Pro
  if (ctx.dealValue != null && ctx.dealValue >= 100000) return 'pro';

  // 高复杂度
  if (ctx.complexity === 'high') return 'pro';

  // 其他 → Flash
  return 'flash';
}

export function getModelConfig(ctx: RoutingContext): { tier: ModelTier } {
  return { tier: selectTier(ctx) };
}
