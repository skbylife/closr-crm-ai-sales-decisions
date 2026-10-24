import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { applyAIRateLimit } from '@/lib/rate-limit';
import { withDailyCache } from '@/lib/ai-cache';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface TaskSummary {
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  isOverdue: boolean;
}

interface MeddiccAssessRequest {
  account: {
    id?: string;           // accountId — enables daily cache
    name: string;
    industry?: string;
    dealStage?: string;
    dealValue?: number;
  };
  meddicc: {
    metrics: { notes: string; status: string };
    economicBuyer: { contactName?: string; status: string };
    decisionCriteria: { items: { criterion: string; fit: string }[] };
    decisionProcess: { steps: { name: string; completed: boolean }[] };
    pain: { items: { pain: string; quantified: string }[] };
    champion: { contactName?: string; strength: number };
    competition: { name: string; theirAdvantage: string; ourCounter: string }[];
  };
  tasks?: TaskSummary[];
  forceRefresh?: boolean;
  outputLocale?: 'zh' | 'en';
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是一个 B2B 销售资格评估专家，精通 MEDDICC 方法论。
基于当前 MEDDICC 评分卡的填写情况，给出改进建议。

分析每个维度的完成度，指出薄弱环节，给出具体的下一步行动建议。

重要：如果提供了关联任务信息，请在评估中考虑任务执行情况：
- 逾期未完成的任务意味着执行风险，应降低相应维度的分数
- 所有关键任务已完成说明执行到位，可以适当提高信心
- 高优先级任务未完成是重要的风险信号

保持 JSON keys 和枚举值不变；suggestion、topPriorities、taskRiskNote、narrative 按输出语言生成。返回 JSON：
{
  "overallScore": 65,
  "dimensionScores": {
    "metrics": { "score": 10, "maxScore": 15, "suggestion": "..." },
    "economicBuyer": { "score": 5, "maxScore": 15, "suggestion": "..." },
    "decisionCriteria": { "score": 10, "maxScore": 15, "suggestion": "..." },
    "decisionProcess": { "score": 8, "maxScore": 10, "suggestion": "..." },
    "pain": { "score": 10, "maxScore": 15, "suggestion": "..." },
    "champion": { "score": 7, "maxScore": 15, "suggestion": "..." },
    "competition": { "score": 10, "maxScore": 15, "suggestion": "..." }
  },
  "topPriorities": ["...", "...", "..."],
  "taskRiskNote": "...",
  "narrative": "..."
}

${outputLocaleInstruction(outputLocale)}`;
}

function buildUserPrompt(body: MeddiccAssessRequest): string {
  let userPrompt = `客户：${body.account.name}
行业：${body.account.industry ?? '未知'}
交易阶段：${body.account.dealStage ?? '未知'}
交易金额：${body.account.dealValue ? `$${body.account.dealValue.toLocaleString()}` : '未知'}

MEDDICC 当前状态：
M (Metrics)：${body.meddicc.metrics.notes || '未填写'} — 状态: ${body.meddicc.metrics.status}
E (Economic Buyer)：${body.meddicc.economicBuyer.contactName || '未识别'} — 状态: ${body.meddicc.economicBuyer.status}
D (Decision Criteria)：${body.meddicc.decisionCriteria.items.map(i => `${i.criterion}[${i.fit}]`).join(', ') || '未填写'}
D (Decision Process)：${body.meddicc.decisionProcess.steps.map(s => `${s.name}[${s.completed ? '✓' : '✗'}]`).join(' → ') || '未填写'}
I (Identify Pain)：${body.meddicc.pain.items.map(i => `${i.pain}[${i.quantified}]`).join(', ') || '未填写'}
C (Champion)：${body.meddicc.champion.contactName || '未识别'} — 强度: ${body.meddicc.champion.strength}/5
C (Competition)：${body.meddicc.competition.map(c => c.name).join(', ') || '未识别竞品'}`;

  // Add task information if available
  if (body.tasks && body.tasks.length > 0) {
    const overdueTasks = body.tasks.filter(t => t.isOverdue);
    const completedTasks = body.tasks.filter(t => t.status === 'done');
    const activeTasks = body.tasks.filter(t => t.status !== 'done');

    userPrompt += `\n\n=== 关联任务执行情况（${body.tasks.length} 个任务）===
已完成: ${completedTasks.length} 个
进行中/待办: ${activeTasks.length} 个
逾期未完成: ${overdueTasks.length} 个`;

    if (overdueTasks.length > 0) {
      userPrompt += `\n\n逾期任务详情：`;
      for (const t of overdueTasks) {
        userPrompt += `\n- [${t.priority}] ${t.title}（截止: ${t.dueDate}）`;
      }
    }

    if (activeTasks.length > 0) {
      userPrompt += `\n\n当前活跃任务：`;
      for (const t of activeTasks.slice(0, 10)) {
        userPrompt += `\n- [${t.priority}/${t.status}] ${t.title}${t.dueDate ? `（截止: ${t.dueDate}）` : ''}`;
      }
    }
  }

  userPrompt += `\n\n请评估 MEDDICC 各维度完成度，给出分数和改进建议。`;
  return userPrompt;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);
    const body = (await request.json()) as MeddiccAssessRequest;
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (!body.account?.name) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请提供客户信息。', en: 'Provide account information.' }),
      }, { status: 400 });
    }

    const userPrompt = buildUserPrompt(body) + '\n\n' + outputLocaleInstruction(outputLocale);

    // If accountId is provided, use daily cache
    if (body.account.id && outputLocale === 'zh') {
      const result = await withDailyCache<Record<string, unknown>>({
        orgId: ctx.orgId,
        entityType: 'account',
        entityId: body.account.id,
        insightType: 'meddicc_assessment',
        forceRefresh: body.forceRefresh,
        trigger: 'meddicc_assess',
        compute: async () => {
          const aiResult = await callAIWithFallback({
            systemPrompt: buildSystemPrompt(outputLocale),
            userPrompt,
          });
          return aiResult as Record<string, unknown>;
        },
      });
      return Response.json(result);
    }

    // No accountId — compute fresh (backward compatible)
    const result = await callAIWithFallback({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt,
    });

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
