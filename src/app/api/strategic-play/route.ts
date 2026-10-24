import { requireAuth, requireOwnership, requireAccountAccess, requireContactAccess, requireOpportunityAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';

import { buildRelationshipGraph, generateStrategicPlay, type GeneratePlayInput, type GeneratePlayResult } from '@/lib/strategic-play-engine';
import { logAIInvocation } from '@/lib/ai-invocation-log';
import { type CompatiblePlayStepStatus } from '@/lib/strategic-play-execution';
import {
  applyStrategicPlayStepExecutionWriteback,
  buildPlayStepExecutionInput,
  buildStrategicPlayExecutionResponse,
  StrategicPlayExecutionValidationError,
} from '@/lib/strategic-play-writeback';
import { depositKnowledge } from '@/lib/knowledge-engine';
import { getAccountMemoryPayload } from '@/lib/evidence-memory/server';
import { buildMemoryProvenance, type EvidenceProvenance } from '@/lib/evidence-provenance';
import type { PlayStatus, StrategicGoalType } from '@/lib/babel-engine/types';
import {
  persistStrategicPlayJudgmentMemory,
  persistStrategicPlayJudgmentMemoryById,
} from '@/lib/strategic-play-judgment-memory';
import {
  updateStrategicPlayAssumptions,
  updateStrategicPlayLearning,
  updateStrategicPlayMomentum,
  updateStrategicPlayReview,
  updateStrategicPlayStatus,
  updateStrategicPlayStepPreparationChecklist,
  updateStrategicPlayV2RouteState,
  type StrategicPlayMutationResult,
} from '@/lib/strategic-play-mutations';
import {
  generatedStrategicPlayEvidenceTraceResponse,
  mapStrategicPlayRowToApiPlay,
  normalizeEvidenceProvenance,
  normalizeSteps,
  strategicPlayEvidenceTraceDbPayload,
  strategicPlayV1DbPayload,
} from '@/lib/strategic-play-mapping';
import { normalizeOutputLocale } from '@/lib/output-locale';

// 禁止 Next.js 缓存此路由（动态数据，必须每次从 DB 读取）
export const dynamic = 'force-dynamic';

// 谋局生成涉及多轮 DB 查询 + LLM 调用，需要更长执行时间（防止 502 超时）
export const maxDuration = 300;

function strategicPlayMutationResponse(result: StrategicPlayMutationResult) {
  return Response.json(result.body, 'init' in result ? result.init : undefined);
}

const DEMO_PLAY_PLACEHOLDER_PATTERNS = [
  /Account analysis for this sales scenario/i,
  /Sales-context summary/i,
  /Customer-facing detail/i,
  /Named account record/i,
  /Account evidence detail/i,
  /Evidence-backed account note/i,
  /Sanitized customer communication excerpt/i,
  /Stakeholder contact/i,
  /Stakeholder owner/i,
  /Business context detail/i,
  /Evidence review step/i,
  /Strategic play detail/i,
  /customerStatus:/i,
  /\bNEXT STEPACTION\b/i,
  /\bCustomer value\b/i,
  /\bCustomer signal\b/i,
  /\bCustomer stakeholder\b/i,
  /\bStrategic play value\b/i,
] as const;

function stringifyPlayField(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => stringifyPlayField(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap((item) => stringifyPlayField(item));
  return [];
}

function strategicPlayTextBlob(play: Record<string, unknown>): string {
  return [
    play.goalDescription,
    play.goal_description,
    play.situationJudgment,
    play.situation_judgment,
    play.strategicObjective,
    play.strategic_objective,
    play.steps,
    play.assumptions,
    play.evidenceBasis,
    play.evidence_basis,
    play.riskCounterEvidence,
    play.risk_counter_evidence,
    play.successCriteria,
    play.success_criteria,
  ].flatMap((value) => stringifyPlayField(value)).join('\n');
}

function isPlaceholderDemoPlay(play: Record<string, unknown>): boolean {
  const blob = strategicPlayTextBlob(play);
  const placeholderHits = DEMO_PLAY_PLACEHOLDER_PATTERNS.reduce(
    (total, pattern) => total + (blob.match(pattern)?.length ?? 0),
    0,
  );
  return placeholderHits >= 1;
}

function isCrossAccountDemoPlay(play: Record<string, unknown>): boolean {
  const opportunityId = play.opportunityId ?? play.opportunity_id;
  if (opportunityId !== 'opp_cmcc_5g_003') return false;
  return /Meridian Bank|Rachel Kim|Marcus Reed|Priya Nair|bank/i.test(strategicPlayTextBlob(play));
}

function filterLowQualityDemoPlays<T extends Record<string, unknown>>(plays: T[]): T[] {
  const cleaned = plays.filter((play) => !isPlaceholderDemoPlay(play) && !isCrossAccountDemoPlay(play));
  return cleaned.length > 0 ? cleaned : plays;
}

function getStrategicPlayShadowModel(): string | null {
  const model = process.env.AI_STRATEGIC_SHADOW_MODEL || process.env.AI_DEEPSEEK_PRO_MODEL;
  return model && model.trim() ? model.trim() : null;
}

function summarizeStrategicPlayCompleteness(result: GeneratePlayResult) {
  const stepCount = result.steps?.length ?? 0;
  const stepsWithExpectedOutcome = (result.steps ?? []).filter((step) => Boolean(step.expectedOutcome)).length;
  const requiredFields = [
    result.situationJudgment,
    result.strategicObjective,
    result.stakeholderPath?.length,
    result.evidenceBasis?.length,
    result.riskCounterEvidence?.length,
    result.successCriteria,
    stepCount,
  ];
  const filledRequiredFields = requiredFields.filter(Boolean).length;
  return {
    filledRequiredFields,
    stepCount,
    stepsWithExpectedOutcome,
    evidenceBasisCount: result.evidenceBasis?.length ?? 0,
    riskCounterEvidenceCount: result.riskCounterEvidence?.length ?? 0,
    fieldEvidenceAttributionCount: result.fieldEvidenceAttributions?.length ?? 0,
  };
}

function runStrategicPlayShadowEvaluation(input: GeneratePlayInput) {
  const shadowModel = getStrategicPlayShadowModel();
  if (!shadowModel) return;

  const startedAt = Date.now();
  const shadowUseCase = (input.invocation?.useCase ?? 'strategic-play.generate') + '.shadow';
  void generateStrategicPlay({
    ...input,
    modelOverride: shadowModel,
    tierOverride: 'pro',
    invocation: {
      ...input.invocation,
      useCase: shadowUseCase,
      metadata: {
        ...input.invocation?.metadata,
        shadow: true,
        shadowModel,
        primaryModel: process.env.AI_PRO_MODEL ?? null,
      },
    },
  })
    .then((shadowResult) => {
      const summary = summarizeStrategicPlayCompleteness(shadowResult);
      logAIInvocation({
        ...input.invocation,
        useCase: shadowUseCase + '.summary',
        tier: 'pro',
        model: shadowModel,
        provider: 'openai-compatible',
        status: 'success',
        durationMs: Date.now() - startedAt,
        metadata: {
          shadow: true,
          shadowModel,
          primaryModel: process.env.AI_PRO_MODEL ?? null,
          ...summary,
        },
      });
    })
    .catch((err) => {
      logAIInvocation({
        ...input.invocation,
        useCase: shadowUseCase + '.summary',
        tier: 'pro',
        model: shadowModel,
        provider: 'openai-compatible',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: {
          shadow: true,
          shadowModel,
          primaryModel: process.env.AI_PRO_MODEL ?? null,
        },
      });
    });
}

// GET — 获取 account 的谋局计划列表
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    const admin = requireAdmin();

    // Play 可见性与 account access 对齐：能看到账户就能看到其 play
    let query = admin
      .from('strategic_plays')
      .select('*')
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false });

    if (accountId) {
      // 指定了账户：验证访问权后返回该账户所有 play
      await requireAccountAccess(ctx, accountId);
      query = query.eq('account_id', accountId);
    } else if (ctx.orgRole === 'owner' || ctx.orgRole === 'admin') {
      // admin/owner: 看全 org，不加额外过滤
    } else {
      // 非 admin/owner: 按 jobLevel 查可访问的 account_id 列表，再过滤 play
      if (ctx.jobLevel >= 1) {
        // L1+（主管级）看团队成员拥有的账户 + 公海账户
        const { data: teamAccounts } = await admin
          .from('accounts')
          .select('id')
          .eq('org_id', ctx.orgId)
          .or(`owner_id.in.(${ctx.teamMemberIds.join(',')}),and(owner_id.is.null,user_id.in.(${ctx.teamMemberIds.join(',')})),and(owner_id.is.null,user_id.is.null)`);
        const teamAccountIds = (teamAccounts ?? []).map((a: { id: string }) => a.id);
        if (teamAccountIds.length > 0) {
          query = query.in('account_id', teamAccountIds);
        } else {
          // 无可访问账户，返回空
          return Response.json({ plays: [] });
        }
      } else {
        // member 只看自己拥有的账户 + 公海账户
        const { data: myAccounts } = await admin
          .from('accounts')
          .select('id')
          .eq('org_id', ctx.orgId)
          .or(`owner_id.eq.${ctx.userId},and(owner_id.is.null,user_id.eq.${ctx.userId}),and(owner_id.is.null,user_id.is.null)`);
        const myAccountIds = (myAccounts ?? []).map((a: { id: string }) => a.id);
        if (myAccountIds.length > 0) {
          query = query.in('account_id', myAccountIds);
        } else {
          return Response.json({ plays: [] });
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('[strategic-play] Query failed:', error);
      return Response.json({ plays: [], _debug: 'query_error', _error: error.message });
    }

    // Diagnostic: log empty results to help debug
    if (!data || data.length === 0) {
      console.warn(`[strategic-play] GET returned 0 plays — orgId=${ctx.orgId}, accountId=${accountId ?? 'ALL'}`);
    }

    const plays = filterLowQualityDemoPlays((data ?? []).map((row) => mapStrategicPlayRowToApiPlay(row as Record<string, unknown>)));

    return Response.json({ plays });
  } catch (err) {
    console.error('[strategic-play] GET error:', err);
    return guardResponse(err);
  }
}

