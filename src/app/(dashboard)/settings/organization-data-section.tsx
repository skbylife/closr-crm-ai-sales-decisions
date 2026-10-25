'use client';
import { useState } from 'react';
import { useLocale } from '@/lib/i18n';

type Preview = { orgId: string; counts: { table: string; count: number }[] };
export default function OrganizationDataSection() {
  const { locale } = useLocale(); const en = locale === 'en';
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function inspect() {
    setBusy(true); setError(''); setPreview(null);
    try {
      const response = await fetch('/api/organization/data-management', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 403 ? (en ? 'Only the organization owner can view this preview.' : '仅组织所有者可查看此预览。') : response.status === 409 ? (en ? 'Multiple or changed memberships: organization selection must be resolved before proceeding.' : '存在多个组织成员关系或身份已变更，必须先明确当前组织。') : (en ? 'Unable to load preview. Sign in again or retry.' : '无法加载预览，请重新登录或重试。'));
      setPreview(await response.json());
    } catch (failure) { setError(failure instanceof Error ? failure.message : (en ? 'Preview failed.' : '预览失败。')); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = en ? { accounts: 'Accounts', contacts: 'Contacts', opportunities: 'Opportunities', products: 'Products', quotes: 'Quotes' } : { accounts: '客户', contacts: '联系人', opportunities: '商机', products: '产品', quotes: '报价' };
  return <section className="mt-6 border-t border-border pt-5 space-y-3">
    <h3 className="text-sm font-semibold">{en ? 'Organization data cleanup' : '组织数据清理'}</h3>
    <p className="text-xs text-muted">{en ? 'Owner-only inventory preview of five primary business categories, not a complete backup or deletion scope. No records or attachments are changed.' : '仅组织所有者可预览五类主要业务记录数量。这不是完整备份或删除范围，不会修改任何记录或附件。'}</p>
    <button disabled={busy} onClick={() => void inspect()} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">{busy ? (en ? 'Loading…' : '加载中…') : (en ? 'Preview organization records' : '预览组织记录')}</button>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {preview && <div><p className="mb-2 break-all text-xs text-secondary">{en ? 'Organization ID' : '组织 ID'}: {preview.orgId}</p><dl className="grid grid-cols-2 gap-2 text-sm">{preview.counts.map(row => <div key={row.table} className="flex justify-between gap-3 rounded bg-sidebar p-2"><dt>{labels[row.table] ?? row.table}</dt><dd>{row.count}</dd></div>)}</dl></div>}
    <button disabled className="rounded-lg border border-danger/40 px-4 py-2 text-sm text-muted">{en ? 'Clear organization data — unavailable' : '清空组织数据 — 暂不可用'}</button>
    <p className="text-xs text-muted">{en ? 'Bulk deletion remains disabled until explicit tenant selection, reauthentication, verified recoverable backups and atomic deletion are implemented and tested. User accounts, membership, MFA, general BABEL knowledge and audit records must be preserved.' : '批量删除暂未启用。须先完成并验证明确租户选择、重新认证、可恢复备份及事务删除；用户账号、成员关系、MFA、通用 BABEL 知识与审计记录必须保留。'}</p>
  </section>;
}
