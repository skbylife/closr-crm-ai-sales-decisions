'use client';

import { useMemo } from 'react';
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { daysSince } from '@/lib/time-utils';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import type { Account, Opportunity, Task, OrgMember } from '@/lib/babel-engine/types';

interface ManagerInterventionPanelProps {
  opportunities: Opportunity[];
  tasks: Task[];
  accounts: Account[];
  orgMembers: OrgMember[];
}

type ActionGrade = 'good' | 'fair' | 'poor';

const GRADE_STYLES: Record<ActionGrade, { label: string; bg: string; color: string }> = {
  good:  { label: '良好', bg: 'rgba(34,197,94,0.1)',  color: 'var(--dash-health-good)' },
  fair:  { label: '一般', bg: 'rgba(245,158,11,0.1)', color: 'var(--dash-health-warn)' },
  poor:  { label: '需关注', bg: 'rgba(239,68,68,0.1)',  color: 'var(--dash-health-bad)' },
};

interface AeHealthRow {
  userId: string;
  displayName: string;
  stuckDeals: number;
  overdueTasks: number;
  lowMeddiccCount: number;
  totalPipelineValue: number;
  needsIntervention: boolean;
  topIssue: string;
  actionGrade: ActionGrade;
}

export function ManagerInterventionPanel({ opportunities, tasks, accounts, orgMembers }: ManagerInterventionPanelProps) {
  const currency = useStore((s) => s.currencyCode);

  const aeRows = useMemo<AeHealthRow[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const userAccountMap = new Map<string, Set<string>>();
    for (const acct of accounts) {
      const owner = acct.ownerId ?? acct.userId;
      if (!owner) continue;
      if (!userAccountMap.has(owner)) userAccountMap.set(owner, new Set());
      userAccountMap.get(owner)!.add(acct.id);
    }

    // Pre-index all tasks by user for grade computation
    const allTasksByUser = new Map<string, Task[]>();
    for (const t of tasks) {
      const uid = t.assignedTo ?? t.userId;
      if (!uid) continue;
      const list = allTasksByUser.get(uid);
      if (list) list.push(t); else allTasksByUser.set(uid, [t]);
    }

    const aes = orgMembers.filter((m) => (m.jobLevel ?? 0) === 0);

    return aes.map((ae) => {
      const acctIds = userAccountMap.get(ae.userId) ?? new Set<string>();
      const aeOpps = opportunities.filter(
        (o) => acctIds.has(o.accountId) && o.stage !== 'closed_won' && o.stage !== 'closed_lost'
      );
      const aeTasks = tasks.filter(
        (t) => (t.userId === ae.userId || t.assignedTo === ae.userId) && t.status !== 'done'
      );

      const stuckDeals = aeOpps.filter((o) => {
        const score = o.meddicc?.overallScore ?? 0;
        const dwell = daysSince(o.updatedAt ?? o.createdAt);
        return score < 30 || dwell > 21;
      }).length;

      const overdueTasks = aeTasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < today
      ).length;

      const lowMeddiccCount = aeOpps.filter(
        (o) => (o.meddicc?.overallScore ?? 0) < 40
      ).length;

      const totalPipelineValue = aeOpps.reduce((s, o) => s + o.value, 0);
      const needsIntervention = stuckDeals >= 2 || overdueTasks >= 3 || lowMeddiccCount >= 3;

      let topIssue = '状态良好';
      if (stuckDeals >= 2) topIssue = `${stuckDeals} 单卡住`;
      else if (overdueTasks >= 3) topIssue = `${overdueTasks} 任务逾期`;
      else if (lowMeddiccCount >= 3) topIssue = `${lowMeddiccCount} 单 MEDDICC 偏低`;

      // ── Action quality grade ──
      const allAeTasks = allTasksByUser.get(ae.userId) ?? [];
      const recentActivity = allAeTasks.filter(
        (t) => t.createdAt && new Date(t.createdAt) >= sevenDaysAgo
      ).length;
      const tasksWithDue = allAeTasks.filter((t) => t.dueDate);
      const onTimeCount = tasksWithDue.filter(
        (t) => t.status === 'done' && t.dueDate && new Date(t.updatedAt) <= new Date(t.dueDate)
      ).length;
      const onTimeRate = tasksWithDue.length > 0 ? onTimeCount / tasksWithDue.length : 1;

      let gradeScore = 0;
      if (recentActivity >= 3) gradeScore += 1;
      if (recentActivity >= 6) gradeScore += 1;
      if (onTimeRate >= 0.7) gradeScore += 1;
      if (onTimeRate >= 0.9) gradeScore += 1;
      if (lowMeddiccCount === 0) gradeScore += 1;

      const actionGrade: ActionGrade = gradeScore >= 4 ? 'good' : gradeScore >= 2 ? 'fair' : 'poor';

      return {
        userId: ae.userId,
        displayName: ae.displayName ?? '团队成员',
        stuckDeals,
        overdueTasks,
        lowMeddiccCount,
        totalPipelineValue,
        needsIntervention,
        topIssue,
        actionGrade,
      };
    })
    .sort((a, b) => {
      if (a.needsIntervention !== b.needsIntervention) return a.needsIntervention ? -1 : 1;
      return b.stuckDeals - a.stuckDeals;
    });
  }, [opportunities, tasks, accounts, orgMembers]);

  if (aeRows.length === 0) return null;

  const interventionCount = aeRows.filter((r) => r.needsIntervention).length;

  return (
    <div
      className="rounded-2xl border shadow-[var(--dash-card-shadow)]"
      style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 pt-4 pb-3"
        style={{ borderColor: 'var(--dash-card-divider)' }}
      >
        <Users className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
          团队辅导面板
        </h3>
        {interventionCount > 0 && (
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--dash-health-bad)' }}
          >
            {interventionCount} 需介入
          </span>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--dash-card-divider)' }}>
        {aeRows.map((row) => (
          <div
            key={row.userId}
            className="flex items-center gap-3 px-4 py-3"
          >
            {row.needsIntervention ? (
              <AlertCircle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--dash-health-bad)' }} />
            ) : (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--dash-health-good)' }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" style={{ color: 'var(--dash-text-primary)' }}>
                {row.displayName}
              </p>
              <p className="text-[11px]" style={{ color: row.needsIntervention ? 'var(--dash-health-bad)' : 'var(--dash-text-tertiary)' }}>
                {row.topIssue}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums" style={{ color: 'var(--dash-text-tertiary)' }}>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  backgroundColor: GRADE_STYLES[row.actionGrade].bg,
                  color: GRADE_STYLES[row.actionGrade].color,
                }}
              >
                {GRADE_STYLES[row.actionGrade].label}
              </span>
              <span>{row.stuckDeals} 卡</span>
              <span>{row.overdueTasks} 逾期</span>
              <span className="w-20 text-right" style={{ color: 'var(--dash-text-secondary)' }}>
                {formatCurrency(row.totalPipelineValue, currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
