"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Shield,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ArrowRight,
  Users,
  DollarSign,
  ListChecks,
  Target,
  Flame,
  Swords,
  Crown,
} from "lucide-react";
import Link from "next/link";
import type { CILAccountHealthReport } from "@/lib/compiled-intelligence/explain";
import { getMeddiccScore } from "@/lib/meddicc";
import { useStore } from "@/lib/store";

// ─── Model Dimension Types ──────────────────────────────────────────

type DimensionStatus = "strong" | "weak" | "missing" | "stale";

interface ModelDimension {
  key: string;
  label: string;
  status: DimensionStatus;
  reason: string;
  evidence: string;
  nextAction: string;
}

// ─── Dimension config (Chinese labels, icons) ───────────────────────

const DIMENSION_CONFIG: Record<string, { label: string; icon: typeof Shield }> = {
  champion:         { label: "内部支持者",   icon: Crown },
  economic_buyer:   { label: "经济决策人",   icon: DollarSign },
  metrics:          { label: "价值指标",     icon: Target },
  decision_criteria:{ label: "决策标准",     icon: ListChecks },
  decision_process: { label: "决策流程",     icon: Users },
  why_now:          { label: "紧迫性",       icon: Flame },
  proof:            { label: "竞争与证明",   icon: Swords },
};

const STATUS_LABELS: Record<DimensionStatus, string> = {
  strong:  "充分",
  weak:    "薄弱",
  missing: "缺失",
  stale:   "过期",
};

// ─── Props ───────────────────────────────────────────────────────────

interface CILPortfolioHealthProps {
  accounts: { id: string; name: string }[];
}

interface AccountHealth {
  accountId: string;
  name: string;
  report: CILAccountHealthReport | null;
  dimensions: ModelDimension[];
  error: boolean;
}

const CIL_PORTFOLIO_CACHE_KEY = "closr:dashboard:cil-portfolio-health";

function buildCacheKey(accounts: { id: string; name: string }[]) {
  return `${CIL_PORTFOLIO_CACHE_KEY}:${accounts.map((account) => account.id).sort().join(",")}`;
}

// ─── Health Score Ring (SVG, inline) ─────────────────────────────────

function HealthScoreRing({
  score,
  size = 80,
}: {
  score: number;
  size?: number;
}) {
  const strokeWidth = size > 48 ? 7 : 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  const color =
    score >= 80
      ? "var(--dash-health-good)"
      : score >= 50
        ? "var(--dash-health-warn)"
        : "var(--dash-health-bad)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--dash-card-border)"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold tabular-nums" style={{ fontSize: size > 48 ? 20 : 11, color: 'var(--dash-text-primary)' }}>
          {score}
        </span>
        {size > 48 && (
          <span className="text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>/ 100</span>
        )}
      </div>
    </div>
  );
}

// ─── Dimension status dot ───────────────────────────────────────────

function DimensionDot({ status }: { status: DimensionStatus }) {
  const colorMap: Record<DimensionStatus, string> = {
    strong:  "var(--dash-health-good)",
    weak:    "var(--dash-health-warn)",
    missing: "var(--dash-health-bad)",
    stale:   "var(--dash-health-bad)",
  };
  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: colorMap[status] }}
    />
  );
}

// ─── Dimension mini bar (7 segments) ────────────────────────────────

function DimensionMiniBar({ dimensions }: { dimensions: ModelDimension[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {dimensions.map((d) => {
        const colorMap: Record<DimensionStatus, string> = {
          strong:  "var(--dash-health-good)",
          weak:    "var(--dash-health-warn)",
          missing: "var(--dash-health-bad)",
          stale:   "var(--dash-health-bad)",
        };
        return (
          <div
            key={d.key}
            className="h-1.5 flex-1 rounded-full transition-all duration-500"
            style={{ backgroundColor: colorMap[d.status] }}
            title={`${d.label}: ${STATUS_LABELS[d.status]}`}
          />
        );
      })}
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────

function PortfolioSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded skeleton" />
          <div className="h-3 w-48 rounded skeleton" />
        </div>
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg skeleton" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Shield className="h-10 w-10 mb-3" style={{ color: 'var(--dash-text-tertiary)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--dash-text-secondary)' }}>
        暂无客户数据
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--dash-text-tertiary)' }}>
        添加客户后将自动汇总 CIL 智能画像健康状态
      </p>
    </div>
  );
}

// ─── Build per-dimension analysis from MEDDICC data ─────────────────

interface FallbackOpp {
  accountId: string;
  stage: string;
  meddicc?: {
    overallScore?: number;
    metrics?: { status?: string; evidence?: string };
    economicBuyer?: { status?: string; accessLevel?: string };
    decisionCriteria?: unknown[];
    decisionProcess?: Array<{ status?: string; dueDate?: string }>;
    identifiedPain?: Array<{ quantified?: boolean; description?: string }>;
    champion?: { strength?: number; lastEngagement?: string; notes?: string };
    competition?: Array<{ name?: string }>;
  };
}

