import type { ContactRole } from '@/lib/babel-engine/types';

export type ExternalAdvisorRole = 'external_advisor' | 'consultant' | 'channel_influencer';

export const EXTERNAL_ADVISOR_ROLES = new Set<ContactRole>([
  'external_advisor',
  'consultant',
  'channel_influencer',
]);

export const EXTERNAL_ADVISOR_ROLE_LABELS: Record<ExternalAdvisorRole, string> = {
  external_advisor: '外部顾问',
  consultant: '咨询顾问',
  channel_influencer: '渠道影响者',
};

export function isExternalAdvisorRole(role: string | null | undefined): role is ExternalAdvisorRole {
  return Boolean(role && EXTERNAL_ADVISOR_ROLES.has(role as ContactRole));
}

export function externalAdvisorRoleLabel(role: string | null | undefined): string {
  if (isExternalAdvisorRole(role)) return EXTERNAL_ADVISOR_ROLE_LABELS[role];
  return '外部影响者';
}
