import { ApiError, requireAuth, requireAccountAccess, requireOpportunityAccess, guardResponse } from '@/lib/api-guard';
import { createClient } from '@/lib/supabase/server';

const statuses = new Set(['draft', 'sent', 'accepted', 'rejected', 'expired']);
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new ApiError(500, 'Database operation failed');
  return result.data;
}
function text(value: unknown, required = false) {
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) throw new ApiError(400, 'Invalid text field');
  return value.trim();
}
export async function GET() {
  try {
    const ctx = await requireAuth(); const db = await createClient();
    const [products, quotes, accounts, opportunities] = await Promise.all([
      db.from('products').select('*').eq('org_id', ctx.orgId).order('created_at', { ascending: false }),
      db.from('quotes').select('*').eq('org_id', ctx.orgId).order('created_at', { ascending: false }),
      db.from('accounts').select('id,name').eq('org_id', ctx.orgId).order('name'),
      db.from('opportunities').select('id,name,account_id').eq('org_id', ctx.orgId).order('name'),
    ]);
    const visibleQuotes = [];
    for (const quote of checked(quotes) ?? []) {
      try {
        if (quote.account_id) await requireAccountAccess(ctx, quote.account_id);
        if (quote.opportunity_id) await requireOpportunityAccess(ctx, quote.opportunity_id);
        visibleQuotes.push(quote);
      } catch (error) { if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error; }
    }
    return Response.json({ products: checked(products), quotes: visibleQuotes, accounts: checked(accounts), opportunities: checked(opportunities) });
  } catch (error) { return guardResponse(error); }
}
async function mutate(request: Request, operation: 'create' | 'update' | 'delete') {
  try {
    const ctx = await requireAuth(); const db = await createClient();
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Invalid request body');
    if (!['product', 'quote'].includes(body.kind)) throw new ApiError(400, 'Invalid record type');
    const table = body.kind === 'product' ? 'products' : 'quotes';
    const id = operation !== 'create' ? text(body.id, true) : undefined;
    if (id) {
      const record = checked(await db.from(table).select('*').eq('id', id).eq('org_id', ctx.orgId).maybeSingle());
      if (!record) throw new ApiError(404, 'Record not found');
      if (table === 'quotes') {
        if (record.account_id) await requireAccountAccess(ctx, record.account_id);
        if (record.opportunity_id) await requireOpportunityAccess(ctx, record.opportunity_id);
      }
    }
    if (operation === 'delete') {
      const rows = checked(await db.from(table).delete().eq('id', id).eq('org_id', ctx.orgId).select('id'));
      if (!rows?.length) throw new ApiError(409, 'Record changed; reload and retry');
      return Response.json({ success: true });
    }
    let values: Record<string, unknown>;
    if (table === 'products') {
      if (typeof body.unit_price !== 'number' || !Number.isFinite(body.unit_price) || body.unit_price < 0) throw new ApiError(400, 'Invalid price');
      if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) throw new ApiError(400, 'Invalid currency');
      if (body.is_active !== undefined && typeof body.is_active !== 'boolean') throw new ApiError(400, 'Invalid product status');
      values = { name: text(body.name, true), sku: text(body.sku ?? ''), description: text(body.description ?? ''), category: text(body.category ?? ''), unit_price: body.unit_price, currency: body.currency, ...(body.is_active !== undefined ? { is_active: body.is_active } : operation === 'create' ? { is_active: true } : {}), updated_at: new Date().toISOString() };
    } else if (operation === 'update') {
      if (!statuses.has(body.status)) throw new ApiError(400, 'Invalid quote status');
      values = { status: body.status, updated_at: new Date().toISOString() };
    } else {
      const accountId = text(body.account_id, true); const opportunityId = text(body.opportunity_id, true);
      await requireAccountAccess(ctx, accountId);
      const opportunity = await requireOpportunityAccess(ctx, opportunityId);
      if (opportunity.account_id !== accountId) throw new ApiError(400, 'Opportunity does not belong to this account');
      if (!Number.isInteger(body.valid_days) || body.valid_days < 1 || body.valid_days > 3650) throw new ApiError(400, 'Invalid validity period');
      values = { account_id: accountId, opportunity_id: opportunityId, quote_number: `QT-${crypto.randomUUID()}`, status: 'draft', valid_until: new Date(Date.now() + body.valid_days * 86400000).toISOString().slice(0, 10), created_by: ctx.userId, total: 0, subtotal: 0 };
    }
    const result = operation === 'create'
      ? await db.from(table).insert({ ...values, org_id: ctx.orgId }).select('*').single()
      : await db.from(table).update(values).eq('id', id).eq('org_id', ctx.orgId).select('*').single();
    return Response.json({ record: checked(result) });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    return guardResponse(error);
  }
}
export const POST = (request: Request) => mutate(request, 'create');
export const PATCH = (request: Request) => mutate(request, 'update');
export const DELETE = (request: Request) => mutate(request, 'delete');