// POST — 生成新的谋局计划
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      accountId?: string;
      accountName?: string;
      goalType?: StrategicGoalType;
      goalDescription?: string;
      targetContactId?: string;
      opportunityId?: string;
      additionalContext?: string;
      successCriteria?: string;
      deadline?: string;
      assumptions?: { id: string; text: string; status: 'pending' | 'verified' | 'invalidated'; createdAt: string }[];
      outputLocale?: 'zh' | 'en';
      replanFromStep?: {
        playId: string;
        stepIndex: number;
        actualResult?: string;
        previousSteps: { index: number; title: string; status: string; actualResult?: string; learning?: string; newSignals?: string[] }[];
        assumptions?: { id: string; text: string; status: string; evidence?: string; impact?: string }[];
        learnings?: { stepIndex: number; learning: string; newSignal?: string; timestamp: string }[];
      };
    };

    // ─── Replan from step ───
    if (body.replanFromStep) {
      const { playId, stepIndex, previousSteps, assumptions, learnings } = body.replanFromStep;
      const admin = requireAdmin();

      const { data: play } = await admin
        .from('strategic_plays')
        .select('*')
        .eq('id', playId)
        .eq('org_id', ctx.orgId)
        .single();

      if (!play) return Response.json({ error: 'Play not found' }, { status: 404 });

      // 校验：只有 play 创建者 / 团队 manager / admin+ 可以 replan
      requireOwnership(ctx, play.user_id);

      // Build context for AI
      const completedContext = previousSteps.map(s => {
        let line = `Step ${s.index}: ${s.title} → ${s.status}`;
        if (s.actualResult) line += ` (实际结果: ${s.actualResult})`;
        if (s.learning) line += ` (学到: ${s.learning})`;
        if (s.newSignals && s.newSignals.length > 0) line += ` (新信号: ${s.newSignals.join(', ')})`;
        return line;
      }).join('\n');

      // Build assumptions context
      let assumptionsContext = '';
      if (assumptions && assumptions.length > 0) {
        const verified = assumptions.filter(a => a.status === 'verified');
        const invalidated = assumptions.filter(a => a.status === 'invalidated');
        const pending = assumptions.filter(a => a.status === 'pending');
        assumptionsContext = '\n\n假设状态:';
        if (verified.length > 0) assumptionsContext += `\n已验证: ${verified.map(a => a.text + (a.evidence ? ` (${a.evidence})` : '')).join('; ')}`;
        if (invalidated.length > 0) assumptionsContext += `\n已否定: ${invalidated.map(a => a.text + (a.impact ? ` → 影响: ${a.impact}` : '')).join('; ')}`;
        if (pending.length > 0) assumptionsContext += `\n待验证: ${pending.map(a => a.text).join('; ')}`;
      }

      // Build learnings context
      let learningsContext = '';
      if (learnings && learnings.length > 0) {
        learningsContext = '\n\n累积学习:';
        for (const l of learnings) {
          learningsContext += `\nStep ${l.stepIndex}: ${l.learning}`;
          if (l.newSignal) learningsContext += ` (新信号: ${l.newSignal})`;
        }
      }

      const graph = await buildRelationshipGraph(play.account_id, ctx.orgId);

      // 获取 account 名称（修复 bug: 之前传的是 account_id）
      const { data: accountRow } = await admin
        .from('accounts')
        .select('name')
        .eq('id', play.account_id)
        .eq('org_id', ctx.orgId)
        .single();

      // 获取联系人邮箱用于文化检测
      const { data: contactsForEmails } = await admin
        .from('contacts')
        .select('id, email')
        .eq('account_id', play.account_id)
        .eq('org_id', ctx.orgId);
      const contactEmails: Record<string, string> = {};
      for (const c of contactsForEmails ?? []) {
        if (c.email) contactEmails[c.id] = c.email;
      }

      const invalidatedAssumptions = (assumptions ?? []).filter(a => a.status === 'invalidated');

      // 获取竞对信息
      const { data: accountForCompetitors } = await admin
        .from('accounts')
        .select('competitors')
        .eq('id', play.account_id)
        .eq('org_id', ctx.orgId)
        .single();

      const generationInput: GeneratePlayInput = {
        accountId: play.account_id,
        accountName: accountRow?.name ?? play.account_id,
        orgId: ctx.orgId,
        goalType: play.goal_type,
        goalDescription: play.goal_description,
        successCriteria: play.success_criteria ?? undefined,
        graph,
        userId: ctx.userId,
        contactEmails,
        competitors: (accountForCompetitors?.competitors as { name: string; strength: string; knownContacts?: string; notes?: string }[]) ?? [],
        outputLocale: normalizeOutputLocale(body.outputLocale),
        additionalContext: `这是一个正在执行中的谋局计划的重新规划。以下是已执行步骤及实际结果：\n${completedContext}${assumptionsContext}${learningsContext}\n\n请根据实际执行情况的偏差，重新规划从第 ${stepIndex + 2} 步开始的后续路径。保持目标不变，但策略要根据实际反馈调整。${invalidatedAssumptions.length > 0 ? `\n\n特别注意：以下假设已被否定，需要调整策略：${invalidatedAssumptions.map(a => a.text).join('、')}` : ''}`,
        invocation: {
          orgId: ctx.orgId,
          userId: ctx.userId,
          accountId: play.account_id,
          opportunityId: play.opportunity_id ?? null,
          route: '/api/strategic-play',
          useCase: 'strategic-play.replan',
          metadata: { playId, stepIndex, hasInvalidatedAssumptions: invalidatedAssumptions.length > 0 },
        },
      };
      const result = await generateStrategicPlay(generationInput);
      runStrategicPlayShadowEvaluation(generationInput);

      // Merge: keep completed steps, replace remaining with new AI steps
      const existingSteps = normalizeSteps(play.steps).slice(0, stepIndex + 1);
      const newSteps = (result.steps ?? []).map((s, i) => ({
        ...s,
        index: stepIndex + 2 + i,
        status: 'planned' as const,
        aiAdjusted: true,
      }));
      const mergedSteps = [...existingSteps, ...newSteps];
      const updatedAt = new Date().toISOString();
      const evidenceTrace = generatedStrategicPlayEvidenceTraceResponse({
        ...result,
        steps: mergedSteps,
        actionPlan: mergedSteps,
        successCriteria: result.successCriteria ?? play.success_criteria ?? null,
        provenance: normalizeEvidenceProvenance(play.evidence_provenance),
      });

      const { data: replannedPlay, error: replanUpdateError } = await admin
        .from('strategic_plays')
        .update({
          steps: mergedSteps,
          alternative_paths: result.alternativePaths,
          confidence: result.confidence,
          ...strategicPlayV1DbPayload({ ...result, successCriteria: result.successCriteria ?? play.success_criteria ?? undefined }),
          ...strategicPlayEvidenceTraceDbPayload({ ...result, provenance: evidenceTrace.provenance }),
          updated_at: updatedAt,
        })
        .eq('id', playId)
        .eq('org_id', ctx.orgId)
        .select('id')
        .maybeSingle();
      if (replanUpdateError) {
        console.error('[strategic-play] Replan update failed:', replanUpdateError);
        return Response.json({ error: 'Failed to save replanned play' }, { status: 500 });
      }
      if (!replannedPlay) {
        console.error('[strategic-play] Replan update matched no rows:', { playId, orgId: ctx.orgId });
        return Response.json({ error: 'Failed to save replanned play' }, { status: 500 });
      }

      const judgmentMemory = await persistStrategicPlayJudgmentMemory({
        admin,
        orgId: ctx.orgId,
        play: {
          ...play,
          steps: mergedSteps,
          confidence: result.confidence,
          situation_judgment: result.situationJudgment,
          strategic_objective: result.strategicObjective,
          stakeholder_path: result.stakeholderPath,
          evidence_basis: result.evidenceBasis,
          risk_counter_evidence: result.riskCounterEvidence,
          success_criteria: result.successCriteria ?? play.success_criteria ?? null,
          knowledge_traces: result.knowledgeTraces ?? [],
          knowledge_gaps: result.knowledgeGaps ?? [],
          evidence_provenance: evidenceTrace.provenance,
          updated_at: updatedAt,
        },
      });

      return Response.json({
        ok: true,
        steps: mergedSteps,
        actionPlan: mergedSteps,
        situationJudgment: result.situationJudgment,
        strategicObjective: result.strategicObjective,
        stakeholderPath: result.stakeholderPath,
        evidenceBasis: result.evidenceBasis,
        riskCounterEvidence: result.riskCounterEvidence,
        successCriteria: result.successCriteria ?? play.success_criteria ?? null,
        confidence: result.confidence,
        playId,
        knowledgeTraces: evidenceTrace.knowledgeTraces,
        knowledgeGaps: evidenceTrace.knowledgeGaps,
        provenance: evidenceTrace.provenance,
        fieldEvidenceAttributions: evidenceTrace.fieldEvidenceAttributions,
        evidenceTrace,
        ...(judgmentMemory ? { judgmentMemory } : {}),
      });
    }

    if (!body.accountId || !body.goalType || !body.goalDescription) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 校验：用户必须有权访问此 account / 关联资源
    await requireAccountAccess(ctx, body.accountId);
    if (body.targetContactId) {
      const contact = await requireContactAccess(ctx, body.targetContactId);
      if (contact.account_id !== body.accountId) {
        return Response.json({ error: 'targetContactId 与 accountId 不属于同一客户' }, { status: 400 });
      }
    }
    if (body.opportunityId) {
      const opportunity = await requireOpportunityAccess(ctx, body.opportunityId);
      if (opportunity.account_id !== body.accountId) {
        return Response.json({ error: 'opportunityId 与 accountId 不属于同一客户' }, { status: 400 });
      }
    }

    // 1. 构建关系图谱
    const graph = await buildRelationshipGraph(body.accountId, ctx.orgId);

    // 2. 获取客户名称/竞对信息 + 联系人邮箱用于文化检测
    const adminForEmails = requireAdmin();
    const { data: accountForContext } = await adminForEmails
      .from('accounts')
      .select('name, competitors')
      .eq('id', body.accountId)
      .eq('org_id', ctx.orgId)
      .single();
    const resolvedAccountName = body.accountName || accountForContext?.name || body.accountId;

    const contactEmails: Record<string, string> = {};
    {
      const { data: contactsForEmails } = await adminForEmails
        .from('contacts')
        .select('id, email')
        .eq('account_id', body.accountId)
        .eq('org_id', ctx.orgId);
      for (const c of contactsForEmails ?? []) {
        if (c.email) contactEmails[c.id] = c.email;
      }
    }

    let opportunityName: string | undefined;
    if (body.opportunityId) {
      const { data: opportunityForContext } = await adminForEmails
        .from('opportunities')
        .select('name')
        .eq('id', body.opportunityId)
        .eq('account_id', body.accountId)
        .eq('org_id', ctx.orgId)
        .single();
      opportunityName = (opportunityForContext?.name as string | null) ?? undefined;
    }

    // 2.5. 获取竞对信息
    const competitors = (accountForContext?.competitors as { name: string; strength: string; knownContacts?: string; notes?: string }[]) ?? [];

    // 3. AI 生成路径（深度集成 Babel Decode 画像 + 上下文记忆 + 文化引擎 + 知识引擎）
    const generationInput: GeneratePlayInput = {
      accountId: body.accountId!,
      accountName: resolvedAccountName,
      orgId: ctx.orgId,
      goalType: body.goalType,
      goalDescription: body.goalDescription,
      successCriteria: body.successCriteria,
      targetContactId: body.targetContactId,
      opportunityId: body.opportunityId,
      opportunityName,
      graph,
      userId: ctx.userId,
      contactEmails,
      competitors,
      outputLocale: normalizeOutputLocale(body.outputLocale),
      additionalContext: body.additionalContext,
      invocation: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        accountId: body.accountId!,
        opportunityId: body.opportunityId ?? null,
        route: '/api/strategic-play',
        useCase: 'strategic-play.generate',
        metadata: {
          goalType: body.goalType,
          hasTargetContact: Boolean(body.targetContactId),
          hasAdditionalContext: Boolean(body.additionalContext),
        },
      },
    };
    const result = await generateStrategicPlay(generationInput);
    runStrategicPlayShadowEvaluation(generationInput);

    let provenance: EvidenceProvenance | undefined;
    try {
      const memoryPayload = await getAccountMemoryPayload(body.accountId!, resolvedAccountName, ctx.orgId, ctx);
      provenance = buildMemoryProvenance({
        records: memoryPayload.records,
        summary: memoryPayload.summary,
        conflicts: memoryPayload.conflicts,
        confidence: result.confidence,
        rationale: '谋局生成基于关系图谱、用户目标与账户证据记忆；provenance 暴露可追踪证据、冲突和 tension，便于后续修正 AI 路径。',
        maxTraces: 8,
      });
    } catch (provenanceErr) {
      console.warn('[strategic-play] provenance build failed, continuing without trace:', provenanceErr);
    }

    const generatedEvidenceTrace = generatedStrategicPlayEvidenceTraceResponse({ ...result, provenance });
    const provenanceForSave = generatedEvidenceTrace.provenance;

    // 3. 存入 DB（带短时间去重保护，避免双击/重试生成重复谋局）
    const admin = requireAdmin();

    // Check for duplicate within 10 minutes (same user, account, goal)
    const duplicateWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await admin
      .from('strategic_plays')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('user_id', ctx.userId)
      .eq('account_id', body.accountId)
      .eq('goal_type', body.goalType)
      .eq('goal_description', body.goalDescription)
      .gte('created_at', duplicateWindowStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentDuplicate?.id) {
      // Update existing play with fresh AI result instead of creating duplicate
      const updatedAt = new Date().toISOString();
      const { data: updatedDuplicate, error: duplicateUpdateError } = await admin
        .from('strategic_plays')
        .update({
          steps: result.steps,
          alternative_paths: result.alternativePaths,
          confidence: result.confidence,
          ...strategicPlayV1DbPayload(result),
          ...strategicPlayEvidenceTraceDbPayload({ ...result, provenance: provenanceForSave }),
          assumptions: body.assumptions ?? [],
          updated_at: updatedAt,
        })
        .eq('id', recentDuplicate.id)
        .eq('org_id', ctx.orgId)
        .select('id')
        .maybeSingle();
      if (duplicateUpdateError) {
        console.error('[strategic-play] Duplicate update failed:', duplicateUpdateError);
        return Response.json({ error: 'Failed to save play' }, { status: 500 });
      }
      if (!updatedDuplicate) {
        console.error('[strategic-play] Duplicate update matched no rows:', { playId: recentDuplicate.id, orgId: ctx.orgId });
        return Response.json({ error: 'Failed to save play' }, { status: 500 });
      }

      const judgmentMemory = await persistStrategicPlayJudgmentMemory({
        admin,
        orgId: ctx.orgId,
        play: {
          id: recentDuplicate.id,
          account_id: body.accountId,
          opportunity_id: body.opportunityId ?? null,
          target_contact_id: body.targetContactId ?? null,
          goal_description: body.goalDescription,
          steps: result.steps,
          confidence: result.confidence,
          situation_judgment: result.situationJudgment,
          strategic_objective: result.strategicObjective,
          stakeholder_path: result.stakeholderPath,
          evidence_basis: result.evidenceBasis,
          risk_counter_evidence: result.riskCounterEvidence,
          success_criteria: result.successCriteria,
          knowledge_traces: result.knowledgeTraces ?? [],
          knowledge_gaps: result.knowledgeGaps ?? [],
          evidence_provenance: provenanceForSave,
          assumptions: body.assumptions ?? [],
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      });

      const evidenceTrace = generatedEvidenceTrace;

      return Response.json({
        id: recentDuplicate.id,
        steps: result.steps,
        actionPlan: result.actionPlan,
        alternativePaths: result.alternativePaths,
        situationJudgment: result.situationJudgment,
        strategicObjective: result.strategicObjective,
        stakeholderPath: result.stakeholderPath,
        evidenceBasis: result.evidenceBasis,
        riskCounterEvidence: result.riskCounterEvidence,
        successCriteria: result.successCriteria,
        confidence: result.confidence,
        ragCases: result.ragCases ?? [],
        knowledgeTraces: evidenceTrace.knowledgeTraces,
        knowledgeGaps: evidenceTrace.knowledgeGaps,
        provenance: evidenceTrace.provenance,
        fieldEvidenceAttributions: evidenceTrace.fieldEvidenceAttributions,
        evidenceTrace,
        ...(judgmentMemory ? { judgmentMemory } : {}),
      });
    }

    const { data: play, error } = await admin
      .from('strategic_plays')
      .insert({
        org_id: ctx.orgId,
        user_id: ctx.userId,
        account_id: body.accountId,
        opportunity_id: body.opportunityId ?? null,
        target_contact_id: body.targetContactId ?? null,
        goal_type: body.goalType,
        goal_description: body.goalDescription,
        steps: result.steps,
        alternative_paths: result.alternativePaths,
        confidence: result.confidence,
        status: 'active',
        momentum: 'active',
        ...strategicPlayV1DbPayload(result),
        ...strategicPlayEvidenceTraceDbPayload({ ...result, provenance: provenanceForSave }, { includeNullProvenance: true }),
        deadline: body.deadline ?? null,
        assumptions: body.assumptions ?? [],
        learnings: [],
      })
      .select('id, created_at, updated_at')
      .single();

    if (error) {
      console.error('[strategic-play] Insert failed:', error);
      return Response.json({ error: 'Failed to save play' }, { status: 500 });
    }

    const judgmentMemory = await persistStrategicPlayJudgmentMemory({
      admin,
      orgId: ctx.orgId,
      play: {
        id: play.id,
        account_id: body.accountId,
        opportunity_id: body.opportunityId ?? null,
        target_contact_id: body.targetContactId ?? null,
        goal_description: body.goalDescription,
        steps: result.steps,
        confidence: result.confidence,
        situation_judgment: result.situationJudgment,
        strategic_objective: result.strategicObjective,
        stakeholder_path: result.stakeholderPath,
        evidence_basis: result.evidenceBasis,
        risk_counter_evidence: result.riskCounterEvidence,
        success_criteria: result.successCriteria,
        knowledge_traces: result.knowledgeTraces ?? [],
        knowledge_gaps: result.knowledgeGaps ?? [],
        evidence_provenance: provenanceForSave,
        assumptions: body.assumptions ?? [],
        created_at: play.created_at ?? new Date().toISOString(),
        updated_at: play.updated_at ?? play.created_at ?? new Date().toISOString(),
      },
    });

    // F3: 自动写入 intel_items 活动记录
    {
      const goalSummary = (body.goalDescription ?? '').slice(0, 200);
      const intelId = `intel_play_${play.id}`;
      void admin
        .from('intel_items')
        .insert({
          id: intelId,
          account_id: body.accountId,
          account_name: resolvedAccountName,
          type: 'play_created',
          source: 'ai_play',
          title: `新建谋局：${body.goalDescription?.slice(0, 40) ?? body.goalType}`,
          content: goalSummary,
          summary: goalSummary.slice(0, 80),
          credibility: 'high',
          urgency: 'medium',
          relevance: `谋局目标：${body.goalType}`,
          date: new Date().toISOString(),
          opportunity_id: body.opportunityId ?? null,
          related_contact_ids: body.targetContactId ? [body.targetContactId] : [],
          org_id: ctx.orgId,
          user_id: ctx.userId,
        })
        .then(({ error: intelErr }) => {
          if (intelErr) console.error('[strategic-play] Intel insert failed:', intelErr.message);
        });
    }

    // Fire-and-forget deposit to knowledge_base
    depositKnowledge({
      orgId: ctx.orgId,
      accountId: body.accountId!,
      title: `谋局：${body.goalDescription}`,
      content: `目标类型: ${body.goalType}\n路径: ${(result.steps as { title: string }[]).map(s => s.title).join(' → ')}\n置信度: ${result.confidence}%`,
      category: 'ai_insight',
      source: 'ai_play',
      sourceType: 'strategic_plays',
      sourceId: play.id,
    });

    const evidenceTrace = generatedEvidenceTrace;

    return Response.json({
      id: play.id,
      steps: result.steps,
      actionPlan: result.actionPlan,
      alternativePaths: result.alternativePaths,
      situationJudgment: result.situationJudgment,
      strategicObjective: result.strategicObjective,
      stakeholderPath: result.stakeholderPath,
      evidenceBasis: result.evidenceBasis,
      riskCounterEvidence: result.riskCounterEvidence,
      successCriteria: result.successCriteria,
      confidence: result.confidence,
      ragCases: result.ragCases ?? [],
      knowledgeTraces: evidenceTrace.knowledgeTraces,
      knowledgeGaps: evidenceTrace.knowledgeGaps,
      provenance: evidenceTrace.provenance,
      fieldEvidenceAttributions: evidenceTrace.fieldEvidenceAttributions,
      evidenceTrace,
      ...(judgmentMemory ? { judgmentMemory } : {}),
    });
  } catch (err) {
    console.error('[strategic-play] POST error:', err);
    return guardResponse(err);
  }
}

