import { mapPursuitTeamMember, mapResponsibility } from './mappers';
import type {
  AccountTeamAdminClient,
  PursuitTeamMemberResponsibilityRow,
  PursuitTeamMemberRow,
  ResponsibilityCatalogRow,
} from './types';

export async function loadPursuitTeamMembers(admin: AccountTeamAdminClient, params: { orgId: string; pursuitTeamId: string }) {
  const { data: members, error: membersError } = await admin
    .from('pursuit_team_members')
    .select('id, org_id, pursuit_team_id, user_id, is_lead, coverage_note, created_at, updated_at')
    .eq('org_id', params.orgId)
    .eq('pursuit_team_id', params.pursuitTeamId)
    .order('created_at', { ascending: true });
  if (membersError) throw new Error(membersError.message);

  const memberRows = (members ?? []) as PursuitTeamMemberRow[];
  if (memberRows.length === 0) return [];

  const memberIds = memberRows.map((member) => member.id);
  const { data: links, error: linksError } = await admin
    .from('pursuit_team_member_responsibilities')
    .select('id, org_id, pursuit_team_member_id, responsibility_id')
    .eq('org_id', params.orgId)
    .in('pursuit_team_member_id', memberIds);
  if (linksError) throw new Error(linksError.message);

  const linkRows = (links ?? []) as PursuitTeamMemberResponsibilityRow[];
  const responsibilityIds = [...new Set(linkRows.map((link) => link.responsibility_id))];
  let responsibilities: ResponsibilityCatalogRow[] = [];
  if (responsibilityIds.length > 0) {
    const { data, error } = await admin
      .from('responsibility_catalog')
      .select('id, org_id, key, label, description, category, is_system, created_by, created_at')
      .in('id', responsibilityIds);
    if (error) throw new Error(error.message);
    responsibilities = ((data ?? []) as ResponsibilityCatalogRow[]).filter((row) => row.is_system || row.org_id === params.orgId);
  }

  const responsibilitiesById = new Map(responsibilities.map((row) => [row.id, mapResponsibility(row)]));
  const linkIdsByMember = new Map<string, string[]>();
  for (const link of linkRows) {
    if (!responsibilitiesById.has(link.responsibility_id)) continue;
    const ids = linkIdsByMember.get(link.pursuit_team_member_id) ?? [];
    ids.push(link.responsibility_id);
    linkIdsByMember.set(link.pursuit_team_member_id, ids);
  }

  return memberRows.map((member) => {
    const ids = linkIdsByMember.get(member.id) ?? [];
    return mapPursuitTeamMember(
      member,
      ids,
      ids.map((id) => responsibilitiesById.get(id)).filter((value): value is NonNullable<typeof value> => Boolean(value)),
    );
  });
}
