// AI Event Handlers — 真实处理器
// 每个 handler 接收事件，做 AI 分析，写回 ai_insights

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { upsertInsight } from '@/lib/ai-event-hub';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { computeDealHealth } from '@/lib/deal-health';
import type {
  DealHealthInsight,
  ActionInsight,
  ImpactInsight,
  PlayImpactAlertInsight,
} from '@/lib/babel-engine/types';

// ─── Decode Completed Handler ───────────────────────────────────────

export async function handleDecodeCompleted(event: Record<string, unknown>): Promise<void> {
  const orgId = event.org_id as string;
  const payload = event.payload as Record<string, unknown>;
  const matchedContactId = payload?.matchedContactId as string | undefined;

  if (!matchedContactId || matchedContactId === 'unknown') return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  // 找到联系人关联的所有 active deals
  const { data: contact } = await admin
    .from('contacts')
    .select('id, name, account_id, role')
    .eq('id', matchedContactId)
    .single();

  if (!contact?.account_id) return;

  // 获取该 account 的所有 active opportunities
  const { data: opportunities } = await admin
    .from('opportunities')
    .select('id, name, stage, value, account_id, updated_at, created_at')
    .eq('account_id', contact.account_id)
    .eq('org_id', orgId)
    .not('stage', 'in', '(closed_won,closed_lost)');

  if (!opportunities || opportunities.length === 0) return;

  // 获取 account 的所有联系人和任务
  const [{ data: contacts }, { data: tasks }] = await Promise.all([
    admin.from('contacts').select('id, name, role, last_contacted_at').eq('account_id', contact.account_id),
    admin.from('tasks').select('id, title, status, priority, due_date, opportunity_id, account_id, updated_at').eq('org_id', orgId),
  ]);

  // 对每个 deal 更新健康度
  for (const opp of opportunities) {
    const oppTasks = (tasks ?? []).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      opportunityId: t.opportunity_id,
      accountId: t.account_id,
      updatedAt: t.updated_at,
      aiGenerated: false,
      source: 'manual' as const,
      createdAt: t.updated_at,
    }));

    const healthResult = computeDealHealth({
      opportunity: {
        id: opp.id,
        accountId: opp.account_id,
        name: opp.name,
        stage: opp.stage,
        value: opp.value ?? 0,
        currency: 'USD',
        probability: 0,
        expectedCloseDate: '',
        owner: '',
        source: '',
        createdAt: opp.created_at,
        updatedAt: opp.updated_at,
        meddicc: { metrics: { notes: '', status: 'unconfirmed', evidence: '' }, economicBuyer: { status: 'unknown', accessLevel: '' }, decisionCriteria: [], decisionProcess: [], identifiedPain: [], champion: { strength: 0, lastEngagement: '', notes: '' }, competition: [], overallScore: 0 },
        mutualActionPlan: { targetSignDate: '', confidence: 50, milestones: [] },
        competitorIds: [],
        notes: '',
      },
      account: {
        lastActivity: opp.updated_at,
        contacts: (contacts ?? []).map(c => ({
          id: c.id, name: c.name, email: '', role: c.role,
          lastContactedAt: c.last_contacted_at,
        })),
      },
      tasks: oppTasks,
    });

    const insight: DealHealthInsight = {
      level: healthResult.level,
      score: healthResult.level === 'healthy' ? 80 : healthResult.level === 'at_risk' ? 50 : 20,
      reasons: healthResult.reasons,
      riskFactors: healthResult.reasons.filter(r => r.includes('降级') || r.includes('逾期') || r.includes('无')),
      recommendations: [],
      lastDecodeSignal: (payload?.sentimentTrend as string) ?? undefined,
    };

    await upsertInsight(orgId, 'opportunity', opp.id, 'health', insight as unknown as Record<string, unknown>, 'decode.completed');
  }

  // 生成行动建议（深度上下文版）
  try {
    const sentimentTrend = payload?.sentimentTrend as string;
    const riskLevel = payload?.riskLevel as string;
    const buyerState = payload?.buyerState as string;
    const accountName = payload?.accountName as string;

    // 获取最近 5 条 decode 历史摘要
    const { data: recentDecodes } = await admin
      .from('email_decodes')
      .select('decode, date, client_name')
      .eq('matched_contact_id', matchedContactId)
      .eq('org_id', orgId)
      .order('date', { ascending: false })
      .limit(5);

    const decodeHistory = (recentDecodes ?? []).map((d) => {
      const decode = d.decode as Record<string, unknown> | null;
      const ta = decode?.threadAnalysis as Record<string, unknown> | null;
      return `[${d.date}] 情绪:${ta?.sentimentTrend ?? '?'} 风险:${ta?.riskLevel ?? '?'} 状态:${ta?.buyerState ?? '?'} 信号:${ta?.keySignal ?? '无'}`;
    }).join('\n');

    // 获取联系人画像
    const { data: contactDetail } = await admin
      .from('contacts')
      .select('name, title, role, decision_style, risk_appetite, communication_notes, landmines, contact_profile')
      .eq('id', matchedContactId)
      .single();

    const profileSummary = contactDetail?.contact_profile
      ? formatProfileForPrompt(contactDetail.contact_profile as Record<string, unknown>)
      : '暂无画像';

    // 获取最近情报
    const { data: recentIntel } = await admin
      .from('intel_items')
      .select('title, content, urgency, credibility, date')
      .eq('account_id', contact.account_id)
      .eq('org_id', orgId)
      .order('date', { ascending: false })
      .limit(3);

    const intelSummary = (recentIntel ?? []).map((i) =>
      `[${i.date}] ${i.title}（${i.urgency}紧急 ${i.credibility}可信）`
    ).join('\n');

    // 获取 deal 信息
    const dealSummary = opportunities.map((o) =>
      `- ${o.name}（阶段:${o.stage}，金额:$${o.value}）`
    ).join('\n');

    // 获取待办任务
    const { data: pendingTasks } = await admin
      .from('tasks')
      .select('title, status, priority, due_date')
      .eq('account_id', contact.account_id)
      .eq('org_id', orgId)
      .neq('status', 'done')
      .order('due_date', { ascending: true })
      .limit(5);

    const taskSummary = (pendingTasks ?? []).map((t) =>
      `- [${t.priority}] ${t.title}${t.due_date ? ` (截止:${t.due_date})` : ''}`
    ).join('\n');

    const actionPrompt = `基于以下完整上下文，生成 2-4 个精准行动建议：

## 当前信号
联系人：${contactDetail?.name ?? contact.name}（${contactDetail?.title ?? ''}，${contact.role ?? '未知角色'}）
客户：${accountName ?? '未知'}
情绪趋势：${sentimentTrend ?? '未知'}
风险等级：${riskLevel ?? '未知'}
买方状态：${buyerState ?? '未知'}

## 联系人画像
${profileSummary}
${contactDetail?.landmines ? `⚠️ 雷区: ${contactDetail.landmines}` : ''}
${contactDetail?.communication_notes ? `沟通备注: ${contactDetail.communication_notes}` : ''}

## 最近邮件趋势（最近 5 封）
${decodeHistory || '无历史'}

## 活跃 Deal
${dealSummary || '无活跃 Deal'}

## 最近情报
${intelSummary || '无近期情报'}

## 待办任务
${taskSummary || '无待办'}

请基于以上全部信息，给出针对性的行动建议。每个建议必须：
1. 考虑联系人的性格特点和沟通风格
2. 考虑当前 deal 阶段和风险
3. 有明确的时间框架
4. 有具体的执行步骤

返回 JSON：
{
  "actions": [
    {
      "title": "行动标题（简洁）",
      "description": "具体描述（包含为什么、怎么做、注意什么）",
      "priority": "high|medium|low",
      "dueInDays": 数字,
      "triggerEvent": "decode.completed"
    }
  ]
}`;

    const actionResult = await callAIWithFallback<{ actions: ActionInsight['actions'] }>({
      systemPrompt: '你是顶级 B2B 销售 AI 顾问，精通 MEDDICC、SPIN、Challenger Sale。你的建议必须基于数据，不是空话。每个行动必须考虑联系人的心理画像、deal 阶段和最新信号。用中文回复。',
      userPrompt: actionPrompt,
    }, { degradedResponse: { actions: [] } });

    if (actionResult?.actions) {
      const actionInsight: ActionInsight = {
        actions: actionResult.actions.map(a => ({
          ...a,
          triggerEvent: 'decode.completed',
          relatedEntityId: matchedContactId,
        })),
        generatedAt: new Date().toISOString(),
      };

      await upsertInsight(orgId, 'account', contact.account_id, 'action', actionInsight as unknown as Record<string, unknown>, 'decode.completed');
    }
  } catch (err) {
    console.error('[handler:decode] Action generation failed:', err);
  }

  // ─── 谋局影响检测 ─────────────────────────────────────────────────
  try {
    // 查询与此联系人相关的谋局（target_contact 匹配 或 步骤中涉及此联系人）
    const { data: accountPlays } = await admin
      .from('strategic_plays')
      .select('id, goal_description, assumptions, steps, status, target_contact_id')
      .eq('account_id', contact.account_id)
      .eq('org_id', orgId)
      .in('status', ['active', 'in_progress']);

    // 过滤出与该联系人相关的谋局
    const activePlays = (accountPlays ?? []).filter(play => {
      // 1. target_contact_id 直接匹配
      if (play.target_contact_id === matchedContactId) return true;
      // 2. 步骤中的 target/who 包含联系人姓名
      const steps = (play.steps as { target?: string; who?: string }[]) ?? [];
      return steps.some(s =>
        (s.target && contact.name && s.target.includes(contact.name)) ||
        (s.who && contact.name && s.who.includes(contact.name))
      );
    });

    if (activePlays && activePlays.length > 0) {
      const sentimentTrend = payload?.sentimentTrend as string;
      const riskLevel = payload?.riskLevel as string;
      const buyerState = payload?.buyerState as string;
      const accountName = payload?.accountName as string;

      for (const play of activePlays) {
        const assumptions = play.assumptions as { id: string; text: string; status: string }[] ?? [];
        const steps = play.steps as { index: number; title: string; status: string }[] ?? [];
        const pendingSteps = steps.filter(s => s.status === 'pending' || s.status === 'in_progress');

        const playImpactPrompt = `评估这次新的客户沟通是否影响了正在执行的谋局计划。

## 新沟通信号
客户：${accountName ?? '未知'}
联系人：${contact.name}（${contact.role ?? '未知角色'}）
情绪趋势：${sentimentTrend ?? '未知'}
风险等级：${riskLevel ?? '未知'}
买方状态：${buyerState ?? '未知'}

## 谋局计划
目标：${play.goal_description}

### 假设
${assumptions.length > 0 ? assumptions.map(a => `- [${a.status}] ${a.text}`).join('\n') : '无假设'}

### 当前待执行步骤
${pendingSteps.length > 0 ? pendingSteps.map(s => `- 步骤${s.index + 1}: ${s.title}（${s.status}）`).join('\n') : '无待执行步骤'}

请判断：这次沟通是否改变了某个假设的有效性？是否需要调整策略？

返回 JSON：
{
  "impacted": true/false,
  "reason": "影响原因（简洁）",
  "affectedAssumptions": ["受影响的假设文本"],
  "suggestedAction": "replan" | "verify_assumption" | "no_action"
}`;

        const impactResult = await callAIWithFallback<{
          impacted: boolean;
          reason: string;
          affectedAssumptions: string[];
          suggestedAction: 'replan' | 'verify_assumption' | 'no_action';
        }>({
          systemPrompt: '你是 B2B 销售谋局分析师。评估新沟通对谋局计划的影响，只在确实有影响时标记 impacted=true。用中文回复。',
          userPrompt: playImpactPrompt,
          tier: 'flash',
        }, { degradedResponse: { impacted: false, reason: 'AI 服务暂时不可用', affectedAssumptions: [], suggestedAction: 'no_action' } });

        if (impactResult?.impacted) {
          const alertData: PlayImpactAlertInsight = {
            impacted: true,
            playId: play.id,
            reason: impactResult.reason,
            affectedAssumptions: impactResult.affectedAssumptions,
            suggestedAction: impactResult.suggestedAction,
            sourceDecodeId: event.entity_id as string,
            timestamp: new Date().toISOString(),
          };

          await upsertInsight(
            orgId,
            'strategic_play',
            play.id,
            'play_impact_alert',
            alertData as unknown as Record<string, unknown>,
            'decode.completed'
          );
        }
      }
    }
  } catch (err) {
    console.error('[handler:decode] Play impact detection failed:', err);
  }

  // ─── 竞品情报自动提取 ──────────────────────────────────────────────
  try {
    const decode = payload?.decode as Record<string, unknown> | undefined;
    const threadAnalysis = decode?.threadAnalysis as Record<string, unknown> | undefined;
    const keySignal = (threadAnalysis?.keySignal as string) ?? '';
    const emailText = (payload?.emailText as string) ?? '';
    const combinedText = `${keySignal} ${emailText}`;

    const COMPETITION_KEYWORDS = ['竞品', '对手', '另外两家', '比价', 'competitor', '竞争', '竞标', '友商', '其他供应商', '替代方案'];
    const hasCompetitionSignal = COMPETITION_KEYWORDS.some((kw) => combinedText.includes(kw));

    if (hasCompetitionSignal && contact.account_id) {
      const accountName = payload?.accountName as string;
      const today = new Date().toISOString().slice(0, 10);

      await admin.from('intel_items').insert({
        org_id: orgId,
        account_id: contact.account_id,
        title: `竞品动态 — ${accountName ?? '客户'}邮件中提及竞品信息`,
        content: `邮件信号: ${keySignal || '(详见原文)'}`,
        source: 'email_decode',
        urgency: 'high',
        credibility: 'high',
        date: today,
        tags: ['竞品', '自动提取'],
      });
    }
  } catch (err) {
    console.error('[handler:decode] Competition intel extraction failed:', err);
  }
}

