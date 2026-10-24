import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { isAIRateLimited } from '@/lib/rate-limit';
import { withDailyCache } from '@/lib/ai-cache';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface FinancialAnalysisRequest {
  companyName: string;
  financialData: string;
  industry?: string;
  accountId?: string;      // optional — if provided, enables daily cache
  forceRefresh?: boolean;
  outputLocale?: 'zh' | 'en';
}

interface FinancialAnalysisResponse {
  keyMetrics: { name: string; value: string; trend: 'up' | 'down' | 'stable'; note: string }[];
  strategicKeywords: { keyword: string; frequency: 'high' | 'medium' | 'low'; significance: string }[];
  digitalSignals: string[];
  riskSignals: string[];
  salesTalkingPoints: string[];
  overallAssessment: string;
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是一个资深的财务分析师，专注于从财报中提取 B2B 销售情报。
你的任务是分析客户的财报内容，提取对销售有价值的情报。

分析要求：
1. keyMetrics：提取 3-6 个关键财务指标，包括名称、数值、趋势（up/down/stable）和备注
2. strategicKeywords：提取 3-5 个战略关键词及其出现频率（high/medium/low）和意义
3. digitalSignals：数字化转型/技术投资相关的信号（2-4 条）
4. riskSignals：风险信号，如裁员、预算削减、领导层变动等（2-4 条）
5. salesTalkingPoints：基于财报内容的话术建议——应该怎么跟客户说（3-5 条）
6. overallAssessment：总体评估，一段话概括客户的财务状况和购买能力

风格像一份销售情报简报：数据驱动、直击要害、可操作。保持 JSON keys 和枚举值不变。

返回 JSON 格式：
{
  "keyMetrics": [{"name": "...", "value": "...", "trend": "up|down|stable", "note": "..."}],
  "strategicKeywords": [{"keyword": "...", "frequency": "high|medium|low", "significance": "..."}],
  "digitalSignals": ["..."],
  "riskSignals": ["..."],
  "salesTalkingPoints": ["..."],
  "overallAssessment": "..."
}

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as FinancialAnalysisRequest;
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请求过于频繁，请稍后再试。', en: 'Requests are too frequent. Please try again later.' }),
      }, { status: 429 });
    }

    if (!body.financialData || body.financialData.trim().length < 20) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请粘贴财报内容（至少20字）。', en: 'Paste financial report content with at least 20 characters.' }),
      }, { status: 400 });
    }

    if (!body.companyName || body.companyName.trim().length === 0) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请输入公司名称。', en: 'Enter a company name.' }),
      }, { status: 400 });
    }

    const userPrompt = `目标公司：${body.companyName}
${body.industry ? `行业：${body.industry}` : ''}

财报内容：
${body.financialData.slice(0, 10000)}

请分析以上财报内容，提取关键指标、战略信号和销售话术建议。`;

    // If accountId is provided, use daily cache; otherwise compute fresh (ad-hoc analysis)
    if (body.accountId && outputLocale === 'zh') {
      const result = await withDailyCache<Record<string, unknown>>({
        orgId: ctx.orgId,
        entityType: 'account',
        entityId: body.accountId,
        insightType: 'financial_analysis',
        forceRefresh: body.forceRefresh,
        trigger: 'financial_analysis',
        compute: async () => {
          const aiResult = await callAIWithFallback<FinancialAnalysisResponse>({
            systemPrompt: buildSystemPrompt(outputLocale),
            userPrompt: userPrompt + '\n\n' + outputLocaleInstruction(outputLocale),
          });
          return aiResult as unknown as Record<string, unknown>;
        },
      });
      return Response.json(result);
    }

    // Ad-hoc: no cache
    const result = await callAIWithFallback<FinancialAnalysisResponse>({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt: userPrompt + '\n\n' + outputLocaleInstruction(outputLocale),
    });

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
