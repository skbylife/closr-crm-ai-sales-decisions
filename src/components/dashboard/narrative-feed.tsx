'use client';

import Link from 'next/link';
import { Mail, AlertTriangle, Clock, Brain, TrendingUp } from 'lucide-react';

interface NarrativeFeedProps {
  accounts: Array<{ id: string; name: string; dealHealth?: string; lastActivity?: string }>;
  opportunities: Array<{ id: string; name: string; accountId: string; stage: string; value: number; updatedAt?: string; createdAt: string; meddicc?: { overallScore?: number } }>;
  emailDecodes: Array<{ id: string; accountId?: string; accountName?: string; clientName?: string; date: string; decode?: { threadAnalysis?: { keySignal?: string } }; emailText: string }>;
  tasks: Array<{ id: string; title: string; status: string; dueDate?: string; priority: string; updatedAt?: string; createdAt: string; accountId?: string; opportunityId?: string }>;
  intelItems: Array<{ id: string; accountId: string; accountName: string; title?: string; summary: string; date: string }>;
}

interface NarrativeItem {
  id: string;
  icon: React.ReactNode;
  text: string;
  date: string;
  href?: string;
  isRisk: boolean;
  linkLabel?: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function buildNarratives(props: NarrativeFeedProps): NarrativeItem[] {
  const items: NarrativeItem[] = [];
  const { accounts, opportunities, emailDecodes, tasks, intelItems } = props;
  const accountMap = new Map(accounts.map(a => [a.id, a.name]));

  for (const ed of emailDecodes) {
    const signal = ed.decode?.threadAnalysis?.keySignal;
    if (!signal) continue;
    const name = ed.accountName || ed.clientName || '未知客户';
    items.push({
      id: `email-${ed.id}`,
      icon: <Mail className="w-4 h-4 text-blue-400" />,
      text: `${name} 发现关键信号: ${signal}`,
      date: ed.date,
      href: ed.accountId ? `/accounts/${ed.accountId}` : undefined,
      isRisk: false,
      linkLabel: ed.accountId ? '打开账户' : undefined,
    });
  }

  for (const opp of opportunities) {
    const score = opp.meddicc?.overallScore;
    if (score == null || score >= 40) continue;
    items.push({
      id: `risk-${opp.id}`,
      icon: <AlertTriangle className="w-4 h-4" style={{ color: 'var(--dash-severity-critical)' }} />,
      text: `${opp.name} MEDDICC 评分 ${score}，需要关注`,
      date: opp.updatedAt || opp.createdAt,
      href: `/accounts/${opp.accountId}`,
      isRisk: true,
      linkLabel: '打开账户',
    });
  }

  const now = new Date();
  for (const task of tasks) {
    if (task.status === 'done' || !task.dueDate) continue;
    if (new Date(task.dueDate) >= now) continue;
    const taskHref = task.accountId
      ? `/accounts/${task.accountId}`
      : task.opportunityId
        ? `/pipeline/${task.opportunityId}`
        : '/tasks';
    items.push({
      id: `task-${task.id}`,
      icon: <Clock className="w-4 h-4" style={{ color: 'var(--dash-severity-critical)' }} />,
      text: `${task.title} 已逾期`,
      date: task.dueDate,
      href: taskHref,
      isRisk: true,
      linkLabel: task.opportunityId ? '打开商机' : task.accountId ? '打开账户' : '打开任务',
    });
  }

  for (const intel of intelItems) {
    const label = intel.title || intel.summary.slice(0, 30);
    items.push({
      id: `intel-${intel.id}`,
      icon: <Brain className="w-4 h-4 text-purple-400" />,
      text: `${intel.accountName} 新增情报: ${label}`,
      date: intel.date,
      href: `/accounts/${intel.accountId}`,
      isRisk: false,
      linkLabel: '打开账户',
    });
  }

  const sevenDaysAgo = Date.now() - 7 * 86400000;
  for (const opp of opportunities) {
    const updated = opp.updatedAt ? new Date(opp.updatedAt).getTime() : 0;
    if (updated < sevenDaysAgo) continue;
    if (items.some(i => i.id === `risk-${opp.id}`)) continue;
    const acctName = accountMap.get(opp.accountId) || '';
    const prefix = acctName ? `${acctName} - ` : '';
    items.push({
      id: `stage-${opp.id}`,
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
      text: `${prefix}${opp.name} 进入 ${opp.stage} 阶段`,
      date: opp.updatedAt || opp.createdAt,
      href: `/accounts/${opp.accountId}`,
      isRisk: false,
      linkLabel: '打开账户',
    });
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, 8);
}

export function NarrativeFeed(props: NarrativeFeedProps) {
  const items = buildNarratives(props);

  return (
    <section className="flex h-full min-h-[360px] flex-col overflow-hidden rounded-2xl border shadow-[var(--dash-card-shadow)]" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
      <div className="px-5 py-4" style={{ borderLeft: '2px solid var(--dash-severity-critical)' }}>
        <h3 className="text-sm font-semibold tracking-wide" style={{ color: 'var(--dash-text-primary)' }}>
          实时动态
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--dash-text-secondary)' }}>跨客户关键事件流</p>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--dash-text-tertiary)' }}>
          暂无动态
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto" style={{ borderColor: 'var(--dash-card-divider)' }}>
          {items.map((item) => {
            const inner = (
              <div
                className={`group flex items-start gap-3 px-5 py-3 transition-colors ${item.href ? 'cursor-pointer' : 'cursor-default'}`}
                onMouseEnter={(e) => {
                  if (item.href) e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div className="mt-0.5 shrink-0">{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: item.isRisk ? 'var(--dash-icon-accent)' : 'var(--dash-text-primary)' }}
                      >
                        {item.text}
                      </p>
                      <span className="mt-1 block text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                        {timeAgo(item.date)}
                      </span>
                    </div>
                    {item.href ? (
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: 'var(--dash-card-border)', color: 'var(--dash-link-accent)' }}>
                        {item.linkLabel ?? '打开'}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                        仅提示
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );

            return (
              <li key={item.id} style={{ borderColor: 'var(--dash-card-divider)' }}>
                {item.href ? (
                  <Link href={item.href} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
