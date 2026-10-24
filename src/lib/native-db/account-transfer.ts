import { withTransaction } from '@/lib/postgres';
import { ApiError, requireOwnership, requireRole } from '@/lib/api-guard';
import { getRoleLevel, type OrgRole, type UserContext } from '@/lib/permissions';

type AccountSnapshot = { owner_id: string | null; user_id: string | null; name: string };
type TransferInput = { accountId: string; toUserId: string | null; reason?: string; notes?: string };
/** Called only after the route's authentication, tenant, ownership and target-member guards. */
export async function transferNativeAccount(ctx: UserContext, input: TransferInput, expected: AccountSnapshot) {
  return withTransaction(async query => {
    // Lock membership rows while authorizing. Role/team changes and membership
    // revocation must not slip between the recheck and the ownership write.
    const memberships = await query<{ user_id: string; role: OrgRole; job_level: number | null; role_level: number | null; team_id: string | null }>(
      'SELECT user_id,role,job_level,role_level,team_id FROM public.org_memberships WHERE org_id=$1 ORDER BY user_id FOR SHARE', [ctx.orgId]);
    const actor = memberships.find(m => m.user_id === ctx.userId);
    if (!actor) throw new ApiError(403, 'Organization membership was revoked');
    if (input.toUserId && !memberships.some(m => m.user_id === input.toUserId)) throw new ApiError(400, 'Target user is no longer in this organization');
    const fresh: UserContext = { ...ctx, orgRole: actor.role, roleLevel: getRoleLevel(actor.role), jobLevel: Math.min(actor.job_level ?? actor.role_level ?? 0, 2), teamId: actor.team_id, teamMemberIds: memberships.filter(m => actor.team_id && m.team_id === actor.team_id).map(m => m.user_id) };
    const [account] = await query<AccountSnapshot>('SELECT owner_id,user_id,name FROM public.accounts WHERE id=$1 AND org_id=$2 FOR UPDATE', [input.accountId, ctx.orgId]);
    if (!account) throw new ApiError(404, 'Account not found');
    if (account.owner_id !== expected.owner_id || account.user_id !== expected.user_id) throw new ApiError(409, 'Account ownership changed; reload and retry');
    const sourceOwner = account.owner_id ?? account.user_id;
    if (sourceOwner || input.toUserId !== ctx.userId) requireRole(fresh, 'manager');
    if (sourceOwner) requireOwnership(fresh, sourceOwner);
    const contextPack: Record<string, unknown> = {};
    // Identifiers are fixed in source; all caller-controlled values are parameters.
    for (const [key, table] of [['contacts','contacts'], ['opportunities','opportunities'], ['strategicPlays','strategic_plays'], ['decodeHistory','email_decodes'], ['intelItems','intel_items'], ['activities','activity_logs']] as const) {
      contextPack[key] = await query(`SELECT * FROM public.${table} WHERE account_id=$1 AND org_id=$2`, [input.accountId, ctx.orgId]);
    }
    const rows = await query('UPDATE public.accounts SET owner_id=$3,user_id=$3,ownership_changed_at=now(),ownership_changed_by=$4 WHERE id=$1 AND org_id=$2 AND owner_id IS NOT DISTINCT FROM $5::uuid AND user_id IS NOT DISTINCT FROM $6::uuid RETURNING id', [input.accountId, ctx.orgId, input.toUserId, ctx.userId, expected.owner_id, expected.user_id]);
    if (!rows.length) throw new ApiError(409, 'Account ownership changed; reload and retry');
    await query('UPDATE public.opportunities SET assigned_to=$3,user_id=$3 WHERE account_id=$1 AND org_id=$2', [input.accountId, ctx.orgId, input.toUserId]);
    for (const table of ['contacts', 'meeting_preps', 'intel_items', 'email_decodes', 'strategic_plays'] as const) {
      await query(`UPDATE public.${table} SET user_id=$3 WHERE account_id=$1 AND org_id=$2`, [input.accountId, ctx.orgId, input.toUserId]);
    }
    await query("UPDATE public.tasks SET user_id=$3,assigned_to=$3 WHERE account_id=$1 AND org_id=$2 AND status IS DISTINCT FROM 'done'", [input.accountId, ctx.orgId, input.toUserId]);
    await query('INSERT INTO public.ownership_transfers (org_id,object_type,record_id,from_user,to_user,reason,notes,context_snapshot,transferred_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)', [ctx.orgId, 'account', input.accountId, sourceOwner, input.toUserId, input.reason || (input.toUserId ? 'transfer' : 'reclaim'), input.notes ?? null, JSON.stringify(contextPack), ctx.userId]);
    await query('INSERT INTO public.audit_log (org_id,user_id,action,object_type,record_id,record_name,changes) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [ctx.orgId, ctx.userId, input.toUserId ? 'transfer' : 'reclaim', 'account', input.accountId, account.name, JSON.stringify({ owner_id: { old: account.owner_id, new: input.toUserId }, notes: input.notes ?? null, context_fields: Object.keys(contextPack) })]);
    return contextPack;
  });
}
