'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2, CheckCircle2, Sparkles, MessageSquarePlus, ExternalLink } from 'lucide-react';
import { genId } from '@/lib/gen-id';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { buildEvidenceHref } from '@/components/judgment/evidence-trace';
import { buildSignalLoopAssumption, hasSignalLoopAssumption } from '@/lib/strategic-play-signal-loop';
import { toast } from '@/lib/toast-store';
import { patchStrategicPlay } from './api';
import { normalizeSignalText, isGenericEnglishPlayText, truncateSignalText, specificSignalText, currentClientLocale, displayText, signalLoopLabel } from './text';
import { ENGLISH_PLACEHOLDER_PLAY_PATTERNS } from './demo-play-quality';
import type {
  StrategicPlay,
  PlayAssumption,
} from '@/lib/babel-engine/types';
import type {
  JudgmentMemorySourceItem,
} from '@/lib/judgment/memory-sources';

export type SignalImpactRelation = 'support' | 'refute' | 'reinforce' | 'expose_gap';

export type StrategicSignalImpactInsight = {
  source: JudgmentMemorySourceItem;
  sourceLabel: string;
  cardTitle: string;
  signalStatement: string;
  affectedJudgment: string;
  relation: SignalImpactRelation;
  relationLabel: string;
  relationToneClass: string;
  evidence: string;
  question: string;
  nextMove: string;
};

export const RELATION_LABELS: Record<SignalImpactRelation, string> = {
  support: '支持当前判断',
  refute: '反驳关键假设',
  reinforce: '补强现有判断',
  expose_gap: '暴露证据缺口',
};

export const RELATION_LABELS_EN: Record<SignalImpactRelation, string> = {
  support: 'Supports current judgment',
  refute: 'Challenges key assumption',
  reinforce: 'Reinforces current judgment',
  expose_gap: 'Exposes evidence gap',
};

export const RELATION_TONE_CLASS: Record<SignalImpactRelation, string> = {
  support: 'border-positive/25 bg-positive/10 text-positive',
  refute: 'border-danger/25 bg-danger/10 text-danger',
  reinforce: 'border-accent/25 bg-accent/10 text-accent',
  expose_gap: 'border-warning/30 bg-warning/10 text-warning',
};

export const GAP_KEYWORDS = ['审批', '安全', '法务', '预算', '采购', '上线', '窗口', '否决', '风险', '阻力', '不确定', '缺口', '延迟', '合规'];

export function isGenericEnglishSignalMemory(item: JudgmentMemorySourceItem): boolean {
  const blob = [
    item.title,
    item.currentJudgment,
    item.risk,
    item.nextAction,
    item.uncertainty,
  ].filter(Boolean).join('\n');
  const placeholderHits = ENGLISH_PLACEHOLDER_PLAY_PATTERNS.reduce(
    (total, pattern) => total + (blob.match(pattern)?.length ?? 0),
    0,
  );
  return placeholderHits >= 1;
}

export function keywordHits(signal: string, candidates: string[]): string[] {
  const normalizedSignal = signal.toLowerCase();
  const tokens = candidates
    .flatMap((item) => normalizeSignalText(item).split(/[\s,，。；;、/|:：()（）]+/))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const hits: string[] = [];
  for (const token of tokens) {
    if (hits.includes(token)) continue;
    if (normalizedSignal.includes(token.toLowerCase())) hits.push(token);
    if (hits.length >= 3) break;
  }
  return hits;
}

export function classifySignalRelation(params: {
  signal: string;
  play: StrategicPlay;
  matchingAssumptions: PlayAssumption[];
  matchingGaps: string[];
}): SignalImpactRelation {
  const { signal, play, matchingAssumptions, matchingGaps } = params;
  const riskText = `${signal} ${play.riskCounterEvidence?.join(' ') ?? ''}`;
  if (matchingAssumptions.some((assumption) => assumption.status === 'invalidated')) return 'refute';
  if (matchingGaps.length > 0 || GAP_KEYWORDS.some((keyword) => riskText.includes(keyword))) return 'expose_gap';
  if (matchingAssumptions.length > 0) return 'support';
  return 'reinforce';
}

