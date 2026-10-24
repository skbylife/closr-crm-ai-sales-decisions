import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { emitEvent } from '@/lib/ai-event-hub';
import { isAIRateLimited } from '@/lib/rate-limit';
import { safeCatch } from '@/lib/error-monitor';
import type { IntelAnalysis } from '@/lib/babel-engine/types';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface IntelRequestBody {
  accountName: string;
  source: string;
  content: string;
  credibility: string;
  urgency: string;
  outputLocale?: 'zh' | 'en';
}

function buildIntelSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是一个资深的 B2B 销售情报分析师，专注于 ESL（电子货架标签）行业。
你的任务是分析销售团队收集到的情报，提供专业的分析报告。

分析要求：
1. 交叉验证建议：基于情报内容，列出 2-4 条应该去验证的信息点
2. 情报含义分析：这条情报对销售进程意味着什么，有什么深层含义
3. 建议行动：48 小时内应该采取的 2-4 个具体行动
4. 风险评估：评估风险等级（low/medium/high/critical）并说明原因

务必简洁、直击要害，像一份客户情报简报。保持 JSON keys 和枚举值不变。

返回 JSON 格式：
{
  "crossValidation": ["验证点1", "验证点2", ...],
  "implications": "含义分析文本",
  "suggestedActions": ["行动1", "行动2", ...],
  "riskAssessment": {
    "level": "low|medium|high|critical",
    "description": "风险说明"
  }
}

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as IntelRequestBody;
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请求过于频繁，请稍后再试。', en: 'Requests are too frequent. Please try again later.' }),
      }, { status: 429 });
    }

    if (!body.content || body.content.trim().length === 0) {
      return Response.json(
        { error: localizedUnavailableText(outputLocale, { zh: '请输入情报内容。', en: 'Enter intel content.' }) },
        { status: 400 }
      );
    }

    if (!body.accountName || body.accountName.trim().length === 0) {
      return Response.json(
        { error: localizedUnavailableText(outputLocale, { zh: '请输入客户名称。', en: 'Enter an account name.' }) },
        { status: 400 }
      );
    }

    const userPrompt = `客户：${body.accountName}
情报来源：${body.source}
可信度：${body.credibility}
紧急度：${body.urgency}

情报内容：
${body.content}`;

    const analysis = await callAIWithFallback<IntelAnalysis>({
      systemPrompt: buildIntelSystemPrompt(outputLocale),
      userPrompt: userPrompt + '\n\n' + outputLocaleInstruction(outputLocale),
    });

    // AI Event Pipeline: intel 创建事件
    void emitEvent({
      orgId: ctx.orgId,
      userId: ctx.userId,
      eventType: 'intel.created',
      entityType: 'intel_item',
      entityId: body.accountName,
      payload: {
        accountName: body.accountName,
        source: body.source,
        credibility: body.credibility,
        urgency: body.urgency,
        riskLevel: analysis.riskAssessment?.level,
      },
    }).catch(safeCatch('intel', 'event-emit', { accountName: body.accountName }));

    return Response.json(analysis);
  } catch (err) {
    return guardResponse(err);
  }
}
