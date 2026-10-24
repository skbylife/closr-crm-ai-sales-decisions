"use client";

/**
 * 自动化进度浮窗（非阻塞）
 * 展示邮件解读后的自动化 pipeline 执行进度
 * 右下角浮窗，不阻塞主界面操作，完成后自动收起
 */

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, Clock, XCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import type { PipelineStep } from "@/lib/auto-pipeline";

interface AutomationProgressProps {
  open: boolean;
  steps: PipelineStep[];
  onClose: () => void;
}

function StepIcon({ status }: { status: PipelineStep["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-positive flex-shrink-0" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-accent flex-shrink-0" />;
    case "error":
      return <XCircle className="h-4 w-4 text-danger flex-shrink-0" />;
    default:
      return <Clock className="h-4 w-4 text-muted flex-shrink-0" />;
  }
}

export default function AutomationProgress({
  open,
  steps,
  onClose,
}: AutomationProgressProps) {
  const [collapsed, setCollapsed] = useState(false);

  const doneCount = steps.filter((s) => s.status === "done" || s.status === "error").length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const hasError = steps.some((s) => s.status === "error");
  const runningStep = steps.find((s) => s.status === "running");

  // Auto-close 3s after all done
  useEffect(() => {
    if (!allDone || !open) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [allDone, open, onClose]);

  if (!open || steps.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        {/* Header — always visible, clickable to expand/collapse */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sidebar/40 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            {allDone ? (
              <CheckCircle2 className="h-4 w-4 text-positive flex-shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-accent flex-shrink-0" />
            )}
            <span className="text-xs font-medium text-foreground truncate">
              {allDone
                ? hasError ? "自动化完成（部分失败）" : "自动化完成"
                : runningStep ? runningStep.label : `处理中 ${doneCount}/${steps.length}`
              }
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!allDone && (
              <span className="text-[11px] text-muted">{doneCount}/{steps.length}</span>
            )}
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted" />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-foreground hover:bg-sidebar transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </button>

        {/* Steps — collapsible */}
        {!collapsed && (
          <div className="border-t border-border px-3 py-2 space-y-0.5 max-h-60 overflow-y-auto">
            {steps.map((step) => (
              <div
                key={step.key}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${
                  step.status === "running" ? "bg-accent/5" : ""
                }`}
              >
                <StepIcon status={step.status} />
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium ${
                    step.status === "done" ? "text-positive" :
                    step.status === "running" ? "text-accent" :
                    step.status === "error" ? "text-danger" : "text-muted"
                  }`}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <p className="text-[11px] text-secondary truncate">{step.detail}</p>
                  )}
                  {step.error && (
                    <p className="text-[11px] text-danger/80 truncate">{step.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {!allDone && (
          <div className="h-0.5 bg-border">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