export function buildStrategicSignalImpactInsight(play: StrategicPlay, judgmentMemories: JudgmentMemorySourceItem[]): StrategicSignalImpactInsight | null {
  const en = currentClientLocale() === 'en';
  if (play.status !== 'active' && play.status !== 'in_progress') return null;

  const latestSignal = judgmentMemories
    .filter((item) => item.sourceKind === 'decode' || item.sourceKind === 'rfp_analysis')
    .filter((item) => currentClientLocale() !== 'en' || !isGenericEnglishSignalMemory(item))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  if (!latestSignal) return null;

  const isRfpSignal = latestSignal.sourceKind === 'rfp_analysis';
  const nextOpenStep = play.steps.find((step) => normalizePlayStepExecutionStatus(step.status) !== 'done');
  const fallbackSignal = play.situationJudgment
    || play.strategicObjective
    || play.goalDescription
    || signalLoopLabel('新的客户证据需要复核当前谋局判断。', 'New customer evidence should be reviewed against this play.');
  const fallbackEvidence = (play.riskCounterEvidence ?? []).find((item) => !isGenericEnglishPlayText(item))
    || (play.evidenceBasis ?? []).find((item) => !isGenericEnglishPlayText(item))
    || fallbackSignal;
  const signal = specificSignalText(latestSignal.currentJudgment || latestSignal.risk || latestSignal.title, fallbackSignal, 140);
  const risk = specificSignalText(latestSignal.risk || latestSignal.uncertainty || (isRfpSignal
    ? signalLoopLabel('这份 RFP 分析需要与当前谋局的关键假设一起复核。', 'This RFP analysis should be reviewed against the current play assumptions.')
    : signalLoopLabel('这条信号需要与当前谋局的关键假设一起复核。', 'This signal should be reviewed against the current play assumptions.')),
    fallbackEvidence,
    140,
  );
  const playJudgment = specificSignalText(
    play.situationJudgment
      || play.strategicObjective
      || play.goalDescription
      || signalLoopLabel('当前谋局的推进判断', 'Current play judgment'),
    signalLoopLabel('当前谋局的推进判断', 'Current play judgment'),
    120,
  );
  const assumptionHits = keywordHits(signal, (play.assumptions ?? []).map((item) => item.text));
  const matchingAssumptions = (play.assumptions ?? []).filter((assumption) => assumptionHits.some((hit) => assumption.text.includes(hit)));
  const matchingGaps = (play.knowledgeGaps ?? []).filter((gap) => keywordHits(signal, [gap]).length > 0).slice(0, 2);
  const relation = classifySignalRelation({ signal: `${signal} ${risk}`, play, matchingAssumptions, matchingGaps });

  const affectedJudgment = matchingAssumptions[0]
    ? `${signalLoopLabel('关键假设', 'Key assumption')}: ${truncateSignalText(matchingAssumptions[0].text, 80)}`
    : playJudgment;
  const question = latestSignal.uncertainty
    || matchingGaps[0]
    || (relation === 'expose_gap'
      ? signalLoopLabel('这个风险是否拥有实际否决权，还是只是短期沟通噪音？', 'Does this risk have real veto power, or is it short-term communication noise?')
      : signalLoopLabel('这条信号是否足以改变当前判断，还是只是在补充已有证据？', 'Is this signal strong enough to change the current judgment, or does it only reinforce existing evidence?'));

  return {
    source: latestSignal,
    sourceLabel: isRfpSignal ? signalLoopLabel('RFP / 采购局势', 'RFP / buying context') : signalLoopLabel('客户沟通信号', 'Decoded interaction'),
    cardTitle: isRfpSignal ? signalLoopLabel('RFP 分析可能改变当前谋局', 'RFP analysis may change this play') : signalLoopLabel('这条新信号可能改变当前谋局', 'New signal may change this play'),
    signalStatement: signal,
    affectedJudgment,
    relation,
    relationLabel: en ? RELATION_LABELS_EN[relation] : RELATION_LABELS[relation],
    relationToneClass: RELATION_TONE_CLASS[relation],
    evidence: risk,
    question: specificSignalText(question, signalLoopLabel('这条信号是否足以改变当前判断？', 'Is this signal strong enough to change the current play judgment?'), 140),
    nextMove: specificSignalText(latestSignal.nextAction || nextOpenStep?.title || signalLoopLabel('先补证据，再决定是否调整下一步推进动作。', 'Confirm the signal strength before changing the next move.'), nextOpenStep?.title || signalLoopLabel('先确认信号强度，再调整下一步。', 'Confirm the evidence owner before changing the next move.'), 140),
  };
}

