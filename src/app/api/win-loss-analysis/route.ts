import { requireAuth, requireAdmin, requireOpportunityAccess, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { getModelConfig } from '@/lib/babel-engine/model-router';
import { isAIRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface KeyFactor {
  factor: string;
  impact: 'decisive' | 'contributing' | 'minor';
}

interface PlayEffectiveness {
  playId: string;
  goalDescription: string;
  contribution: string;
}

interface AssumptionReview {
  text: string;
  wasCorrect: boolean;
  impact: string;
}

interface WinLossResponse {
  result: 'won' | 'lost';
  summary: string;
  winFactors: KeyFactor[];
  lossFactors: KeyFactor[];
  missedSignals: string[];
  competitorInsight: string;
  playEffectiveness: PlayEffectiveness[];
  assumptions: AssumptionReview[];
  turningPoint: string;
  lessonsLearned: string[];
  recommendations: string[];
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是 B2B 企业级销售复盘分析专家，擅长对已结束的商机进行深度 Win/Loss 分析。

你将收到一个已成交或已丢失的商机的完整数据，包括：
- 商机基本信息和结果
- MEDDPICC 评估历史
- 相关谋局（战略计划）的执行记录
- 联系人互动历史
- 邮件解读信号
- 竞品信息

请进行深度复盘分析，输出 JSON：
{
  "result": "won" | "lost",
  "summary": "一句话总结本单的核心结论",
  "winFactors": [
    {"factor": "促成赢单的因素描述", "impact": "decisive" | "contributing" | "minor"}
  ],
  "lossFactors": [
    {"factor": "导致丢单/本可做得更好的因素", "impact": "decisive" | "contributing" | "minor"}
  ],
  "missedSignals": ["被忽略的危险/机会信号1", "信号2", ...],
  "competitorInsight": "竞品分析：对手如何影响了本单结果，我们的竞争应对是否到位",
  "playEffectiveness": [
    {"playId": "谋局ID", "goalDescription": "谋局目标", "contribution": "该谋局对结果的贡献分析"}
  ],
  "assumptions": [
    {"text": "假设内容", "wasCorrect": true/false, "impact": "该假设正确/错误带来的影响"}
  ],
  "turningPoint": "关键转折点描述（一段话）",
  "lessonsLearned": ["经验教训1", "经验教训2", ...],
  "recommendations": ["未来建议1", "未来建议2", ...]
}

分析要点：
- 赢单分析：哪些策略/谋局起了关键作用？MEDDPICC 哪些维度分高？Champion 是否发力？
- 丢单分析：丢在哪个环节？哪些信号被忽略？竞品如何赢的？
- winFactors 记录促成赢单的正面因素（赢单时为主要输出，丢单时也可有少量）
- lossFactors 记录导致丢单的负面因素（丢单时为主要输出，赢单时也记录可改进点）
- missedSignals 列出邮件解读和联系人情绪中被忽略的重要信号
- competitorInsight 分析竞品对本单的影响
- 对每个谋局的实际效果做客观评估
- 识别假设验证的正确性及其影响
- 找出关键转折点
- 提炼可复制的经验教训（这些会存入组织知识库）
- 给出未来类似商机的具体建议

保持 JSON keys 和枚举值不变；summary、因素、洞察、复盘和建议按输出语言生成。

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const { opportunityId } = body as { opportunityId: string; outputLocale?: 'zh' | 'en' };
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (isAIRateLimited(ctx.userId)) {
    return Response.json({
      error: localizedUnavailableText(outputLocale, { zh: '请求过于频繁，请稍后再试。', en: 'Requests are too frequent. Please try again later.' }),
    }, { status: 429 });
  }

  const admin = requireAdmin();

  if (!opportunityId) {
    return Response.json({
      error: localizedUnavailableText(outputLocale, { zh: '缺少 opportunityId', en: 'Missing opportunityId' }),
    }, { status: 400 });
  }

  await requireOpportunityAccess(ctx, opportunityId);

  // Fetch opportunity
  const { data: opp } = await admin
    .from('opportunities')
    .select('id, name, stage, value, probability, account_id, meddicc, lost_reason, won_date, notes, created_at, updated_at, org_id')
    .eq('id', opportunityId)
    .eq('org_id', ctx.orgId)
    .single();

  if (!opp) {
    return Response.json({
      error: localizedUnavailableText(outputLocale, { zh: '商机不存在', en: 'Opportunity not found' }),
    }, { status: 404 });
  }

  if (opp.stage !== 'closed_won' && opp.stage !== 'closed_lost') {
    return Response.json({
      error: localizedUnavailableText(outputLocale, { zh: '仅支持已成交或已丢失的商机', en: 'Only closed-won or closed-lost opportunities are supported.' }),
    }, { status: 400 });
  }

  const meddicc = opp.meddicc as Record<string, unknown> | null;
  const overallScore = (meddicc?.overallScore as number) ?? 0;
  const competition = (meddicc?.competition as { name: string; strengths: string; ourAdvantage: string; threatLevel: string }[]) ?? [];
  const champion = meddicc?.champion as { strength: number; notes: string } | null;
  const economicBuyer = meddicc?.economicBuyer as { status: string } | null;
  const identifiedPain = (meddicc?.identifiedPain as { pain: string; quantified: boolean }[]) ?? [];
  const metrics = meddicc?.metrics as { status: string; notes: string } | null;
  const decisionCriteria = (meddicc?.decisionCriteria as { criterion: string; met: boolean }[]) ?? [];
  const decisionProcess = (meddicc?.decisionProcess as { step: string; status: string }[]) ?? [];

  // Fetch plays, contacts, decodes, and KB context in parallel
  const isWon = opp.stage === 'closed_won';

  const [{ data: plays }, { data: accountData }, { data: decodes }, kbContext] = await Promise.all([
    admin
      .from('strategic_plays')
      .select('id, goal_description, status, momentum, steps, assumptions, learnings, review, confidence')
      .eq('org_id', ctx.orgId)
      .eq('opportunity_id', opportunityId),
    admin
      .from('accounts')
      .select('contacts, name, industry')
      .eq('id', opp.account_id)
      .eq('org_id', ctx.orgId)
      .single(),
    admin
      .from('email_decodes')
      .select('decode, date, client_name')
      .eq('org_id', ctx.orgId)
      .eq('account_id', opp.account_id)
      .order('date', { ascending: true })
      .limit(20),
    (opp.account_id && ctx.orgId)
      ? injectKnowledgeContextScoped(
          ctx,
          String(opp.account_id),
          `${opp.name} ${opp.stage === 'closed_won' ? '赢单' : '丢单'} 复盘分析`,
          5,
        )
      : Promise.resolve(''),
  ]);

  const playSummary = (plays ?? []).map((p) => {
    const steps = (p.steps as { title: string; status: string; actualResult?: string }[]) ?? [];
    const total = steps.length;
    const completed = steps.filter((s) => s.status === 'completed').length;
    const assumptions = (p.assumptions as { text: string; status: string; evidence?: string }[]) ?? [];
    const learnings = (p.learnings as { learning: string }[]) ?? [];
    const review = p.review as { result?: string; whatWorked?: string[]; lessonsForFuture?: string[] } | null;

    return `### 谋局: ${p.goal_description} (ID: ${p.id})
状态: ${p.status} | 势头: ${p.momentum} | 信心: ${p.confidence}%
步骤完成: ${completed}/${total}
${steps.map((s) => `  - ${s.title}: ${s.status}${s.actualResult ? ` → ${s.actualResult}` : ''}`).join('\n')}
假设:
${assumptions.map((a) => `  - [${a.status}] ${a.text}${a.evidence ? ` (证据: ${a.evidence})` : ''}`).join('\n') || '  无'}
经验:
${learnings.map((l) => `  - ${l.learning}`).join('\n') || '  无'}
${review ? `复盘: ${review.result}\n  有效做法: ${(review.whatWorked ?? []).join(', ')}\n  教训: ${(review.lessonsForFuture ?? []).join(', ')}` : ''}`;
  }).join('\n\n');

  const contacts = (accountData?.contacts as { name: string; role?: string; attitudeTrend?: { date: string; score: number; label: string }[] }[]) ?? [];
  const contactSummary = contacts.map((c) => {
    const trend = c.attitudeTrend ?? [];
    const trendStr = trend.length > 0
      ? `情绪轨迹: ${trend.map((t) => `${t.label}(${t.score})`).join(' → ')}`
      : '无情绪数据';
    return `- ${c.name}（${c.role ?? '联系人'}）: ${trendStr}`;
  }).join('\n');

  const decodeTimeline = (decodes ?? []).map((d) => {
    const decode = d.decode as Record<string, unknown> | null;
    const ta = decode?.threadAnalysis as Record<string, unknown> | null;
    return `[${d.date}] ${d.client_name ?? '未知'} — 信号: ${ta?.keySignal ?? '无'} | 买家状态: ${ta?.buyerState ?? '?'} | 风险: ${ta?.riskLevel ?? '?'}`;
  }).join('\n');

  const competitorSummary = competition.map((c) =>
    `- ${c.name}（威胁: ${c.threatLevel}）\n  对方优势: ${c.strengths || '未知'}\n  我方对策: ${c.ourAdvantage || '未制定'}`
  ).join('\n');

  // Use model router for tier selection
  const { tier } = getModelConfig({
    task: 'strategy',
    dealValue: opp.value,
    complexity: 'high',
  });

  const userPrompt = `## 商机信息
名称: ${opp.name}
客户: ${accountData?.name ?? '未知'}
行业: ${accountData?.industry ?? '未知'}
结果: ${isWon ? '成交' : '丢失'}
金额: ¥${opp.value}
${!isWon && opp.lost_reason ? `丢失原因: ${opp.lost_reason}` : ''}
${isWon && opp.won_date ? `成交日期: ${opp.won_date}` : ''}
创建时间: ${opp.created_at}
结束时间: ${opp.updated_at}
备注: ${opp.notes || '无'}

## MEDDPICC 终态
综合评分: ${overallScore}/100
Metrics: ${metrics?.status ?? '未知'} — ${metrics?.notes ?? ''}
Economic Buyer: ${economicBuyer?.status ?? '未知'}
Decision Criteria: ${decisionCriteria.map((dc) => `${dc.criterion}(${dc.met ? '已满足' : '未满足'})`).join(', ') || '无'}
Decision Process: ${decisionProcess.map((dp) => `${dp.step}(${dp.status})`).join(' → ') || '无'}
Champion 强度: ${champion?.strength ?? 0}/5 — ${champion?.notes ?? ''}
痛点: ${identifiedPain.map((p) => `${p.pain}${p.quantified ? '(已量化)' : ''}`).join(', ') || '无'}

## 竞品
${competitorSummary || '暂无竞品数据'}

## 谋局执行全记录
${playSummary || '无谋局记录'}

## 联系人情绪变化
${contactSummary || '无联系人数据'}

## 邮件解读时间线
${decodeTimeline || '无解读记录'}${kbContext}

请进行深度 Win/Loss 复盘分析。

${outputLocaleInstruction(outputLocale)}`;

  try {
    const result = await callAIWithFallback<WinLossResponse>({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt,
      tier,
    });

    if (!result?.summary) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: 'AI 分析失败', en: 'AI analysis failed' }),
      }, { status: 500 });
    }

    const response: WinLossResponse = {
      result: isWon ? 'won' : 'lost',
      summary: result.summary ?? '',
      winFactors: result.winFactors ?? [],
      lossFactors: result.lossFactors ?? [],
      missedSignals: result.missedSignals ?? [],
      competitorInsight: result.competitorInsight ?? '',
      playEffectiveness: result.playEffectiveness ?? [],
      assumptions: result.assumptions ?? [],
      turningPoint: result.turningPoint ?? '',
      lessonsLearned: result.lessonsLearned ?? [],
      recommendations: result.recommendations ?? [],
    };

    // Auto-save lessons learned to knowledge_items (fire-and-forget)
    if (response.lessonsLearned.length > 0) {
      const lessonId = crypto.randomUUID();
      const knowledgeContent = [
        `## ${isWon ? '赢单' : '丢单'}复盘：${opp.name}`,
        `**客户**: ${accountData?.name ?? '未知'} | **行业**: ${accountData?.industry ?? '未知'} | **金额**: ¥${opp.value}`,
        '',
        `### 核心结论`,
        response.summary,
        '',
        `### 经验教训`,
        ...response.lessonsLearned.map((l, i) => `${i + 1}. ${l}`),
        '',
        `### 未来建议`,
        ...response.recommendations.map((r, i) => `${i + 1}. ${r}`),
        ...(response.missedSignals.length > 0
          ? ['', '### 被忽略的信号', ...response.missedSignals.map((s, i) => `${i + 1}. ${s}`)]
          : []),
      ].join('\n');

      admin
        .from('knowledge_items')
        .insert({
          id: lessonId,
          title: `${isWon ? '赢单' : '丢单'}复盘 — ${opp.name}`,
          category: 'case_study',
          content: knowledgeContent,
          user_id: ctx.userId,
          org_id: ctx.orgId,
          created_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) console.error('[win-loss] 保存知识库失败:', error);
        });

      // Parallel deposit to knowledge_base
      depositKnowledge({
        orgId: ctx.orgId,
        accountId: String(opp.account_id),
        title: `${isWon ? '赢单' : '丢单'}复盘：${opp.name}`,
        content: knowledgeContent,
        category: 'deal_lesson',
        source: 'ai_win_loss',
        sourceType: 'knowledge_items',
        sourceId: lessonId,
      });
    }

    return Response.json(response);
  } catch (err) {
    logError('win-loss-analysis', err);
    return guardResponse(err);
  }
  } catch (err) {
    logError('win-loss-analysis', err);
    return guardResponse(err);
  }
}
