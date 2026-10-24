import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildAccountBasicsUpdate } from './account-basics-form';
import { AccountBasicsPanel } from './overview-tab';
import type { Account } from '@/lib/babel-engine/types';

const account: Account = {
  id: 'acc_1',
  userId: 'creator_1',
  ownerId: 'owner_1',
  businessTeamId: 'team_1',
  name: '原客户',
  industry: '零售',
  contacts: [],
  opportunityIds: [],
};

describe('buildAccountBasicsUpdate', () => {
  it('keeps the existing basic save payload away from owner and team fields', () => {
    const update = buildAccountBasicsUpdate(account, {
      name: ' 新客户 ',
      industry: ' 制造 ',
      website: ' https://example.com ',
      notes: ' 备注 ',
      dealStage: 'proposal_sent',
      dealValue: '2000000',
      dealHealth: 'healthy',
    });

    expect(update).toEqual({
      name: '新客户',
      industry: '制造',
      website: 'https://example.com',
      notes: '备注',
      dealStage: 'proposal_sent',
      dealValue: 2000000,
      dealHealth: 'healthy',
    });
    expect(update).not.toHaveProperty('ownerId');
    expect(update).not.toHaveProperty('userId');
    expect(update).not.toHaveProperty('businessTeamId');
  });
});


describe('AccountBasicsPanel edit rendering', () => {
  it('does not render editable fields before edit mode is enabled', () => {
    const html = renderToStaticMarkup(React.createElement(AccountBasicsPanel, {
      account,
      isEditing: false,
      onEditDone: () => undefined,
    }));

    expect(html).toBe('');
  });

  it('renders an editable account basics form with working save/cancel controls in edit mode', () => {
    const html = renderToStaticMarkup(React.createElement(AccountBasicsPanel, {
      account,
      isEditing: true,
      onEditDone: () => undefined,
      onTransfer: () => undefined,
      onReclaim: () => undefined,
    }));

    expect(html).toContain('account-basics-edit-form');
    expect(html).toContain('编辑基本信息');
    expect(html).toContain('公司名称');
    expect(html).toContain('行业');
    expect(html).toContain('备注');
    expect(html).toContain('取消');
    expect(html).toContain('保存');
    expect(html).toContain('团队与负责人');
  });
});
