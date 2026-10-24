import { AlertTriangle, Gauge, MessageCircle, Users } from 'lucide-react';
import type { SocialIntentSummary, SocialIntentLevel } from '@/lib/babel-engine/social-intent';

const LEVEL_CLASS: Record<SocialIntentLevel, string> = {
  low: 'border-positive/20 bg-positive/5 text-positive',
  medium: 'border-warning/25 bg-warning/5 text-warning',
  high: 'border-danger/25 bg-danger/5 text-danger',
};

function MetricChip({ label, value, level }: { label: string; value: string; level: SocialIntentLevel }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${LEVEL_CLASS[level]}`}>
      {label}：{value}
    </span>
  );
}

export function SocialIntentPanel({ summary, compact = false }: { summary: SocialIntentSummary; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">话外之意 / 社交意图</p>
            <MetricChip label="语气风险" value={summary.toneRisk.label} level={summary.toneRisk.level} />
            <MetricChip label="关系距离" value={summary.relationshipDistance.label} level={summary.relationshipDistance.level} />
            <MetricChip label="施压强度" value={summary.pressure.label} level={summary.pressure.level} />
          </div>

          <p className="mt-2 text-sm leading-6 text-foreground">{summary.intent}</p>
          <div className={`mt-3 grid gap-2 ${compact ? '' : 'md:grid-cols-3'}`}>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                <AlertTriangle className="h-3.5 w-3.5" />
                语气风险
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{summary.toneRisk.explanation}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                <Users className="h-3.5 w-3.5" />
                关系距离
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{summary.relationshipDistance.explanation}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                <Gauge className="h-3.5 w-3.5" />
                推进压力
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">{summary.pressure.explanation}</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-border bg-card p-3">
            <p className="text-[11px] font-semibold text-secondary">话外之意</p>
            <p className="mt-1 text-xs leading-5 text-foreground">{summary.subtext}</p>
            <p className="mt-2 text-[11px] font-semibold text-secondary">建议怎么调</p>
            <p className="mt-1 text-xs leading-5 text-muted">{summary.suggestedAdjustment}</p>
          </div>

          {summary.signals.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {summary.signals.map((signal, index) => (
                <span key={`${signal}-${index}`} className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-muted">
                  {signal}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
