'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Search } from 'lucide-react';
import { useLocale } from '@/lib/i18n';

type PoolAccount = { id: string; name: string; industry: string | null; last_activity_at: string | null; last_activity: string | null; contact_count: number; opportunity_count: number };
export default function PoolPage() {
  const { locale } = useLocale(); const en = locale === 'en';
  const [accounts, setAccounts] = useState<PoolAccount[]>([]); const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true); const [pending, setPending] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'activity'>('name');
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
  const activityTime = (account: PoolAccount) => Date.parse(account.last_activity_at || account.last_activity || '') || 0;
  const visible = accounts.filter(account => `${account.name} ${account.industry ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => sort === 'activity' ? activityTime(b) - activityTime(a) : a.name.localeCompare(b.name, en ? 'en' : 'zh'));
  return <div className="mx-auto max-w-5xl space-y-4 p-6">
    <h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-accent" />{en ? 'Unassigned accounts' : '客户公海'}</h1>
    <p className="text-sm text-muted">{en ? 'Claim an unassigned account in your organization. Automatic recycling, claim quotas and cooldown rules are not enabled by this page.' : '认领本组织内尚无负责人的客户。本页未启用自动回收、认领额度及冷却规则。'}</p>
    <div className="flex flex-wrap gap-3"><label className="relative flex-1"><span className="sr-only">{en ? 'Search pool' : '搜索公海'}</span><Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted" /><input className="form-input w-full" style={{ paddingLeft: 36 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={en ? 'Search account or industry' : '搜索客户或行业'} /></label><select aria-label={en ? 'Sort pool' : '公海排序'} className="form-input" value={sort} onChange={e => setSort(e.target.value as 'name' | 'activity')}><option value="name">{en ? 'Account name' : '客户名称'}</option><option value="activity">{en ? 'Latest activity' : '最近活动'}</option></select></div>
    {!loading && <p className="text-xs text-muted">{en ? `${visible.length} of ${accounts.length} unassigned accounts. Counts include records you can access.` : `共 ${accounts.length} 个公海客户，当前显示 ${visible.length} 个。数量仅包含你有权查看的记录。`}</p>}
    {loading && <p role="status">{en ? 'Loading…' : '加载中…'}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    {message && <p role="status" className="text-positive">{message}</p>}
    {!loading && visible.length === 0 && <p>{en ? 'No matching unassigned accounts.' : '暂无匹配的公海客户。'}</p>}
    {visible.map(account => <article key={account.id} className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold"><Link className="hover:text-accent" href={`/accounts/${encodeURIComponent(account.id)}`}>{account.name}</Link></h2><p className="text-sm text-muted">{account.industry || (en ? 'Industry not recorded' : '行业未记录')} · {account.contact_count} {en ? 'contacts' : '位联系人'} · {account.opportunity_count} {en ? 'opportunities' : '个商机'}</p><p className="text-xs text-muted">{en ? 'Last activity' : '最后活动'}: {activityTime(account) ? new Date(activityTime(account)).toLocaleDateString(en ? 'en-US' : 'zh-CN') : '—'}</p></div><button disabled={pending !== null || !userId} className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-50" onClick={() => void claim(account.id)}>{pending === account.id ? (en ? 'Assigning…' : '分配中…') : (en ? 'Claim' : '认领')}</button></article>)}
  </div>;
}
