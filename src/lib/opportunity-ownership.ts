import type { Opportunity } from '@/lib/babel-engine/types';

export function getOpportunityOwnerUserId(opportunity: Opportunity): string | undefined {
  return opportunity.assignedTo ?? opportunity.userId;
}

export function isOpportunityOwnedBy(opportunity: Opportunity, userIds: Iterable<string>): boolean {
  const ownerUserId = getOpportunityOwnerUserId(opportunity);
  if (!ownerUserId) return false;
  return Array.from(userIds).includes(ownerUserId);
}
