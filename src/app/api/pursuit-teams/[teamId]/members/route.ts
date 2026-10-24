import { ApiError, guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import { recordComplianceAudit } from '@/lib/compliance-audit';
import {
  rejectClientOrgId,
  requirePursuitTeamAccess,
  validateOrgMemberIds,
  validateResponsibilityIds,
} from '@/lib/account-team/access';
import { loadPursuitTeamMembers } from '@/lib/account-team/loaders';
import type { PursuitTeamMemberRow } from '@/lib/account-team/types';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;

type MemberBody = {
  memberId?: unknown;
  userId?: unknown;
  isLead?: unknown;
  coverageNote?: unknown;
  responsibilityIds?: unknown;
};

function parseString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new ApiError(400, `${field} 必须是非空字符串`);
  return value;
}

function parseOptionalStringOrNull(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new ApiError(400, `${field} 必须是 string 或 null`);
  return value;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ApiError(400, `${field} 必须是 boolean`);
  return value;
}

function parseResponsibilityIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new ApiError(400, 'responsibilityIds 必须是 string[]');
  }
  return [...new Set(value as string[])];
}

async function loadMember(admin: AdminClient, params: { orgId: string; teamId: string; memberId?: string; userId?: string }) {
  let query = admin
    .from('pursuit_team_members')
    .select('id, org_id, pursuit_team_id, user_id, is_lead, coverage_note, created_at, updated_at')
    .eq('org_id', params.orgId)
    .eq('pursuit_team_id', params.teamId);
  if (params.memberId) query = query.eq('id', params.memberId);
  if (params.userId) query = query.eq('user_id', params.userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as PursuitTeamMemberRow | null;
}

async function replaceResponsibilities(admin: AdminClient, params: { orgId: string; memberId: string; responsibilityIds: string[] }) {
  const { data, error } = await admin
    .from('pursuit_team_member_responsibilities')
    .select('responsibility_id')
    .eq('org_id', params.orgId)
    .eq('pursuit_team_member_id', params.memberId);
  if (error) throw new Error(error.message);

  const existing = new Set((data ?? []).map((row: { responsibility_id: string }) => row.responsibility_id));
  const next = new Set(params.responsibilityIds);
  const toInsert = params.responsibilityIds.filter((id) => !existing.has(id));
  const toDelete = [...existing].filter((id) => !next.has(id));

  if (toInsert.length > 0) {
    const { error: insertError } = await admin
      .from('pursuit_team_member_responsibilities')
      .insert(toInsert.map((responsibilityId) => ({
        org_id: params.orgId,
        pursuit_team_member_id: params.memberId,
        responsibility_id: responsibilityId,
      })));
    if (insertError) throw new Error(insertError.message);
  }

  if (toDelete.length > 0) {
    const { error: deleteError } = await admin
      .from('pursuit_team_member_responsibilities')
      .delete()
      .eq('org_id', params.orgId)
      .eq('pursuit_team_member_id', params.memberId)
      .in('responsibility_id', toDelete);
    if (deleteError) throw new Error(deleteError.message);
  }
}

async function loadMembersResponse(admin: AdminClient, orgId: string, pursuitTeamId: string) {
  const members = await loadPursuitTeamMembers(admin, { orgId, pursuitTeamId });
  return Response.json({ members });
}

export async function GET(_request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { teamId } = await params;
    await requirePursuitTeamAccess(ctx, teamId);
    const admin = requireAdmin();
    return await loadMembersResponse(admin, ctx.orgId, teamId);
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  let createdMemberId: string | null = null;
  try {
    const ctx = await requireAuth();
    const { teamId } = await params;
    await requirePursuitTeamAccess(ctx, teamId);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    rejectClientOrgId(body);

    const input = body as MemberBody;
    const userId = parseString(input.userId, 'userId');
    const isLead = parseOptionalBoolean(input.isLead, 'isLead') ?? false;
    const coverageNote = parseOptionalStringOrNull(input.coverageNote, 'coverageNote') ?? null;
    const responsibilityIds = parseResponsibilityIds(input.responsibilityIds) ?? [];

    await validateOrgMemberIds(admin, ctx, [userId]);
    await validateResponsibilityIds(admin, ctx, responsibilityIds);

    if (isLead) {
      const { error } = await admin
        .from('pursuit_team_members')
        .update({ is_lead: false })
        .eq('org_id', ctx.orgId)
        .eq('pursuit_team_id', teamId);
      if (error) throw new Error(error.message);
    }

    const { data, error } = await admin
      .from('pursuit_team_members')
      .insert({ org_id: ctx.orgId, pursuit_team_id: teamId, user_id: userId, is_lead: isLead, coverage_note: coverageNote })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    createdMemberId = (data as { id: string }).id;

    try {
      await replaceResponsibilities(admin, { orgId: ctx.orgId, memberId: createdMemberId, responsibilityIds });
    } catch (err) {
      await admin.from('pursuit_team_members').delete().eq('id', createdMemberId).eq('org_id', ctx.orgId);
      throw err;
    }

    const members = await loadPursuitTeamMembers(admin, { orgId: ctx.orgId, pursuitTeamId: teamId });
    return Response.json({ members }, { status: 201 });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const ctx = await requireAuth();
    const { teamId } = await params;
    await requirePursuitTeamAccess(ctx, teamId);
    const admin = requireAdmin();
    const body = await request.json().catch(() => ({}));
    rejectClientOrgId(body);

    const input = body as MemberBody;
    const memberId = input.memberId === undefined ? undefined : parseString(input.memberId, 'memberId');
    const userId = input.userId === undefined ? undefined : parseString(input.userId, 'userId');
    if (!memberId && !userId) return Response.json({ error: '需要 memberId 或 userId' }, { status: 400 });

    const isLead = parseOptionalBoolean(input.isLead, 'isLead');
    const coverageNote = parseOptionalStringOrNull(input.coverageNote, 'coverageNote');
    const responsibilityIds = parseResponsibilityIds(input.responsibilityIds);
    if (isLead === undefined && coverageNote === undefined && responsibilityIds === undefined) {
      return Response.json({ error: '没有可更新字段' }, { status: 400 });
    }

    const member = await loadMember(admin, { orgId: ctx.orgId, teamId, memberId, userId });
    if (!member) throw new ApiError(404, '项目推进组成员不存在');
    if (responsibilityIds) await validateResponsibilityIds(admin, ctx, responsibilityIds);

    if (isLead === true) {
      const { error } = await admin
        .from('pursuit_team_members')
        .update({ is_lead: false })
        .eq('org_id', ctx.orgId)
        .eq('pursuit_team_id', teamId)
        .neq('id', member.id);
      if (error) throw new Error(error.message);
    }

    const update: Record<string, string | boolean | null> = {};
    if (isLead !== undefined) update.is_lead = isLead;
    if (coverageNote !== undefined) update.coverage_note = coverageNote;
    if (Object.keys(update).length > 0) {
      const { error } = await admin
        .from('pursuit_team_members')
        .update(update)
        .eq('id', member.id)
        .eq('org_id', ctx.orgId)
        .eq('pursuit_team_id', teamId);
      if (error) throw new Error(error.message);
    }

    if (responsibilityIds) {
      await replaceResponsibilities(admin, { orgId: ctx.orgId, memberId: member.id, responsibilityIds });
    }

    const members = await loadPursuitTeamMembers(admin, { orgId: ctx.orgId, pursuitTeamId: teamId });
    return Response.json({ members });
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
    const body = await request.json().catch(() => ({}));
    rejectClientOrgId(body);

    const input = body as MemberBody;
    const memberId = input.memberId === undefined ? undefined : parseString(input.memberId, 'memberId');
    const userId = input.userId === undefined ? undefined : parseString(input.userId, 'userId');
    if (!memberId && !userId) return Response.json({ error: '需要 memberId 或 userId' }, { status: 400 });

    const member = await loadMember(admin, { orgId: ctx.orgId, teamId, memberId, userId });
    if (!member) throw new ApiError(404, '项目推进组成员不存在');

    const { error } = await admin
      .from('pursuit_team_members')
      .delete()
      .eq('id', member.id)
      .eq('org_id', ctx.orgId)
      .eq('pursuit_team_id', teamId);
    if (error) throw new Error(error.message);

    await recordComplianceAudit({
      admin,
      ctx,
      action: 'pursuit_team_member_deleted',
      objectType: 'pursuit_team_member',
      recordId: member.id,
      recordName: member.user_id ?? member.id,
      request,
      changes: { teamId, memberId: member.id },
    });

    const members = await loadPursuitTeamMembers(admin, { orgId: ctx.orgId, pursuitTeamId: teamId });
    return Response.json({ ok: true, members });
  } catch (err) {
    return guardResponse(err);
  }
}
