import type {
  Account,
  ComposedEmail,
  IntelItem,
  Opportunity,
  SalesLead,
  SavedDecode,
  Task,
} from '@/lib/babel-engine/types';
import { buildLeadIntakeQueue, type LeadIntakeItem } from './lead-intake';
import { buildManagerInspectionQueue, type ManagerInspectionItem } from './manager-inspection';

export type SalesWorkbenchActionType = 'lead' | 'inspection' | 'task';
export type SalesWorkbenchActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface SalesWorkbenchAction {
  id: string;
  type: SalesWorkbenchActionType;
  priority: SalesWorkbenchActionPriority;
  title: string;
  subtitle: string;
  action: string;
  href: string;
}

export interface SalesWorkbenchModel {
  leadCount: number;
  criticalDealCount: number;
  watchDealCount: number;
  overdueTaskCount: number;
  leads: LeadIntakeItem[];
  inspections: ManagerInspectionItem[];
  actions: SalesWorkbenchAction[];
}

function taskOverdue(task: Task, now = Date.now()): boolean {
  if (task.status === 'done' || !task.dueDate) return false;
  const due = new Date(task.dueDate).getTime();
  if (!Number.isFinite(due)) return false;
  return due < now;
}

function actionPriorityFromLead(lead: LeadIntakeItem): SalesWorkbenchActionPriority {
  if (lead.urgency === 'high') return 'high';
  if (lead.urgency === 'medium') return 'medium';
  return 'low';
}

function actionPriorityFromSalesLead(lead: SalesLead): SalesWorkbenchActionPriority {
  if (lead.priority === 'high') return 'high';
  if (lead.priority === 'medium') return 'medium';
  return 'low';
}

function actionPriorityFromInspection(item: ManagerInspectionItem): SalesWorkbenchActionPriority {
  if (item.priority === 'critical') return 'critical';
  if (item.priority === 'watch') return 'high';
  return 'low';
}

function priorityRank(priority: SalesWorkbenchActionPriority): number {
  if (priority === 'critical') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

export function buildSalesWorkbenchModel(params: {
  accounts: Account[];
  opportunities: Opportunity[];
  tasks?: Task[];
  leads?: SalesLead[];
  intelItems?: IntelItem[];
  decodes?: SavedDecode[];
  composedEmails?: ComposedEmail[];
  limit?: number;
}): SalesWorkbenchModel {
  const leads = buildLeadIntakeQueue({
    accounts: params.accounts,
    opportunities: params.opportunities,
    decodes: params.decodes,
    intelItems: params.intelItems,
    limit: params.limit ?? 8,
  });
  const inspections = buildManagerInspectionQueue({
    accounts: params.accounts,
    opportunities: params.opportunities,
    tasks: params.tasks,
    intelItems: params.intelItems,
    decodes: params.decodes,
    composedEmails: params.composedEmails,
    limit: params.limit ?? 8,
  });
  const overdueTasks = (params.tasks ?? [])
    .filter((task) => taskOverdue(task))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const openLeads = (params.leads ?? [])
    .filter((lead) => lead.status !== 'converted' && lead.status !== 'disqualified')
    .sort((a, b) => {
      const priorityRankMap: Record<SalesLead['priority'], number> = { high: 0, medium: 1, low: 2 };
      return priorityRankMap[a.priority] - priorityRankMap[b.priority]
        || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const persistedLeadActions: SalesWorkbenchAction[] = openLeads.slice(0, 3).map((lead) => ({
    id: 'lead:' + lead.id,
    type: 'lead',
    priority: actionPriorityFromSalesLead(lead),
    title: lead.companyName,
    subtitle: lead.need,
    action: lead.status === 'qualified' ? '转化为客户/联系人/商机' : '分派、合格化或转化线索',
    href: '/leads',
  }));

  const inferredLeadActions: SalesWorkbenchAction[] = leads.slice(0, Math.max(0, 3 - persistedLeadActions.length)).map((lead) => ({
    id: lead.id,
    type: 'lead',
    priority: actionPriorityFromLead(lead),
    title: lead.companyName,
    subtitle: lead.signal,
    action: lead.nextAction,
    href: '/leads',
  }));
  const leadActions = [...persistedLeadActions, ...inferredLeadActions];

  const inspectionActions: SalesWorkbenchAction[] = inspections
    .filter((item) => item.priority !== 'healthy')
    .slice(0, 4)
    .map((item) => ({
      id: 'inspection:' + item.opportunityId,
      type: 'inspection',
      priority: actionPriorityFromInspection(item),
      title: item.opportunityName,
      subtitle: item.risks.map((risk) => risk.label).slice(0, 3).join(' / '),
      action: item.primaryAction,
      href: '/pipeline/' + item.opportunityId,
    }));

  const taskActions: SalesWorkbenchAction[] = overdueTasks.slice(0, 3).map((task) => ({
    id: 'task:' + task.id,
    type: 'task',
    priority: 'critical',
    title: task.title,
    subtitle: task.dueDate ?? '',
    action: '处理逾期任务',
    href: task.opportunityId ? '/pipeline/' + task.opportunityId : '/pulse',
  }));

  const actions = [...taskActions, ...inspectionActions, ...leadActions]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, params.limit ?? 8);

  return {
    leadCount: openLeads.length + leads.length,
    criticalDealCount: inspections.filter((item) => item.priority === 'critical').length,
    watchDealCount: inspections.filter((item) => item.priority === 'watch').length,
    overdueTaskCount: overdueTasks.length,
    leads,
    inspections,
    actions,
  };
}
