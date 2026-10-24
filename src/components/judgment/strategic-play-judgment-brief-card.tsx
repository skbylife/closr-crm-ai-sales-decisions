'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ExternalLink, GitBranch, HelpCircle, History, ShieldCheck } from 'lucide-react';
import type {
  EvidenceSourceKind,
  JudgmentEvidenceRef,
  StrategicPlay,
  StrategicPlayEvidenceTraceRef,
  StrategicPlayFieldEvidenceAttribution,
  StrategicPlayFieldEvidenceClassification,
  StrategicPlayFieldEvidenceCalibration,
} from '@/lib/babel-engine/types';
import { buildStrategicPlayJudgmentBrief } from '@/lib/judgment/brief';
import {
  STRATEGIC_PLAY_ATTRIBUTION_FIELDS,
  buildStrategicPlayTraceRefs,
  evidenceRefLabel,
  fieldAttributionFor,
  formatStrategicPlayFieldValue,
  getStrategicPlayFieldAttributions,
  normalizeStrategicPlayConfidence,
  sourceTableLabel,
  summarizeFieldEvidenceAttributions,
} from '@/lib/strategic-play-evidence-ui';
import { buildEvidenceHref, sourceKindLabel } from './evidence-trace';
import { JudgmentBrief } from './judgment-brief';
import { JudgmentFeedbackForm } from './judgment-feedback-form';
import { StrategicPlayCalibrationDrawer } from './strategic-play-calibration-drawer';
import { useLocale } from '@/lib/i18n';
import { visibleBusinessText } from '@/lib/visible-business-text';

const FIELD_EVIDENCE_ATTRIBUTION_CONFIG: Record<StrategicPlayFieldEvidenceClassification, { label: string; style: string }> = {
  fact: { label: '事实', style: 'border-positive/30 bg-positive/10 text-positive' },
  inference: { label: '推断', style: 'border-blue-500/25 bg-blue-500/10 text-blue-600' },
  gap: { label: '缺证据', style: 'border-warning/30 bg-warning/10 text-warning' },
  mixed: { label: '混合', style: 'border-purple-500/25 bg-purple-500/10 text-purple-600' },
};

const CALIBRATION_LABELS: Record<StrategicPlayFieldEvidenceCalibration['outcomeAssessment'], string> = {
  matched_expected: '符合预期',
  partially_matched: '部分符合',
  missed_expected: '未达预期',
  blocked: '受阻',
  invalidated: '已否定',
  unknown: '待判断',
};

const FIELD_EVIDENCE_ATTRIBUTION_LABEL_EN: Record<StrategicPlayFieldEvidenceClassification, string> = {
  fact: 'Fact',
  inference: 'Inference',
  gap: 'Gap',
  mixed: 'Mixed',
};

const FIELD_LABEL_EN: Record<string, string> = {
  situationJudgment: 'Situation Judgment',
  strategicObjective: 'Strategic Objective',
  stakeholderPath: 'Stakeholder Path',
  evidenceBasis: 'Evidence Basis',
  riskCounterEvidence: 'Risk / Counter-Evidence',
  successCriteria: 'Success Criteria',
};

const CALIBRATION_LABELS_EN: Record<StrategicPlayFieldEvidenceCalibration['outcomeAssessment'], string> = {
  matched_expected: 'Matched expected',
  partially_matched: 'Partially matched',
  missed_expected: 'Missed expected',
  blocked: 'Blocked',
  invalidated: 'Invalidated',
  unknown: 'Pending',
};

const tBrief = (en: boolean, zh: string, english: string) => en ? english : zh;

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

function getConfidenceTone(confidence: number | null) {
  if (confidence === null) return 'text-muted';
  if (confidence >= 0.7) return 'text-positive';
  if (confidence >= 0.45) return 'text-warning';
  return 'text-danger';
}

function formatConfidence(confidence: number | null) {
  return confidence === null ? '置信度待确认' : `证据覆盖 ${Math.round(confidence * 100)}%`;
}

