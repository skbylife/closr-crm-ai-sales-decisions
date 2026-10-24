import type { OrgMember } from '@/lib/babel-engine/types';
import { DEMO_USER_ID } from '@/lib/demo';

function memberEmail(member: OrgMember): string {
  return (member.email ?? '').toLowerCase();
}

function memberDisplayName(member: OrgMember): string {
  return (member.displayName ?? '').trim();
}

function isSalesManagementDemoMember(member: OrgMember): boolean {
  const displayName = memberDisplayName(member);
  const jobTitle = (member.jobTitle ?? '').toLowerCase();
  const isSalesRole = ['director', 'ae'].includes(jobTitle);
  return isSalesRole && (
    memberEmail(member).startsWith('demo-ae-')
    || ['林岚', '周晨', '许洁'].includes(displayName)
  );
}

function sortByStableDemoOrder(a: OrgMember, b: OrgMember): number {
  const emailOrder = ['example-928f198c8a@example.invalid', 'example-e4ed3a4b68@example.invalid', 'example-9bebd39988@example.invalid'];
  const displayNameOrder = ['林岚', '周晨', '许洁'];
  const aIndex = emailOrder.indexOf(memberEmail(a));
  const bIndex = emailOrder.indexOf(memberEmail(b));
  if (aIndex !== bIndex) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  const aNameIndex = displayNameOrder.indexOf(memberDisplayName(a));
  const bNameIndex = displayNameOrder.indexOf(memberDisplayName(b));
  if (aNameIndex !== bNameIndex) return (aNameIndex === -1 ? 99 : aNameIndex) - (bNameIndex === -1 ? 99 : bNameIndex);
  return (a.displayName ?? a.email ?? a.userId).localeCompare(b.displayName ?? b.email ?? b.userId);
}

export function getDemoRoleVisibleUserIds(params: {
  isDemo: boolean;
  currentUserId?: string | null;
  jobLevel: number;
  orgMembers: OrgMember[];
}): string[] | null {
  const { isDemo, currentUserId, jobLevel, orgMembers } = params;
  if (!isDemo || currentUserId !== DEMO_USER_ID) return null;
  if (jobLevel >= 2) return null;

  const salesMembers = orgMembers.filter(isSalesManagementDemoMember).sort(sortByStableDemoOrder);
  if (salesMembers.length === 0) return null;

  if (jobLevel >= 1) {
    return salesMembers.map((member) => member.userId);
  }

  const aeMembers = salesMembers.filter((member) => (member.jobLevel ?? 0) === 0);
  const primaryAe = aeMembers.find((member) => memberEmail(member) === 'example-e4ed3a4b68@example.invalid' || memberDisplayName(member) === '周晨') ?? aeMembers[0] ?? salesMembers[0];
  return [primaryAe.userId];
}
