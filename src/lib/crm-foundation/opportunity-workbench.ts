import type {
  ComposedEmail,
  Contact,
  ContactRole,
  IntelItem,
  Opportunity,
  SavedDecode,
  Task,
} from '@/lib/babel-engine/types';

export type OpportunityRoleStance = 'supportive' | 'neutral' | 'risk' | 'unknown';
export type OpportunityRoleInfluence = 'high' | 'medium' | 'low' | 'unknown';
export type OpportunityRoleCoverageStatus = 'covered' | 'needs_touch' | 'missing';
export type TimelineEventType =
  | 'email'
  | 'meeting'
  | 'call'
  | 'chat'
  | 'intel'
  | 'task'
  | 'stage_change'
  | 'close_date'
  | 'document'
  | 'note';

export interface ContactOpportunityRoleModel {
  contactId: string;
  contactName: string;
  title?: string;
  roleType: ContactRole;
  roleLabel: string;
  influence: OpportunityRoleInfluence;
  stance: OpportunityRoleStance;
  coverageStatus: OpportunityRoleCoverageStatus;
  lastEngagedAt?: string;
  nextAction: string;
  source: 'contact_profile' | 'opportunity_meddicc' | 'persisted' | 'inferred';
  confidence?: number;
  notes?: string;
}

export interface OpportunityCoverageGap {
  id: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
  action: string;
}

export interface OpportunityCoverageModel {
  roles: ContactOpportunityRoleModel[];
  gaps: OpportunityCoverageGap[];
  status: 'strong' | 'needs_work' | 'thin';
}

export interface UnifiedTimelineEvent {
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  title: string;
  actor?: string;
  detail?: string;
  relatedContactIds: string[];
  relatedOpportunityId?: string;
  relatedAccountId?: string;
  actionLabel?: string;
  href?: string;
  source?: 'persisted' | 'dynamic';
}

export interface UnifiedTimelineModel {
  events: UnifiedTimelineEvent[];
  lastMeaningfulActivityAt?: string;
  stale: boolean;
}

export interface PersistedOpportunityRoleInput {
  contactId: string;
  contactName?: string;
  title?: string;
  roleType: ContactRole;
  influence: OpportunityRoleInfluence;
  stance: OpportunityRoleStance;
  coverageStatus: OpportunityRoleCoverageStatus;
  lastEngagedAt?: string;
  nextAction?: string;
  confidence?: number;
  notes?: string;
}

const ROLE_LABELS: Record<ContactRole, string> = {
  decision_maker: '决策者',
  economic_buyer: '经济买家',
  champion: '内部推动者',
  technical_evaluator: '技术评估人',
  influencer: '影响者',
  external_advisor: '外部顾问',
  consultant: '咨询顾问',
  channel_influencer: '渠道影响者',
  blocker: '阻碍者',
  end_user: '最终用户',
  procurement: '采购',
  legal: '法务',
  project_manager: '项目经理',
  executive_sponsor: '高管支持者',
  gate_keeper: '守门人',
  coach: '教练',
  committee_member: '委员会成员',
  it_admin: 'IT 管理员',
  operations: '运营',
  finance: '财务',
  contact: '联系人',
  unknown: '未知',
};

const HIGH_INFLUENCE_ROLES = new Set<ContactRole>([
  'decision_maker',
  'economic_buyer',
  'executive_sponsor',
  'champion',
  'blocker',
]);

const MEDIUM_INFLUENCE_ROLES = new Set<ContactRole>([
  'technical_evaluator',
  'procurement',
  'legal',
  'finance',
  'coach',
  'project_manager',
  'influencer',
]);

function normalizeDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function daysSince(value?: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function firstText(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const text = value?.replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function roleInfluence(role: ContactRole): OpportunityRoleInfluence {
  if (HIGH_INFLUENCE_ROLES.has(role)) return 'high';
  if (MEDIUM_INFLUENCE_ROLES.has(role)) return 'medium';
  if (role === 'contact' || role === 'unknown') return 'unknown';
  return 'low';
}

function roleStance(role: ContactRole): OpportunityRoleStance {
  if (role === 'blocker') return 'risk';
  if (role === 'champion' || role === 'coach' || role === 'executive_sponsor') return 'supportive';
  if (role === 'unknown') return 'unknown';
  return 'neutral';
}

function coverageStatus(contact: Contact): OpportunityRoleCoverageStatus {
  const touchedAt = normalizeDate(contact.lastContactedAt);
  const staleDays = daysSince(touchedAt);
  if (!contact.role || contact.role === 'unknown') return 'missing';
  if (staleDays !== null && staleDays > 21) return 'needs_touch';
  return 'covered';
}

function nextActionForRole(contact: Contact, status: OpportunityRoleCoverageStatus): string {
  if (!contact.role || contact.role === 'unknown') return '确认商机角色';
  if (status === 'needs_touch') return '重新触达并确认立场';
  if (contact.role === 'blocker') return '准备异议处理';
  if (contact.role === 'economic_buyer' || contact.role === 'decision_maker') return '确认决策路径';
  if (contact.role === 'champion' || contact.role === 'coach') return '确认下一步承诺';
  return '记录下一次互动';
}

function nextActionForPersistedRole(role: PersistedOpportunityRoleInput): string {
  if (role.nextAction) return role.nextAction;
  if (role.coverageStatus === 'missing') return '确认商机角色';
  if (role.coverageStatus === 'needs_touch') return '重新触达并确认立场';
  if (role.stance === 'risk') return '准备异议处理';
  if (role.roleType === 'economic_buyer' || role.roleType === 'decision_maker') return '确认决策路径';
  if (role.roleType === 'champion' || role.roleType === 'coach') return '确认下一步承诺';
  return '记录下一次互动';
}

function buildGaps(params: { roles: ContactOpportunityRoleModel[]; opportunity: Opportunity }): OpportunityCoverageGap[] {
  const hasChampion = params.roles.some((role) => role.roleType === 'champion' || role.roleType === 'coach');
  const hasEconomicBuyer = params.roles.some((role) => role.roleType === 'economic_buyer' || role.roleType === 'decision_maker');
  const hasProcessGate = params.roles.some((role) => role.roleType === 'procurement' || role.roleType === 'legal' || role.roleType === 'finance');
  const highInfluenceCount = params.roles.filter((role) => role.influence === 'high').length;

  const gaps: OpportunityCoverageGap[] = [];
  if (!hasChampion) {
    gaps.push({ id: 'missing_champion', label: '缺内部推动者', severity: 'high', action: '确认 champion 或 coach' });
  }
  if (!hasEconomicBuyer) {
    gaps.push({ id: 'missing_economic_buyer', label: '缺决策/预算角色', severity: 'high', action: '补经济买家或决策者' });
  }
  if (!hasProcessGate && params.opportunity.stage !== 'lead_identified' && params.opportunity.stage !== 'discovery') {
    gaps.push({ id: 'missing_process_gate', label: '缺采购/法务/财务路径', severity: 'medium', action: '补流程角色' });
  }
  if (highInfluenceCount <= 1 && params.roles.length > 0) {
    gaps.push({ id: 'single_threaded', label: '高影响力关系单线程', severity: 'medium', action: '增加第二触点' });
  }
  if (params.roles.length === 0) {
    gaps.push({ id: 'no_contacts', label: '没有联系人', severity: 'high', action: '先添加客户联系人' });
  }
  return gaps;
}

function statusFromGaps(gaps: OpportunityCoverageGap[]): OpportunityCoverageModel['status'] {
  if (gaps.some((gap) => gap.severity === 'high')) return 'thin';
  if (gaps.length > 0) return 'needs_work';
  return 'strong';
}

export function buildContactOpportunityCoverage(params: {
  opportunity: Opportunity;
  contacts: Contact[];
  persistedRoles?: PersistedOpportunityRoleInput[];
}): OpportunityCoverageModel {
  if (params.persistedRoles?.length) {
    const contactsById = new Map(params.contacts.map((contact) => [contact.id, contact]));
    const roles = params.persistedRoles
      .map((role) => {
        const contact = contactsById.get(role.contactId);
        const roleType = role.roleType ?? 'unknown';
        const model: ContactOpportunityRoleModel = {
          contactId: role.contactId,
          contactName: firstText(role.contactName, contact?.name, '未知联系人'),
          title: firstText(role.title, contact?.title) || undefined,
          roleType,
          roleLabel: ROLE_LABELS[roleType],
          influence: role.influence,
          stance: role.stance,
          coverageStatus: role.coverageStatus,
          lastEngagedAt: normalizeDate(role.lastEngagedAt),
          nextAction: nextActionForPersistedRole(role),
          source: 'persisted',
          confidence: role.confidence,
          notes: role.notes,
        };
        return model;
      })
      .sort((a, b) => {
        const influenceRank: Record<OpportunityRoleInfluence, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
        return influenceRank[a.influence] - influenceRank[b.influence] || a.contactName.localeCompare(b.contactName);
      });
    const gaps = buildGaps({ roles, opportunity: params.opportunity });
    return { roles, gaps, status: statusFromGaps(gaps) };
  }

  const roles = params.contacts
    .map((contact) => {
      const roleType = contact.role ?? 'unknown';
      const status = coverageStatus(contact);
      const model: ContactOpportunityRoleModel = {
        contactId: contact.id,
        contactName: contact.name,
        title: contact.title,
        roleType,
        roleLabel: ROLE_LABELS[roleType],
        influence: roleInfluence(roleType),
        stance: roleStance(roleType),
        coverageStatus: status,
        lastEngagedAt: normalizeDate(contact.lastContactedAt),
        nextAction: nextActionForRole(contact, status),
        source: contact.roleSource ? 'contact_profile' : 'inferred',
      };
      return model;
    })
    .sort((a, b) => {
      const influenceRank: Record<OpportunityRoleInfluence, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
      return influenceRank[a.influence] - influenceRank[b.influence] || a.contactName.localeCompare(b.contactName);
    });

  const gaps = buildGaps({ roles, opportunity: params.opportunity });
  return { roles, gaps, status: statusFromGaps(gaps) };
}

function eventTime(...values: Array<string | undefined | null>): string {
  return normalizeDate(values.find(Boolean) ?? undefined) ?? new Date(0).toISOString();
}

function eventTitleFallback(value: string | undefined, fallback: string): string {
  return firstText(value, fallback);
}

export function buildUnifiedTimeline(params: {
  opportunity: Opportunity;
  accountId: string;
  persistedEvents?: UnifiedTimelineEvent[];
  intelItems?: IntelItem[];
  decodes?: SavedDecode[];
  composedEmails?: ComposedEmail[];
  tasks?: Task[];
  limit?: number;
}): UnifiedTimelineModel {
  const opportunity = params.opportunity;
  if (params.persistedEvents?.length) {
    const filtered = params.persistedEvents
      .filter((event) => {
        const linkedToOpportunity = event.relatedOpportunityId === opportunity.id;
        const linkedToAccountOnly = !event.relatedOpportunityId && event.relatedAccountId === params.accountId;
        return linkedToOpportunity || linkedToAccountOnly;
      })
      .map((event) => ({ ...event, source: event.source ?? 'persisted' as const }))
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, params.limit ?? 12);

    const meaningful = filtered.find((event) => event.type !== 'stage_change' && event.type !== 'close_date');
    const lastMeaningfulActivityAt = meaningful?.occurredAt;
    const staleDays = daysSince(lastMeaningfulActivityAt);
    return {
      events: filtered,
      lastMeaningfulActivityAt,
      stale: staleDays !== null ? staleDays > 21 : filtered.length <= 2,
    };
  }

  const events: UnifiedTimelineEvent[] = [];

  events.push({
    id: 'opportunity-stage-' + opportunity.id + '-' + opportunity.stage,
    type: 'stage_change',
    occurredAt: eventTime(opportunity.updatedAt, opportunity.createdAt),
    title: '商机阶段：' + opportunity.stage,
    detail: opportunity.notes,
    relatedContactIds: [],
    relatedOpportunityId: opportunity.id,
    relatedAccountId: params.accountId,
    actionLabel: '检查阶段证据',
    href: '/pipeline/' + opportunity.id + '?tab=meddicc',
    source: 'dynamic',
  });

  if (opportunity.expectedCloseDate) {
    events.push({
      id: 'opportunity-close-' + opportunity.id,
      type: 'close_date',
      occurredAt: eventTime(opportunity.updatedAt, opportunity.createdAt),
      title: '预计关单：' + opportunity.expectedCloseDate,
      relatedContactIds: [],
      relatedOpportunityId: opportunity.id,
      relatedAccountId: params.accountId,
      actionLabel: '核对推进计划',
      href: '/pipeline/' + opportunity.id + '?tab=execution',
      source: 'dynamic',
    });
  }

  for (const item of params.intelItems ?? []) {
    events.push({
      id: 'intel-' + item.id,
      type: item.source === 'meeting' ? 'meeting' : item.source === 'call' ? 'call' : item.source === 'chat' ? 'chat' : 'intel',
      occurredAt: eventTime(item.date),
      title: eventTitleFallback(item.title, '客户信号'),
      detail: firstText(item.summary, item.content),
      relatedContactIds: item.relatedContactIds ?? [],
      relatedOpportunityId: item.opportunityId,
      relatedAccountId: item.accountId,
      actionLabel: '查看信号',
      href: '/intel',
      source: 'dynamic',
    });
  }

  for (const decode of params.decodes ?? []) {
    events.push({
      id: 'decode-' + decode.id,
      type: decode.signalSource === 'meeting' ? 'meeting' : decode.signalSource === 'call' ? 'call' : decode.signalSource === 'chat' ? 'chat' : 'email',
      occurredAt: eventTime(decode.date),
      title: eventTitleFallback(decode.decode.threadAnalysis?.keySignal, decode.clientName ?? '客户沟通'),
      actor: firstText(decode.originalSenderName, decode.clientName),
      detail: firstText(decode.decode.stableJudgment?.recommended_next_action, decode.emailText),
      relatedContactIds: decode.matchedContactId ? [decode.matchedContactId] : [],
      relatedOpportunityId: decode.opportunityId,
      relatedAccountId: decode.accountId,
      actionLabel: '查看解读',
      href: '/decode?decodeId=' + decode.id,
      source: 'dynamic',
    });
  }

  for (const email of params.composedEmails ?? []) {
    events.push({
      id: 'composed-email-' + email.id,
      type: 'email',
      occurredAt: eventTime(email.sentAt, email.createdAt),
      title: (email.status === 'sent' ? '已发送' : '邮件草稿') + '：' + email.subject,
      actor: email.contactName,
      detail: firstText(email.goal, email.body),
      relatedContactIds: email.contactId ? [email.contactId] : [],
      relatedOpportunityId: email.opportunityId,
      relatedAccountId: email.accountId,
      actionLabel: email.status === 'sent' ? '查看邮件' : '继续编辑',
      href: '/compose',
      source: 'dynamic',
    });
  }

  for (const task of params.tasks ?? []) {
    events.push({
      id: 'task-' + task.id,
      type: 'task',
      occurredAt: eventTime(task.updatedAt, task.createdAt, task.dueDate),
      title: (task.status === 'done' ? '完成任务' : '任务') + '：' + task.title,
      detail: task.description,
      relatedContactIds: task.contactId ? [task.contactId] : [],
      relatedOpportunityId: task.opportunityId,
      relatedAccountId: task.accountId,
      actionLabel: task.status === 'done' ? '查看记录' : '处理任务',
      href: '/tasks',
      source: 'dynamic',
    });
  }

  const filtered = events
    .filter((event) => {
      const linkedToOpportunity = event.relatedOpportunityId === opportunity.id;
      const linkedToAccountOnly = !event.relatedOpportunityId && event.relatedAccountId === params.accountId;
      return linkedToOpportunity || linkedToAccountOnly || event.id.startsWith('opportunity-');
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, params.limit ?? 12);

  const meaningful = filtered.find((event) => event.type !== 'stage_change' && event.type !== 'close_date');
  const lastMeaningfulActivityAt = meaningful?.occurredAt;
  const staleDays = daysSince(lastMeaningfulActivityAt);

  return {
    events: filtered,
    lastMeaningfulActivityAt,
    stale: staleDays !== null ? staleDays > 21 : filtered.length <= 2,
  };
}
