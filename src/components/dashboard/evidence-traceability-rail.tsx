"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, FileSearch, ShieldAlert, Clock3, ArrowRight, Database, Mail, Brain, FileText } from "lucide-react";
import type { Opportunity } from "@/lib/babel-engine/types";
import type { CILAccountHealthReport } from "@/lib/compiled-intelligence/explain";

// ─── Evidence source types ──────────────────────────────────────────

export type EvidenceSourceType = "cil_lint" | "meddicc_rule" | "account_health" | "task_rule";

const SOURCE_LABELS: Record<EvidenceSourceType, { label: string; icon: typeof Database }> = {
  cil_lint: { label: "CIL 智能分析", icon: Brain },
  meddicc_rule: { label: "MEDDICC 规则", icon: FileText },
  account_health: { label: "账户画像", icon: Database },
  task_rule: { label: "执行节奏", icon: Mail },
};

// ─── Types ──────────────────────────────────────────────────────────

export type EvidenceClaim = {
  id: string;
  claim: string;
  severity: "critical" | "warning" | "focus";
  summary: string;
  href: string;
  ownerLabel: string;
  recommendedAction: string;
  evidence: string[];
  sourceType: EvidenceSourceType;
  timestamp: string; // ISO date string
};

// ─── Build evidence claims (rule-derived baseline) ──────────────────

