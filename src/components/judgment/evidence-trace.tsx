'use client';

import { ChevronDown, ExternalLink, HelpCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EvidenceSourceKind, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import { useLocale } from '@/lib/i18n';
import { buildEvidenceHref } from '@/lib/judgment/evidence-trace-links';
import { sourceTableLabel } from '@/lib/strategic-play-evidence-ui';

export { buildEvidenceHref } from '@/lib/judgment/evidence-trace-links';

export const SOURCE_KIND_LABEL: Record<EvidenceSourceKind, string> = {
  intel_item: '情报',
  email_decode: '邮件解读',
  integration_email: '邮件',
  meeting_prep: '会议准备',
  activity_log: '活动记录',
  strategic_play: '谋局',
  source_record: '原始记录',
};

const SOURCE_KIND_LABEL_EN: Record<EvidenceSourceKind, string> = {
  intel_item: 'Intel',
  email_decode: 'Email Decode',
  integration_email: 'Email',
  meeting_prep: 'Meeting Prep',
  activity_log: 'Activity',
  strategic_play: 'Strategic Play',
  source_record: 'Source Record',
};

export function sourceKindLabel(value: EvidenceSourceKind | undefined, locale: 'zh' | 'en' = 'zh', fallback?: string): string {
  if (!value) return fallback ?? (locale === 'en' ? 'Evidence' : '记录');
  return locale === 'en'
    ? SOURCE_KIND_LABEL_EN[value] ?? fallback ?? 'Evidence'
    : SOURCE_KIND_LABEL[value] ?? fallback ?? '记录';
}

function normalizeConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
  return Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence));
}

export function getConfidenceTone(confidence: number | null | undefined) {
  const value = normalizeConfidence(confidence);
  if (value === null) return 'text-muted';
  if (value >= 0.7) return 'text-positive';
  if (value >= 0.45) return 'text-warning';
  return 'text-danger';
}

function getConfidenceExplanation(confidence: number | null | undefined) {
  const value = normalizeConfidence(confidence);
  if (value === null) return '置信度待确认：当前判断缺少可量化评分，需要更多证据校准。';
  if (value >= 0.7) return '置信度较高：当前判断有较明确的来源支撑，但仍应随新证据更新。';
  if (value >= 0.45) return '置信度中等：方向可参考，但仍存在关键缺口或相反信号。';
  return '置信度较低：当前更像待验证假设，建议先补证据再推进关键动作。';
}

function getSourceKey(ref: JudgmentEvidenceRef, index: number) {
  return `${ref.sourceKind}:${ref.sourceRowId ?? ref.sourceId}:${index}`;
}

function dedupeSources(sources: JudgmentEvidenceRef[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.sourceKind}:${source.sourceRowId ?? source.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SourceChip({ source, accountId }: { source: JudgmentEvidenceRef; accountId: string }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const href = buildEvidenceHref(source, accountId);
  const kindLabel = sourceKindLabel(source.sourceKind, en ? 'en' : 'zh');
  const label = source.title || sourceTableLabel(source.sourceTable, en ? 'en' : 'zh') || source.sourceId;
  const content = (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">
      <span className="shrink-0 font-medium text-foreground">{kindLabel}</span>
      <span className="truncate">{label}</span>
      {href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
    </span>
  );

  if (!href) return content;
  return <Link href={href} className="min-w-0 hover:opacity-80">{content}</Link>;
}

export function EvidenceTrace({
  accountId,
  title = '证据痕迹',
  description = '查看该判断背后的来源、置信度和仍需确认的信息。',
  confidence,
  provisional,
  uncertainty,
  sources,
  defaultOpen = false,
  emptyText = '暂无可跳转证据索引。',
}: {
  accountId: string;
  title?: string;
  description?: string;
  confidence?: number | null;
  provisional?: boolean;
  uncertainty?: string;
  sources: JudgmentEvidenceRef[];
  defaultOpen?: boolean;
  emptyText?: string;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [open, setOpen] = useState(defaultOpen);
  const visibleSources = useMemo(() => dedupeSources(sources).slice(0, 8), [sources]);
  const confidenceValue = normalizeConfidence(confidence);

  return (
    <div className="rounded-lg border border-border bg-card/80">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <span className={`text-[11px] font-medium ${getConfidenceTone(confidence)}`}>
              {confidenceValue === null ? '置信度待确认' : `置信度 ${Math.round(confidenceValue * 100)}%`}
            </span>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">
              {provisional ? '暂定判断' : '稳定判断'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted">{description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleSources.slice(0, 3).map((source, index) => (
              <SourceChip key={getSourceKey(source, index)} source={source} accountId={accountId} />
            ))}
            {visibleSources.length > 3 ? (
              <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted">
                +{visibleSources.length - 3} {en ? 'more' : '条'}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                <ShieldCheck className="h-3.5 w-3.5" />
                置信度说明
              </div>
              <p className="mt-1 text-xs leading-5 text-foreground">{getConfidenceExplanation(confidence)}</p>
            </div>
            <div className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                <HelpCircle className="h-3.5 w-3.5" />
                判断状态
              </div>
              <p className="mt-1 text-xs leading-5 text-foreground">
                {provisional ? '这是暂定判断：可用于下一步行动，但需要在新证据出现后复核。' : '这是相对稳定判断：当前证据未显示明显反向信号。'}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background p-2.5">
              <p className="text-[11px] font-semibold text-secondary">仍需确认</p>
              <p className="mt-1 text-xs leading-5 text-foreground">{uncertainty || '暂无额外不确定性说明。'}</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">来源列表</p>
            <div className="mt-2 space-y-1.5">
              {visibleSources.length === 0 ? (
                <p className="rounded-md border border-border bg-background px-2.5 py-2 text-xs text-muted">{emptyText}</p>
              ) : visibleSources.map((source, index) => {
                const href = buildEvidenceHref(source, accountId);
                const kindLabel = sourceKindLabel(source.sourceKind, en ? 'en' : 'zh');
                const tableLabel = sourceTableLabel(source.sourceTable, en ? 'en' : 'zh');
                const meta = [tableLabel, source.sourceRowId].filter(Boolean).join(' · ');
                return (
                  <div key={getSourceKey(source, index)} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2">
                    <span className="shrink-0 rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] text-secondary">{kindLabel}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{source.title || tableLabel || source.sourceId}</p>
                      {meta ? (
                        <p className="truncate text-[10px] text-muted">{meta}</p>
                      ) : null}
                    </div>
                    {href ? (
                      <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:underline">
                        打开
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
