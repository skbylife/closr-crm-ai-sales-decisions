'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, CircleDashed, Clock3, Filter, Trash2, UserPlus, XCircle } from 'lucide-react';

import type { SalesLead, SalesLeadPriority, SalesLeadStatus } from '@/lib/babel-engine/types';
import { formatCurrency, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/format-currency';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/i18n';
import { useStore } from '@/lib/store';

type LeadFilter = SalesLeadStatus | 'all';

const STATUS_ORDER: SalesLeadStatus[] = ['new', 'qualified', 'nurture', 'disqualified', 'converted'];

const STATUS_META: Record<SalesLeadStatus, { zh: string; en: string; tone: string; icon: typeof CircleDashed }> = {
  new: { zh: '新线索', en: 'New', tone: 'bg-slate-100 text-slate-700 border-slate-200', icon: CircleDashed },
  qualified: { zh: '已合格', en: 'Qualified', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  nurture: { zh: '培育中', en: 'Nurture', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock3 },
  disqualified: { zh: '无效', en: 'Disqualified', tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
  converted: { zh: '已转化', en: 'Converted', tone: 'bg-blue-50 text-blue-700 border-blue-200', icon: ArrowRight },
};

const PRIORITY_META: Record<SalesLeadPriority, { zh: string; en: string; tone: string }> = {
  high: { zh: '高', en: 'High', tone: 'text-danger' },
  medium: { zh: '中', en: 'Medium', tone: 'text-warning' },
  low: { zh: '低', en: 'Low', tone: 'text-muted' },
};

function getMemberName(member: { displayName?: string; email?: string; userId: string }) {
  if (member.displayName) return member.displayName;
  if (member.email) return member.email.split('@')[0].replace(/[._-]/g, ' ');
  return member.userId.slice(0, 8);
}

function statusLabel(status: SalesLeadStatus, en: boolean) {
  return en ? STATUS_META[status].en : STATUS_META[status].zh;
}

function priorityLabel(priority: SalesLeadPriority, en: boolean) {
  return en ? PRIORITY_META[priority].en : PRIORITY_META[priority].zh;
}

export default function LeadsPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const en = locale === 'en';
  const { orgMembers, user } = useAuth();
  const currencyCode = useStore((s) => s.currencyCode);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [filter, setFilter] = useState<LeadFilter>('all');
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    title: '',
    source: '',
    need: '',
    estimatedValue: '',
    currency: currencyCode,
    priority: 'medium' as SalesLeadPriority,
    ownerId: user?.id ?? '',
    nextStep: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/leads', { cache: 'no-store' });
      const data = await res.json().catch(() => ({})) as { leads?: SalesLead[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? (en ? 'Failed to load leads' : '线索加载失败'));
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : en ? 'Failed to load leads' : '线索加载失败');
    } finally {
      setLoading(false);
    }
  }, [en]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    const visible = filter === 'all' ? leads : leads.filter((lead) => lead.status === filter);
    return [...visible].sort((a, b) => {
      const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (statusDelta !== 0) return statusDelta;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [filter, leads]);

  const counts = useMemo(() => {
    const initial = Object.fromEntries(STATUS_ORDER.map((status) => [status, 0])) as Record<SalesLeadStatus, number>;
    for (const lead of leads) initial[lead.status] += 1;
    return initial;
  }, [leads]);

  const activeValue = leads
    .filter((lead) => lead.status !== 'converted' && lead.status !== 'disqualified')
    .reduce((sum, lead) => sum + lead.estimatedValue, 0);

  const resetForm = () => {
    setForm({
      companyName: '',
      contactName: '',
      email: '',
      phone: '',
      title: '',
      source: '',
      need: '',
      estimatedValue: '',
      currency: currencyCode,
      priority: 'medium',
      ownerId: user?.id ?? '',
      nextStep: '',
      notes: '',
    });
    setErrors({});
  };

  const handleSubmit = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.companyName.trim()) nextErrors.companyName = en ? 'Company is required' : '公司必填';
    if (!form.contactName.trim()) nextErrors.contactName = en ? 'Contact is required' : '联系人必填';
    if (!form.need.trim()) nextErrors.need = en ? 'Need is required' : '需求必填';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email || undefined,
          phone: form.phone || undefined,
          title: form.title || undefined,
          source: form.source || (en ? 'Manual intake' : '手动录入'),
          need: form.need,
          estimatedValue: Number(form.estimatedValue) || 0,
          currency: form.currency,
          priority: form.priority,
          ownerId: form.ownerId || undefined,
          nextStep: form.nextStep || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { lead?: SalesLead; error?: string };
      if (!res.ok || !data.lead) throw new Error(data.error ?? (en ? 'Create lead failed' : '线索创建失败'));
      setLeads((current) => [data.lead!, ...current]);
      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : en ? 'Create lead failed' : '线索创建失败');
    } finally {
      setSaving(false);
    }
  };

  const patchLead = async (leadId: string, patch: Partial<SalesLead>) => {
    setErrorMessage('');
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({})) as { lead?: SalesLead; error?: string };
    if (!res.ok || !data.lead) throw new Error(data.error ?? (en ? 'Update lead failed' : '线索更新失败'));
    setLeads((current) => current.map((lead) => lead.id === leadId ? data.lead! : lead));
  };

  const handleStatus = (leadId: string, status: SalesLeadStatus) => {
    patchLead(leadId, { status }).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : en ? 'Update lead failed' : '线索更新失败');
    });
  };

  const handleDelete = async (leadId: string) => {
    setErrorMessage('');
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? (en ? 'Delete lead failed' : '线索删除失败'));
      setLeads((current) => current.filter((lead) => lead.id !== leadId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : en ? 'Delete lead failed' : '线索删除失败');
    }
  };

  const handleConvert = async (lead: SalesLead) => {
    setErrorMessage('');
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' });
      const data = await res.json().catch(() => ({})) as { lead?: SalesLead; opportunityId?: string; error?: string };
      if (!res.ok || !data.opportunityId) throw new Error(data.error ?? (en ? 'Convert lead failed' : '线索转化失败'));
      if (data.lead) setLeads((current) => current.map((item) => item.id === lead.id ? data.lead! : item));
      router.push(`/pipeline/${data.opportunityId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : en ? 'Convert lead failed' : '线索转化失败');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{en ? 'CRM intake' : 'CRM 入口'}</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{en ? 'Leads' : '线索'}</h1>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:min-w-[480px]">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[12px] text-muted">{en ? 'Open' : '待处理'}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{leads.filter((lead) => lead.status !== 'converted' && lead.status !== 'disqualified').length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[12px] text-muted">{en ? 'Qualified' : '已合格'}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{counts.qualified}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[12px] text-muted">{en ? 'Open value' : '待处理金额'}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(activeValue, form.currency as CurrencyCode, locale)}</p>
          </div>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-lg border border-danger/25 bg-danger/8 px-4 py-3 text-sm font-medium text-danger">
          {errorMessage}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
          <div>
            <label className="form-label">{en ? 'Company' : '公司'} <span className="text-danger">*</span></label>
            <input
              value={form.companyName}
              onChange={(event) => { setForm({ ...form, companyName: event.target.value }); setErrors((prev) => ({ ...prev, companyName: '' })); }}
              className={`form-input ${errors.companyName ? 'border-danger' : ''}`}
              placeholder={en ? 'Target' : '例：Target'}
            />
            {errors.companyName && <p className="mt-1 text-xs text-danger">{errors.companyName}</p>}
          </div>
          <div>
            <label className="form-label">{en ? 'Contact' : '联系人'} <span className="text-danger">*</span></label>
            <input
              value={form.contactName}
              onChange={(event) => { setForm({ ...form, contactName: event.target.value }); setErrors((prev) => ({ ...prev, contactName: '' })); }}
              className={`form-input ${errors.contactName ? 'border-danger' : ''}`}
              placeholder={en ? 'Name' : '姓名'}
            />
            {errors.contactName && <p className="mt-1 text-xs text-danger">{errors.contactName}</p>}
          </div>
          <div>
            <label className="form-label">{en ? 'Need' : '需求'} <span className="text-danger">*</span></label>
            <input
              value={form.need}
              onChange={(event) => { setForm({ ...form, need: event.target.value }); setErrors((prev) => ({ ...prev, need: '' })); }}
              className={`form-input ${errors.need ? 'border-danger' : ''}`}
              placeholder={en ? 'ESL pilot evaluation' : '例：ESL 试点评估'}
            />
            {errors.need && <p className="mt-1 text-xs text-danger">{errors.need}</p>}
          </div>
          <div>
            <label className="form-label">Email</label>
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="form-input" />
          </div>
          <div>
            <label className="form-label">{en ? 'Title' : '职位'}</label>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-input" />
          </div>
          <div>
            <label className="form-label">{en ? 'Phone' : '电话'}</label>
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="form-input" />
          </div>
          <div>
            <label className="form-label">{en ? 'Source' : '来源'}</label>
            <input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className="form-input" placeholder={en ? 'Event / referral / inbound' : '展会 / 转介绍 / inbound'} />
          </div>
          <div className="grid grid-cols-[1fr_112px] gap-3">
            <div>
              <label className="form-label">{en ? 'Estimated value' : '预估金额'}</label>
              <input
                value={form.estimatedValue}
                inputMode="decimal"
                onChange={(event) => setForm({ ...form, estimatedValue: event.target.value.replace(/[^\d.]/g, '') })}
                className="form-input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="form-label">{en ? 'Currency' : '币种'}</label>
              <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value as CurrencyCode })} className="form-select">
                {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">{en ? 'Priority' : '优先级'}</label>
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as SalesLeadPriority })} className="form-select">
                <option value="high">{en ? 'High' : '高'}</option>
                <option value="medium">{en ? 'Medium' : '中'}</option>
                <option value="low">{en ? 'Low' : '低'}</option>
              </select>
            </div>
            <div>
              <label className="form-label">{en ? 'Owner' : '负责人'}</label>
              <select value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} className="form-select">
                <option value="">{en ? 'Unassigned' : '未分配'}</option>
                {orgMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>{getMemberName(member)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="form-label">{en ? 'Next step' : '下一步'}</label>
            <input value={form.nextStep} onChange={(event) => setForm({ ...form, nextStep: event.target.value })} className="form-input" />
          </div>
          <div>
            <label className="form-label">{en ? 'Notes' : '备注'}</label>
            <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="form-input" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={resetForm} className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-background">
            {en ? 'Clear' : '清空'}
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-hover disabled:opacity-50">
            <UserPlus className="h-4 w-4" />
            {saving ? (en ? 'Saving...' : '保存中...') : (en ? 'Create lead' : '录入线索')}
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <button onClick={() => setFilter('all')} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${filter === 'all' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-secondary hover:bg-card'}`}>
            {en ? 'All' : '全部'} {leads.length}
          </button>
          {STATUS_ORDER.map((status) => (
            <button key={status} onClick={() => setFilter(status)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${filter === status ? 'border-accent bg-accent/10 text-accent' : 'border-border text-secondary hover:bg-card'}`}>
              {statusLabel(status, en)} {counts[status]}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_1.2fr_1fr] border-b border-border bg-background/60 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted lg:grid">
            <span>{en ? 'Lead' : '线索'}</span>
            <span>{en ? 'Need' : '需求'}</span>
            <span>{en ? 'Value' : '金额'}</span>
            <span>{en ? 'Status' : '状态'}</span>
            <span>{en ? 'Next step' : '下一步'}</span>
            <span className="text-right">{en ? 'Actions' : '操作'}</span>
          </div>
          {loading ? (
            <div className="flex min-h-[180px] items-center justify-center px-4 py-12 text-center text-sm text-muted">
              {en ? 'Loading leads...' : '正在加载线索...'}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center px-4 py-12 text-center text-sm text-muted">
              {en ? 'No leads in this view' : '当前视图暂无线索'}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredLeads.map((lead) => {
                const StatusIcon = STATUS_META[lead.status].icon;
                const owner = orgMembers.find((member) => member.userId === lead.ownerId);
                return (
                  <div key={lead.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.5fr_1.2fr_0.8fr_0.8fr_1.2fr_1fr] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{lead.companyName}</p>
                      <p className="mt-1 truncate text-[12px] text-muted">{lead.contactName}{lead.title ? ` · ${lead.title}` : ''}{owner ? ` · ${getMemberName(owner)}` : ''}</p>
                    </div>
                    <p className="line-clamp-2 text-sm text-foreground">{lead.need}</p>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(lead.estimatedValue, lead.currency as CurrencyCode, locale)}</p>
                      <p className={`mt-1 text-[12px] font-medium ${PRIORITY_META[lead.priority].tone}`}>{priorityLabel(lead.priority, en)}</p>
                    </div>
                    <div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium ${STATUS_META[lead.status].tone}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {statusLabel(lead.status, en)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-secondary">{lead.nextStep || lead.source || (en ? 'No next step' : '未写下一步')}</p>
                    <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                      {lead.status !== 'converted' && (
                        <>
                          <button type="button" onClick={() => handleStatus(lead.id, 'qualified')} className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-background">
                            {en ? 'Qualify' : '合格'}
                          </button>
                          <button type="button" onClick={() => handleStatus(lead.id, 'nurture')} className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-background">
                            {en ? 'Nurture' : '培育'}
                          </button>
                          <button type="button" onClick={() => handleConvert(lead)} className="rounded-lg bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover">
                            {en ? 'Convert' : '转化'}
                          </button>
                        </>
                      )}
                      {lead.status !== 'converted' && (
                        <button type="button" onClick={() => handleStatus(lead.id, 'disqualified')} className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted hover:bg-background">
                          {en ? 'Reject' : '无效'}
                        </button>
                      )}
                      <button type="button" onClick={() => { void handleDelete(lead.id); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:bg-background hover:text-danger" aria-label={en ? 'Delete lead' : '删除线索'}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