export function buildEvidenceClaims(args: {
  riskDeals: Opportunity[];
  riskAccounts: Array<{ id: string; name: string; dealHealth?: string }>;
  overdueTaskCount: number;
  cilReports?: Record<string, CILAccountHealthReport | null>;
  accounts?: Array<{ id: string; name: string }>;
}): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  const now = new Date().toISOString();

  // Build a name lookup combining full accounts list and riskAccounts.
  // Never fall back to raw account_id as display text.
  const nameMap = new Map<string, string>();
  for (const a of args.accounts ?? []) nameMap.set(a.id, a.name);
  for (const a of args.riskAccounts) if (!nameMap.has(a.id)) nameMap.set(a.id, a.name);

  // ── CIL-derived claims (real explain data from detail pages) ──
  if (args.cilReports) {
    for (const [accountId, report] of Object.entries(args.cilReports)) {
      if (!report) continue;

      const criticalFindings = (report.lintFindings ?? []).filter((f) => f.severity === "critical");
      if (criticalFindings.length > 0) {
        const accountName = nameMap.get(accountId) ?? "未命名账户";

        claims.push({
          id: `cil-${accountId}`,
          claim: `${accountName} 的 CIL 画像发现 ${criticalFindings.length} 个严重问题`,
          severity: "critical",
          summary: `健康分 ${report.healthScore}/100，存在需要立即处理的证据缺陷`,
          href: `/accounts/${accountId}`,
          ownerLabel: "CIL 画像",
          recommendedAction: criticalFindings[0]?.suggestedAction ?? "进入账户页查看 CIL explain 并补齐缺失证据。",
          evidence: [
            `CIL 健康分：${report.healthScore}/100`,
            ...criticalFindings.slice(0, 3).map((f) => f.title),
            (report.evidenceCoverage?.orphaned ?? 0) > 0
              ? `${report.evidenceCoverage.orphaned} 条孤立证据未关联到 claim`
              : null,
          ].filter(Boolean) as string[],
          sourceType: "cil_lint",
          timestamp: now,
        });
      }
    }
  }

  // ── Rule-derived deal claims (MEDDICC) ──
  for (const deal of args.riskDeals.slice(0, 3)) {
    // Skip if already covered by CIL claim for this account
    if (args.cilReports && claims.some((c) => c.id === `cil-${deal.accountId}`)) continue;

    const score = deal.meddicc?.overallScore ?? 0;
    const missingAreas = [
      score < 40 ? "MEDDICC 健康度低于 40" : null,
      deal.stage === "proposal_sent" || deal.stage === "negotiation" ? `当前停留在 ${deal.stage} 阶段` : null,
      deal.value >= 100000 ? `高价值机会 ¥${Math.round(deal.value / 10000)}w` : null,
    ].filter(Boolean) as string[];

    claims.push({
      id: `deal-${deal.id}`,
      claim: `${deal.name} 的赢单可信度不足`,
      severity: score < 30 ? "critical" : "warning",
      summary: `需要补强 why now / champion / proof，避免高价值机会带病推进`,
      href: `/pipeline/${deal.id}`,
      ownerLabel: "商机证据链",
      recommendedAction: "进入商机详情，补齐关键证据并明确下一步推进动作。",
      evidence: [
        `MEDDICC 当前分数：${score}`,
        ...missingAreas,
      ],
      sourceType: "meddicc_rule",
      timestamp: deal.updatedAt ?? now,
    });
  }

  // ── Rule-derived account claims ──
  for (const account of args.riskAccounts.slice(0, 2)) {
    // Skip if already covered by CIL claim
    if (claims.some((c) => c.id === `cil-${account.id}`)) continue;

    claims.push({
      id: `account-${account.id}`,
      claim: `${account.name} 的账户健康度正在走弱`,
      severity: account.dealHealth === "critical" ? "critical" : "warning",
      summary: "账户层出现连续风险信号，应先看清问题来源再加动作",
      href: `/accounts/${account.id}`,
      ownerLabel: "账户健康画像",
      recommendedAction: "进入账户页查看 CIL explain，确认问题来自关系、节奏还是证明材料。",
      evidence: [
        `账户状态：${account.dealHealth === "critical" ? "严重" : "需关注"}`,
        "已进入首页风险账户清单",
        "需要核查近期互动、活跃度与机会推进质量",
      ],
      sourceType: "account_health",
      timestamp: now,
    });
  }

  // ── Overdue tasks claim ──
  if (args.overdueTaskCount > 0) {
    claims.push({
      id: "overdue-tasks",
      claim: `推进节奏已被 ${args.overdueTaskCount} 个逾期任务拖慢`,
      severity: args.overdueTaskCount > 3 ? "critical" : "warning",
      summary: "不是缺动作，而是动作未按计划完成，节奏已失真",
      href: "/pulse",
      ownerLabel: "执行节奏",
      recommendedAction: "优先清理逾期任务，恢复跟进节拍，再展开新增动作。",
      evidence: [
        `逾期任务数量：${args.overdueTaskCount}`,
        "已影响今日优先级排序",
        "若继续累积，会稀释高价值机会推进资源",
      ],
      sourceType: "task_rule",
      timestamp: now,
    });
  }

  // Sort: CIL-derived first, then by severity
  const severityOrder = { critical: 0, warning: 1, focus: 2 };
  claims.sort((a, b) => {
    const aIsCil = a.sourceType === "cil_lint" ? 0 : 1;
    const bIsCil = b.sourceType === "cil_lint" ? 0 : 1;
    if (aIsCil !== bIsCil) return aIsCil - bIsCil;
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return claims.slice(0, 5);
}

// ─── Format relative time ───────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

// ─── Component ──────────────────────────────────────────────────────

export function EvidenceTraceabilityRail({
  riskDeals,
  riskAccounts,
  overdueTaskCount,
}: {
  riskDeals: Opportunity[];
  riskAccounts: Array<{ id: string; name: string; dealHealth?: string }>;
  overdueTaskCount: number;
}) {
  const [cilReports, setCilReports] = useState<Record<string, CILAccountHealthReport | null> | null>(null);

  // Fetch real CIL explain data for risk accounts
  const fetchCilData = useCallback(async () => {
    const accountIds = riskAccounts.map((a) => a.id);
    if (accountIds.length === 0) return;

    try {
      const res = await fetch("/api/cil-explain-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds }),
      });
      if (res.ok) {
        const json = await res.json() as { reports: Record<string, CILAccountHealthReport | null> };
        setCilReports(json.reports);
      }
    } catch {
      // Silently fall back to rule-derived claims
    }
  }, [riskAccounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCilData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchCilData]);

  const claims = useMemo(
    () => buildEvidenceClaims({
      riskDeals,
      riskAccounts,
      overdueTaskCount,
      cilReports: cilReports ?? undefined,
    }),
    [riskDeals, riskAccounts, overdueTaskCount, cilReports]
  );
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined);
  const activeExpandedId =
    expandedId === undefined
      ? (claims[0]?.id ?? null)
      : expandedId !== null && claims.every((claim) => claim.id !== expandedId)
        ? (claims[0]?.id ?? null)
        : expandedId;

  if (claims.length === 0) return null;

  const toneClasses = {
    critical: {
      badge: "bg-[var(--dash-severity-critical-bg)] text-[var(--dash-severity-critical-dark)] border-[var(--dash-severity-critical-border)]",
      strip: "bg-[var(--dash-severity-critical)]",
      icon: ShieldAlert,
    },
    warning: {
      badge: "bg-[var(--dash-severity-warning-bg)] text-[var(--dash-severity-warning-dark)] border-[var(--dash-severity-warning-border)]",
      strip: "bg-[var(--dash-severity-warning)]",
      icon: AlertTriangle,
    },
    focus: {
      badge: "bg-[var(--dash-severity-focus-bg)] text-[var(--dash-severity-focus)] border-[var(--dash-severity-focus-border)]",
      strip: "bg-[var(--dash-severity-focus)]",
      icon: FileSearch,
    },
  } as const;

  return (
    <section className="rounded-2xl border bg-[var(--dash-card-bg)] shadow-[var(--dash-card-shadow)]" style={{ borderColor: 'var(--dash-card-border)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--dash-card-divider)' }}>
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--dash-icon-accent)' }}>
            <FileSearch className="h-3.5 w-3.5" />
            可解释性
          </div>
          <h3 className="mt-1.5 text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
            主张 → 证据溯源
          </h3>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--dash-text-secondary)' }}>
            AI 判断的每一条结论，都能展开看到依据和下一步建议
          </p>
        </div>
        <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: 'var(--dash-counter-bg)', border: '1px solid var(--dash-counter-border)', color: 'var(--dash-icon-accent)' }}>
          {claims.length} 条
        </div>
      </div>

      {/* Claims list */}
      <div className="divide-y" style={{ borderColor: 'var(--dash-card-divider)' }}>
        {claims.map((item) => {
          const tone = toneClasses[item.severity];
          const Icon = tone.icon;
          const expanded = activeExpandedId === item.id;
          const sourceInfo = SOURCE_LABELS[item.sourceType];
          const SourceIcon = sourceInfo.icon;

          return (
            <div key={item.id} className="relative" style={{ borderColor: 'var(--dash-card-divider)' }}>
              <div className={`absolute inset-y-0 left-0 w-1 ${tone.strip}`} />
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : item.id)}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors"
                style={{ ['--tw-bg-opacity' as string]: 1 }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span className={`mt-0.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.badge}`}>
                  <Icon className="mr-1 inline h-3 w-3" />
                  {item.ownerLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>{item.claim}</p>
                      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--dash-text-secondary)' }}>{item.summary}</p>
                      {/* Source type + timestamp */}
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                          <SourceIcon className="h-2.5 w-2.5" />
                          {sourceInfo.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                          <Clock3 className="h-2.5 w-2.5" />
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                    </div>
                    {expanded ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--dash-text-tertiary)' }} />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--dash-text-tertiary)' }} />
                    )}
                  </div>
                </div>
              </button>

              {expanded && (
                <div className="px-5 pb-4 pl-8 pr-5" style={{ backgroundColor: 'var(--dash-expand-bg)' }}>
                  <div className="rounded-xl border p-4" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
                    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--dash-text-tertiary)' }}>证据</p>
                        <ul className="mt-2 space-y-2">
                          {item.evidence.map((evidenceLine) => (
                            <li key={evidenceLine} className="flex items-start gap-2 text-sm" style={{ color: 'var(--dash-text-primary)' }}>
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--dash-evidence-dot)' }} />
                              <span className="leading-relaxed">{evidenceLine}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-expand-bg)' }}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--dash-text-tertiary)' }}>建议下一步</p>
                        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--dash-text-primary)' }}>{item.recommendedAction}</p>
                        <Link
                          href={item.href}
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                          style={{ color: 'var(--dash-link-accent)' }}
                        >
                          打开详情
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-5 py-3 text-xs" style={{ borderTop: '1px solid var(--dash-card-divider)', color: 'var(--dash-text-secondary)' }}>
        <Clock3 className="h-3.5 w-3.5" />
        首页展示可操作的证据链；更细颗粒度的 claim 在账户页 / 商机页继续下钻
      </div>
    </section>
  );
}
