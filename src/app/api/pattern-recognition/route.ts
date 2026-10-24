import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import {
  assertPatternEntityAccess,
  getVisiblePortfolioIds,
  restrictQueryToIds,
} from '@/lib/portfolio-scope';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { getModelConfig } from '@/lib/babel-engine/model-router';
import { isAIRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { withDailyCache } from '@/lib/ai-cache';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

// ─── Types ──────────────────────────────────────────────────────────

interface PatternRequest {
  opportunityId?: string;   // 当前商机 ID（用于策略推荐）
  accountId?: string;       // 当前客户 ID
  industry?: string;        // 按行业过滤
  forceRefresh?: boolean;
  outputLocale?: 'zh' | 'en';
}

interface SuccessPattern {
  patternName: string;
  description: string;
  successRate: string;
  applicableDeals: { name: string; value: number; industry: string }[];
  keyActions: string[];
}

interface PatternResponse {
  patterns: SuccessPattern[];
  recommendations: string;
}

type PatternOpportunityRow = {
  id: string;
  name: string;
  stage: string | null;
  value: number | null;
  probability?: number | null;
  account_id: string | null;
  meddicc: Record<string, unknown> | null;
  won_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

// ─── System Prompt ──────────────────────────────────────────────────

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是 B2B 大客户销售的跨客户模式识别专家。你能从多个已成交商机中发现共同的成功策略模式，并推荐给当前正在推进的商机。

你将收到：
1. 多个已赢单商机的数据（包含行业、金额、MEDDICC、谋局记录、联系人结构）
2. 可选：当前正在推进的商机信息

请分析所有已赢单商机，识别出跨客户的共同成功模式：

输出 JSON：
{
  "patterns": [
    {
      "patternName": "模式名称（如：高层突破+Champion联动）",
      "description": "该模式的详细描述，包括为什么有效",
      "successRate": "该模式在历史赢单中的出现频率（如：5/8 赢单使用）",
      "applicableDeals": [{"name": "商机名", "value": 金额, "industry": "行业"}],
      "keyActions": ["关键动作1", "关键动作2", ...]
    }
  ],
  "recommendations": "基于历史模式，给当前商机的整体策略建议（2-3段话）"
}

分析维度：
- 同行业历史赢单的共同策略（行业打法）
- 类似组织结构客户的成功模式（如决策链类似的客户）
- 谋局组合的有效性（哪些谋局目标组合在一起效果好）
- MEDDICC 高分项的共同特征
- Champion 发展路径的共性
- 竞品应对的成功套路

每个模式必须有具体的 keyActions（可复制的动作），不要泛泛而谈。
如果没有足够数据识别模式，也至少给出基于现有信息的初步洞察。

保持 JSON keys 和枚举值不变；模式名称、描述、行动和 recommendations 按输出语言生成。

${outputLocaleInstruction(outputLocale)}`;
}

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await req.json()) as PatternRequest;
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请求过于频繁，请稍后再试。', en: 'Requests are too frequent. Please try again later.' }),
      }, { status: 429 });
    }

    const admin = requireAdmin();
    await assertPatternEntityAccess(ctx, { opportunityId: body.opportunityId, accountId: body.accountId });
    const visibility = await getVisiblePortfolioIds(admin, ctx);

    // Cache key includes server-side visibility so scoped users never receive an org-wide cached answer.
    const entityId = body.opportunityId
      ? `${body.opportunityId}:${ctx.userId}:${visibility.scope}:${outputLocale}`
      : `${ctx.userId}:${visibility.scope}:${visibility.scope === 'team' ? [...ctx.teamMemberIds].sort().join('|') : ctx.orgId}:${outputLocale}`;

    // Pattern recognition is cached/display AI output. withDailyCache marks the
    // ai_insights payload as non-authoritative; reusable judgment memory must
    // be derived from source_records or core business tables with provenance.
    const result = await withDailyCache<Record<string, unknown>>({
      orgId: ctx.orgId,
      entityType: body.opportunityId ? 'opportunity' : 'account',
      entityId,
      insightType: 'pattern_recognition',
      forceRefresh: body.forceRefresh,
      trigger: 'pattern_recognition',
      compute: async () => {
        // 1. Fetch closed-won opportunities visible to the caller's real server-side role.
        const wonOppsQuery = restrictQueryToIds(
          admin
            .from('opportunities')
            .select('id, name, stage, value, probability, account_id, meddicc, won_date, notes, created_at')
            .eq('org_id', ctx.orgId)
            .eq('stage', 'closed_won'),
          visibility,
          'id',
          visibility.opportunityIds,
        );
        const { data: wonOpps } = await wonOppsQuery;

        const wonOppRows = (wonOpps ?? []) as PatternOpportunityRow[];

        if (wonOppRows.length === 0) {
          return {
            patterns: [],
            recommendations: localizedUnavailableText(outputLocale, { zh: '暂无已赢单商机数据，无法进行模式识别。请在积累赢单记录后再使用此功能。', en: 'No closed-won opportunity data is available yet, so Closr cannot identify patterns. Use this after enough wins are recorded.' }),
            meta: { wonDealsAnalyzed: 0, industriesCovered: [] },
          };
        }

        // 2. Fetch accounts for industry info
        const accountIds = [...new Set(wonOppRows.map((o) => o.account_id).filter(Boolean))];
        const { data: accounts } = await admin
          .from('accounts')
          .select('id, name, industry, contacts')
          .eq('org_id', ctx.orgId)
          .in('id', accountIds);

        const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

        // 3. Fetch strategic plays for won opportunities
        const oppIds = wonOppRows.map((o) => o.id);
        const { data: plays } = await admin
          .from('strategic_plays')
          .select('id, opportunity_id, goal_description, status, momentum, steps, assumptions, learnings, confidence')
          .eq('org_id', ctx.orgId)
          .in('opportunity_id', oppIds);

        const playsByOpp = new Map<string, typeof plays>();
        for (const p of plays ?? []) {
          const list = playsByOpp.get(p.opportunity_id) ?? [];
          list.push(p);
          playsByOpp.set(p.opportunity_id, list);
        }

        // 4. Fetch knowledge lessons
        const lessonsQuery = admin
          .from('knowledge_items')
          .select('title, content, category')
          .eq('org_id', ctx.orgId)
          .eq('category', 'case_study')
          .limit(visibility.restrict ? 0 : 20);
        const { data: lessons } = await lessonsQuery;

        // 5. Build context for won opportunities
        const wonSummaries = wonOppRows.map((opp) => {
          const acct = accountMap.get(opp.account_id);
          const meddicc = opp.meddicc as Record<string, unknown> | null;
          const oppPlays = playsByOpp.get(opp.id) ?? [];
          const contacts = (acct?.contacts as { name: string; role?: string; title?: string }[]) ?? [];

          const playSummary = oppPlays.map((p) => {
            const steps = (p.steps as { title: string; status: string }[]) ?? [];
            const completed = steps.filter((s) => s.status === 'completed').length;
            return `  - 谋局: ${p.goal_description} | 状态: ${p.status} | 信心: ${p.confidence}% | 步骤完成: ${completed}/${steps.length}`;
          }).join('\n');

          const contactSummary = contacts.slice(0, 5).map((c) =>
            `  - ${c.name}（${c.title ?? c.role ?? '联系人'}）`
          ).join('\n');

          const champion = meddicc?.champion as { strength: number; notes: string } | null;
          const overallScore = (meddicc?.overallScore as number) ?? 0;
          const competition = (meddicc?.competition as { name: string; threatLevel: string }[]) ?? [];

          return `### ${opp.name}
客户: ${acct?.name ?? '未知'} | 行业: ${acct?.industry ?? '未知'} | 金额: ¥${opp.value}
MEDDICC评分: ${overallScore}/100 | Champion强度: ${champion?.strength ?? 0}/5
竞品: ${competition.map((c) => `${c.name}(${c.threatLevel})`).join(', ') || '无'}
联系人:
${contactSummary || '  无'}
谋局:
${playSummary || '  无'}`;
        }).join('\n\n');

        // 6. Current opportunity context (if provided)
        let currentOppContext = '';
        if (body.opportunityId) {
          const { data: currentOpp } = await admin
            .from('opportunities')
            .select('id, org_id, name, stage, value, account_id, meddicc, notes')
            .eq('org_id', ctx.orgId)
            .eq('id', body.opportunityId)
            .single();

          if (currentOpp) {
            const currentAcct = accountMap.get(currentOpp.account_id)
              ?? (await admin.from('accounts').select('id, name, industry, contacts').eq('org_id', ctx.orgId).eq('id', currentOpp.account_id).single()).data;

            const meddicc = currentOpp.meddicc as Record<string, unknown> | null;
            const champion = meddicc?.champion as { strength: number; notes: string } | null;
            const overallScore = (meddicc?.overallScore as number) ?? 0;

            currentOppContext = `\n\n=== 当前商机（需要策略推荐）===
名称: ${currentOpp.name}
客户: ${currentAcct?.name ?? '未知'} | 行业: ${currentAcct?.industry ?? '未知'}
阶段: ${currentOpp.stage} | 金额: ¥${currentOpp.value}
MEDDICC评分: ${overallScore}/100 | Champion强度: ${champion?.strength ?? 0}/5
备注: ${currentOpp.notes || '无'}

请特别针对这个商机，从历史赢单模式中找到最适用的策略，说明为什么适用（如行业类似、客户结构类似等）。`;
          }
        }

        // 7. Knowledge base lessons
        const lessonContext = (lessons ?? []).length > 0
          ? `\n\n=== 组织知识库（历史复盘）===\n${(lessons ?? []).map((l) => `- ${l.title}: ${(l.content as string).slice(0, 300)}`).join('\n')}`
          : '';

        const userPrompt = `=== 已赢单商机（${wonOppRows.length} 个）===\n${wonSummaries}${currentOppContext}${lessonContext}\n\n请识别跨客户的共同成功模式，输出结构化分析。\n\n${outputLocaleInstruction(outputLocale)}`;

        const { tier } = getModelConfig({ task: 'strategy', complexity: 'high' });

        const aiResult = await callAIWithFallback<PatternResponse>({
          systemPrompt: buildSystemPrompt(outputLocale),
          userPrompt,
          tier,
        });

        if (!aiResult?.patterns) throw new Error('AI 分析失败');

        return {
          patterns: aiResult.patterns ?? [],
          recommendations: aiResult.recommendations ?? '',
          meta: {
            wonDealsAnalyzed: wonOppRows.length,
            industriesCovered: [...new Set((accounts ?? []).map((a) => a.industry).filter(Boolean))],
          },
        } as Record<string, unknown>;
      },
    });

    return Response.json(result);
  } catch (err) {
    logError('pattern-recognition', err);
    return guardResponse(err);
  }
}
