import { requireAuth, requireRole, requireOwnership, requireAdmin, guardResponse } from '@/lib/api-guard';

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { accountId, toUserId, reason, notes } = await request.json();
    if (!accountId) return Response.json({ error: 'Missing accountId' }, { status: 400 });

    // 验证 toUserId 属于当前 org（避免写入跨组织/无效 owner）
    if (toUserId) {
      const { data: targetMember } = await admin
        .from('org_memberships')
        .select('user_id')
        .eq('user_id', toUserId)
        .eq('org_id', ctx.orgId)
        .single();
      if (!targetMember) return Response.json({ error: '目标用户不属于当前组织' }, { status: 400 });
    }

    // 获取当前 account 完整信息（含 user_id 做 legacy 回退）
    const { data: account } = await admin
      .from('accounts')
      .select('owner_id, user_id, name')
      .eq('id', accountId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });

    // 源账户权限校验：owner_id 优先，回退到 user_id（兼容 legacy 数据）
    const sourceOwnerId = account.owner_id ?? account.user_id;
    const isPoolAccount = !sourceOwnerId;
    const isSelfClaim = isPoolAccount && toUserId === ctx.userId;

    // 公海账户自领：允许任何已认证用户；其余操作需 manager+
    if (!isSelfClaim) {
      requireRole(ctx, 'manager');
    }

    if (sourceOwnerId) {
      requireOwnership(ctx, sourceOwnerId);
    }

    // ── 生成上下文包（Context Pack）── 给新 AE 完整历史视图 ──
    const contextPack: Record<string, unknown> = {};

    // 1. 所有联系人
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, name, title, email, phone, role, decision_style, risk_appetite, attitude_trend')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId);
    contextPack.contacts = contacts || [];

    // 2. 所有商机
    const { data: opportunities } = await admin
      .from('opportunities')
      .select('id, name, stage, value, probability, expected_close_date')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId);
    contextPack.opportunities = opportunities || [];

    // 3. MEDDICC 评估（从商机拿）
    if (opportunities?.length) {
      const oppIds = opportunities.map((o: { id: string }) => o.id);
      const { data: meddicc } = await admin
        .from('opportunities')
        .select('id, name, meddicc')
        .in('id', oppIds);
      contextPack.meddicc = meddicc || [];
    }

    // 4. 谋局（Strategic Plays）
    const { data: plays } = await admin
      .from('strategic_plays')
      .select('id, name, status, goal_type, goal_description, created_at')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(20);
    contextPack.strategicPlays = plays || [];

    // 5. 邮件解读历史
    const { data: decodes } = await admin
      .from('email_decodes')
      .select('id, subject, sender_name, created_at, sentiment, risk_level, buyer_state')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(30);
    contextPack.decodeHistory = decodes || [];

    // 6. 情报
    const { data: intel } = await admin
      .from('intel_items')
      .select('id, type, title, content, credibility, urgency, created_at')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(20);
    contextPack.intelItems = intel || [];

    // 7. 活动日志
    const { data: activities } = await admin
      .from('activity_logs')
      .select('id, action_type, entity_type, summary, created_at')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(30);
    contextPack.activities = activities || [];

    // ── 更新 owner ──
    const { error: updateErr } = await admin
      .from('accounts')
      .update({
        owner_id: toUserId || null,
        user_id: toUserId || null,
        ownership_changed_at: new Date().toISOString(),
        ownership_changed_by: ctx.userId,
      })
      .eq('id', accountId)
      .eq('org_id', ctx.orgId);

    if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

    // 同步更新关联商机的 owner（transfer 和 reclaim 都要闭环）
    if (opportunities?.length) {
      const oppIds = opportunities.map((o: { id: string }) => o.id);
      await admin
        .from('opportunities')
        .update({ assigned_to: toUserId || null, user_id: toUserId || null })
        .in('id', oppIds)
        .eq('org_id', ctx.orgId);
    }

    // ── Handoff 上下文同步：更新关联数据的 user_id，确保新 owner 可见 ──
    const newUserId = toUserId || null;
    await Promise.all([
      admin.from('contacts').update({ user_id: newUserId }).eq('account_id', accountId).eq('org_id', ctx.orgId),
      admin.from('meeting_preps').update({ user_id: newUserId }).eq('account_id', accountId).eq('org_id', ctx.orgId),
      admin.from('intel_items').update({ user_id: newUserId }).eq('account_id', accountId).eq('org_id', ctx.orgId),
      admin.from('email_decodes').update({ user_id: newUserId }).eq('account_id', accountId).eq('org_id', ctx.orgId),
      admin.from('strategic_plays').update({ user_id: newUserId }).eq('account_id', accountId).eq('org_id', ctx.orgId),
      admin.from('tasks').update({ user_id: newUserId, assigned_to: newUserId }).eq('account_id', accountId).eq('org_id', ctx.orgId).neq('status', 'done'),
    ]);

    // ── 记录交接日志（含上下文包 + 备注）──
    await admin.from('ownership_transfers').insert({
      org_id: ctx.orgId,
      object_type: 'account',
      record_id: accountId,
      from_user: account.owner_id,
      to_user: toUserId || null,
      reason: reason || (toUserId ? 'transfer' : 'reclaim'),
      notes: notes || null,
      context_snapshot: contextPack,
      transferred_by: ctx.userId,
    });

    // 审计日志
    await admin.from('audit_log').insert({
      org_id: ctx.orgId,
      user_id: ctx.userId,
      action: toUserId ? 'transfer' : 'reclaim',
      object_type: 'account',
      record_id: accountId,
      record_name: account.name,
      changes: {
        owner_id: { old: account.owner_id, new: toUserId },
        notes,
        context_fields: Object.keys(contextPack),
      },
    });

    return Response.json({ success: true, contextPack });
  } catch (err) {
    return guardResponse(err);
  }
}

// GET — 获取交接历史
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    if (!accountId) return Response.json({ error: 'Missing accountId' }, { status: 400 });

    // 验证当前用户对该 account 有可见权限
    const { data: account } = await admin
      .from('accounts')
      .select('owner_id, user_id')
      .eq('id', accountId)
      .eq('org_id', ctx.orgId)
      .single();
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });

    // 非 admin+：只能查看自己可见范围内的账户交接历史
    const accountOwnerId = account.owner_id ?? account.user_id;
    if (ctx.userId !== 'demo') {
      requireOwnership(ctx, accountOwnerId ?? '');
    }

    const { data, error } = await admin
      .from('ownership_transfers')
      .select('*')
      .eq('org_id', ctx.orgId)
      .eq('record_id', accountId)
      .eq('object_type', 'account')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data || []);
  } catch (err) {
    return guardResponse(err);
  }
}