// ─── Intel Created Handler ──────────────────────────────────────────

export async function handleIntelCreated(event: Record<string, unknown>): Promise<void> {
  const orgId = event.org_id as string;
  const payload = event.payload as Record<string, unknown>;
  const accountName = payload?.accountName as string;

  if (!accountName) return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  // 找到关联的 account
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, name')
    .eq('org_id', orgId)
    .ilike('name', accountName);

  if (!accounts || accounts.length === 0) return;
  const accountId = accounts[0].id;

  // 找到该 account 的 active deals
  const { data: deals } = await admin
    .from('opportunities')
    .select('id, name, value, stage')
    .eq('account_id', accountId)
    .eq('org_id', orgId)
    .not('stage', 'in', '(closed_won,closed_lost)');

  if (!deals || deals.length === 0) return;

  const riskLevel = (payload?.riskLevel as string) ?? 'medium';
  const urgency = (payload?.urgency as string) ?? 'medium';

  // 生成影响分析
  try {
    const impactPrompt = `新情报对以下 Deal 的影响分析：
客户：${accountName}
情报风险等级：${riskLevel}
紧急度：${urgency}

当前活跃 Deal：
${deals.map(d => `- ${d.name}（${d.stage}，$${d.value}）`).join('\n')}

返回 JSON：
{
  "impactedDeals": [
    {
      "dealId": "deal id",
      "dealName": "deal name",
      "previousRisk": "low|medium|high|critical",
      "newRisk": "low|medium|high|critical",
      "reason": "影响原因"
    }
  ],
  "summary": "总结"
}`;

    const impactResult = await callAIWithFallback<ImpactInsight>({
      systemPrompt: '你是 B2B 销售情报分析师。评估新情报对现有 Deal 的影响，给出风险变化评估。简洁直击。用中文。',
      userPrompt: impactPrompt,
    }, { degradedResponse: { impactedDeals: [], summary: 'AI 服务暂时不可用，无法生成影响分析。' } as unknown as ImpactInsight });

    if (impactResult) {
      await upsertInsight(
        orgId, 'account', accountId, 'impact',
        { ...impactResult, generatedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
        'intel.created'
      );
    }
  } catch (err) {
    console.error('[handler:intel] Impact analysis failed:', err);
  }
}

// ─── Deal Stage Changed Handler ─────────────────────────────────────

export async function handleDealStageChanged(event: Record<string, unknown>): Promise<void> {
  const orgId = event.org_id as string;
  const entityId = event.entity_id as string;
  const payload = event.payload as Record<string, unknown>;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  // 获取 deal 详情
  const { data: deal } = await admin
    .from('opportunities')
    .select('id, name, stage, value, account_id, meddicc, updated_at, created_at')
    .eq('id', entityId)
    .single();

  if (!deal) return;

  const previousStage = payload?.previousStage as string;
  const newStage = deal.stage;

  // 生成策略刷新建议
  try {
    const strategyPrompt = `Deal 阶段变化，需要更新策略：
Deal：${deal.name}
金额：$${deal.value}
之前阶段：${previousStage ?? '未知'}
当前阶段：${newStage}
MEDDICC 评分：${(deal.meddicc as Record<string, unknown>)?.overallScore ?? '未评估'}

返回 JSON：
{
  "actions": [
    {
      "title": "行动标题",
      "description": "具体描述",
      "priority": "high|medium|low",
      "dueInDays": 数字,
      "triggerEvent": "deal.stage_changed"
    }
  ]
}`;

    const result = await callAIWithFallback<{ actions: ActionInsight['actions'] }>({
      systemPrompt: '你是 B2B 销售策略顾问。Deal 阶段变化后，给出下一步行动建议。简洁可执行。用中文。',
      userPrompt: strategyPrompt,
    }, { degradedResponse: { actions: [] } });

    if (result?.actions) {
      await upsertInsight(
        orgId, 'opportunity', entityId, 'action',
        { actions: result.actions.map(a => ({ ...a, triggerEvent: 'deal.stage_changed' })), generatedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
        'deal.stage_changed'
      );
    }
  } catch (err) {
    console.error('[handler:deal-stage] Strategy refresh failed:', err);
  }
}

// ─── Contact Updated Handler ────────────────────────────────────────

export async function handleContactUpdated(event: Record<string, unknown>): Promise<void> {
  const orgId = event.org_id as string;
  const entityId = event.entity_id as string;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  // 获取联系人关联的 active deals
  const { data: contact } = await admin
    .from('contacts')
    .select('account_id, name, role')
    .eq('id', entityId)
    .single();

  if (!contact?.account_id) return;

  // 刷新关联 deal 的策略
  const { data: deals } = await admin
    .from('opportunities')
    .select('id, name')
    .eq('account_id', contact.account_id)
    .eq('org_id', orgId)
    .not('stage', 'in', '(closed_won,closed_lost)');

  if (!deals || deals.length === 0) return;

  // 为关键角色联系人的变更触发策略刷新
  const keyRoles = ['decision_maker', 'champion', 'blocker', 'technical_evaluator'];
  if (contact.role && keyRoles.includes(contact.role)) {
    for (const deal of deals) {
      await upsertInsight(
        orgId, 'opportunity', deal.id, 'strategy',
        {
          needsRefresh: true,
          reason: `关键联系人 ${contact.name}（${contact.role}）信息已更新`,
          updatedAt: new Date().toISOString(),
        } as unknown as Record<string, unknown>,
        'contact.updated'
      );
    }
  }
}

// ─── Contact Profile Updated Handler ─────────────────────────────────

export async function handleContactProfileUpdated(event: Record<string, unknown>): Promise<void> {
  const orgId = event.org_id as string;
  const entityId = event.entity_id as string;  // contact id

  const admin = getSupabaseAdmin();
  if (!admin) return;

  // 获取联系人的 account_id
  const { data: contact } = await admin
    .from('contacts')
    .select('account_id, name')
    .eq('id', entityId)
    .single();

  if (!contact?.account_id) return;

  // 检查是否有关联的 active 谋局计划
  const { data: plays } = await admin
    .from('strategic_plays')
    .select('id, steps, target_contact_id')
    .eq('account_id', contact.account_id)
    .eq('org_id', orgId)
    .in('status', ['active', 'in_progress']);

  if (!plays || plays.length === 0) return;

  // 对涉及该联系人的谋局计划，标记需要刷新
  for (const play of plays) {
    const steps = play.steps as { target?: string }[];
    const involvesContact = play.target_contact_id === entityId ||
      steps.some(s => s.target?.includes(contact.name));

    if (involvesContact) {
      // 通过 upsertInsight 记录路径需要更新的信号
      await upsertInsight(
        orgId, 'account', contact.account_id, 'strategy',
        {
          needsRefresh: true,
          reason: `联系人 ${contact.name} 画像已更新`,
          affectedPlayIds: [play.id],
          updatedAt: new Date().toISOString(),
        } as unknown as Record<string, unknown>,
        'contact.profile_updated'
      );
    }
  }
}

// ─── News Discovered Handler ────────────────────────────────────────

export async function handleNewsDiscovered(event: Record<string, unknown>): Promise<void> {
  // 复用 handleIntelCreated 的逻辑
  await handleIntelCreated(event);
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatProfileForPrompt(profile: Record<string, unknown>): string {
  const parts: string[] = [];
  const ds = profile.decisionStyle as Record<string, unknown> | undefined;
  if (ds?.type) parts.push(`决策风格: ${ds.type}（${ds.confidence ? `置信度 ${ds.confidence}` : ''}）`);

  if (profile.riskAppetite) parts.push(`风险偏好: ${profile.riskAppetite}`);

  const comm = profile.communication as Record<string, unknown> | undefined;
  if (comm) {
    if (comm.responseSpeed) parts.push(`回复速度: ${comm.responseSpeed}`);
    if (comm.formality) parts.push(`正式度: ${comm.formality}`);
    if (comm.bestContactTime) parts.push(`最佳联系时间: ${comm.bestContactTime}`);
  }

  const triggers = profile.positiveTriggers as string[] | undefined;
  if (triggers?.length) parts.push(`正面触发: ${triggers.join(', ')}`);

  const negTriggers = profile.negativeTriggers as string[] | undefined;
  if (negTriggers?.length) parts.push(`负面触发: ${negTriggers.join(', ')}`);

  const tips = profile.engagementTips as string[] | undefined;
  if (tips?.length) parts.push(`沟通技巧: ${tips.join(', ')}`);

  return parts.join('\n') || '暂无详细画像';
}
