import { describe, expect, it } from 'vitest';
import type { OrgMember } from '@/lib/babel-engine/types';
import { DEMO_USER_ID } from '@/lib/demo';
import { getDemoRoleVisibleUserIds } from './demo-role-visibility';

const members = [
  { userId: 'main_demo', email: 'example-c39293aa15@example.invalid', displayName: 'Demo', jobLevel: 2 },
  { userId: 'linlan', email: 'example-928f198c8a@example.invalid', displayName: '林岚', jobTitle: 'director', jobLevel: 1 },
  { userId: 'zhouchen', email: 'example-e4ed3a4b68@example.invalid', displayName: '周晨', jobTitle: 'ae', jobLevel: 0 },
  { userId: 'xujie', email: 'example-9bebd39988@example.invalid', displayName: '许洁', jobTitle: 'ae', jobLevel: 0 },
  { userId: 'rel', email: 'example-88a6db5c06@example.invalid', displayName: '林岚', jobTitle: 'ka_lead', jobLevel: 1 },
] as OrgMember[];

describe('getDemoRoleVisibleUserIds', () => {
  it('does not alter non-demo users or executive demo visibility', () => {
    expect(getDemoRoleVisibleUserIds({ isDemo: false, currentUserId: DEMO_USER_ID, jobLevel: 0, orgMembers: members })).toBeNull();
    expect(getDemoRoleVisibleUserIds({ isDemo: true, currentUserId: 'other', jobLevel: 0, orgMembers: members })).toBeNull();
    expect(getDemoRoleVisibleUserIds({ isDemo: true, currentUserId: DEMO_USER_ID, jobLevel: 2, orgMembers: members })).toBeNull();
  });

  it('maps the sales representative demo view to the primary AE sample owner', () => {
    expect(getDemoRoleVisibleUserIds({ isDemo: true, currentUserId: DEMO_USER_ID, jobLevel: 0, orgMembers: members })).toEqual(['zhouchen']);
  });

  it('maps the sales manager demo view to all sales-management demo owners', () => {
    expect(getDemoRoleVisibleUserIds({ isDemo: true, currentUserId: DEMO_USER_ID, jobLevel: 1, orgMembers: members })).toEqual(['linlan', 'zhouchen', 'xujie']);
  });

  it('does not depend on email hydration for the standard demo role switcher', () => {
    const membersWithoutEmails = members.map((member) => ({ ...member, email: undefined })) as OrgMember[];

    expect(getDemoRoleVisibleUserIds({ isDemo: true, currentUserId: DEMO_USER_ID, jobLevel: 0, orgMembers: membersWithoutEmails })).toEqual(['zhouchen']);
    expect(getDemoRoleVisibleUserIds({ isDemo: true, currentUserId: DEMO_USER_ID, jobLevel: 1, orgMembers: membersWithoutEmails })).toEqual(['linlan', 'zhouchen', 'xujie']);
  });
});