export function StrategicSignalImpactCard({
  insight,
  accountId,
  play,
  onRefresh,
}: {
  insight: StrategicSignalImpactInsight;
  accountId: string;
  play: StrategicPlay;
  onRefresh: () => void;
}) {
  const evidenceRef = insight.source.evidenceRefs[0];
  const evidenceHref = evidenceRef ? buildEvidenceHref(evidenceRef, accountId) : undefined;
  const [writingQuestion, setWritingQuestion] = useState(false);
  const [questionWritten, setQuestionWritten] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const alreadyWritten = questionWritten || hasSignalLoopAssumption({
    assumptions: play.assumptions ?? [],
    sourceKind: insight.source.sourceKind,
    sourceId: insight.source.sourceId,
    question: insight.question,
  });

  const addQuestionToPlay = async () => {
    if (alreadyWritten || writingQuestion) return;
    setWritingQuestion(true);
    setWriteError(null);
    try {
      const now = new Date().toISOString();
      const assumption = buildSignalLoopAssumption({
        id: genId(),
        now,
        sourceKind: insight.source.sourceKind,
        sourceId: insight.source.sourceId,
        signalStatement: insight.signalStatement,
        affectedJudgment: insight.affectedJudgment,
        evidence: insight.evidence,
        question: insight.question,
        nextMove: insight.nextMove,
      });
      const nextAssumptions = [...(play.assumptions ?? []), assumption];
      await patchStrategicPlay(play, { assumptions: nextAssumptions });
      setQuestionWritten(true);
      toast(signalLoopLabel('已加入当前谋局的待验证问题', 'Added to this play as a validation question'), 'success');
      onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : '写入失败，请稍后重试';
      setWriteError(message);
      toast(message, 'error');
    } finally {
      setWritingQuestion(false);
    }
  };

  return (
    <div className="rounded-xl border border-warning/25 bg-warning/[0.035] p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-warning" />
            <h4 className="text-sm font-semibold text-foreground">{displayText(insight.cardTitle)}</h4>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${insight.relationToneClass}`}>
              {displayText(insight.relationLabel)}
            </span>
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-secondary">
              {displayText(insight.sourceLabel)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-secondary md:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-border bg-card/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{signalLoopLabel('信号', 'Signal')}</p>
              <p className="mt-1 break-words text-foreground">{displayText(insight.signalStatement)}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-border bg-card/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{signalLoopLabel('影响的判断', 'Affected Judgment')}</p>
              <p className="mt-1 break-words text-foreground">{displayText(insight.affectedJudgment)}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-border bg-card/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{signalLoopLabel('证据 / 风险', 'Evidence / Risk')}</p>
              <p className="mt-1 break-words text-foreground">{displayText(insight.evidence)}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-border bg-card/70 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{signalLoopLabel('待确认', 'Open Question')}</p>
              <p className="mt-1 break-words text-foreground">{displayText(insight.question)}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-warning/20 bg-warning/[0.05] px-3 py-2 md:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warning">{signalLoopLabel('下一步', 'Next Move')}</p>
              <p className="mt-1 break-words font-medium text-foreground">{displayText(insight.nextMove)}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap xl:max-w-[220px] xl:justify-end">
          {evidenceHref ? (
            <Link href={evidenceHref} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-warning/30 hover:text-foreground">
              {signalLoopLabel('查看证据', 'View source')}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={addQuestionToPlay}
            disabled={alreadyWritten || writingQuestion}
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
              alreadyWritten
                ? 'border border-positive/20 bg-positive/10 text-positive'
                : 'border border-warning/25 bg-card text-warning hover:bg-warning/10'
            }`}
            title={alreadyWritten ? signalLoopLabel('这条信号已写入当前谋局的待验证问题。', 'This signal has already been added as a validation question.') : signalLoopLabel('将这条信号追加到当前谋局的关键假设列表。', 'Add this signal to the play assumptions as a validation question.')}
          >
            {writingQuestion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : alreadyWritten ? <CheckCircle2 className="h-3.5 w-3.5" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
            {alreadyWritten ? signalLoopLabel('已加入待验证问题', 'Added to validation') : writingQuestion ? signalLoopLabel('写入中…', 'Adding...') : signalLoopLabel('加入待验证问题', 'Add validation question')}
          </button>
        </div>
      </div>
      {writeError ? (
        <p className="mt-2 text-xs text-danger">{writeError}</p>
      ) : null}
    </div>
  );
}
