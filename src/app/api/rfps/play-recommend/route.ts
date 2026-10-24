import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import type { RfpRow, RfpCompetitorRow } from '@/lib/babel-engine/types';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const dynamic = 'force-dynamic';

export const maxDuration = 120;

interface PlayRecommendation {
  goalType: string;
  goalDescription: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface RecommendResult {
  recommendations: PlayRecommendation[];
}

// POST — AI 推荐谋局目标
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as { rfpId: string; outputLocale?: 'zh' | 'en' };
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (!body.rfpId) {
      return Response.json({ error: '缺少 rfpId' }, { status: 400 });
    }

    const admin = requireAdmin();

    // 加载 RFP
    const { data: rfp } = await admin
      .from('rfps')
      .select('*')
      .eq('id', body.rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    const rfpRow = rfp as RfpRow;
    await requireAccountAccess(ctx, rfpRow.account_id);

    // 并行加载上下文 + KB context
    const [
      { data: competitors },
      { data: opportunity },
      { data: account },
      { data: existingPlays },
      { data: latestAnalysis },
      kbContext,
    ] = await Promise.all([
      admin.from('rfp_competitors').select('*').eq('rfp_id', body.rfpId).eq('org_id', ctx.orgId),
      admin.from('opportunities').select('name, stage, value, expected_close_date').eq('id', rfpRow.opportunity_id).eq('org_id', ctx.orgId).single(),
      admin.from('accounts').select('name, industry').eq('id', rfpRow.account_id).eq('org_id', ctx.orgId).single(),
      admin.from('strategic_plays').select('goal_type, goal_description, status').eq('org_id', ctx.orgId).eq('account_id', rfpRow.account_id).in('status', ['active', 'pending']),
      admin.from('rfp_ai_analyses').select('win_probability, strengths, weaknesses, recommendations').eq('rfp_id', body.rfpId).eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(1),
      injectKnowledgeContextScoped(
        ctx,
        rfpRow.account_id,
        `${rfpRow.title} 谋局策略推荐`,
      ),
    ]);

    const comps = (competitors ?? []) as RfpCompetitorRow[];

    const systemPrompt = `你是一位 B2B 销售策略专家。基于 RFP 招投标场景，推荐 1-3 个谋局（Strategic Play）目标。

谋局目标类型包括：
- win_deal: 赢单 — 聚焦在这个招标项目上赢得合同
- build_champion: 培养内线 — 在甲方内部培养支持者
- block_competitor: 阻击竞对 — 削弱特定竞争对手的优势
- expand_scope: 扩展范围 — 扩大项目范围或追加需求
- accelerate_decision: 加速决策 — 推动甲方更快做出决定
- relationship_deepening: 深化关系 — 加强与关键决策人的关系

返回严格 JSON 格式：
{
  "recommendations": [
    {
      "goalType": "win_deal",
      "goalDescription": "具体的谋局目标描述",
      "reason": "推荐原因",
      "priority": "high"
    }
  ]
}

原则：
1. 每个建议必须具体、可执行，与当前 RFP 场景紧密相关
2. 如果已有进行中的谋局，避免重复推荐相同类型
3. 优先推荐当前阶段最能影响投标结果的策略
4. 考虑竞对情况和 AI 分析结果（如有）

${outputLocaleInstruction(outputLocale)}`;

    let userPrompt = `## RFP 信息
- 标题: ${rfpRow.title}
- 发标单位: ${rfpRow.issuer}
- 状态: ${rfpRow.status}
- 预算: ${rfpRow.budget ? `${rfpRow.budget} ${rfpRow.currency}` : '未知'}
- 截止日期: ${rfpRow.due_date ?? '未知'}
- 需求: ${(rfpRow.requirements ?? []).join('；') || '暂无'}`;

    if (account) {
      userPrompt += `\n\n## 客户
- ${account.name}（${account.industry ?? '未知行业'}）`;
    }

    if (opportunity) {
      userPrompt += `\n\n## 商机
- ${opportunity.name}，阶段: ${opportunity.stage}，金额: ${opportunity.value ?? '未知'}，预计关单: ${opportunity.expected_close_date ?? '未知'}`;
    }

    if (comps.length > 0) {
      userPrompt += `\n\n## 竞对: ${comps.map(c => c.name).join('、')}`;
      for (const c of comps) {
        if (c.strengths.length > 0) userPrompt += `\n- ${c.name} 优势: ${c.strengths.join('、')}`;
      }
    }

    const analysis = (latestAnalysis ?? [])[0];
    if (analysis) {
      userPrompt += `\n\n## AI 分析摘要
- 中标概率: ${analysis.win_probability ?? '未知'}%
- 优势: ${(analysis.strengths as string[])?.join('、') ?? '无'}
- 劣势: ${(analysis.weaknesses as string[])?.join('、') ?? '无'}`;
    }

    const plays = existingPlays ?? [];
    if (plays.length > 0) {
      userPrompt += `\n\n## 已有谋局（避免重复）`;
      for (const p of plays) {
        userPrompt += `\n- [${p.goal_type}] ${p.goal_description} (${p.status})`;
      }
    }

    // KB context already loaded in parallel above
    if (kbContext) {
      userPrompt += kbContext;
    }

    userPrompt += '\n\n请推荐 1-3 个谋局目标。\n' + outputLocaleInstruction(outputLocale);

    const result = await callAIWithFallback<RecommendResult>({
      systemPrompt,
      userPrompt,
      tier: 'pro',
      invocation: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        accountId: rfpRow.account_id,
        opportunityId: rfpRow.opportunity_id ?? null,
        route: '/api/rfps/play-recommend',
        useCase: 'rfp.play-recommend',
        metadata: {
          rfpId: body.rfpId,
          existingPlayCount: plays.length,
          competitorCount: comps.length,
          hasKnowledgeContext: Boolean(kbContext),
        },
      },
    }, {
      timeoutMs: 60_000,
      maxAttempts: 1,
      degradedResponse: {
        recommendations: [{
          goalType: 'win_deal',
          goalDescription: outputLocale === 'en' ? `Win the bid for "${rfpRow.title}"` : `赢得「${rfpRow.title}」投标`,
          reason: localizedUnavailableText(outputLocale, { zh: 'AI 推荐暂时不可用，已生成默认建议', en: 'AI recommendation is temporarily unavailable; Closr generated a default play.' }),
          priority: 'high' as const,
        }],
      },
    });

    // Fire-and-forget: deposit play recommendations
    if (result.recommendations?.length > 0) {
      const depositContent = result.recommendations
        .map((r: PlayRecommendation) => `[${r.priority}] ${r.goalType}: ${r.goalDescription}\n原因: ${r.reason}`)
        .join('\n\n');

      depositKnowledge({
        orgId: ctx.orgId,
        accountId: rfpRow.account_id,
        title: `谋局推荐：${rfpRow.title}`,
        content: depositContent,
        category: 'ai_insight',
        source: 'ai_rfp_play',
        sourceType: 'rfps',
        sourceId: body.rfpId,
      });
    }

    return Response.json({
      recommendations: result.recommendations ?? [],
    });
  } catch (err) {
    console.error('[rfps/play-recommend] POST error:', err);
    return guardResponse(err);
  }
}
