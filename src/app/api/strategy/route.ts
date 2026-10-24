import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { generateStrategy } from '@/lib/babel-engine/strategy';
import { applyAIRateLimit } from '@/lib/rate-limit';
import type { DecodeOutput, IntelSummaryForStrategy, TaskSummaryForStrategy } from '@/lib/babel-engine/types';
import { loadCILAccountContextScoped } from '@/lib/compiled-intelligence/context';
import { buildCILForStrategy } from '@/lib/compiled-intelligence/prompt-context';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { normalizeOutputLocale } from '@/lib/output-locale';

interface StrategyRequestBody {
  decodedEmail: DecodeOutput;
  context?: string;
  contactDiscType?: string;
  // 关联账户，用于查询情报
  accountId?: string;
  // 相关任务数据，用于策略评估上下文
  tasks?: TaskSummaryForStrategy[];
  outputLocale?: unknown;
}

/** 查询 account 最近 5 条情报 */
async function fetchRecentIntel(orgId: string, accountId: string): Promise<IntelSummaryForStrategy[]> {
  const admin = requireAdmin();
  const { data } = await admin
    .from('intel_items')
    .select('title, summary, type, date, urgency')
    .eq('org_id', orgId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (!data || data.length === 0) return [];
  return data.map((r: Record<string, unknown>) => ({
    title: (r.title as string) ?? '',
    summary: (r.summary as string) ?? '',
    type: (r.type as string) ?? 'unknown',
    date: (r.date as string) ?? '',
    urgency: (r.urgency as string) ?? 'medium',
  }));
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);

    const body = (await request.json()) as StrategyRequestBody;
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (!body.decodedEmail || !body?.decodedEmail?.messages || !body?.decodedEmail?.threadAnalysis) {
      return Response.json(
        { error: '缺少解读数据。' },
        { status: 400 }
      );
    }

    // 并行加载：情报 + CIL + 知识库 + 活跃谋局
    let intelItems: IntelSummaryForStrategy[] | undefined;
    let cilContext: string | undefined;
    let knowledgeContext: string | undefined;
    let playsContext: string | undefined;

    if (body.accountId && ctx.orgId) {
      await requireAccountAccess(ctx, body.accountId);
      const admin = requireAdmin();
      const threadSummary = body.decodedEmail.threadAnalysis?.keySignal || '';
      const queryHint = `回复策略 ${threadSummary}`.trim();

      const [intelResult, cilResult, kbResult, playsResult] = await Promise.allSettled([
        fetchRecentIntel(ctx.orgId, body.accountId),
        loadCILAccountContextScoped({ orgId: ctx.orgId, accountId: body.accountId, limitEvidence: 8, limitClaims: 10, ctx })
          .then((cilData) => buildCILForStrategy(cilData) || undefined),
        injectKnowledgeContextScoped(ctx, body.accountId, queryHint, 5),
        admin
          .from('strategic_plays')
          .select('goal_description, confidence, status, steps')
          .eq('org_id', ctx.orgId)
          .eq('account_id', body.accountId)
          .in('status', ['active', 'in_progress'])
          .order('updated_at', { ascending: false })
          .limit(5),
      ]);

      intelItems = intelResult.status === 'fulfilled' && intelResult.value?.length ? intelResult.value : undefined;
      cilContext = cilResult.status === 'fulfilled' ? cilResult.value : undefined;
      knowledgeContext = kbResult.status === 'fulfilled' && kbResult.value ? kbResult.value : undefined;

      if (cilContext) console.log(`[strategy] CIL 上下文已注入，account=${body.accountId}`);
      if (knowledgeContext) console.log(`[strategy] 知识库上下文已注入，account=${body.accountId}`);

      // 构建谋局上下文
      if (playsResult.status === 'fulfilled' && playsResult.value.data?.length) {
        const plays = playsResult.value.data as Array<{ goal_description: string; confidence: number; status: string; steps: Array<{ title: string; status: string }> }>;
        const lines = plays.map((p) => {
          const nextStep = p.steps?.find((s: { status: string }) => s.status === 'pending' || s.status === 'in_progress');
          return `- [${p.status}/${p.confidence}%] ${p.goal_description}${nextStep ? ` → 下一步: ${nextStep.title}` : ''}`;
        });
        playsContext = `\n\n=== 当前活跃谋局（${plays.length}个）===\n${lines.join('\n')}\n请确保回复策略与当前谋局方向一致，避免矛盾动作。`;
        console.log(`[strategy] 谋局上下文已注入，${plays.length} 个活跃谋局`);
      }
    }

    // 合并 CIL + 知识库 + 谋局上下文
    const combinedCilContext = [cilContext, knowledgeContext, playsContext].filter(Boolean).join('\n') || undefined;

    const result = await generateStrategy({
      decodedMessage: body.decodedEmail,
      numStrategies: 3,
      tasks: body.tasks,
      contactDiscType: body.contactDiscType,
      intelItems,
      cilContext: combinedCilContext,
      outputLocale,
    });

    // Fire-and-forget: 回写策略建议到知识库
    if (ctx.orgId && body.accountId && result?.strategies?.length) {
      const recommended = result.strategies[result.recommended ?? 0];
      const strategyContent = [
        `推荐策略: ${recommended?.name ?? ''}`,
        `目标: ${recommended?.goal ?? ''}`,
        `方法: ${recommended?.approach ?? ''}`,
        `语气: ${recommended?.tone ?? ''}`,
        `时机: ${recommended?.urgency ?? ''}`,
        `总体分析: ${result.reasoning ?? ''}`,
      ].join('\n');

      depositKnowledge({
        orgId: ctx.orgId,
        accountId: body.accountId,
        title: `回复策略：${recommended?.name ?? '策略建议'}`,
        content: strategyContent,
        category: 'ai_insight',
        source: 'ai_strategy',
        sourceType: 'ai_strategies',
        sourceId: `${body.accountId}_strategy_${new Date().toISOString().split('T')[0]}`,
        applicableScenarios: ['邮件回复策略', '沟通方式建议', '谈判策略'],
      });
    }

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
