"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Swords, Zap, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { MOMENTUM_CONFIG } from "@/lib/permissions";
import { normalizePlayStepExecutionStatus } from "@/lib/strategic-play-execution";
import type { Account, Opportunity, StrategicPlay, PlayAssumption } from "@/lib/babel-engine/types";

// ─── Scoring ─────────────────────────────────────────────────────────

interface ScoredPlay {
  play: StrategicPlay;
  accountName: string;
  score: number;
  reason: string;
  dotColor: string;
}

function scoreAndReasonPlay(
  play: StrategicPlay,
  accountName: string,
  oppValue: number,
): ScoredPlay {
  let score = 0;
  const reasons: string[] = [];
  const mom = MOMENTUM_CONFIG[play.momentum] ?? MOMENTUM_CONFIG.active;

  const nextStep = play.steps.find(s => {
    const status = normalizePlayStepExecutionStatus(s.status);
    return status === 'planned' || status === 'in_progress' || status === 'blocked' || status === 'invalidated';
  });
  if (play.momentum === 'progressing' && nextStep) {
    score += 10;
    reasons.push(`下一步「${nextStep.title}」已就绪，窗口期内推进`);
  }

  if (oppValue > 0) {
    score += 5;
    reasons.push(`¥${(oppValue / 10000).toFixed(0)}万 高价值商机正在推进，保持势头`);
  }

  const blockedStep = play.steps.find(s => normalizePlayStepExecutionStatus(s.status) === 'blocked');
  if (blockedStep) {
    score += 9;
    reasons.push(`谋局步骤「${blockedStep.title}」受阻，需要重新谋局或调整打法`);
  }

  const invalidatedStep = play.steps.find(s => normalizePlayStepExecutionStatus(s.status) === 'invalidated');
  if (invalidatedStep) {
    score += 9;
    reasons.push(`谋局步骤「${invalidatedStep.title}」已失效，需要更新推进计划`);
  }

  if (play.momentum === 'slowing' || (play.daysSinceProgress >= 7 && play.daysSinceProgress <= 14)) {
    score += 8;
    reasons.push(`已 ${play.daysSinceProgress} 天未推进，再不行动可能降为停滞`);
  }

  if (play.momentum === 'stalled' || play.daysSinceProgress > 14) {
    score += 6;
    reasons.push(`已停滞 ${play.daysSinceProgress} 天，建议今日决定是否重规划或放弃`);
  }

  const invalidated = (play.assumptions ?? []).filter((a: PlayAssumption) => a.status === 'invalidated');
  if (invalidated.length > 0) {
    score += 7;
    reasons.push(`假设「${invalidated[0].text}」已被否定，需要重新评估路径`);
  }

  if (play.confidence > 60) {
    score += 3;
  }

  if (nextStep && (nextStep.timing.includes('本周') || nextStep.timing.toLowerCase().includes('this week'))) {
    score += 5;
  }

  const reason = reasons[0] || (play.confidence > 60 ? '高置信度谋局，值得推进' : '活跃谋局');

  return { play, accountName, score, reason, dotColor: mom.dotColor };
}

// ─── Component ───────────────────────────────────────────────────────

export function PlaySignalsCard({ accounts, opportunities }: { accounts: Account[]; opportunities: Opportunity[] }) {
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/strategic-play')
      .then(r => r.json())
      .then(d => setPlays(d.plays ?? []))
      .catch(() => setPlays([]))
      .finally(() => setLoading(false));
  }, []);

  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach(a => m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const oppValueMap = useMemo(() => {
    const m = new Map<string, number>();
    opportunities.forEach(o => m.set(o.id, o.value));
    return m;
  }, [opportunities]);

  const rankedSignals = useMemo(() => {
    const activePlays = plays.filter(p => p.status === 'active' || p.status === 'in_progress');

    const scored = activePlays.map(play => {
      const acctName = accountMap.get(play.accountId) || '未知客户';
      const oppValue = play.opportunityId ? (oppValueMap.get(play.opportunityId) ?? 0) : 0;
      return scoreAndReasonPlay(play, acctName, oppValue);
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, 6);
  }, [plays, accountMap, oppValueMap]);

  if (loading) {
    return (
      <SectionCard title="谋局信号" icon={Swords} iconColor="text-accent">
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-4 w-3/4 rounded bg-background" />
              <div className="mt-1.5 h-3 w-1/2 rounded bg-background" />
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  if (rankedSignals.length === 0) {
    return (
      <SectionCard title="谋局信号" icon={Swords} iconColor="text-accent" badge={0}>
        <p className="text-sm text-muted text-center py-3">暂无谋局信号</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="谋局信号" icon={Swords} iconColor="text-accent" badge={rankedSignals.length}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-accent" />
            <span className="text-[14px] font-semibold text-foreground">重点推进队列</span>
          </div>
          <span className="text-[12px] text-muted">显示 3 条高度，可上下滚动</span>
        </div>

        <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
          {rankedSignals.map(({ play, accountName, reason, dotColor }, index) => {
            const isPriority = index < 3;
            return (
              <Link
                key={play.id}
                href={`/accounts/${play.accountId}?tab=plays`}
                className={`block rounded-xl border px-3.5 py-3 transition-all duration-200 hover:bg-stripe ${
                  isPriority
                    ? 'border-[var(--card-border)] bg-background/60 shadow-[0_10px_30px_rgba(15,23,42,0.05)]'
                    : 'border-border/80 bg-background/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-[14px] font-medium leading-5 text-foreground">
                        <span className="truncate">{accountName}</span>
                        <span className="px-1 text-muted">·</span>
                        <span className="break-words [word-break:keep-all]">{play.goalDescription}</span>
                      </p>
                      {isPriority && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                          Top {index + 1}
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-[13px] leading-5 ${isPriority ? 'text-accent/90' : 'text-muted'}`}>
                      {reason}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
