"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { useLocale } from "@/lib/i18n";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { STAGE_SHORT_LABELS } from "@/lib/dashboard-constants";
import type { Opportunity, OpportunityStage } from "@/lib/babel-engine/types";

export function StageConversionFunnel({
  opportunities,
  compact = false,
}: {
  opportunities: Opportunity[];
  compact?: boolean;
}) {
  const { t } = useLocale();
  const { stages: pipelineStages } = usePipelineStages();

  const FUNNEL_STAGES = useMemo(
    () => pipelineStages.filter((s) => s.key !== "closed_lost").map((s) => s.key as OpportunityStage),
    [pipelineStages],
  );
  const dynamicLabels = useMemo(
    () => Object.fromEntries(pipelineStages.map((s) => [s.key, s.label])) as Record<string, string>,
    [pipelineStages],
  );

  const funnelData = useMemo(() => {
    const rawCounts = FUNNEL_STAGES.map(
      (s) => opportunities.filter((o) => o.stage === s).length
    );
    const cumulative = FUNNEL_STAGES.map((_, i) =>
      rawCounts.slice(i).reduce((a, b) => a + b, 0)
    );
    const topCount = Math.max(1, cumulative[0]);

    return FUNNEL_STAGES.map((stage, i) => {
      const count = rawCounts[i];
      const cum = cumulative[i];
      const prevCum = i === 0 ? cum : cumulative[i - 1];
      const convPct = prevCum > 0 ? Math.round((cum / prevCum) * 100) : 0;
      const widthPct = Math.max(18, (cum / topCount) * 100);
      return {
        stage,
        label: dynamicLabels[stage] || STAGE_SHORT_LABELS[stage] || stage,
        count,
        cumulative: cum,
        convPct: i === 0 ? 100 : convPct,
        widthPct,
        isWeak: i > 0 && convPct < 40 && prevCum > 2,
      };
    });
  }, [opportunities, FUNNEL_STAGES, dynamicLabels]);

  const total = opportunities.length;

  return (
    <SectionCard title={t("dashboard.stageConversionFunnel")} icon={BarChart3} iconColor="text-accent" compact={compact}>
      {total === 0 ? (
        <p className="text-sm text-muted text-center py-4">暂无商机数据</p>
      ) : (
        <div className="flex flex-col items-center gap-0">
          {funnelData.map((item, i) => {
            const isWon = item.stage === "closed_won";
            const barColor = isWon
              ? "bg-positive"
              : item.isWeak
                ? "bg-danger/70"
                : "bg-accent";
            const h = compact ? "h-8" : "h-9";
            return (
              <div key={item.stage} className="w-full flex flex-col items-center">
                {i > 0 && (
                  <div className="flex items-center gap-1 py-0.5">
                    <span className={`text-[12px] font-semibold tabular-nums ${item.isWeak ? "text-danger" : "text-muted"}`}>
                      ↓ {item.convPct}%
                    </span>
                  </div>
                )}
                <div
                  className={`${h} relative flex items-center justify-between rounded-md ${barColor} px-3 transition-all duration-400`}
                  style={{ width: `${item.widthPct}%` }}
                >
                  <span className="text-[13px] font-semibold text-white truncate">
                    {item.label}
                  </span>
                  <span className="text-[13px] font-bold text-white/90 tabular-nums shrink-0 ml-2">
                    {item.count}
                  </span>
                </div>
              </div>
            );
          })}
          <p className="mt-3 text-[12px] text-muted text-center">
            转化率 = 到达本阶段的累计商机数 / 上一阶段累计商机数 · <span className="text-danger">红色</span> = 转化率 &lt;40%
          </p>
        </div>
      )}
    </SectionCard>
  );
}
