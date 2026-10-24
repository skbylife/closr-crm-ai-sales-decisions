import { requireAuth, requireAdmin, requireOpportunityAccess, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { getModelConfig } from '@/lib/babel-engine/model-router';
import { isAIRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { loadCILAccountContextScoped } from '@/lib/compiled-intelligence/context';
import { buildCILForForecast } from '@/lib/compiled-intelligence/prompt-context';
import { buildFreshnessMeta } from '@/lib/ai-freshness';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface ForecastFactor {
  name: string;
  impact: 'positive' | 'negative' | 'neutral';
  detail: string;
}

interface ForecastRisk {
  label: string;
  severity: 'high' | 'medium' | 'low';
  detail: string;
}

interface ForecastResponse {
  aiProbability: number;
  factors: ForecastFactor[];
  risks: ForecastRisk[];
  recommendation: string;
}

interface PersistedForecastPayload {
  aiProbability: number;
  salesProbability: number;
  gap: number;
  factors: ForecastFactor[];
  risks: ForecastRisk[];
  recommendation: string;
  dwellDays: number;
  generatedAt?: string;
  staleAfter?: string;
  stale?: boolean;
  cachedAt?: string;
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  const example = outputLocale === 'en'
    ? {
        name: 'Champion strength',
        detail: 'Concrete explanation, concise',
        riskLabel: 'Champion risk',
        riskDetail: 'The champion has not engaged recently.',
        recommendation: 'Confirm the economic buyer path before increasing forecast confidence.',
      }
    : {
        name: '因素名称',
        detail: '具体说明（简洁）',
        riskLabel: '风险标签（如：冠军流失、竞品逼近、情绪冷却）',
        riskDetail: '具体风险说明',
        recommendation: '一段简洁的行动建议（100字以内）',
      };

  return `你是 B2B 企业级销售 AI 预测专家，擅长基于多维数据评估商机真实成交概率。

你将收到以下数据：
- MEDDPICC 评分及各维度详情
- 相关谋局（战略计划）的执行状态及假设验证情况
- 联系人情绪趋势（态度变化）
- 最近的邮件解读信号
- 竞品威胁等级
- Deal 在当前阶段停留天数

请综合分析，输出 JSON：
{
  "aiProbability": 0-100 的整数（你评估的真实成交概率），
  "factors": [
    {
      "name": "${example.name}",
      "impact": "positive" | "negative" | "neutral",
      "detail": "${example.detail}"
    }
  ],
  "risks": [
    {
      "label": "${example.riskLabel}",
      "severity": "high" | "medium" | "low",
      "detail": "${example.riskDetail}"
    }
  ],
  "recommendation": "${example.recommendation}"
}

评估要点：
- 不要盲目跟随销售给出的概率，要基于客观数据独立判断
- MEDDPICC 低分是重大风险信号
- 联系人情绪 cooling/ghosting 应大幅降低概率
- 谋局步骤完成率低说明推进乏力
- 假设被否定(invalidated)是严重警告
- 竞品威胁 high/critical 要扣分
- 假设未验证数量多说明认知盲区大
- Deal 在同一阶段停留超过30天是停滞信号，超过60天是严重风险
- 输出 2-5 个风险项，按严重程度排序

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const { opportunityId, forceRefresh } = body as { opportunityId: string; forceRefresh?: boolean; outputLocale?: 'zh' | 'en' };
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: '请求过于频繁，请稍后再试。',
          en: 'Requests are too frequent. Please try again later.',
        }),
      }, { status: 429 });
    }

  const admin = requireAdmin();

  if (!opportunityId) {
    return Response.json({
      error: localizedUnavailableText(outputLocale, {
        zh: '缺少 opportunityId',
        en: 'Missing opportunityId',
      }),
    }, { status: 400 });
  }

  await requireOpportunityAccess(ctx, opportunityId);

  if (!forceRefresh && outputLocale === 'zh') {
    try {
      const { data: cachedForecast } = await admin
        .from('ai_forecasts')
        .select('*')
        .eq('org_id', ctx.orgId)
        .eq('opportunity_id', opportunityId)
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cachedForecast?.created_at) {
        const freshness = buildFreshnessMeta(cachedForecast.created_at);
        if (!freshness.stale) {
          return Response.json({
            aiProbability: cachedForecast.ai_probability,
            salesProbability: cachedForecast.sales_probability,
            gap: cachedForecast.gap,
            factors: cachedForecast.factors ?? [],
            risks: cachedForecast.risks ?? [],
            recommendation: cachedForecast.recommendation || (cachedForecast as Record<string, unknown>).reasoning as string || '',
            dwellDays: cachedForecast.dwell_days ?? 0,
            cachedAt: cachedForecast.created_at,
            ...freshness,
          } satisfies PersistedForecastPayload);
        }
      }
    } catch (cacheErr) {
      console.warn('[ai-forecast] cache lookup failed, fallback to realtime forecast', cacheErr);
    }
  }

  // Fetch opportunity
  const { data: opp } = await admin
    .from('opportunities')
    .select('id, name, stage, value, probability, account_id, meddicc, updated_at, created_at')
    .eq('id', opportunityId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!opp) {
    return Response.json({
      error: localizedUnavailableText(outputLocale, {
        zh: '商机不存在',
        en: 'Opportunity not found',
      }),
    }, { status: 404 });
  }

  const meddicc = opp.meddicc as Record<string, unknown> | null;
  const overallScore = (meddicc?.overallScore as number) ?? 0;
  const competition = (meddicc?.competition as { name: string; threatLevel: string }[]) ?? [];
  const champion = meddicc?.champion as { strength: number; lastEngagement: string; notes: string } | null;
  const economicBuyer = meddicc?.economicBuyer as { status: string } | null;
  const metrics = meddicc?.metrics as { status: string; notes: string } | null;
  const identifiedPain = (meddicc?.identifiedPain as { pain: string; quantified: boolean }[]) ?? [];

  // Calculate deal dwell time from latest stage-change event (fallback: created_at)
  let stageStartIso = opp.created_at as string | undefined;
  try {
    const { data: latestStageChange } = await admin
      .from('activity_logs')
      .select('created_at')
      .eq('org_id', ctx.orgId)
      .eq('entity_type', 'opportunity')
      .eq('entity_id', opportunityId)
      .eq('action_type', 'deal_stage_changed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestStageChange?.created_at) {
      stageStartIso = latestStageChange.created_at as string;
    }
  } catch (stageErr) {
    console.warn('[ai-forecast] stage dwell lookup failed, fallback to created_at', stageErr);
  }
  const stageStartMs = stageStartIso ? new Date(stageStartIso).getTime() : NaN;
  const dwellDays = Number.isNaN(stageStartMs)
    ? 0
    : Math.max(0, Math.floor((Date.now() - stageStartMs) / (1000 * 60 * 60 * 24)));

  // Fetch strategic plays + KB context in parallel
  const [{ data: plays }, kbContextResult] = await Promise.all([
    admin
      .from('strategic_plays')
      .select('id, goal_description, status, momentum, steps, assumptions, confidence')
      .eq('org_id', ctx.orgId)
      .eq('opportunity_id', opportunityId)
      .in('status', ['active', 'in_progress']),
    (opp.account_id && ctx.orgId)
      ? injectKnowledgeContextScoped(
          ctx,
          String(opp.account_id),
          `${opp.name} 成交概率预测 ${opp.stage}`,
          5,
        )
      : Promise.resolve(''),
  ]);

  const playSummary = (plays ?? []).map((p) => {
    const steps = (p.steps as { status: string }[]) ?? [];
    const total = steps.length;
    const completed = steps.filter((s) => s.status === 'completed').length;
    const assumptions = (p.assumptions as { status: string; text: string }[]) ?? [];
    const verified = assumptions.filter((a) => a.status === 'verified').length;
    const invalidated = assumptions.filter((a) => a.status === 'invalidated').length;
    const unverified = assumptions.filter((a) => a.status === 'unverified' || a.status === 'pending').length;
    return `- 目标: ${p.goal_description}\n  状态: ${p.status} | 势头: ${p.momentum} | 信心: ${p.confidence}%\n  步骤完成: ${completed}/${total} | 假设验证: ${verified}已验证/${invalidated}已否定/${unverified}未验证/${assumptions.length}总计`;
  }).join('\n');

  // Fetch contacts with attitude trends
  const { data: accountData } = await admin
    .from('accounts')
    .select('contacts')
    .eq('id', opp.account_id)
    .eq('org_id', ctx.orgId)
    .single();

  const contacts = (accountData?.contacts as { name: string; role?: string; attitudeTrend?: { date: string; score: number; label: string }[] }[]) ?? [];
  const contactTrends = contacts
    .filter((c) => c.attitudeTrend && c.attitudeTrend.length > 0)
    .map((c) => {
      const trend = c.attitudeTrend!;
      const latest = trend[trend.length - 1];
      const earliest = trend[0];
      const direction = latest.score > earliest.score ? '上升' : latest.score < earliest.score ? '下降' : '稳定';
      return `- ${c.name}（${c.role ?? '联系人'}）: 情绪${direction}，最新: ${latest.label}(${latest.score})，数据点: ${trend.length}`;
    }).join('\n');

  // Fetch recent decode signals
  const { data: recentDecodes } = await admin
    .from('email_decodes')
    .select('decode, date')
    .eq('org_id', ctx.orgId)
    .eq('account_id', opp.account_id)
    .order('date', { ascending: false })
    .limit(5);

  const decodeSignals = (recentDecodes ?? []).map((d) => {
    const decode = d.decode as Record<string, unknown> | null;
    const ta = decode?.threadAnalysis as Record<string, unknown> | null;
    return `[${d.date}] 信号: ${ta?.keySignal ?? '无'} | 买家状态: ${ta?.buyerState ?? '?'} | 情绪: ${ta?.sentimentTrend ?? '?'} | 风险: ${ta?.riskLevel ?? '?'}`;
  }).join('\n');

  // Build prompt
  const competitorSummary = competition.map((c) =>
    `- ${c.name}（威胁: ${c.threatLevel}）`
  ).join('\n');

  let cilContext = '';
  if (opp.account_id && ctx.orgId && ctx.orgId !== 'demo') {
    try {
      const cilData = await loadCILAccountContextScoped({
        orgId: ctx.orgId,
        accountId: String(opp.account_id),
        limitEvidence: 8,
        limitClaims: 10,
        ctx,
      });
      cilContext = buildCILForForecast(cilData) || '';
      if (cilContext) console.log(`[ai-forecast] CIL 上下文已注入，account=${opp.account_id}`);
    } catch (err) {
      console.warn('[ai-forecast] CIL 加载失败，回退到现有逻辑', err);
    }
  }

  // KB context already loaded in parallel above
  const kbContext = kbContextResult;

  const { tier } = getModelConfig({ task: 'strategy', dealValue: opp.value as number });

  const userPrompt = `## 商机信息
名称: ${opp.name}
阶段: ${opp.stage}
金额: ¥${opp.value}
销售预测概率: ${opp.probability}%
当前阶段停留天数: ${dwellDays} 天

## MEDDPICC 评估
综合评分: ${overallScore}/100
Metrics: ${metrics?.status ?? '未评估'} — ${metrics?.notes ?? ''}
Economic Buyer: ${economicBuyer?.status ?? '未知'}
Champion 强度: ${champion?.strength ?? 0}/5
痛点数量: ${identifiedPain.length}（已量化: ${identifiedPain.filter((p) => p.quantified).length}）
竞品: ${competition.length} 个

## 竞品威胁
${competitorSummary || '暂无竞品数据'}

## 谋局执行状态
${playSummary || '暂无进行中的谋局'}

## 联系人情绪趋势
${contactTrends || '暂无情绪数据'}

## 最近邮件解读信号
${decodeSignals || '暂无解读'}${cilContext}${kbContext}

请独立评估真实成交概率，不要被销售预测概率影响。列出 3-6 个关键影响因素和 2-5 个风险项。

${outputLocaleInstruction(outputLocale)}`;

    const result = await callAIWithFallback<ForecastResponse>({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt,
      tier,
    });

    if (result?.aiProbability == null) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: 'AI 分析失败',
          en: 'AI analysis failed',
        }),
      }, { status: 500 });
    }

    const aiProb = Math.max(0, Math.min(100, Math.round(result.aiProbability)));
    const salesProb = (opp.probability as number) ?? 0;

    const freshness = buildFreshnessMeta(new Date().toISOString());
    const forecastPayload: PersistedForecastPayload = {
      aiProbability: aiProb,
      salesProbability: salesProb,
      gap: Math.abs(aiProb - salesProb),
      factors: result.factors ?? [],
      risks: result.risks ?? [],
      recommendation: result.recommendation ?? '',
      dwellDays,
      cachedAt: freshness.generatedAt,
      ...freshness,
    };

    // Persist forecast to DB
    const forecastId = `fc_${opportunityId}_${Date.now()}`;
    const { error: saveErr } = await admin.from('ai_forecasts').upsert({
      id: forecastId,
      user_id: ctx.userId,
      org_id: ctx.orgId,
      opportunity_id: opportunityId,
      ai_probability: aiProb,
      sales_probability: salesProb,
      gap: forecastPayload.gap,
      factors: forecastPayload.factors,
      risks: forecastPayload.risks,
      recommendation: forecastPayload.recommendation,
      dwell_days: dwellDays,
    });
    if (saveErr) {
      console.error('[ai-forecast] SAVE FAILED:', saveErr.message);
    }

    // Fire-and-forget deposit
    if (result?.aiProbability != null && opp.account_id) {
      const depositContent = [
        `AI预测成交概率: ${aiProb}% (销售预测: ${salesProb}%, 偏差: ${forecastPayload.gap}%)`,
        `停留天数: ${dwellDays}天`,
        `关键因素: ${(result.factors ?? []).map((f: ForecastFactor) => `${f.name}(${f.impact})`).join('、')}`,
        `风险: ${(result.risks ?? []).map((r: ForecastRisk) => `${r.label}(${r.severity})`).join('、')}`,
        `建议: ${result.recommendation ?? ''}`,
      ].join('\n');

      depositKnowledge({
        orgId: ctx.orgId,
        accountId: String(opp.account_id),
        title: `成交预测：${opp.name}`,
        content: depositContent,
        category: 'deal_lesson',
        source: 'ai_forecast',
        sourceType: 'ai_forecasts',
        sourceId: forecastId,
      });
    }

    return Response.json(forecastPayload);
  } catch (err) {
    logError('ai-forecast', err);
    return guardResponse(err);
  }
}

// GET: Load latest cached forecast for an opportunity
export async function GET(req: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(req.url);
    const opportunityId = searchParams.get('opportunityId');
    const outputLocale = normalizeOutputLocale(searchParams.get('outputLocale'));

    if (!opportunityId) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: '缺少 opportunityId',
          en: 'Missing opportunityId',
        }),
      }, { status: 400 });
    }

    if (outputLocale === 'en') {
      return Response.json(null);
    }

    const admin = requireAdmin();

    const { data, error } = await admin
      .from('ai_forecasts')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('opportunity_id', opportunityId)
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // Table may not exist yet
      console.warn('[ai-forecast] load error:', error.message);
      return Response.json(null);
    }

    if (!data) return Response.json(null);

    const freshness = buildFreshnessMeta(data.created_at);

    return Response.json({
      aiProbability: data.ai_probability,
      salesProbability: data.sales_probability,
      gap: data.gap,
      factors: data.factors ?? [],
      risks: data.risks ?? [],
      recommendation: data.recommendation || (data as Record<string, unknown>).reasoning as string || '',
      dwellDays: data.dwell_days ?? 0,
      cachedAt: data.created_at,
      ...freshness,
    } satisfies PersistedForecastPayload);
  } catch (err) {
    logError('ai-forecast', err);
    return guardResponse(err);
  }
}
