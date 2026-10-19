import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/permissions';
import { requireAccountAccess, requireOpportunityAccess, requireContactAccess } from '@/lib/api-guard';
export async function communitySession() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const ctx = await getUserContext(user.id, { fresh: true });
  if (!ctx) return null;
  return {
    principal: { subject: ctx.userId, orgId: ctx.orgId },
    canAccess: async (_principal: unknown, accountId: string, opportunityId?: string) => {
      try {
        await requireAccountAccess(ctx, accountId);
        if (opportunityId && (await requireOpportunityAccess(ctx, opportunityId)).account_id !== accountId) return false;
        return true;
      } catch { return false; }
    },
    canAccessContact: async (accountId: string, contactId: string) => {
      try { return (await requireContactAccess(ctx, contactId)).account_id === accountId; }
      catch { return false; }
    },
    getAccessToken: async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || session?.user.id !== user.id || !session.access_token) throw new Error('unauthorized');
      return session.access_token;
    },
  };
}
