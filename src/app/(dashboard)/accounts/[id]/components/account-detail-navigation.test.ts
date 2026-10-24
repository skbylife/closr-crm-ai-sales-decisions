import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_DETAIL_TAB_ITEMS,
  getAccountTeamDetailHref,
  getNextAccountEditIntent,
  isAccountDetailTabKey,
} from './account-detail-navigation';

describe('account detail navigation', () => {
  it('exposes team as a first-level account detail tab', () => {
    expect(ACCOUNT_DETAIL_TAB_ITEMS.map((tab) => tab.key)).toContain('team');
    expect(ACCOUNT_DETAIL_TAB_ITEMS.find((tab) => tab.key === 'team')?.label).toBe('团队');
    expect(isAccountDetailTabKey('team')).toBe(true);
  });

  it('links detailed team configuration to the team tab', () => {
    expect(getAccountTeamDetailHref('acc_1')).toBe('/accounts/acc_1?tab=team');
  });

  it('opens the editable overview form when edit is clicked from another tab', () => {
    expect(getNextAccountEditIntent('team', false)).toEqual({
      nextTab: 'overview',
      nextEditing: true,
    });
    expect(getNextAccountEditIntent('overview', true)).toEqual({
      nextTab: 'overview',
      nextEditing: false,
    });
  });
});
