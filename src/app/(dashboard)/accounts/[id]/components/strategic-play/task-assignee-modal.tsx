'use client';

import { tPlay } from './labels';

// ─── Step → Task assignee picker modal (single & batch) ─────────────

export interface AssigneeOption {
  userId: string;
  displayName?: string | null;
  email?: string | null;
}

export function TaskAssigneeModal({
  en,
  title,
  subtitle,
  subtitleClassName,
  orgMembers,
  assignee,
  setAssignee,
  onCancel,
  onConfirm,
}: {
  en: boolean;
  title: string;
  subtitle: string;
  subtitleClassName?: string;
  orgMembers: AssigneeOption[];
  assignee: string;
  setAssignee: (userId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-80 rounded-xl border border-border bg-card p-5" style={{ boxShadow: 'var(--shadow-floating)' }} onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
        <p className={subtitleClassName ?? 'text-xs text-secondary mb-4'}>{subtitle}</p>
        <label className="text-xs font-medium text-secondary block mb-1">{tPlay(en, '负责人', 'Owner')}</label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground mb-4"
        >
          <option value="">{tPlay(en, '未分配', 'Unassigned')}</option>
          {orgMembers.map((m) => (
            <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:bg-sidebar">{tPlay(en, '取消', 'Cancel')}</button>
          <button onClick={onConfirm} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">{tPlay(en, '确认', 'Confirm')}</button>
        </div>
      </div>
    </div>
  );
}