export function EvidenceAttributionBadge({ attribution }: { attribution?: StrategicPlayFieldEvidenceAttribution | null }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  if (!attribution) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted">
        {tBrief(en, '待关联证据', 'Evidence pending')}
      </span>
    );
  }
  const config = FIELD_EVIDENCE_ATTRIBUTION_CONFIG[attribution.classification];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${config.style}`}>
      {en ? FIELD_EVIDENCE_ATTRIBUTION_LABEL_EN[attribution.classification] : config.label}
    </span>
  );
}

export function EvidenceAttributionSummary({ attribution }: { attribution?: StrategicPlayFieldEvidenceAttribution | null }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  if (!attribution) return null;
  const evidenceRefs = attribution.evidenceRefs ?? [];
  const gaps = attribution.gaps ?? [];
  const latestCalibration = (attribution.calibrations ?? [])
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];

  return (
    <div className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-muted">
      {attribution.rationale ? <p>{tBrief(en, '依据', 'Basis')}: {visibleBusinessText(attribution.rationale, en ? 'en' : 'zh')}</p> : null}
      {evidenceRefs.length > 0 ? (
        <p>
          {tBrief(en, '证据', 'Evidence')}: {evidenceRefs.slice(0, 2).map((ref) => evidenceRefLabel(ref, en ? 'en' : 'zh')).join('；')}
          {evidenceRefs.length > 2 ? tBrief(en, ` 等 ${evidenceRefs.length} 条`, ` and ${evidenceRefs.length - 2} more`) : ''}
        </p>
      ) : null}
      {gaps.length > 0 ? (
        <p className="text-warning">{tBrief(en, '缺口', 'Gaps')}: {gaps.slice(0, 2).map((gap) => visibleBusinessText(gap, en ? 'en' : 'zh')).join('；')}{gaps.length > 2 ? tBrief(en, ` 等 ${gaps.length} 项`, ` and ${gaps.length - 2} more`) : ''}</p>
      ) : null}
      {latestCalibration ? (
        <p className="text-accent/90">
          {tBrief(en, '校准', 'Calibration')}: {en ? CALIBRATION_LABELS_EN[latestCalibration.outcomeAssessment] : CALIBRATION_LABELS[latestCalibration.outcomeAssessment]}，{latestCalibration.previousClassification} → {latestCalibration.calibratedClassification}
          {latestCalibration.note ? `；${latestCalibration.note}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceSourceChip({ source, accountId }: { source: StrategicPlayEvidenceTraceRef; accountId: string }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const judgmentRef = asJudgmentEvidenceRef(source);
  const href = judgmentRef ? buildEvidenceHref(judgmentRef, accountId) : undefined;
  const kindFallback = sourceTableLabel(source.sourceTable ?? source.sourceType, en ? 'en' : 'zh') || (en ? 'Evidence' : '证据');
  const kindLabel = sourceKindLabel(source.sourceKind, en ? 'en' : 'zh', kindFallback);
  const content = (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">
      <span className="shrink-0 font-medium text-foreground">{kindLabel}</span>
      <span className="truncate">{evidenceRefLabel(source, en ? 'en' : 'zh')}</span>
      {href ? <ExternalLink className="h-3 w-3 shrink-0 opacity-70" /> : null}
    </span>
  );

  if (!href) return content;
  return <Link href={href} className="min-w-0 hover:opacity-80">{content}</Link>;
}

