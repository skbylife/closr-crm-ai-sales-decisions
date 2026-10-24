'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import type { RecommendationEvidenceBundle, RecommendationEvidenceItem } from '@/lib/babel-engine/types';
import { ChineseFirstText } from '@/components/ui/chinese-first-text';

function getSourceKindLabel(sourceKind: string) {
  const labels: Record<string, string> = {
    strategic_play: '谋局建议',
    intel_item: '情报',
    source_record: '原始记录',
    meeting_note: '会议纪要',
    integration_email: '邮件往来',
    task: '任务',
    activity: '活动记录',
    public_web: '公开网页',
    manual_note: '手动记录',
    decode: '解读',
  };
  return labels[sourceKind] ?? '相关记录';
}

function buildSourceHref(item: RecommendationEvidenceItem, accountId?: string) {
  if (!accountId) return undefined;
  const targetId = item.sourceKind === 'source_record' ? (item.sourceRowId ?? item.sourceId) : item.sourceId;

  if (item.sourceKind === 'strategic_play') {
    return `/accounts/${accountId}?tab=plays&playId=${item.sourceId}`;
  }

  if (
    item.sourceKind === 'intel_item' ||
    item.sourceKind === 'integration_email' ||
    item.sourceKind === 'email_decode' ||
    item.sourceKind === 'activity_log'
  ) {
    return `/accounts/${accountId}?tab=activity&targetKind=${encodeURIComponent(item.sourceKind)}&targetId=${encodeURIComponent(targetId)}`;
  }

  if (item.sourceKind === 'source_record') {
    return `/accounts/${accountId}?tab=knowledge&targetKind=${encodeURIComponent(item.sourceKind)}&targetId=${encodeURIComponent(targetId)}`;
  }

  return undefined;
}

function formatTraceabilityId(value?: string | null) {
  if (!value) return '系统记录';
  const trimmed = value.trim();
  if (!trimmed) return '系统记录';
  return trimmed.length > 8 ? `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}` : trimmed;
}

function dedupeEvidenceItems(items: RecommendationEvidenceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalizedExcerpt = item.excerpt.trim();
    const key = [item.sourceKind, item.sourceRowId ?? item.sourceId, item.title.trim(), normalizedExcerpt].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function RecommendationEvidenceCard({
  bundle,
  loading,
  title = '证据面板',
  accountId,
}: {
  bundle: RecommendationEvidenceBundle | null;
  loading?: boolean;
  title?: string;
  accountId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showTraceability, setShowTraceability] = useState(false);

  const dedupedEvidenceItems = useMemo(() => dedupeEvidenceItems(bundle?.evidenceItems ?? []), [bundle?.evidenceItems]);
  const supportingFacts = dedupedEvidenceItems.filter((item) => item.sourceKind !== 'strategic_play');
  const strategyItems = dedupedEvidenceItems.filter((item) => item.sourceKind === 'strategic_play');
  const primaryEvidence = supportingFacts.length > 0 ? supportingFacts : dedupedEvidenceItems;
  const visible = expanded ? primaryEvidence : primaryEvidence.slice(0, 3);

  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-4 text-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }

  if (!bundle) return null;

  const lowEvidenceReasonLabels: Record<string, string> = {
    supporting_evidence_count_below_minimum: '支持证据少于 2 条',
    all_supporting_evidence_is_stale: '现有证据都已过旧',
    supporting_evidence_is_single_source: '证据过度集中在单一来源',
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-secondary uppercase tracking-wide">{title}</p>
          <h4 className="text-sm font-semibold text-foreground">{bundle.recommendationTitle}</h4>
          <p className="mt-1 text-xs text-muted">{bundle.evidenceStrengthLabel} · 置信度 {bundle.confidence}%</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {bundle.isCoreRecommendationSurface && <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] text-accent">核心建议</span>}
          {bundle.lowEvidence && <span className="rounded-full border border-warning/20 bg-warning/5 px-2 py-0.5 text-[11px] text-warning">低证据支持</span>}
          {bundle.conflictDetected && <span className="rounded-full border border-danger/20 bg-danger/5 px-2 py-0.5 text-[11px] text-danger">冲突</span>}
        </div>
      </div>

      {bundle.lowEvidence && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="space-y-1">
            <p>当前证据不足以支撑高置信执行，建议在行动前补充新的邮件、会议或手动记录。</p>
            {bundle.lowEvidenceReasons?.length ? (
              <ul className="list-disc pl-4 text-[11px] text-warning">
                {bundle.lowEvidenceReasons.map((reason) => (
                  <li key={reason}>{lowEvidenceReasonLabels[reason] ?? reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">关键支撑证据</p>
          <p className="text-[11px] text-muted">先展示事实，再展示内部溯源</p>
        </div>

        {visible.map((item) => {
          const href = buildSourceHref(item, accountId ?? bundle.accountId);
          return (
            <div key={`${item.sourceKind}:${item.sourceId}`} className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[11px] text-secondary">
                      {getSourceKindLabel(item.sourceKind)}
                    </span>
                    {href ? (
                      <Link href={href} className="text-[11px] font-medium text-accent hover:underline">
                        查看来源
                      </Link>
                    ) : (
                      <span className="text-[11px] text-muted">暂不支持直接跳转</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted">{new Date(item.occurredAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <ChineseFirstText text={item.excerpt} className="text-xs text-secondary block" />
              {showTraceability ? (
                <div className="rounded-md bg-muted/40 p-2 space-y-1 text-[11px] text-muted">
                  <p>业务归属：{item.sourceLabel || item.title}</p>
                  <p>内部定位：{item.sourceTable ?? getSourceKindLabel(item.sourceKind)}</p>
                  <p>记录编号：{formatTraceabilityId(item.sourceRowId ?? item.sourceId)}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {strategyItems.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-semibold text-foreground">相关建议记录</p>
          {strategyItems.slice(0, expanded ? strategyItems.length : 1).map((item) => (
            <div key={`${item.sourceKind}:${item.sourceId}:strategy`} className="text-xs text-secondary space-y-1">
              <p className="font-medium text-foreground">{item.title}</p>
              <ChineseFirstText text={item.excerpt} className="block" />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4">
        {primaryEvidence.length > 3 && (
          <button
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? '收起证据' : `查看更多证据（${primaryEvidence.length - 3}）`}
          </button>
        )}

        <button
          onClick={() => setShowTraceability((value) => !value)}
          className="text-xs font-medium text-muted hover:text-foreground"
        >
          {showTraceability ? '隐藏技术溯源' : '显示技术溯源'}
        </button>
      </div>
    </div>
  );
}
