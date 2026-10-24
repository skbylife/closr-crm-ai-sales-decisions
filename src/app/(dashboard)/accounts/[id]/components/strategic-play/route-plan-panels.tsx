'use client';

import { AlertTriangle, CheckCircle2, GitBranch, HelpCircle, Layers3, Link2, ShieldCheck, Target } from 'lucide-react';
import { tPlay } from './labels';
import { displayText } from './text';
import type {
  ConfidenceProfile,
  RouteImpact,
  StrategicPlayRoutePlan,
  WinGap,
} from '@/lib/strategic-play-v2/types';

function percent(value: number | undefined) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.round((normalized > 1 ? normalized / 100 : normalized) * 100);
}

function impactClass(impact: RouteImpact | WinGap['impact']) {
  if (impact === 'critical') return 'border-danger/25 bg-danger/5 text-danger';
  if (impact === 'high') return 'border-warning/25 bg-warning/5 text-warning';
  return 'border-accent/25 bg-accent/5 text-accent';
}

function statusLabel(status: WinGap['status'], en: boolean) {
  if (status === 'closed') return tPlay(en, '已关闭', 'Closed');
  if (status === 'in_progress') return tPlay(en, '推进中', 'In progress');
  if (status === 'invalidated') return tPlay(en, '已否定', 'Invalidated');
  return tPlay(en, '打开', 'Open');
}

function dimensionLabel(dimension: WinGap['dimension'], en: boolean) {
  const labels: Record<WinGap['dimension'], [string, string]> = {
    business: ['商业', 'Business'],
    people: ['人物', 'People'],
    process: ['流程', 'Process'],
    competition: ['竞争', 'Competition'],
    evidence: ['证据', 'Evidence'],
    progress: ['推进', 'Progress'],
    relationship: ['关系', 'Relationship'],
    commercial: ['商务', 'Commercial'],
  };
  const pair = labels[dimension] ?? [dimension, dimension];
  return en ? pair[1] : pair[0];
}

function ConfidenceMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'warning' | 'danger' | 'neutral';
}) {
  const toneClass = tone === 'positive'
    ? 'text-positive'
    : tone === 'warning'
      ? 'text-warning'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className={'text-lg font-semibold tabular-nums ' + toneClass}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}

export function ConfidenceProfilePanel({ profile, en }: { profile?: ConfidenceProfile; en: boolean }) {
  if (!profile) return null;
  const score = percent(profile.overall);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tPlay(en, '证据置信度', 'Evidence confidence')}</p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-accent" />
            {tPlay(en, '路线可信度面板', 'Route Confidence')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-secondary">{displayText(profile.summary)}</p>
        </div>
        <div className="min-w-[132px] rounded-lg border border-accent/25 bg-accent/[0.06] px-4 py-3 text-center">
          <p className="text-3xl font-semibold tabular-nums text-accent">{score}%</p>
          <p className="mt-0.5 text-[11px] font-medium text-secondary">{tPlay(en, '总体置信度', 'Overall')}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <ConfidenceMetric label={tPlay(en, '强证据', 'Strong')} value={profile.strongEvidenceCount} tone="positive" />
        <ConfidenceMetric label={tPlay(en, '混合证据', 'Mixed')} value={profile.mixedEvidenceCount} tone="neutral" />
        <ConfidenceMetric label={tPlay(en, '弱推断', 'Weak')} value={profile.weakEvidenceCount} tone="warning" />
        <ConfidenceMetric label={tPlay(en, '反证', 'Counter')} value={profile.counterEvidenceCount} tone="danger" />
        <ConfidenceMetric label={tPlay(en, '缺口', 'Missing')} value={profile.missingEvidenceCount} tone="warning" />
      </div>
    </section>
  );
}

