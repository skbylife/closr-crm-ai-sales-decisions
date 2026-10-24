import { ApiError, requireAuth, guardResponse, requireAdmin, requireAccountAccess, requireOpportunityAccess } from '@/lib/api-guard';
import { detectIntegrationIntent } from '@/lib/integration/intent-router';
import { handleIntegrationMessage } from '@/lib/integration/agent';
import { runSalesAgent, type ChatContext, type ChatMessage, type DealHealthSummary } from '@/lib/agent/sales-agent';
import {
  generateStagnationHints,
  generateIntelActionHints,
  type DealHealthCILContext,
} from '@/lib/deal-health';
import {
  formatJudgmentContextAnswer,
  isJudgmentContextAsk,
  loadAgentJudgmentContext,
} from '@/lib/agent/judgment-context';

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

  const { message, context, history, integrationSession } = await request.json();
  const chatHistory: { role: string; content: string }[] = Array.isArray(history) ? history : [];

  if (!message || typeof message !== 'string' || !message.trim()) {
    // 前端初始化时可能发空消息，直接返回空回复而不是 400
    return Response.json({ reply: '' }, { status: 200 });
  }

  // ── Integration Agent 意图检测（优先，避免 Sales Agent 误拦截对接流程）──
  const integrationCheck = detectIntegrationIntent(message);
  if (integrationCheck.isIntegration || integrationSession) {
    try {
      const result = await handleIntegrationMessage(
        message,
        integrationSession ?? null,
        ctx.userId,
      );
      // 用户退出对接流程 → 清除 session，后续消息走通用 AI
      if (result.exitIntegration) {
        return Response.json({
          reply: result.reply,
          integrationSession: null,
        });
      }
      return Response.json({
        reply: result.reply,
        integrationSession: result.session,
        actions: result.actions,
      });
    } catch (err) {
      console.error('[chat] Integration agent error:', err);
      // Clear session so user isn't stuck in a broken integration loop
      return Response.json({
        reply: '对接助手暂时不可用，请稍后再试。如需继续对接，请输入"对接助手"重新开始。',
        integrationSession: null,
      });
    }
  }

  // ── Sales Agent（默认路径：所有消息都走 Sales Agent）──
  // Sales Agent 既能回答问题，也能识别写入意图并调用工具
  console.log(`[chat/route] Sales Agent (default) | userId=${ctx.userId} | page=${context?.currentPage ?? 'unknown'}`);
  try {
    const rawContacts = (context?.currentAccount as { contacts?: { id: string; name: string; role?: string; title?: string }[] } | undefined)?.contacts;
    const currentOpportunity = context?.currentOpportunity as { updatedAt?: string; stage?: string; name?: string } | undefined;
    const currentTasks = Array.isArray(context?.tasks) ? (context?.tasks as { id?: string; status?: string; title?: string; priority?: string; dueDate?: string; due_date?: string; accountId?: string | null; account_id?: string | null; opportunityId?: string | null; opportunity_id?: string | null; contactId?: string | null; contact_id?: string | null }[]) : [];
    const currentIntelItems = Array.isArray(context?.intelItems)
      ? (context?.intelItems as { content?: string; priority?: string; signalType?: string; impactDirection?: string; suggestedAction?: { label?: string } }[])
      : [];

    // ── Trust boundary: never use account/opportunity ids from the browser until server-side access checks pass ──
    const rawAccountId = typeof context?.accountId === 'string' ? context.accountId : undefined;
    const rawOpportunityId = typeof context?.opportunityId === 'string' ? context.opportunityId : undefined;
    let accountId: string | undefined;
    let opportunityId: string | undefined;

    if (rawOpportunityId) {
      const opportunity = await requireOpportunityAccess(ctx, rawOpportunityId);
      opportunityId = opportunity.id;
      accountId = opportunity.account_id ?? rawAccountId;
      if (accountId) await requireAccountAccess(ctx, accountId);
    } else if (rawAccountId) {
      await requireAccountAccess(ctx, rawAccountId);
      accountId = rawAccountId;
    }

    let judgmentContext: ChatContext['judgmentContext'];
    if (accountId) {
      try {
        judgmentContext = await loadAgentJudgmentContext(requireAdmin(), { accountId, orgId: ctx.orgId }) ?? undefined;
      } catch (err) {
        console.warn('[chat] Judgment context unavailable:', err);
      }
    }

    // ── Best-effort CIL context loading ──
    let cilContext: DealHealthCILContext & {
      openQuestionTexts?: string[];
      contradictionTexts?: string[];
    } | undefined;
    const cilClaimHints: string[] = [];

    if (accountId) {
      try {
        const adminClient = requireAdmin();

        // Fetch claims (active + stale) + open questions for enrichment
        const [claimsRes, questionsRes] = await Promise.all([
          adminClient
            .from('account_claims')
            .select('statement, claim_type, confidence, status, last_revalidated_at')
            .eq('org_id', ctx.orgId)
            .eq('account_id', accountId)
            .in('status', ['active', 'stale'])
            .order('confidence', { ascending: false })
            .limit(20),
          adminClient
            .from('account_open_questions')
            .select('question, priority, status, blocking_outputs')
            .eq('org_id', ctx.orgId)
            .eq('account_id', accountId)
            .eq('status', 'open')
            .order('priority', { ascending: true })
            .limit(10),
        ]);

        const claims = claimsRes.data ?? [];
        const questions = questionsRes.data ?? [];

        const activeClaims = claims.filter((c) => c.status === 'active');
        const staleClaims = claims.filter((c) => c.status === 'stale');
        const blockingQs = questions.filter(
          (q) => q.priority === 'high' && Array.isArray(q.blocking_outputs) && (q.blocking_outputs as string[]).length > 0,
        );

        // Detect contradictions (same claim_type, opposing polarity)
        const negMarkers = ['不', '没', '未', '无', '缺乏', '暂停', '推迟', '拒绝', '反对', '风险', '阻塞'];
        const contradictionTexts: string[] = [];
        const byType = new Map<string, typeof claims>();
        for (const c of activeClaims) {
          const list = byType.get(c.claim_type as string) ?? [];
          list.push(c);
          byType.set(c.claim_type as string, list);
        }
        for (const [, groupClaims] of byType) {
          for (let i = 0; i < groupClaims.length; i++) {
            for (let j = i + 1; j < groupClaims.length; j++) {
              const aHasNeg = negMarkers.some((m) => (groupClaims[i].statement as string).includes(m));
              const bHasNeg = negMarkers.some((m) => (groupClaims[j].statement as string).includes(m));
              if (aHasNeg !== bHasNeg) {
                contradictionTexts.push(
                  `「${(groupClaims[i].statement as string).slice(0, 40)}」vs「${(groupClaims[j].statement as string).slice(0, 40)}」`,
                );
              }
            }
          }
        }

        cilContext = {
          activeClaims: activeClaims.length,
          staleClaims: staleClaims.length,
          contradictions: contradictionTexts.length,
          blockingQuestions: blockingQs.length,
          openQuestionTexts: questions.slice(0, 3).map((q) => q.question as string),
          contradictionTexts: contradictionTexts.slice(0, 2),
        };

        // Top claims as intel hints
        for (const claim of activeClaims.slice(0, 3)) {
          cilClaimHints.push(`情报判断：${claim.statement as string}`);
        }
      } catch {
        // CIL tables may not exist yet — graceful degradation
      }
    }

    // ── Generate structured hints via consolidated helpers ──
    const stagnationHints = generateStagnationHints({
      opportunity: currentOpportunity,
      tasks: currentTasks,
      contacts: rawContacts,
      intelItems: currentIntelItems,
      cil: cilContext,
    });

    const intelActionHints = generateIntelActionHints(currentIntelItems, cilClaimHints);

    // ── Build deal health summary for Sales Agent context ──
    let dealHealth: DealHealthSummary | undefined;
    if (currentOpportunity?.updatedAt) {
      const daysSince = Math.floor((Date.now() - new Date(currentOpportunity.updatedAt).getTime()) / (24 * 60 * 60 * 1000));
      // Lightweight health assessment (full computeDealHealth requires Opportunity type,
      // this is a contextual approximation for the chat route)
      const hasChampion = rawContacts?.some((c) => c.role === 'champion') ?? false;
      const hasTasks = currentTasks.some((t) => t.status !== 'done');
      let level: DealHealthSummary['level'] = 'healthy';
      const reasons: string[] = [];
      if (daysSince > 14) { level = 'critical'; reasons.push(`${daysSince}天无活动`); }
      else if (daysSince > 7) { level = 'at_risk'; reasons.push(`${daysSince}天无活动`); }
      if (!hasChampion && level !== 'critical') {
        level = level === 'healthy' ? 'at_risk' : 'critical';
        reasons.push('无Champion联系人');
      }
      if (!hasTasks && level !== 'critical') {
        level = level === 'healthy' ? 'at_risk' : 'critical';
        reasons.push('无待办任务');
      }

      // CIL penalty
      if (cilContext?.staleClaims && cilContext.staleClaims >= 3 && level === 'healthy') {
        level = 'at_risk';
        reasons.push(`${cilContext.staleClaims}条情报已过期`);
      }

      // Stagnation score approximation
      let stagnationScore = Math.min(50, daysSince * 3);
      if (level === 'at_risk') stagnationScore += 15;
      if (level === 'critical') stagnationScore += 30;
      stagnationScore += Math.min(15, (reasons.length - 1) * 3);
      stagnationScore = Math.max(0, Math.min(100, Math.round(stagnationScore)));

      dealHealth = { level, stagnationScore, reasons, daysSinceActivity: daysSince };
    }

    const agentContext: ChatContext = {
      opportunityId,
      contactId: context?.contactId as string | undefined,
      accountId,
      userId: ctx.userId,
      orgId: ctx.orgId,
      currentPage: context?.currentPage as string | undefined,
      currentAccountContacts: Array.isArray(rawContacts) ? rawContacts : undefined,
      currentOpportunityName: currentOpportunity?.name,
      currentAccountName: (context?.currentAccount as { name?: string } | undefined)?.name,
      stagnationHints: stagnationHints.length > 0 ? stagnationHints : undefined,
      intelActionHints: intelActionHints.length > 0 ? intelActionHints : undefined,
      dealHealth,
      tasks: currentTasks.slice(0, 8).map((task) => ({
        id: task.id ?? '',
        title: task.title ?? '未命名任务',
        status: task.status ?? 'todo',
        priority: task.priority,
        dueDate: task.dueDate ?? task.due_date,
        accountId: task.accountId ?? task.account_id ?? null,
        opportunityId: task.opportunityId ?? task.opportunity_id ?? null,
        contactId: task.contactId ?? task.contact_id ?? null,
      })),
      intelItems: Array.isArray(context?.intelItems) ? context.intelItems.slice(0, 6) : undefined,
      judgmentContext,
    };
    const agentHistory: ChatMessage[] = chatHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    const result = await runSalesAgent(message, agentContext, agentHistory);
    if (judgmentContext && isJudgmentContextAsk(message) && !result.requiresConfirmation) {
      return Response.json({
        reply: formatJudgmentContextAnswer(judgmentContext),
        mode: 'chat',
        progression: undefined,
        pendingActions: undefined,
        requiresConfirmation: false,
      });
    }

    return Response.json({
      reply: result.reply,
      mode: result.mode,
      progression: result.progression,
      pendingActions: result.pendingActions,
      requiresConfirmation: result.requiresConfirmation,
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[chat] Sales agent error:', err);
    return Response.json({ reply: '助手暂时不可用，请稍后再试。' });
  }

  } catch (err) {
    return guardResponse(err);
  }
}
