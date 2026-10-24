'use client';

import { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';

// ─── Play Generating Overlay ────────────────────────────────────────

export const GENERATING_PHASES = [
  { icon: '🔍', label: '分析关系图谱...', detail: '扫描人际网络与联系强度', weight: 12 },
  { icon: '🧠', label: '提取客户判断...', detail: '整合客户痛点、角色和证据', weight: 18 },
  { icon: '🌍', label: '校准沟通语境...', detail: '根据客户组织和文化调整打法', weight: 12 },
  { icon: '📋', label: '生成推进路径...', detail: '规划可执行的多步路线', weight: 20 },
  { icon: '🔀', label: '计算备选方案...', detail: '评估替代路径与风险', weight: 14 },
  { icon: '🧩', label: '补齐证据归因...', detail: '连接来源、假设和判断', weight: 10 },
  { icon: '✨', label: '生成谋局...', detail: '输出最终谋局卡片', weight: 9 },
  { icon: '✅', label: '准备展示...', detail: '整理页面状态', weight: 5 },
];

export const REPLAN_PHASES = [
  { icon: '📊', label: '分析执行偏差...', detail: '对比计划与实际执行结果', weight: 22 },
  { icon: '🧠', label: '整合学习成果...', detail: '将反馈和新信号纳入判断', weight: 24 },
  { icon: '🔄', label: '重新规划路径...', detail: '根据偏差调整后续策略', weight: 28 },
  { icon: '🧩', label: '校验证据归因...', detail: '确认假设、证据和下一步一致', weight: 16 },
  { icon: '✅', label: '准备展示...', detail: '整理页面状态', weight: 10 },
];

export function PlayGeneratingOverlay({ phases, title }: { phases?: typeof GENERATING_PHASES; title?: string }) {
  const activePhases = phases ?? GENERATING_PHASES;
  const [elapsedMs, setElapsedMs] = useState(1);
  const overlayTitle = title ?? '正在生成谋局';
  const totalWeight = activePhases.reduce((sum, p) => sum + p.weight, 0);
  const estimatedDuration = Math.max(18000, activePhases.length * 2600);
  const softCapDuration = estimatedDuration * 1.8;

  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 120);
    return () => clearInterval(interval);
  }, [activePhases]);

  const timeRatio = Math.min(elapsedMs / estimatedDuration, 1);
  const eased = 1 - Math.pow(1 - timeRatio, 1.7);
  const weightedProgress = Math.min(94, eased * 94);
  const slowTail = elapsedMs > estimatedDuration
    ? Math.min(4, ((elapsedMs - estimatedDuration) / Math.max(1, softCapDuration - estimatedDuration)) * 4)
    : 0;
  const progress = Math.min(98, weightedProgress + slowTail);
  const cumulativeWeights = activePhases.reduce<number[]>((acc, phaseItem, index) => {
    const previous = index === 0 ? 0 : acc[index - 1];
    acc.push(previous + phaseItem.weight);
    return acc;
  }, []);
  const progressWeight = (progress / 100) * totalWeight;
  const phase = Math.min(
    activePhases.length - 1,
    cumulativeWeights.findIndex((value) => progressWeight <= value) === -1
      ? activePhases.length - 1
      : cumulativeWeights.findIndex((value) => progressWeight <= value),
  );

  const currentPhase = activePhases[phase];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      {/* Animated brain icon */}
      <div className="relative mb-8">
        <div className="h-20 w-20 rounded-2xl bg-accent/10 flex items-center justify-center animate-pulse">
          <Brain className="h-10 w-10 text-accent" />
        </div>
        {/* Orbiting dots */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '3s' }}>
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-accent/60" />
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '4s', animationDirection: 'reverse' }}>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-purple-400/60" />
        </div>
      </div>

      {/* Phase indicator */}
      <div className="text-center mb-6 min-h-[60px]">
        <p className="mb-2 text-sm font-medium text-secondary">{overlayTitle}</p>
        <div className="flex items-center justify-center gap-2 mb-1.5">
          <span className="text-xl">{currentPhase.icon}</span>
          <p className="text-sm font-semibold text-foreground">{currentPhase.label}</p>
        </div>
        <p className="text-xs text-muted">{currentPhase.detail}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-4">
        <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>阶段 {phase + 1}/{activePhases.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {/* Phase dots */}
      <div className="flex items-center gap-1.5 mt-2">
        {activePhases.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i < phase ? 'w-1.5 bg-accent' : i === phase ? 'w-4 bg-accent' : 'w-1.5 bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
