"use client";

import { useMemo } from "react";
import { daysBetween, daysSince } from "@/lib/time-utils";
import { ALL_STAGES, STAGE_SHORT_LABELS, STAGE_COLORS } from "@/lib/dashboard-constants";
import { STAGE_LABELS as DEFAULT_STAGE_LABELS } from "@/lib/babel-engine/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Opportunity, OpportunityStage, Account } from "@/lib/babel-engine/types";

// ─── Types ───────────────────────────────────────────────────────────

export interface PipelineDistributionItem {
  stage: OpportunityStage;
  label: string;
  shortLabel: string;
  count: number;
  amount: number;
  color: string;
  pctAmount: number;
}

export interface FunnelItem {
  stage: OpportunityStage;
  label: string;
  count: number;
  conversionPct: number;
  isLow: boolean;
  widthPct: number;
}

export interface VelocityItem {
  stage: OpportunityStage;
  label: string;
  avgDays: number;
  isAboveAvg: boolean;
}

export interface AgingDeal {
  id: string;
  name: string;
  accountName: string;
  stage: OpportunityStage;
  stageLabel: string;
  daysInStage: number;
  value: number;
  severity: "yellow" | "orange" | "red";
}

export interface ForecastData {
  pipelineTotal: number;
  weightedAmount: number;
  commit: number;
  bestCase: number;
  upside: number;
  coverage: number;
  coverageColor: "positive" | "warning" | "danger";
}

export interface WinLossData {
  wonCount: number;
  lostCount: number;
  winRate: number;
  avgDealSize: number;
  avgCloseCycleDays: number;
  lostReasons: { reason: string; count: number }[];
}

// ─── Hooks ───────────────────────────────────────────────────────────

export function usePipelineDistribution(opportunities: Opportunity[]): PipelineDistributionItem[] {
  const { stages: pipelineStages, getStageLabel } = usePipelineStages();

  const dynamicStages = useMemo(
    () => pipelineStages.map((s) => s.key as OpportunityStage),
    [pipelineStages],
  );

  return useMemo(() => {
    const stageList = dynamicStages.length > 0 ? dynamicStages : ALL_STAGES;
    const maxAmount = Math.max(
      1,
      ...stageList.map((s) =>
        opportunities.filter((o) => o.stage === s).reduce((sum, o) => sum + o.value, 0)
      )
    );

    return stageList.map((stage) => {
      const stageOpps = opportunities.filter((o) => o.stage === stage);
      const amount = stageOpps.reduce((sum, o) => sum + o.value, 0);
      return {
        stage,
        label: getStageLabel(stage) || DEFAULT_STAGE_LABELS[stage] || stage,
        shortLabel: STAGE_SHORT_LABELS[stage] || getStageLabel(stage) || stage,
        count: stageOpps.length,
        amount,
        color: STAGE_COLORS[stage] || "bg-slate-300",
        pctAmount: (amount / maxAmount) * 100,
      };
    });
  }, [opportunities, dynamicStages, getStageLabel]);
}

export function useStageFunnel(opportunities: Opportunity[]): FunnelItem[] {
  const { stages: pipelineStages, getStageLabel } = usePipelineStages();

  const dynamicFunnelStages = useMemo(
    () =>
      pipelineStages
        .filter((s) => s.key !== "closed_won" && s.key !== "closed_lost")
        .map((s) => s.key as OpportunityStage),
    [pipelineStages],
  );

  return useMemo(() => {
    const funnelStages = dynamicFunnelStages.length > 0 ? dynamicFunnelStages : ([
      "lead_identified",
      "discovery",
      "solution_presented",
      "proposal_sent",
      "negotiation",
      "contract_review",
    ] as OpportunityStage[]);

    const counts = funnelStages.map((s) => ({
      stage: s,
      count: opportunities.filter((o) => o.stage === s).length,
    }));

    const cumulative = funnelStages.map((stage, i) => {
      const laterStages = funnelStages.slice(i);
      const won = opportunities.filter((o) => o.stage === "closed_won").length;
      const count = laterStages.reduce(
        (sum, s) => sum + opportunities.filter((o) => o.stage === s).length,
        0
      ) + (i > 0 ? won : won);
      return { stage, count: counts[i].count };
    });

    const maxCount = Math.max(1, ...cumulative.map((c) => c.count));

    return cumulative.map((item, i) => {
      const prevCount = i === 0 ? Math.max(item.count, 1) : cumulative[i - 1].count;
      const conversionPct = prevCount > 0 ? Math.round((item.count / prevCount) * 100) : 0;
      const widthPct = Math.max(10, (item.count / maxCount) * 100);

      return {
        stage: item.stage,
        label: getStageLabel(item.stage) || STAGE_SHORT_LABELS[item.stage] || item.stage,
        count: item.count,
        conversionPct: i === 0 ? 100 : conversionPct,
        isLow: i > 0 && conversionPct < 30 && prevCount > 0,
        widthPct,
      };
    });
  }, [opportunities, dynamicFunnelStages, getStageLabel]);
}

