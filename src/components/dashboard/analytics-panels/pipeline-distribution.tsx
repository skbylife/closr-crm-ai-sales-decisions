"use client";

import { BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/format-currency";
import { SectionCard } from "@/components/ui/section-card";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { usePipelineDistribution } from "@/hooks/use-analytics";
import type { Opportunity } from "@/lib/babel-engine/types";

export function PipelineDistributionChart({
  opportunities,
  compact = false,
}: {
  opportunities: Opportunity[];
  compact?: boolean;
}) {
  const currency = useStore((s) => s.currencyCode);
  const { t } = useLocale();
  const distribution = usePipelineDistribution(opportunities);

  return (
    <SectionCard title={t("dashboard.pipelineStageDistribution")} icon={BarChart3} iconColor="text-blue-500" compact={compact}>
      <div className="space-y-2">
        {distribution.map((item) => (
          <div key={item.stage} className="group">
            <div className="flex items-center gap-3">
              <span className={`${compact ? "w-8 text-xs" : "w-10 text-[14px]"} text-right text-secondary flex-shrink-0`}>
                {item.shortLabel}
              </span>
              <div className="flex-1 relative">
                <div className={`${compact ? "h-6" : "h-7"} w-full rounded bg-background`}>
                  <div
                    className={`h-full rounded ${item.color} transition-all duration-400 flex items-center`}
                    style={{ width: `${Math.max(item.count > 0 ? 8 : 0, item.pctAmount)}%` }}
                  >
                    {item.count > 0 && item.pctAmount > 20 && (
                      <span className={`${compact ? "text-xs" : "text-xs"} font-medium text-white ml-2 whitespace-nowrap`}>
                        {formatCurrency(item.amount, currency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className={`${compact ? "w-16" : "w-20"} text-right flex-shrink-0`}>
                <span className={`${compact ? "text-xs" : "text-xs"} font-semibold text-foreground`}>
                  {item.count}{t("dashboard.deals")}
                </span>
                {!compact && item.amount > 0 && item.pctAmount <= 20 && (
                  <span className="text-xs text-muted ml-1">{formatCurrency(item.amount, currency)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
