'use client';

import Link from 'next/link';
import { ArrowRight, Clock3, ExternalLink, History, X } from 'lucide-react';
import type {
  EvidenceSourceKind,
  JudgmentEvidenceRef,
  StrategicPlayEvidenceTraceRef,
  StrategicPlayFieldEvidenceAttribution,
} from '@/lib/babel-engine/types';
import {
  STRATEGIC_PLAY_CALIBRATION_OUTCOME_ORDER,
  flattenStrategicPlayCalibrations,
  strategicPlayCalibrationClassificationLabel,
  strategicPlayCalibrationOutcomeLabel,
  summarizeStrategicPlayCalibrations,
} from '@/lib/strategic-play-calibration-ui';
import { useLocale } from '@/lib/i18n';
import { evidenceRefLabel, sourceTableLabel } from '@/lib/strategic-play-evidence-ui';
import { buildEvidenceHref, sourceKindLabel } from './evidence-trace';

function isEvidenceSourceKind(value: string | undefined): value is EvidenceSourceKind {
  return value === 'intel_item'
    || value === 'email_decode'
    || value === 'integration_email'
    || value === 'meeting_prep'
    || value === 'activity_log'
    || value === 'strategic_play'
    || value === 'source_record';
}

function asJudgmentEvidenceRef(ref: StrategicPlayEvidenceTraceRef): JudgmentEvidenceRef | null {
  if (!isEvidenceSourceKind(ref.sourceKind)) return null;
  return {
    sourceId: ref.sourceId,
    sourceKind: ref.sourceKind,
    ...(ref.title ? { title: ref.title } : {}),
    ...(ref.sourceTable ? { sourceTable: ref.sourceTable } : {}),
    ...(ref.sourceRowId ? { sourceRowId: ref.sourceRowId } : {}),
  };
}

function formatCalibrationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SourceRecordLine({ source, accountId }: { source: StrategicPlayEvidenceTraceRef; accountId: string }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const judgmentRef = asJudgmentEvidenceRef(source);
  const href = judgmentRef ? buildEvidenceHref(judgmentRef, accountId) : undefined;
  const kindFallback = sourceTableLabel(source.sourceTable ?? source.sourceType, en ? 'en' : 'zh') || (en ? 'Evidence' : '证据');
  const kindLabel = sourceKindLabel(source.sourceKind, en ? 'en' : 'zh', kindFallback);
  const label = evidenceRefLabel(source, en ? 'en' : 'zh');
  const meta = [sourceTableLabel(source.sourceTable, en ? 'en' : 'zh'), source.sourceRowId ?? source.sourceId].filter(Boolean).join(' · ');

  if (!href) {
    return (
      <p className="mt-2 text-[11px] leading-5 text-muted">
        {en ? 'Source' : '来源'}：{kindLabel} · {label}{meta ? `（${meta}）` : ''}
      </p>
    );
  }

  return (
    <Link href={href} className="mt-2 inline-flex max-w-full items-center gap-1.5 text-[11px] font-medium text-accent hover:underline">
      <span className="truncate">{en ? 'Source' : '来源'}：{kindLabel} · {label}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </Link>
  );
}

export function StrategicPlayCalibrationDrawer({
  accountId,
  attributions,
  open,
  onClose,
}: {
  accountId: string;
  attributions: StrategicPlayFieldEvidenceAttribution[];
  open: boolean;
  onClose: () => void;
}) {
  const items = flattenStrategicPlayCalibrations(attributions);
  const summary = summarizeStrategicPlayCalibrations(items);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Strategic Play 判断修正记录">
      <button
        type="button"
        aria-label="关闭判断修正记录"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-secondary" />
                <h3 className="text-base font-semibold text-foreground">判断修正记录</h3>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">{summary.total} 条</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                这是 Strategic Play 的 judgment 校准历史：记录判断如何被实际结果修正，不是客观真理标签。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border bg-card p-1.5 text-secondary hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-border bg-card/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">Calibration summary</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STRATEGIC_PLAY_CALIBRATION_OUTCOME_ORDER.map((outcome) => (
                <div key={outcome} className="rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-[11px] text-muted">{strategicPlayCalibrationOutcomeLabel(outcome)}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{summary[outcome]}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">Timeline</p>
              <p className="text-[11px] text-muted">按发生时间倒序</p>
            </div>

            {items.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-card/60 px-4 py-6 text-center">
                <Clock3 className="mx-auto h-5 w-5 text-muted" />
                <p className="mt-2 text-sm font-semibold text-foreground">还没有校准历史</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted">
                  这不是故障：当前还没有谋局执行结果回流。执行步骤后记录实际结果，Closr 才能把预期结果、风险判断和备选路径校准成新的 judgment 证据。
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {items.map(({ field, fieldLabel, calibration }) => (
                  <article key={`${field}:${calibration.id}`} className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] font-medium text-secondary">{fieldLabel}</span>
                      <span className="text-[11px] text-muted">{formatCalibrationDate(calibration.occurredAt)}</span>
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground">
                        {strategicPlayCalibrationOutcomeLabel(calibration.outcomeAssessment)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span>{strategicPlayCalibrationClassificationLabel(calibration.previousClassification)}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted" />
                      <span>{strategicPlayCalibrationClassificationLabel(calibration.calibratedClassification)}</span>
                    </div>
                    {calibration.note ? <p className="mt-2 text-xs leading-5 text-secondary">{calibration.note}</p> : null}
                    <SourceRecordLine source={calibration.sourceRef} accountId={accountId} />
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
