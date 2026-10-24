import type {
  BusinessTeamSummary,
  PursuitTeam,
  PursuitTeamMember,
  ResponsibilityCatalogItem,
} from '@/lib/babel-engine/types';
import type { BusinessTeamRow, PursuitTeamMemberRow, PursuitTeamRow, ResponsibilityCatalogRow } from './types';

export function mapBusinessTeam(row: BusinessTeamRow, memberCount?: number): BusinessTeamSummary {
  return {
    id: row.id,
    name: row.name,
    memberCount,
    createdAt: row.created_at ?? undefined,
  };
}

export function mapResponsibility(row: ResponsibilityCatalogRow): ResponsibilityCatalogItem {
  return {
    id: row.id,
    orgId: row.org_id,
    key: row.key,
    label: row.label,
    description: row.description,
    category: row.category,
    isSystem: row.is_system,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function mapPursuitTeamMember(
  row: PursuitTeamMemberRow,
  responsibilityIds: string[] = [],
  responsibilities: ResponsibilityCatalogItem[] = [],
): PursuitTeamMember {
  return {
    id: row.id,
    orgId: row.org_id,
    pursuitTeamId: row.pursuit_team_id,
    userId: row.user_id,
    isLead: row.is_lead,
    coverageNote: row.coverage_note,
    responsibilityIds,
    responsibilities,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPursuitTeam(row: PursuitTeamRow, members?: PursuitTeamMember[]): PursuitTeam {
  return {
    id: row.id,
    orgId: row.org_id,
    parentTeamId: row.parent_team_id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    strategicPlayId: row.strategic_play_id,
    name: row.name,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members,
  };
}
