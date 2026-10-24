import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Crosshair, FileSearch, Sparkles } from 'lucide-react';
import type { JudgmentTraceNarrativeModel } from '@/lib/judgment/trace-narrative';
import { visibleBusinessText } from '@/lib/visible-business-text';
import type { ProductLocale } from '@/lib/locale-contract';

interface JudgmentTraceBannerProps {
  model: JudgmentTraceNarrativeModel;
  compact?: boolean;
  defaultCollapsed?: boolean;
  onCtaClick?: () => void;
  locale?: ProductLocale;
}

const TRACE_ITEMS = [
  { key: 'currentJudgment', label: { zh: '当前判断', en: 'Current Judgment' }, icon: Sparkles, tone: 'text-accent bg-accent/10 border-accent/20' },
  { key: 'evidenceTrace', label: { zh: '证据痕迹', en: 'Evidence Trace' }, icon: FileSearch, tone: 'text-positive bg-positive/10 border-positive/20' },
  { key: 'uncertainty', label: { zh: '待校准问题', en: 'Open Calibration' }, icon: AlertTriangle, tone: 'text-warning bg-warning/10 border-warning/25' },
  { key: 'nextCalibrationAction', label: { zh: '下一步校准', en: 'Next Calibration' }, icon: Crosshair, tone: 'text-foreground bg-muted/40 border-border' },
] as const;

export function JudgmentTraceBanner({ model, compact = false, defaultCollapsed = false, onCtaClick, locale = 'zh' }: JudgmentTraceBannerProps) {
  const en = locale === 'en';
  const content = (
    <>
      <div className={`grid gap-3 p-4 ${compact ? 'md:grid-cols-2' : 'lg:grid-cols-4'}`}>
        {TRACE_ITEMS.map((item) => {
          const Icon = item.icon;
          const text = model[item.key];
          return (
            <div key={item.key} className="rounded-xl border border-border bg-background/55 p-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${item.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{en ? item.label.en : item.label.zh}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(text, locale)}</p>
            </div>
          );
        })}
      </div>

      {model.evidenceLabels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border/70 px-4 py-3">
          {model.evidenceLabels.map((label) => (
            <span key={label} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-secondary">
              {visibleBusinessText(label, locale)}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  if (defaultCollapsed) {
    return (
      <details className={`group overflow-hidden rounded-2xl border border-accent/15 bg-card shadow-sm ${compact ? '' : 'bg-gradient-to-br from-accent/[0.045] via-card to-card'}`}>
        <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 transition-colors hover:bg-background/40 sm:flex-row sm:items-start sm:justify-between [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{visibleBusinessText(model.title, locale)}</p>
              <p className="mt-0.5 text-sm leading-5 text-secondary">{visibleBusinessText(model.subtitle, locale)}</p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary group-open:hidden">
            {en ? 'Expand' : '展开查看'}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <span className="hidden shrink-0 items-center gap-1 self-start rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary group-open:inline-flex">
            {en ? 'Expanded' : '已展开'}
          </span>
        </summary>
        <div className="border-t border-border/80">
          {content}
          {model.cta ? (
            <div className="border-t border-border/70 px-4 py-3">
              {onCtaClick ? (
                <button type="button" onClick={onCtaClick} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground">
                  {visibleBusinessText(model.cta.label, locale)}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <Link href={model.cta.href} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground">
                  {visibleBusinessText(model.cta.label, locale)}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-accent/15 bg-card shadow-sm ${compact ? '' : 'bg-gradient-to-br from-accent/[0.045] via-card to-card'}`}>
      <div className="flex flex-col gap-3 border-b border-border/80 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{visibleBusinessText(model.title, locale)}</p>
              <p className="mt-0.5 text-sm leading-5 text-secondary">{visibleBusinessText(model.subtitle, locale)}</p>
            </div>
          </div>
        </div>
        {model.cta ? (
          onCtaClick ? (
            <button type="button" onClick={onCtaClick} className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground">
              {visibleBusinessText(model.cta.label, locale)}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Link href={model.cta.href} className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground">
              {visibleBusinessText(model.cta.label, locale)}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )
        ) : null}
      </div>
      {content}
    </section>
  );
}
