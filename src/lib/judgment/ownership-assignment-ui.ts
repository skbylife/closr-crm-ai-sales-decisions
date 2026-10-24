import type { PortfolioManagementQueueItem } from '@/lib/judgment/portfolio-view';
import type { CreateJudgmentOwnershipAssignmentInput } from '@/lib/judgment/ownership-assignments';

export function buildManagementQueueOwnershipAssignmentPayload(
  item: PortfolioManagementQueueItem,
  assignedUserId: string,
): CreateJudgmentOwnershipAssignmentInput {
  const ownerId = assignedUserId.trim();
  if (!ownerId) {
    throw new Error('请选择判断责任人');
  }

  return {
    accountId: item.accountId,
    opportunityId: item.opportunityId ?? null,
    judgmentType: item.opportunityId ? 'opportunity_forecast' : 'account_strategy',
    assignedUserId: ownerId,
    source: 'management_queue',
    reason: item.whyThisMatters,
  };
}
