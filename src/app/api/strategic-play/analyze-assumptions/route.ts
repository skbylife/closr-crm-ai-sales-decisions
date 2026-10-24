import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { applyAIRateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

// POST — AI 分析关键假设
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json() as {
      accountName?: string;
      goalType?: string;
      goalDescription?: string;
      successCriteria?: string;
      contactsSummary?: string;
      outputLocale?: 'zh' | 'en';
    };
    const outputLocale = normalizeOutputLocale(body.outputLocale);
    applyAIRateLimit(ctx.userId);

    if (!body.goalDescription) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: '缺少目标描述',
          en: 'Missing goal description',
        }),
      }, { status: 400 });
    }

    const exampleAssumptions = outputLocale === 'en'
      ? '["Assume the CTO still owns the cloud migration decision", "Assume the competitor has not entered formal evaluation yet"]'
      : '["假设 CTO 对云迁移有兴趣", "假设竞对尚未进入评估流程"]';

    const systemPrompt = `你是一个 B2B 销售策略专家。根据谋局目标和上下文，识别 3-5 个需要验证的关键假设。
这些假设是谋局成功的前提条件，但尚未被验证。

输出格式：JSON 数组，每个元素是一个字符串。
示例：${exampleAssumptions}

${outputLocaleInstruction(outputLocale)}`;

    const userPrompt = `客户: ${body.accountName ?? '未知'}
目标类型: ${body.goalType ?? '未知'}
目标描述: ${body.goalDescription}
成功标准: ${body.successCriteria ?? '未指定'}
关键联系人: ${body.contactsSummary ?? '无'}

请分析 3-5 个关键假设。

${outputLocaleInstruction(outputLocale)}`;

    const assumptions = await callAIWithFallback<string[]>({
      systemPrompt,
      userPrompt,
      tier: 'flash',
      temperature: 0.6,
    });

    return Response.json({ assumptions: Array.isArray(assumptions) ? assumptions : [] });
  } catch (err) {
    logError('analyze-assumptions', err);
    return guardResponse(err);
  }
}
