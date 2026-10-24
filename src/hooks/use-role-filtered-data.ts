"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import { isOpportunityOwnedBy } from "@/lib/opportunity-ownership";

/**
 * Returns store data filtered by the current user's job level:
 * - L2+ (Director/VP/CxO): all data
 * - L1 (Manager): own + team members' data
 * - L0 (AE): own data only
 *
 * Use this instead of raw useStore() for any user-facing data display.
 */
export function useRoleFilteredData() {
  const { accounts, intelItems, emailDecodes, composedEmails, opportunities, tasks } = useStore();
  const { user, orgMembers } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const userId = user?.id;

  return useMemo(() => {
    // L2+ (Director/VP/CxO): see everything
    if (jobLevel >= 2) {
      return { accounts, intelItems, emailDecodes, composedEmails, opportunities, tasks };
    }

    // L1 (Manager): own + team members' data
    if (jobLevel === 1) {
      const myMembership = orgMembers.find((m) => m.userId === userId);
      const teamUserIds = new Set<string>();
      if (userId) teamUserIds.add(userId);

      if (myMembership?.teamId) {
        for (const m of orgMembers) {
          if (m.teamId === myMembership.teamId) teamUserIds.add(m.userId);
        }
      }

      // No teamId configured → fallback to all visible
      if (teamUserIds.size <= 1 && !myMembership?.teamId) {
        return { accounts, intelItems, emailDecodes, composedEmails, opportunities, tasks };
      }

      const ownedOpportunities = opportunities.filter((o) => isOpportunityOwnedBy(o, teamUserIds));
      const ownedOpportunityAccountIds = new Set(ownedOpportunities.map((o) => o.accountId));
      const filteredAccounts = accounts.filter((a) => { const owner = a.ownerId ?? a.userId; return !owner || teamUserIds.has(owner) || ownedOpportunityAccountIds.has(a.id); });
      const accountIdSet = new Set(filteredAccounts.map((a) => a.id));
      const filteredOpps = opportunities.filter((o) => accountIdSet.has(o.accountId) || isOpportunityOwnedBy(o, teamUserIds));
      const filteredTasks = tasks.filter((t) => {
        // 有 accountId 的任务：可见性跟账户走，确保 transfer 后旧负责人不再看到历史任务
        if (t.accountId) return accountIdSet.has(t.accountId);
        return (t.userId && teamUserIds.has(t.userId)) || (t.assignedTo && teamUserIds.has(t.assignedTo));
      });
      const filteredDecodes = emailDecodes.filter((d) => (d.userId && teamUserIds.has(d.userId)) || (d.accountId && accountIdSet.has(d.accountId)));
      const filteredComposedEmails = composedEmails.filter((e) => e.accountId && accountIdSet.has(e.accountId));
      const filteredIntel = intelItems.filter((i) => accountIdSet.has(i.accountId));

      return {
        accounts: filteredAccounts,
        intelItems: filteredIntel,
        emailDecodes: filteredDecodes,
        composedEmails: filteredComposedEmails,
        opportunities: filteredOpps,
        tasks: filteredTasks,
      };
    }

    // L0 (AE): only own data
    const ownUserIds = userId ? [userId] : [];
    const ownedOpportunities = opportunities.filter((o) => isOpportunityOwnedBy(o, ownUserIds));
    const ownedOpportunityAccountIds = new Set(ownedOpportunities.map((o) => o.accountId));
    const filteredAccounts = accounts.filter((a) => { const owner = a.ownerId ?? a.userId; return !owner || owner === userId || ownedOpportunityAccountIds.has(a.id); });
    const accountIdSet = new Set(filteredAccounts.map((a) => a.id));
    const filteredOpps = opportunities.filter((o) => accountIdSet.has(o.accountId) || isOpportunityOwnedBy(o, ownUserIds));
    const filteredTasks = tasks.filter((t) => {
      // 有 accountId 的任务：可见性跟账户走，确保 transfer 后旧负责人不再看到历史任务
      if (t.accountId) return accountIdSet.has(t.accountId);
      return t.userId === userId || t.assignedTo === userId;
    });
    const filteredDecodes = emailDecodes.filter((d) => d.userId === userId || (d.accountId && accountIdSet.has(d.accountId)));
    const filteredComposedEmails = composedEmails.filter((e) => e.accountId && accountIdSet.has(e.accountId));
    const filteredIntel = intelItems.filter((i) => accountIdSet.has(i.accountId));

    return {
      accounts: filteredAccounts,
      intelItems: filteredIntel,
      emailDecodes: filteredDecodes,
      composedEmails: filteredComposedEmails,
      opportunities: filteredOpps,
      tasks: filteredTasks,
    };
  }, [accounts, intelItems, emailDecodes, composedEmails, opportunities, tasks, userId, jobLevel, orgMembers]);
}
