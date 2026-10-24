import { guardResponse, requireAccountAccess, requireAdmin, requireAuth, requireContactAccess, requireOpportunityAccess } from '@/lib/api-guard';
import { buildRouteChangeProposal } from '@/lib/strategic-play-v2/route-change-proposal';
import type { EvidenceSourceKind } from '@/lib/babel-engine/types';

type DecodePlayImpactBody = {
  decodeId?: string;
  accountId?: string;
  contactId?: string;
  opportunityId?: string;
  accountName?: string;
  emailText?: string;
  decode?: {
    threadAnalysis?: {
      keySignal?: string;
      customerAttitude?: string;
      realConcern?: string;
      riskLevel?: string;
    };
    messages?: Array<{
      original?: string;
      decode?: {
        meaning?: string;
        hiddenSignal?: string;
        actualAsk?: string;
      };
    }>;
  };
};

type StrategicPlayRow = {
  id: string;
  account_id: string | null;
  opportunity_id: string | null;
  goal_description: string | null;
  situation_judgment?: string | null;
  strategic_objective?: string | null;
  assumptions: unknown;
  steps?: unknown;
  user_id: string | null;
};

type SourceRecordRow = {
  id: string;
  source_kind: string | null;
  source_table: string | null;
  source_row_id: string | null;
  title: string | null;
  summary: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

type PlayAssumptionRow = {
  text?: string;
  status?: string;
};

type PlayStepRow = {
  title?: string;
  status?: string;
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function truncate(value: string, max = 180): string {
  const text = cleanText(value);
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function normalizeAssumptions(value: unknown): PlayAssumptionRow[] {
  return arrayRecords(value)
    .map((item) => ({
      text: cleanText(item.text),
      status: cleanText(item.status) || 'pending',
    }))
    .filter((item) => Boolean(item.text));
}

function normalizeSteps(value: unknown): PlayStepRow[] {
  return arrayRecords(value)
    .map((item) => ({
      title: cleanText(item.title),
      status: cleanText(item.status),
    }))
    .filter((item) => Boolean(item.title));
}

function extractJudgmentMemory(sourceRecord?: SourceRecordRow | null): Record<string, unknown> {
  const memory = sourceRecord?.metadata?.judgmentMemory;
  return typeof memory === 'object' && memory !== null && !Array.isArray(memory)
    ? memory as Record<string, unknown>
    : {};
}

function tokenHits(source: string, candidate: string): boolean {
  const tokens = candidate.split(/[，。；、\s]+/).map(cleanText).filter((token) => token.length >= 2);
  const normalized = source.toLowerCase();
  return tokens.some((token) => normalized.includes(token.toLowerCase()));
}

function normalizeText(input: DecodePlayImpactBody): string {
  const parts = [
    input.accountName,
    input.emailText,
    input.decode?.threadAnalysis?.keySignal,
    input.decode?.threadAnalysis?.customerAttitude,
    input.decode?.threadAnalysis?.realConcern,
    input.decode?.threadAnalysis?.riskLevel,
    ...(input.decode?.messages ?? []).flatMap((message) => [
      message.original,
      message.decode?.meaning,
      message.decode?.hiddenSignal,
      message.decode?.actualAsk,
    ]),
  ];
  return parts.filter(Boolean).join('\n');
}

function buildImpactAlert(text: string, decodeId?: string) {
  const normalized = text.toLowerCase();
  const signals: string[] = [];

  if (/年降|降价|3040|3200|预算|没有让步空间/.test(text)) signals.push('年降 5% 与预算上限成为硬约束');
  if (/tcs|mantis|竞品|低价|印度/.test(normalized)) signals.push('TCS 低价报价形成竞品锚点');
  if (/aiops|roi|回本|cfo|500|新增投入|自动化/.test(normalized)) signals.push('AIOps 新增投入必须证明一年回本');
  if (/陈晓峰|财务评审|预算归属|回报周期|财务/.test(text)) signals.push('陈晓峰介入财务评审，ROI 口径成为关键路径');

  const needsReplan = signals.length >= 3;
  if (!needsReplan) return null;

  return {
    impacted: true,
    impact_level: 'high',
    reason: '解读发现客户新增了年降 5% 硬约束、TCS 低价锚点、AIOps 一年回本证明和财务评审人陈晓峰，原有谋局需要重新计划。',
    signals,
    affectedAssumptions: [
      '续约与 AIOps 扩展可以按原方案一起推进',
      '采购通过后方案就能顺利进入下一阶段',
      '新增服务线只需要业务价值说明，不需要单独财务 ROI 口径',
    ],
    suggestedAction: 'replan' as const,
    needs_replan: true,
    sourceDecodeId: decodeId ?? null,
    timestamp: new Date().toISOString(),
    dismissed: false,
  };
}

function buildGenericImpactAlert(params: {
  body: DecodePlayImpactBody;
  play: StrategicPlayRow;
  sourceRecord?: SourceRecordRow | null;
}) {
  const { body, play, sourceRecord } = params;
  const memory = extractJudgmentMemory(sourceRecord);
  const signalStatement = truncate(firstNonEmpty(
    memory.currentJudgment,
    body.decode?.threadAnalysis?.keySignal,
    body.decode?.messages?.[0]?.decode?.meaning,
    normalizeText(body),
    '新的 Decode 沟通信号已进入客户判断记忆。',
  ), 160);
  const evidence = truncate(firstNonEmpty(
    sourceRecord?.summary,
    memory.risk,
    body.decode?.messages?.[0]?.decode?.meaning,
    body.emailText,
    'Decode 已保存为客户沟通信号。',
  ), 220);
  const pendingAssumptions = normalizeAssumptions(play.assumptions)
    .filter((item) => item.status !== 'verified');
  const matchedAssumptions = pendingAssumptions
    .filter((assumption) => assumption.text && tokenHits(signalStatement + ' ' + evidence, assumption.text));
  const affectedAssumptions = (matchedAssumptions.length > 0 ? matchedAssumptions : pendingAssumptions.slice(0, 2))
    .map((item) => item.text)
    .filter((text): text is string => Boolean(text));
  const affectedJudgment = truncate(firstNonEmpty(
    affectedAssumptions[0] ? '关键假设「' + affectedAssumptions[0] + '」' : '',
    play.situation_judgment,
    play.strategic_objective,
    play.goal_description,
    '当前谋局判断',
  ), 140);
  const riskLevel = body.decode?.threadAnalysis?.riskLevel;
  const highRisk = riskLevel === 'high' || riskLevel === 'critical' || /预算|降价|竞品|延期|暂停|否决|财务|法务/.test(signalStatement + ' ' + evidence);
  const openStep = normalizeSteps(play.steps)
    .find((step) => !['done', 'completed', 'cancelled', 'skipped'].includes((step.status ?? '').toLowerCase()));
  const question = truncate(firstNonEmpty(
    memory.uncertainty,
    affectedAssumptions[0] ? '这条信号是否会改变「' + affectedAssumptions[0] + '」？' : '',
    '这条信号是短期沟通噪音，还是足以改变当前谋局判断？',
  ), 160);
  const nextMove = truncate(firstNonEmpty(
    memory.nextAction,
    openStep?.title,
    highRisk ? '先复核受影响假设，再决定是否重新规划下一步打法。' : '先补证据确认信号强度，再调整下一步推进动作。',
  ), 180);

  return {
    impacted: true,
    impact_level: highRisk ? 'high' : 'medium',
    reason: '新 Decode 表明「' + signalStatement + '」，可能影响' + affectedJudgment + '。',
    signalStatement,
    affectedJudgment,
    evidence,
    source: {
      sourceRecordId: sourceRecord?.id ?? null,
      sourceKind: sourceRecord?.source_kind ?? 'email_decode',
      sourceTable: sourceRecord?.source_table ?? 'email_decodes',
      sourceRowId: sourceRecord?.source_row_id ?? body.decodeId ?? null,
      title: sourceRecord?.title ?? 'Decode 解读',
      occurredAt: sourceRecord?.occurred_at ?? new Date().toISOString(),
    },
    affectedAssumptions,
    question,
    nextMove,
    suggestedAction: highRisk ? 'replan' as const : 'verify_assumption' as const,
    needs_replan: highRisk,
    sourceDecodeId: body.decodeId ?? null,
    timestamp: new Date().toISOString(),
    dismissed: false,
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const body = (await request.json()) as DecodePlayImpactBody;

    let accountId = body.accountId ?? null;
    if (body.contactId) {
      const contact = await requireContactAccess(ctx, body.contactId);
      accountId = accountId ?? contact.account_id;
    }

    if (body.opportunityId) {
      const opportunity = await requireOpportunityAccess(ctx, body.opportunityId);
      accountId = accountId ?? opportunity.account_id;
    }

    if (!accountId) {
      return Response.json({ ok: true, skipped: 'missing_account' });
    }

    await requireAccountAccess(ctx, accountId);

    const demoAlert = buildImpactAlert(normalizeText(body), body.decodeId);

    let sourceRecord: SourceRecordRow | null = null;
    if (body.decodeId) {
      const sourceResult = await admin
        .from('source_records')
        .select('id, source_kind, source_table, source_row_id, title, summary, occurred_at, metadata')
        .eq('org_id', ctx.orgId)
        .eq('account_id', accountId)
        .eq('source_table', 'email_decodes')
        .eq('source_row_id', body.decodeId)
        .maybeSingle();

      if (sourceResult.error) {
        const message = sourceResult.error.message ?? '';
        if (!message.includes('source_records') && !message.includes('schema cache') && !message.includes('does not exist')) {
          console.warn('[decode-play-impact] source_records query failed:', sourceResult.error);
        }
      } else {
        sourceRecord = sourceResult.data as SourceRecordRow | null;
      }
    }

    let playQuery = admin
      .from('strategic_plays')
      .select('id, account_id, opportunity_id, goal_description, situation_judgment, strategic_objective, assumptions, steps, user_id')
      .eq('org_id', ctx.orgId)
      .eq('account_id', accountId)
      .in('status', ['active', 'in_progress']);

    if (body.opportunityId) {
      playQuery = playQuery.or(`opportunity_id.eq.${body.opportunityId},opportunity_id.is.null`);
    }

    const { data: plays, error } = await playQuery;
    if (error) {
      console.error('[decode-play-impact] query failed:', error);
      return Response.json({ error: 'Failed to query strategic plays' }, { status: 500 });
    }

    const activePlays = (plays ?? []) as StrategicPlayRow[];
    if (activePlays.length === 0) {
      return Response.json({ ok: true, created: 0, skipped: 'no_active_play' });
    }

    for (const play of activePlays) {
      const genericAlert = buildGenericImpactAlert({ body, play, sourceRecord });
      const alert = demoAlert
        ? {
            ...genericAlert,
            ...demoAlert,
            signalStatement: genericAlert.signalStatement,
            affectedJudgment: genericAlert.affectedJudgment,
            evidence: genericAlert.evidence,
            source: genericAlert.source,
            question: genericAlert.question,
            nextMove: genericAlert.nextMove,
          }
        : genericAlert;
      const routeChangeProposal = buildRouteChangeProposal({
        play: {
          id: play.id,
          goalDescription: play.goal_description,
          situationJudgment: play.situation_judgment,
          strategicObjective: play.strategic_objective,
          steps: play.steps,
          assumptions: play.assumptions,
          playVersions: [],
        },
        signal: {
          signalStatement: alert.signalStatement,
          affectedJudgment: alert.affectedJudgment,
          evidence: alert.evidence,
          question: alert.question,
          nextMove: alert.nextMove,
          needsReplan: alert.needs_replan,
          triggerKind: 'decode_signal',
          now: alert.timestamp,
          sourceRef: {
            sourceId: alert.source.sourceRecordId ?? alert.source.sourceRowId ?? body.decodeId ?? 'decode-signal',
            sourceType: alert.source.sourceKind ?? 'email_decode',
            ...(alert.source.sourceKind ? { sourceKind: alert.source.sourceKind as EvidenceSourceKind } : {}),
            ...(alert.source.sourceTable ? { sourceTable: alert.source.sourceTable } : {}),
            ...(alert.source.sourceRowId ? { sourceRowId: alert.source.sourceRowId } : {}),
            title: alert.source.title,
            occurredAt: alert.source.occurredAt,
          },
        },
      });
      await admin.from('ai_insights').upsert(
        {
          org_id: ctx.orgId,
          entity_type: 'strategic_play',
          entity_id: play.id,
          insight_type: 'play_impact_alert',
          data: { ...alert, playId: play.id, routeChangeProposal },
        },
        { onConflict: 'org_id,entity_type,entity_id,insight_type' },
      );

      await admin.from('agent_notifications').insert({
        org_id: ctx.orgId,
        user_id: play.user_id ?? null,
        type: 'play_assumption_alert',
        priority: alert.needs_replan ? 'high' : 'medium',
        title: alert.needs_replan ? '需要重新计划谋局' : '新信号可能影响当前谋局',
        body: alert.reason,
        actions: [{
          id: alert.needs_replan ? 'replan_play' : 'view_play_signal',
          label: alert.needs_replan ? '重新计划谋局' : '查看影响提示',
          style: 'primary',
          action: {
            type: 'link',
            accountId,
            playId: play.id,
            sourceDecodeId: body.decodeId,
          },
        }],
        read: false,
      });
    }

    return Response.json({ ok: true, created: activePlays.length });
  } catch (err) {
    return guardResponse(err);
  }
}
