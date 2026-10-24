'use client';

import { useMemo } from 'react';
import type { Opportunity, OpportunityStage } from '@/lib/babel-engine/types';
import { usePipelineStages } from '@/hooks/use-pipeline-stages';
import { useLocale } from '@/lib/i18n';

// ─── 默认漏斗阶段（自定义为空时回退） ────────────────────────────
const DEFAULT_FUNNEL_STAGES: OpportunityStage[] = [
  'lead_identified',
  'discovery',
  'solution_presented',
  'proposal_sent',
  'negotiation',
  'contract_review',
  'closed_won',
];

const DEFAULT_SHORT_LABELS: Record<string, string> = {
  lead_identified: '线索',
  discovery: '发现',
  solution_presented: '方案',
  proposal_sent: '提案',
  negotiation: '谈判',
  contract_review: '合同',
  closed_won: '成交',
};

const DEFAULT_SHORT_LABELS_EN: Record<string, string> = {
  lead_identified: 'Lead',
  discovery: 'Discovery',
  solution_presented: 'Solution',
  proposal_sent: 'Proposal',
  negotiation: 'Negotiation',
  contract_review: 'Contract',
  closed_won: 'Won',
};

const STAGE_LABELS_EN: Record<string, string> = {
  lead_identified: 'Lead identified',
  discovery: 'Discovery',
  needs_analysis: 'Needs analysis',
  qualification: 'Qualification',
  evaluation: 'Evaluation',
  proposal: 'Proposal',
  solution_presented: 'Solution presented',
  proposal_sent: 'Proposal sent',
  negotiation: 'Negotiation',
  contract_review: 'Contract review',
  closed_won: 'Closed won',
  closed_lost: 'Closed lost',
};

export interface FunnelDataItem {
  stage: OpportunityStage;
  label: string;
  count: number;
  cumulative: number;
  convPct: number;
  widthPct: number;
  isWeak: boolean;
}

export function useFunnelData(
  opportunities: Opportunity[],
  funnelStages?: OpportunityStage[],
  shortLabels?: Record<string, string>,
): FunnelDataItem[] {
  const stages = funnelStages && funnelStages.length > 0 ? funnelStages : DEFAULT_FUNNEL_STAGES;
  const labels = shortLabels && Object.keys(shortLabels).length > 0 ? shortLabels : DEFAULT_SHORT_LABELS;

  return useMemo(() => {
    const rawCounts = stages.map(
      (s) => opportunities.filter((o) => o.stage === s).length
    );
    const cumulative = stages.map((_, i) =>
      rawCounts.slice(i).reduce((a, b) => a + b, 0)
    );
    const topCount = Math.max(1, cumulative[0]);

    return stages.map((stage, i) => {
      const count = rawCounts[i];
      const cum = cumulative[i];
      const prevCum = i === 0 ? cum : cumulative[i - 1];
      const convPct = prevCum > 0 ? Math.round((cum / prevCum) * 100) : 0;
      const widthPct = Math.max(18, (cum / topCount) * 100);
      return {
        stage,
        label: labels[stage] || stage,
        count,
        cumulative: cum,
        convPct: i === 0 ? 100 : convPct,
        widthPct,
        isWeak: i > 0 && convPct < 40 && prevCum > 2,
      };
    });
  }, [opportunities, stages, labels]);
}

/**
 * 阶段转化漏斗组件 — 可在 Dashboard 和 Reports 页面复用
 */
export function StageConversionFunnel({
  opportunities,
  compact = false,
}: {
  opportunities: Opportunity[];
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  // 从自定义管线阶段 hook 推导漏斗阶段顺序 & 标签
  const { stages: pipelineStages } = usePipelineStages();

  const { funnelStages, shortLabels } = useMemo(() => {
    // 排除 closed_lost — 漏斗只展示到 closed_won
    const fs = pipelineStages
      .filter((s) => s.key !== 'closed_lost')
      .map((s) => s.key as OpportunityStage);
    const sl = en
      ? Object.fromEntries(pipelineStages.map((s) => [s.key, STAGE_LABELS_EN[s.key] ?? s.key])) as Record<string, string>
      : Object.fromEntries(pipelineStages.map((s) => [s.key, s.label])) as Record<string, string>;
    return { funnelStages: fs, shortLabels: sl };
  }, [en, pipelineStages]);

  const funnelData = useFunnelData(opportunities, funnelStages, en ? { ...DEFAULT_SHORT_LABELS_EN, ...shortLabels } : shortLabels);
  const total = opportunities.length;

  if (total === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted">{en ? 'No opportunity data yet' : '暂无商机数据'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0">
      {funnelData.map((item, i) => {
        const isWon = item.stage === 'closed_won';
        const barColor = isWon
          ? 'bg-positive'
          : item.isWeak
            ? 'bg-danger/70'
            : 'bg-accent';
        const h = compact ? 'h-8' : 'h-9';
        return (
          <div key={item.stage} className="w-full flex flex-col items-center">
            {i > 0 && (
              <div className="flex items-center gap-1 py-0.5">
                <span className={`text-[12px] font-semibold tabular-nums ${item.isWeak ? 'text-danger' : 'text-muted'}`}>
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
        {en ? <>Conversion = cumulative opportunities reaching this stage / previous stage · <span className="text-danger">Red</span> = conversion &lt;40%</> : <>转化率 = 到达本阶段的累计商机数 / 上一阶段累计商机数 · <span className="text-danger">红色</span> = 转化率 &lt;40%</>}
      </p>
    </div>
  );
}
