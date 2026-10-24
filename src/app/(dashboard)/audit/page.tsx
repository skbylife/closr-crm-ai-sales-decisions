'use client';
import { useState, useEffect, useMemo } from 'react';
import { Shield, Search, Download, Calendar } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { downloadCsv } from '@/lib/export-csv';

interface AuditEntry {
  id: string;
  userId: string;
  userName: string | null;
  action: string;
  objectType: string | null;
  recordId: string | null;
  recordName: string | null;
  accountName: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { zh: string; en: string; icon: string }> = {
  account_created: { zh: '创建客户', en: 'Account Created', icon: '➕' },
  account_updated: { zh: '修改客户', en: 'Account Updated', icon: '✏️' },
  account_deleted: { zh: '删除客户', en: 'Account Deleted', icon: '🗑️' },
  contact_created: { zh: '创建联系人', en: 'Contact Created', icon: '➕' },
  contact_deleted: { zh: '删除联系人', en: 'Contact Deleted', icon: '🗑️' },
  contact_role_changed: { zh: '变更联系人角色', en: 'Contact Role Changed', icon: '🔄' },
  intel_created: { zh: '新增情报', en: 'Intel Created', icon: '🔍' },
  decode_created: { zh: '邮件解读', en: 'Decode Created', icon: '📧' },
  knowledge_created: { zh: '新增知识', en: 'Knowledge Created', icon: '📚' },
  opportunity_created: { zh: '创建商机', en: 'Opportunity Created', icon: '💰' },
  deal_stage_changed: { zh: '商机阶段变更', en: 'Deal Stage Changed', icon: '📊' },
  task_created: { zh: '创建任务', en: 'Task Created', icon: '📋' },
  task_updated: { zh: '更新任务', en: 'Task Updated', icon: '✏️' },
  task_deleted: { zh: '删除任务', en: 'Task Deleted', icon: '🗑️' },
  task_completed: { zh: '完成任务', en: 'Task Completed', icon: '✅' },
  data_imported: { zh: '数据导入', en: 'Data Imported', icon: '📥' },
  data_exported: { zh: '数据导出', en: 'Data Exported', icon: '📤' },
  login: { zh: '登录', en: 'Login', icon: '🔐' },
  ai_decode: { zh: 'AI 解读', en: 'AI Decode', icon: '🤖' },
  ai_strategy: { zh: 'AI 策略', en: 'AI Strategy', icon: '🧠' },
  permission_changed: { zh: '权限变更', en: 'Permission Changed', icon: '🔒' },
};

const OBJECT_LABELS: Record<string, { zh: string; en: string }> = {
  account: { zh: '客户', en: 'Account' },
  contact: { zh: '联系人', en: 'Contact' },
  opportunity: { zh: '商机', en: 'Opportunity' },
  task: { zh: '任务', en: 'Task' },
  intel: { zh: '情报', en: 'Intel' },
  decode: { zh: '邮件解读', en: 'Decode' },
  knowledge: { zh: '知识', en: 'Knowledge' },
  strategy: { zh: 'AI 策略', en: 'Strategy' },
};

type TimeRange = 'today' | 'week' | 'month' | 'all';

function getTimeRangeStart(range: TimeRange): string | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    now.setDate(now.getDate() - 7);
  } else if (range === 'month') {
    now.setMonth(now.getMonth() - 1);
  }
  return now.toISOString();
}

