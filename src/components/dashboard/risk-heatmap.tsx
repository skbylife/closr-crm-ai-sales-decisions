'use client';

import React, { useMemo } from 'react';
import { Grid3X3 } from 'lucide-react';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import type { Account, Opportunity, OpportunityStage } from '@/lib/babel-engine/types';
import { STAGE_SHORT_LABELS } from '@/lib/dashboard-constants';

interface RiskHeatmapProps {
  opportunities: Opportunity[];
  accounts: Account[];
}

type RiskTier = 'low' | 'medium' | 'high' | 'critical';

interface HeatmapCell {
  stage: OpportunityStage;
  riskTier: RiskTier;
  count: number;
  totalValue: number;
}

const STAGES: OpportunityStage[] = [
  'discovery', 'solution_presented', 'proposal_sent', 'negotiation', 'contract_review',
];

const RISK_TIERS: RiskTier[] = ['critical', 'high', 'medium', 'low'];

const TIER_LABELS: Record<RiskTier, string> = {
  critical: '极高',
  high: '高',
  medium: '中',
  low: '低',
};

const TIER_COLORS: Record<RiskTier, { bg: string; text: string }> = {
  critical: { bg: 'rgba(239,68,68,0.15)', text: 'var(--dash-health-bad)' },
  high: { bg: 'rgba(245,158,11,0.12)', text: 'var(--dash-health-warn)' },
  medium: { bg: 'rgba(59,130,246,0.08)', text: 'var(--dash-text-secondary)' },
  low: { bg: 'rgba(34,197,94,0.08)', text: 'var(--dash-health-good)' },
};

function deriveTier(score: number, health: string | undefined): RiskTier {
  if (health === 'critical' || score < 20) return 'critical';
  if (health === 'at_risk' || score < 40) return 'high';
  if (score < 60) return 'medium';
  return 'low';
}

export function RiskHeatmap({ opportunities, accounts }: RiskHeatmapProps) {
  const currency = useStore((s) => s.currencyCode);

  const { cellMap, maxCount } = useMemo(() => {
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const activeOpps = opportunities.filter(
      (o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost'
    );

    // Single pass: classify each opp and bucket into cells
    const buckets = new Map<string, HeatmapCell>();
    let max = 0;
    for (const opp of activeOpps) {
      const acct = accountMap.get(opp.accountId);
      const tier = deriveTier(opp.meddicc?.overallScore ?? 0, acct?.dealHealth);
      const key = `${opp.stage}-${tier}`;
      let cell = buckets.get(key);
      if (!cell) {
        cell = { stage: opp.stage, riskTier: tier, count: 0, totalValue: 0 };
        buckets.set(key, cell);
      }
      cell.count++;
      cell.totalValue += opp.value;
      if (cell.count > max) max = cell.count;
    }
    return { cellMap: buckets, maxCount: max };
  }, [opportunities, accounts]);

  const totalActive = Array.from(cellMap.values()).reduce((s, c) => s + c.count, 0);
  if (totalActive === 0) return null;

  function getCell(stage: OpportunityStage, tier: RiskTier): HeatmapCell {
    return cellMap.get(`${stage}-${tier}`) ?? { stage, riskTier: tier, count: 0, totalValue: 0 };
  }

  return (
    <div
      className="rounded-2xl border shadow-[var(--dash-card-shadow)]"
      style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 pt-4 pb-3"
        style={{ borderColor: 'var(--dash-card-divider)' }}
      >
        <Grid3X3 className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
          风险热力图
        </h3>
        <span className="ml-1 text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}>
          阶段 x 风险
        </span>
      </div>
      <div className="overflow-x-auto p-4">
        <div className="grid min-w-[500px]" style={{ gridTemplateColumns: '56px repeat(5, 1fr)', gap: '3px' }}>
          {/* Header row */}
          <div />
          {STAGES.map((s) => (
            <div key={s} className="text-center text-[10px] font-medium pb-1.5" style={{ color: 'var(--dash-text-tertiary)' }}>
              {STAGE_SHORT_LABELS[s] || s}
            </div>
          ))}
          {/* Data rows */}
          {RISK_TIERS.map((tier) => (
            <React.Fragment key={tier}>
              <div className="flex items-center text-[10px] font-medium pr-1.5" style={{ color: TIER_COLORS[tier].text }}>
                {TIER_LABELS[tier]}
              </div>
              {STAGES.map((stage) => {
                const cell = getCell(stage, tier);
                const intensity = maxCount > 0 ? cell.count / maxCount : 0;
                return (
                  <div
                    key={`${stage}-${tier}`}
                    className="flex flex-col items-center justify-center rounded-lg py-2"
                    style={{
                      backgroundColor: cell.count > 0
                        ? TIER_COLORS[tier].bg
                        : 'var(--dash-card-divider)',
                      opacity: cell.count > 0 ? 0.5 + intensity * 0.5 : 0.3,
                    }}
                  >
                    <span className="text-sm font-bold tabular-nums" style={{ color: cell.count > 0 ? TIER_COLORS[tier].text : 'var(--dash-text-tertiary)' }}>
                      {cell.count || '-'}
                    </span>
                    {cell.count > 0 && (
                      <span className="text-[9px] tabular-nums" style={{ color: 'var(--dash-text-tertiary)' }}>
                        {formatCurrency(cell.totalValue, currency)}
                      </span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
