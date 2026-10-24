"use client";

import { Timer } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { useLocale } from "@/lib/i18n";
import { useDealVelocity } from "@/hooks/use-analytics";
import type { Opportunity } from "@/lib/babel-engine/types";

export function DealVelocityChart({
  opportunities,
  compact = false,
}: {
  opportunities: Opportunity[];
  compact?: boolean;
}) {
  const { t } = useLocale();
  const { items, overallAvg } = useDealVelocity(opportunities);
  const maxDays = Math.max(1, ...items.map((i) => i.avgDays));

  return (
    <SectionCard
      title={t("dashboard.dealVelocity")}
      icon={Timer}
      iconColor="text-orange-500"
      badge={t("dashboard.avgDays").replace("{0}", String(overallAvg))}
      compact={compact}
    >
      <div className={`space-y-${compact ? "1.5" : "2"}`}>
        {items.map((item) => (
          <div key={item.stage} className="flex items-center gap-3">
            <span className={`${compact ? "w-8 text-xs" : "w-10 text-[14px]"} text-right text-secondary flex-shrink-0`}>
              {item.label}
            </span>
            <div className="flex-1">
              <div className={`${compact ? "h-5" : "h-6"} w-full rounded bg-background relative`}>
                <div
                  className={`h-full rounded transition-all duration-250 ${
                    item.isAboveAvg ? "bg-danger/70" : "bg-blue-400"
                  }`}
                  style={{ width: `${item.avgDays > 0 ? Math.max(8, (item.avgDays / maxDays) * 100) : 0}%` }}
                />
                {overallAvg > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-foreground/30"
                    style={{ left: `${(overallAvg / maxDays) * 100}%` }}
                  />
                )}
              </div>
            </div>
            <span
              className={`${compact ? "w-10 text-xs" : "w-12 text-xs"} text-right font-medium flex-shrink-0 ${
                item.isAboveAvg ? "text-danger font-bold" : "text-foreground"
              }`}
            >
              {item.avgDays}{t("dashboard.days")}
            </span>
          </div>
        ))}
      </div>
      {items.some((i) => i.isAboveAvg) && (
        <p className={`${compact ? "mt-2 text-xs" : "mt-3 text-xs"} text-danger`}>
          {t("dashboard.velocityAboveAvg")}
        </p>
      )}
    </SectionCard>
  );
}
