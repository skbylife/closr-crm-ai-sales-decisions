import { requireAuth, requireAdmin, requireOpportunityAccess, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { getModelConfig } from '@/lib/babel-engine/model-router';
import { isAIRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { withDailyCache } from '@/lib/ai-cache';
import { buildFreshnessMeta } from '@/lib/ai-freshness';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface DimensionScore {
  name: string;
  our: number;
  competitors: { name: string; score: number }[];
}

interface AnalysisResponse {
  dimensions: DimensionScore[];
  strategy: string;
}

interface MatrixScores {
  price: number;
  tech: number;
  relationship: number;
  delivery: number;
  brand: number;
  support: number;
}

interface MatrixResponse {
  competitors: { name: string; scores: MatrixScores }[];
  ourScores: MatrixScores;
  responsePlan: string;
}

function getInsightType(mode: string | null | undefined) {
  return mode === 'matrix' ? 'competitive_matrix' as const : 'competitive_analysis' as const;
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是 B2B 企业级销售竞争分析专家，精通竞品格局评估和竞争策略制定。

根据提供的竞品信息、情报和邮件解读历史，对以下维度进行 1-5 分评分（5=最强）：
- 价格竞争力
- 技术能力
- 客户关系
- 交付能力
- 品牌影响力

返回 JSON 格式：
{
  "dimensions": [
    {
      "name": "维度名称",
      "our": 1-5,
      "competitors": [{"name": "竞品名", "score": 1-5}]
    }
  ],
  "strategy": "综合竞争策略建议（200字内，包含具体可执行的差异化打法）"
}

保持 JSON keys 和枚举值不变；维度名称和策略建议按输出语言生成。

${outputLocaleInstruction(outputLocale)}`;
}

function buildMatrixSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是 B2B 企业级销售竞争分析专家，精通竞品格局评估和差异化竞争策略。

根据提供的商机信息、MEDDICC 竞品数据、客户情报和邮件解读信号，对我方和每个竞品在以下六个维度进行 1-10 分评分（10=最强）：
- price: 价格竞争力
- tech: 技术契合度
- relationship: 客户关系深度
- delivery: 交付能力
- brand: 品牌信任度
- support: 售后支持

返回 JSON 格式：
{
  "competitors": [
    {
      "name": "竞品名称",
      "scores": { "price": 1-10, "tech": 1-10, "relationship": 1-10, "delivery": 1-10, "brand": 1-10, "support": 1-10 }
    }
  ],
  "ourScores": { "price": 1-10, "tech": 1-10, "relationship": 1-10, "delivery": 1-10, "brand": 1-10, "support": 1-10 },
  "responsePlan": "针对性竞争应对建议（300字内）：基于评分差距，指出我方的核心优势维度和劣势维度，给出具体可执行的推进策略。"
}

保持 JSON keys 和枚举值不变；responsePlan 按输出语言生成。

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const { opportunityId, mode, forceRefresh } = body as {
      opportunityId: string;
      mode?: 'default' | 'matrix';
      forceRefresh?: boolean;
      outputLocale?: 'zh' | 'en';
    };
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请求过于频繁，请稍后再试。', en: 'Requests are too frequent. Please try again later.' }),
      }, { status: 429 });
    }

  const admin = requireAdmin();

  const isMatrix = mode === 'matrix';

  if (!opportunityId) {
    return Response.json({
      error: localizedUnavailableText(outputLocale, { zh: '缺少 opportunityId', en: 'Missing opportunityId' }),
    }, { status: 400 });
  }

  await requireOpportunityAccess(ctx, opportunityId);

  const insightType = getInsightType(mode);
  const cacheEntityId = outputLocale === 'en' ? `${opportunityId}:en` : opportunityId;

  const result = await withDailyCache<Record<string, unknown>>({
    orgId: ctx.orgId,
    entityType: 'opportunity',
    entityId: cacheEntityId,
    insightType,
    forceRefresh,
    trigger: 'competitive_analysis',
    compute: async () => {
      // Fetch opportunity with meddicc competition data
      const { data: opp } = await admin
        .from('opportunities')
        .select('id, name, stage, value, account_id, meddicc')
        .eq('id', opportunityId)
        .eq('org_id', ctx.orgId)
        .single();

      if (!opp) throw new Error('商机不存在');

      const meddicc = opp.meddicc as Record<string, unknown> | null;
      const competition = (meddicc?.competition as { id: string; name: string; strengths: string; ourAdvantage: string; threatLevel: string }[]) ?? [];

      if (competition.length === 0) throw new Error('暂无竞品数据');

      // Fetch related intel, decode signals, and KB context in parallel
      const [{ data: intelItems }, { data: recentDecodes }, kbContext] = await Promise.all([
        admin
          .from('intel_items')
          .select('title, content, urgency, date')
          .eq('org_id', ctx.orgId)
          .eq('account_id', opp.account_id)
          .order('date', { ascending: false })
          .limit(10),
        admin
          .from('email_decodes')
          .select('decode, date')
          .eq('org_id', ctx.orgId)
          .eq('account_id', opp.account_id)
          .order('date', { ascending: false })
          .limit(5),
        injectKnowledgeContextScoped(
          ctx,
          String(opp.account_id),
          `${opp.name} 竞争分析 ${competition.map(c => c.name).join(' ')}`,
          5,
        ),
      ]);

      const decodeSignals = (recentDecodes ?? []).map((d) => {
        const decode = d.decode as Record<string, unknown> | null;
        const ta = decode?.threadAnalysis as Record<string, unknown> | null;
        return `[${d.date}] 信号:${ta?.keySignal ?? '无'} 情绪:${ta?.sentimentTrend ?? '?'}`;
      }).join('\n');

      const intelSummary = (intelItems ?? []).map((i) =>
        `[${i.date}] ${i.title}: ${i.content}`
      ).join('\n');

      const competitorSummary = competition.map((c) =>
        `- ${c.name}（威胁:${c.threatLevel}）\n  对方优势: ${c.strengths || '未知'}\n  我方对策: ${c.ourAdvantage || '未制定'}`
      ).join('\n');

      // KB context already loaded in parallel above

      const userPrompt = `## 商机信息
名称: ${opp.name}
阶段: ${opp.stage}
金额: ¥${opp.value}

## 已知竞品
${competitorSummary}

## 相关情报
${intelSummary || '暂无情报'}

## 邮件解读信号
${decodeSignals || '暂无解读'}${kbContext}

请对我方和每个竞品在各维度进行评分，并给出竞争策略建议。

${outputLocaleInstruction(outputLocale)}`;

      const { tier } = getModelConfig({ task: 'strategy', dealValue: opp.value });

      if (isMatrix) {
        const aiResult = await callAIWithFallback<MatrixResponse>({
          systemPrompt: buildMatrixSystemPrompt(outputLocale),
          userPrompt,
          tier,
        });

        if (!aiResult?.ourScores || !aiResult?.competitors) {
          throw new Error('AI 分析失败');
        }

        // Deposit matrix result
        depositKnowledge({
          orgId: ctx.orgId,
          accountId: String(opp.account_id),
          title: `竞争分析：${opp.name}`,
          content: `竞争矩阵：${JSON.stringify(aiResult.ourScores)}\n应对建议：${aiResult.responsePlan ?? ''}`,
          category: 'competitor_intel',
          source: 'ai_competitive',
          sourceType: 'ai_insights',
          sourceId: `opportunity_${opportunityId}_${insightType}`,
        });

        return {
          competitors: aiResult.competitors,
          ourScores: aiResult.ourScores,
          responsePlan: aiResult.responsePlan ?? '',
        } as Record<string, unknown>;
      }

      const aiResult = await callAIWithFallback<AnalysisResponse>({
        systemPrompt: buildSystemPrompt(outputLocale),
        userPrompt,
        tier,
      });

      if (!aiResult?.dimensions) {
        throw new Error('AI 分析失败');
      }

      // Deposit dimension result
      depositKnowledge({
        orgId: ctx.orgId,
        accountId: String(opp.account_id),
        title: `竞争分析：${opp.name}`,
        content: `竞争维度：${aiResult.dimensions.map(d => `${d.name}:${d.our}`).join('、')}\n策略：${aiResult.strategy ?? ''}`,
        category: 'competitor_intel',
        source: 'ai_competitive',
        sourceType: 'ai_insights',
        sourceId: `opportunity_${opportunityId}_${insightType}`,
      });

      return {
        dimensions: aiResult.dimensions,
        strategy: aiResult.strategy ?? '',
      } as Record<string, unknown>;
    },
  });

  return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === '商机不存在') return Response.json({ error: message }, { status: 404 });
    if (message === '暂无竞品数据') return Response.json({ error: message }, { status: 400 });
    if (message === 'AI 分析失败') return Response.json({ error: message }, { status: 500 });
    logError('competitive-analysis', err);
    return guardResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(req.url);
    const opportunityId = searchParams.get('opportunityId');
    const outputLocale = normalizeOutputLocale(searchParams.get('outputLocale'));
    const insightType = getInsightType(searchParams.get('mode'));
    const cacheEntityId = outputLocale === 'en' ? `${opportunityId}:en` : opportunityId;

    if (!opportunityId) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '缺少 opportunityId', en: 'Missing opportunityId' }),
      }, { status: 400 });
    }

    await requireOpportunityAccess(ctx, opportunityId);

    const admin = requireAdmin();
    const { data, error } = await admin
      .from('ai_insights')
      .select('data, updated_at')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', 'opportunity')
      .eq('entity_id', cacheEntityId)
      .eq('insight_type', insightType)
      .maybeSingle();

    if (error) {
      console.warn('[competitive-analysis] cache load failed:', error.message);
      return Response.json(null);
    }

    if (!data?.data) return Response.json(null);

    return Response.json({
      ...(data.data as Record<string, unknown>),
      cachedAt: data.updated_at,
      fromCache: true,
      ...buildFreshnessMeta(data.updated_at),
    });
  } catch (err) {
    logError('competitive-analysis:get', err);
    return guardResponse(err);
  }
}
