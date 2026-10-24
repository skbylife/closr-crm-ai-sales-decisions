"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Target,
  Shield,
  Lightbulb,
  Loader2,
  RefreshCw,
  ListChecks,
  Swords,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { friendlyError } from "@/lib/error-helper";
import type {
  Account,
  Contact,
  IntelItem,
  SavedDecode,
  EnhancedAccountStrategy,
  StrategicPlay,
} from "@/lib/babel-engine/types";
import { CopyButton } from "@/components/accounts/shared";
import { RecommendationDisplayWithEvidence } from "@/components/recommendation/recommendation-display-with-evidence";

type StrategyWithMeta = EnhancedAccountStrategy & {
  generatedAt?: string;
  staleAfter?: string;
  stale?: boolean;
};

export function StrategyTab({
  account,
  contacts,
  intelItems: accountIntel,
  decodes: accountDecodes,
  plays,
  autoGenerate = false,
  onCreatePlay,
}: {
  account: Account;
  contacts: Contact[];
  intelItems: IntelItem[];
  decodes: SavedDecode[];
  plays?: StrategicPlay[];
  autoGenerate?: boolean;
  onCreatePlay?: (prefill: { goalDescription: string }) => void;
}) {
  const { updateAccount, addTask } = useStore();
  const [strategy, setStrategy] = useState<StrategyWithMeta | null>(
    account.strategy as StrategyWithMeta ?? null
  );
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);

  const generateStrategy = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setProgressStep(0);
    // 模拟步骤进度
    const st1 = setTimeout(() => setProgressStep(1), 1500);
    const st2 = setTimeout(() => setProgressStep(2), 3500);

    try {
      const res = await fetch("/api/account-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          forceRefresh,
          account: {
            name: account.name,
            industry: account.industry,
            dealStage: account.dealStage,
            dealValue: account.dealValue,
            dealHealth: account.dealHealth,
          },
          contacts: contacts.map((c) => ({
            name: c.name,
            title: c.title,
            role: c.role,
            decisionStyle: c.decisionStyle,
            riskAppetite: c.riskAppetite,
            communicationNotes: c.communicationNotes,
            landmines: c.landmines,
            contactProfile: c.contactProfile,
          })),
          intelItems: accountIntel.map((i) => ({
            content: i.content,
            source: i.source,
            credibility: i.credibility,
            urgency: i.urgency,
            analysis: i.analysis,
          })),
          decodes: accountDecodes.map((d) => ({
            emailText: d.emailText.slice(0, 500),
            threadAnalysis: d?.decode?.threadAnalysis,
          })),
          newsAnalysis: account.marketIntel?.newsAnalysis,
          financialAnalysis: account.marketIntel?.financialAnalysis,
          plays: plays?.map(p => ({
            goal: p.goalDescription,
            status: p.status,
            momentum: p.momentum,
            confidence: p.confidence,
            stepsTotal: p.steps.length,
            stepsCompleted: p.steps.filter(s => s.status === 'completed').length,
            assumptionsTotal: p.assumptions?.length ?? 0,
            assumptionsVerified: p.assumptions?.filter(a => a.status === 'verified').length ?? 0,
            assumptionsInvalidated: p.assumptions?.filter(a => a.status === 'invalidated').length ?? 0,
          })),
          tasks: (() => {
            const allTasks = useStore.getState().tasks;
            const accountTasks = allTasks.filter((t) => t.accountId === account.id);
            const now = new Date();
            return accountTasks.map((t) => ({
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              isOverdue: !!(t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'),
              assignedTo: t.assignedTo,
            }));
          })(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }

      const result: StrategyWithMeta = await res.json();
      setProgressStep(3); // 完成
      setStrategy(result);
      updateAccount(account.id, { strategy: result });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      clearTimeout(st1);
      clearTimeout(st2);
      setLoading(false);
    }
  }, [account.dealHealth, account.dealStage, account.dealValue, account.id, account.industry, account.marketIntel?.financialAnalysis, account.marketIntel?.newsAnalysis, account.name, accountDecodes, accountIntel, contacts, plays, updateAccount]);

  // 加载已保存的策略；若 autoGenerate=true 则仅在无缓存或缓存过期时自动触发
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ai-insights?entityType=account&entityId=${account.id}&insightType=strategy`);
        const data = await res.json() as { insights?: { data?: StrategyWithMeta }[] };
        const saved = data.insights?.[0]?.data;

        if (cancelled) return;

        if (saved) {
          setStrategy(saved);
          updateAccount(account.id, { strategy: saved });
          if (autoGenerate && saved.stale) {
            void generateStrategy(false);
          }
          return;
        }

        if (autoGenerate) {
          void generateStrategy(false);
        }
      } catch {
        if (!cancelled && autoGenerate) {
          void generateStrategy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account.id, autoGenerate, generateStrategy, updateAccount]);

  function buildStrategyText(): string {
    if (!strategy) return "";
    const lines: string[] = [];
    lines.push(`综合策略 — ${account.name}`);
    lines.push(`健康度: ${strategy.healthScore}/100`);
    lines.push(`原因: ${strategy.healthScoreReasoning}`);
    lines.push("");
    lines.push("策略叙述:");
    lines.push(strategy.strategyNarrative);
    lines.push("");
    lines.push("赢单路径:");
    (strategy.winPath ?? []).forEach((s, i) => lines.push(`  ${i + 1}. ${s.step} — 找谁: ${s.who} — 做什么: ${s.what}`));
    lines.push("");
    lines.push("SWOT:");
    lines.push(`  优势: ${(strategy.swot?.strengths ?? []).join("; ")}`);
    lines.push(`  劣势: ${(strategy.swot?.weaknesses ?? []).join("; ")}`);
    lines.push(`  机会: ${(strategy.swot?.opportunities ?? []).join("; ")}`);
    lines.push(`  威胁: ${(strategy.swot?.threats ?? []).join("; ")}`);
    lines.push("");
    lines.push("竞争策略:");
    (strategy.competitorStrategy ?? []).forEach((s) => lines.push(`  - ${s}`));
    lines.push("");
    lines.push("时间线:");
    (strategy.timeline ?? []).forEach((t) => lines.push(`  ${t.week}: ${t.action}`));
    lines.push("");
    lines.push("关键风险:");
    (strategy.keyRisks ?? []).forEach((r) => lines.push(`  风险: ${r.risk} → 缓解: ${r.mitigation}`));
    if (strategy.playRecommendations?.length) {
      lines.push("");
      lines.push("谋局推荐:");
      strategy.playRecommendations.forEach((s: string) => lines.push(`  - ${s}`));
    }
    return lines.join("\n");
  }

  const convertWinPathToTask = (step: { step: string; who: string; what: string }, index: number) => {
    addTask({
      accountId: account.id,
      title: `[赢单路径] Step ${index + 1}: ${step.step}`,
      description: `找谁: ${step.who}\n做什么: ${step.what}`,
      status: 'todo',
      priority: index === 0 ? 'high' : 'medium',
      labels: ['AI策略', '赢单路径'],
      source: 'manual' as const,
      aiGenerated: true,
    });
    setTaskMessage('✅ 已转为任务');
    setTimeout(() => setTaskMessage(null), 2000);
  };

  const convertTimelineToTask = (t: { week: string; action: string }) => {
    addTask({
      accountId: account.id,
      title: `[${t.week}] ${t.action}`,
      description: `AI 策略时间表行动项`,
      status: 'todo',
      priority: 'medium',
      labels: ['AI策略', '时间表'],
      source: 'manual' as const,
      aiGenerated: true,
    });
    setTaskMessage('✅ 已转为任务');
    setTimeout(() => setTaskMessage(null), 2000);
  };

  const convertAllStrategyToTasks = () => {
    if (!strategy) return;
    let count = 0;
    for (let i = 0; i < strategy.winPath.length; i++) {
      convertWinPathToTask(strategy.winPath[i], i);
      count++;
    }
    for (const t of strategy.timeline) {
      convertTimelineToTask(t);
      count++;
    }
    setTaskMessage(`✅ 已将 ${count} 个策略行动项转为任务`);
    setTimeout(() => setTaskMessage(null), 3000);
  };

  if (!strategy && !loading) {
    const hasData = contacts.length > 0 || accountIntel.length > 0 || accountDecodes.length > 0;
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
          <Lightbulb className="h-5 w-5 text-muted" />
        </div>
        <p className="text-sm font-medium text-foreground">AI 综合策略</p>
        <p className="mt-1 max-w-[300px] text-xs text-muted">
          {hasData
            ? "基于联系人画像、情报和邮件历史，AI 将生成综合赢单策略和行动建议。"
            : "先添加联系人、录入情报或解读邮件，AI 才能生成有价值的策略建议。"}
        </p>
        <button
          onClick={() => generateStrategy(true)}
          disabled={!hasData}
          className="mt-4 flex items-center gap-2 rounded-lg bg-[#C41E3A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A01830] disabled:opacity-40 disabled:pointer-events-none shadow-sm"
        >
          🎯 生成赢单策略
        </button>
        {error && (
          <p className="mt-3 text-xs text-danger">{error}</p>
        )}
      </div>
    );
  }

  if (loading) {
    const STRATEGY_STEPS = [
      "收集客户与联系人数据...",
      "分析情报与邮件历史...",
      "生成综合赢单策略...",
      "完成",
    ];
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-10 px-6">
        <div className="w-full max-w-xs space-y-3">
          {STRATEGY_STEPS.map((step, i) => {
            const isActive = i === progressStep;
            const isDone = i < progressStep;
            return (
              <div key={i} className="flex items-center gap-3">
                {isDone ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-positive text-white text-xs">✓</div>
                ) : isActive ? (
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-muted">{i + 1}</div>
                )}
                <span className={`text-sm ${isActive ? "text-accent font-medium" : isDone ? "text-positive" : "text-muted"}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!strategy) return null;

  const SWOT_CONFIG = [
    { key: "strengths" as const, label: "优势", bg: "bg-positive/[0.06] border-positive/15", textColor: "text-positive" },
    { key: "weaknesses" as const, label: "劣势", bg: "bg-danger/[0.06] border-danger/15", textColor: "text-danger" },
    { key: "opportunities" as const, label: "机会", bg: "bg-blue-500/[0.06] border-blue-500/15", textColor: "text-blue-600" },
    { key: "threats" as const, label: "威胁", bg: "bg-warning/[0.06] border-warning/15", textColor: "text-warning" },
  ];

  return (
    <div className="space-y-4">
      {/* Win Probability - circular ring */}
      <div className="rounded-xl border border-border bg-sidebar p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">赢单概率</h3>
          <button
            onClick={() => generateStrategy(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新分析
          </button>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative h-28 w-28 flex-shrink-0">
            <svg className="h-28 w-28 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" strokeLinecap="round"
                className={strategy.healthScore >= 60 ? "text-positive" : strategy.healthScore >= 40 ? "text-warning" : "text-danger"}
                stroke="currentColor"
                strokeDasharray={`${strategy.healthScore * 3.267} 326.7`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-mono text-2xl font-bold ${
                strategy.healthScore >= 60 ? "text-positive" : strategy.healthScore >= 40 ? "text-warning" : "text-danger"
              }`}>
                {strategy.healthScore}
              </span>
              <span className="text-xs text-muted">/ 100</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            {strategy.healthScoreReasoning && (
              <p className="text-xs leading-relaxed text-muted">{strategy.healthScoreReasoning}</p>
            )}
            {strategy.generatedAt && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>生成于 {new Date(strategy.generatedAt).toLocaleString('zh-CN')}</span>
                {strategy.stale && (
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-warning">已过期，进入页面会按日更自动刷新</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Strategy Narrative */}
      <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
          <Target className="h-3.5 w-3.5" />
          综合策略
        </div>
        <RecommendationDisplayWithEvidence
          sectionTitle="策略叙述"
          recommendationTitle="综合策略叙述"
          recommendationSummary={strategy.strategyNarrative}
          accountId={account.id}
          recommendationId={`strategy-narrative:${account.id}`}
          confidence={strategy.healthScore ?? 50}
          panelTitle="证据面板 · 综合策略"
          variant="accent"
          recommendationBlockClassName="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2"
        />
      </div>

      {/* Task feedback message */}
      {taskMessage && (
        <div className="rounded-lg bg-positive/10 border border-positive/20 px-4 py-2 text-sm font-medium text-positive animate-in fade-in">
          {taskMessage}
        </div>
      )}

      {/* Win Path - step cards */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-positive">
            赢单路径
          </h3>
          <button
            onClick={convertAllStrategyToTasks}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
          >
            <ListChecks className="h-3.5 w-3.5" />
            全部转为任务
          </button>
        </div>
        <div className="space-y-2">
          {(strategy.winPath ?? []).map((step, i) => (
            <div key={i} className="rounded-xl border border-border bg-card card-elevated p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{step.step}</p>
                    <button
                      onClick={() => convertWinPathToTask(step, i)}
                      className="rounded-md p-1 text-secondary hover:text-accent hover:bg-accent/10 flex-shrink-0"
                      title="转为任务"
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border bg-background p-2">
                      <span className="text-xs font-medium text-muted">找谁</span>
                      <p className="text-xs text-foreground">{step.who}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2">
                      <span className="text-xs font-medium text-muted">做什么</span>
                      <p className="text-xs text-foreground">{step.what}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SWOT 2x2 Grid */}
      {strategy.swot && <div className="rounded-xl border border-border bg-sidebar p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">SWOT 分析</h3>
        <div className="grid grid-cols-2 gap-3">
          {SWOT_CONFIG.map(({ key, label, bg, textColor }) => (
            <div key={key} className={`rounded-xl border p-4 ${bg}`}>
              <h4 className={`mb-2 text-xs font-semibold ${textColor}`}>{label}</h4>
              <ul className="space-y-1">
                {(strategy.swot?.[key] ?? []).map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${textColor === "text-positive" ? "bg-positive" : textColor === "text-danger" ? "bg-danger" : textColor === "text-blue-600" ? "bg-blue-500" : "bg-warning"}`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>}

      {/* Competitor Strategy */}
      {(strategy.competitorStrategy ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-sidebar p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Shield className="h-3.5 w-3.5" />
            竞争策略
          </h3>
          <ul className="space-y-1.5">
            {(strategy.competitorStrategy ?? []).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Shield className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline - vertical */}
      {(strategy.timeline ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-sidebar p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
            行动时间线
          </h3>
          <div className="relative space-y-3 pl-8">
            <div className="absolute left-3 top-1 bottom-1 w-px bg-border" />
            {(strategy.timeline ?? []).map((t, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
                <div className="flex items-start gap-3">
                  <span className="min-w-[60px] text-xs font-semibold text-accent">{t.week}</span>
                  <p className="flex-1 text-sm text-foreground">{t.action}</p>
                  <button
                    onClick={() => convertTimelineToTask(t)}
                    className="rounded-md p-1 text-secondary hover:text-accent hover:bg-accent/10 flex-shrink-0"
                    title="转为任务"
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Risks with mitigation */}
      {(strategy.keyRisks ?? []).length > 0 && (
        <div className="rounded-xl border border-danger/15 bg-danger/[0.03] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-danger">
            <AlertTriangle className="h-3.5 w-3.5" />
            关键风险
          </h3>
          <div className="space-y-2">
            {(strategy.keyRisks ?? []).map((r, i) => (
              <div key={i} className="rounded-lg border border-danger/10 bg-card p-3">
                <p className="text-sm font-medium text-foreground">{r.risk}</p>
                <p className="mt-1 text-xs text-positive">缓解措施: {r.mitigation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Play Recommendations */}
      {strategy.playRecommendations && strategy.playRecommendations.length > 0 && (
        <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
            <Swords className="h-3.5 w-3.5" />
            谋局推荐
          </h3>
          <div className="space-y-3">
            {strategy.playRecommendations.map((rec: string, i: number) => (
              <div key={i} className="space-y-2">
                <RecommendationDisplayWithEvidence
                  sectionTitle={`策略建议 ${i + 1}`}
                  recommendationTitle={`谋局推荐 #${i + 1}`}
                  recommendationSummary={rec}
                  accountId={account.id}
                  recommendationId={`play-rec:${account.id}:${i}`}
                  confidence={strategy.healthScore ?? 50}
                  panelTitle="证据面板 · 谋局推荐"
                  variant="positive"
                />
                <button
                  onClick={() => onCreatePlay?.({ goalDescription: rec })}
                  className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 active:bg-accent/30"
                  aria-label={`基于推荐「${rec.slice(0, 30)}」新建谋局`}
                >
                  <Swords className="h-3.5 w-3.5" />
                  开始谋局
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Copy button */}
      <div className="flex justify-end">
        <CopyButton text={buildStrategyText()} />
      </div>
    </div>
  );
}
