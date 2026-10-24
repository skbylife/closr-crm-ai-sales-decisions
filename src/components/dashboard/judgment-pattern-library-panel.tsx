"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, Clock3, HelpCircle, ShieldCheck } from "lucide-react";
import type { JudgmentPattern, JudgmentPatternType } from "@/lib/judgment/pattern-library";

interface RecentLearningSample {
  id: string;
  accountId: string;
  label: string;
  confidence: number;
  summary: string;
  caveat: string;
  createdAt: string;
}

interface JudgmentPatternsResponse {
  patterns?: JudgmentPattern[];
  recentLearningSamples?: RecentLearningSample[];
  calibrationNote?: string;
  summary?: {
    totalPatterns: number;
    totalSamples: number;
    counts: Record<JudgmentPatternType, number>;
  };
}

interface JudgmentPatternLibraryPanelProps {
  refreshKey: number;
}

const TYPE_META: Record<JudgmentPatternType, { label: string; className: string }> = {
  effective_intervention: { label: "有效模式", className: "border-positive/20 bg-positive/[0.04]" },
  risk_reversal: { label: "风险反转", className: "border-positive/20 bg-positive/[0.04]" },
  stakeholder_shift: { label: "关键人变化", className: "border-accent/20 bg-accent/[0.04]" },
  ineffective_intervention: { label: "无效/噪音", className: "border-warning/25 bg-warning/[0.05]" },
  evidence_gap: { label: "证据缺口", className: "border-border bg-background/70" },
};

export function JudgmentPatternLibraryPanel({ refreshKey }: JudgmentPatternLibraryPanelProps) {
  const [payload, setPayload] = useState<JudgmentPatternsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/judgment-patterns?limit=8", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<JudgmentPatternsResponse> : null))
      .then((nextPayload) => {
        if (!cancelled) setPayload(nextPayload);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const sections = useMemo(() => {
    const patterns = payload?.patterns ?? [];
    return [
      {
        id: "effective",
        title: "有效模式",
        subtitle: "历史样本显示可能有帮助，但仍需比较背景。",
        icon: BookOpenCheck,
        items: patterns.filter((pattern) => pattern.patternType === "effective_intervention" || pattern.patternType === "risk_reversal" || pattern.patternType === "stakeholder_shift").slice(0, 2),
      },
      {
        id: "noise",
        title: "无效/噪音模式",
        subtitle: "作为反例校准，避免把动作数量误读成进展。",
        icon: AlertTriangle,
        items: patterns.filter((pattern) => pattern.patternType === "ineffective_intervention").slice(0, 2),
      },
      {
        id: "gap",
        title: "证据缺口",
        subtitle: "这里不是结论，而是提示先补 interpretation 的背景。",
        icon: HelpCircle,
        items: patterns.filter((pattern) => pattern.patternType === "evidence_gap").slice(0, 2),
      },
    ];
  }, [payload]);

  if (loading) {
    return <div className="h-24 rounded-lg border border-border skeleton" />;
  }

  const patterns = payload?.patterns ?? [];
  const recentLearningSamples = payload?.recentLearningSamples ?? [];
  if (!payload || (patterns.length === 0 && recentLearningSamples.length === 0)) return null;

  return (
    <div className="rounded-xl border border-border bg-card/65 p-3 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">Judgment Pattern Library</p>
          <h4 className="text-sm font-semibold text-foreground">组织级判断样本库</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            {payload.calibrationNote ?? "这些是可追踪、可校正的历史样本，不是自动真理。"}
          </p>
        </div>
        <span className="rounded-full border border-border bg-background px-2 py-1 text-[10px] text-muted">
          {payload.summary?.totalSamples ?? recentLearningSamples.length} samples
        </span>
      </div>

      <div className="grid gap-2 xl:grid-cols-4">
        {sections.map((section) => (
          <section key={section.id} className="rounded-lg border border-border bg-background/55 p-2.5">
            <div className="mb-2 flex items-start gap-2">
              <section.icon className="mt-0.5 h-3.5 w-3.5 text-accent" />
              <div>
                <h5 className="text-[11px] font-semibold text-foreground">{section.title}</h5>
                <p className="text-[10px] leading-snug text-muted">{section.subtitle}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {section.items.length > 0 ? section.items.map((pattern) => <PatternCard key={pattern.id} pattern={pattern} />) : (
                <p className="rounded-lg border border-dashed border-border px-2 py-2 text-[10px] leading-snug text-muted">
                  暂无样本；不要为了填满模式库而制造结论。
                </p>
              )}
            </div>
          </section>
        ))}

        <section className="rounded-lg border border-border bg-background/55 p-2.5">
          <div className="mb-2 flex items-start gap-2">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 text-accent" />
            <div>
              <h5 className="text-[11px] font-semibold text-foreground">最近学习样本</h5>
              <p className="text-[10px] leading-snug text-muted">最新 intervention outcome，用来校准而不是定规则。</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {recentLearningSamples.slice(0, 3).map((sample) => (
              <div key={sample.id} className="rounded-lg border border-border bg-card/70 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-semibold text-foreground">{sample.label}</p>
                  <span className="text-[10px] text-muted tabular-nums">{Math.round(sample.confidence * 100)}%</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-foreground/80">{sample.summary}</p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted">{sample.caveat}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PatternCard({ pattern }: { pattern: JudgmentPattern }) {
  const meta = TYPE_META[pattern.patternType];
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${meta.className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-1 text-[11px] font-semibold text-foreground">{pattern.label}</p>
        <span className="shrink-0 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] text-muted">
          n={pattern.sampleSize}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-foreground/80">{pattern.summary}</p>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
        <ShieldCheck className="h-3 w-3" />
        <span className="tabular-nums">{meta.label} · {Math.round(pattern.confidence * 100)}%</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-muted">{pattern.caveat}</p>
    </div>
  );
}
