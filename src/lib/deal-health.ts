import type { DealHealth, Contact, Task, Opportunity } from '@/lib/babel-engine/types';

// ─── Types ────────────────────────────────────────────────────────────

/** Optional CIL context for enriching deal health with compiled intelligence */
export interface DealHealthCILContext {
  /** CIL lint health score (0-100) */
  cilHealthScore?: number;
  /** Number of stale claims */
  staleClaims?: number;
  /** Number of contradiction findings */
  contradictions?: number;
  /** Number of high-priority open questions blocking outputs */
  blockingQuestions?: number;
  /** Number of active claims */
  activeClaims?: number;
}

export interface DealHealthInput {
  opportunity: Opportunity;
  account: { lastActivity?: string; contacts: Contact[] };
  tasks: Task[];
  cil?: DealHealthCILContext;
  now?: Date;
  locale?: 'zh' | 'en';
}

export type DealMomentum = 'building' | 'steady' | 'stalling';

export interface DealContradiction {
  id: string;
  conflictClass: 'execution_gap' | 'relationship_gap' | 'confidence_gap';
  summary: string;
  sources: string[];
}

export interface DealHealthResult {
  level: DealHealth;
  reasons: string[];
  daysSinceActivity: number;
  /** 0-100 composite stagnation score (higher = more stagnant / unhealthy) */
  stagnationScore: number;
  momentum: DealMomentum;
  riskFlags: string[];
  missingSignals: string[];
  contradictions: DealContradiction[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function daysBetween(from: string | Date, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86400000);
}

// ─── Core Computation ─────────────────────────────────────────────────

export function computeDealHealth(input: DealHealthInput): DealHealthResult {
  const { opportunity, account, tasks, now = new Date() } = input;
  const en = input.locale === 'en';
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const missingSignals: string[] = [];

  // 1. Determine most recent activity date
  const activityDates: string[] = [];
  if (account.lastActivity) activityDates.push(account.lastActivity);
  if (opportunity.updatedAt) activityDates.push(opportunity.updatedAt);

  // Completed tasks count as activity
  const oppTasks = tasks.filter((t) => t.opportunityId === opportunity.id || t.accountId === opportunity.accountId);
  for (const t of oppTasks) {
    if (t.status === 'done') activityDates.push(t.updatedAt);
  }

  const latestActivity = activityDates.length > 0
    ? activityDates.reduce((a, b) => (a > b ? a : b))
    : opportunity.createdAt;

  const daysSinceActivity = daysBetween(latestActivity, now);

  // 2. Base level from activity recency
  let level: DealHealth;
  if (daysSinceActivity <= 7) {
    level = 'healthy';
    reasons.push(en ? `Activity within ${daysSinceActivity} days` : `${daysSinceActivity}天内有活动`);
  } else if (daysSinceActivity <= 14) {
    level = 'at_risk';
    reasons.push(en ? `No activity for ${daysSinceActivity} days (7-14 days)` : `${daysSinceActivity}天无活动（7-14天）`);
    riskFlags.push(en ? 'No effective progress action in the last 7-14 days' : '最近 7-14 天缺少有效推进动作');
  } else {
    level = 'critical';
    reasons.push(en ? `No activity for ${daysSinceActivity} days (over 14 days)` : `${daysSinceActivity}天无活动（超过14天）`);
    riskFlags.push(en ? 'Customer progress is clearly stalled' : '客户推进已明显停滞');
  }

  // 3. Champion modifier
  const champions = account.contacts.filter((c) => c.role === 'champion');
  if (champions.length > 0) {
    const recentChampionContact = champions.some((c) => {
      if (!c.lastContactedAt) return false;
      return daysBetween(c.lastContactedAt, now) <= 14;
    });
    if (recentChampionContact) {
      // Upgrade one level
      if (level === 'at_risk') {
        level = 'healthy';
        reasons.push(en ? 'Champion has recent engagement; upgraded' : '有Champion且近期联系，升级');
      } else if (level === 'critical') {
        level = 'at_risk';
        reasons.push(en ? 'Champion has recent engagement; upgraded' : '有Champion且近期联系，升级');
      }
    }
  } else {
    // No champion — downgrade
    missingSignals.push(en ? 'Missing clear champion signal' : '缺少明确内部推动者信号');
    if (level === 'healthy') {
      level = 'at_risk';
      reasons.push(en ? 'No champion contact; downgraded' : '无内部推动者联系人，降级');
    } else if (level === 'at_risk') {
      level = 'critical';
      reasons.push(en ? 'No champion contact; downgraded' : '无内部推动者联系人，降级');
    }
  }

  // 4. No pending tasks — downgrade
  const pendingTasks = oppTasks.filter((t) => t.status === 'todo' || t.status === 'in_progress');
  if (pendingTasks.length === 0) {
    missingSignals.push(en ? 'No clear next-step task' : '没有明确的下一步任务');
    if (level === 'healthy') {
      level = 'at_risk';
      reasons.push(en ? 'No pending task; downgraded' : '无待办任务，降级');
    } else if (level === 'at_risk') {
      level = 'critical';
      reasons.push(en ? 'No pending task; downgraded' : '无待办任务，降级');
    }
  }

  // 5. Overdue tasks — downgrade
  const overdueTasks = oppTasks.filter((t) => {
    if (t.status === 'done') return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < now;
  });
  if (overdueTasks.length > 0) {
    riskFlags.push(en ? `${overdueTasks.length} overdue tasks` : `${overdueTasks.length} 个任务已逾期`);
    if (level === 'healthy') {
      level = 'at_risk';
      reasons.push(en ? `${overdueTasks.length} overdue tasks; downgraded` : `${overdueTasks.length}个逾期任务，降级`);
    } else if (level === 'at_risk') {
      level = 'critical';
      reasons.push(en ? `${overdueTasks.length} overdue tasks; downgraded` : `${overdueTasks.length}个逾期任务，降级`);
    }
  }

  // 6. CIL intelligence quality modifiers
  if (input.cil) {
    const { cilHealthScore, staleClaims, contradictions, blockingQuestions } = input.cil;

    // Stale claims indicate outdated intelligence
    if (staleClaims && staleClaims >= 3) {
      riskFlags.push(en ? `${staleClaims} compiled intelligence items are stale` : `${staleClaims} 条编译情报已过期`);
      if (level === 'healthy') {
        level = 'at_risk';
        reasons.push(en ? `${staleClaims} stale compiled intelligence items; downgraded` : `${staleClaims}条编译情报已过期，降级`);
      }
    }

    // Contradictions mean conflicting intelligence
    if (contradictions && contradictions >= 2) {
      riskFlags.push(en ? `${contradictions} conflicting intelligence items need judgment` : `${contradictions} 条矛盾情报待裁决`);
      if (level === 'healthy') {
        level = 'at_risk';
        reasons.push(en ? `${contradictions} conflicting intelligence items; downgraded` : `${contradictions}条矛盾情报待解决，降级`);
      }
    }

    // High-priority blocking questions
    if (blockingQuestions && blockingQuestions >= 1) {
      missingSignals.push(en ? `${blockingQuestions} key questions need verification` : `${blockingQuestions} 个关键问题待验证`);
      if (level === 'healthy') {
        level = 'at_risk';
        reasons.push(en ? `${blockingQuestions} key questions unresolved; downgraded` : `${blockingQuestions}个关键问题待解答，降级`);
      }
    }

    // Very low CIL health score
    if (cilHealthScore !== undefined && cilHealthScore < 40) {
      riskFlags.push(en ? `Compiled intelligence health score is only ${cilHealthScore}` : `编译情报健康分仅 ${cilHealthScore}`);
      if (level === 'healthy') {
        level = 'at_risk';
        reasons.push(en ? `Compiled intelligence health score is only ${cilHealthScore}; downgraded` : `编译情报健康分仅 ${cilHealthScore}，降级`);
      }
    }
  }

  const momentum: DealMomentum = daysSinceActivity <= 5 && overdueTasks.length === 0 && pendingTasks.length > 0
    ? 'building'
    : daysSinceActivity <= 10 && overdueTasks.length <= 1
      ? 'steady'
      : 'stalling';

  const contradictions: DealContradiction[] = [];
  if (champions.length === 0 && pendingTasks.length > 0) {
    contradictions.push({
      id: 'relationship-gap',
      conflictClass: 'relationship_gap',
      summary: en ? 'Tasks are moving, but there is no champion relationship anchor' : '任务在推进，但缺少内部推动者关系支点',
      sources: en ? ['Contact roles', 'Task status'] : ['联系人角色', '待办任务状态'],
    });
  }
  if (pendingTasks.length === 0 && daysSinceActivity <= 7) {
    contradictions.push({
      id: 'execution-gap',
      conflictClass: 'execution_gap',
      summary: en ? 'There was recent activity, but no next action was captured' : '最近有活动，但没有沉淀成下一步动作',
      sources: en ? ['Recent activity date', 'Task status'] : ['最近活动时间', '待办任务状态'],
    });
  }
  if ((input.cil?.contradictions ?? 0) > 0) {
    contradictions.push({
      id: 'confidence-gap',
      conflictClass: 'confidence_gap',
      summary: en ? `Compiled intelligence has ${input.cil?.contradictions} conflicting judgments` : `编译情报存在 ${input.cil?.contradictions} 条冲突判断`,
      sources: ['CIL contradiction count', 'CIL health signals'],
    });
  }

  // Compute composite stagnation score (0-100, higher = worse)
  const stagnationScore = computeStagnationScore(level, daysSinceActivity, reasons, input.cil);

  return {
    level,
    reasons,
    daysSinceActivity,
    stagnationScore,
    momentum,
    riskFlags: Array.from(new Set(riskFlags)),
    missingSignals: Array.from(new Set(missingSignals)),
    contradictions,
  };
}

// ─── Stagnation Score ────────────────────────────────────────────────

function computeStagnationScore(
  level: DealHealth,
  daysSinceActivity: number,
  reasons: string[],
  cil?: DealHealthCILContext,
): number {
  // Base score from activity recency (0-50)
  let score = Math.min(50, daysSinceActivity * 3);

  // Level-based bump
  if (level === 'at_risk') score += 15;
  if (level === 'critical') score += 30;

  // Reason count modifier (more reasons = more problems)
  score += Math.min(15, (reasons.length - 1) * 3);

  // CIL quality penalty
  if (cil) {
    if (cil.cilHealthScore !== undefined) {
      // Invert: low CIL health = high stagnation penalty
      score += Math.max(0, Math.round((100 - cil.cilHealthScore) * 0.1));
    }
    if (cil.staleClaims) score += Math.min(5, cil.staleClaims);
    if (cil.contradictions) score += Math.min(5, cil.contradictions * 2);
    if (cil.blockingQuestions) score += Math.min(5, cil.blockingQuestions * 2);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Stagnation Hints Generator ──────────────────────────────────────

export interface StagnationHintsInput {
  opportunity?: { updatedAt?: string; stage?: string; name?: string };
  tasks?: { status?: string; title?: string }[];
  contacts?: { id: string; name: string; role?: string; title?: string }[];
  intelItems?: { content?: string; priority?: string; signalType?: string; impactDirection?: string; suggestedAction?: { label?: string } }[];
  cil?: DealHealthCILContext & {
    openQuestionTexts?: string[];
    contradictionTexts?: string[];
    /** Ranked contradictions with severity from Intelligence Agent */
    rankedContradictions?: { text: string; severity: 'high' | 'medium' | 'low'; reason: string }[];
    /** Aging claims count (7-14 days old) */
    agingClaims?: number;
  };
  now?: Date;
}

/**
 * Generate structured stagnation hints from deal context + CIL data.
 * Used by chat route to inject context into Sales Agent.
 */
export function generateStagnationHints(input: StagnationHintsInput): string[] {
  const hints: string[] = [];
  const now = input.now ?? new Date();

  // Activity recency
  if (input.opportunity?.updatedAt) {
    const updatedMs = new Date(input.opportunity.updatedAt).getTime();
    if (!Number.isNaN(updatedMs)) {
      const daysSinceUpdate = Math.floor((now.getTime() - updatedMs) / (24 * 60 * 60 * 1000));
      if (daysSinceUpdate >= 7) {
        hints.push(`当前商机已超过 ${daysSinceUpdate} 天未更新`);
      }
    }
  }

  // No tasks
  const tasks = input.tasks ?? [];
  if (tasks.length === 0) {
    hints.push('当前上下文未看到推进任务');
  } else {
    const overdue = tasks.filter((t) => t.status !== 'done');
    if (overdue.length === 0) {
      hints.push('所有任务已完成但无新跟进任务');
    }
  }

  // Single-threaded
  const contacts = input.contacts ?? [];
  if (contacts.length <= 1) {
    hints.push('当前客户可能仍处于单线程推进');
  }

  // No intel
  const intelItems = input.intelItems ?? [];
  if (intelItems.length === 0) {
    hints.push('当前上下文缺少最新情报信号');
  }

  // CIL-derived stagnation signals
  if (input.cil) {
    if (input.cil.staleClaims && input.cil.staleClaims > 0) {
      const urgencyNote = input.cil.staleClaims >= 3 ? '（已影响 Deal 健康度）' : '';
      hints.push(`编译情报中有 ${input.cil.staleClaims} 条判断已过期，需要 refresh${urgencyNote}`);
    }
    if (input.cil.agingClaims && input.cil.agingClaims > 0) {
      hints.push(`另有 ${input.cil.agingClaims} 条判断即将过期（7-14天），建议尽快验证`);
    }
    if (input.cil.contradictions && input.cil.contradictions > 0) {
      hints.push(`编译情报中存在 ${input.cil.contradictions} 条矛盾判断，需人工裁决`);
    }
    // Use ranked contradictions when available (from Intelligence Agent enrichment)
    if (input.cil.rankedContradictions?.length) {
      const highSev = input.cil.rankedContradictions.filter((c) => c.severity === 'high');
      if (highSev.length > 0) {
        hints.push(`⚠️ 高优先矛盾（${highSev.length}条）需立即裁决，直接影响推进决策`);
        for (const c of highSev.slice(0, 2)) {
          hints.push(`  → ${c.text}（${c.reason}）`);
        }
      }
    } else if (input.cil.contradictionTexts?.length) {
      for (const c of input.cil.contradictionTexts.slice(0, 2)) {
        hints.push(`矛盾情报：${c}`);
      }
    }
    if (input.cil.blockingQuestions && input.cil.blockingQuestions > 0) {
      hints.push(`有 ${input.cil.blockingQuestions} 个关键开放问题阻塞 AI 推理`);
    }
    if (input.cil.openQuestionTexts?.length) {
      for (const q of input.cil.openQuestionTexts.slice(0, 2)) {
        hints.push(`待解答：${q}`);
      }
    }
    if (input.cil.cilHealthScore !== undefined && input.cil.cilHealthScore < 50) {
      hints.push(`编译情报健康分仅 ${input.cil.cilHealthScore}/100，建议补充新证据`);
    }
  }

  return hints;
}

/**
 * Generate intel action hints from available intelligence items + CIL claims.
 */
export function generateIntelActionHints(
  intelItems: { content?: string; priority?: string; signalType?: string; impactDirection?: string; suggestedAction?: { label?: string } }[],
  cilClaimHints?: string[],
): string[] {
  const hints: string[] = [];

  if (intelItems.length > 0) {
    const highPriority = intelItems.find((item) => item.priority === 'high');
    if (highPriority?.content) {
      hints.push(`优先处理高优先情报：${highPriority.content}`);
    }

    const actionable = intelItems.find((item) => item.suggestedAction?.label);
    if (actionable?.suggestedAction?.label) {
      hints.push(`已有建议动作：${actionable.suggestedAction.label}`);
    }

    const risk = intelItems.find((item) => item.impactDirection === 'risk');
    if (risk?.content) {
      hints.push(`存在风险类情报，需要纳入下一步推进判断：${risk.content}`);
    }
  }

  if (cilClaimHints?.length) {
    for (const hint of cilClaimHints) {
      hints.push(hint);
    }
  }

  return hints;
}