export function SituationLayersCard({ routePlan, en }: { routePlan?: StrategicPlayRoutePlan; en: boolean }) {
  const layers = routePlan?.situationLayers ?? [];
  if (layers.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tPlay(en, '客户全局图', 'Account situation map')}</p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <Layers3 className="h-4 w-4 text-accent" />
            {tPlay(en, '六层局势', 'Six Situation Layers')}
          </h3>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-secondary">
          {layers.length}/6
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {layers.map((layer) => {
          const hasRisk = layer.counterEvidenceRefs.length > 0 || layer.gaps.length > 0;
          return (
            <div key={layer.key} className="rounded-lg border border-border bg-background px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{displayText(layer.label)}</p>
                  <p className="mt-1 text-xs leading-5 text-secondary">{displayText(layer.summary)}</p>
                </div>
                <span className={'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ' + (hasRisk ? 'border-warning/25 bg-warning/5 text-warning' : 'border-positive/20 bg-positive/5 text-positive')}>
                  {percent(layer.confidence)}%
                </span>
              </div>
              {layer.gaps.length > 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{layer.gaps.slice(0, 2).map(displayText).join('；')}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function WinGapsBoard({ routePlan, en }: { routePlan?: StrategicPlayRoutePlan; en: boolean }) {
  const gaps = [...(routePlan?.winGaps ?? [])].sort((a, b) => {
    const impactRank = { critical: 3, high: 2, medium: 1 } as Record<string, number>;
    const statusRank = (gap: WinGap) => gap.status === 'open' ? 2 : gap.status === 'in_progress' ? 1 : 0;
    return (statusRank(b) - statusRank(a)) || ((impactRank[b.impact] ?? 0) - (impactRank[a.impact] ?? 0));
  });
  if (gaps.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tPlay(en, '赢单缺口', 'Win gaps')}</p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <Target className="h-4 w-4 text-accent" />
            {tPlay(en, '当前最需要补齐的判断缺口', 'Gaps to close next')}
          </h3>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-secondary">
          {gaps.filter((gap) => gap.status !== 'closed').length} {tPlay(en, '未关闭', 'open')}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {gaps.slice(0, 5).map((gap) => (
          <div key={gap.id} className="rounded-lg border border-border bg-background px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-secondary">{dimensionLabel(gap.dimension, en)}</span>
              <span className={'rounded-full border px-2 py-0.5 text-[11px] font-semibold ' + impactClass(gap.impact)}>{displayText(gap.impact)}</span>
              <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">{statusLabel(gap.status, en)}</span>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold text-muted">{tPlay(en, '当前状态', 'Current state')}</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{displayText(gap.currentState)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted">{tPlay(en, '目标状态', 'Desired state')}</p>
                <p className="mt-1 text-sm leading-6 text-foreground">{displayText(gap.desiredState)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2 text-xs leading-5 text-warning">
              <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{displayText(gap.evidenceGap)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EvidenceChainView({ routePlan, en }: { routePlan?: StrategicPlayRoutePlan; en: boolean }) {
  const judgments = routePlan?.routeRationale.judgments ?? [];
  if (judgments.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tPlay(en, '证据链', 'Evidence chain')}</p>
        <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
          <GitBranch className="h-4 w-4 text-accent" />
          {tPlay(en, 'Raw Signal → Observation → Hypothesis → Judgment', 'Raw Signal → Observation → Hypothesis → Judgment')}
        </h3>
      </div>
      <div className="mt-4 space-y-3">
        {judgments.slice(0, 6).map((judgment) => (
          <details key={judgment.id} className="rounded-lg border border-border bg-background px-3.5 py-3" open={judgment.status === 'challenged'}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-6 text-foreground">{displayText(judgment.answer)}</p>
                  <p className="mt-1 text-xs leading-5 text-secondary">{displayText(judgment.rationale)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={'rounded-full border px-2 py-0.5 text-[11px] font-semibold ' + impactClass(judgment.impact)}>{displayText(judgment.impact)}</span>
                  <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-secondary">{percent(judgment.confidence)}%</span>
                </div>
              </div>
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-positive/20 bg-positive/[0.04] px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-positive"><CheckCircle2 className="h-3 w-3" />{tPlay(en, '支持证据', 'Supporting evidence')}</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-secondary">
                  {judgment.supportEvidenceRefs.length > 0
                    ? judgment.supportEvidenceRefs.slice(0, 3).map((ref, index) => <li key={ref.sourceId + index}>{displayText(ref.title || ref.excerpt || ref.sourceType)}</li>)
                    : <li>{tPlay(en, '暂无直接支持证据', 'No direct support yet')}</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-danger/20 bg-danger/[0.04] px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-danger"><AlertTriangle className="h-3 w-3" />{tPlay(en, '反证 / 风险', 'Counter evidence')}</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-secondary">
                  {judgment.counterEvidenceRefs.length > 0
                    ? judgment.counterEvidenceRefs.slice(0, 3).map((ref, index) => <li key={ref.sourceId + index}>{displayText(ref.title || ref.excerpt || ref.sourceType)}</li>)
                    : <li>{tPlay(en, '暂无明确反证', 'No explicit counter evidence')}</li>}
                </ul>
              </div>
              <div className="rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warning"><Link2 className="h-3 w-3" />{tPlay(en, '缺证点', 'Missing proof')}</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-secondary">
                  {judgment.missingEvidence.length > 0
                    ? judgment.missingEvidence.slice(0, 3).map((gap, index) => <li key={gap + index}>{displayText(gap)}</li>)
                    : <li>{tPlay(en, '暂无缺证点', 'No missing proof listed')}</li>}
                </ul>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
