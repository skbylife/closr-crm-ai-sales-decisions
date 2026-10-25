import { createClient } from '@/lib/supabase/server';
import { ApiError, requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';

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
      db.from('opportunities').select('id,account_id').eq('org_id', ctx.orgId).in('account_id', ids),
    ]);
    if (contacts.error || opportunities.error) throw new ApiError(500, 'Unable to load pool summary');
    return Response.json({ accounts: accounts.map(account => ({ ...account,
      contact_count: (contacts.data ?? []).filter(row => row.account_id === account.id).length,
      opportunity_count: (opportunities.data ?? []).filter(row => row.account_id === account.id).length,
    })), userId: ctx.userId });
  } catch (error) { return guardResponse(error); }
}