// PATCH — 更新步骤状态
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as {
      playId: string;
      accountId?: string;
      stepIndex?: number;
      stepStatus?: CompatiblePlayStepStatus;
      executionStatus?: CompatiblePlayStepStatus;
      owner?: string;
      assignedToUserId?: string;
      linkedTaskId?: string;
      executionOwnerSource?: string;
      dueDate?: string;
      startedAt?: string;
      completedAt?: string;
      executionNote?: string;
      actualOutcome?: string;
      outcomeAssessment?: string;
      calibrationNote?: string;
      nextAction?: string;
      blockerReason?: string;
      playStatus?: PlayStatus;
      actualResult?: string;
      momentum?: string;
      assumptions?: { id: string; text: string; status: string; evidence?: string; impact?: string; createdAt: string; updatedAt?: string }[];
      learning?: { stepIndex: number; learning: string; newSignal?: string };
      preparationChecklist?: { text: string; done: boolean }[];
      routeState?: {
        situationLayers?: unknown[];
        confidenceProfile?: Record<string, unknown>;
        winGaps?: unknown[];
        nextVerificationPoint?: string | null;
        playVersions?: unknown[];
      };
      expectedUpdatedAt?: string;
      review?: {
        result: 'achieved' | 'partially_achieved' | 'failed' | 'abandoned';
        whatWorked: string[];
        whatSurprised: string[];
        assumptionsReview: { assumptionId: string; outcome: string }[];
        lessonsForFuture: string[];
        reviewedAt: string;
      };
    };

    if (!body.playId) {
      return Response.json({ error: 'Missing playId' }, { status: 400 });
    }

    const admin = requireAdmin();

    // 校验：只有 play 创建者 / 团队 manager / admin+ 可以修改
    {
      const { data: playForAuth } = await admin
        .from('strategic_plays')
        .select('user_id')
        .eq('id', body.playId)
        .eq('org_id', ctx.orgId)
        .single();
      if (!playForAuth) return Response.json({ error: 'Play not found' }, { status: 404 });
      requireOwnership(ctx, playForAuth.user_id);
    }

    if (body.playStatus) {
      // 更新整个 play 的状态
      return strategicPlayMutationResponse(await updateStrategicPlayStatus({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        status: body.playStatus,
      }));
    }

    if (body.routeState) {
      return strategicPlayMutationResponse(await updateStrategicPlayV2RouteState({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        routeState: body.routeState,
      }));
    }

    if (body.stepIndex !== undefined && body.preparationChecklist !== undefined) {
      // 保存步骤准备清单
      return strategicPlayMutationResponse(await updateStrategicPlayStepPreparationChecklist({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        stepIndex: body.stepIndex,
        preparationChecklist: body.preparationChecklist,
      }));
    }

    if (body.stepIndex !== undefined && (body.stepStatus || body.executionStatus || body.actualResult !== undefined || body.actualOutcome !== undefined)) {
      // 更新单个 step 的执行状态：谋局执行事件必须 account/org scoped
      const { data: play } = await admin
        .from('strategic_plays')
        .select('id, account_id, org_id, opportunity_id, goal_description, steps, last_step_at, status, confidence, assumptions, evidence_provenance, updated_at')
        .eq('id', body.playId)
        .eq('org_id', ctx.orgId)
        .single();

      if (!play) return Response.json({ error: 'Play not found' }, { status: 404 });
      if (body.expectedUpdatedAt && play.updated_at !== body.expectedUpdatedAt) {
        return Response.json({ error: 'Strategic Play 已被其他成员更新，请刷新后再保存。' }, { status: 409 });
      }
      if (body.accountId && body.accountId !== play.account_id) {
        return Response.json({ error: 'accountId 与 play 不匹配，已拒绝跨 account 更新' }, { status: 403 });
      }
      await requireAccountAccess(ctx, play.account_id as string);

      const now = new Date().toISOString();
      const executionInput = buildPlayStepExecutionInput(body);

      let executionResult;
      try {
        executionResult = await applyStrategicPlayStepExecutionWriteback({
          admin,
          orgId: ctx.orgId,
          userId: ctx.userId,
          playId: body.playId,
          stepIndex: body.stepIndex,
          play,
          executionInput,
          now,
        });
      } catch (validationErr) {
        if (validationErr instanceof StrategicPlayExecutionValidationError) {
          return Response.json({ error: validationErr.message }, { status: 400 });
        }
        throw validationErr;
      }

      if (executionResult.status === 'update_failed') return Response.json({ error: 'Update failed' }, { status: 500 });

      const judgmentMemory = await persistStrategicPlayJudgmentMemoryById({ admin, orgId: ctx.orgId, playId: body.playId });
      return Response.json(buildStrategicPlayExecutionResponse({
        steps: executionResult.steps,
        warnings: executionResult.warnings,
        judgmentMemory,
        calibration: executionResult.calibration,
        routeRevisionProposal: executionResult.routeRevisionProposal,
      }));
    }

    // 更新动量
    if (body.momentum) {
      return strategicPlayMutationResponse(await updateStrategicPlayMomentum({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        momentum: body.momentum,
      }));
    }

    // 更新假设列表
    if (body.assumptions) {
      return strategicPlayMutationResponse(await updateStrategicPlayAssumptions({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        assumptions: body.assumptions,
      }));
    }

    // 记录学习 (also save to step for inline display)
    if (body.learning) {
      return strategicPlayMutationResponse(await updateStrategicPlayLearning({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        learning: body.learning,
      }));
    }

    // 保存复盘
    if (body.review) {
      return strategicPlayMutationResponse(await updateStrategicPlayReview({
        admin,
        orgId: ctx.orgId,
        playId: body.playId,
        expectedUpdatedAt: body.expectedUpdatedAt,
        review: body.review,
      }));
    }

    return Response.json({ error: 'No update specified' }, { status: 400 });
  } catch (err) {
    console.error('[strategic-play] PATCH error:', err);
    return guardResponse(err);
  }
}

