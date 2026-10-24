import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { applyAIRateLimit } from '@/lib/rate-limit';
import type { SpinItem, DiscoveryScore } from '@/lib/babel-engine/types';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface SpinAnalyzeRequest {
  content: string;
  opportunityContext?: {
    name: string;
    stage: string;
    value: number;
    accountName: string;
    existingSpinItems?: SpinItem[];
  };
  outputLocale?: 'zh' | 'en';
}

interface SpinAnalyzeResponse {
  spinItems: SpinItem[];
  score: DiscoveryScore;
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是一个 B2B 销售发现（Discovery）专家，精通 SPIN Selling 方法论。
你的任务是分析销售人员的发现笔记，将每条信息分类到 SPIN 四个维度中。

SPIN 分类标准：
- S (Situation / 现状)：关于客户当前状况的事实描述。例如：团队规模、使用的系统、流程、预算周期等。
- P (Problem / 问题)：客户面临的困难、不满、挑战。例如：效率低、成本高、流程复杂、人员流失等。
- I (Implication / 后果)：问题带来的负面影响和业务后果。例如：收入下降、客户流失、竞争力减弱、合规风险等。
- N (Need-payoff / 需求回报)：客户期望的结果、价值和 ROI。例如：希望提升效率 30%、节省成本、改善客户满意度等。

分析要求：
1. 将笔记内容拆分为独立的信息条目
2. 为每条信息分配 SPIN 分类和置信度（0-1）
3. 计算每个维度的发现完成度（每项 0-25 分，总分 0-100）
4. 识别薄弱维度，生成针对性的推荐提问

评分标准：
- 每个维度 0-25 分
- 0-5：几乎没有该维度的信息
- 6-10：有基本信息但不够深入
- 11-15：有较好的信息覆盖
- 16-20：信息丰富且有深度
- 21-25：非常全面，有量化数据支撑

保持 JSON keys 和枚举值不变；推荐问题和提取的信息条目按输出语言生成。返回 JSON：
{
  "spinItems": [
    { "text": "提取的信息条目", "category": "situation|problem|implication|need_payoff", "confidence": 0.85 }
  ],
  "score": {
    "situation": 15,
    "problem": 10,
    "implication": 5,
    "needPayoff": 8,
    "total": 38,
    "missingCategories": ["implication"],
    "recommendedQuestions": ["如果这个问题持续下去，对贵公司的年度收入会有多大影响？"]
  }
}

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);
    const body = (await request.json()) as SpinAnalyzeRequest;
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (!body.content?.trim()) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请提供需要分析的发现笔记内容。', en: 'Provide discovery notes to analyze.' }),
      }, { status: 400 });
    }

    const contextSection = body.opportunityContext
      ? `\n商机背景：
客户：${body.opportunityContext.accountName}
商机：${body.opportunityContext.name}
阶段：${body.opportunityContext.stage}
金额：$${body.opportunityContext.value.toLocaleString()}
${
  body.opportunityContext.existingSpinItems &&
  body.opportunityContext.existingSpinItems.length > 0
    ? `\n已有 SPIN 分类（请在此基础上补充新信息，避免重复）：
${body.opportunityContext.existingSpinItems
  .map((item) => `- [${item.category.toUpperCase()}] ${item.text}`)
  .join('\n')}`
    : ''
}`
      : '';

    const userPrompt = `请分析以下发现笔记，提取 SPIN 分类信息并评估发现完成度。
${contextSection}

发现笔记内容：
${body.content}

要求：
- 将每条有价值的信息提取为独立条目
- 准确分类到 S/P/I/N 维度
- 给出每条分类的置信度
- 综合评估四个维度的发现深度
- 对薄弱维度生成 3-5 个推荐提问
- missingCategories 包含得分低于 10 的维度`;

    const result = await callAIWithFallback<SpinAnalyzeResponse>({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt: userPrompt + '\n\n' + outputLocaleInstruction(outputLocale),
    });

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
