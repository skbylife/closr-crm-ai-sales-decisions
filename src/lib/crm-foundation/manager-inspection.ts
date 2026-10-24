import type {
  Account,
  ComposedEmail,
  IntelItem,
  Opportunity,
  SavedDecode,
  Task,
} from '@/lib/babel-engine/types';
import {
  buildContactOpportunityCoverage,
  buildUnifiedTimeline,
  type OpportunityCoverageGap,
} from './opportunity-workbench';

export type ManagerInspectionPriority = 'critical' | 'watch' | 'healthy';

export interface ManagerInspectionRisk {
  id: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  action: string;
}

export interface ManagerInspectionItem {
  opportunityId: string;
  opportunityName: string;
  accountId: string;
  accountName: string;
  stage: Opportunity['stage'];
  value: number;
  currency: string;
  expectedCloseDate?: string;
  owner?: string;
  priority: ManagerInspectionPriority;
  score: number;
  stageAgeDays: number;
  lastMeaningfulActivityAt?: string;
  nextTaskDue?: string;
  risks: ManagerInspectionRisk[];
  primaryAction: string;
}

function daysSince(value?: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function daysUntil(value?: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / 86_400_000);
}

function activeOpportunity(opportunity: Opportunity): boolean {
  return opportunity.stage !== 'closed_won' && opportunity.stage !== 'closed_lost';
}

function riskFromCoverageGap(gap: OpportunityCoverageGap): ManagerInspectionRisk {
  return {
    id: gap.id,
    label: gap.label,
    severity: gap.severity,
    action: gap.action,
  };
}

function priorityFor(risks: ManagerInspectionRisk[]): ManagerInspectionPriority {
  if (risks.some((risk) => risk.severity === 'high')) return 'critical';
  if (risks.length > 0) return 'watch';
  return 'healthy';
}

function scoreFor(risks: ManagerInspectionRisk[]): number {
  return risks.reduce((sum, risk) => {
    if (risk.severity === 'high') return sum + 30;
    if (risk.severity === 'medium') return sum + 15;
    return sum + 5;
  }, 0);
}

function firstRiskAction(risks: ManagerInspectionRisk[]): string {
  return risks[0]?.action ?? '保持推进节奏';
}

export function buildManagerInspectionQueue(params: {
  accounts: Account[];
  opportunities: Opportunity[];
  tasks?: Task[];
  intelItems?: IntelItem[];
  decodes?: SavedDecode[];
  composedEmails?: ComposedEmail[];
  limit?: number;
}): ManagerInspectionItem[] {
  const tasks = params.tasks ?? [];

  return params.opportunities
    .filter(activeOpportunity)
    .map((opportunity) => {
      const account = params.accounts.find((item) => item.id === opportunity.accountId);
      const coverage = buildContactOpportunityCoverage({
        opportunity,
        contacts: account?.contacts ?? [],
      });
      const timeline = buildUnifiedTimeline({
        opportunity,
        accountId: opportunity.accountId,
        intelItems: params.intelItems,
        decodes: params.decodes,
        composedEmails: params.composedEmails,
        tasks,
        limit: 20,
      });

      const pendingTasks = tasks
        .filter((task) => task.opportunityId === opportunity.id && task.status !== 'done')
        .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'));
      const nextTask = pendingTasks[0];
      const risks: ManagerInspectionRisk[] = coverage.gaps.map(riskFromCoverageGap);
      const staleDays = daysSince(timeline.lastMeaningfulActivityAt);
      const closeDays = daysUntil(opportunity.expectedCloseDate);
      const stageAgeDays = daysSince(opportunity.createdAt) ?? 0;

      if (!nextTask) {
        risks.push({
          id: 'missing_next_step',
          label: '缺下一步',
          severity: 'high',
          action: '补明确负责人和到期日',
        });
      } else if (nextTask.dueDate && daysUntil(nextTask.dueDate) !== null && daysUntil(nextTask.dueDate)! < 0) {
        risks.push({
          id: 'overdue_next_step',
          label: '下一步逾期',
          severity: 'high',
          action: '当天更新下一步',
        });
      }

      if (timeline.stale || (staleDays !== null && staleDays > 21)) {
        risks.push({
          id: 'low_activity',
          label: '近期活动不足',
          severity: 'medium',
          action: '安排有效触达',
        });
      }

      if (stageAgeDays > 30) {
        risks.push({
          id: 'stage_aging',
          label: '阶段停留过久',
          severity: 'medium',
          action: '复核阶段证据',
        });
      }

      if (closeDays !== null && closeDays < 0) {
        risks.push({
          id: 'past_close_date',
          label: '预计关单日已过',
          severity: 'high',
          action: '重设关单路径',
        });
      } else if (closeDays !== null && closeDays <= 14 && opportunity.probability < 50) {
        risks.push({
          id: 'close_date_pressure',
          label: '关单窗口临近',
          severity: 'medium',
          action: '确认签约条件',
        });
      }

      const dedupedRisks = Array.from(new Map(risks.map((risk) => [risk.id, risk])).values());

      return {
        opportunityId: opportunity.id,
        opportunityName: opportunity.name,
        accountId: opportunity.accountId,
        accountName: account?.name ?? '未知客户',
        stage: opportunity.stage,
        value: opportunity.value,
        currency: opportunity.currency,
        expectedCloseDate: opportunity.expectedCloseDate,
        owner: opportunity.owner || opportunity.assignedTo,
        priority: priorityFor(dedupedRisks),
        score: scoreFor(dedupedRisks),
        stageAgeDays,
        lastMeaningfulActivityAt: timeline.lastMeaningfulActivityAt,
        nextTaskDue: nextTask?.dueDate,
        risks: dedupedRisks,
        primaryAction: firstRiskAction(dedupedRisks),
      };
    })
    .sort((a, b) => {
      const priorityRank: Record<ManagerInspectionPriority, number> = { critical: 0, watch: 1, healthy: 2 };
      return priorityRank[a.priority] - priorityRank[b.priority]
        || b.score - a.score
        || b.value - a.value;
    })
    .slice(0, params.limit ?? 50);
}
