'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Zap,
  TrendingDown,
  ArrowRight,
  Brain,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Shield,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { AIActionButton } from '@/components/ai-action-button';
import { RecommendationDisplayWithEvidence } from '@/components/recommendation/recommendation-display-with-evidence';
import type { StrategicPlay } from '@/lib/babel-engine/types';

// ─── Types ──────────────────────────────────────────────────────────

interface RiskAlert {
  entityId: string;
  entityType: string;
  level: 'healthy' | 'at_risk' | 'critical';
  score: number;
  reasons: string[];
  recommendations: string[];
  accountId?: string;
  lastDecodeSignal?: string;
  dealName?: string;
  accountName?: string;
  updatedAt: string;
}

interface ActionItem {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dueInDays: number;
  triggerEvent: string;
  relatedEntityId?: string;
  accountId?: string;
  accountName?: string;
}

interface ImpactAlert {
  accountId: string;
  accountName?: string;
  impactedDeals: {
    dealId: string;
    dealName: string;
    previousRisk: string;
    newRisk: string;
    reason: string;
  }[];
  summary: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  return `${day}天前`;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-danger/10 text-danger border-danger/20',
  medium: 'bg-warning/10 text-warning border-warning/20',
  low: 'bg-info/10 text-info border-info/20',
};

const RISK_STYLES: Record<string, { bg: string; icon: string; label: string }> = {
  critical: { bg: 'bg-danger/5 border-danger/20', icon: 'text-danger', label: '严重风险' },
  at_risk: { bg: 'bg-warning/5 border-warning/20', icon: 'text-warning', label: '需关注' },
  healthy: { bg: 'bg-positive/5 border-positive/20', icon: 'text-positive', label: '健康' },
};

// ─── Daily Briefing Card ────────────────────────────────────────────