// DELETE — 删除谋局计划
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const playId = searchParams.get('playId');

    if (!playId) return Response.json({ error: 'Missing playId' }, { status: 400 });

    const admin = requireAdmin();

    // 校验：只有 play 创建者 / 团队 manager / admin+ 可以删除
    const { data: playForAuth } = await admin
      .from('strategic_plays')
      .select('user_id, title, account_id, opportunity_id')
      .eq('id', playId)
      .eq('org_id', ctx.orgId)
      .single();
    if (!playForAuth) return Response.json({ error: 'Play not found' }, { status: 404 });
    requireOwnership(ctx, playForAuth.user_id);

    const { error } = await admin
      .from('strategic_plays')
      .delete()
      .eq('id', playId)
      .eq('org_id', ctx.orgId);

    if (error) return Response.json({ error: 'Delete failed' }, { status: 500 });
    await recordComplianceAudit({
      admin,
      ctx,
      action: 'strategic_play_deleted',
      objectType: 'strategic_play',
      recordId: playId,
      recordName: (playForAuth.title as string | null) ?? playId,
      request,
      changes: {
        accountId: playForAuth.account_id,
        opportunityId: playForAuth.opportunity_id,
      },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[strategic-play] DELETE error:', err);
    return guardResponse(err);
  }
}
