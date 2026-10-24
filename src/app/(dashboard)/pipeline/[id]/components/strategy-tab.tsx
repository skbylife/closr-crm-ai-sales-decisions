'use client';

import { useState } from 'react';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { Brain, Loader2 } from 'lucide-react';
import type { Opportunity } from '@/lib/babel-engine/types';
import { useLocale } from '@/lib/i18n';

// AI 生成步骤进度
const STRATEGY_STEPS = [
  "收集客户与联系人数据...",
  "分析 MEDDICC 评估与情报...",
  "生成综合策略...",
  "完成",
];

function AIProgressSteps({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-10 px-6">
      <div className="w-full max-w-xs space-y-3">
        {STRATEGY_STEPS.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
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

export function StrategyTab({ opp }: { opp: Opportunity }) {
  const { accounts, intelItems: visibleIntelItems, emailDecodes, tasks } = useRoleFilteredData();
  const { locale } = useLocale();
  const intelItems = visibleIntelItems.filter((i) => i.accountId === opp.accountId);
  const decodes = emailDecodes.filter((d) => d.accountId === opp.accountId && d.opportunityId === opp.id);
  const account = accounts.find((a) => a.id === opp.accountId);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [strategy, setStrategy] = useState<{
    healthScore: number;
    strategyNarrative: string;
    winPath: { step: string; who: string; what: string }[];
    keyRisks: { risk: string; mitigation: string }[];
  } | null>(null);

  const generateStrategy = async () => {
    if (!account) return;
    setLoading(true);
    setProgressStep(0);
    // 模拟步骤进度
    const stepTimer1 = setTimeout(() => setProgressStep(1), 1500);
    const stepTimer2 = setTimeout(() => setProgressStep(2), 3500);
    try {
      const res = await fetch('/api/account-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: { name: account.name, industry: account.industry, dealStage: opp.stage, dealValue: opp.value, dealHealth: opp.meddicc?.overallScore >= 60 ? 'healthy' : opp.meddicc?.overallScore >= 30 ? 'at_risk' : 'critical' },
          contacts: account.contacts.map((c) => ({ name: c.name, title: c.title, role: c.role })),
          intelItems: intelItems.slice(0, 5).map((i) => ({ title: i.title, content: i.content, source: i.source, credibility: i.credibility })),
          decodes: decodes.slice(0, 3).map((d) => ({ emailText: d.emailText?.slice(0, 200), threadAnalysis: d.decode?.threadAnalysis })),
          meddiccContext: `MEDDICC Score: ${opp.meddicc?.overallScore}/100. Pain Points: ${(opp.meddicc?.identifiedPain ?? []).map((p) => p.pain).join(', ') || 'None'}. Champion Strength: ${opp.meddicc?.champion?.strength}/5. Competition: ${(opp.meddicc?.competition ?? []).map((c) => c.name).join(', ') || 'None identified'}.`,
          mapContext: `MAP Confidence: ${opp.mutualActionPlan?.confidence}%. Milestones: ${opp.mutualActionPlan?.milestones?.length} total, ${(opp.mutualActionPlan?.milestones ?? []).filter((m) => m.status === 'completed').length} completed, ${(opp.mutualActionPlan?.milestones ?? []).filter((m) => m.status === 'blocked').length} blocked.`,
          tasks: (() => {
            const oppTasks = tasks.filter((t) => t.opportunityId === opp.id || t.accountId === opp.accountId);
            const now = new Date();
            return oppTasks.map((t) => ({
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              isOverdue: !!(t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'),
              assignedTo: t.assignedTo,
            }));
          })(),
          outputLocale: locale,
        }),
      });
      const result = await res.json();
      setProgressStep(3); // 完成
      setStrategy(result);
    } catch (err) {
      console.error('Strategy generation error:', err);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">综合策略</h3>
          <p className="text-xs text-muted">基于 MEDDICC + MAP + 情报综合生成</p>
        </div>
        <button
          onClick={generateStrategy}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          生成策略
        </button>
      </div>

      {!strategy && !loading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
          <Brain className="h-10 w-10 text-muted/30" />
          <p className="mt-3 text-sm text-muted">点击「生成策略」获取 AI 综合分析</p>
        </div>
      )}

      {loading && <AIProgressSteps currentStep={progressStep} />}

      {strategy && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">策略概述</h4>
            <p className="text-sm leading-relaxed">{strategy.strategyNarrative}</p>
          </div>

          {strategy.winPath && strategy.winPath.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">赢单路径</h4>
              <div className="space-y-2">
                {strategy.winPath.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{step.step}</p>
                      <p className="text-xs text-muted">{step.who} · {step.what}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {strategy.keyRisks && strategy.keyRisks.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">关键风险</h4>
              <div className="space-y-2">
                {strategy.keyRisks.map((r, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-medium text-amber-800">{r.risk}</p>
                    <p className="mt-1 text-xs text-amber-600">应对：{r.mitigation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
