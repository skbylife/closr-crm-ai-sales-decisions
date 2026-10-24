'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Anchor, AlertTriangle } from 'lucide-react';
import { daysSince } from '@/lib/time-utils';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { STAGE_SHORT_LABELS } from '@/lib/dashboard-constants';
import { useLocale } from '@/lib/i18n';
import type { Account, Opportunity, OpportunityStage } from '@/lib/babel-engine/types';

interface StuckDealSummaryProps {
  opportunities: Opportunity[];
  accounts: Account[];
}

type StuckReason = 'no_champion' | 'no_eb' | 'no_dc' | 'low_meddicc' | 'long_dwell';

const REASON_LABELS: Record<StuckReason, string> = {
  no_champion: '缺少内部推动者',
  no_eb: '经济决策人未接触',
  no_dc: '决策标准未确认',
  low_meddicc: '资格评分偏低',
  long_dwell: '阶段停滞',
};
const REASON_LABELS_EN: Record<StuckReason, string> = {
  no_champion: 'Missing champion',
  no_eb: 'Economic buyer not engaged',
  no_dc: 'Decision criteria unconfirmed',
  low_meddicc: 'Low qualification score',
  long_dwell: 'Stage stalled',
};
const STAGE_LABELS_EN: Partial<Record<OpportunityStage, string>> = {
  lead_identified: 'Lead',
  discovery: 'Discovery',
  solution_presented: 'Solution',
  proposal_sent: 'Proposal',
  negotiation: 'Negotiation',
  contract_review: 'Contract',
  closed_won: 'Won',
  closed_lost: 'Lost',
};

interface StuckDeal {
  oppId: string;
  oppName: string;
  accountName: string;
  stage: OpportunityStage;
  value: number;
  dwellDays: number;
  meddiccScore: number;
  reasons: StuckReason[];
}

const DWELL_THRESHOLD = 14;

export function StuckDealSummary({ opportunities, accounts }: StuckDealSummaryProps) {
  const currency = useStore((s) => s.currencyCode);
  const { locale } = useLocale();
  const en = locale === 'en';

  const { stuckByStage, totalStuck } = useMemo(() => {
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const activeOpps = opportunities.filter(
      (o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost'
    );

    const stuck: StuckDeal[] = [];
    for (const opp of activeOpps) {
      const dwell = daysSince(opp.updatedAt ?? opp.createdAt);
      const m = opp.meddicc;
      const score = m?.overallScore ?? 0;

      if (dwell < DWELL_THRESHOLD && score >= 40) continue;

      const reasons: StuckReason[] = [];
      if (!m?.champion || m.champion.strength < 3) reasons.push('no_champion');
      if (!m?.economicBuyer || m.economicBuyer.status === 'unknown') reasons.push('no_eb');
      if (!m?.decisionCriteria || m.decisionCriteria.length === 0) reasons.push('no_dc');
      if (score < 40) reasons.push('low_meddicc');
      if (dwell >= DWELL_THRESHOLD) reasons.push('long_dwell');

      if (reasons.length === 0) continue;

      const acct = accountMap.get(opp.accountId);
      stuck.push({
        oppId: opp.id,
        oppName: opp.name,
        accountName: acct?.name ?? '---',
        stage: opp.stage,
        value: opp.value,
        dwellDays: dwell,
        meddiccScore: score,
        reasons,
      });
    }

    stuck.sort((a, b) => b.value - a.value);

    const byStage = new Map<OpportunityStage, StuckDeal[]>();
    for (const d of stuck) {
      const list = byStage.get(d.stage);
      if (list) list.push(d); else byStage.set(d.stage, [d]);
    }

    return { stuckByStage: byStage, totalStuck: stuck.length };
  }, [opportunities, accounts]);

  if (totalStuck === 0) return null;

  return (
    <div
      className="rounded-2xl border shadow-[var(--dash-card-shadow)]"
      style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 pt-4 pb-3"
        style={{ borderColor: 'var(--dash-card-divider)' }}
      >
        <Anchor className="h-4 w-4" style={{ color: 'var(--dash-health-warn)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
          {en ? 'Blocker Summary' : '卡点摘要'}
        </h3>
        <span
          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: 'var(--dash-health-warn)' }}
        >
          {totalStuck}
        </span>
      </div>
      <div className="p-4 space-y-4">
        {Array.from(stuckByStage.entries()).map(([stage, deals]) => (
          <div key={stage}>
            <h4
              className="text-[11px] font-medium mb-2"
              style={{ color: 'var(--dash-text-tertiary)' }}
            >
              {(en ? STAGE_LABELS_EN[stage] : STAGE_SHORT_LABELS[stage]) || stage}
              <span className="ml-1 opacity-60">({deals.length})</span>
            </h4>
            <div className="space-y-1.5">
              {deals.slice(0, 5).map((d) => (
                <Link
                  key={d.oppId}
                  href={`/pipeline/${d.oppId}`}
                  className="block rounded-lg border px-3 py-2 transition-colors"
                  style={{ borderColor: 'var(--dash-card-divider)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div className="flex items-center gap-2">
                    {d.reasons.length >= 3 && (
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--dash-health-bad)' }} />
                    )}
                    <span
                      className="min-w-0 flex-1 truncate text-xs font-medium"
                      style={{ color: 'var(--dash-text-primary)' }}
                    >
                      {d.oppName}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--dash-text-secondary)' }}>
                      {formatCurrency(d.value, currency)}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--dash-text-tertiary)' }}>
                    {en ? `${d.accountName} · Qualification ${d.meddiccScore} · ${d.dwellDays}d` : `${d.accountName} · 资格评分 ${d.meddiccScore} · ${d.dwellDays}天`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.reasons.map((r) => (
                      <span
                        key={r}
                        className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                        style={{
                          backgroundColor: 'rgba(245,158,11,0.08)',
                          color: 'var(--dash-health-warn)',
                        }}
                      >
                        {(en ? REASON_LABELS_EN : REASON_LABELS)[r]}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