export function useDealVelocity(opportunities: Opportunity[]): { items: VelocityItem[]; overallAvg: number } {
  const { stages: pipelineStages, getStageLabel } = usePipelineStages();

  const dynamicActiveStages = useMemo(
    () =>
      pipelineStages
        .filter((s) => s.key !== "closed_won" && s.key !== "closed_lost")
        .map((s) => s.key as OpportunityStage),
    [pipelineStages],
  );

  return useMemo(() => {
    const activeStages = dynamicActiveStages.length > 0 ? dynamicActiveStages : ([
      "lead_identified",
      "discovery",
      "solution_presented",
      "proposal_sent",
      "negotiation",
      "contract_review",
    ] as OpportunityStage[]);

    const items = activeStages.map((stage) => {
      const stageOpps = opportunities.filter((o) => o.stage === stage);
      const days = stageOpps.map((o) => daysBetween(o.createdAt, o.updatedAt));
      const avgDays = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
      return {
        stage,
        label: getStageLabel(stage) || STAGE_SHORT_LABELS[stage] || stage,
        avgDays,
        isAboveAvg: false,
      };
    });

    const allDays = items.filter((i) => i.avgDays > 0).map((i) => i.avgDays);
    const overallAvg = allDays.length > 0 ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length) : 0;

    items.forEach((item) => {
      item.isAboveAvg = item.avgDays > overallAvg && item.avgDays > 0;
    });

    return { items, overallAvg };
  }, [opportunities, dynamicActiveStages, getStageLabel]);
}

export function useAgingAnalysis(opportunities: Opportunity[], accounts: Account[]): AgingDeal[] {
  const { getStageLabel } = usePipelineStages();

  return useMemo(() => {
    const activeOpps = opportunities.filter(
      (o) => o.stage !== "closed_won" && o.stage !== "closed_lost"
    );

    const aging: AgingDeal[] = [];

    for (const opp of activeOpps) {
      const daysInStage = daysSince(opp.updatedAt);
      if (daysInStage < 14) continue;

      const acct = accounts.find((a) => a.id === opp.accountId);
      const severity: "yellow" | "orange" | "red" =
        daysInStage >= 60 ? "red" : daysInStage >= 30 ? "orange" : "yellow";

      aging.push({
        id: opp.id,
        name: opp.name,
        accountName: acct?.name || "未知客户",
        stage: opp.stage,
        stageLabel: getStageLabel(opp.stage) || STAGE_SHORT_LABELS[opp.stage] || opp.stage,
        daysInStage,
        value: opp.value,
        severity,
      });
    }

    aging.sort((a, b) => b.daysInStage - a.daysInStage);
    return aging;
  }, [opportunities, accounts, getStageLabel]);
}

export function useForecast(opportunities: Opportunity[], quarterlyTarget: number): ForecastData {
  return useMemo(() => {
    const activeOpps = opportunities.filter(
      (o) => o.stage !== "closed_won" && o.stage !== "closed_lost"
    );

    const pipelineTotal = activeOpps.reduce((sum, o) => sum + o.value, 0);
    const weightedAmount = activeOpps.reduce((sum, o) => sum + o.value * (o.probability / 100), 0);
    const commit = activeOpps.filter((o) => o.probability > 70).reduce((sum, o) => sum + o.value, 0);
    const bestCase = activeOpps.filter((o) => o.probability > 50).reduce((sum, o) => sum + o.value, 0);
    const upside = activeOpps.filter((o) => o.probability > 30).reduce((sum, o) => sum + o.value, 0);
    const coverage = quarterlyTarget > 0 ? pipelineTotal / quarterlyTarget : 0;
    const coverageColor: "positive" | "warning" | "danger" =
      coverage >= 3 ? "positive" : coverage >= 2 ? "warning" : "danger";

    return { pipelineTotal, weightedAmount, commit, bestCase, upside, coverage, coverageColor };
  }, [opportunities, quarterlyTarget]);
}

export function useWinLoss(opportunities: Opportunity[]): WinLossData {
  return useMemo(() => {
    const won = opportunities.filter((o) => o.stage === "closed_won");
    const lost = opportunities.filter((o) => o.stage === "closed_lost");
    const total = won.length + lost.length;
    const winRate = total > 0 ? Math.round((won.length / total) * 100) : 0;

    const allClosed = [...won, ...lost];
    const avgDealSize =
      allClosed.length > 0
        ? Math.round(allClosed.reduce((sum, o) => sum + o.value, 0) / allClosed.length)
        : 0;

    const closeCycles = allClosed.map((o) => {
      const endDate = o.wonDate || o.updatedAt;
      return daysBetween(o.createdAt, endDate);
    });
    const avgCloseCycleDays =
      closeCycles.length > 0 ? Math.round(closeCycles.reduce((a, b) => a + b, 0) / closeCycles.length) : 0;

    const reasonMap = new Map<string, number>();
    for (const o of lost) {
      const reason = o.lostReason || "未说明";
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    }
    const lostReasons = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return { wonCount: won.length, lostCount: lost.length, winRate, avgDealSize, avgCloseCycleDays, lostReasons };
  }, [opportunities]);
}
