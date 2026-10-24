import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { validateAccountScopedSourcePointers } from '@/lib/judgment/source-pointer-access';
import {
  buildInterventionSourceRecord,
  parseJudgmentIntervention,
  type JudgmentInterventionType,
} from '@/lib/judgment/intervention';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;

type OpportunityScopeRow = {
  id?: string | null;
  account_id?: string | null;
  org_id?: string | null;
};

type AuthContext = Awaited<ReturnType<typeof requireAuth>>;

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

function isAdminOrOwner(ctx: AuthContext): boolean {
  return ctx.roleLevel === 'admin' || ctx.orgRole === 'owner' || ctx.orgRole === 'admin';
}

function hasInterventionPermission(ctx: AuthContext, type: JudgmentInterventionType): boolean {
  if (isAdminOrOwner(ctx)) return true;
  const jobLevel = Number(ctx.jobLevel ?? 0);
  if (type === 'executive_intervention') return jobLevel >= 2;
  return jobLevel >= 1;
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    const now = new Date().toISOString();
    const interventionId = crypto.randomUUID();

    const parsed = parseJudgmentIntervention(body, {
      id: interventionId,
      accountId: id,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      createdAt: now,
    });

    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    if (!hasInterventionPermission(ctx, parsed.intervention.type)) {
      return Response.json({ error: '权限不足，无法记录该级别的介入动作' }, { status: 403 });
    }

    if (parsed.intervention.opportunityId) {
      const opportunity = await loadOpportunityForScope(admin, {
        orgId: ctx.orgId,
        opportunityId: parsed.intervention.opportunityId,
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
      refs: parsed.intervention.evidenceRefs,
    });
    if (sourcePointerError) {
      return Response.json({ error: sourcePointerError }, { status: 400 });
    }

    const row = buildInterventionSourceRecord({
      orgId: ctx.orgId,
      intervention: parsed.intervention,
    });

    const { error } = await admin
      .from('source_records')
      .insert(row);

    if (error) {
      if (isSourceRecordsUnavailable(error)) {
        return Response.json({ error: 'source_records 不可用，无法保存介入动作' }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return Response.json({
      ok: true,
      intervention: parsed.intervention,
      message: parsed.intervention.type === 'executive_intervention'
        ? '高层介入已记录到 Judgment Timeline。'
        : '经理介入已记录到 Judgment Timeline。',
    }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}
