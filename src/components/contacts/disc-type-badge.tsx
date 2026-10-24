"use client";

import { useState } from 'react';

const DISC_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  D: { bg: 'bg-danger/10', text: 'text-danger', label: 'D 支配型' },
  I: { bg: 'bg-warning/10', text: 'text-warning', label: 'I 影响型' },
  S: { bg: 'bg-positive/10', text: 'text-positive', label: 'S 稳定型' },
  C: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'C 谨慎型' },
};

interface DISCTypeBadgeProps {
  discType?: 'D' | 'I' | 'S' | 'C' | null;
  confidence?: number;
  approach?: string;
  evidence?: string[];
}

export function DISCTypeBadge({ discType, confidence, approach, evidence }: DISCTypeBadgeProps) {
  const [showDetail, setShowDetail] = useState(false);

  if (!discType) return null;

  const config = DISC_COLORS[discType];
  if (!config) return null;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowDetail(!showDetail)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text} transition-colors hover:opacity-80`}
      >
        {config.label}
        {confidence != null && (
          <span className="text-[10px] opacity-70">{Math.round(confidence * 100)}%</span>
        )}
      </button>
      {showDetail && (approach || (evidence && evidence.length > 0)) && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
          {approach && (
            <div className="mb-2">
              <p className="text-[11px] font-semibold text-secondary">接触策略</p>
              <p className="mt-0.5 text-xs text-foreground">{approach}</p>
            </div>
          )}
          {evidence && evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-secondary">判断依据</p>
              <ul className="mt-0.5 space-y-0.5">
                {evidence.map((e, i) => (
                  <li key={i} className="text-[11px] text-muted">• {e}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetail(false); }}
            className="mt-2 text-[10px] text-muted hover:text-foreground"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
