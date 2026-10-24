"use client";

interface ConfidenceMeterProps {
  value: number;          // 0-1
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function ConfidenceMeter({ value, size = 'sm', showLabel = true }: ConfidenceMeterProps) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? 'bg-positive' : value >= 0.4 ? 'bg-warning' : 'bg-danger';
  const h = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className="flex items-center gap-1.5">
      <div className={`flex-1 rounded-full bg-border ${h} min-w-[40px] max-w-[60px] overflow-hidden`}>
        <div className={`${h} rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-[11px] text-muted tabular-nums">{pct}%</span>}
    </div>
  );
}
