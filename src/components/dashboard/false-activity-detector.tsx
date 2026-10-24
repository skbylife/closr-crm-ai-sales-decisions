'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle } from 'lucide-react';
import { daysSince } from '@/lib/time-utils';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import type { Account, Opportunity, IntelItem, Task } from '@/lib/babel-engine/types';

interface FalseActivityDetectorProps {
  accounts: Account[];
  opportunities: Opportunity[];
  emailDecodes: Array<{ id: string; accountId?: string; date: string }>;
  intelItems: IntelItem[];
  tasks: Task[];
}

interface FalseActivityAccount {
  accountId: string;
  accountName: string;
  activityCount: number;
  maxMeddicc: number;
  maxStageDwellDays: number;
  totalPipelineValue: number;
  signal: 'high' | 'medium';
}

export function FalseActivityDetector({ accounts, opportunities, emailDecodes, intelItems, tasks }: FalseActivityDetectorProps) {
  const currency = useStore((s) => s.currencyCode);

  const falseActiveAccounts = useMemo<FalseActivityAccount[]>(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Pre-index activity counts by accountId for O(1) lookup
    const emailCounts = new Map<string, number>();
    for (const d of emailDecodes) {
      if (d.accountId && new Date(d.date) >= thirtyDaysAgo) {
        emailCounts.set(d.accountId, (emailCounts.get(d.accountId) ?? 0) + 1);
      }
    }
    const intelCounts = new Map<string, number>();
    for (const i of intelItems) {
      if (i.accountId && new Date(i.date) >= thirtyDaysAgo) {
        intelCounts.set(i.accountId, (intelCounts.get(i.accountId) ?? 0) + 1);
      }
    }
    const taskCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.accountId && t.createdAt && new Date(t.createdAt) >= thirtyDaysAgo) {
        taskCounts.set(t.accountId, (taskCounts.get(t.accountId) ?? 0) + 1);
      }
    }
    // Pre-group active opportunities by accountId
    const oppsByAccount = new Map<string, typeof opportunities>();
    for (const o of opportunities) {
      if (o.stage !== 'closed_won' && o.stage !== 'closed_lost') {
        const list = oppsByAccount.get(o.accountId);
        if (list) list.push(o); else oppsByAccount.set(o.accountId, [o]);
      }
    }

    return accounts
      .map((acct) => {
        const activityCount = (emailCounts.get(acct.id) ?? 0)
          + (intelCounts.get(acct.id) ?? 0)
          + (taskCounts.get(acct.id) ?? 0);

        const activeOpps = oppsByAccount.get(acct.id) ?? [];
        const maxMeddicc = Math.max(0, ...activeOpps.map((o) => o.meddicc?.overallScore ?? 0));
        const maxStageDwellDays = Math.max(
          0,
          ...activeOpps.map((o) => daysSince(o.updatedAt ?? o.createdAt))
        );
        const totalPipelineValue = activeOpps.reduce((s, o) => s + o.value, 0);

        return {
          accountId: acct.id,
          accountName: acct.name,
          activityCount,
          maxMeddicc,
          maxStageDwellDays,
          totalPipelineValue,
          signal: 'medium' as const,
        };
      })
      .filter((a) => a.activityCount >= 5 && (a.maxMeddicc < 30 || a.maxStageDwellDays > 30))
      .map((a) => ({
        ...a,
        signal: (a.activityCount >= 10 && a.maxMeddicc < 20) ? 'high' as const : 'medium' as const,
      }))
      .sort((a, b) => b.activityCount - a.activityCount)
      .slice(0, 8);
  }, [accounts, opportunities, emailDecodes, intelItems, tasks]);

  if (falseActiveAccounts.length === 0) return null;

  return (
    <div
      className="rounded-2xl border shadow-[var(--dash-card-shadow)]"
      style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 pt-4 pb-3"
        style={{ borderColor: 'var(--dash-card-divider)' }}
      >
        <Activity className="h-4 w-4" style={{ color: 'var(--dash-health-warn)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
          假性活跃账户
        </h3>
        <span
          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: 'var(--dash-health-warn)' }}
        >
          {falseActiveAccounts.length}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--dash-card-divider)' }}>
        {falseActiveAccounts.map((a) => (
          <Link
            key={a.accountId}
            href={`/accounts/${a.accountId}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            {a.signal === 'high' && (
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--dash-health-bad)' }} />
            )}
            {a.signal === 'medium' && (
              <Activity className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--dash-health-warn)' }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" style={{ color: 'var(--dash-text-primary)' }}>
                {a.accountName}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                {a.activityCount} 次活动 · MEDDICC {a.maxMeddicc} · 停滞 {a.maxStageDwellDays} 天
              </p>
            </div>
            <span className="text-xs tabular-nums" style={{ color: 'var(--dash-text-secondary)' }}>
              {formatCurrency(a.totalPipelineValue, currency)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
