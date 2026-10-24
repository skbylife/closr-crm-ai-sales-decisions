import { guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import { rejectClientOrgId, requirePursuitTeamAccess, validateBusinessTeamId } from '@/lib/account-team/access';
import { loadPursuitTeamMembers } from '@/lib/account-team/loaders';
import { mapPursuitTeam } from '@/lib/account-team/mappers';
import type { PursuitTeamRow } from '@/lib/account-team/types';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = new Set(['active', 'paused', 'closed', 'archived']);

export async function PATCH(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { teamId } = await params;
    await requirePursuitTeamAccess(ctx, teamId);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    rejectClientOrgId(body);

    const input = body as { name?: unknown; parentTeamId?: unknown; status?: unknown };
    const update: Record<string, string | null> = {};
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim()) {
        return Response.json({ error: 'name 必须是非空字符串' }, { status: 400 });
      }
      update.name = input.name.trim();
    }
    if (input.parentTeamId !== undefined) {
      if (input.parentTeamId !== null && typeof input.parentTeamId !== 'string') {
        return Response.json({ error: 'parentTeamId 必须是 string 或 null' }, { status: 400 });
      }
      await validateBusinessTeamId(admin, ctx, input.parentTeamId);
      update.parent_team_id = input.parentTeamId;
    }
    if (input.status !== undefined) {
      if (typeof input.status !== 'string' || !STATUS_VALUES.has(input.status)) {
        return Response.json({ error: '无效状态' }, { status: 400 });
      }
      update.status = input.status;
    }
    if (Object.keys(update).length === 0) {
      return Response.json({ error: '没有可更新字段' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('pursuit_teams')
      .update(update)
      .eq('id', teamId)
      .eq('org_id', ctx.orgId)
      .select('id, org_id, parent_team_id, account_id, opportunity_id, strategic_play_id, name, status, created_by, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);

    const members = await loadPursuitTeamMembers(admin, { orgId: ctx.orgId, pursuitTeamId: teamId });
    return Response.json({ pursuitTeam: mapPursuitTeam(data as PursuitTeamRow, members) });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { teamId } = await params;
    await requirePursuitTeamAccess(ctx, teamId);
    const admin = requireAdmin();

    const { data, error } = await admin
      .from('pursuit_teams')
      .update({ status: 'archived' })
      .eq('id', teamId)
      .eq('org_id', ctx.orgId)
      .select('id, org_id, parent_team_id, account_id, opportunity_id, strategic_play_id, name, status, created_by, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'pursuit_team_archived',
      objectType: 'pursuit_team',
      recordId: teamId,
      recordName: (data as PursuitTeamRow).name,
      request,
      changes: { status: 'archived' },
    });

    return Response.json({ ok: true, pursuitTeam: mapPursuitTeam(data as PursuitTeamRow) });
  } catch (err) {
    return guardResponse(err);
  }
}
