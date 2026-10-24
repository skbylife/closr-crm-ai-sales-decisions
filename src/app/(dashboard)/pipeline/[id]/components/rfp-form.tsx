'use client';

import { useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { RfpStatus } from '@/lib/babel-engine/types';
import { RFP_STATUS_LABELS } from '@/lib/babel-engine/types';
import { SUPPORTED_CURRENCIES } from '@/lib/format-currency';
import { useStore } from '@/lib/store';

// ─── Types ──────────────────────────────────────────────────────────

export interface RfpFormData {
  id?: string;
  title: string;
  issuer: string;
  issuedDate: string;
  dueDate: string;
  status: RfpStatus;
  budget: string;
  currency: string;
  notes: string;
}

interface RfpFormProps {
  opportunityId: string;
  accountId: string;
  initial?: RfpFormData;
  onSave: (data: RfpFormData) => Promise<void>;
  onCancel: () => void;
}

// ─── Component ──────────────────────────────────────────────────────

export function RfpForm({ opportunityId: _opportunityId, accountId: _accountId, initial, onSave, onCancel }: RfpFormProps) {
  const defaultCurrency = useStore((s) => s.currencyCode);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [issuer, setIssuer] = useState(initial?.issuer ?? '');
  const [issuedDate, setIssuedDate] = useState(initial?.issuedDate ?? new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [status, setStatus] = useState<RfpStatus>(initial?.status ?? 'identified');
  const [budget, setBudget] = useState(initial?.budget ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        title: title.trim(),
        issuer: issuer.trim(),
        issuedDate,
        dueDate,
        status,
        budget,
        currency,
        notes: notes.trim(),
      });
    } finally {
      setSaving(false);
    }
  }, [title, issuer, issuedDate, dueDate, status, budget, currency, notes, initial?.id, onSave]);

  return (
    <div className="rounded-xl border border-accent/20 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{initial ? '编辑 RFP' : '新建 RFP'}</h3>
        <button onClick={onCancel} className="text-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-secondary">RFP 标题 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="例：ESL 系统采购招标" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">发标方</label>
          <input value={issuer} onChange={e => setIssuer(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="例：采购部" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">发标日期</label>
          <input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">截止日期 *</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">状态</label>
          <select value={status} onChange={e => setStatus(e.target.value as RfpStatus)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {(Object.entries(RFP_STATUS_LABELS) as [RfpStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">预算</label>
          <div className="mt-1 flex gap-2">
            <input type="number" value={budget} onChange={e => setBudget(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="金额" />
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-24 rounded-lg border border-border bg-background px-2 py-2 text-sm flex-shrink-0">
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-secondary">备注</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-background">取消</button>
        <button onClick={handleSave} disabled={!title.trim() || !dueDate || saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          保存
        </button>
      </div>
    </div>
  );
}
