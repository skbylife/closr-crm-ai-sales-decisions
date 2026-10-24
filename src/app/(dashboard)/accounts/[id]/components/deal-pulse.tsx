'use client';

import type { DealPulseMetric } from '@/lib/babel-engine/types';

function getValueLabel(value: DealPulseMetric['value']) {
  switch (value) {
    case 'very_high': return '很高';
    case 'high': return '高';
    case 'medium': return '中';
    case 'low': return '低';
    case 'very_low': return '很低';
    case 'mixed': return '立场摇摆';
    default: return '未知';
  }
}

function getValueStyle(value: DealPulseMetric['value']) {
  switch (value) {
    case 'very_high':
    case 'high':
      return 'border-positive/20 bg-positive/5 text-positive';
    case 'medium':
      return 'border-warning/20 bg-warning/5 text-warning';
    case 'low':
    case 'very_low':
      return 'border-danger/20 bg-danger/5 text-danger';
    case 'mixed':
      return 'border-accent/20 bg-accent/5 text-accent';
    default:
      return 'border-border bg-background text-muted';
  }
}

function getConfidenceStyle(confidence: number) {
  if (confidence >= 0.6) return 'text-positive';
  if (confidence >= 0.3) return 'text-warning';
  return 'text-danger';
}

export function DealPulse({ metrics }: { metrics: DealPulseMetric[] }) {
  const allUnknown = metrics.every((m) => m.value === 'unknown');

  if (allUnknown) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">交易态势概览</p>
        <p className="mt-2 text-sm text-muted">证据不足，暂无法生成交易态势。积累更多互动记录后自动生成。</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="border-b border-border pb-3">
        <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">交易态势概览</p>
        <h3 className="mt-1 text-sm font-semibold text-foreground">动量、风险、推进条件</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.kind} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-secondary">{metric.label}</p>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${getValueStyle(metric.value)}`}>
                {getValueLabel(metric.value)}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground">{metric.summary}</p>
            {metric.previousSummary ? (
              <div className="rounded-md border border-border bg-card p-2 space-y-1">
                <p className="text-[11px] text-muted">上次判断：<span className="font-medium text-foreground">{metric.previousSummary}</span></p>
                {metric.changeSummary ? <p className="text-[11px] text-secondary">本次变化：{metric.changeSummary}</p> : null}
                {metric.changeSignals?.length ? (
                  <p className="text-[11px] text-muted">变化信号：{metric.changeSignals.slice(0, 2).join('、')}</p>
                ) : null}
              </div>
            ) : null}
            <p className="text-[11px] text-muted">置信度 <span className={getConfidenceStyle(metric.confidence)}>{Math.round(metric.confidence * 100)}%</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
