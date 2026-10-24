"use client";

import { Target } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import { SectionCard } from "@/components/ui/section-card";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { useForecast } from "@/hooks/use-analytics";
import type { Opportunity } from "@/lib/babel-engine/types";

export function ForecastPanel({
  opportunities,
  quarterlyTarget,
  compact = false,
}: {
  opportunities: Opportunity[];
  quarterlyTarget: number;
  compact?: boolean;
}) {
  const currency = useStore((s) => s.currencyCode);
  const { t } = useLocale();
  const forecast = useForecast(opportunities, quarterlyTarget);

  const rows: { label: string; value: string; highlight?: string }[] = [
    { label: t("dashboard.forecast.pipelineTotal"), value: formatCurrency(forecast.pipelineTotal, currency) },
    { label: t("dashboard.forecast.weightedAmount"), value: formatCurrency(forecast.weightedAmount, currency) },
    { label: t("dashboard.forecast.commit"), value: formatCurrency(forecast.commit, currency), highlight: forecast.commit > 0 ? "text-positive" : undefined },
    { label: t("dashboard.forecast.bestCase"), value: formatCurrency(forecast.bestCase, currency) },
    { label: t("dashboard.forecast.upside"), value: formatCurrency(forecast.upside, currency) },
  ];

  const coverageColors = {
    positive: "text-positive bg-positive/10",
    warning: "text-warning bg-warning/10",
    danger: "text-danger bg-danger/10",
  };

  return (
    <SectionCard title={t("dashboard.revenueForecast")} icon={Target} iconColor="text-positive" compact={compact}>
      <div className={`divide-y divide-border ${compact ? "-mx-4" : "-mx-5"}`}>
        {rows.map((row) => (
          <div key={row.label} className={`flex items-center justify-between ${compact ? "px-4 py-2" : "px-5 py-2.5"}`}>
            <span className={`${compact ? "text-xs" : "text-xs"} text-muted`}>{row.label}</span>
            <span className={`${compact ? "text-xs" : "text-xs"} font-semibold ${row.highlight || "text-foreground"}`}>
              {row.value}
            </span>
          </div>
        ))}
        {quarterlyTarget > 0 && (
          <div className={`flex items-center justify-between ${compact ? "px-4 py-2" : "px-5 py-3"}`}>
            <span className={`${compact ? "text-xs" : "text-xs"} text-muted`}>{t("dashboard.forecast.coverageRatio")}</span>
            <span
              className={`${compact ? "text-xs px-1.5 py-0.5" : "text-xs px-2 py-1"} font-bold rounded-full ${coverageColors[forecast.coverageColor]}`}
            >
              {forecast.coverage.toFixed(1)}x
            </span>
          </div>
        )}
      </div>
      {quarterlyTarget > 0 && (
        <p className={`${compact ? "mt-2 text-xs" : "mt-3 text-xs"} text-muted`}>
          {t("dashboard.forecast.coverageRatio")}: {forecast.coverage >= 3 ? t("dashboard.forecast.sufficient") : forecast.coverage >= 2 ? t("dashboard.forecast.average") : t("dashboard.forecast.insufficient")}{" "}
          ({"\uD83D\uDFE2"} &gt;3x | {"\uD83D\uDFE1"} 2-3x | {"\uD83D\uDD34"} &lt;2x)
        </p>
      )}
    </SectionCard>
  );
}
