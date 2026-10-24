'use client';

import { useState } from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import type { OpportunityStage } from '@/lib/babel-engine/types';
import { STAGE_LABELS } from '@/lib/babel-engine/types';

// ─── Ring Chart ──────────────────────────────────────────────────────

export function RingChart({ score, size = 80, strokeWidth = 8 }: { score: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = score >= 70 ? 'var(--positive)' : score >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)';

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-400"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="fill-foreground text-sm font-bold"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {score}
      </text>
    </svg>
  );
}

export function MiniBar({ score, max, color, label }: { score: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-right text-xs font-medium text-muted">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-border">
        <div className="h-full rounded-full transition-all duration-400" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-xs text-muted">{score}/{max}</span>
    </div>
  );
}

// ─── Stage Validation Modal ─────────────────────────────────────────

export function StageValidationModal({
  warnings, targetStage, onConfirm, onCancel,
}: { warnings: string[]; targetStage: OpportunityStage; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="card-elevated w-full max-w-[440px] mx-3 sm:mx-0 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-amber" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">推进至「{STAGE_LABELS[targetStage]}」</h3>
            <p className="mt-1 text-xs text-muted">以下条件未满足（共 {warnings.length} 项）：</p>
            <ul className="mt-2 space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-accent-red">
                  <XCircle className="h-3 w-3 flex-shrink-0" /> {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-background">
            取消
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-accent-amber px-4 py-2 text-xs font-medium text-white hover:opacity-90">
            仍然推进（跳过 {warnings.length} 项检查）
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lost Reason Modal ──────────────────────────────────────────────

export function LostReasonModal({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="card-elevated w-full max-w-[400px] mx-3 sm:mx-0 rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">标记为已丢失</h3>
        <p className="mt-1 text-xs text-muted">请填写丢失原因</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-3 form-input"
          rows={3}
          placeholder="丢失原因..."
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted hover:bg-background">取消</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-lg bg-accent-red px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            确认丢失
          </button>
        </div>
      </div>
    </div>
  );
}
