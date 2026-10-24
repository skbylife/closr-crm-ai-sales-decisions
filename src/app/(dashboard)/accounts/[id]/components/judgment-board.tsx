'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ExternalLink, History, ShieldAlert } from 'lucide-react';
import { EvidenceTrace } from '@/components/judgment/evidence-trace';
import type { AccountMemoryConflict, AccountTimelineItem, EvidenceSourceKind, Judgment, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import { buildAccountVerificationSignals, type AccountVerificationSignal } from '@/lib/judgment/contradiction-signals';
import { buildEvidenceHref } from '@/lib/judgment/evidence-trace-links';
import { buildJudgmentMemorySourceHref, JUDGMENT_MEMORY_SOURCE_LABELS, type JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import { visibleBusinessText } from '@/lib/visible-business-text';
import { AdHocRecommendationEvidencePanel } from './ad-hoc-recommendation-evidence-panel';

const SOURCE_KIND_LABEL: Record<EvidenceSourceKind, string> = {
  intel_item: '情报',
  email_decode: '邮件解读',
  integration_email: '邮件',
  meeting_prep: '会议准备',
  activity_log: '活动记录',
  strategic_play: '谋局',
  source_record: '原始记录',
};

function getStatusLabel(status: Judgment['status']) {
  switch (status) {
    case 'provisional': return '暂定';
    case 'active': return '生效中';
    case 'revised': return '已修正';
    case 'resolved': return '已解决';
    default: return status;
  }
}

function getKindLabel(kind: Judgment['kind']) {
  switch (kind) {
    case 'momentum': return '动量';
    case 'champion_strength': return '关键推动者';
    case 'internal_alignment': return '内部一致性';
    case 'buying_urgency': return '采购紧迫性';
    case 'deal_risk': return '风险';
    case 'stakeholder_assessment': return '相关方判断';
    case 'budget_signal': return '预算判断';
    case 'procurement_signal': return '采购判断';
    case 'relationship_signal': return '关系判断';
    default: return '综合判断';
  }
}

function getValueTone(value: Judgment['value']) {
  switch (value) {
    case 'very_high':
    case 'high':
      return 'border-positive/20 bg-positive/5 text-positive';
    case 'medium':
    case 'mixed':
      return 'border-warning/20 bg-warning/5 text-warning';
    case 'low':
    case 'very_low':
      return 'border-danger/20 bg-danger/5 text-danger';
    default:
      return 'border-border bg-background text-muted';
  }
}

function getConfidenceTone(confidence: number) {
  if (confidence >= 0.7) return 'text-positive';
  if (confidence >= 0.45) return 'text-warning';
  return 'text-danger';
}

function compactText(text?: string) {
  if (!text) return '';
  return text.replace(/；/g, '，').split(/[。!?]/)[0]?.trim() ?? text;
}

function EvidenceRefList({ refs, accountId }: { refs: JudgmentEvidenceRef[]; accountId: string }) {
  if (refs.length === 0) {
    return <p className="text-xs text-muted">暂无关联证据索引</p>;
  }

  return (
    <div className="space-y-1.5">
      {refs.map((ref, idx) => {
        const href = buildEvidenceHref(ref, accountId);
        const kindLabel = SOURCE_KIND_LABEL[ref.sourceKind] ?? '记录';
        return (
          <div key={`${ref.sourceKind}:${ref.sourceId}:${idx}`} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <span className="shrink-0 rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] text-secondary">
              {kindLabel}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {ref.title || ref.sourceId}
            </span>
            {href ? (
              <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:underline">
                查看来源
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : ref.sourceKind === 'source_record' ? (
              <span className="shrink-0 text-[11px] text-muted">来源索引缺失</span>
            ) : (
              <span className="shrink-0 text-[11px] text-muted">暂不支持跳转</span>
            )}
          </div>
        );
      })}
    </div>
  );
}


interface JudgmentBoardProps {
  judgments: Judgment[];
  accountId: string;
  conflicts?: AccountMemoryConflict[];
  timelineItems?: AccountTimelineItem[];
  judgmentMemories?: JudgmentMemorySourceItem[];
}

const SIGNAL_TONE: Record<AccountVerificationSignal['severity'], string> = {
  high: 'border-danger/25 bg-danger/5 text-danger',
  medium: 'border-warning/25 bg-warning/5 text-warning',
  low: 'border-border bg-card text-secondary',
};

const SIGNAL_SEVERITY_LABEL: Record<AccountVerificationSignal['severity'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function buildJudgmentMemoryTraceSources(item: JudgmentMemorySourceItem): JudgmentEvidenceRef[] {
  return [
    {
      sourceId: item.sourceRecordId,
      sourceKind: 'source_record',
      title: item.title,
      sourceTable: item.sourceTable,
      sourceRowId: item.sourceRowId ?? item.sourceRecordId,
    },
    ...item.evidenceRefs,
  ];
}

function VerificationSignalsWorkbench({ signals, accountId }: { signals: AccountVerificationSignal[]; accountId: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-danger" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">关键矛盾 / 待验证信号</p>
          </div>
          <p className="mt-1 text-xs text-muted">最多展示 3 条，先验证影响推进节奏的信号。</p>
        </div>
        {signals.length > 0 ? (
          <span className="shrink-0 rounded-full border border-danger/20 bg-danger/5 px-2 py-0.5 text-[11px] font-medium text-danger">
            {signals.length} 条
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {signals.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">当前没有高优先级未解决矛盾，继续保持判断更新。</p>
        ) : signals.map((signal) => (
          <div key={signal.id} className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-secondary">{signal.typeLabel}</span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${SIGNAL_TONE[signal.severity]}`}>
                    优先级：{SIGNAL_SEVERITY_LABEL[signal.severity]}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{visibleBusinessText(signal.summary)}</p>
              </div>
            </div>
            <div className="rounded-md border border-warning/20 bg-warning/5 p-2.5">
              <p className="text-[11px] font-semibold text-warning">建议验证动作</p>
              <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(signal.suggestedAction)}</p>
            </div>
            <EvidenceTrace
              accountId={accountId}
              title="展开关联证据"
              description="来源索引默认收起，只在需要核实时展开。"
              provisional
              sources={signal.sourceRefs}
              emptyText="暂无可跳转来源。"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentJudgmentSourcesWorkbench({ items, accountId }: { items: JudgmentMemorySourceItem[]; accountId: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">最近判断变化 / 来源</p>
          <p className="mt-1 text-xs text-muted">沟通解读、投标分析与谋局沉淀的最新判断；来源追踪默认折叠，执行结果会进入学习闭环。</p>
        </div>
        {items.length > 0 ? (
          <span className="shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-secondary">{items.length} 条</span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">暂无最近判断来源。保存一次沟通解读、投标分析或谋局后会出现在这里。</p>
        ) : items.map((item) => {
          const href = buildJudgmentMemorySourceHref(item, accountId);
          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
                      {JUDGMENT_MEMORY_SOURCE_LABELS[item.sourceKind]}
                    </span>
                    {item.traceStatus === 'derived' ? (
                      <span className="rounded-full border border-warning/20 bg-warning/5 px-2 py-0.5 text-[11px] font-medium text-warning">历史记录补算</span>
                    ) : null}
                    <span className="text-[11px] text-muted">更新 {new Date(item.updatedAt).toLocaleString('zh-CN')}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">{visibleBusinessText(item.title)}</p>
                  {item.traceNote ? <p className="mt-1 text-[11px] leading-5 text-muted">{visibleBusinessText(item.traceNote)}</p> : null}
                </div>
                {href ? (
                  <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:underline">
                    查看来源
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted">当前判断</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(item.currentJudgment)}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-2.5">
                  <p className="text-[10px] text-muted">最大风险</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(item.risk)}</p>
                </div>
                <div className="rounded-md border border-border bg-warning/5 p-2.5">
                  <p className="text-[10px] text-warning">建议验证动作</p>
                  <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(item.nextAction)}</p>
                </div>
              </div>

              <EvidenceTrace
                accountId={accountId}
                title="展开证据痕迹"
                description="查看该判断来源、置信度和仍需确认的信息。"
                confidence={item.confidence}
                provisional={item.provisional}
                uncertainty={item.uncertainty}
                sources={buildJudgmentMemoryTraceSources(item)}
                emptyText="暂无证据索引。"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function JudgmentBoard({ judgments, accountId, conflicts = [], timelineItems = [], judgmentMemories = [] }: JudgmentBoardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const verificationSignals = useMemo(() => buildAccountVerificationSignals({
    conflicts,
    timelineItems,
    judgmentMemories,
    limit: 3,
  }), [conflicts, timelineItems, judgmentMemories]);
  const recentJudgmentSources = useMemo(() => judgmentMemories.slice(0, 3), [judgmentMemories]);

  const summary = useMemo(() => {
    const momentum = judgments.find((item) => item.kind === 'momentum');
    const risk = judgments.find((item) => item.kind === 'deal_risk');
    const alignment = judgments.find((item) => item.kind === 'internal_alignment');
    const champion = judgments.find((item) => item.kind === 'champion_strength');
    const urgency = judgments.find((item) => item.kind === 'buying_urgency');
    const lead = momentum ?? risk ?? judgments[0];
    const avgConfidence = judgments.reduce((acc, item) => acc + item.confidence, 0) / judgments.length;

    let headline = '当前交易需要继续验证';
    if (momentum?.value === 'high' || momentum?.value === 'very_high') headline = '这单在向前推进，可以主动争取下一次承诺';
    else if (momentum?.value === 'low' || momentum?.value === 'very_low') headline = '这单推进乏力，先处理卡点再谈加速';
    if (risk?.value === 'high' || risk?.value === 'very_high') headline = '这单有明显风险，先稳住关键人和关键证据';

    const reasons = [lead, risk, champion, alignment]
      .filter((item): item is Judgment => Boolean(item))
      .map((item) => compactText(item.rationale) || compactText(item.summary) || item.title)
      .filter(Boolean)
      .slice(0, 3);

    const actions: string[] = [];
    if (risk?.value === 'high' || risk?.value === 'very_high') actions.push('先和关键相关方逐个确认顾虑，把阻碍点变成可回应的问题清单');
    if (!champion || champion.value === 'low' || champion.value === 'very_low') actions.push('尽快锁定一位愿意内部推动的人，并让对方明确下一步站台动作');
    if (alignment?.value === 'low' || alignment?.value === 'very_low') actions.push('补一轮内部对齐，用同一版价值主张分别回应业务、技术和采购关切');
    if (urgency?.value === 'low' || urgency?.value === 'very_low') actions.push('推动一个带日期的下一步承诺，比如评审会、Demo 或报价确认');
    if (actions.length < 2 && momentum?.value && ['high', 'very_high', 'medium'].includes(momentum.value)) {
      actions.push('趁窗口期推进下一次明确承诺，把时间、参与人和预期产出一起敲定');
    }
    if (actions.length < 3 && lead) {
      actions.push(`围绕“${lead.summary}”补强证据，避免判断停留在感受层`);
    }

    return {
      headline,
      avgConfidence,
      lead,
      momentum,
      risk,
      reasons,
      actions: actions.slice(0, 3),
    };
  }, [judgments]);

  if (judgments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-secondary uppercase tracking-wide">交易判断</p>
        <p className="mt-2 text-sm text-muted">当前证据不足，暂时无法形成稳定判断。</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex flex-col gap-3 border-b border-border pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.14em]">账户判断工作台</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{visibleBusinessText(summary.headline)}</h3>
          <p className="mt-1 text-xs text-secondary">AI 判断默认展开；原始来源和来源追踪保持收起，需要核实时再展开，避免变成证据墙。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.momentum ? <span className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${getValueTone(summary.momentum.value)}`}>动量 {visibleBusinessText(summary.momentum.summary)}</span> : null}
          {summary.risk ? <span className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${getValueTone(summary.risk.value)}`}>风险 {visibleBusinessText(summary.risk.summary)}</span> : null}
          <span className={`rounded-md border border-border px-2.5 py-1 text-[11px] font-medium ${getConfidenceTone(summary.avgConfidence)}`}>置信度 {Math.round(summary.avgConfidence * 100)}%</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">为什么这样判断</p>
            <div className="mt-3 space-y-2">
              {summary.reasons.map((reason, index) => (
                <div key={`${index}-${reason}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                  {visibleBusinessText(reason)}
                </div>
              ))}
            </div>
          </div>

          {summary.lead ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">当前关键判断</p>
              <p className="mt-2 text-base font-semibold text-foreground">{visibleBusinessText(summary.lead.title)}</p>
              <p className="mt-1 text-sm text-secondary">{visibleBusinessText(summary.lead.summary)}</p>
              {summary.lead.rationale ? <p className="mt-2 text-xs leading-6 text-muted">{visibleBusinessText(summary.lead.rationale)}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">风险提醒</p>
            <p className="mt-2 text-sm text-foreground">{visibleBusinessText(summary.risk?.summary ?? '当前未发现高强度风险。')}</p>
            {summary.risk?.rationale ? (
              <p className="mt-2 text-xs leading-5 text-muted">{visibleBusinessText(summary.risk.rationale)}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">建议下一步动作</p>
            <div className="mt-3 space-y-2">
              {summary.actions.map((action, index) => (
                <div key={`${index}-${action}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                  {index + 1}. {visibleBusinessText(action)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <VerificationSignalsWorkbench signals={verificationSignals} accountId={accountId} />
        <RecentJudgmentSourcesWorkbench items={recentJudgmentSources} accountId={accountId} />
      </div>

      <div className="rounded-xl border border-border bg-muted/20">
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">判断依据（默认展开）</p>
            <p className="text-xs text-muted">AI 解释直接展示；原始证据面板仍需手动展开</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-secondary transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
        </button>

        {detailsOpen ? (
          <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
            {judgments.map((judgment) => {
              const isExpanded = expandedId === judgment.id;
              const historyOpen = historyOpenId === judgment.id;
              const evidenceCount = judgment.evidenceRefs.length;
              return (
                <div key={judgment.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] text-accent">{getKindLabel(judgment.kind)}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-secondary">{getStatusLabel(judgment.status)}</span>
                    <span className={`text-[11px] ${getConfidenceTone(judgment.confidence)}`}>置信度 {Math.round(judgment.confidence * 100)}%</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{visibleBusinessText(judgment.title)}</p>
                  <p className="text-sm text-secondary">{visibleBusinessText(judgment.summary)}</p>
                  {judgment.previousSummary || judgment.whyChanged ? (
                    <div className="rounded-lg border border-accent/10 bg-accent/5 p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <History className="h-3.5 w-3.5 text-accent" />
                        <p className="text-[11px] font-semibold text-accent">修订轨迹</p>
                        <span className="text-[10px] text-muted">修订于 {new Date(judgment.updatedAt).toLocaleString('zh-CN')}</span>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md border border-border bg-card p-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted">之前怎么判断</p>
                          <p className="mt-1 text-[11px] font-medium text-foreground">{visibleBusinessText(judgment.previousTitle ?? judgment.title)}</p>
                          {judgment.previousSummary ? <p className="mt-1 text-[11px] text-secondary">{visibleBusinessText(judgment.previousSummary)}</p> : <p className="mt-1 text-[11px] text-muted">暂无历史摘要</p>}
                        </div>
                        <div className="rounded-md border border-border bg-card p-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted">现在怎么判断</p>
                          <p className="mt-1 text-[11px] font-medium text-foreground">{visibleBusinessText(judgment.title)}</p>
                          <p className="mt-1 text-[11px] text-secondary">{visibleBusinessText(judgment.summary)}</p>
                        </div>
                      </div>
                      {judgment.whyChanged ? <p className="text-[11px] leading-5 text-secondary">为什么改了：{visibleBusinessText(judgment.whyChanged)}</p> : null}
                      {judgment.changeEvidenceRefs?.length ? (
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted">修正依据</p>
                          <EvidenceRefList refs={judgment.changeEvidenceRefs} accountId={accountId} />
                        </div>
                      ) : null}
                      {judgment.revisionHistory && judgment.revisionHistory.length > 1 ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setHistoryOpenId(historyOpen ? null : judgment.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-background"
                          >
                            <ChevronDown className={`h-3 w-3 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                            {historyOpen ? '收起历史链' : `查看历史链（${judgment.revisionHistory.length} 版）`}
                          </button>
                          {historyOpen ? (
                            <div className="space-y-2 rounded-md border border-border bg-card p-2">
                              {judgment.revisionHistory.map((item, index) => (
                                <div key={item.id} className="flex items-start gap-3 rounded-md border border-border/70 bg-background/60 p-2">
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">{index + 1}</div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-[11px] font-medium text-foreground">{visibleBusinessText(item.summary)}</p>
                                      <span className="text-[10px] text-muted">{new Date(item.changedAt).toLocaleString('zh-CN')}</span>
                                    </div>
                                    {item.whyChanged ? <p className="mt-1 text-[11px] leading-5 text-secondary">{visibleBusinessText(item.whyChanged)}</p> : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {judgment.rationale ? <p className="text-xs text-muted">依据：{visibleBusinessText(judgment.rationale)}</p> : null}
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary">为什么重要</p>
                      <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(judgment.rationale ?? `这说明当前局势已经出现足以影响推进节奏的变化，如果继续沿用原来的判断，团队可能会错过关键窗口。`)}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary">最可能的误判</p>
                      <p className="mt-1 text-xs leading-5 text-foreground">{judgment.contradictionIds?.length ? '当前存在相互冲突的信号，若只看表面活跃度或单一联系人反馈，容易高估推进确定性。' : '如果忽略上下文变化，容易把当前判断误读为短期波动，而不是已经成形的结构性变化。'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary">现在最该做什么</p>
                      <p className="mt-1 text-xs leading-5 text-foreground">{visibleBusinessText(summary.actions[0] ?? '先补充最新证据，再决定是否调整推进动作。')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : judgment.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-background"
                    >
                      <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      {isExpanded ? '收起证据面板' : `查看证据面板（${evidenceCount}）`}
                    </button>
                    {judgment.contradictionIds?.length ? <span className="text-danger">矛盾信号 {judgment.contradictionIds.length} 条</span> : null}
                  </div>

                  {isExpanded ? (
                    <div className="space-y-3 rounded-lg border border-accent/10 bg-accent/5 p-3">
                      <div>
                        <p className="text-xs font-semibold text-accent">证据索引</p>
                        <p className="mt-1 text-[11px] text-muted">先展示当前判断命中的证据索引，再展示可验证的证据面板。</p>
                      </div>
                      <EvidenceRefList refs={judgment.evidenceRefs} accountId={accountId} />
                      <AdHocRecommendationEvidencePanel
                        accountId={accountId}
                        recommendationId={judgment.id}
                        recommendationTitle={visibleBusinessText(judgment.title)}
                        recommendationSummary={visibleBusinessText(`${judgment.summary} ${judgment.whyChanged ?? ''}`.trim())}
                        confidence={judgment.confidence}
                        panelTitle="证据面板 · 判断"
                        enabled={isExpanded}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