function buildDimensionsFromOpps(acctOpps: FallbackOpp[]): ModelDimension[] {
  const nowMs = Date.now();
  const dims: ModelDimension[] = [];

  // Aggregate across all active opps
  let bestChampStrength = 0;
  let champLastDate = "";
  let champNotes = "";
  let metricsStatus = "unconfirmed";
  let metricsEvidence = "";
  let ebStatus = "unknown";
  let ebAccess = "";
  let dcCount = 0;
  let dpSteps: Array<{ status?: string; dueDate?: string }> = [];
  let painCount = 0;
  let quantifiedPainCount = 0;
  const painDescriptions: string[] = [];
  let competitorCount = 0;
  const competitorNames: string[] = [];

  for (const opp of acctOpps) {
    const m = opp.meddicc;
    if (!m) continue;

    if ((m.champion?.strength ?? 0) > bestChampStrength) {
      bestChampStrength = m.champion?.strength ?? 0;
      champLastDate = m.champion?.lastEngagement ?? "";
      champNotes = m.champion?.notes ?? "";
    }
    if (m.metrics?.status === "confirmed") metricsStatus = "confirmed";
    else if (m.metrics?.status === "partial" && metricsStatus !== "confirmed") metricsStatus = "partial";
    if (m.metrics?.evidence) metricsEvidence = m.metrics.evidence;

    if (m.economicBuyer?.status === "engaged") ebStatus = "engaged";
    else if (m.economicBuyer?.status === "identified" && ebStatus !== "engaged") ebStatus = "identified";
    if (m.economicBuyer?.accessLevel) ebAccess = m.economicBuyer.accessLevel;

    dcCount += m.decisionCriteria?.length ?? 0;
    dpSteps = dpSteps.concat(m.decisionProcess ?? []);
    painCount += m.identifiedPain?.length ?? 0;
    quantifiedPainCount += m.identifiedPain?.filter((p) => p.quantified).length ?? 0;
    for (const p of m.identifiedPain ?? []) {
      if ((p as { description?: string }).description) painDescriptions.push((p as { description?: string }).description!);
    }
    competitorCount += m.competition?.length ?? 0;
    for (const c of m.competition ?? []) {
      if ((c as { name?: string }).name) competitorNames.push((c as { name?: string }).name!);
    }
  }

  // 1. Champion
  {
    const champDaysSince = champLastDate
      ? Math.floor((nowMs - new Date(champLastDate).getTime()) / 86400000)
      : Infinity;
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (bestChampStrength === 0) {
      status = "missing";
      reason = "尚未识别任何内部支持者";
      evidence = "所有商机中均未记录 Champion 信息";
      nextAction = "通过现有联系人关系图谱，识别并发展潜在内部支持者";
    } else if (champDaysSince > 21) {
      status = "stale";
      reason = `Champion 最后互动距今 ${champDaysSince} 天，信息可能已过时`;
      evidence = champNotes ? `最近备注：${champNotes}` : `最后接触日期：${champLastDate}`;
      nextAction = "立即安排 Champion 沟通，刷新决策进展和组织动态";
    } else if (bestChampStrength < 3) {
      status = "weak";
      reason = `Champion 支持度偏低（${bestChampStrength}/5），影响力不足以推动内部决策`;
      evidence = champNotes ? `当前状态：${champNotes}` : `支持度评分 ${bestChampStrength}/5`;
      nextAction = "加深与 Champion 的合作关系，提供更多内部说服材料";
    } else {
      status = "strong";
      reason = `Champion 活跃（支持度 ${bestChampStrength}/5），${champDaysSince < 7 ? "近期有接触" : `${champDaysSince} 天前接触`}`;
      evidence = champNotes || "互动频率正常";
      nextAction = "保持沟通节奏，通过 Champion 推进其他维度";
    }
    dims.push({ key: "champion", label: "内部支持者", status, reason, evidence, nextAction });
  }

  // 2. Economic Buyer
  {
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (ebStatus === "unknown") {
      status = "missing";
      reason = "经济决策人尚未识别";
      evidence = "所有商机中均未明确经济决策人";
      nextAction = "通过 Champion 或高层接触获取经济决策人身份";
    } else if (ebStatus === "identified") {
      status = "weak";
      reason = "已识别经济决策人但尚未深入接触";
      evidence = ebAccess ? `当前接触层级：${ebAccess}` : "已知身份但无深入互动";
      nextAction = "争取与经济决策人的直接会面或汇报机会";
    } else {
      status = "strong";
      reason = "经济决策人已深入接触";
      evidence = ebAccess ? `接触层级：${ebAccess}` : "已建立有效沟通渠道";
      nextAction = "维护关系，确保经济决策人持续支持预算推进";
    }
    dims.push({ key: "economic_buyer", label: "经济决策人", status, reason, evidence, nextAction });
  }

  // 3. Metrics
  {
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (metricsStatus === "unconfirmed") {
      status = "missing";
      reason = "价值指标未被客户确认，无法量化投资回报";
      evidence = metricsEvidence || "暂无客户认可的量化指标";
      nextAction = "与客户共同定义成功指标和量化收益框架";
    } else if (metricsStatus === "partial") {
      status = "weak";
      reason = "部分指标已确认，但量化论证不够完整";
      evidence = metricsEvidence || "存在部分指标但未完全确认";
      nextAction = "补充剩余关键指标的量化数据和客户确认";
    } else {
      status = "strong";
      reason = "价值指标已获客户确认";
      evidence = metricsEvidence || "指标体系完整且已确认";
      nextAction = "将确认的指标融入提案和商务谈判材料";
    }
    dims.push({ key: "metrics", label: "价值指标", status, reason, evidence, nextAction });
  }

  // 4. Decision Criteria
  {
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (dcCount === 0) {
      status = "missing";
      reason = "未掌握客户决策标准，无法针对性定位";
      evidence = "客户评选标准完全未知";
      nextAction = "通过 Champion 或客户会议获取评选标准和权重";
    } else if (dcCount < 3) {
      status = "weak";
      reason = `仅掌握 ${dcCount} 项决策标准，可能遗漏关键评选维度`;
      evidence = `已记录 ${dcCount} 条标准`;
      nextAction = "深入了解客户的技术、商务、合规等各维度评选要求";
    } else {
      status = "strong";
      reason = `已掌握 ${dcCount} 项决策标准`;
      evidence = `覆盖 ${dcCount} 个评选维度`;
      nextAction = "确认标准权重排序，确保方案精准对标";
    }
    dims.push({ key: "decision_criteria", label: "决策标准", status, reason, evidence, nextAction });
  }

  // 5. Decision Process
  {
    const overdueSteps = dpSteps.filter(
      (s) => s.status === "in_progress" && s.dueDate && new Date(s.dueDate).getTime() < nowMs
    );
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (dpSteps.length === 0) {
      status = "missing";
      reason = "决策流程未梳理，无法预判签单路径和时间线";
      evidence = "未记录任何决策节点";
      nextAction = "梳理客户内部审批流程：评估 -> 选型 -> 采购 -> 签约各环节";
    } else if (overdueSteps.length > 0) {
      status = "stale";
      reason = `${overdueSteps.length} 个流程节点已超期，时间线可能已变化`;
      evidence = `超期节点截止日：${overdueSteps.map((s) => s.dueDate).join("、")}`;
      nextAction = "确认超期节点的最新状态，更新项目时间线";
    } else {
      status = "strong";
      reason = `已梳理 ${dpSteps.length} 个决策节点`;
      evidence = `${dpSteps.filter((s) => s.status === "in_progress").length} 个进行中`;
      nextAction = "持续跟踪各节点进展，预判风险";
    }
    dims.push({ key: "decision_process", label: "决策流程", status, reason, evidence, nextAction });
  }

  // 6. Why Now / Pain
  {
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (painCount === 0) {
      status = "missing";
      reason = "未识别客户痛点，缺乏购买紧迫性论证";
      evidence = "暂无痛点记录";
      nextAction = "深入了解客户业务现状，挖掘核心痛点和改变的驱动力";
    } else if (quantifiedPainCount === 0) {
      status = "weak";
      reason = `已识别 ${painCount} 个痛点但均未量化，紧迫性论证不足`;
      evidence = painDescriptions.length > 0 ? `已知痛点：${painDescriptions.slice(0, 2).join("；")}` : `${painCount} 个定性痛点`;
      nextAction = "将痛点量化（金额、时间、效率损失），构建 Why Now 论述";
    } else {
      status = "strong";
      reason = `${quantifiedPainCount}/${painCount} 个痛点已量化`;
      evidence = painDescriptions.length > 0 ? painDescriptions.slice(0, 2).join("；") : `${quantifiedPainCount} 条量化数据`;
      nextAction = "将量化痛点整合到价值提案和 ROI 模型中";
    }
    dims.push({ key: "why_now", label: "紧迫性", status, reason, evidence, nextAction });
  }

  // 7. Competition / Proof
  {
    let status: DimensionStatus;
    let reason: string;
    let evidence: string;
    let nextAction: string;

    if (competitorCount === 0) {
      status = "missing";
      reason = "竞争情报为空，无法制定差异化策略";
      evidence = "未记录任何竞争对手信息";
      nextAction = "调查客户同时评估的其他方案和供应商";
    } else if (competitorCount < 2) {
      status = "weak";
      reason = `仅掌握 ${competitorCount} 个竞争对手信息，可能有盲区`;
      evidence = competitorNames.length > 0 ? `已知：${competitorNames.join("、")}` : `${competitorCount} 个竞品`;
      nextAction = "补充竞品的产品能力对比和客户案例差异分析";
    } else {
      status = "strong";
      reason = `已掌握 ${competitorCount} 个竞争对手情报`;
      evidence = competitorNames.length > 0 ? competitorNames.join("、") : `${competitorCount} 个竞品已分析`;
      nextAction = "持续更新竞品动态，准备针对性的异议处理话术";
    }
    dims.push({ key: "proof", label: "竞争与证明", status, reason, evidence, nextAction });
  }

  return dims;
}