function StrategicPlayEvidenceTraceBlock({
  play,
  accountId,
  defaultOpen,
}: {
  play: StrategicPlay;
  accountId: string;
  defaultOpen: boolean;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [open, setOpen] = useState(defaultOpen);
  const sources = useMemo(() => buildStrategicPlayTraceRefs(play).slice(0, 10), [play]);
  const gaps = play.knowledgeGaps ?? [];
  const provenance = play.provenance;
  const confidence = normalizeStrategicPlayConfidence(provenance?.confidence ?? play.confidence);
  const hasPositiveConfidence = confidence !== null && confidence > 0;
  const tensionCount = (provenance?.tensions ?? []).length + (provenance?.contradictions ?? []).length;

  return (
    <div className="rounded-xl border border-border bg-card/80">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 text-secondary" />
            <p className="text-sm font-semibold text-foreground">{tBrief(en, '证据与归因', 'Evidence & Attribution')}</p>
            {open && sources.length > 0 ? <span className={`text-[11px] font-semibold ${getConfidenceTone(hasPositiveConfidence ? confidence : null)}`}>{en ? (hasPositiveConfidence ? `Evidence coverage ${Math.round(confidence * 100)}%` : 'Evidence coverage pending') : formatConfidence(hasPositiveConfidence ? confidence : null)}</span> : null}
            {open && sources.length > 0 ? <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-secondary">{sources.length} {tBrief(en, '条来源', 'sources')}</span> : null}
            {open && sources.length === 0 ? <span className="rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">{tBrief(en, '缺少可追踪来源', 'No traceable sources')}</span> : null}
            {open && gaps.length > 0 ? <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{gaps.length} {tBrief(en, '个缺口', 'gaps')}</span> : null}
            {open && tensionCount > 0 ? <span className="rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{tensionCount} {tBrief(en, '个张力', 'tensions')}</span> : null}
          </div>
          <p className="mt-1 text-[12px] text-muted">{tBrief(en, '平时隐藏证据细节；需要解释、复核或校准判断时再展开查看。', 'Evidence details stay hidden until you need to explain, review, or calibrate the judgment.')}</p>
        </div>
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-accent/15">
          {open ? tBrief(en, '收起详情', 'Hide details') : tBrief(en, '展开详情', 'Show details')}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
                <HelpCircle className="h-3.5 w-3.5" />
                {tBrief(en, '归因说明', 'Attribution notes')}
              </div>
              <p className="mt-1 text-xs leading-5 text-foreground">{provenance?.rationale ? visibleBusinessText(provenance.rationale, en ? 'en' : 'zh') : tBrief(en, '暂无整体归因说明；请以字段级归因与执行反馈为准。', 'No overall attribution note yet; rely on field-level attribution and execution feedback.')}</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2.5">
              <p className="text-[11px] font-semibold text-secondary">{tBrief(en, '校准状态', 'Calibration status')}</p>
              <p className="mt-1 text-xs leading-5 text-foreground">
                {sources.length > 0 ? tBrief(en, '已有可追踪来源；执行后仍需用真实结果校准。', 'Traceable sources exist; still calibrate with real outcomes after execution.') : tBrief(en, '当前没有可跳转原始记录。关键动作前建议补一条客户沟通、会议纪要或执行反馈，再把判断作为正式依据。', 'No jumpable source records yet. Add customer communication, meeting notes, or execution feedback before treating this as a formal basis.')}
              </p>
            </div>
          </div>

          {gaps.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">{tBrief(en, '证据缺口', 'Evidence Gaps')}</p>
              <div className="mt-2 space-y-1.5">
                {gaps.slice(0, 5).map((gap, index) => (
                  <p key={`${gap}:${index}`} className="rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2 text-xs leading-5 text-warning">{visibleBusinessText(gap, en ? 'en' : 'zh')}</p>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{tBrief(en, '证据来源', 'Evidence Sources')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sources.length === 0 ? (
                <p className="rounded-md border border-danger/15 bg-danger/[0.04] px-2.5 py-2 text-xs leading-5 text-danger">{tBrief(en, '暂无可追踪证据引用。这个判断可以作为草稿，但还不应作为正式推进依据。', 'No traceable evidence references yet. This can remain a draft, but should not be used as a formal execution basis.')}</p>
              ) : sources.map((source) => <EvidenceSourceChip key={`${source.sourceType}:${source.sourceRowId ?? source.sourceId}`} source={source} accountId={accountId} />)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StrategicPlayFieldEvidenceAttributionPanel({
  play,
  defaultOpen = true,
}: {
  play: StrategicPlay;
  defaultOpen?: boolean;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [open, setOpen] = useState(defaultOpen);
  const attributions = getStrategicPlayFieldAttributions(play);
  const summary = summarizeFieldEvidenceAttributions(attributions);
  if (attributions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-secondary" />
            <h4 className="text-sm font-semibold text-foreground">{tBrief(en, '字段证据归因', 'Field Evidence Attribution')}</h4>
            <span className="rounded-full border border-positive/20 bg-positive/10 px-2 py-0.5 text-[11px] text-positive">{tBrief(en, '事实', 'Fact')} {summary.fact}</span>
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-600">{tBrief(en, '推断', 'Inference')} {summary.inference}</span>
            <span className="rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{tBrief(en, '缺口', 'Gap')} {summary.gap + summary.gaps}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">{tBrief(en, '区分事实、推断、缺证据与混合判断，避免把策略判断伪装成事实。', 'Separates facts, inferences, evidence gaps, and mixed judgments so strategy is not presented as fact.')}</p>
        </div>
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-accent/15">
          {open ? tBrief(en, '收起归因', 'Hide attribution') : tBrief(en, '展开归因', 'Show attribution')}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border px-4 py-3">
          {STRATEGIC_PLAY_ATTRIBUTION_FIELDS.map(({ field, label }) => {
            const attribution = fieldAttributionFor(attributions, field);
            return (
              <div key={field} className="rounded-lg border border-border/80 bg-background/50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12px] font-semibold text-foreground">{en ? (FIELD_LABEL_EN[field] ?? label) : label}</p>
                      <EvidenceAttributionBadge attribution={attribution} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-secondary">{visibleBusinessText(formatStrategicPlayFieldValue(play, field, en ? 'en' : 'zh'), en ? 'en' : 'zh')}</p>
                    <EvidenceAttributionSummary attribution={attribution} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function StrategicPlayJudgmentBriefCard({
  play,
  accountId = play.accountId,
  showJudgmentBrief = true,
  showFieldAttributions = true,
  showEvidenceTrace = true,
  defaultFieldAttributionsOpen = false,
  defaultEvidenceTraceOpen = false,
}: {
  play: StrategicPlay;
  accountId?: string;
  showJudgmentBrief?: boolean;
  showFieldAttributions?: boolean;
  showEvidenceTrace?: boolean;
  defaultFieldAttributionsOpen?: boolean;
  defaultEvidenceTraceOpen?: boolean;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [calibrationDrawerOpen, setCalibrationDrawerOpen] = useState(false);
  const attributions = getStrategicPlayFieldAttributions(play);
  const calibrationCount = attributions.reduce((count, attribution) => count + (attribution.calibrations?.length ?? 0), 0);
  const brief = useMemo(() => buildStrategicPlayJudgmentBrief(play, locale), [locale, play]);
  const feedbackEvidenceRefs = useMemo(
    () => buildStrategicPlayTraceRefs(play).map(asJudgmentEvidenceRef).filter((ref): ref is JudgmentEvidenceRef => Boolean(ref)).slice(0, 8),
    [play],
  );

  return (
    <div className="space-y-3">
      {showJudgmentBrief ? (
        <JudgmentBrief
          brief={brief}
          feedbackTarget={{
            accountId,
            targetType: 'strategic_play',
            targetId: play.id,
            previousSummary: brief.currentJudgment,
            evidenceRefs: feedbackEvidenceRefs,
            buttonLabel: tBrief(en, '反馈/修正谋局判断', 'Feedback / Correct Play Judgment'),
            helperText: tBrief(en, '这条反馈会写回当前客户的谋局校准记录，用于后续判断和路径复盘。', 'This feedback writes back to the account play calibration record for later judgment and path review.'),
          }}
        />
      ) : null}
      {showFieldAttributions ? <StrategicPlayFieldEvidenceAttributionPanel play={play} defaultOpen={defaultFieldAttributionsOpen} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {!showJudgmentBrief ? (
          <JudgmentFeedbackForm
            accountId={accountId}
            targetType="strategic_play"
            targetId={play.id}
            previousSummary={brief.currentJudgment}
            evidenceRefs={feedbackEvidenceRefs}
            buttonLabel={tBrief(en, '反馈/修正谋局判断', 'Feedback / Correct Play Judgment')}
            helperText={tBrief(en, '这条反馈会写回当前客户的谋局校准记录，用于后续判断和路径复盘。', 'This feedback writes back to the account play calibration record for later judgment and path review.')}
            compact
          />
        ) : null}
        <button
          type="button"
          onClick={() => setCalibrationDrawerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:border-accent/30 hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
          {tBrief(en, '判断修正记录', 'Judgment Corrections')} {calibrationCount > 0 ? calibrationCount : tBrief(en, '暂无', 'None')}
        </button>
      </div>
      {showEvidenceTrace ? <StrategicPlayEvidenceTraceBlock play={play} accountId={accountId} defaultOpen={defaultEvidenceTraceOpen} /> : null}
      <StrategicPlayCalibrationDrawer
        accountId={accountId}
        attributions={attributions}
        open={calibrationDrawerOpen}
        onClose={() => setCalibrationDrawerOpen(false)}
      />
    </div>
  );
}
