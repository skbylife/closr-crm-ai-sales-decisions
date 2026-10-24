"use client";

// ─── Shared small components used across decode subcomponents ─────────

import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { RISK_LABELS } from "./decode-helpers";

// ─── Types (shared across decode) ────────────────────────────────────

export interface MeetingDecodeResult {
  meetingSummary?: string;
  keyDecisions?: string[];
  actionItems?: { title: string; owner: string; deadline: string }[];
  salesSignals?: {
    sentimentTrend?: string;
    riskLevel?: string;
    buyerState?: string;
    keySignal?: string;
  };
  nextSteps?: string[];
  concerns?: string[];
  opportunities?: string[];
}

export interface MeetingTranscriptData {
  segments: { speaker: string; speakerLabel?: string; startTime: number; endTime: number; text: string }[];
  fullText: string;
  speakerCount: number;
  totalDuration: number;
}

// ─── Sentiment Icon ──────────────────────────────────────────────────

export function sentimentIcon(trend: string) {
  if (trend === "warming") return <TrendingUp className="h-4 w-4 text-positive" />;
  if (trend === "cooling") return <TrendingDown className="h-4 w-4 text-danger" />;
  if (trend === "volatile") return <Zap className="h-4 w-4 text-warning" />;
  return <Minus className="h-4 w-4 text-muted" />;
}

// ─── Risk Badge ──────────────────────────────────────────────────────

export function riskBadge(level: string) {
  const styles: Record<string, string> = {
    low: "bg-green-600 text-white border-green-600",
    medium: "bg-amber-500 text-white",
    high: "bg-red-600 text-white",
    critical: "bg-danger/20 text-danger border-danger/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[level] ?? styles.low}`}>
      {level === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
      {RISK_LABELS[level] ?? RISK_LABELS.low}
    </span>
  );
}

// ─── Buyer State Badge ───────────────────────────────────────────────

export function buyerStateBadge(state: string) {
  const labels: Record<string, { label: string; style: string }> = {
    engaged: { label: "推动者", style: "bg-green-600 text-white border-green-600" },
    evaluating: { label: "评估者", style: "bg-blue-600 text-white border-blue-600" },
    stalling: { label: "观望者", style: "bg-amber-500 text-white border-amber-500" },
    ghosting: { label: "已消失", style: "bg-red-600 text-white border-red-600" },
    evaluator_to_ghost: { label: "阻碍者", style: "bg-red-600 text-white border-red-600" },
    ready_to_buy: { label: "准备成交", style: "bg-green-600 text-white border-green-600" },
  };
  const info = labels[state] ?? labels.evaluating;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${info.style}`}>
      {info.label}
    </span>
  );
}

// ─── Copy Button ─────────────────────────────────────────────────────

export function CopyButton({ text }: { text: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
        copied
          ? "border-accent/30 bg-accent/10 text-accent"
          : "bg-card text-muted hover:border-secondary hover:text-foreground"
      }`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          {t("decode.copied")}
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {t("decode.copy")}
        </>
      )}
    </button>
  );
}

// ─── AI Progress Steps ───────────────────────────────────────────────

export function AIProgressSteps({ step }: { step: "decode" | "strategy" }) {
  const steps = [
    { key: "decode", label: "解读沟通内容..." },
    { key: "strategy", label: "生成应对策略..." },
  ];
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-2">
      {steps.map((s, i) => {
        const isActive = s.key === step;
        const isDone = steps.findIndex((x) => x.key === step) > i;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {isDone ? (
              <Check className="h-4 w-4 text-positive" />
            ) : isActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : (
              <div className="h-4 w-4 rounded-full border border-border" />
            )}
            <span className={`text-xs font-medium ${isActive ? "text-accent" : isDone ? "text-positive" : "text-muted"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton Decode ─────────────────────────────────────────────────

export function SkeletonDecode() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <div className="skeleton h-5 w-5 rounded-full" />
        <div className="skeleton h-4 w-24 rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border bg-sidebar p-4">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
          <div className="mt-3 flex gap-2">
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Decode Analysis Progress ───────────────────────────────────────

const DECODE_ANALYSIS_STEPS = [
  "读取客户信号",
  "识别真实意图",
  "评估风险与稳定性",
  "生成下一步动作",
] as const;

export function DecodeAnalysisProgress() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, DECODE_ANALYSIS_STEPS.length - 1));
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl border border-accent/20 bg-accent/[0.035] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">AI 解读进行中</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{DECODE_ANALYSIS_STEPS[activeStep]}</h3>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-background text-accent">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {DECODE_ANALYSIS_STEPS.map((step, index) => (
            <div
              key={step}
              className={[
                "h-1.5 rounded-full transition-colors duration-500",
                index <= activeStep ? "bg-accent" : "bg-border",
              ].join(" ")}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {DECODE_ANALYSIS_STEPS.map((step, index) => {
          const done = index < activeStep;
          const active = index === activeStep;
          return (
            <div
              key={step}
              className={[
                "rounded-xl border p-4 transition-all duration-500",
                active
                  ? "border-accent/25 bg-accent/[0.04] shadow-sm"
                  : done
                    ? "border-positive/15 bg-positive/[0.025]"
                    : "border-border bg-card/70",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <Check className="h-4 w-4 text-positive" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-border" />
                )}
                <p className={["text-sm font-semibold", active ? "text-accent" : done ? "text-positive" : "text-secondary"].join(" ")}>
                  {step}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <div className={["h-2 rounded-full", active ? "animate-pulse bg-accent/20" : "bg-muted/10"].join(" ")} />
                <div className={["h-2 w-2/3 rounded-full", active ? "animate-pulse bg-accent/15" : "bg-muted/10"].join(" ")} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skeleton Strategy ───────────────────────────────────────────────

export function SkeletonStrategy() {
  return (
    <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-sidebar p-4">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-2/3 rounded" />
          <div className="skeleton mt-2 h-20 w-full rounded" />
        </div>
      ))}
    </div>
  );
}