// ─── Build fallback health with dimensions ──────────────────────────

function buildFallbackHealth(
  accounts: { id: string; name: string }[],
  opportunities: FallbackOpp[],
): AccountHealth[] {
  const nowMs = Date.now();
  return accounts.map((acct) => {
    const acctOpps = opportunities.filter(
      (o) => o.accountId === acct.id && o.stage !== "closed_won" && o.stage !== "closed_lost"
    );
    const scores = acctOpps.map((o) => getMeddiccScore(o.meddicc)).filter((s) => s > 0);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 50;

    const findings: CILAccountHealthReport["lintFindings"] = [];
    let staleClaims = 0;
    let orphanCount = 0;
    let totalEvidence = 0;
    let linkedEvidence = 0;
    const missingPageTypes: string[] = [];

    for (const opp of acctOpps) {
      const m = opp.meddicc;
      if (!m) continue;

      const champDate = m.champion?.lastEngagement;
      if (champDate) {
        const daysSince = Math.floor((nowMs - new Date(champDate).getTime()) / 86400000);
        if (daysSince > 14) {
          staleClaims++;
          if (daysSince > 21) {
            findings.push({ checkType: "stale", severity: "critical", targetType: "claim", title: `Champion 互动已过期 ${daysSince} 天`, description: `上次接触 ${champDate}，超过3周无更新，关键判断可能已过时`, suggestedAction: "立即安排 Champion 沟通，刷新关键信息" });
          } else {
            findings.push({ checkType: "stale", severity: "warning", targetType: "claim", title: `Champion 互动趋于过期`, description: `距上次接触已 ${daysSince} 天，需尽快刷新`, suggestedAction: "安排近期沟通以确认决策进展" });
          }
        }
      }

      for (const step of m.decisionProcess ?? []) {
        if (step.status === "in_progress" && step.dueDate) {
          const due = new Date(step.dueDate).getTime();
          if (due < nowMs) {
            staleClaims++;
            findings.push({ checkType: "stale", severity: "warning", targetType: "claim", title: "决策流程节点已超期", description: `原定截止日 ${step.dueDate} 已过，流程可能延迟或变化`, suggestedAction: "确认该流程节点的最新状态和新时间线" });
          }
        }
      }

      const champStrength = m.champion?.strength ?? 0;
      const metricsConfirmed = m.metrics?.status === "confirmed";
      const ebEngaged = m.economicBuyer?.status === "engaged";
      if (champStrength >= 3 && !metricsConfirmed && m.metrics?.status === "unconfirmed") {
        findings.push({ checkType: "contradiction", severity: "critical", targetType: "claim", title: "Champion 乐观但价值指标未确认", description: "Champion 支持度高但价值指标尚未被客户确认，存在判断偏差风险", suggestedAction: "通过 Champion 推动价值指标确认会议" });
      }
      if (champStrength >= 3 && m.economicBuyer?.status === "unknown") {
        findings.push({ checkType: "contradiction", severity: "warning", targetType: "claim", title: "Champion 活跃但经济决策人未知", description: "有活跃 Champion 但尚未识别经济决策人，签单路径不清晰", suggestedAction: "通过 Champion 获取经济决策人信息和引荐" });
      }

      const pains = m.identifiedPain ?? [];
      const quantifiedPains = pains.filter((p) => p.quantified);
      totalEvidence += pains.length + (m.competition?.length ?? 0);
      if (metricsConfirmed || ebEngaged) {
        linkedEvidence += pains.length;
      } else {
        linkedEvidence += Math.max(0, pains.length - quantifiedPains.length);
        if (quantifiedPains.length > 0 && !metricsConfirmed) {
          orphanCount += quantifiedPains.length;
          findings.push({ checkType: "orphan_evidence", severity: "warning", targetType: "evidence", title: `${quantifiedPains.length} 条量化证据未关联到已确认指标`, description: "已收集量化痛点但价值指标维度未确认，证据未被充分利用", suggestedAction: "将量化痛点整合到价值指标确认材料中" });
        }
      }

      const dcEmpty = (m.decisionCriteria?.length ?? 0) === 0;
      const noCompetition = (m.competition?.length ?? 0) === 0;
      if (dcEmpty) missingPageTypes.push("决策标准");
      if (noCompetition) missingPageTypes.push("竞争情报");
      if (m.metrics?.status === "unconfirmed" && dcEmpty) {
        findings.push({ checkType: "critical_gap", severity: "critical", targetType: "account", title: "关键决策维度严重缺失", description: "价值指标未确认且决策标准为空，无法构建有效价值主张", suggestedAction: "优先获取客户决策标准和价值确认" });
      } else if (dcEmpty && m.economicBuyer?.status !== "engaged") {
        findings.push({ checkType: "critical_gap", severity: "warning", targetType: "account", title: "决策标准和经济决策人待补齐", description: "决策标准为空且经济决策人未深入接触", suggestedAction: "通过 Champion 获取评选标准细节" });
      }
    }

    if (acctOpps.length === 0) {
      findings.push({ checkType: "critical_gap", severity: "warning", targetType: "account", title: "无活跃商机", description: "该客户当前无进行中的商机", suggestedAction: "确认客户是否仍在跟进范围内" });
    }

    if (findings.length === 0 && avgScore < 35) {
      findings.push({ checkType: "unsupported", severity: "critical", targetType: "account", title: "MEDDICC 证据严重不足", description: "关键维度 Champion、决策流程、价值指标缺失", suggestedAction: "补齐关键证据：内部支持者、决策流程、价值指标" });
    }

    const seen = new Set<string>();
    const dedupedFindings = findings.filter((f) => {
      if (seen.has(f.title)) return false;
      seen.add(f.title);
      return true;
    });

    const stalePenalty = Math.min(staleClaims * 6, 20);
    const orphanPenalty = Math.min(orphanCount * 4, 12);
    const gapPenalty = dedupedFindings.filter((f) => f.checkType === "critical_gap").length * 5;
    const adjustedScore = Math.max(10, Math.min(100, avgScore - stalePenalty - orphanPenalty - gapPenalty));

    const activeCount = Math.max(scores.length, 1);
    const uniquePageTypes = [...new Set(missingPageTypes)];

    const dominantType = dedupedFindings.length > 0 ? dedupedFindings[0].checkType : "none";
    const summaryMap: Record<string, string> = {
      stale: `${acct.name} 多个关键信息已过期，需要刷新 Champion 和决策进展`,
      contradiction: `${acct.name} 存在信息矛盾——Champion 信号与决策数据不一致`,
      orphan_evidence: `${acct.name} 已收集证据未被有效关联，需整合到决策链路中`,
      critical_gap: `${acct.name} 关键决策维度严重缺失，需优先补齐基础信息`,
      unsupported: `${acct.name} 证据链薄弱，多个关键维度待补充`,
      none: `${acct.name} 整体健康度良好`,
    };

    // Build dimensions
    const dimensions = buildDimensionsFromOpps(acctOpps);

    return {
      accountId: acct.id,
      name: acct.name,
      dimensions,
      report: {
        accountId: acct.id,
        healthScore: adjustedScore,
        claimDistribution: { active: activeCount, stale: staleClaims, archived: 0, total: activeCount + staleClaims },
        evidenceCoverage: { total: Math.max(totalEvidence, 1), linked: linkedEvidence, orphaned: orphanCount },
        knowledgeFreshness: { freshPages: activeCount, stalePages: staleClaims, missingPageTypes: uniquePageTypes },
        lintFindings: dedupedFindings,
        refreshTargets: [],
        summary: summaryMap[dominantType] ?? summaryMap.none,
      } as CILAccountHealthReport,
      error: false,
    };
  });
}

