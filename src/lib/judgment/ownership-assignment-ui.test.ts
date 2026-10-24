import { describe, expect, it } from 'vitest';
import type { PortfolioManagementQueueItem } from '@/lib/judgment/portfolio-view';
import { buildManagementQueueOwnershipAssignmentPayload } from './ownership-assignment-ui';

function queueItem(overrides: Partial<PortfolioManagementQueueItem> = {}): PortfolioManagementQueueItem {
  return {
    id: 'ownership-gap:opp_1',
    queueType: 'ownership_gap',
    accountId: 'acc_1',
    accountName: '某省级零售集团',
    opportunityId: 'opp_1',
    opportunityName: '门店数据平台扩容',
    value: 320000,
    stage: 'negotiation',
    currentJudgment: '机会仍可推进，但判断责任人未明确。',
    whyThisMatters: '高价值机会缺少明确判断责任人，预测和下一步核验容易断层。',
    recommendedAction: '人工选择一个组织成员承接判断核验。',
    evidenceHealth: 'thin',
    ownerSummary: { status: 'gap', responsibility: '需要明确判断责任人' },
    drilldownHref: '/accounts/acc_1?tab=overview',
    rankScore: 91,
    tags: ['ownership-gap', 'thin'],
    ...overrides,
  };
}

describe('buildManagementQueueOwnershipAssignmentPayload', () => {
  it('builds an explicit manual owner assignment for an ownership gap without recommended owner', () => {
    const payload = buildManagementQueueOwnershipAssignmentPayload(queueItem(), ' user_2 ');

    expect(payload).toEqual({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      judgmentType: 'opportunity_forecast',
      assignedUserId: 'user_2',
      source: 'management_queue',
      reason: '高价值机会缺少明确判断责任人，预测和下一步核验容易断层。',
    });
  });

  it('uses account strategy scope when the queue item is account-level', () => {
    const payload = buildManagementQueueOwnershipAssignmentPayload(queueItem({
      id: 'ownership-gap:acc_1',
      opportunityId: undefined,
      opportunityName: undefined,
    }), 'user_3');

    expect(payload).toMatchObject({
      accountId: 'acc_1',
      opportunityId: null,
      judgmentType: 'account_strategy',
      assignedUserId: 'user_3',
      source: 'management_queue',
    });
  });

  it('rejects empty assignees before calling the API', () => {
    expect(() => buildManagementQueueOwnershipAssignmentPayload(queueItem(), '   ')).toThrow('请选择判断责任人');
  });
});
