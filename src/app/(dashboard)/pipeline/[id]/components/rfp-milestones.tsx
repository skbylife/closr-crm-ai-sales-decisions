'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, X, Loader2, CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';

// ─── Types ──────────────────────────────────────────────────────────

export interface RfpMilestone {
  id: string;
  rfpId: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'overdue';
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RfpMilestonesProps {
  rfpId: string;
  milestones: RfpMilestone[];
  onUpdate: () => void;
}

// ─── Status helpers ─────────────────────────────────────────────────

function isOverdue(m: RfpMilestone): boolean {
  if (m.status === 'completed') return false;
  if (!m.dueDate) return false;
  return new Date(m.dueDate).getTime() < Date.now();
}

const STATUS_ICON = {
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-positive" />,
  pending: <Circle className="h-3.5 w-3.5 text-secondary" />,
  overdue: <AlertTriangle className="h-3.5 w-3.5 text-danger" />,
} as const;

// ─── Component ──────────────────────────────────────────────────────

export function RfpMilestones({ rfpId, milestones, onUpdate }: RfpMilestonesProps) {
  const [showForm, setShowForm] = useState(false);

  const toggleStatus = useCallback(async (m: RfpMilestone) => {
    const newStatus = m.status === 'completed' ? 'pending' : 'completed';
    const res = await fetch('/api/rfps/milestones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestoneId: m.id, status: newStatus }),
    });
    if (res.ok) onUpdate();
    else toast('更新失败', 'error');
  }, [onUpdate]);

  const handleDelete = useCallback(async (m: RfpMilestone) => {
    if (!await appConfirm({ message: `确定删除里程碑「${m.title}」？`, variant: 'danger' })) return;
    const res = await fetch(`/api/rfps/milestones?milestoneId=${m.id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除', 'success'); onUpdate(); }
    else toast('删除失败', 'error');
  }, [onUpdate]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-secondary flex items-center gap-1">
          <Clock className="h-3 w-3" /> 里程碑 ({milestones.length})
        </p>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover">
            <Plus className="h-3 w-3" /> 添加
          </button>
        )}
      </div>

      {milestones.length > 0 && (
        <div className="space-y-1">
          {milestones.map(m => {
            const effectiveStatus = isOverdue(m) ? 'overdue' : m.status;
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-3 py-2">
                <button onClick={() => toggleStatus(m)} className="flex-shrink-0" title={effectiveStatus === 'completed' ? '标记为未完成' : '标记为完成'}>
                  {STATUS_ICON[effectiveStatus]}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium ${effectiveStatus === 'completed' ? 'text-muted line-through' : 'text-foreground'}`}>
                    {m.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {m.dueDate && (
                      <span className={`text-[11px] ${effectiveStatus === 'overdue' ? 'text-danger font-medium' : 'text-muted'}`}>
                        {m.dueDate}
                      </span>
                    )}
                    {m.assignedTo && <span className="text-[11px] text-muted">@ {m.assignedTo}</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(m)} className="flex-shrink-0 text-muted hover:text-danger">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <MilestoneForm rfpId={rfpId} onDone={() => { setShowForm(false); onUpdate(); }} onCancel={() => setShowForm(false)} />
      )}

      {milestones.length === 0 && !showForm && (
        <p className="text-[12px] text-muted py-2">暂无里程碑</p>
      )}
    </div>
  );
}

// ─── Milestone Form ─────────────────────────────────────────────────

function MilestoneForm({ rfpId, onDone, onCancel }: { rfpId: string; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/rfps/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfpId,
          title: title.trim(),
          dueDate: dueDate || undefined,
          assignedTo: assignedTo.trim() || undefined,
        }),
      });
      if (res.ok) { toast('已添加里程碑', 'success'); onDone(); }
      else toast('添加失败', 'error');
    } finally {
      setSaving(false);
    }
  }, [title, dueDate, assignedTo, rfpId, onDone]);

  return (
    <div className="rounded-lg border border-accent/20 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">添加里程碑</span>
        <button onClick={onCancel} className="text-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="text-[11px] text-secondary">标题 *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="例：提交技术方案" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">截止日期</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">负责人</label>
          <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="姓名" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-border px-2 py-1 text-[11px] text-secondary hover:bg-background">取消</button>
        <button onClick={handleSave} disabled={!title.trim() || saving} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          添加
        </button>
      </div>
    </div>
  );
}
