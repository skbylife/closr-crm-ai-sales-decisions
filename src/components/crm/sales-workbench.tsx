'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListTodo, ScanLine, UsersRound } from 'lucide-react';
import type { SalesWorkbenchActionPriority, SalesWorkbenchActionType, SalesWorkbenchModel } from '@/lib/crm-foundation/sales-workbench';
import type { Locale } from '@/lib/i18n';

function l(locale: Locale, zh: string, en: string): string {
  return locale === 'en' ? en : zh;
}

function priorityClass(priority: SalesWorkbenchActionPriority): string {
  if (priority === 'critical') return 'border-danger/25 bg-danger/5 text-danger';
  if (priority === 'high') return 'border-warning/25 bg-warning/5 text-warning';
  if (priority === 'medium') return 'border-accent/25 bg-accent/5 text-accent';
  return 'border-border bg-background text-secondary';
}

function priorityLabel(priority: SalesWorkbenchActionPriority, locale: Locale): string {
  if (priority === 'critical') return l(locale, '紧急', 'Critical');
  if (priority === 'high') return l(locale, '高优先', 'High');
  if (priority === 'medium') return l(locale, '中优先', 'Medium');
  return l(locale, '低优先', 'Low');
}

function typeLabel(type: SalesWorkbenchActionType, locale: Locale): string {
  if (type === 'lead') return l(locale, '线索', 'Lead');
  if (type === 'inspection') return l(locale, '商机', 'Deal');
  return l(locale, '任务', 'Task');
}

function typeIcon(type: SalesWorkbenchActionType) {
  if (type === 'lead') return ScanLine;
  if (type === 'inspection') return AlertTriangle;
  return ListTodo;
}

function metricToneClass(tone: 'neutral' | 'danger' | 'warning' | 'accent') {
  if (tone === 'danger') return 'text-danger';
  if (tone === 'warning') return 'text-warning';
  if (tone === 'accent') return 'text-accent';
  return 'text-foreground';
}

function MetricCard({
  href,
  value,
  label,
  hint,
  tone = 'neutral',
  icon: Icon,
}: {
  href: string;
  value: number;
  label: string;
  hint: string;
  tone?: 'neutral' | 'danger' | 'warning' | 'accent';
  icon: typeof UsersRound;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[92px] flex-col justify-between rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:border-accent/45 hover:bg-stripe"
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-4 w-4 text-muted transition-colors group-hover:text-accent" />
        <ArrowRight className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div>
        <p className={'text-2xl font-semibold tabular-nums ' + metricToneClass(tone)}>{value}</p>
        <p className="mt-0.5 text-[12px] font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
      </div>
    </Link>
  );
}

export function SalesWorkbench({ model, locale }: { model: SalesWorkbenchModel; locale: Locale }) {
  if (
    model.actions.length === 0
    && model.leadCount === 0
    && model.criticalDealCount === 0
    && model.watchDealCount === 0
    && model.overdueTaskCount === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-[var(--dash-card-shadow)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{l(locale, '今日优先队列', 'Today priority queue')}</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{l(locale, '销售工作台', 'Sales Workbench')}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary">
            {l(
              locale,
              '把线索、风险商机和逾期任务压成今天最该处理的动作队列。',
              'Compress leads, risky deals, and overdue work into the actions that matter today.',
            )}
          </p>
        </div>
        <Link
          href="/horizon"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-background hover:text-foreground"
        >
          {l(locale, '查看优先队列', 'Open priority queue')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard href="/leads" value={model.leadCount} label={l(locale, '待处理线索', 'Open leads')} hint={l(locale, '需要分派或转化', 'Route or convert')} tone="accent" icon={ScanLine} />
        <MetricCard href="/horizon" value={model.criticalDealCount} label={l(locale, '紧急商机', 'Critical deals')} hint={l(locale, '需要经理介入', 'Needs intervention')} tone="danger" icon={AlertTriangle} />
        <MetricCard href="/horizon" value={model.watchDealCount} label={l(locale, '观察商机', 'Watch deals')} hint={l(locale, '风险正在形成', 'Risk forming')} tone="warning" icon={UsersRound} />
        <MetricCard href="/tasks" value={model.overdueTaskCount} label={l(locale, '逾期任务', 'Overdue tasks')} hint={l(locale, '阻塞执行回写', 'Blocks writeback')} icon={Clock3} />
      </div>

      {model.actions.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[84px_1fr] gap-3 border-b border-border bg-background px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted md:grid-cols-[96px_108px_1fr_220px_28px]">
            <span>{l(locale, '优先级', 'Priority')}</span>
            <span className="hidden md:block">{l(locale, '类型', 'Type')}</span>
            <span>{l(locale, '对象', 'Target')}</span>
            <span className="hidden md:block">{l(locale, '建议动作', 'Action')}</span>
            <span className="hidden md:block" />
          </div>
          {model.actions.slice(0, 8).map((action) => {
            const Icon = typeIcon(action.type);
            return (
              <Link
                key={action.id}
                href={action.href}
                className="grid min-h-[72px] grid-cols-[84px_1fr] gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-background md:grid-cols-[96px_108px_1fr_220px_28px] md:items-center"
              >
                <span className={'inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ' + priorityClass(action.priority)}>
                  {priorityLabel(action.priority, locale)}
                </span>
                <span className="hidden items-center gap-1.5 text-[12px] font-medium text-secondary md:inline-flex">
                  <Icon className="h-3.5 w-3.5" />
                  {typeLabel(action.type, locale)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{action.title}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted">{action.subtitle || '-'}</p>
                </div>
                <span className="hidden text-[12px] font-medium leading-5 text-secondary md:block">{action.action}</span>
                <ArrowRight className="hidden h-4 w-4 text-muted md:block" />
              </Link>
            );
          })}
        </div>
      )}

      {model.actions.length === 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-4 text-sm text-secondary">
          <CheckCircle2 className="h-4 w-4 text-positive" />
          {l(locale, '今天没有需要立即处理的销售动作。', 'No urgent sales actions right now.')}
        </div>
      )}
    </section>
  );
}
