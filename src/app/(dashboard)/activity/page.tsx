'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  History,
  ShieldAlert,
  Loader2,
  Building2,
  Target,
  UserCog,
  CheckCircle2,
  Plus,
  ArrowRightLeft,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { dbGetActivityLogs, type ActivityLog } from '@/lib/db';
import { useLocale } from '@/lib/i18n';

const ACTION_TYPE_CONFIG: Record<string, { icon: typeof History; label: string; color: string }> = {
  account_created: { icon: Plus, label: '新建客户', color: 'text-blue-400' },
  contact_role_changed: { icon: UserCog, label: '更新联系人角色', color: 'text-purple-400' },
  opportunity_created: { icon: Target, label: '新建机会', color: 'text-green-400' },
  deal_stage_changed: { icon: ArrowRightLeft, label: '机会阶段变更', color: 'text-amber-400' },
  task_completed: { icon: CheckCircle2, label: '完成任务', color: 'text-emerald-400' },
};

const PAGE_SIZE = 30;

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getEntityLink(log: ActivityLog): string | null {
  if (log.entityType === 'account' && log.entityId) return `/accounts/${log.entityId}`;
  if (log.entityType === 'opportunity' && log.entityId) return `/pipeline/${log.entityId}`;
  if (log.accountId && log.entityType !== 'account') return `/accounts/${log.accountId}`;
  return null;
}

export default function ActivityPage() {
  const { orgId, orgRole } = useAuth();
  const { t } = useLocale();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('');
  const [showFilter, setShowFilter] = useState(false);

  const isAdmin = orgRole === 'owner' || orgRole === 'admin';

  const fetchLogs = useCallback(async (offset = 0, append = false) => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await dbGetActivityLogs({
        orgId,
        actionType: filterAction || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setLogs(prev => append ? [...prev, ...data] : data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      // RLS will return empty if not admin
    } finally {
      setLoading(false);
    }
  }, [orgId, filterAction]);

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, fetchLogs]);

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-[var(--chrome-ink-dim)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--chrome-ink)]">无权限访问</h2>
          <p className="mt-2 text-sm text-[var(--chrome-ink-sub)]">
            仅 Owner 和 Admin 可以查看活动日志。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="h-6 w-6 text-accent" />
            <h1 className="text-xl font-bold text-[var(--chrome-ink)]">{t('nav.activity')}</h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className="flex items-center gap-2 rounded-lg border border-[var(--chrome-border)] px-3 py-1.5 text-sm text-[var(--chrome-ink-sub)] hover:bg-[rgba(255,255,255,0.05)]"
            >
              <Filter className="h-4 w-4" />
              {filterAction ? ACTION_TYPE_CONFIG[filterAction]?.label ?? filterAction : '全部操作'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showFilter && (
              <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-[var(--chrome-border)] bg-[var(--chrome-bg)] py-1 shadow-lg">
                <button
                  onClick={() => { setFilterAction(''); setShowFilter(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.05)] ${!filterAction ? 'text-accent' : 'text-[var(--chrome-ink-sub)]'}`}
                >
                  全部操作
                </button>
                {Object.entries(ACTION_TYPE_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => { setFilterAction(key); setShowFilter(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.05)] ${filterAction === key ? 'text-accent' : 'text-[var(--chrome-ink-sub)]'}`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        {logs.length === 0 && !loading ? (
          <div className="py-16 text-center text-sm text-[var(--chrome-ink-dim)]">
            暂无活动记录
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--chrome-border)]" />

            <div className="space-y-1">
              {logs.map((log) => {
                const cfg = ACTION_TYPE_CONFIG[log.actionType] ?? { icon: History, label: log.actionType, color: 'text-[var(--chrome-ink-dim)]' };
                const Icon = cfg.icon;
                const link = getEntityLink(log);
                return (
                  <div key={log.id} className="relative flex items-start gap-4 py-3 pl-10">
                    {/* Timeline dot */}
                    <div className={`absolute left-3 top-4 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--chrome-bg)] ring-2 ring-[var(--chrome-border)]`}>
                      <Icon className={`h-3 w-3 ${cfg.color}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-[var(--chrome-ink)]">
                          {log.userDisplayName || '用户'}
                        </span>
                        <span className={`text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-[var(--chrome-ink-dim)]">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-[var(--chrome-ink-sub)]">
                        {log.summary}
                      </p>
                      {link && (
                        <Link
                          href={link}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Building2 className="h-3 w-3" />
                          {log.entityName || log.accountName || '查看'}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading / Load More */}
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--chrome-ink-dim)]" />
          </div>
        )}
        {!loading && hasMore && logs.length > 0 && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => fetchLogs(logs.length, true)}
              className="rounded-lg border border-[var(--chrome-border)] px-4 py-2 text-sm text-[var(--chrome-ink-sub)] hover:bg-[rgba(255,255,255,0.05)]"
            >
              加载更多
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
