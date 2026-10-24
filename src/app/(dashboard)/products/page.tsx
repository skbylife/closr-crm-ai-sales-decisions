'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/i18n';
import { appConfirm } from '@/lib/confirm-store';

type Product = { id: string; name: string; sku: string | null; description: string | null; unit_price: number; currency: string; category: string | null };
type Quote = { id: string; quote_number: string; account_id: string; opportunity_id: string; status: string; total: number; valid_until: string };
type Account = { id: string; name: string };
type Opportunity = Account & { account_id: string };
type Catalog = { products: Product[]; quotes: Quote[]; accounts: Account[]; opportunities: Opportunity[] };
const emptyProduct = { name: '', sku: '', description: '', unit_price: '0', currency: 'USD', category: '' };

export default function ProductsPage() {
  const { locale } = useLocale(); const en = locale === 'en';
  const [data, setData] = useState<Catalog>({ products: [], quotes: [], accounts: [], opportunities: [] });
  const [tab, setTab] = useState<'products' | 'quotes'>('products');
  const [search, setSearch] = useState(''); const [error, setError] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); const [showForm, setShowForm] = useState(false);
  const [product, setProduct] = useState(emptyProduct);
  const [quote, setQuote] = useState({ account_id: '', opportunity_id: '', valid_days: '30' });
  const load = useCallback(async () => {
    const response = await fetch('/api/catalog', { cache: 'no-store' }); const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load catalog');
    setData(result);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [load]);
  async function save(method: string, body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/catalog', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to save');
      await load(); setShowForm(false); setEditing(null); setProduct(emptyProduct);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save'); }
    finally { setBusy(false); }
  }
  async function remove(kind: string, id: string) {
    if (await appConfirm({ message: en ? 'Delete this record?' : '确定删除此记录？', variant: 'danger' })) await save('DELETE', { kind, id });
  }
  const accountName = (id: string) => data.accounts.find(a => a.id === id)?.name ?? (en ? 'Unavailable account' : '客户不可见');
  const opportunityName = (id: string) => data.opportunities.find(o => o.id === id)?.name ?? (en ? 'Unavailable opportunity' : '商机不可见');
  const products = data.products.filter(p => `${p.name} ${p.sku ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const quotes = data.quotes.filter(q => `${q.quote_number} ${accountName(q.account_id)}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto max-w-7xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">{en ? 'Products and quotes' : '产品与报价'}</h1>
    <div className="flex flex-wrap gap-3">
      <button onClick={() => { setTab('products'); setShowForm(false); }} className="rounded border border-border px-3 py-2">{en ? 'Product catalog' : '产品目录'}</button>
      <button onClick={() => { setTab('quotes'); setShowForm(false); }} className="rounded border border-border px-3 py-2">{en ? 'Quotes' : '报价单'}</button>
      <button disabled={busy || loading} onClick={() => { setEditing(null); setProduct(emptyProduct); setShowForm(true); }} className="rounded bg-accent px-3 py-2 text-white">{en ? 'Add record' : '新建记录'}</button>
    </div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {loading && <p role="status">{en ? 'Loading…' : '加载中…'}</p>}
    <input aria-label={en ? 'Search' : '搜索'} className="form-input w-full" placeholder={en ? 'Search records' : '搜索记录'} value={search} onChange={e => setSearch(e.target.value)} />
    {showForm && tab === 'products' && <form className="rounded-xl border border-border bg-card p-4 space-y-3" onSubmit={e => { e.preventDefault(); void save(editing ? 'PATCH' : 'POST', { kind: 'product', id: editing, ...product, unit_price: Number(product.unit_price) }); }}>
      <div className="grid gap-3 sm:grid-cols-2">{(['name', 'sku', 'description', 'category', 'currency', 'unit_price'] as const).map(key => <label key={key} className="text-sm">{{ name: en ? 'Name' : '名称', sku: 'SKU', description: en ? 'Description' : '描述', category: en ? 'Category' : '分类', currency: en ? 'Currency (ISO code)' : '币种（ISO代码）', unit_price: en ? 'Unit price' : '单价' }[key]}<input className="form-input mt-1 w-full" required={['name', 'currency', 'unit_price'].includes(key)} type={key === 'unit_price' ? 'number' : 'text'} min={key === 'unit_price' ? 0 : undefined} step={key === 'unit_price' ? 'any' : undefined} value={product[key]} onChange={e => setProduct({ ...product, [key]: e.target.value })} /></label>)}</div>
      <button disabled={busy} className="rounded bg-accent px-3 py-2 text-white">{en ? 'Save' : '保存'}</button>
      <button type="button" onClick={() => setShowForm(false)} className="px-3">{en ? 'Cancel' : '取消'}</button>
    </form>}
    {showForm && tab === 'quotes' && <form className="rounded-xl border border-border bg-card p-4 space-y-3" onSubmit={e => { e.preventDefault(); void save('POST', { kind: 'quote', ...quote, valid_days: Number(quote.valid_days) }); }}>
      <p className="text-sm text-muted">{en ? 'Create a zero-total draft linked to an existing account and opportunity. Line-item editing and sending are not available on this page; status changes only record the workflow state.' : '为已有客户与商机创建零金额草稿。本页尚不支持行项目编辑和发送；状态修改仅记录流程状态。'}</p>
      <label className="block">{en ? 'Account' : '客户'}<select required className="form-input w-full" value={quote.account_id} onChange={e => setQuote({ ...quote, account_id: e.target.value, opportunity_id: '' })}><option value="">{en ? 'Select account' : '选择客户'}</option>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="block">{en ? 'Opportunity' : '商机'}<select required className="form-input w-full" value={quote.opportunity_id} onChange={e => setQuote({ ...quote, opportunity_id: e.target.value })}><option value="">{en ? 'Select opportunity' : '选择商机'}</option>{data.opportunities.filter(o => o.account_id === quote.account_id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="block">{en ? 'Valid for (days)' : '有效天数'}<input required className="form-input w-full" type="number" min="1" max="3650" value={quote.valid_days} onChange={e => setQuote({ ...quote, valid_days: e.target.value })} /></label>
      <button disabled={busy} className="rounded bg-accent px-3 py-2 text-white">{en ? 'Create draft' : '创建草稿'}</button><button type="button" onClick={() => setShowForm(false)} className="px-3">{en ? 'Cancel' : '取消'}</button>
    </form>}
    {!loading && (tab === 'products' ? products.length === 0 : quotes.length === 0) && <p className="text-muted">{en ? 'No matching records.' : '暂无匹配记录。'}</p>}
    {tab === 'products' ? products.map(p => <article key={p.id} className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{p.name}</h2><p className="text-sm text-muted">{p.sku} · {p.category}</p><p className="text-sm">{p.description}</p><p>{p.currency} {Number(p.unit_price).toLocaleString(en ? 'en-US' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div><div className="flex gap-3"><button disabled={busy} onClick={() => { setEditing(p.id); setProduct({ name: p.name, sku: p.sku ?? '', description: p.description ?? '', category: p.category ?? '', currency: p.currency ?? 'USD', unit_price: String(p.unit_price) }); setShowForm(true); }}>{en ? 'Edit' : '编辑'}</button><button disabled={busy} onClick={() => void remove('product', p.id)} className="text-danger">{en ? 'Delete' : '删除'}</button></div></article>) : quotes.map(q => <article key={q.id} className="rounded-xl border border-border bg-card p-4 space-y-2"><h2 className="font-mono text-sm break-all">{q.quote_number}</h2><p>{accountName(q.account_id)} · {opportunityName(q.opportunity_id)}</p><p>{en ? 'Total' : '金额'}: {Number(q.total)} · {en ? 'Valid until' : '有效期'}: {q.valid_until}</p><select aria-label={en ? 'Quote status' : '报价状态'} disabled={busy} className="form-input" value={q.status} onChange={e => void save('PATCH', { kind: 'quote', id: q.id, status: e.target.value })}>{[['draft', en ? 'Draft' : '草稿'], ['sent', en ? 'Sent' : '已发送'], ['accepted', en ? 'Accepted' : '已接受'], ['rejected', en ? 'Rejected' : '已拒绝'], ['expired', en ? 'Expired' : '已过期']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button disabled={busy} onClick={() => void remove('quote', q.id)} className="ml-4 text-danger">{en ? 'Delete' : '删除'}</button></article>)}
  </div>;
}
