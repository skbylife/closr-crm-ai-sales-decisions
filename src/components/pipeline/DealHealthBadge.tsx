'use client';

import { useState } from 'react';
import type { DealHealthResult } from '@/lib/deal-health';

const HEALTH_STYLES = {
  healthy: { dot: 'bg-positive', label: '健康', text: 'text-positive' },
  at_risk: { dot: 'bg-warning', label: '有风险', text: 'text-warning' },
  critical: { dot: 'bg-danger', label: '危险', text: 'text-danger' },
} as const;

export function DealHealthBadge({
  health,
  size = 'sm',
}: {
  health: DealHealthResult;
  size?: 'sm' | 'md';
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const style = HEALTH_STYLES[health.level];
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`${dotSize} rounded-full ${style.dot} flex-shrink-0`} />
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg dark:bg-zinc-800">
          <p className={`font-semibold ${style.text}`}>{style.label}</p>
          <ul className="mt-1 space-y-0.5 text-secondary dark:text-zinc-400">
            {health.reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-border" />
        </div>
      )}
    </div>
  );
}
