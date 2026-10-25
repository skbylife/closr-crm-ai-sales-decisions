import { createClient } from '@/lib/supabase/server';
import { ApiError, requireAuth, requireAdmin, requireOwnership, guardResponse } from '@/lib/api-guard';

export async function GET() {
  try {
    const ctx = await requireAuth();
    // A pool account has neither an explicit owner nor a legacy creator-owner.
    // Never expose assigned accounts merely because owner_id is null.
    const { data, error } = await requireAdmin().from('accounts')
      .select('id,name,industry,last_activity_at,last_activity')
      .eq('org_id', ctx.orgId).is('owner_id', null).is('user_id', null).order('name');
    if (error) throw new ApiError(500, 'Unable to load unassigned accounts');
    const accounts = data ?? [];
    if (!accounts.length) return Response.json({ accounts: [], userId: ctx.userId });
    // Use the request-scoped client: counts must respect child-record RLS too.
    const db = await createClient();
    const ids = accounts.map(account => account.id);
    const [contacts, opportunities] = await Promise.all([
      db.from('contacts').select('id,account_id').eq('org_id', ctx.orgId).in('account_id', ids),
      db.from('opportunities').select('id,account_id,value,currency').eq('org_id', ctx.orgId).in('account_id', ids),
    ]);
    if (contacts.error || opportunities.error) throw new ApiError(500, 'Unable to load pool summary');
    // Same history permission as GET /api/accounts/transfer for unowned accounts.
    let historyVisible = true;
    try { requireOwnership(ctx, ''); } catch (error) {
      if (error instanceof ApiError && error.status === 403) historyVisible = false; else throw error;
    }
    const history = historyVisible ? await requireAdmin().from('ownership_transfers')
      .select('record_id,from_user,to_user,reason,created_at').eq('org_id', ctx.orgId)
      .eq('object_type', 'account').in('record_id', ids).order('created_at', { ascending: false }) : null;
    if (history?.error) throw new ApiError(500, 'Unable to load pool history');
    const previousIds = [...new Set((history?.data ?? []).map(row => row.from_user).filter(Boolean))];
    const members = previousIds.length ? await requireAdmin().from('org_memberships')
      .select('user_id,display_name').eq('org_id', ctx.orgId).in('user_id', previousIds) : null;
    if (members?.error) throw new ApiError(500, 'Unable to load previous owner names');
    return Response.json({ accounts: accounts.map(account => {
      const related = (opportunities.data ?? []).filter(row => row.account_id === account.id);
      const totals: Record<string, number> = {};
      let unvalued = 0;
      for (const row of related) {
        if (row.value == null || !Number.isFinite(Number(row.value)) || typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)) { unvalued++; continue; }
        totals[row.currency] = (totals[row.currency] ?? 0) + Number(row.value);
      }
      const latest = (history?.data ?? []).find(row => row.record_id === account.id);
      // Only a latest reclaim (to_user=null) explains a currently unowned record.
      const reclaim = latest?.to_user === null ? latest : null;
      return { ...account,
        contact_count: (contacts.data ?? []).filter(row => row.account_id === account.id).length,
        opportunity_count: related.length, opportunity_totals: totals, unvalued_opportunities: unvalued,
        history_visible: historyVisible,
        previous_owner: reclaim ? members?.data?.find(row => row.user_id === reclaim.from_user)?.display_name ?? null : null,
        reclaim_reason: reclaim?.reason ?? null,
      };
    }), userId: ctx.userId });
  } catch (error) { return guardResponse(error); }
}
