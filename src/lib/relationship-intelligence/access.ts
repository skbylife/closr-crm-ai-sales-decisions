import { ApiError, requireAccountAccess } from '@/lib/api-guard';
import type { AccountRow, RelationshipAdminClient, RelationshipAuthContext } from './types';

export async function requireRelationshipAccountAccess(
  admin: RelationshipAdminClient,
  ctx: RelationshipAuthContext,
  accountId: string,
): Promise<AccountRow> {
  await requireAccountAccess(ctx, accountId);

  const { data, error } = await admin
    .from('accounts')
    .select('id, org_id, name, business_team_id')
    .eq('id', accountId)
    .eq('org_id', ctx.orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new ApiError(404, '客户不存在');
  return data as AccountRow;
}
