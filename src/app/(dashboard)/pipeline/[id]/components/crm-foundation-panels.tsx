'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ContactRound, ListPlus, Radio, RefreshCw, Save, UserPlus } from 'lucide-react';
import type { ComposedEmail, Contact, ContactRole, IntelItem, Opportunity, SavedDecode, Task } from '@/lib/babel-engine/types';
import { useStore } from '@/lib/store';
import {
  buildContactOpportunityCoverage,
  buildUnifiedTimeline,
  type ContactOpportunityRoleModel,
  type OpportunityCoverageGap,
  type OpportunityRoleCoverageStatus,
  type OpportunityRoleInfluence,
  type OpportunityRoleStance,
  type PersistedOpportunityRoleInput,
  type UnifiedTimelineEvent,
  type TimelineEventType,
} from '@/lib/crm-foundation/opportunity-workbench';

const roleOptions: Array<{ value: ContactRole; label: string }> = [
  { value: 'unknown', label: '待确认' },
  { value: 'champion', label: '内部推动者' },
  { value: 'economic_buyer', label: '经济买家' },
  { value: 'decision_maker', label: '决策者' },
  { value: 'technical_evaluator', label: '技术评估' },
  { value: 'procurement', label: '采购' },
  { value: 'legal', label: '法务' },
  { value: 'finance', label: '财务' },
  { value: 'blocker', label: '阻碍者' },
  { value: 'coach', label: '教练' },
  { value: 'influencer', label: '影响者' },
  { value: 'end_user', label: '最终用户' },
  { value: 'contact', label: '一般联系人' },
];

const statusLabel: Record<OpportunityRoleCoverageStatus, string> = {
  covered: '已覆盖',
  needs_touch: '需触达',
  missing: '待确认',
};

const statusOptions: Array<{ value: OpportunityRoleCoverageStatus; label: string }> = Object.entries(statusLabel).map(([value, label]) => ({
  value: value as OpportunityRoleCoverageStatus,
  label,
}));

const stanceLabel: Record<OpportunityRoleStance, string> = {
  supportive: '支持',
  neutral: '中性',
  risk: '阻力',
  unknown: '未知',
};

const influenceLabel: Record<OpportunityRoleInfluence, string> = {
  high: '高',
  medium: '中',
  low: '低',
  unknown: '未知',
};

const influenceOptions: Array<{ value: OpportunityRoleInfluence; label: string }> = Object.entries(influenceLabel).map(([value, label]) => ({
  value: value as OpportunityRoleInfluence,
  label,
}));

const eventLabel: Record<TimelineEventType, string> = {
  email: '邮件',
  meeting: '会议',
  call: '电话',
  chat: 'IM',
  intel: '信号',
  task: '任务',
  stage_change: '阶段',
  close_date: '关单日',
  document: '文档',
  note: '备注',
};

function gapTone(gap: OpportunityCoverageGap): string {
  if (gap.severity === 'high') return 'border-danger/20 bg-danger/5 text-danger';
  if (gap.severity === 'medium') return 'border-warning/20 bg-warning/5 text-warning';
  return 'border-border bg-muted/20 text-secondary';
}

function stanceTone(stance: OpportunityRoleStance): string {
  if (stance === 'supportive') return 'border-positive/20 bg-positive/5 text-positive';
  if (stance === 'risk') return 'border-danger/20 bg-danger/5 text-danger';
  if (stance === 'unknown') return 'border-border bg-muted/20 text-muted';
  return 'border-border bg-background text-secondary';
}

function statusTone(status: OpportunityRoleCoverageStatus): string {
  if (status === 'covered') return 'text-positive';
  if (status === 'needs_touch') return 'text-warning';
  return 'text-danger';
}

function formatDate(value?: string): string {
  if (!value) return '未记录';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未记录';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function eventDot(type: TimelineEventType): string {
  if (type === 'task') return 'bg-positive';
  if (type === 'email' || type === 'meeting' || type === 'call' || type === 'chat') return 'bg-accent';
  if (type === 'stage_change' || type === 'close_date') return 'bg-warning';
  return 'bg-muted';
}

