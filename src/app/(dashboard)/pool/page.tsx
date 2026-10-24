'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/i18n';

type PoolAccount = { id: string; name: string; industry: string | null; last_activity_at: string | null; last_activity: string | null };
export default function PoolPage() {
  const { locale } = useLocale(); const en = locale === 'en';
  const [accounts, setAccounts] = useState<PoolAccount[]>([]); const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true); const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/pool', { cache: 'no-store' }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load accounts');
    setAccounts(data.accounts); setUserId(data.userId);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [load]);
  async function claim(id: string) {
    setPending(id); setError(''); setMessage('');
    try {
      const response = await fetch('/api/accounts/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: id, toUserId: userId, reason: 'Self-claim from unassigned account pool' }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to claim account');
      await load(); setMessage(en ? 'Account assigned to you.' : '客户已分配给你。');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to claim account'); }
    finally { setPending(null); }
  }
  return <div className="mx-auto max-w-5xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">{en ? 'Unassigned accounts' : '客户公海'}</h1>
    <p className="text-sm text-muted">{en ? 'Claim an unassigned account in your organization. Automatic recycling, claim quotas and cooldown rules are not enabled by this page.' : '认领本组织内尚无负责人的客户。本页未启用自动回收、认领额度及冷却规则。'}</p>
    {loading && <p role="status">{en ? 'Loading…' : '加载中…'}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {message && <p role="status" className="text-positive">{message}</p>}
    {!loading && accounts.length === 0 && <p>{en ? 'No unassigned accounts.' : '暂无未分配客户。'}</p>}
    {accounts.map(account => <article key={account.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">{account.name}</h2><p className="text-sm text-muted">{account.industry}</p><p className="text-xs text-muted">{en ? 'Last activity' : '最后活动'}: {account.last_activity_at || account.last_activity ? new Date((account.last_activity_at || account.last_activity)!).toLocaleDateString(en ? 'en-US' : 'zh-CN') : '—'}</p></div><button disabled={pending !== null || !userId} className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => void claim(account.id)}>{pending === account.id ? (en ? 'Assigning…' : '分配中…') : (en ? 'Claim' : '认领')}</button></article>)}
  </div>;
}