export default function AuditPage() {
  const { t, locale } = useLocale();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [filterObject, setFilterObject] = useState('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [search, setSearch] = useState('');

  function handleFilterActionChange(value: string) {
    setLoading(true);
    setFilterAction(value);
  }

  function handleFilterObjectChange(value: string) {
    setLoading(true);
    setFilterObject(value);
  }

  function handleTimeRangeChange(value: TimeRange) {
    setLoading(true);
    setTimeRange(value);
  }

  function handleSearchChange(value: string) {
    setLoading(true);
    setSearch(value);
  }

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterAction !== 'all') params.set('action', filterAction);
    if (filterObject !== 'all') params.set('objectType', filterObject);
    const from = getTimeRangeStart(timeRange);
    if (from) params.set('from', from);
    if (search) params.set('search', search);
    params.set('limit', '500');

    fetch(`/api/audit-log?${params}`)
      .then(r => r.json())
      .then(data => { setLogs(data.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filterAction, filterObject, timeRange, search]);

  const actionTypes = useMemo(() => {
    const types = new Set(logs.map(l => l.action));
    return Array.from(types).sort();
  }, [logs]);

  const objectTypes = useMemo(() => {
    const types = new Set(logs.map(l => l.objectType).filter(Boolean) as string[]);
    return Array.from(types).sort();
  }, [logs]);

  function getActionLabel(action: string): { label: string; icon: string } {
    const info = ACTION_LABELS[action];
    if (info) return { label: info[locale], icon: info.icon };
    return { label: action, icon: '📋' };
  }

  function getObjectLabel(objectType: string | null): string {
    if (!objectType) return '';
    const info = OBJECT_LABELS[objectType];
    return info ? info[locale] : objectType;
  }

  function handleExportCsv() {
    const headers = [
      locale === 'zh' ? '时间' : 'Time',
      locale === 'zh' ? '操作人' : 'User',
      locale === 'zh' ? '操作' : 'Action',
      locale === 'zh' ? '对象类型' : 'Object Type',
      locale === 'zh' ? '记录名称' : 'Record Name',
      locale === 'zh' ? '摘要' : 'Summary',
    ];
    const rows = logs.map(log => [
      new Date(log.createdAt).toLocaleString('zh-CN'),
      log.userName || log.userId,
      getActionLabel(log.action).label,
      getObjectLabel(log.objectType),
      log.recordName || '',
      log.summary || '',
    ]);
    downloadCsv('audit-log', headers, rows);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('audit.title')}</h1>
          <p className="text-sm text-muted mt-1">{t('audit.description')}</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {t('audit.exportCsv')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={t('audit.searchPlaceholder')}
            className="form-input w-full"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <select
          value={filterAction}
          onChange={e => handleFilterActionChange(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
        >
          <option value="all">{t('audit.allActions')}</option>
          {actionTypes.map(a => {
            const info = getActionLabel(a);
            return <option key={a} value={a}>{info.icon} {info.label}</option>;
          })}
        </select>
        <select
          value={filterObject}
          onChange={e => handleFilterObjectChange(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs"
        >
          <option value="all">{t('audit.allObjects')}</option>
          {objectTypes.map(o => (
            <option key={o} value={o}>{getObjectLabel(o)}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2">
          <Calendar className="h-3.5 w-3.5 text-muted" />
          {(['today', 'week', 'month', 'all'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => handleTimeRangeChange(r)}
              className={`px-2 py-1 text-xs rounded ${timeRange === r ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
            >
              {t(r === 'all' ? 'audit.allTime' : `audit.${r}` as 'audit.today' | 'audit.week' | 'audit.month')}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {logs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Shield className="mx-auto h-10 w-10 text-muted mb-3" />
          <p className="text-sm text-muted">{t('audit.noRecords')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-background/50">
            <span className="text-xs text-muted">{logs.length} {locale === 'zh' ? '条记录' : 'records'}</span>
          </div>
          {logs.map(log => {
            const actionInfo = getActionLabel(log.action);
            return (
              <div key={log.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-background">
                <span className="text-lg">{actionInfo.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className="font-medium">{log.userName || log.userId}</span>
                    <span className="text-muted"> — </span>
                    <span className="font-medium">{actionInfo.label}</span>
                    {log.recordName && <span className="text-accent"> {log.recordName}</span>}
                  </p>
                  {log.summary && (
                    <p className="text-[12px] text-muted mt-0.5 truncate">{log.summary}</p>
                  )}
                </div>
                <span className="text-[12px] text-muted whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