export function ContactOpportunityRolePanel({ opportunity, contacts }: { opportunity: Opportunity; contacts: Contact[] }) {
  const addTask = useStore((s) => s.addTask);
  const [persistedRoles, setPersistedRoles] = useState<PersistedOpportunityRoleInput[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = () => {
    fetch('/api/opportunity-roles?opportunityId=' + encodeURIComponent(opportunity.id))
      .then((res) => res.ok ? res.json() : null)
      .then((data: { roles?: PersistedOpportunityRoleInput[] } | null) => {
        if (data?.roles) setPersistedRoles(data.roles);
      })
      .catch(() => setPersistedRoles([]));
  };

  useEffect(() => {
    let active = true;
    fetch('/api/opportunity-roles?opportunityId=' + encodeURIComponent(opportunity.id))
      .then((res) => res.ok ? res.json() : null)
      .then((data: { roles?: PersistedOpportunityRoleInput[] } | null) => {
        if (active && data?.roles) setPersistedRoles(data.roles);
      })
      .catch(() => {
        if (active) setPersistedRoles([]);
      });
    return () => {
      active = false;
    };
  }, [opportunity.id]);

  const coverage = buildContactOpportunityCoverage({ opportunity, contacts, persistedRoles });
  const headline = coverage.status === 'strong'
    ? '关键角色已覆盖'
    : coverage.status === 'needs_work'
      ? '关系覆盖需要补强'
      : '关系覆盖薄弱';

  async function saveRole(role: ContactOpportunityRoleModel, patch: Partial<PersistedOpportunityRoleInput>) {
    setSavingId(role.contactId);
    setError(null);
    const payload = {
      contactId: role.contactId,
      opportunityId: opportunity.id,
      roleType: patch.roleType ?? role.roleType,
      influence: patch.influence ?? role.influence,
      stance: patch.stance ?? role.stance,
      coverageStatus: patch.coverageStatus ?? role.coverageStatus,
      lastEngagedAt: patch.lastEngagedAt ?? role.lastEngagedAt ?? null,
      confidence: patch.confidence ?? role.confidence ?? 0.8,
      notes: patch.notes ?? role.notes ?? null,
    };
    try {
      const res = await fetch('/api/opportunity-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '角色保存失败');
      loadRoles();
    } catch (err) {
      setError(err instanceof Error ? err.message : '角色保存失败');
    } finally {
      setSavingId(null);
    }
  }

  async function recordInteraction(role: ContactOpportunityRoleModel) {
    setSavingId(role.contactId);
    setError(null);
    const now = new Date().toISOString();
    try {
      const res = await fetch('/api/timeline-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: opportunity.accountId,
          opportunityId: opportunity.id,
          contactId: role.contactId,
          type: 'note',
          occurredAt: now,
          title: '记录互动：' + role.contactName,
          detail: role.nextAction,
          metadata: { source: 'opportunity_role_panel', roleType: role.roleType },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? '互动记录失败');
      await saveRole(role, { lastEngagedAt: now, coverageStatus: 'covered' });
      window.dispatchEvent(new CustomEvent('closr:timeline-event-created', { detail: { opportunityId: opportunity.id } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '互动记录失败');
      setSavingId(null);
    }
  }

  function createFollowUpTask(role: ContactOpportunityRoleModel) {
    const taskId = addTask({
      accountId: opportunity.accountId,
      opportunityId: opportunity.id,
      contactId: role.contactId,
      title: role.nextAction + '：' + role.contactName,
      description: '来自商机关系覆盖：' + role.roleLabel + ' / ' + stanceLabel[role.stance],
      status: 'todo',
      priority: role.coverageStatus === 'missing' || role.stance === 'risk' ? 'high' : 'medium',
      source: 'manual',
      aiGenerated: false,
    });
    setError(taskId ? null : '任务创建失败');
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ContactRound className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-foreground">商机关系覆盖</h2>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {headline}
            {persistedRoles.length > 0 && <span className="ml-2 text-xs font-normal text-muted">已确认角色</span>}
          </p>
        </div>
        <Link
          href={'/accounts/' + opportunity.accountId}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
        >
          <UserPlus className="h-3.5 w-3.5" />
          补联系人
        </Link>
      </div>

      {coverage.gaps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {coverage.gaps.map((gap) => (
            <span key={gap.id} className={'rounded-full border px-2.5 py-1 text-xs font-semibold ' + gapTone(gap)}>
              {gap.label} · {gap.action}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4 font-semibold">联系人</th>
              <th className="py-2 pr-4 font-semibold">角色</th>
              <th className="py-2 pr-4 font-semibold">影响力</th>
              <th className="py-2 pr-4 font-semibold">立场</th>
              <th className="py-2 pr-4 font-semibold">最近互动</th>
              <th className="py-2 pr-4 font-semibold">状态</th>
              <th className="py-2 font-semibold">动作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {coverage.roles.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-5 text-sm text-muted">先添加客户联系人。</td>
              </tr>
            ) : coverage.roles.map((role) => (
              <tr key={role.contactId}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-foreground">{role.contactName}</p>
                  {role.title && <p className="mt-0.5 text-xs text-muted">{role.title}</p>}
                </td>
                <td className="py-3 pr-4">
                  <select
                    value={role.roleType}
                    onChange={(event) => saveRole(role, { roleType: event.target.value as ContactRole })}
                    className="min-w-32 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground"
                    disabled={savingId === role.contactId}
                  >
                    {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </td>
                <td className="py-3 pr-4">
                  <select
                    value={role.influence}
                    onChange={(event) => saveRole(role, { influence: event.target.value as OpportunityRoleInfluence })}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground"
                    disabled={savingId === role.contactId}
                  >
                    {influenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </td>
                <td className="py-3 pr-4">
                  <span className={'rounded-full border px-2 py-0.5 text-xs font-medium ' + stanceTone(role.stance)}>
                    {stanceLabel[role.stance]}
                  </span>
                </td>
                <td className="py-3 pr-4 text-secondary">{formatDate(role.lastEngagedAt)}</td>
                <td className="py-3 pr-4">
                  <select
                    value={role.coverageStatus}
                    onChange={(event) => saveRole(role, { coverageStatus: event.target.value as OpportunityRoleCoverageStatus })}
                    className={'rounded-md border border-border bg-card px-2 py-1 text-xs font-medium ' + statusTone(role.coverageStatus)}
                    disabled={savingId === role.contactId}
                  >
                    {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </td>
                <td className="py-3">
                  <div className="flex min-w-44 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => recordInteraction(role)}
                      disabled={savingId === role.contactId}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/20 disabled:opacity-50"
                      title="记录一次互动并刷新覆盖状态"
                    >
                      {savingId === role.contactId ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      记录互动
                    </button>
                    <button
                      type="button"
                      onClick={() => createFollowUpTask(role)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/20"
                      title={role.nextAction}
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                      建任务
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function UnifiedTimelinePanel({
  opportunity,
  accountId,
  intelItems,
  decodes,
  composedEmails,
  tasks,
}: {
  opportunity: Opportunity;
  accountId: string;
  intelItems?: IntelItem[];
  decodes?: SavedDecode[];
  composedEmails?: ComposedEmail[];
  tasks?: Task[];
}) {
  const [persistedEvents, setPersistedEvents] = useState<UnifiedTimelineEvent[]>([]);
  const loadEvents = useCallback(() => {
    fetch('/api/timeline-events?opportunityId=' + encodeURIComponent(opportunity.id) + '&limit=20')
      .then((res) => res.ok ? res.json() : null)
      .then((data: { events?: UnifiedTimelineEvent[] } | null) => {
        if (data?.events) setPersistedEvents(data.events);
      })
      .catch(() => setPersistedEvents([]));
  }, [opportunity.id]);

  useEffect(() => {
    let active = true;
    fetch('/api/timeline-events?opportunityId=' + encodeURIComponent(opportunity.id) + '&limit=20')
      .then((res) => res.ok ? res.json() : null)
      .then((data: { events?: UnifiedTimelineEvent[] } | null) => {
        if (active && data?.events) setPersistedEvents(data.events);
      })
      .catch(() => {
        if (active) setPersistedEvents([]);
      });
    return () => {
      active = false;
    };
  }, [opportunity.id]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ opportunityId?: string }>).detail;
      if (detail?.opportunityId === opportunity.id) loadEvents();
    };
    window.addEventListener('closr:timeline-event-created', handler);
    return () => window.removeEventListener('closr:timeline-event-created', handler);
  }, [loadEvents, opportunity.id]);

  const timeline = buildUnifiedTimeline({ opportunity, accountId, persistedEvents, intelItems, decodes, composedEmails, tasks, limit: 8 });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-foreground">销售时间线</h2>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {timeline.lastMeaningfulActivityAt ? '最近有效活动：' + formatDate(timeline.lastMeaningfulActivityAt) : '缺少有效活动'}
          </p>
        </div>
        <span className={'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ' + (
          timeline.stale ? 'border-warning/20 bg-warning/5 text-warning' : 'border-positive/20 bg-positive/5 text-positive'
        )}>
          {timeline.stale ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {timeline.stale ? '需要更新' : '节奏正常'}
        </span>
      </div>

      {timeline.events.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted">
          <Clock className="h-4 w-4" />
          先记录一次客户活动。
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {timeline.events.map((event) => (
            <div key={event.id} className="grid gap-3 rounded-lg border border-border bg-background px-3 py-3 sm:grid-cols-[96px_1fr_auto]">
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                <span className={'h-2.5 w-2.5 rounded-full ' + eventDot(event.type)} />
                {formatDate(event.occurredAt)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-semibold text-secondary">
                    {eventLabel[event.type]}
                  </span>
                  <p className="truncate text-sm font-semibold text-foreground">{event.title}</p>
                </div>
                {event.detail && <p className="mt-1 line-clamp-2 text-xs leading-5 text-secondary">{event.detail}</p>}
              </div>
              {event.href && event.actionLabel ? (
                <Link href={event.href} className="self-start rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">
                  {event.actionLabel}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
