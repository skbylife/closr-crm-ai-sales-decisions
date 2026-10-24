import { describe, expect, it } from 'vitest';
import { getAccountTeamSummaryState } from './account-team-summary-strip';

const teams = [{ id: 'team_1', orgId: 'org_1', name: 'KA 团队', memberCount: 3 }];

describe('getAccountTeamSummaryState', () => {
  it('risk-flags missing business team and pursuit team for account header summary', () => {
    expect(getAccountTeamSummaryState({ businessTeamId: null, teams, pursuitTeam: null })).toEqual({
      businessTeamLabel: '未分配团队',
      pursuitTeamLabel: '未创建推进组',
      hasBusinessTeam: false,
      hasPursuitTeam: false,
    });
  });

  it('summarizes configured business team and pursuit team', () => {
    expect(getAccountTeamSummaryState({
      businessTeamId: 'team_1',
      teams,
      pursuitTeam: { id: 'pt_1', orgId: 'org_1', accountId: 'acc_1', name: '华南制造关系推进组', status: 'active', members: [{ id: 'm_1', orgId: 'org_1', pursuitTeamId: 'pt_1', userId: 'user_1', isLead: true, responsibilityIds: [] }] },
    })).toMatchObject({
      businessTeamLabel: 'KA 团队',
      pursuitTeamLabel: '华南制造关系推进组 · 1 人',
      hasBusinessTeam: true,
      hasPursuitTeam: true,
    });
  });
});
