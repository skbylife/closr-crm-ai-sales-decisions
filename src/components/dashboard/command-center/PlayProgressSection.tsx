"use client";

/**
 * PlayProgressSection — 谋局进度分析 + 建议新谋局
 *
 * 自包含组件，独立获取 strategic_plays 数据。
 * 适用于所有职级，显示：
 * - 活跃谋局进度概览
 * - 停滞/放缓的谋局需要关注
 * - 建议发起新谋局的客户（有商机但无活跃谋局）
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Swords, AlertTriangle, Plus, ChevronRight, TrendingUp, Pause } from "lucide-react";

interface PlaySummary {
  id: string;
  accountId: string;
  accountName: string;
  goalDescription: string;
  momentum: string;
  daysSinceProgress: number;
  status: string;
  confidence: number;
  stepsTotal: number;
  stepsDone: number;
}

interface SuggestedNewPlay {
  accountId: string;
  accountName: string;
  reason: string;
}

export function PlayProgressSection({ className }: { className?: string }) {
  const [plays, setPlays] = useState<PlaySummary[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedNewPlay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/strategic-play").then(r => r.ok ? r.json() : { plays: [] }),
      fetch("/api/play-suggestions").then(r => r.ok ? r.json() : { suggestions: [] }).catch(() => ({ suggestions: [] })),
    ]).then(([playData, suggestData]) => {
      if (cancelled) return;

      // Map plays to summary
      const rawPlays = (playData.plays ?? []) as Array<{
        id: string;
        accountId: string;
        accountName?: string;
        goalDescription?: string;
        goal_description?: string;
        momentum: string;
        daysSinceProgress?: number;
        days_since_progress?: number;
        status: string;
        confidence?: number;
        steps?: Array<{ status: string }>;
      }>;

      const summaries: PlaySummary[] = rawPlays
        .filter(p => p.status === 'active' || p.status === 'in_progress')
        .map(p => ({
          id: p.id,
          accountId: p.accountId,
          accountName: p.accountName ?? '',
          goalDescription: p.goalDescription ?? p.goal_description ?? '',
          momentum: p.momentum,
          daysSinceProgress: p.daysSinceProgress ?? p.days_since_progress ?? 0,
          status: p.status,
          confidence: p.confidence ?? 0,
          stepsTotal: p.steps?.length ?? 0,
          stepsDone: p.steps?.filter(s => s.status === 'done').length ?? 0,
        }));

      setPlays(summaries);
      setSuggestions(suggestData.suggestions ?? []);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const { progressing, needsAttention } = useMemo(() => {
    const progressing = plays.filter(p => p.momentum === 'progressing' || (p.momentum === 'active' && p.daysSinceProgress < 7));
    const needsAttention = plays.filter(p => p.momentum === 'stalled' || p.momentum === 'slowing' || p.daysSinceProgress >= 7);
    return { progressing, needsAttention };
  }, [plays]);

  if (loading) {
    return (
      <div className={className}>
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 rounded-lg skeleton" />)}
        </div>
      </div>
    );
  }

  if (plays.length === 0 && suggestions.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {/* 进展中的谋局 */}
      {progressing.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3 w-3 text-positive" />
            <span className="text-[10px] font-semibold text-positive uppercase tracking-[0.1em]">推进中 ({progressing.length})</span>
          </div>
          <div className="space-y-1.5">
            {progressing.slice(0, 4).map(p => (
              <Link
                key={p.id}
                href={`/accounts/${p.accountId}?tab=plays`}
                className="flex items-center gap-3 rounded-lg border border-positive/15 bg-positive/[0.03] px-3 py-2 transition-colors hover:bg-positive/[0.06]"
              >
                <Swords className="h-3.5 w-3.5 text-positive shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{p.goalDescription || '进行中的谋局'}</p>
                  <p className="text-[10px] text-muted">{p.accountName}{p.stepsTotal > 0 ? ` · 完成 ${p.stepsDone}/${p.stepsTotal} 步` : ''}</p>
                </div>
                <ChevronRight className="h-3 w-3 text-muted shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 需要关注的谋局 */}
      {needsAttention.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Pause className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-semibold text-warning uppercase tracking-[0.1em]">需要关注 ({needsAttention.length})</span>
          </div>
          <div className="space-y-1.5">
            {needsAttention.slice(0, 4).map(p => (
              <Link
                key={p.id}
                href={`/accounts/${p.accountId}?tab=plays`}
                className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning/[0.04] px-3 py-2 transition-colors hover:bg-warning/[0.07]"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{p.goalDescription || '停滞中的谋局'}</p>
                  <p className="text-[10px] text-muted">
                    {p.accountName} · {p.momentum === 'stalled' ? '已停滞' : '放缓中'} · {p.daysSinceProgress}天无进展
                  </p>
                </div>
                <ChevronRight className="h-3 w-3 text-muted shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 建议发起新谋局 */}
      {suggestions.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Plus className="h-3 w-3 text-accent" />
            <span className="text-[10px] font-semibold text-accent uppercase tracking-[0.1em]">建议新谋局</span>
          </div>
          <div className="space-y-1.5">
            {suggestions.slice(0, 3).map((s, i) => (
              <Link
                key={i}
                href={`/accounts/${s.accountId}?tab=plays`}
                className="flex items-center gap-3 rounded-lg border border-accent/15 bg-accent/[0.03] px-3 py-2 transition-colors hover:bg-accent/[0.06]"
              >
                <Plus className="h-3.5 w-3.5 text-accent shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{s.accountName}</p>
                  <p className="text-[10px] text-muted">{s.reason}</p>
                </div>
                <ChevronRight className="h-3 w-3 text-muted shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
