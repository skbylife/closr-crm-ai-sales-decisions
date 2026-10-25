'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/i18n';
import { Package, FileText, Search } from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';

type Product = { id: string; name: string; sku: string | null; description: string | null; unit_price: number; currency: string; category: string | null; is_active: boolean | null };
type Quote = { id: string; quote_number: string; account_id: string; opportunity_id: string; status: string; total: number; valid_until: string };
type Account = { id: string; name: string };
type Opportunity = Account & { account_id: string };
type Catalog = { products: Product[]; quotes: Quote[]; accounts: Account[]; opportunities: Opportunity[] };
const emptyProduct = { name: '', sku: '', description: '', unit_price: '0', currency: 'USD', category: '', is_active: true };

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
  const quotes = data.quotes.filter(q => `${q.quote_number} ${accountName(q.account_id)} ${opportunityName(q.opportunity_id)}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto max-w-7xl space-y-4 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Package className="h-6 w-6 text-accent" />{en ? 'Products and quotes' : '产品与报价'}</h1><p className="mt-1 text-sm text-muted">{en ? 'Manage your product catalog and opportunity quotes.' : '管理产品目录与商机报价单。'}</p></div>
      <button disabled={busy || loading} onClick={() => { setEditing(null); setProduct(emptyProduct); setShowForm(true); }} className="rounded bg-accent px-3 py-2 text-white">{tab === 'products' ? (en ? 'Add product' : '新增产品') : (en ? 'Create quote' : '新建报价')}</button>
    </div>
    <div className="flex gap-1 rounded-lg bg-sidebar p-1" role="tablist" aria-label={en ? 'Catalog view' : '目录视图'}>
      {(['products', 'quotes'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setShowForm(false); setSearch(''); }} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${tab === value ? 'bg-card text-foreground shadow-sm' : 'text-secondary'}`}>{value === 'products' ? <Package className="h-4 w-4" /> : <FileText className="h-4 w-4" />}{value === 'products' ? (en ? 'Product catalog' : '产品目录') : (en ? 'Quotes' : '报价单')} ({data[value].length})</button>)}
    </div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {loading && <p role="status">{en ? 'Loading…' : '加载中…'}</p>}
    <div className="relative"><Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted" /><input aria-label={en ? 'Search' : '搜索'} className="form-input w-full" style={{ paddingLeft: 36 }} placeholder={en ? 'Search records' : '搜索记录'} value={search} onChange={e => setSearch(e.target.value)} /></div>
    {showForm && tab === 'products' && <form className="rounded-xl border border-border bg-card p-4 space-y-3" onSubmit={e => { e.preventDefault(); void save(editing ? 'PATCH' : 'POST', { kind: 'product', id: editing, ...product, unit_price: Number(product.unit_price) }); }}>
      <div className="grid gap-3 sm:grid-cols-2">{(['name', 'sku', 'description', 'category', 'currency', 'unit_price'] as const).map(key => <label key={key} className="text-sm">{{ name: en ? 'Name' : '名称', sku: 'SKU', description: en ? 'Description' : '描述', category: en ? 'Category' : '分类', currency: en ? 'Currency (ISO code)' : '币种（ISO代码）', unit_price: en ? 'Unit price' : '单价' }[key]}<input className="form-input mt-1 w-full" required={['name', 'currency', 'unit_price'].includes(key)} type={key === 'unit_price' ? 'number' : 'text'} min={key === 'unit_price' ? 0 : undefined} step={key === 'unit_price' ? 'any' : undefined} value={product[key]} onChange={e => setProduct({ ...product, [key]: e.target.value })} /></label>)}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={product.is_active} onChange={e => setProduct({ ...product, is_active: e.target.checked })} />{en ? 'Active product' : '启用产品'}</label>
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
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      {tab === 'products' ? <table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">{en ? 'Product catalog' : '产品目录'}</caption>
        <thead className="bg-sidebar text-secondary"><tr>{[en ? 'Product / description' : '产品 / 描述', 'SKU', en ? 'Unit price' : '单价', en ? 'Category' : '分类', en ? 'Status' : '状态', en ? 'Actions' : '操作'].map(label => <th scope="col" key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{products.map(p => <tr key={p.id} className="border-t border-border">
          <td className="p-3"><p className="font-semibold">{p.name}</p><p className="mt-1 max-w-sm whitespace-pre-wrap text-xs text-muted">{p.description || '—'}</p></td><td className="p-3 font-mono text-xs">{p.sku || '—'}</td>
          <td className="p-3 whitespace-nowrap">{p.currency} {Number(p.unit_price).toLocaleString(en ? 'en-US' : 'zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="p-3">{p.category || '—'}</td>
          <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${p.is_active === false ? 'bg-sidebar text-secondary' : 'bg-positive/10 text-positive'}`}>{p.is_active == null ? (en ? 'Not recorded' : '未记录') : p.is_active ? (en ? 'Active' : '启用') : (en ? 'Inactive' : '停用')}</span></td>
          <td className="p-3"><div className="flex gap-3"><button disabled={busy} onClick={() => { setEditing(p.id); setProduct({ name: p.name, sku: p.sku ?? '', description: p.description ?? '', category: p.category ?? '', currency: p.currency ?? 'USD', unit_price: String(p.unit_price), is_active: p.is_active !== false }); setShowForm(true); }}>{en ? 'Edit' : '编辑'}</button><button disabled={busy} onClick={() => void remove('product', p.id)} className="text-danger">{en ? 'Delete' : '删除'}</button></div></td>
        </tr>)}</tbody>
      </table> : <table className="w-full min-w-[850px] text-left text-sm"><caption className="sr-only">{en ? 'Quotes' : '报价单'}</caption>
        <thead className="bg-sidebar text-secondary"><tr>{[en ? 'Quote number' : '报价编号', en ? 'Account' : '客户', en ? 'Opportunity' : '商机', en ? 'Status' : '状态', en ? 'Total' : '金额', en ? 'Valid until' : '有效期', en ? 'Actions' : '操作'].map(label => <th scope="col" key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{quotes.map(q => <tr key={q.id} className="border-t border-border"><td className="max-w-48 break-all p-3 font-mono text-xs">{q.quote_number}</td><td className="p-3">{accountName(q.account_id)}</td><td className="p-3">{opportunityName(q.opportunity_id)}</td>
          <td className="p-3"><select aria-label={`${en ? 'Quote status' : '报价状态'}: ${q.quote_number}`} disabled={busy} className="form-input" value={q.status} onChange={e => void save('PATCH', { kind: 'quote', id: q.id, status: e.target.value })}>{[['draft', en ? 'Draft' : '草稿'], ['sent', en ? 'Sent' : '已发送'], ['accepted', en ? 'Accepted' : '已接受'], ['rejected', en ? 'Rejected' : '已拒绝'], ['expired', en ? 'Expired' : '已过期']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
          <td className="p-3">{Number(q.total).toLocaleString(en ? 'en-US' : 'zh-CN', { minimumFractionDigits: 2 })}</td><td className="p-3 whitespace-nowrap">{q.valid_until ? q.valid_until.slice(0, 10) : '—'}</td><td className="p-3"><button disabled={busy} onClick={() => void remove('quote', q.id)} className="text-danger">{en ? 'Delete' : '删除'}</button></td>
        </tr>)}</tbody>
      </table>}
    </div>
  </div>;
}
