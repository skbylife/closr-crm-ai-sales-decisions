import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountTeamLightConfig, accountVisibilityText } from './account-team-light-config';
import type { Account, OrgMember } from '@/lib/babel-engine/types';

const account: Account = {
  id: 'acc_1',
  userId: 'user_1',
  ownerId: 'user_1',
  businessTeamId: 'team_1',
  name: '测试客户',
  contacts: [],
  opportunityIds: [],
};

const members: OrgMember[] = [{
  id: 'membership_1',
  userId: 'user_1',
  orgId: 'org_1',
  role: 'member',
  displayName: '张明远',
  email: 'zhang@example.com',
  joinedAt: '2026-05-14T00:00:00.000Z',
}];

describe('AccountTeamLightConfig', () => {
  it('renders the lightweight Chinese team fields and detailed-config entry', () => {
    const html = renderToStaticMarkup(React.createElement(AccountTeamLightConfig, {
      account,
      orgMembers: members,
      canAssignOwner: true,
      effectiveOwnerId: 'user_1',
      ownerName: '张明远',
      onChangeOwner: () => undefined,
    }));

    expect(html).toContain('团队与负责人');
    expect(html).toContain('管理团队归属');
    expect(html).toContain('客户负责人');
    expect(html).toContain('项目推进组');
    expect(html).toContain('可见性范围');
    expect(html).toContain('打开团队详细配置');
    expect(html).toContain('轻量配置归属与负责人');
    expect(html).toContain('创建项目推进组');
    expect(html).toContain('由角色权限决定，此处不单独修改');
    expect(html).toContain('/accounts/acc_1?tab=team');
    expect(html).not.toContain('#account-team-intelligence');
  });

  it('describes visibility without exposing a fake editable permission model', () => {
    expect(accountVisibilityText('user_1')).toContain('跟随客户负责人');
    expect(accountVisibilityText(null)).toContain('公海客户');
  });
});
