"use client";

import Link from "next/link";
import { Clock, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import { SectionCard } from "@/components/ui/section-card";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { useAgingAnalysis } from "@/hooks/use-analytics";
import type { Opportunity, Account } from "@/lib/babel-engine/types";

const SEVERITY_CONFIG = {
  yellow: { emoji: "\uD83D\uDFE1", label: "14-30天", bg: "bg-warning/8 border-warning/20" },
  orange: { emoji: "\uD83D\uDFE0", label: "30-60天", bg: "bg-orange-50 border-orange-200" },
  red: { emoji: "\uD83D\uDD34", label: "60+天", bg: "bg-danger/8 border-danger/20" },
};

export function AgingAnalysisPanel({
  opportunities,
  accounts,
  compact = false,
}: {
  opportunities: Opportunity[];
  accounts: Account[];
  compact?: boolean;
}) {
  const currency = useStore((s) => s.currencyCode);
  const { t } = useLocale();
  const agingDeals = useAgingAnalysis(opportunities, accounts);

  if (agingDeals.length === 0) {
    return (
      <SectionCard title={t("dashboard.stalledDeals")} icon={Clock} iconColor="text-warning" compact={compact}>
        <div className="text-center py-4">
          <p className="text-sm text-muted">{t("dashboard.noStalledDeals")}</p>
          <p className="text-xs text-secondary mt-1">{t("dashboard.allDealsProgressing")}</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={t("dashboard.stalledDeals")}
      icon={Clock}
      iconColor="text-warning"
      badge={agingDeals.length}
      compact={compact}
    >
      <div className="flex gap-3 mb-3">
        {(["red", "orange", "yellow"] as const).map((sev) => {
          const count = agingDeals.filter((d) => d.severity === sev).length;
          if (count === 0) return null;
          return (
            <span key={sev} className="text-xs text-muted">
              {SEVERITY_CONFIG[sev].emoji} {SEVERITY_CONFIG[sev].label}: {count}
            </span>
          );
        })}
      </div>
      <div className={`space-y-${compact ? "1" : "1.5"} max-h-60 overflow-y-auto`}>
        {agingDeals.map((deal) => (
          <Link
            key={deal.id}
            href={`/pipeline/${deal.id}`}
            className={`flex items-center justify-between rounded-lg border p-2.5 transition-colors hover:shadow-sm ${SEVERITY_CONFIG[deal.severity].bg}`}
          >
            <div className="min-w-0 flex-1">
              <p className={`${compact ? "text-xs" : "text-xs"} font-semibold text-foreground truncate`}>
                {deal.name}
              </p>
              <p className="text-xs text-muted truncate">
                {deal.accountName} · {deal.stageLabel} · {formatCurrency(deal.value, currency)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
              <span className="text-sm">{SEVERITY_CONFIG[deal.severity].emoji}</span>
              <span className={`text-xs font-bold ${deal.severity === "red" ? "text-danger" : deal.severity === "orange" ? "text-orange-600" : "text-warning"}`}>
                {deal.daysInStage}{t("dashboard.days")}
              </span>
              <ChevronRight className="h-3 w-3 text-muted" />
            </div>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
