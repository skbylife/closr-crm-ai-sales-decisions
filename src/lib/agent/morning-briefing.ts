/**
 * Morning Briefing Generator
 * 每天自动扫描活跃 deal，生成今日行动简报
 * 使用 flash 模型 (deepseek-v4-flash) 节省成本
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { callGemini } from '@/lib/babel-engine/gemini';

// ─── Types ────────────────────────────────────────────────────────────

export interface DealBriefingItem {
  opportunityId: string;
  accountName: string;
  dealName: string;
  amount: number | null;
  stage: string;
  priority: 'urgent' | 'high' | 'medium';
  reason: string;           // 为什么今天要关注这个单子
  suggestedAction: string;  // 具体建议的下一步行动
  daysSinceUpdate: number;
  missingMeddicc: string[]; // 哪些 MEDDICC 维度为空
  signals: string[];        // 相关情报信号（如有）
}

export interface MorningBriefing {
  userId: string;
  date: string;
  topDeals: DealBriefingItem[]; // 最多5个，按优先级排序
  summary: string;              // 一句话总结今天的重点
  generatedAt: string;
}

// ─── MEDDICC 维度检查 ─────────────────────────────────────────────────

const MEDDICC_LABELS: Record<string, string> = {
  metrics: 'M-指标量化',
  economicBuyer: 'E-经济决策人',
  decisionCriteria: 'D-决策标准',
  decisionProcess: 'D-决策流程',
  identifiedPain: 'I-痛点识别',
  champion: 'C-内部支持者',
  competition: 'C-竞争态势',
};

function getMissingMeddicc(meddicc: Record<string, unknown> | null | undefined): string[] {
  if (!meddicc) return Object.values(MEDDICC_LABELS);

  const missing: string[] = [];

  // M - Metrics
  const metrics = meddicc.metrics as { notes?: string; status?: string } | undefined;
  if (!metrics || !metrics.notes || metrics.notes.trim() === '' || metrics.status === 'unconfirmed') {
    missing.push(MEDDICC_LABELS.metrics);
  }

  // E - Economic Buyer
  const eb = meddicc.economicBuyer as { status?: string } | undefined;
  if (!eb || eb.status === 'unknown') {
    missing.push(MEDDICC_LABELS.economicBuyer);
  }

  // D - Decision Criteria
  const dc = meddicc.decisionCriteria as unknown[];
  if (!dc || dc.length === 0) {
    missing.push(MEDDICC_LABELS.decisionCriteria);
  }

  // D - Decision Process
  const dp = meddicc.decisionProcess as unknown[];
  if (!dp || dp.length === 0) {
    missing.push(MEDDICC_LABELS.decisionProcess);
  }

  // I - Identified Pain
  const pain = meddicc.identifiedPain as unknown[];
  if (!pain || pain.length === 0) {
    missing.push(MEDDICC_LABELS.identifiedPain);
  }

  // C - Champion
  const champion = meddicc.champion as { strength?: number; lastEngagement?: string } | undefined;
  if (!champion || !champion.strength || champion.strength === 0) {
    missing.push(MEDDICC_LABELS.champion);
  }

  // C - Competition
  const comp = meddicc.competition as unknown[];
  if (!comp || comp.length === 0) {
    missing.push(MEDDICC_LABELS.competition);
  }

  return missing;
}

// ─── 主函数 ────────────────────────────────────────────────────────────

// ─── 职级角色描述 ─────────────────────────────────────────────────────

function getRoleContext(jobLevel: number): { roleDesc: string; focusInstructions: string } {
  if (jobLevel >= 4) {
    // VP / Director / CxO — 战略视角
    return {
      roleDesc: '你面对的是一位销售副总裁/总监级高管。',
      focusInstructions: `高管关注要点（按重要性）：
1. 季度目标达成预测：当前管线金额 vs 季度目标，覆盖倍数是否健康
2. 大客户战略风险：高价值 deal 的推进障碍和竞争威胁
3. 漏斗健康度：各阶段转化率、新单补充速度是否足够
4. 竞争态势：是否有系统性竞争丢单趋势

语气要求：战略层面的精炼分析，不需要具体执行动作，而是"需要关注什么"和"战略建议"。
summary 格式：第一句话给出季度达成置信度（如"本季度达成概率约75%"），第二句指出最大战略风险。`,
    };
  }
  if (jobLevel >= 2) {
    // Manager — 团队视角
    return {
      roleDesc: '你面对的是一位销售团队经理。',
      focusInstructions: `经理关注要点（按重要性）：
1. 团队整体业绩：哪些 rep 的 deal 停滞需要经理介入辅导
2. 漏斗健康度：哪个阶段的 deal 堆积或不足，需要调配资源
3. 高风险 deal 辅导：哪个 deal 需要经理亲自参与推进
4. 团队节奏：整体跟进频率是否正常，有没有被忽略的客户

语气要求：管理者视角，强调"哪个 deal 需要你介入"而非"你今天要做什么"。
summary 格式：第一句话总览团队 pipeline 状态（如"团队当前X个活跃deal，Y个需要介入"），第二句指出最需要经理辅导的具体 deal。`,
    };
  }
  // AE — 个人执行视角
  return {
    roleDesc: '你面对的是一线销售代表（AE）。',
    focusInstructions: `AE 关注要点（按重要性）：
1. 今日必须行动的 deal：哪些单子今天不推进就会出问题
2. 具体跟进建议：联系谁、说什么、准备什么材料
3. MEDDICC 补全：哪些关键信息还缺，影响推进
4. 新情报跟进：有新信号的 deal 需要及时响应

语气要求：直接、可执行，告诉 AE "你今天要做的3件事"。
summary 格式：第一句列出最紧急1-2个项目名+原因，第二句给出今日最高优先行动。`,
  };
}

export async function generateMorningBriefing(userId: string, orgId: string, jobLevel = 0): Promise<MorningBriefing> {
  const admin = getSupabaseAdmin();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  if (!admin) {
    return {
      userId,
      date: today,
      topDeals: [],
      summary: '数据库连接不可用，无法生成简报。',
      generatedAt: now.toISOString(),
    };
  }

  // 1. 获取活跃 deals（未关闭的）
  const { data: opportunities, error: oppError } = await admin
    .from('opportunities')
    .select('id, name, value, stage, account_id, updated_at, meddicc, expected_close_date, notes')
    .eq('org_id', orgId)
    .not('stage', 'in', '(closed_won,closed_lost)');

  if (oppError || !opportunities || opportunities.length === 0) {
    return {
      userId,
      date: today,
      topDeals: [],
      summary: opportunities?.length === 0 ? '当前没有活跃的 deal，管道为空。' : '获取 deal 数据失败。',
      generatedAt: now.toISOString(),
    };
  }

  // 2. 获取 accounts 名称映射
  const accountIds = [...new Set(opportunities.map((o) => o.account_id).filter(Boolean))];
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, name')
    .in('id', accountIds);
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a.name as string]));

  // 3. 获取最近7天 intel 信号
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentIntel } = await admin
    .from('intel_items')
    .select('account_id, opportunity_id, title, urgency, type, created_at')
    .eq('org_id', orgId)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  // 按 account_id 建立 intel 索引
  const intelByAccount = new Map<string, string[]>();
  for (const intel of recentIntel ?? []) {
    const key = intel.opportunity_id ?? intel.account_id;
    if (!key) continue;
    if (!intelByAccount.has(key)) intelByAccount.set(key, []);
    const urgencyTag = intel.urgency === 'high' || intel.urgency === 'critical' ? `⚡${intel.title}` : intel.title;
    intelByAccount.get(key)!.push(urgencyTag);
  }

  // 4. 对每个 deal 计算基础分析数据
  type DealAnalysis = {
    opportunityId: string;
    accountName: string;
    dealName: string;
    amount: number | null;
    stage: string;
    daysSinceUpdate: number;
    missingMeddicc: string[];
    signals: string[];
    expectedCloseDate: string | null;
    notes: string | null;
  };

  const dealAnalyses: DealAnalysis[] = opportunities.map((opp) => {
    const updatedAt = opp.updated_at ? new Date(opp.updated_at) : new Date(0);
    const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

    const meddicc = opp.meddicc as Record<string, unknown> | null;
    const missingMeddicc = getMissingMeddicc(meddicc);

    // 合并 opportunity 维度和 account 维度的 intel
    const signals = [
      ...(intelByAccount.get(opp.id) ?? []),
      ...(intelByAccount.get(opp.account_id) ?? []),
    ].slice(0, 5);

    return {
      opportunityId: opp.id,
      accountName: accountMap.get(opp.account_id) ?? '未知客户',
      dealName: opp.name,
      amount: opp.value ?? null,
      stage: opp.stage,
      daysSinceUpdate,
      missingMeddicc,
      signals,
      expectedCloseDate: opp.expected_close_date ?? null,
      notes: opp.notes ?? null,
    };
  });

  // 5. 构建 LLM prompt，让 AI 综合评估优先级和行动建议
  const dealSummaries = dealAnalyses.map((d, i) =>
    `Deal ${i + 1}: ${d.accountName} - ${d.dealName}
  金额: ${d.amount ? `$${d.amount.toLocaleString()}` : '未填写'}
  阶段: ${d.stage}
  停滞天数: ${d.daysSinceUpdate} 天
  预计关单: ${d.expectedCloseDate ?? '未设定'}
  缺失MEDDICC维度: ${d.missingMeddicc.length > 0 ? d.missingMeddicc.join(', ') : '完整'}
  最新情报: ${d.signals.length > 0 ? d.signals.join('; ') : '无'}
  备注: ${d.notes?.slice(0, 100) ?? '无'}`
  ).join('\n\n');

  const { roleDesc, focusInstructions } = getRoleContext(jobLevel);

  const systemPrompt = `你是一个资深 B2B 销售教练，精通 MEDDICC 方法论和 ESL（电子货架标签）行业。
${roleDesc}
你的任务是分析 pipeline，给出针对该职级的洞察和建议。

${focusInstructions}

通用评估标准：
1. 停滞风险：超过7天未更新的 deal 需要关注
2. 关单临近：expected_close_date 在30天内的 deal 优先级高
3. MEDDICC 缺失：缺失核心维度（经济决策人、痛点）意味着高丢单风险
4. 情报信号：有新 intel 信号的 deal 需要及时跟进
5. 金额权重：高价值 deal 适当提高优先级

请返回 JSON 格式（严格遵循，不要 markdown fences）：
{
  "topDeals": [
    {
      "opportunityId": "deal id",
      "priority": "urgent|high|medium",
      "reason": "一句话说明为什么需要关注这个单子（具体、有说服力）",
      "suggestedAction": "针对该职级的具体建议（AE=具体执行动作，Manager=辅导介入建议，Executive=战略决策建议）"
    }
  ],
  "summary": "摘要必须包含具体项目名，禁止模糊总结。最多2句话，80字以内。"
}

topDeals 最多返回5个，按优先级排序。priority: urgent = 必须立即行动，high = 本周内行动，medium = 本周关注。`;

  const userPrompt = `以下是当前 pipeline 中的活跃 deals（共 ${dealAnalyses.length} 个）：

${dealSummaries}

请基于以上信息，评估哪些 deal 今天最需要推进，给出优先级和具体建议。`;

  let llmResult: {
    topDeals: { opportunityId: string; priority: string; reason: string; suggestedAction: string }[];
    summary: string;
  } = {
    topDeals: [],
    summary: '',
  };

  try {
    const rawResponse = await callGemini<string>({
      systemPrompt,
      userPrompt,
      tier: 'flash', // 使用 deepseek-v4-flash 节省成本
      temperature: 0.3,
    });

    // 解析 JSON（callGemini 返回原始字符串时需要 parse）
    const parsed = (typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse) as typeof llmResult;
    llmResult = parsed;
  } catch (err) {
    console.error('[morning-briefing] LLM evaluation failed:', err);
    // 降级：按停滞天数排序，简单给出建议
    const sorted = [...dealAnalyses].sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
    llmResult = {
      topDeals: sorted.slice(0, 5).map((d) => ({
        opportunityId: d.opportunityId,
        priority: d.daysSinceUpdate > 14 ? 'urgent' : d.daysSinceUpdate > 7 ? 'high' : 'medium',
        reason: `该 deal 已 ${d.daysSinceUpdate} 天未更新，需要确认推进状态。`,
        suggestedAction: d.missingMeddicc.length > 0
          ? `补全 MEDDICC 信息：${d.missingMeddicc.slice(0, 2).join('、')}`
          : '联系客户确认下一步时间表',
      })),
      summary: `当前有 ${dealAnalyses.length} 个活跃 deal，${dealAnalyses.filter((d) => d.daysSinceUpdate > 7).length} 个超过7天未更新，需要重点关注。`,
    };
  }

  // 6. 合并 LLM 评估结果与本地分析数据
  const dealMap = new Map(dealAnalyses.map((d) => [d.opportunityId, d]));

  const topDeals: DealBriefingItem[] = llmResult.topDeals
    .map((llmDeal) => {
      const local = dealMap.get(llmDeal.opportunityId);
      if (!local) return null;
      return {
        opportunityId: local.opportunityId,
        accountName: local.accountName,
        dealName: local.dealName,
        amount: local.amount,
        stage: local.stage,
        priority: (llmDeal.priority as 'urgent' | 'high' | 'medium') || 'medium',
        reason: llmDeal.reason,
        suggestedAction: llmDeal.suggestedAction,
        daysSinceUpdate: local.daysSinceUpdate,
        missingMeddicc: local.missingMeddicc,
        signals: local.signals,
      };
    })
    .filter((d): d is DealBriefingItem => d !== null)
    .slice(0, 5);

  return {
    userId,
    date: today,
    topDeals,
    summary: llmResult.summary || `今日共 ${dealAnalyses.length} 个活跃 deal 需要跟进。`,
    generatedAt: now.toISOString(),
  };
}
