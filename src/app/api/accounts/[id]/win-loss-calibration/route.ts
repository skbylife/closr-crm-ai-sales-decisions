import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { validateAccountScopedSourcePointers } from '@/lib/judgment/source-pointer-access';
import {
  buildWinLossCalibrationSourceRecord,
  normalizeWinLossCalibrationSourceRow,
  parseWinLossCalibration,
} from '@/lib/judgment/win-loss-calibration';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;

type OpportunityScopeRow = {
  id?: string | null;
  account_id?: string | null;
  org_id?: string | null;
};

type CalibrationSourceRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

function parseLimit(value: string | null): number {
  const limit = Number(value ?? 20);
  return Number.isFinite(limit) ? limit : 20;
}

async function loadOpportunityForScope(admin: AdminClient, params: { orgId: string; opportunityId: string }): Promise<OpportunityScopeRow | null> {
  const { data, error } = await admin
    .from('opportunities')
    .select('id, account_id, org_id')
    .eq('org_id', params.orgId)
    .eq('id', params.opportunityId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as OpportunityScopeRow | null;
}

async function loadWinLossCalibrations(admin: AdminClient, params: { accountId: string; orgId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
  const { data, error } = await admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .eq('account_id', params.accountId)
    .eq('source_kind', 'win_loss_calibration')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isSourceRecordsUnavailable(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as CalibrationSourceRow[])
    .map((row) => normalizeWinLossCalibrationSourceRow(row))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));

    const winLossCalibrations = await loadWinLossCalibrations(admin, { accountId: id, orgId: ctx.orgId, limit });
    return Response.json({ winLossCalibrations });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();
    const calibrationId = crypto.randomUUID();

    const parsed = parseWinLossCalibration(body, {
      id: calibrationId,
      accountId: id,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      createdAt: now,
    });

    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    if (parsed.calibration.opportunityId) {
      const opportunity = await loadOpportunityForScope(admin, {
        orgId: ctx.orgId,
        opportunityId: parsed.calibration.opportunityId,
      });
      if (!opportunity) {
        return Response.json({ error: 'opportunity 不存在或不属于当前组织' }, { status: 404 });
      }
      if (opportunity.account_id !== id || opportunity.org_id !== ctx.orgId) {
        return Response.json({ error: 'opportunity 不属于当前 account/org，已拒绝写入' }, { status: 400 });
      }
    }

    const sourcePointerError = await validateAccountScopedSourcePointers(admin, {
      orgId: ctx.orgId,
      accountId: id,
      refs: parsed.calibration.evidenceRefs,
    });
    if (sourcePointerError) {
      return Response.json({ error: sourcePointerError }, { status: 400 });
    }

    const row = buildWinLossCalibrationSourceRecord({
      orgId: ctx.orgId,
      calibration: parsed.calibration,
    });

    const { error } = await admin
      .from('source_records')
      .insert(row);

    if (error) {
      if (isSourceRecordsUnavailable(error)) {
        return Response.json({ error: 'source_records 不可用，无法保存 Win/Loss 校准' }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({
      ok: true,
      calibration: parsed.calibration,
      message: '成交/丢单后的判断校准已记录为当前账户样本。',
    }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}