// ─── Model gap type classification ──────────────────────────────────

type GapType = "认知盲区" | "证据薄弱" | "信息过期" | "模型完整";

function classifyGapType(dims: ModelDimension[]): { type: GapType; label: string } {
  const missingCount = dims.filter((d) => d.status === "missing").length;
  const staleCount = dims.filter((d) => d.status === "stale").length;
  const weakCount = dims.filter((d) => d.status === "weak").length;

  if (missingCount >= 2) return { type: "认知盲区", label: `${missingCount} 个维度完全缺失` };
  if (staleCount >= 2) return { type: "信息过期", label: `${staleCount} 个维度信息过期` };
  if (missingCount + staleCount >= 2) return { type: "认知盲区", label: `${missingCount} 缺失 + ${staleCount} 过期` };
  if (weakCount >= 2 || (weakCount >= 1 && (missingCount + staleCount) >= 1))
    return { type: "证据薄弱", label: `${weakCount + missingCount + staleCount} 个维度待补强` };
  if (missingCount === 1) return { type: "认知盲区", label: "1 个维度完全缺失" };
  if (staleCount === 1) return { type: "信息过期", label: "1 个维度信息过期" };
  if (weakCount === 1) return { type: "证据薄弱", label: "1 个维度证据不足" };
  return { type: "模型完整", label: "各维度理解充分" };
}

