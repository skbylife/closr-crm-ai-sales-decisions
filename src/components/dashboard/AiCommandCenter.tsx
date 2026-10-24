"use client";

/**
 * AiCommandCenter — 统一 AI 指挥中心
 *
 * 按用户职级渲染完全独立的视图：
 * - AE：个人执行视图（今日行动 + 待办 + 情报）
 * - Manager：团队管理视图（团队健康度 + 辅导建议 + 团队行动）
 * - Executive/Admin：战略决策视图（漏斗 KPI + 风险 + 洞察）
 */

import { useState, useCallback } from "react";
import type { UserRoleLevel } from "@/lib/babel-engine/types";
import { CommandCenterHeader } from "./command-center/CommandCenterHeader";
import { AeCommandView } from "./command-center/AeCommandView";
import { ManagerCommandView } from "./command-center/ManagerCommandView";
import { ExecutiveCommandView } from "./command-center/ExecutiveCommandView";

// ─── Props ───────────────────────────────────────────────────────────

export type AiDisplayMode = "full" | "summary";

interface AiCommandCenterProps {
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  roleLevel: UserRoleLevel;
  displayMode?: AiDisplayMode;
}

// ─── 按职级配置 ──────────────────────────────────────────────────────

function getViewConfig(roleLevel: UserRoleLevel): { title: string; badge: string } {
  switch (roleLevel) {
    case "director":
      return { title: "AI 指挥中心", badge: "团队视图" };
    case "executive":
      return { title: "AI 指挥中心", badge: "战略视图" };
    default:
      return { title: "AI 指挥中心", badge: "我的视图" };
  }
}

// ─── 主组件 ──────────────────────────────────────────────────────────

export function AiCommandCenter({
  accounts,
  opportunities,
  roleLevel,
  displayMode = "full",
}: AiCommandCenterProps) {
  const config = getViewConfig(roleLevel);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAnalysisComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="relative card-elevated rounded-xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] via-accent/[0.02] to-transparent shadow-sm shadow-accent/5">
      {/* 左侧 accent 高亮线 */}
      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-accent/60" />

      {/* 共享标题栏 + 立即分析 */}
      <CommandCenterHeader
        title={config.title}
        badge={config.badge}
        onAnalysisComplete={handleAnalysisComplete}
      />

      {/* 按职级渲染独立视图 */}
      {roleLevel === "executive" ? (
        <ExecutiveCommandView
          accounts={accounts}
          opportunities={opportunities}
          refreshKey={refreshKey}
          displayMode={displayMode}
        />
      ) : roleLevel === "director" ? (
        <ManagerCommandView
          accounts={accounts}
          opportunities={opportunities}
          refreshKey={refreshKey}
        />
      ) : (
        <AeCommandView
          accounts={accounts}
          opportunities={opportunities}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}
