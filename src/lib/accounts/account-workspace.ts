import type { Account, IntelItem, Opportunity, SavedDecode, Task } from '@/lib/babel-engine/types';

export interface AccountWorkspace {
  account: Account;
  contacts: Account['contacts'];
  opportunities: Opportunity[];
  intelItems: IntelItem[];
  emailDecodes: SavedDecode[];
  tasks: Task[];
}

export interface BuildAccountWorkspaceInput {
  accountId: string;
  accounts: Account[];
  opportunities: Opportunity[];
  intelItems: IntelItem[];
  emailDecodes: SavedDecode[];
  tasks?: Task[];
}

export function getAccountWorkspace(input: BuildAccountWorkspaceInput): AccountWorkspace | null {
  const account = input.accounts.find((item) => item.id === input.accountId);
  if (!account) return null;

  return {
    account,
    contacts: account.contacts ?? [],
    opportunities: input.opportunities.filter((item) => item.accountId === account.id),
    intelItems: input.intelItems.filter((item) => item.accountId === account.id),
    emailDecodes: input.emailDecodes.filter(
      (item) => item.accountId === account.id || item.matchedAccountId === account.id,
    ),
    tasks: (input.tasks ?? []).filter(
      (item) => item.accountId === account.id || input.opportunities.some((opportunity) => opportunity.id === item.opportunityId && opportunity.accountId === account.id),
    ),
  };
}

export function getAccountWorkspaceSummary(workspace: AccountWorkspace) {
  return {
    accountId: workspace.account.id,
    accountName: workspace.account.name,
    industry: workspace.account.industry,
    opportunityCount: workspace.opportunities.length,
    intelCount: workspace.intelItems.length,
    decodeCount: workspace.emailDecodes.length,
    openTaskCount: workspace.tasks.filter((item) => item.status !== 'done').length,
  };
}