const GAP_TYPE_STYLE: Record<GapType, { bg: string; fg: string }> = {
  "认知盲区": { bg: "var(--dash-severity-critical-bg)", fg: "var(--dash-severity-critical)" },
  "信息过期": { bg: "var(--dash-severity-critical-bg)", fg: "var(--dash-severity-critical)" },
  "证据薄弱": { bg: "var(--dash-severity-warning-bg)", fg: "var(--dash-severity-warning)" },
  "模型完整": { bg: "var(--dash-severity-focus-bg)", fg: "var(--dash-health-good)" },
};

function DistributionSegment({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const width = total > 0 ? `${Math.max((count / total) * 100, count > 0 ? 8 : 0)}%` : '0%';

  if (count === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className="font-medium" style={{ color: 'var(--dash-text-secondary)' }}>
          {label}
        </span>
        <span className="tabular-nums font-semibold" style={{ color }}>
          {count}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--dash-card-divider)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ─── Account Model Card ─────────────────────────────────────────────

function AccountModelCard({ item }: { item: AccountHealth }) {
  const [expanded, setExpanded] = useState(false);
  const score = item.report?.healthScore ?? 0;
  const dims = item.dimensions;
  const weakDims = dims.filter((d) => d.status === "weak" || d.status === "missing" || d.status === "stale");
  const gap = classifyGapType(dims);
  const gapStyle = GAP_TYPE_STYLE[gap.type];

  const primaryWeak = weakDims.length > 0
    ? weakDims.sort((a, b) => {
        const pri: Record<DimensionStatus, number> = { missing: 0, stale: 1, weak: 2, strong: 3 };
        return pri[a.status] - pri[b.status];
      })[0]
    : null;

  return (
    <div
      className="rounded-2xl border transition-all duration-200"
      style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors rounded-2xl"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--dash-hover-bg)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <div className="flex flex-col items-center gap-2 pt-0.5">
          <HealthScoreRing score={score} size={52} />
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
            style={{
              backgroundColor:
                score >= 80 ? 'var(--dash-severity-focus-bg)' : score >= 50 ? 'var(--dash-severity-warning-bg)' : 'var(--dash-severity-critical-bg)',
              color:
                score >= 80 ? 'var(--dash-health-good)' : score >= 50 ? 'var(--dash-health-warn)' : 'var(--dash-health-bad)',
            }}
          >
            {score >= 80 ? '健康' : score >= 50 ? '待补强' : '高风险'}
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/accounts/${item.accountId}`}
                  className="text-[15px] font-semibold truncate hover:underline"
                  style={{ color: 'var(--dash-text-primary)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.name}
                </Link>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold flex-shrink-0"
                  style={{ backgroundColor: gapStyle.bg, color: gapStyle.fg }}
                >
                  {gap.type}
                </span>
                {weakDims.length > 0 && (
                  <span className="text-[10px] font-medium" style={{ color: 'var(--dash-text-tertiary)' }}>
                    {weakDims.length} 项待处理
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                  健康度排序
                </span>
                <div className="w-full max-w-[220px]">
                  <DimensionMiniBar dimensions={dims} />
                </div>
              </div>
            </div>

            <div
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200"
              style={{
                borderColor: expanded ? 'var(--dash-icon-accent)' : 'var(--dash-card-divider)',
                backgroundColor: expanded ? 'var(--dash-severity-focus-bg)' : 'transparent',
                color: expanded ? 'var(--dash-icon-accent)' : 'var(--dash-text-tertiary)',
              }}
            >
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            </div>
          </div>

          {primaryWeak ? (
            <div className="space-y-2">
              <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-subtle-bg, rgba(148,163,184,0.06))' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                    核心问题
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: gapStyle.fg }}>
                    {primaryWeak.label}{STATUS_LABELS[primaryWeak.status]}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-5" style={{ color: 'var(--dash-text-secondary)' }}>
                  {primaryWeak.reason}
                </p>
              </div>

              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--dash-card-divider)' }}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                      依据
                    </p>
                    <p className="mt-1 text-[11px] leading-5" style={{ color: 'var(--dash-text-secondary)' }}>
                      {primaryWeak.evidence}
                    </p>
                  </div>
                  <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--dash-card-divider)' }}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                      建议动作
                    </p>
                    <div className="mt-1 flex items-start gap-1.5">
                      <ArrowRight className="mt-0.5 h-3 w-3 flex-shrink-0" style={{ color: gapStyle.fg }} />
                      <span className="text-[11px] font-medium leading-5" style={{ color: gapStyle.fg }}>
                        {primaryWeak.nextAction}
                      </span>
                    </div>
                  </div>
                </div>

                {weakDims.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 lg:max-w-[220px] lg:justify-end">
                    {weakDims.slice(1, 4).map((d) => {
                      const cfg = DIMENSION_CONFIG[d.key];
                      const Icon = cfg?.icon ?? Shield;
                      const isCritical = d.status === "missing" || d.status === "stale";
                      return (
                        <span
                          key={d.key}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                          style={{
                            backgroundColor: isCritical ? 'var(--dash-severity-critical-bg)' : 'var(--dash-severity-warning-bg)',
                            color: isCritical ? 'var(--dash-severity-critical)' : 'var(--dash-severity-warning)',
                          }}
                        >
                          <Icon className="h-3 w-3" />
                          {d.label}{STATUS_LABELS[d.status]}
                        </span>
                      );
                    })}
                    {weakDims.length > 4 && (
                      <span className="text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                        +{weakDims.length - 4} 项
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl px-3 py-3" style={{ backgroundColor: 'var(--dash-severity-focus-bg)' }}>
              <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--dash-health-good)' }} />
              <span className="text-[12px] font-medium" style={{ color: 'var(--dash-health-good)' }}>
                模型完整，7 个理解维度证据链充分
              </span>
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--dash-card-divider)' }}>
          <div className="pt-3 space-y-2">
            {dims.map((d) => {
              const cfg = DIMENSION_CONFIG[d.key];
              const Icon = cfg?.icon ?? Shield;
              const isBad = d.status === "missing" || d.status === "stale";
              const isWeak = d.status === "weak";

              return (
                <div
                  key={d.key}
                  className="rounded-lg px-2.5 py-2"
                  style={{
                    backgroundColor: isBad
                      ? 'var(--dash-severity-critical-bg)'
                      : isWeak
                        ? 'var(--dash-severity-warning-bg)'
                        : 'var(--dash-severity-focus-bg)',
                  }}
                >
                  {/* Dimension header */}
                  <div className="flex items-center gap-2 mb-1">
                    <Icon
                      className="h-3.5 w-3.5 flex-shrink-0"
                      style={{
                        color: isBad
                          ? 'var(--dash-severity-critical)'
                          : isWeak
                            ? 'var(--dash-severity-warning)'
                            : 'var(--dash-health-good)',
                      }}
                    />
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
                      {d.label}
                    </span>
                    <DimensionDot status={d.status} />
                    <span
                      className="text-[10px] font-medium"
                      style={{
                        color: isBad
                          ? 'var(--dash-severity-critical)'
                          : isWeak
                            ? 'var(--dash-severity-warning)'
                            : 'var(--dash-health-good)',
                      }}
                    >
                      {STATUS_LABELS[d.status]}
                    </span>
                  </div>

                  {/* Reason */}
                  <p className="text-[11px] leading-relaxed mb-0.5" style={{ color: 'var(--dash-text-secondary)' }}>
                    {d.reason}
                  </p>

                  {/* Evidence basis */}
                  <p className="text-[10px] mb-1" style={{ color: 'var(--dash-text-tertiary)' }}>
                    推导依据：{d.evidence}
                  </p>

                  {/* Next action */}
                  {(isBad || isWeak) && (
                    <div className="flex items-center gap-1">
                      <ArrowRight
                        className="h-2.5 w-2.5 flex-shrink-0"
                        style={{
                          color: isBad ? 'var(--dash-severity-critical)' : 'var(--dash-severity-warning)',
                        }}
                      />
                      <span
                        className="text-[10px] font-medium"
                        style={{
                          color: isBad ? 'var(--dash-severity-critical)' : 'var(--dash-severity-warning)',
                        }}
                      >
                        {d.nextAction}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary line */}
          {item.report?.summary && (
            <p className="text-[11px] pt-1 px-1" style={{ color: 'var(--dash-text-tertiary)' }}>
              {item.report.summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function CILPortfolioHealth({ accounts }: CILPortfolioHealthProps) {
  const [healthData, setHealthData] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const opportunities = useStore((s) => s.opportunities);
  const hasLoadedRef = useRef(false);
  const cacheKey = useMemo(() => buildCacheKey(accounts), [accounts]);

  useEffect(() => {
    if (typeof window === "undefined" || accounts.length === 0) return;

    try {
      const cached = window.sessionStorage.getItem(cacheKey);
      if (!cached) return;

      const parsed = JSON.parse(cached) as AccountHealth[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;

      const timer = window.setTimeout(() => {
        setHealthData(parsed);
        setLoading(false);
        hasLoadedRef.current = true;
      }, 0);

      return () => window.clearTimeout(timer);
    } catch {
      window.sessionStorage.removeItem(cacheKey);
    }
  }, [accounts.length, cacheKey]);

  const fetchAll = useCallback(async () => {
    if (accounts.length === 0) {
      setHealthData([]);
      setLoading(false);
      return;
    }

    // On subsequent fetches (data already loaded), use refreshing instead of full loading
    if (hasLoadedRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/cil-explain-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: accounts.map((a) => a.id) }),
      });

      if (!res.ok) {
        const fallback = buildFallbackHealth(accounts, opportunities);
        setHealthData(fallback);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(fallback));
        }
        setLoading(false);
        setRefreshing(false);
        hasLoadedRef.current = true;
        return;
      }

      const json = await res.json() as { reports: Record<string, CILAccountHealthReport | null> };
      const hasAnyReport = Object.values(json.reports).some((r) => r !== null);
      if (!hasAnyReport) {
        const fallback = buildFallbackHealth(accounts, opportunities);
        setHealthData(fallback);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(cacheKey, JSON.stringify(fallback));
        }
        setLoading(false);
        setRefreshing(false);
        hasLoadedRef.current = true;
        return;
      }

      // API returned real reports — enrich with dimensions from opp data
      const data: AccountHealth[] = accounts.map((acct) => {
        const acctOpps = opportunities.filter(
          (o) => o.accountId === acct.id && o.stage !== "closed_won" && o.stage !== "closed_lost"
        );
        return {
          accountId: acct.id,
          name: acct.name,
          report: json.reports[acct.id] ?? null,
          dimensions: buildDimensionsFromOpps(acctOpps),
          error: false,
        };
      });

      setHealthData(data);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch {
      const fallback = buildFallbackHealth(accounts, opportunities);
      setHealthData(fallback);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(cacheKey, JSON.stringify(fallback));
      }
    }

    setLoading(false);
    setRefreshing(false);
    hasLoadedRef.current = true;
  }, [accounts, opportunities, cacheKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchAll();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchAll]);

  const withReports = healthData.filter((d) => d.report !== null);

  const avgScore =
    withReports.length > 0
      ? Math.round(
          withReports.reduce((sum, d) => sum + (d.report?.healthScore ?? 0), 0) /
            withReports.length
        )
      : 0;

  // Portfolio-level dimension weakness summary
  const portfolioDimSummary = useMemo(() => {
    if (withReports.length === 0) return [];
    const dimCounts: Record<string, { weak: number; missing: number; stale: number; total: number }> = {};
    for (const item of withReports) {
      for (const d of item.dimensions) {
        if (!dimCounts[d.key]) dimCounts[d.key] = { weak: 0, missing: 0, stale: 0, total: 0 };
        dimCounts[d.key].total++;
        if (d.status === "missing") { dimCounts[d.key].weak++; dimCounts[d.key].missing++; }
        else if (d.status === "stale") { dimCounts[d.key].weak++; dimCounts[d.key].stale++; }
        else if (d.status === "weak") dimCounts[d.key].weak++;
      }
    }
    return Object.entries(dimCounts)
      .map(([key, counts]) => ({
        key,
        label: DIMENSION_CONFIG[key]?.label ?? key,
        icon: DIMENSION_CONFIG[key]?.icon ?? Shield,
        weakCount: counts.weak,
        missingCount: counts.missing,
        staleCount: counts.stale,
        total: counts.total,
        weakPct: Math.round((counts.weak / counts.total) * 100),
      }))
      .sort((a, b) => b.weakPct - a.weakPct);
  }, [withReports]);

  const topWeakDims = portfolioDimSummary.filter((d) => d.weakPct > 30);

  // Portfolio gap type distribution
  const gapTypeDist = useMemo(() => {
    const counts: Record<GapType, number> = { "认知盲区": 0, "证据薄弱": 0, "信息过期": 0, "模型完整": 0 };
    for (const item of withReports) {
      const gap = classifyGapType(item.dimensions);
      counts[gap.type]++;
    }
    return counts;
  }, [withReports]);

  const totalCritical = withReports.reduce(
    (sum, d) =>
      sum + (d.report?.lintFindings.filter((f) => f.severity === "critical").length ?? 0),
    0
  );

  const totalWarning = withReports.reduce(
    (sum, d) =>
      sum + (d.report?.lintFindings.filter((f) => f.severity === "warning").length ?? 0),
    0
  );

  const sortedAccounts = [...healthData]
    .filter((d) => d.report !== null)
    .sort((a, b) => (a.report?.healthScore ?? 0) - (b.report?.healthScore ?? 0));

  return (
    <div className="flex flex-col overflow-visible rounded-2xl border shadow-[var(--dash-card-shadow)] 2xl:overflow-hidden" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--dash-card-divider)' }}>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: 'var(--dash-icon-accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
            CIL 客户模型健康度
          </h3>
          {withReports.length > 0 && (
            <span className="ml-1 text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>
              {withReports.length} 个客户
            </span>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={loading || refreshing}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-40"
          style={{ color: 'var(--dash-text-secondary)' }}
        >
          <RefreshCw className={`h-3 w-3 ${loading || refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <PortfolioSkeleton />
      ) : accounts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="min-h-0 space-y-5 p-4 sm:p-5">
          <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-subtle-bg, rgba(148,163,184,0.06))' }}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <HealthScoreRing score={avgScore} size={88} />
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
                        客户组合洞察
                      </p>
                      {withReports.length > 0 && (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold"
                          style={{
                            backgroundColor:
                              avgScore >= 80 ? "var(--dash-severity-focus-bg)" : avgScore >= 50 ? "var(--dash-severity-warning-bg)" : "var(--dash-severity-critical-bg)",
                            color:
                              avgScore >= 80 ? "var(--dash-health-good)" : avgScore >= 50 ? "var(--dash-health-warn)" : "var(--dash-health-bad)",
                          }}
                        >
                          {avgScore >= 80 ? "模型充分" : avgScore >= 50 ? "理解待补" : "认知不足"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm" style={{ color: 'var(--dash-text-secondary)' }}>
                      按健康度排序，优先聚焦低分客户，并结合证据缺口决定下一步动作。
                    </p>
                  </div>

                  {withReports.length > 0 && (
                    <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-card-bg)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                          问题分布
                        </p>
                        <span className="text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                          共 {withReports.length} 个客户
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <DistributionSegment
                          label="认知盲区"
                          count={gapTypeDist["认知盲区"]}
                          total={withReports.length}
                          color="var(--dash-severity-critical)"
                        />
                        <DistributionSegment
                          label="信息过期"
                          count={gapTypeDist["信息过期"]}
                          total={withReports.length}
                          color="var(--dash-severity-critical)"
                        />
                        <DistributionSegment
                          label="证据薄弱"
                          count={gapTypeDist["证据薄弱"]}
                          total={withReports.length}
                          color="var(--dash-severity-warning)"
                        />
                        <DistributionSegment
                          label="模型完整"
                          count={gapTypeDist["模型完整"]}
                          total={withReports.length}
                          color="var(--dash-health-good)"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:min-w-[240px] xl:w-[260px]">
                <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-card-bg)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                    客户数
                  </p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
                    {withReports.length}
                  </p>
                </div>
                <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-card-bg)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                    待处理项
                  </p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--dash-text-primary)' }}>
                    {totalCritical + totalWarning}
                  </p>
                </div>
                <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-card-bg)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                    高优先问题
                  </p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--dash-health-bad)' }}>
                    {totalCritical}
                  </p>
                </div>
                <div className="rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-card-bg)' }}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                    一般提醒
                  </p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: 'var(--dash-health-warn)' }}>
                    {totalWarning}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border px-3 py-3" style={{ borderColor: 'var(--dash-card-divider)', backgroundColor: 'var(--dash-card-bg)' }}>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: 'var(--dash-text-tertiary)' }}>
                组合普遍薄弱的理解维度
              </p>
              {topWeakDims.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                  {topWeakDims.slice(0, 4).map((d) => {
                    const Icon = d.icon;
                    const isBad = d.weakPct >= 60;
                    const detailParts: string[] = [];
                    if (d.missingCount > 0) detailParts.push(`${d.missingCount} 缺失`);
                    if (d.staleCount > 0) detailParts.push(`${d.staleCount} 过期`);
                    const onlyWeakCount = d.weakCount - d.missingCount - d.staleCount;
                    if (onlyWeakCount > 0) detailParts.push(`${onlyWeakCount} 薄弱`);
                    return (
                      <div key={d.key} className="flex items-center gap-3">
                        <div className="flex w-24 items-center gap-2">
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: isBad ? 'var(--dash-severity-critical)' : 'var(--dash-severity-warning)' }} />
                          <span className="text-[11px] truncate" style={{ color: 'var(--dash-text-secondary)' }}>
                            {d.label}
                          </span>
                        </div>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--dash-card-divider)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${d.weakPct}%`,
                              backgroundColor: isBad ? 'var(--dash-health-bad)' : 'var(--dash-health-warn)',
                            }}
                          />
                        </div>
                        <span
                          className="text-[10px] tabular-nums font-medium w-20 sm:w-28 text-right"
                          style={{ color: isBad ? 'var(--dash-severity-critical)' : 'var(--dash-severity-warning)' }}
                        >
                          {detailParts.join(' · ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : withReports.length > 0 ? (
                <p className="mt-3 text-sm" style={{ color: 'var(--dash-text-tertiary)' }}>
                  客户组合各理解维度整体充分，无普遍薄弱环节
                </p>
              ) : (
                <p className="mt-3 text-sm" style={{ color: 'var(--dash-text-tertiary)' }}>暂无健康数据</p>
              )}
            </div>
          </div>

          {sortedAccounts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dash-text-tertiary)' }}>
                  健康度排序
                </h4>
                <p className="text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}>
                  更低分的客户排在前面
                </p>
              </div>
              <div className="space-y-3 overflow-visible 2xl:max-h-[420px] 2xl:overflow-y-auto 2xl:pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                {sortedAccounts.map((item) => (
                  <AccountModelCard key={item.accountId} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
