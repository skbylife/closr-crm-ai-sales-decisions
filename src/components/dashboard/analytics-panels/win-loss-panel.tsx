"use client";

import { PieChart } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import { SectionCard } from "@/components/ui/section-card";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { useWinLoss } from "@/hooks/use-analytics";
import type { Opportunity } from "@/lib/babel-engine/types";

export function WinLossPanel({
  opportunities,
  compact = false,
}: {
  opportunities: Opportunity[];
  compact?: boolean;
}) {
  const currency = useStore((s) => s.currencyCode);
  const { t } = useLocale();
  const data = useWinLoss(opportunities);

  if (data.wonCount === 0 && data.lostCount === 0) {
    return (
      <SectionCard title={t("dashboard.winLossAnalysis")} icon={PieChart} iconColor="text-accent" compact={compact}>
        <div className="text-center py-4">
          <p className="text-sm text-muted">{t("dashboard.noClosedDeals")}</p>
          <p className="text-xs text-secondary mt-1">{t("dashboard.closedDealsHint")}</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("dashboard.winLossAnalysis")} icon={PieChart} iconColor="text-accent" compact={compact}>
      {/* Win/Loss bars */}
      <div className={`grid grid-cols-3 gap-${compact ? "2" : "3"} mb-4`}>
        <div className="text-center">
          <p className={`${compact ? "text-lg" : "text-xl"} font-bold text-positive`}>{data.wonCount}</p>
          <p className="text-xs text-muted">{t("dashboard.wonDeals")}</p>
        </div>
        <div className="text-center">
          <p className={`${compact ? "text-lg" : "text-xl"} font-bold text-danger`}>{data.lostCount}</p>
          <p className="text-xs text-muted">{t("dashboard.lostDeals")}</p>
        </div>
        <div className="text-center">
          <p className={`${compact ? "text-lg" : "text-xl"} font-bold ${data.winRate >= 50 ? "text-positive" : data.winRate >= 30 ? "text-warning" : "text-danger"}`}>
            {data.winRate}%
          </p>
          <p className="text-xs text-muted">{t("dashboard.winRate")}</p>
        </div>
      </div>

      {/* Win rate bar */}
      <div className="h-3 w-full rounded-full bg-danger/20 mb-4">
        <div
          className="h-full rounded-full bg-positive transition-all duration-400"
          style={{ width: `${data.winRate}%` }}
        />
      </div>

      {/* Metrics */}
      <div className={`divide-y divide-border ${compact ? "-mx-4" : "-mx-5"}`}>
        <div className={`flex items-center justify-between ${compact ? "px-4 py-2" : "px-5 py-2.5"}`}>
          <span className="text-xs text-muted">{t("dashboard.avgPrice")}</span>
          <span className="text-xs font-semibold text-foreground">{formatCurrency(data.avgDealSize, currency)}</span>
        </div>
        <div className={`flex items-center justify-between ${compact ? "px-4 py-2" : "px-5 py-2.5"}`}>
          <span className="text-xs text-muted">{t("dashboard.avgCycle")}</span>
          <span className="text-xs font-semibold text-foreground">{data.avgCloseCycleDays} {t("dashboard.days")}</span>
        </div>
      </div>

      {/* Lost reasons */}
      {data.lostReasons.length > 0 && (
        <div className={compact ? "mt-3" : "mt-4"}>
          <p className="text-xs font-medium text-foreground mb-2">{t("dashboard.lostReasonDist")}</p>
          <div className="space-y-1.5">
            {data.lostReasons.map((r) => {
              const pct = data.lostCount > 0 ? Math.round((r.count / data.lostCount) * 100) : 0;
              return (
                <div key={r.reason}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-muted truncate flex-1">{r.reason}</span>
                    <span className="text-xs font-medium text-foreground ml-2">{r.count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-background">
                    <div className="h-full rounded-full bg-danger/50" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
