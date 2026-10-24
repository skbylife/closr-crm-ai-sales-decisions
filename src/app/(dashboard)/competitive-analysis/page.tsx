'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Swords, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Target, Trophy, Zap, ExternalLink } from 'lucide-react';
import type { Opportunity } from '@/lib/babel-engine/types';
import { CompetitivePositioningCard } from '@/components/pipeline/competitive-positioning-card';
import { CompetitorMatrix } from '@/components/pipeline/competitor-matrix';
import { formatCurrency } from '@/lib/format-currency';
export default function CompetitiveAnalysisPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const {
    opportunities
  } = useStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'positioning-card' | 'matrix'>('positioning-card');

  // Filter opportunities with competition data
  const opportunitiesWithCompetitors = useMemo(() => {
    return opportunities.filter(opp => {
      const competition = opp.meddicc?.competition ?? [];
      return competition.length > 0;
    });
  }, [opportunities]);

  // Group by threat level
  const groupedOpps = useMemo(() => {
    const groups: Record<string, Opportunity[]> = {
      high: [],
      medium: [],
      low: []
    };
    opportunitiesWithCompetitors.forEach(opp => {
      const competition = opp.meddicc?.competition ?? [];
      const hasHigh = competition.some(c => c.threatLevel === 'high');
      const mediumCount = competition.filter(c => c.threatLevel === 'medium').length;
      if (hasHigh && mediumCount >= 1) {
        groups.high.push(opp);
      } else if (hasHigh) {
        groups.high.push(opp);
      } else if (mediumCount >= 2) {
        groups.high.push(opp);
      } else if (mediumCount >= 1) {
        groups.medium.push(opp);
      } else {
        groups.low.push(opp);
      }
    });
    return groups;
  }, [opportunitiesWithCompetitors]);
  const totalCompetitors = useMemo(() => {
    return opportunitiesWithCompetitors.reduce((sum, opp) => {
      return sum + (opp.meddicc?.competition?.length ?? 0);
    }, 0);
  }, [opportunitiesWithCompetitors]);
  const totalValue = useMemo(() => {
    return opportunitiesWithCompetitors.reduce((sum, opp) => sum + (opp.value ?? 0), 0);
  }, [opportunitiesWithCompetitors]);

  // ─── 全局竞品洞察 ───────────────────────────────────────────────────
  const competitorInsights = useMemo(() => {
    const competitorMap = new Map<string, {
      name: string;
      appearances: number;
      wonDeals: number;
      lostDeals: number;
      activeDeals: number;
      totalValue: number;
      avgThreatLevel: number;
    }>();
    opportunities.forEach(opp => {
      const competition = opp.meddicc?.competition ?? [];
      const isWon = opp.stage === 'closed_won';
      const isLost = opp.stage === 'closed_lost';
      const isActive = !isWon && !isLost;
      competition.forEach(comp => {
        const existing = competitorMap.get(comp.name) || {
          name: comp.name,
          appearances: 0,
          wonDeals: 0,
          lostDeals: 0,
          activeDeals: 0,
          totalValue: 0,
          avgThreatLevel: 0
        };
        existing.appearances += 1;
        if (isWon) existing.wonDeals += 1;
        if (isLost) existing.lostDeals += 1;
        if (isActive) existing.activeDeals += 1;
        existing.totalValue += opp.value ?? 0;
        const threatScore = comp.threatLevel === 'high' ? 3 : comp.threatLevel === 'medium' ? 2 : 1;
        existing.avgThreatLevel = (existing.avgThreatLevel * (existing.appearances - 1) + threatScore) / existing.appearances;
        competitorMap.set(comp.name, existing);
      });
    });
    return Array.from(competitorMap.values()).sort((a, b) => b.appearances - a.appearances).slice(0, 5);
  }, [opportunities]);

  // 计算整体胜率
  const overallWinRate = useMemo(() => {
    const closedOppsWithCompetition = opportunities.filter(opp => {
      const hasCompetition = (opp.meddicc?.competition?.length ?? 0) > 0;
      return hasCompetition && (opp.stage === 'closed_won' || opp.stage === 'closed_lost');
    });
    const won = closedOppsWithCompetition.filter(o => o.stage === 'closed_won').length;
    const total = closedOppsWithCompetition.length;
    return total > 0 ? Math.round(won / total * 100) : null;
  }, [opportunities]);
  return <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Swords className="h-7 w-7 text-accent" />
          <h1 className="text-3xl font-bold text-foreground">{tx("竞品分析中心")}</h1>
        </div>
        <p className="text-sm text-muted">{tx("全局竞品格局分析 · 制定差异化竞争策略")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">{tx("竞争商机")}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {opportunitiesWithCompetitors.length}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-accent/40" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">{tx("竞品总数")}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {totalCompetitors}
              </p>
            </div>
            <Swords className="h-8 w-8 text-amber-400/40" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted uppercase tracking-wider">{tx("涉及金额")}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {formatCurrency(totalValue, 'CNY')}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-400/40" />
          </div>
        </div>

        {overallWinRate !== null && <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">{tx("竞争胜率")}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {overallWinRate}%
                </p>
              </div>
              <Trophy className={`h-8 w-8 ${overallWinRate >= 50 ? 'text-positive/40' : 'text-warning/40'}`} />
            </div>
          </div>}
      </div>

      {/* 全局竞品洞察 */}
      {competitorInsights.length > 0 && <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{tx("全局竞品洞察")}</h2>
              <p className="mt-0.5 text-xs text-muted">{tx("Top 竞品出现频率和对战记录")}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {competitorInsights.map(comp => {
          const winRate = comp.wonDeals + comp.lostDeals > 0 ? Math.round(comp.wonDeals / (comp.wonDeals + comp.lostDeals) * 100) : null;
          const threatColor = comp.avgThreatLevel >= 2.5 ? 'text-danger' : comp.avgThreatLevel >= 1.5 ? 'text-warning' : 'text-positive';
          return <div key={comp.name} className="px-5 py-3 flex items-center justify-between hover:bg-stripe transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{comp.name}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${threatColor} bg-current/10`}>
                        {comp.avgThreatLevel >= 2.5 ? '高威胁' : comp.avgThreatLevel >= 1.5 ? '中威胁' : '低威胁'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{tx("出现")}{comp.appearances}{tx("次")}</span>
                      <span>{comp.activeDeals}{tx("个活跃商机")}</span>
                      {winRate !== null && <span className={winRate >= 50 ? 'text-positive' : 'text-danger'}>{tx("胜率")}{winRate}% ({comp.wonDeals}{tx("胜 /")}{comp.lostDeals}{tx("负)")}</span>}
                      <span>{formatCurrency(comp.totalValue, 'CNY')}</span>
                    </div>
                  </div>
                </div>;
        })}
          </div>
        </div>}

      {/* 快速行动建议 */}
      {groupedOpps.high.length > 0 && <div className="rounded-xl border border-danger/20 bg-danger/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-5 w-5 text-danger" />
            <h3 className="text-sm font-bold text-danger">{tx("高威胁商机应对建议")}</h3>
          </div>
          <ul className="space-y-2 text-sm text-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0" />
              <span>{tx("优先投入资源到高威胁商机，确保 Champion 和 Economic Buyer 关系稳固")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0" />
              <span>{tx("针对主要竞品（")}{competitorInsights[0]?.name || '未知'}{tx("）准备差异化 positioning-card 和应对话术")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0" />
              <span>{tx("与团队同步竞品最新动向，及时调整策略和价值主张")}</span>
            </li>
          </ul>
        </div>}

      {/* View Mode Toggle */}
      <div className="flex items-center gap-2">
        <button onClick={() => setViewMode('positioning-card')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'positioning-card' ? 'bg-accent/20 text-accent' : 'bg-card text-muted hover:bg-accent/10 hover:text-accent'}`}>{tx("态势图模式")}</button>
        <button onClick={() => setViewMode('matrix')} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'matrix' ? 'bg-accent/20 text-accent' : 'bg-card text-muted hover:bg-accent/10 hover:text-accent'}`}>{tx("矩阵模式")}</button>
      </div>

      {/* Empty State */}
      {opportunitiesWithCompetitors.length === 0 && <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/5">
            <Swords className="h-8 w-8 text-accent/60" />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-foreground">{tx("暂无竞品数据")}</h3>
          <p className="mt-2 max-w-md mx-auto text-sm leading-relaxed text-muted">{tx("在商机的 MEDDICC 评估中添加竞品信息后，这里将显示全局竞品格局分析、胜率统计和应对建议。")}</p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/pipeline" className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors">
              <Target className="h-4 w-4" />{tx("前往商机管线")}</Link>
            <a href="https://docs.closr.ing/meddicc-competitive" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-background transition-colors">{tx("了解如何添加竞品")}<ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>}

      {/* High Threat Opportunities */}
      {groupedOpps.high.length > 0 && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-red-400" />
            <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">{tx("高威胁商机 (")}{groupedOpps.high.length})
            </h2>
          </div>
          <div className="space-y-3">
            {groupedOpps.high.map(opp => <OpportunityCard key={opp.id} opportunity={opp} isExpanded={expandedId === opp.id} onToggle={() => setExpandedId(expandedId === opp.id ? null : opp.id)} viewMode={viewMode} />)}
          </div>
        </section>}

      {/* Medium Threat Opportunities */}
      {groupedOpps.medium.length > 0 && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-amber-400" />
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">{tx("中威胁商机 (")}{groupedOpps.medium.length})
            </h2>
          </div>
          <div className="space-y-3">
            {groupedOpps.medium.map(opp => <OpportunityCard key={opp.id} opportunity={opp} isExpanded={expandedId === opp.id} onToggle={() => setExpandedId(expandedId === opp.id ? null : opp.id)} viewMode={viewMode} />)}
          </div>
        </section>}

      {/* Low Threat Opportunities */}
      {groupedOpps.low.length > 0 && <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-emerald-400" />
            <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">{tx("低威胁商机 (")}{groupedOpps.low.length})
            </h2>
          </div>
          <div className="space-y-3">
            {groupedOpps.low.map(opp => <OpportunityCard key={opp.id} opportunity={opp} isExpanded={expandedId === opp.id} onToggle={() => setExpandedId(expandedId === opp.id ? null : opp.id)} viewMode={viewMode} />)}
          </div>
        </section>}
    </div>;
}

// ─── Opportunity Card ───────────────────────────────────────────────────

interface OpportunityCardProps {
  opportunity: Opportunity;
  isExpanded: boolean;
  onToggle: () => void;
  viewMode: 'positioning-card' | 'matrix';
}
function OpportunityCard({
  opportunity,
  isExpanded,
  onToggle,
  viewMode
}: OpportunityCardProps) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const accounts = useStore(s => s.accounts);
  const account = accounts.find(a => a.id === opportunity.accountId);
  const competition = opportunity.meddicc?.competition ?? [];

  // 计算威胁等级
  const highThreatCount = competition.filter(c => c.threatLevel === 'high').length;
  const mediumThreatCount = competition.filter(c => c.threatLevel === 'medium').length;
  return <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/pipeline/${opportunity.id}`} className="text-base font-semibold text-foreground hover:text-accent transition-colors flex items-center gap-1.5 group" onClick={e => e.stopPropagation()}>
              {opportunity.name}
              <ExternalLink className="h-3.5 w-3.5 text-muted group-hover:text-accent transition-colors" />
            </Link>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
              {opportunity.stage}
            </span>
            <span className="rounded-full bg-sidebar border border-border px-2 py-0.5 text-xs font-medium text-foreground">
              {competition.length}{tx("个竞品")}</span>
            {highThreatCount > 0 && <span className="rounded-full bg-danger/10 border border-danger/20 px-2 py-0.5 text-xs font-medium text-danger">
                {highThreatCount}{tx("高威胁")}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-medium text-foreground">{formatCurrency(opportunity.value ?? 0, 'CNY')}</span>
            <span>·</span>
            <Link href={`/accounts/${opportunity.accountId}`} className="hover:text-accent transition-colors" onClick={e => e.stopPropagation()}>
              {account?.name ?? '未知客户'}
            </Link>
            {opportunity.meddicc?.overallScore && <>
                <span>·</span>
                <span className={`text-xs font-medium ${opportunity.meddicc.overallScore >= 60 ? 'text-positive' : opportunity.meddicc.overallScore >= 40 ? 'text-warning' : 'text-danger'}`}>
                  MEDDICC: {opportunity.meddicc.overallScore}
                </span>
              </>}
          </div>
        </div>
        <button onClick={onToggle} className="flex-shrink-0 ml-3 p-2 rounded-lg hover:bg-background transition-colors">
          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted" /> : <ChevronDown className="h-5 w-5 text-muted" />}
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && <div className="border-t border-border px-5 py-5">
          <div className="mb-4 flex items-center gap-2">
            <Link href={`/pipeline/${opportunity.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors">
              <Target className="h-3.5 w-3.5" />{tx("前往商机详情")}</Link>
          </div>
          {viewMode === 'positioning-card' ? <CompetitivePositioningCard opportunity={opportunity} /> : <CompetitorMatrix opportunity={opportunity} />}
        </div>}
    </div>;
}