'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { UserCheck, AlertOctagon } from 'lucide-react';
import { daysSince } from '@/lib/time-utils';
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import type { Account, Opportunity } from '@/lib/babel-engine/types';

interface ExecutiveInterventionPanelProps {
  opportunities: Opportunity[];
  accounts: Account[];
}

interface InterventionCandidate {
  opportunityId: string;
  opportunityName: string;
  accountName: string;
  value: number;
  reasons: string[];
  urgency: 'critical' | 'high';
}

export function ExecutiveInterventionPanel({ opportunities, accounts }: ExecutiveInterventionPanelProps) {
  const currency = useStore((s) => s.currencyCode);
  const { locale } = useLocale();
  const en = locale === 'en';

  const candidates = useMemo<InterventionCandidate[]>(() => {
    const HIGH_VALUE_THRESHOLD = 100000;
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const activeOpps = opportunities.filter(
      (o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost'
    );

    return activeOpps
      .map((opp) => {
        const acct = accountMap.get(opp.accountId);
        const reasons: string[] = [];
        const m = opp.meddicc;

        if (!m?.economicBuyer || m.economicBuyer.status === 'unknown') reasons.push(en ? 'Economic buyer unconfirmed' : 'Economic Buyer 未确认');
        if (!m?.champion || m.champion.strength < 3) reasons.push(en ? 'Champion weak' : 'Champion 薄弱');
        if (acct?.dealHealth === 'critical') reasons.push(en ? 'Critical account health' : '客户健康度极差');
        const dwellDays = daysSince(opp.updatedAt ?? opp.createdAt);
        if (dwellDays > 21) reasons.push(en ? `Stage stalled ${dwellDays} days` : `阶段停滞 ${dwellDays} 天`);

        if (reasons.length === 0) return null;
        if (opp.value < HIGH_VALUE_THRESHOLD && acct?.dealHealth !== 'critical') return null;

        const urgency = (acct?.dealHealth === 'critical' || reasons.length >= 3)
          ? 'critical' as const : 'high' as const;
        return {
          opportunityId: opp.id,
          opportunityName: opp.name,
          accountName: acct?.name ?? '---',
          value: opp.value,
          reasons,
          urgency,
        };
      })
      .filter((c): c is InterventionCandidate => c !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [opportunities, accounts, en]);

  if (candidates.length === 0) return null;

  return (
    <div
      className="rounded-2xl border shadow-[var(--dash-card-shadow)]"
      style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-4 pt-4 pb-3"
        style={{ borderColor: 'var(--dash-card-divider)' }}
      >
        <UserCheck className="h-4 w-4" style={{ color: 'var(--dash-health-bad)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
          {en ? 'Executive Intervention Suggestions' : '高层介入建议'}
        </h3>
        <span
          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--dash-health-bad)' }}
        >
          {candidates.length}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--dash-card-divider)' }}>
        {candidates.map((c) => (
          <Link
            key={c.opportunityId}
            href={`/pipeline/${c.opportunityId}`}
            className="block px-4 py-3 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <div className="flex items-center gap-2">
              {c.urgency === 'critical' && (
                <AlertOctagon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--dash-health-bad)' }} />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--dash-text-primary)' }}>
                {c.opportunityName}
              </span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--dash-text-secondary)' }}>
                {formatCurrency(c.value, currency)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}>
              {c.accountName}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.reasons.map((r) => (
                <span
                  key={r}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: c.urgency === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                    color: c.urgency === 'critical' ? 'var(--dash-health-bad)' : 'var(--dash-health-warn)',
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
