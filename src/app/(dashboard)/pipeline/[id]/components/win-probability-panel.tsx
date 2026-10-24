'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { calculateWinProbability, getWinProbabilityColor, getWinProbabilityColorClass } from '@/lib/win-probability';
import type { StrategicPlay } from '@/lib/babel-engine/types';
import { RingChart } from './shared';
import { useLocale } from '@/lib/i18n';

export function WinProbabilityPanel({ opportunityId, accountId }: { opportunityId: string; accountId: string }) {
  const { opportunities, accounts } = useRoleFilteredData();
  const { locale } = useLocale();
  const en = locale === 'en';
  const opportunity = opportunities.find((o) => o.id === opportunityId);
  const account = accounts.find((a) => a.id === accountId);
  const [plays, setPlays] = useState<StrategicPlay[]>([]);

  useEffect(() => {
    fetch('/api/strategic-play')
      .then((r) => r.json())
      .then((d) => setPlays(d.plays ?? []))
      .catch(() => setPlays([]));
  }, []);

  const result = useMemo(() => {
    if (!opportunity || !account) return null;
    return calculateWinProbability({ opportunity, account, plays, locale });
  }, [opportunity, account, plays, locale]);

  if (!result || !opportunity) return null;

  const color = getWinProbabilityColor(result.score);
  const colorClass = getWinProbabilityColorClass(result.score);

  return (
    <div className="card-elevated rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">✨ {en ? 'AI Win Probability' : 'AI 赢单概率'}</h3>
          <p className="mt-0.5 text-[12px] text-muted">{en ? 'Multi-factor analysis: MEDDICC, contacts, plays, and more' : '多因素分析：MEDDICC、联系人、谋局等'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${colorClass.bg} ${colorClass.text}`}>
            {result.score > 70 ? (en ? 'High' : '高') : result.score >= 40 ? (en ? 'Medium' : '中') : (en ? 'Low' : '低')}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Score + Factors layout */}
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Left: Big Ring */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <WinProbRing score={result.score} />
            <p className="text-xs text-muted">{en ? 'Win Score' : '赢单分数'}</p>
          </div>

          {/* Right: Factor bars */}
          <div className="flex-1 space-y-3">
            {result.factors.map((factor, idx) => {
              // Each factor has its own max weight
              const maxWeights = [20, 20, 20, 15, 15, 10];
              const maxW = maxWeights[idx] ?? 20;
              const pct = maxW > 0 ? Math.round((factor.impact / maxW) * 100) : 0;
              const barColor = pct >= 70 ? 'var(--positive)' : pct >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)';

              return (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{factor.name}</span>
                    <span className="text-xs font-bold" style={{ color: barColor }}>
                      {factor.impact}/{maxW}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-background">
                    <div
                      className="h-full rounded-full transition-all duration-400"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted leading-tight">{factor.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Larger Ring for detail page ─────────────────────────────────────

function WinProbRing({ score }: { score: number }) {
  const size = 100;
  const sw = 10;
  const radius = (size - sw) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - score / 100);
  const color = getWinProbabilityColor(score);

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={sw}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-400"
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="fill-foreground font-bold"
        style={{ fontSize: '20px', transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {score}%
      </text>
    </svg>
  );
}
