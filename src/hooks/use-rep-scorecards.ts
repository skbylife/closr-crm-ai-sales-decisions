"use client";

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { useEffectiveJobLevel } from '@/hooks/use-effective-job-level';
import {
  buildRepScorecards,
  sortRepScorecards,
  type RepQuotaInput,
  type RepScorecard,
  type RepScorecardSortKey,
} from '@/lib/sales-management/rep-scorecard';
import type { OrgMember, StrategicPlay } from '@/lib/babel-engine/types';

interface QuotaRow {
  user_id?: string | null;
  team_id?: string | null;
  target_amount?: number | string | null;
}

function fallbackMember(user: ReturnType<typeof useAuth>['user'], jobLevel: number): OrgMember | null {
  if (!user?.id) return null;
  const email = user.email ?? undefined;
  return {
    id: user.id,
    userId: user.id,
    orgId: '',
    role: 'member',
    jobTitle: jobLevel >= 2 ? 'executive' : jobLevel === 1 ? 'director' : 'ae',
    jobLevel,
    displayName: email?.split('@')[0],
    email,
    joinedAt: '',
  };
}

function visibleMembersForRole(args: {
  orgMembers: OrgMember[];
  user: ReturnType<typeof useAuth>['user'];
  jobLevel: number;
}): OrgMember[] {
  const { orgMembers, user, jobLevel } = args;
  if (orgMembers.length === 0) {
    const fallback = fallbackMember(user, jobLevel);
    return fallback ? [fallback] : [];
  }
  if (jobLevel >= 2) return orgMembers;

  const me = orgMembers.find((member) => member.userId === user?.id);
  if (jobLevel === 1 && me?.teamId) {
    return orgMembers.filter((member) => member.teamId === me.teamId);
  }
  return me ? [me] : [];
}

function normalizeQuotas(rows: QuotaRow[]): RepQuotaInput[] {
  return rows.map((row) => ({
    userId: row.user_id ?? null,
    teamId: row.team_id ?? null,
    targetAmount: typeof row.target_amount === 'string' ? Number(row.target_amount) : row.target_amount ?? 0,
  }));
}

function hasSalesManagementSignal(scorecard: RepScorecard): boolean {
  return scorecard.activeDeals > 0
    || scorecard.wonDeals > 0
    || scorecard.lostDeals > 0
    || scorecard.tasksDone > 0
    || scorecard.tasksOverdue > 0
    || scorecard.decodeCount > 0
    || scorecard.strategicPlayCount > 0;
}

export function useRepScorecards(sortBy: RepScorecardSortKey = 'overall'): {
  scorecards: RepScorecard[];
  visibleMembers: OrgMember[];
  loadingContext: boolean;
} {
  const { accounts, opportunities, tasks, emailDecodes } = useRoleFilteredData();
  const { user, orgMembers } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const [quotas, setQuotas] = useState<RepQuotaInput[]>([]);
  const [strategicPlays, setStrategicPlays] = useState<StrategicPlay[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);

  const visibleMembers = useMemo(
    () => visibleMembersForRole({ orgMembers, user, jobLevel }),
    [orgMembers, user, jobLevel],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      setLoadingContext(true);
      try {
        const year = new Date().getFullYear();
        const [quotaRes, playsRes] = await Promise.all([
          fetch('/api/quotas?period=quarterly&year=' + year, { cache: 'no-store' }),
          fetch('/api/strategic-play', { cache: 'no-store' }),
        ]);
        const [quotaPayload, playsPayload] = await Promise.all([
          quotaRes.ok ? quotaRes.json() : Promise.resolve({ quotas: [] }),
          playsRes.ok ? playsRes.json() : Promise.resolve({ plays: [] }),
        ]);
        if (cancelled) return;
        setQuotas(normalizeQuotas(Array.isArray(quotaPayload?.quotas) ? quotaPayload.quotas : []));
        setStrategicPlays(Array.isArray(playsPayload?.plays) ? playsPayload.plays : []);
      } catch {
        if (!cancelled) {
          setQuotas([]);
          setStrategicPlays([]);
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }

    loadContext();
    window.addEventListener('closr:strategic-plays-changed', loadContext);
    return () => {
      cancelled = true;
      window.removeEventListener('closr:strategic-plays-changed', loadContext);
    };
  }, []);

  const scorecards = useMemo(() => {
    const raw = buildRepScorecards({
      members: visibleMembers,
      accounts,
      opportunities,
      tasks,
      decodes: emailDecodes,
      strategicPlays,
      quotas,
    });
    const activeScorecards = raw.filter(hasSalesManagementSignal);
    return sortRepScorecards(activeScorecards.length > 0 ? activeScorecards : raw, sortBy);
  }, [visibleMembers, accounts, opportunities, tasks, emailDecodes, strategicPlays, quotas, sortBy]);

  return { scorecards, visibleMembers, loadingContext };
}