function DailyBriefingCard() {
  const [briefing, setBriefing] = useState<{
    summary: {
      totalActiveDeals: number;
      totalPipelineValue: number;
      criticalDeals: number;
      atRiskDeals: number;
      dueTasksToday: number;
      overdueTasks: number;
    };
    urgentActions: { title: string; accountName: string; dueInDays: number }[];
  } | null>(null);

  useEffect(() => {
    fetch('/api/daily-briefing')
      .then(r => r.json())
      .then(d => setBriefing(d.briefing))
      .catch(() => {});
  }, []);

  if (!briefing) return null;

  const { summary } = briefing;
  if (summary.totalActiveDeals === 0) return null;

  return (
    <div className="rounded-lg border border-accent/15 bg-accent/[0.02] p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-accent">
        <Clock className="h-3.5 w-3.5" />
        今日概览
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{summary.totalActiveDeals}</p>
          <p className="text-[12px] text-muted">活跃 Deal</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${summary.criticalDeals > 0 ? 'text-danger' : 'text-foreground'}`}>{summary.criticalDeals}</p>
          <p className="text-[12px] text-muted">严重风险</p>
        </div>
        <div className="text-center">
          <p className={`text-lg font-bold ${summary.overdueTasks > 0 ? 'text-warning' : 'text-foreground'}`}>{summary.overdueTasks}</p>
          <p className="text-[12px] text-muted">逾期任务</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">{summary.dueTasksToday}</p>
          <p className="text-[12px] text-muted">今日到期</p>
        </div>
      </div>
      {briefing.urgentActions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <p className="text-[12px] font-medium text-secondary mb-1">⚡ 紧急行动</p>
          {briefing.urgentActions.slice(0, 2).map((a, i) => (
            <p key={i} className="text-[13px] text-muted truncate">• {a.accountName}: {a.title}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Executive View ─────────────────────────────────────────────────

function ExecutiveView({
  riskAlerts,
  actions,
  impacts,
  accounts,
  opportunities,
  plays,
}: {
  riskAlerts: RiskAlert[];
  actions: ActionItem[];
  impacts: ImpactAlert[];
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  plays: StrategicPlay[];
}) {
  // 按 account 聚合数据
  const accountSummaries = accounts.map(acct => {
    const acctOpps = opportunities.filter(o => o.accountId === acct.id);
    const acctRisks = riskAlerts.filter(a => {
      const opp = opportunities.find(o => o.id === a.entityId);
      return opp?.accountId === acct.id;
    });
    const acctActions = actions.filter(a => a.accountId === acct.id);
    const acctImpacts = impacts.filter(i => i.accountId === acct.id);

    // Play data for this account
    const acctPlays = plays.filter(p => p.accountId === acct.id && (p.status === 'active' || p.status === 'in_progress'));
    const stalledPlays = acctPlays.filter(p => p.daysSinceProgress >= 14);
    const invalidatedAssumptions = acctPlays.flatMap(p =>
      p.assumptions.filter(a => a.status === 'invalidated')
    );

    const criticalCount = acctRisks.filter(r => r.level === 'critical').length;
    const atRiskCount = acctRisks.filter(r => r.level === 'at_risk').length;

    // 计算综合健康度（含谋局信号）
    let health: 'good' | 'watch' | 'danger' = 'good';
    if (criticalCount > 0) health = 'danger';
    else if (atRiskCount > 0 || acctImpacts.length > 0) health = 'watch';
    // Play signals can escalate health
    if (health === 'good' && (stalledPlays.length > 0 || invalidatedAssumptions.length > 0)) {
      health = 'watch';
    }

    return {
      ...acct,
      oppCount: acctOpps.length,
      criticalCount,
      atRiskCount,
      actionCount: acctActions.length,
      impactCount: acctImpacts.length,
      health,
      topRisk: acctRisks[0]?.reasons?.[0],
      topImpact: acctImpacts[0]?.summary,
      playCount: acctPlays.length,
      stalledPlayCount: stalledPlays.length,
      invalidatedAssumptionCount: invalidatedAssumptions.length,
      stalledPlays,
      invalidatedAssumptions,
    };
  }).filter(a => a.oppCount > 0).sort((a, b) => {
    const order = { danger: 0, watch: 1, good: 2 };
    return order[a.health] - order[b.health];
  });

  const totalOpps = opportunities.length;
  const criticalTotal = riskAlerts.filter(r => r.level === 'critical').length;
  const atRiskTotal = riskAlerts.filter(r => r.level === 'at_risk').length;
  const healthyTotal = totalOpps - criticalTotal - atRiskTotal;
  const activePlaysTotal = plays.filter(p => p.status === 'active' || p.status === 'in_progress').length;
  const noPlayCoverage = accountSummaries.filter(a => a.playCount === 0 && a.oppCount > 0).length;

  const HEALTH_STYLES = {
    danger: { bg: 'bg-danger/5 border-danger/20', dot: 'bg-danger', label: '需要干预' },
    watch: { bg: 'bg-warning/5 border-warning/20', dot: 'bg-warning', label: '关注中' },
    good: { bg: 'bg-positive/5 border-positive/20', dot: 'bg-positive', label: '正常推进' },
  };

  const needsAttention = accountSummaries.filter(a => a.health !== 'good' || a.topRisk);
  const healthy = accountSummaries.filter(a => a.health === 'good' && !a.topRisk);
  const hasAttentionItems = needsAttention.length > 0 || impacts.length > 0 || actions.some(a => a.priority === 'high');

  return (
    <div className="space-y-4">
      {/* Section 1: 需要关注 — what needs action NOW */}
      {hasAttentionItems ? (
        <div className="rounded-lg border border-l-4 border-warning/20 border-l-warning bg-card p-3">
          <p className="text-xs font-semibold text-warning mb-2">⚡ 需要关注</p>
          <div className="max-h-[480px] overflow-y-auto space-y-2">
            {/* Attention-required account cards */}
            {needsAttention.length > 0 && (
              <div className="space-y-2">
                {needsAttention.map(acct => {
                  const style = HEALTH_STYLES[acct.health];
                  return (
                    <a
                      key={acct.id}
                      href={`/accounts/${acct.id}`}
                      className={`block rounded-lg border p-2.5 transition-shadow hover:shadow-sm ${style.bg}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                          <span className="text-sm font-semibold text-foreground">{acct.name}</span>
                          <span className="text-[12px] text-secondary">{acct.oppCount} 个 Deal</span>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                          acct.health === 'danger' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {style.label}
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        {acct.topRisk && (
                          <p className="text-xs text-danger flex items-start gap-1.5">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0" />
                            风险：{acct.topRisk}
                          </p>
                        )}
                        {acct.topImpact && (
                          <p className="text-xs text-warning flex items-start gap-1.5">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-warning flex-shrink-0" />
                            情报影响：{acct.topImpact}
                          </p>
                        )}
                        {acct.stalledPlays.map(p => (
                          <p key={p.id} className="text-xs text-warning flex items-start gap-1.5">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-warning flex-shrink-0" />
                            谋局停滞: {p.goalDescription}（{p.daysSinceProgress} 天无进展）
                          </p>
                        ))}
                        {acct.invalidatedAssumptions.map(a => (
                          <p key={a.id} className="text-xs text-danger flex items-start gap-1.5">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-danger flex-shrink-0" />
                            假设否定: {a.text}
                          </p>
                        ))}
                        {acct.playCount === 0 && acct.oppCount > 0 && (
                          <p className="text-xs text-secondary flex items-start gap-1.5">
                            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-secondary/50 flex-shrink-0" />
                            无谋局覆盖: {acct.oppCount} 个商机没有活跃谋局
                          </p>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
            {/* Action items — urgent first, then others */}
            {actions
              .sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0))
              .map((action, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                <span className={`rounded-full px-1.5 py-0.5 text-[12px] font-bold flex-shrink-0 border ${
                  action.priority === 'high'
                    ? 'bg-danger/10 text-danger border-danger/20'
                    : 'bg-warning/10 text-warning border-warning/20'
                }`}>{action.priority === 'high' ? '紧急' : '建议'}</span>
                <span>{action.accountName && `${action.accountName}: `}{action.title}</span>
              </div>
            ))}
            {/* Impact alerts inline */}
            {impacts.map(impact => (
              <div key={impact.accountId} className="text-xs text-foreground space-y-0.5">
                <div>
                  <span className="font-semibold">• {impact.accountName}</span>
                  {impact.summary ? <span>：{impact.summary}</span> : null}
                </div>
                {impact.impactedDeals.map((deal, di) => (
                  <div key={di} className="ml-3 text-secondary">
                    <span>{deal.dealName}：{deal.reason}</span>
                    {deal.previousRisk !== deal.newRisk && (
                      <span className="ml-1 text-danger">({deal.previousRisk} → {deal.newRisk})</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-l-4 border-positive/20 border-l-positive bg-card px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs text-positive font-medium">✅ 所有项目正常推进中</span>
        </div>
      )}

      {/* Section 2: Portfolio 快照 — compact single-line summary */}
      <div className="rounded-lg border border-border/50 bg-card px-4 py-2 flex items-center gap-1.5 text-xs text-secondary flex-wrap">
        <span>📊</span>
        <span className="font-medium text-foreground">{totalOpps}</span><span>活跃</span>
        <span className="text-border">·</span>
        <span className="text-positive font-medium">{healthyTotal}</span><span>正常</span>
        <span className="text-border">·</span>
        <span className="text-warning font-medium">{atRiskTotal}</span><span>关注</span>
        <span className="text-border">·</span>
        <span className={`font-medium ${criticalTotal > 0 ? 'text-danger' : 'text-positive'}`}>{criticalTotal}</span><span>干预</span>
        <span className="text-border mx-0.5">│</span>
        <span className="font-medium text-foreground">{activePlaysTotal}</span><span>谋局活跃</span>
        <span className="text-border">·</span>
        <span className="font-medium text-foreground">{noPlayCoverage}</span><span>无谋局覆盖</span>
      </div>

      {/* Section 3: 正常推进汇总 */}
      {healthy.length > 0 && (
        <div className="rounded-lg border border-l-4 border-positive/20 border-l-positive bg-card px-4 py-2.5 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-positive flex-shrink-0" />
          <span className="text-xs text-positive font-medium">
            其他 {healthy.length} 个客户正常推进中
            {(() => {
              const noPlayCount = healthy.filter(a => a.playCount === 0).length;
              return noPlayCount > 0 ? `（${noPlayCount} 个无谋局覆盖）` : '';
            })()}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function AIInsightsPanel({
  accounts,
  opportunities,
  roleLevel,
  embedded = false,
}: {
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  roleLevel?: 'ae' | 'director' | 'executive';
  embedded?: boolean;
}) {
  const roleConfig = {
    executive: {
      title: '🧠 战略洞察',
      subtitle: '全局 Pipeline 风险与战略建议',
      emptyTitle: '🧠 战略洞察引擎已就绪',
      emptyDesc: '系统将自动分析全局 Pipeline 风险、跨团队趋势和战略机会。',
    },
    director: {
      title: '🧠 团队洞察',
      subtitle: '团队 Deal 风险与 Coaching 建议',
      emptyTitle: '🧠 团队洞察引擎已就绪',
      emptyDesc: '系统将自动分析团队 Deal 风险、成员表现趋势和 Coaching 机会。',
    },
    ae: {
      title: '🧠 AI 洞察',
      subtitle: '你的 Deal 风险与下一步行动',
      emptyTitle: '🧠 AI 洞察引擎已就绪',
      emptyDesc: 'AI 将在你解读邮件、添加情报、推进 Deal 阶段时自动生成洞察。',
    },
  };
  const config = roleConfig[roleLevel ?? 'ae'];
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [impacts, setImpacts] = useState<ImpactAlert[]>([]);
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(embedded);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchInsights = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // Fetch health insights for deals + plays
      const [healthRes, actionRes, impactRes, playsRes] = await Promise.all([
        fetch('/api/ai-insights?insightType=health&entityType=opportunity'),
        fetch('/api/ai-insights?insightType=action'),
        fetch('/api/ai-insights?insightType=impact'),
        fetch('/api/strategic-play'),
      ]);

      const healthData = await healthRes.json();
      const actionData = await actionRes.json();
      const impactData = await impactRes.json();
      const playsData = await playsRes.json();
      setPlays(playsData.plays ?? []);

      // Process health alerts (only at_risk and critical)
      const alerts: RiskAlert[] = (healthData.insights ?? [])
        .filter((i: Record<string, unknown>) => {
          const data = i.data as Record<string, unknown>;
          return data?.level === 'at_risk' || data?.level === 'critical';
        })
        .map((i: Record<string, unknown>) => {
          const data = i.data as Record<string, unknown>;
          const opp = opportunities.find(o => o.id === i.entityId);
          const acct = opp ? accounts.find(a => a.id === opp.accountId) : null;
          return {
            entityId: i.entityId as string,
            entityType: i.entityType as string,
            level: (data.level as string) ?? 'at_risk',
            score: (data.score as number) ?? 0,
            reasons: (data.reasons as string[]) ?? [],
            recommendations: (data.recommendations as string[]) ?? [],
            accountId: opp?.accountId,
            lastDecodeSignal: data.lastDecodeSignal as string | undefined,
            dealName: opp?.name,
            accountName: acct?.name,
            updatedAt: i.updatedAt as string,
          };
        })
        .sort((a: RiskAlert, b: RiskAlert) => {
          if (a.level === 'critical' && b.level !== 'critical') return -1;
          if (b.level === 'critical' && a.level !== 'critical') return 1;
          return a.score - b.score;
        });

      setRiskAlerts(alerts);

      // Process action items
      const allActions: ActionItem[] = [];
      for (const insight of (actionData.insights ?? [])) {
        const data = insight.data as Record<string, unknown>;
        const acctId = insight.entityId as string;
        const acct = accounts.find(a => a.id === acctId);
        for (const action of ((data?.actions as ActionItem[]) ?? [])) {
          allActions.push({
            ...action,
            accountId: acctId,
            accountName: acct?.name,
          });
        }
      }
      allActions.sort((a, b) => {
        const prio = { high: 0, medium: 1, low: 2 };
        return (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1);
      });
      setActions(allActions.slice(0, 5));

      // Process impact alerts
      const impactAlerts: ImpactAlert[] = (impactData.insights ?? [])
        .map((i: Record<string, unknown>) => {
          const data = i.data as Record<string, unknown>;
          const acct = accounts.find(a => a.id === i.entityId);
          return {
            accountId: i.entityId as string,
            accountName: acct?.name,
            impactedDeals: (data?.impactedDeals as ImpactAlert['impactedDeals']) ?? [],
            summary: (data?.summary as string) ?? '',
          };
        })
        .filter((i: ImpactAlert) => i.impactedDeals.length > 0);

      setImpacts(impactAlerts);
      setLastUpdated(new Date().toISOString());

    } catch (err) {
      console.error('[AIInsightsPanel] Fetch failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    // 每 5 分钟刷新一次
    const interval = setInterval(() => fetchInsights(), 6 * 60 * 60 * 1000); // 6小时一次
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emailDecodes = useStore((s) => s.emailDecodes);
  const intelItems = useStore((s) => s.intelItems);
  const hasInsights = riskAlerts.length > 0 || actions.length > 0 || impacts.length > 0;
  const hasUserData = emailDecodes.length > 0 || intelItems.length > 0 || accounts.length > 0;

  if (loading) {
    return (
      <div className={embedded ? "py-4" : "card-elevated rounded-xl border border-accent/15 bg-gradient-to-r from-accent/[0.03] to-transparent p-6"}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Loader2 className="h-5 w-5 text-accent animate-spin" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">🧠 AI 正在分析...</h2>
            <p className="text-xs text-muted">加载 AI 洞察数据</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasInsights) {
    return (
      <div className={embedded ? "" : "card-elevated rounded-xl border border-accent/15 bg-gradient-to-r from-accent/[0.03] to-transparent p-6"}>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <Brain className="h-6 w-6 text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">{config.emptyTitle}</h2>
            {hasUserData ? (
              <p className="mt-1 text-xs text-muted leading-relaxed">
                已检测到 {emailDecodes.length} 封邮件解读、{intelItems.length} 条情报。AI 洞察将在下次后台分析时自动生成，也可以手动触发：
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted leading-relaxed">
                {config.emptyDesc} 开始使用以下功能来激活 AI：
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {hasUserData ? (
                <button
                  onClick={() => fetchInsights(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? '分析中...' : '立即分析'}
                </button>
              ) : (
                <>
                  <Link href="/decode" className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors">
                    <Zap className="h-3 w-3" />
                    解读第一封邮件
                  </Link>
                  <Link href="/accounts" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground transition-colors">
                    <Shield className="h-3 w-3" />
                    添加客户情报
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "card-elevated rounded-xl border border-accent/15 bg-gradient-to-r from-accent/[0.03] to-transparent"}>
      {/* Header — hidden when embedded in AiCommandCenter */}
      {!embedded && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
              <Brain className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{config.title}</h2>
              <p className="text-xs text-muted">
                {config.subtitle} · {riskAlerts.length > 0 && `${riskAlerts.length} 个风险预警`}
                {riskAlerts.length > 0 && actions.length > 0 && ' · '}
                {actions.length > 0 && `${actions.length} 个行动建议`}
                {lastUpdated && ` · 更新于 ${timeAgo(lastUpdated)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchInsights(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg p-1.5 text-secondary hover:text-foreground hover:bg-background transition-colors"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Summary line when embedded */}
      {embedded && (
        <div className="flex items-center justify-between pb-3">
          <p className="text-xs text-muted">
            {riskAlerts.length > 0 && `${riskAlerts.length} 个风险预警`}
            {riskAlerts.length > 0 && actions.length > 0 && ' · '}
            {actions.length > 0 && `${actions.length} 个行动建议`}
            {lastUpdated && ` · 更新于 ${timeAgo(lastUpdated)}`}
          </p>
          <button
            onClick={() => fetchInsights(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      )}

      {expanded && (
        <div className={embedded ? "space-y-4" : "p-5 space-y-4"}>
          {roleLevel === 'executive' ? (
            <ExecutiveView
              riskAlerts={riskAlerts}
              actions={actions}
              impacts={impacts}
              accounts={accounts}
              opportunities={opportunities}
              plays={plays}
            />
          ) : (
            <>
              {/* Risk Alerts */}
              {riskAlerts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-danger uppercase tracking-wide">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    风险预警
                  </h3>
                  <div className="space-y-2">
                    {riskAlerts.slice(0, 3).map((alert) => {
                      const style = RISK_STYLES[alert.level] ?? RISK_STYLES.at_risk;
                      const visibleRecommendations = alert.recommendations.slice(0, 2);
                      const accountId = alert.accountId;
                      return (
                        <div
                          key={alert.entityId}
                          className={`rounded-lg border p-3 transition-shadow hover:shadow-sm ${style.bg}`}
                        >
                          <Link href={`/pipeline/${alert.entityId}`} className="block">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Shield className={`h-4 w-4 flex-shrink-0 ${style.icon}`} />
                                  <span className="text-sm font-medium text-foreground truncate">
                                    {alert.dealName ?? alert.entityId}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold uppercase ${
                                    alert.level === 'critical' ? 'bg-red-800 text-white' : 'bg-amber-500 text-white'
                                  }`}>
                                    {style.label}
                                  </span>
                                </div>
                                {alert.accountName && (
                                  <p className="mt-0.5 text-xs text-muted ml-6">{alert.accountName}</p>
                                )}
                                <div className="mt-1.5 ml-6 space-y-0.5">
                                  {alert.reasons.slice(0, 2).map((reason, i) => (
                                    <p key={i} className="text-xs text-secondary flex items-start gap-1.5">
                                      <span className="mt-1.5 h-1 w-1 rounded-full bg-current flex-shrink-0" />
                                      {reason}
                                    </p>
                                  ))}
                                </div>
                                {alert.lastDecodeSignal && (
                                  <p className="mt-1 ml-6 text-[13px] text-muted">
                                    📧 最新信号: {alert.lastDecodeSignal}
                                  </p>
                                )}
                              </div>
                              <ArrowRight className="h-4 w-4 text-secondary flex-shrink-0 mt-1" />
                            </div>
                          </Link>

                          {visibleRecommendations.length > 0 && accountId && (
                            <div className="mt-3 ml-6 space-y-3 border-t border-border/60 pt-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-danger/80">
                                风险应对建议
                              </p>
                              {visibleRecommendations.map((recommendation, index) => (
                                <RecommendationDisplayWithEvidence
                                  key={`${alert.entityId}:${index}`}
                                  sectionTitle={`风险应对建议 ${index + 1}`}
                                  recommendationTitle={`${alert.dealName ?? 'Deal'} 风险应对建议 ${index + 1}`}
                                  recommendationSummary={recommendation}
                                  accountId={accountId}
                                  recommendationId={`risk-alert:${alert.entityId}:${index}`}
                                  confidence={alert.level === 'critical' ? 82 : 68}
                                  panelTitle="证据面板 · 风险建议"
                                  recommendationBlockClassName="rounded-lg border border-danger/15 bg-danger/[0.03] p-3"
                                  sectionTitleClassName="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger/80"
                                  summaryClassName="text-xs text-secondary"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Impact Alerts */}
              {impacts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-warning uppercase tracking-wide">
                    <TrendingDown className="h-3.5 w-3.5" />
                    情报影响
                  </h3>
                  {impacts.slice(0, 2).map((impact) => (
                    <div key={impact.accountId} className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                      <p className="text-sm font-medium text-foreground">{impact.accountName ?? impact.accountId}</p>
                      <p className="mt-1 text-xs text-secondary">{impact.summary}</p>
                      <div className="mt-2 space-y-1">
                        {impact.impactedDeals.map((deal) => (
                          <Link
                            key={deal.dealId}
                            href={`/pipeline/${deal.dealId}`}
                            className="flex items-center justify-between text-xs text-muted hover:text-foreground transition-colors"
                          >
                            <span>{deal.dealName}: {deal.reason}</span>
                            <span className={`font-medium ${deal.newRisk === 'high' || deal.newRisk === 'critical' ? 'text-danger' : 'text-warning'}`}>
                              {deal.previousRisk} → {deal.newRisk}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Items */}
              {actions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wide">
                    <Zap className="h-3.5 w-3.5" />
                    建议行动
                  </h3>
                  <div className="space-y-1.5">
                    {actions.map((action, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-stripe"
                      >
                        <span className={`rounded-full border px-2 py-0.5 text-[12px] font-bold ${PRIORITY_STYLES[action.priority]}`}>
                          {action.priority === 'high' ? '紧急' : action.priority === 'medium' ? '重要' : '建议'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{action.title}</p>
                          <p className="mt-0.5 text-xs text-muted">{action.description}</p>
                          <div className="mt-1.5 flex items-center gap-3 text-[13px] text-secondary">
                            {action.accountName && <span>📋 {action.accountName}</span>}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {action.dueInDays <= 0 ? '立即' : `${action.dueInDays}天内`}
                            </span>
                          </div>
                          <AIActionButton
                            suggestion={action.title + (action.description ? '：' + action.description : '')}
                            accountId={action.accountId}
                            source="strategy"
                          />
                          {action.accountId && (
                            <RecommendationDisplayWithEvidence
                              sectionTitle="建议行动依据"
                              recommendationTitle={action.title}
                              recommendationSummary={action.description || action.title}
                              accountId={action.accountId}
                              recommendationId={`action-item:${action.accountId}:${i}`}
                              confidence={action.priority === 'high' ? 80 : action.priority === 'medium' ? 60 : 40}
                              panelTitle="证据面板 · 建议行动"
                              showRecommendationBlock={false}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Manager Coaching Tip */}
                  {roleLevel === 'director' && actions.length > 0 && (
                    <div className="rounded-lg border border-accent/15 bg-accent/[0.02] p-3 mt-2">
                      <p className="text-xs font-medium text-accent">💡 辅导提示：重点关注上述风险 Deal，建议本周安排一对一复盘</p>
                    </div>
                  )}
                </div>
              )}

              {/* 今日推进计划入口 */}
              <DailyBriefingCard />
            </>
          )}
        </div>
      )}
    </div>
  );
}
