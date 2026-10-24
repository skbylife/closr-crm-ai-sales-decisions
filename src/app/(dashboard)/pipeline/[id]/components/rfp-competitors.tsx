'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, X, Loader2, Shield } from 'lucide-react';
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';

// ─── Types ──────────────────────────────────────────────────────────

export interface RfpCompetitor {
  id: string;
  rfpId: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
  estimatedPrice: number | null;
  winProbability: number | null;
  intelSource: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RfpCompetitorsProps {
  rfpId: string;
  competitors: RfpCompetitor[];
  onUpdate: () => void;
}

// ─── Threat level helper ────────────────────────────────────────────

function threatLevel(comp: RfpCompetitor): 'low' | 'medium' | 'high' {
  const wp = comp.winProbability ?? 0;
  if (wp >= 60) return 'high';
  if (wp >= 30) return 'medium';
  return 'low';
}

const THREAT_COLORS = {
  low: 'bg-positive/10 text-positive',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-danger/10 text-danger',
} as const;

const THREAT_LABELS = { low: '低威胁', medium: '中威胁', high: '高威胁' } as const;

// ─── Component ──────────────────────────────────────────────────────

export function RfpCompetitors({ rfpId, competitors, onUpdate }: RfpCompetitorsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-secondary flex items-center gap-1">
          <Shield className="h-3 w-3" /> 竞对 ({competitors.length})
        </p>
        {!showForm && !editingId && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover">
            <Plus className="h-3 w-3" /> 添加
          </button>
        )}
      </div>

      {competitors.map(comp => (
        editingId === comp.id ? (
          <CompetitorForm
            key={comp.id}
            rfpId={rfpId}
            initial={comp}
            onDone={() => { setEditingId(null); onUpdate(); }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <CompetitorItem
            key={comp.id}
            competitor={comp}
            onEdit={() => setEditingId(comp.id)}
            onDelete={async () => {
              if (!await appConfirm({ message: `确定删除竞对「${comp.name}」？`, variant: 'danger' })) return;
              const res = await fetch(`/api/rfps/competitors?competitorId=${comp.id}`, { method: 'DELETE' });
              if (res.ok) { toast('已删除竞对', 'success'); onUpdate(); }
              else toast('删除失败', 'error');
            }}
          />
        )
      ))}

      {showForm && (
        <CompetitorForm
          rfpId={rfpId}
          onDone={() => { setShowForm(false); onUpdate(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {competitors.length === 0 && !showForm && (
        <p className="text-[12px] text-muted py-2">暂无竞对信息</p>
      )}
    </div>
  );
}

// ─── Competitor Item ────────────────────────────────────────────────

function CompetitorItem({ competitor, onEdit, onDelete }: { competitor: RfpCompetitor; onEdit: () => void; onDelete: () => void }) {
  const threat = threatLevel(competitor);
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{competitor.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${THREAT_COLORS[threat]}`}>
            {THREAT_LABELS[threat]}
            {competitor.winProbability != null && ` ${competitor.winProbability}%`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="text-[11px] text-secondary hover:text-foreground">编辑</button>
          <button onClick={onDelete} className="text-[11px] text-danger hover:text-danger/80"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {competitor.strengths.length > 0 && (
        <p className="text-[12px] text-positive mt-1">优势: {competitor.strengths.join('、')}</p>
      )}
      {competitor.weaknesses.length > 0 && (
        <p className="text-[12px] text-danger mt-1">劣势: {competitor.weaknesses.join('、')}</p>
      )}
      {competitor.estimatedPrice != null && (
        <p className="text-[12px] text-muted mt-1">预估报价: {competitor.estimatedPrice.toLocaleString()}</p>
      )}
      {competitor.notes && (
        <p className="text-[12px] text-muted mt-1">{competitor.notes}</p>
      )}
    </div>
  );
}

// ─── Competitor Form ────────────────────────────────────────────────

function CompetitorForm({
  rfpId,
  initial,
  onDone,
  onCancel,
}: {
  rfpId: string;
  initial?: RfpCompetitor;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [strengths, setStrengths] = useState(initial?.strengths.join('、') ?? '');
  const [weaknesses, setWeaknesses] = useState(initial?.weaknesses.join('、') ?? '');
  const [estimatedPrice, setEstimatedPrice] = useState(initial?.estimatedPrice?.toString() ?? '');
  const [winProbability, setWinProbability] = useState(initial?.winProbability?.toString() ?? '');
  const [intelSource, setIntelSource] = useState(initial?.intelSource ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/rfps/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initial?.id,
          rfpId,
          name: name.trim(),
          strengths: strengths ? strengths.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [],
          weaknesses: weaknesses ? weaknesses.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [],
          estimatedPrice: estimatedPrice ? Number(estimatedPrice) : undefined,
          winProbability: winProbability ? Number(winProbability) : undefined,
          intelSource: intelSource.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast(initial ? '已更新竞对' : '已添加竞对', 'success');
        onDone();
      } else {
        toast('保存失败', 'error');
      }
    } finally {
      setSaving(false);
    }
  }, [name, strengths, weaknesses, estimatedPrice, winProbability, intelSource, notes, rfpId, initial, onDone]);

  return (
    <div className="rounded-lg border border-accent/20 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{initial ? '编辑竞对' : '添加竞对'}</span>
        <button onClick={onCancel} className="text-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[11px] text-secondary">名称 *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="竞对公司名" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">预估中标率 (%)</label>
          <input type="number" min={0} max={100} value={winProbability} onChange={e => setWinProbability(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="0-100" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">优势（顿号分隔）</label>
          <input value={strengths} onChange={e => setStrengths(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="价格低、品牌强" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">劣势（顿号分隔）</label>
          <input value={weaknesses} onChange={e => setWeaknesses(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="交付慢、技术弱" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">预估报价</label>
          <input type="number" value={estimatedPrice} onChange={e => setEstimatedPrice(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">情报来源</label>
          <input value={intelSource} onChange={e => setIntelSource(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="例：内部消息" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-secondary">备注</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-border px-2 py-1 text-[11px] text-secondary hover:bg-background">取消</button>
        <button onClick={handleSave} disabled={!name.trim() || saving} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          保存
        </button>
      </div>
    </div>
  );
}
