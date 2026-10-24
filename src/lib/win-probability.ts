import type {
  Opportunity,
  Account,
  StrategicPlay,
  OpportunityStage,
  PlayMomentum,
} from '@/lib/babel-engine/types';

// ─── Types ────────────────────────────────────────────────────────────

export interface WinProbabilityFactor {
  name: string;
  impact: number;   // 该因子得分（满分 = weight * 100，归一化为实际贡献分）
  detail: string;
}

export interface WinProbabilityResult {
  score: number;     // 0-100
  factors: WinProbabilityFactor[];
}

export interface WinProbabilityInput {
  opportunity: Opportunity;
  account: Account;
  plays: StrategicPlay[];
  locale?: 'zh' | 'en';
}

// ─── Stage Score Map ──────────────────────────────────────────────────

const STAGE_SCORE: Record<OpportunityStage, number> = {
  lead_identified: 10,
  discovery: 25,
  solution_presented: 40,
  proposal_sent: 55,
  negotiation: 70,
  contract_review: 85,
  closed_won: 100,
  closed_lost: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────

function daysSince(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ─── Core Calculation ─────────────────────────────────────────────────

/**
 * calculateWinProbability — 计算商机 AI 胜率预测
 *
 * 六个因子，各自权重加总 = 100：
 * 1. MEDDIC 完整度  (20%)
 * 2. 联系人覆盖     (20%)
 * 3. 谋局覆盖       (20%)
 * 4. 商机阶段       (15%)
 * 5. 互动频率       (15%)
 * 6. 竞对风险       (10%)
 */
export function calculateWinProbability(input: WinProbabilityInput): WinProbabilityResult {
  const { opportunity, account, plays, locale = 'zh' } = input;
  const en = locale === 'en';
  const contacts = account.contacts ?? [];
  const factors: WinProbabilityFactor[] = [];

  // ── 1. MEDDIC 完整度 (权重 20) ─────────────────────────────────────
  {
    const m = opportunity.meddicc;
    let filledCount = 0;
    let totalFields = 0;
    const details: string[] = [];

    // Metrics
    totalFields++;
    if (m?.metrics?.status && m.metrics.status !== 'unconfirmed') {
      filledCount++;
      details.push(en ? `Metrics: ${m.metrics.status === 'confirmed' ? 'confirmed' : 'partially confirmed'}` : `量化指标: ${m.metrics.status === 'confirmed' ? '已确认' : '部分确认'}`);
    }

    // Economic Buyer
    totalFields++;
    if (m?.economicBuyer?.status && m.economicBuyer.status !== 'unknown') {
      filledCount++;
      details.push(en ? `Economic buyer: ${m.economicBuyer.status === 'engaged' ? 'engaged' : 'identified'}` : `经济买家: ${m.economicBuyer.status === 'engaged' ? '已接触' : '已识别'}`);
    }

    // Decision Criteria
    totalFields++;
    if ((m?.decisionCriteria ?? []).length > 0) {
      filledCount++;
      details.push(en ? `Decision criteria: ${(m?.decisionCriteria ?? []).length}` : `决策标准: ${(m?.decisionCriteria ?? []).length} 条`);
    }

    // Decision Process
    totalFields++;
    if ((m?.decisionProcess ?? []).length > 0) {
      filledCount++;
      details.push(en ? `Decision process: ${(m?.decisionProcess ?? []).length} steps` : `决策流程: ${(m?.decisionProcess ?? []).length} 步`);
    }

    // Identified Pain
    totalFields++;
    if ((m?.identifiedPain ?? []).length > 0) {
      filledCount++;
      details.push(en ? `Pain points: ${(m?.identifiedPain ?? []).length}` : `痛点: ${(m?.identifiedPain ?? []).length} 条`);
    }

    // Champion
    totalFields++;
    if (m?.champion?.strength > 0) {
      filledCount++;
      details.push(en ? `Champion strength: ${m.champion.strength}/5` : `内部推动者强度: ${m.champion.strength}/5`);
    }

    // Competition
    totalFields++;
    if ((m?.competition ?? []).length > 0) {
      filledCount++;
      details.push(en ? `Competitors: ${(m?.competition ?? []).length}` : `竞品: ${(m?.competition ?? []).length} 家`);
    }

    const ratio = totalFields > 0 ? filledCount / totalFields : 0;
    const impact = Math.round(ratio * 20);
    factors.push({
      name: en ? 'MEDDIC Completeness' : 'MEDDIC 完整度',
      impact,
      detail: details.length > 0
        ? en ? `${filledCount}/${totalFields} fields complete (${details.join('; ')})` : `已填写 ${filledCount}/${totalFields} 项（${details.join('、')}）`
        : en ? `No MEDDIC fields completed (0/${totalFields})` : `尚未填写任何 MEDDIC 字段（0/${totalFields}）`,
    });
  }

  // ── 2. 联系人覆盖 (权重 20) ────────────────────────────────────────
  {
    let contactScore = 0;
    const details: string[] = [];

    const hasDecisionMaker = contacts.some((c) => c.role === 'decision_maker');
    const hasChampion = contacts.some((c) => c.role === 'champion');
    const blockerCount = contacts.filter((c) => c.role === 'blocker').length;

    if (hasDecisionMaker) {
      contactScore += 10;
      details.push(en ? 'Decision maker present +10' : '有决策者 +10');
    }
    if (hasChampion) {
      contactScore += 10;
      details.push(en ? 'Champion present +10' : '有 Champion +10');
    }
    if (blockerCount > 0) {
      contactScore -= 5 * blockerCount;
      details.push(en ? `${blockerCount} blockers -${5 * blockerCount}` : `${blockerCount} 个 Blocker -${5 * blockerCount}`);
    }

    // Clamp to [0, 20]
    const impact = Math.max(0, Math.min(20, contactScore));
    factors.push({
      name: en ? 'Contact Coverage' : '联系人覆盖',
      impact,
      detail: details.length > 0
        ? details.join(en ? '; ' : '；')
        : en ? 'No key-role contacts' : '无关键角色联系人',
    });
  }

  // ── 3. 谋局覆盖 (权重 20) ─────────────────────────────────────────
  {
    const oppPlays = plays.filter(
      (p) => p.opportunityId === opportunity.id || p.accountId === opportunity.accountId
    );
    const activePlays = oppPlays.filter(
      (p) => p.status === 'active' || p.status === 'in_progress'
    );

    let playScore = 0;
    const details: string[] = [];

    if (activePlays.length > 0) {
      playScore += 15;
      details.push(en ? `${activePlays.length} active plays +15` : `${activePlays.length} 个活跃谋局 +15`);

      // Check momentum of the most recent active play
      const momentumMap: Record<PlayMomentum, number> = {
        progressing: 5,
        active: 5,
        slowing: 0,
        stalled: -10,
        blocked: -10,
      };
      for (const p of activePlays) {
        const mScore = momentumMap[p.momentum] ?? 0;
        if (mScore !== 0) {
          playScore += mScore;
          const label = p.momentum === 'progressing' || p.momentum === 'active'
            ? en ? `Momentum healthy +5` : `势头良好 +5`
            : en ? `Momentum ${p.momentum === 'stalled' ? 'stalled' : 'blocked'} -10` : `势头 ${p.momentum === 'stalled' ? '停滞' : '受阻'} -10`;
          details.push(label);
          break; // Only count the most impactful one
        }
      }
    } else {
      details.push(en ? 'No active plays' : '无活跃谋局');
    }

    const impact = Math.max(0, Math.min(20, playScore));
    factors.push({
      name: en ? 'Play Coverage' : '谋局覆盖',
      impact,
      detail: details.join(en ? '; ' : '；'),
    });
  }

  // ── 4. 商机阶段 (权重 15) ─────────────────────────────────────────
  {
    const stageRaw = STAGE_SCORE[opportunity.stage] ?? 0;
    // 将 0-100 的阶段分映射到 0-15 权重
    const impact = Math.round((stageRaw / 100) * 15);
    factors.push({
      name: en ? 'Opportunity Stage' : '商机阶段',
      impact,
      detail: en ? `Current stage: ${opportunity.stage === 'closed_won' ? 'closed won' : opportunity.stage === 'closed_lost' ? 'closed lost' : `base score ${stageRaw}`}` : `当前阶段：${opportunity.stage === 'closed_won' ? '已成交' : opportunity.stage === 'closed_lost' ? '已丢失' : `基础分 ${stageRaw}`}`,
    });
  }

  // ── 5. 互动频率 (权重 15) ──────────────────────────────────────────
  {
    let interactionScore = 0;
    const details: string[] = [];

    // Check lastContactedAt across all contacts for this account
    const contactDates = contacts
      .map((c) => c.lastContactedAt)
      .filter(Boolean) as string[];

    // Also check account lastActivity
    if (account.lastActivity) contactDates.push(account.lastActivity);

    if (contactDates.length > 0) {
      const mostRecent = contactDates.reduce((a, b) => (a > b ? a : b));
      const days = daysSince(mostRecent);
      if (days !== null) {
        if (days <= 30) {
          interactionScore = 15;
          details.push(en ? `Last engagement ${days} days ago (within 30 days) +15` : `最近互动 ${days} 天前（30天内）+15`);
        } else if (days <= 60) {
          interactionScore = 8;
          details.push(en ? `Last engagement ${days} days ago (within 60 days) +8` : `最近互动 ${days} 天前（60天内）+8`);
        } else {
          details.push(en ? `Last engagement ${days} days ago (over 60 days)` : `最近互动 ${days} 天前（超过60天）`);
        }
      }
    } else {
      details.push(en ? 'No engagement record' : '无互动记录');
    }

    factors.push({
      name: en ? 'Engagement Frequency' : '互动频率',
      impact: interactionScore,
      detail: details.join(en ? '; ' : '；'),
    });
  }

  // ── 6. 竞对风险 (权重 10) ──────────────────────────────────────────
  {
    let competitorScore = 10; // 默认满分，有竞对则扣分
    const details: string[] = [];

    const competition = opportunity.meddicc?.competition ?? [];
    if (competition.length > 0) {
      competitorScore = 0;
      details.push(en ? `${competition.length} competitors found -10` : `发现 ${competition.length} 家竞品 -10`);
    } else {
      details.push(en ? 'No competitor threat found' : '未发现竞品威胁');
    }

    factors.push({
      name: en ? 'Competitive Risk' : '竞对风险',
      impact: competitorScore,
      detail: details.join(en ? '; ' : '；'),
    });
  }

  // ── 总分 ───────────────────────────────────────────────────────────
  const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.impact, 0)));

  return { score, factors };
}

// ─── Color Helpers ────────────────────────────────────────────────────

export function getWinProbabilityColor(score: number): string {
  if (score > 70) return 'var(--positive)';
  if (score >= 40) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

export function getWinProbabilityColorClass(score: number): { text: string; bg: string } {
  if (score > 70) return { text: 'text-positive', bg: 'bg-positive/10' };
  if (score >= 40) return { text: 'text-accent-amber', bg: 'bg-accent-amber/10' };
  return { text: 'text-accent-red', bg: 'bg-accent-red/10' };
}
