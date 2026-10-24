"use client";

import { useState, useCallback } from "react";
import { Sparkles, Play, Loader2, CheckCircle2 } from "lucide-react";

interface CommandCenterHeaderProps {
  title: string;
  badge: string;
  onAnalysisComplete?: () => void;
}

export function CommandCenterHeader({ title, badge, onAnalysisComplete }: CommandCenterHeaderProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runAllAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setResult(null);
    try {
      const results = await Promise.allSettled([
        fetch("/api/agent/daily-analysis", { method: "POST" }),
        fetch("/api/agent/intelligence/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      ]);
      const labels = ["商机分析", "情报扫描"];
      const allOk = results.every(
        (r) => r.status === "fulfilled" && r.value.ok
      );
      if (allOk) {
        setResult("分析完成，数据已更新");
        onAnalysisComplete?.();
      } else {
        const failed = results
          .map((r, i) => (r.status !== "fulfilled" || !r.value.ok ? labels[i] : null))
          .filter(Boolean);
        setResult(`${failed.join("、")}启动失败`);
      }
    } catch {
      setResult("分析请求失败，请稍后重试");
    } finally {
      setAnalyzing(false);
    }
  }, [onAnalysisComplete]);

  return (
    <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent animate-pulse" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
          {badge}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {result && (
          <span className="flex items-center gap-1 text-[10px] text-positive">
            <CheckCircle2 className="h-3 w-3" />
            {result}
          </span>
        )}
        <button
          onClick={runAllAnalysis}
          disabled={analyzing}
          className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
        >
          {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {analyzing ? "分析中..." : "立即分析"}
        </button>
      </div>
    </div>
  );
}
