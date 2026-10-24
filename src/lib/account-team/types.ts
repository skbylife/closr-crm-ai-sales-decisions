import type { requireAdmin, requireAuth } from '@/lib/api-guard';

export type AccountTeamAuthContext = Awaited<ReturnType<typeof requireAuth>>;
export type AccountTeamAdminClient = ReturnType<typeof requireAdmin>;

export type BusinessTeamRow = {
  id: string;
  org_id: string;
  name: string;
  created_at?: string | null;
};

export type AccountBusinessTeamRow = {
  id: string;
  org_id: string;
  business_team_id: string | null;
};

export type PursuitTeamRow = {
  id: string;
  org_id: string;
  parent_team_id: string | null;
  account_id: string;
  opportunity_id: string | null;
  strategic_play_id: string | null;
  name: string;
  status: 'active' | 'paused' | 'closed' | 'archived';
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ResponsibilityCatalogRow = {
  id: string;
  org_id: string | null;
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  is_system: boolean;
  created_by: string | null;
  created_at: string | null;
};

export type PursuitTeamMemberRow = {
  id: string;
  org_id: string;
  pursuit_team_id: string;
  user_id: string;
  is_lead: boolean;
  coverage_note: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PursuitTeamMemberResponsibilityRow = {
  id: string;
  org_id: string;
  pursuit_team_member_id: string;
  responsibility_id: string;
};
