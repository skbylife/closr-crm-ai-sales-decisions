"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  FileSearch,
  Clock3,
  CheckCircle2,
  Users,
  DollarSign,
  ListChecks,
  Target,
  Flame,
  Swords,
  Crown,
  Database,
  Mail,
  Brain,
  FileText,
} from "lucide-react";
import type { Opportunity } from "@/lib/babel-engine/types";
import type { CILAccountHealthReport } from "@/lib/compiled-intelligence/explain";
import { getMeddiccScore } from "@/lib/meddicc";
import { useStore } from "@/lib/store";
import {
  buildEvidenceClaims,
  type EvidenceSourceType,
} from "@/components/dashboard/evidence-traceability-rail";

// ─── Reused types from cil-portfolio-health ──────────────────────────

type DimensionStatus = "strong" | "weak" | "missing" | "stale";

interface ModelDimension {
  key: string;
  label: string;
  status: DimensionStatus;
  reason: string;
  evidence: string;
  nextAction: string;
}

interface AccountHealth {
  accountId: string;
  name: string;
  report: CILAccountHealthReport | null;
  dimensions: ModelDimension[];
  error: boolean;
}

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

// ─── Dimension config ────────────────────────────────────────────────

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
  strong: "充分", weak: "薄弱", missing: "缺失", stale: "过期",
};

const SOURCE_LABELS: Record<EvidenceSourceType, { label: string; icon: typeof Database }> = {
  cil_lint: { label: "CIL 智能分析", icon: Brain },
  meddicc_rule: { label: "MEDDICC 规则", icon: FileText },
  account_health: { label: "账户画像", icon: Database },
  task_rule: { label: "执行节奏", icon: Mail },
};

// ─── Mini helpers (from cil-portfolio-health) ────────────────────────

function HealthScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const strokeWidth = size > 48 ? 7 : 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;
  const color = score >= 80 ? "var(--dash-health-good)" : score >= 50 ? "var(--dash-health-warn)" : "var(--dash-health-bad)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--dash-card-border)" strokeWidth={strokeWidth} opacity={0.4} />
        <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference - progress} className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold tabular-nums" style={{ fontSize: size > 48 ? 20 : 11, color: 'var(--dash-text-primary)' }}>{score}</span>
        {size > 48 && <span className="text-[10px]" style={{ color: 'var(--dash-text-tertiary)' }}>/ 100</span>}
      </div>
    </div>
  );
}

function DimensionMiniBar({ dimensions }: { dimensions: ModelDimension[] }) {
  return (
    <div className="flex items-center gap-1">
      {dimensions.map((d) => {
        const colorMap: Record<DimensionStatus, string> = { strong: "var(--dash-health-good)", weak: "var(--dash-health-warn)", missing: "var(--dash-health-bad)", stale: "var(--dash-health-bad)" };
        return <div key={d.key} className="h-2 flex-1 rounded-full transition-all duration-500" style={{ backgroundColor: colorMap[d.status] }} title={`${d.label}: ${STATUS_LABELS[d.status]}`} />;
      })}
    </div>
  );
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

// ─── buildDimensionsFromOpps (copied from cil-portfolio-health) ──────

function buildDimensionsFromOpps(acctOpps: FallbackOpp[]): ModelDimension[] {
  const nowMs = Date.now();
  const dims: ModelDimension[] = [];

  let bestChampStrength = 0; let champLastDate = ""; let champNotes = "";
  let metricsStatus = "unconfirmed"; let metricsEvidence = "";
  let ebStatus = "unknown"; let ebAccess = "";
  let dcCount = 0;
  let dpSteps: Array<{ status?: string; dueDate?: string }> = [];
  let painCount = 0; let quantifiedPainCount = 0; const painDescriptions: string[] = [];
  let competitorCount = 0; const competitorNames: string[] = [];

  for (const opp of acctOpps) {
    const m = opp.meddicc; if (!m) continue;
    if ((m.champion?.strength ?? 0) > bestChampStrength) { bestChampStrength = m.champion?.strength ?? 0; champLastDate = m.champion?.lastEngagement ?? ""; champNotes = m.champion?.notes ?? ""; }
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
    for (const p of m.identifiedPain ?? []) { if ((p as { description?: string }).description) painDescriptions.push((p as { description?: string }).description!); }
    competitorCount += m.competition?.length ?? 0;
    for (const c of m.competition ?? []) { if ((c as { name?: string }).name) competitorNames.push((c as { name?: string }).name!); }
  }

  // Champion
  { const champDaysSince = champLastDate ? Math.floor((nowMs - new Date(champLastDate).getTime()) / 86400000) : Infinity;
    let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (bestChampStrength === 0) { status = "missing"; reason = "尚未识别任何内部支持者"; evidence = "所有商机中均未记录 Champion 信息"; nextAction = "通过现有联系人关系图谱，识别并发展潜在内部支持者"; }
    else if (champDaysSince > 21) { status = "stale"; reason = `Champion 最后互动距今 ${champDaysSince} 天`; evidence = champNotes ? `最近备注：${champNotes}` : `最后接触日期：${champLastDate}`; nextAction = "立即安排 Champion 沟通，刷新决策进展和组织动态"; }
    else if (bestChampStrength < 3) { status = "weak"; reason = `Champion 支持度偏低（${bestChampStrength}/5）`; evidence = champNotes ? `当前状态：${champNotes}` : `支持度评分 ${bestChampStrength}/5`; nextAction = "加深与 Champion 的合作关系，提供更多内部说服材料"; }
    else { status = "strong"; reason = `Champion 活跃（支持度 ${bestChampStrength}/5）`; evidence = champNotes || "互动频率正常"; nextAction = "保持沟通节奏，通过 Champion 推进其他维度"; }
    dims.push({ key: "champion", label: "内部支持者", status, reason, evidence, nextAction });
  }
  // Economic Buyer
  { let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (ebStatus === "unknown") { status = "missing"; reason = "经济决策人尚未识别"; evidence = "所有商机中均未明确经济决策人"; nextAction = "通过 Champion 或高层接触获取经济决策人身份"; }
    else if (ebStatus === "identified") { status = "weak"; reason = "已识别经济决策人但尚未深入接触"; evidence = ebAccess ? `当前接触层级：${ebAccess}` : "已知身份但无深入互动"; nextAction = "争取与经济决策人的直接会面或汇报机会"; }
    else { status = "strong"; reason = "经济决策人已深入接触"; evidence = ebAccess ? `接触层级：${ebAccess}` : "已建立有效沟通渠道"; nextAction = "维护关系，确保经济决策人持续支持预算推进"; }
    dims.push({ key: "economic_buyer", label: "经济决策人", status, reason, evidence, nextAction });
  }
  // Metrics
  { let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (metricsStatus === "unconfirmed") { status = "missing"; reason = "价值指标未被客户确认"; evidence = metricsEvidence || "暂无客户认可的量化指标"; nextAction = "与客户共同定义成功指标和量化收益框架"; }
    else if (metricsStatus === "partial") { status = "weak"; reason = "部分指标已确认，但量化论证不够完整"; evidence = metricsEvidence || "存在部分指标但未完全确认"; nextAction = "补充剩余关键指标的量化数据和客户确认"; }
    else { status = "strong"; reason = "价值指标已获客户确认"; evidence = metricsEvidence || "指标体系完整且已确认"; nextAction = "将确认的指标融入提案和商务谈判材料"; }
    dims.push({ key: "metrics", label: "价值指标", status, reason, evidence, nextAction });
  }
  // Decision Criteria
  { let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (dcCount === 0) { status = "missing"; reason = "未掌握客户决策标准"; evidence = "客户评选标准完全未知"; nextAction = "通过 Champion 或客户会议获取评选标准和权重"; }
    else if (dcCount < 3) { status = "weak"; reason = `仅掌握 ${dcCount} 项决策标准`; evidence = `已记录 ${dcCount} 条标准`; nextAction = "深入了解客户的技术、商务、合规等各维度评选要求"; }
    else { status = "strong"; reason = `已掌握 ${dcCount} 项决策标准`; evidence = `覆盖 ${dcCount} 个评选维度`; nextAction = "确认标准权重排序，确保方案精准对标"; }
    dims.push({ key: "decision_criteria", label: "决策标准", status, reason, evidence, nextAction });
  }
  // Decision Process
  { const overdueSteps = dpSteps.filter((s) => s.status === "in_progress" && s.dueDate && new Date(s.dueDate).getTime() < nowMs);
    let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (dpSteps.length === 0) { status = "missing"; reason = "决策流程未梳理"; evidence = "未记录任何决策节点"; nextAction = "梳理客户内部审批流程各环节"; }
    else if (overdueSteps.length > 0) { status = "stale"; reason = `${overdueSteps.length} 个流程节点已超期`; evidence = `超期节点截止日：${overdueSteps.map((s) => s.dueDate).join("、")}`; nextAction = "确认超期节点的最新状态，更新项目时间线"; }
    else { status = "strong"; reason = `已梳理 ${dpSteps.length} 个决策节点`; evidence = `${dpSteps.filter((s) => s.status === "in_progress").length} 个进行中`; nextAction = "持续跟踪各节点进展，预判风险"; }
    dims.push({ key: "decision_process", label: "决策流程", status, reason, evidence, nextAction });
  }
  // Why Now
  { let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (painCount === 0) { status = "missing"; reason = "未识别客户痛点"; evidence = "暂无痛点记录"; nextAction = "深入了解客户业务现状，挖掘核心痛点和改变的驱动力"; }
    else if (quantifiedPainCount === 0) { status = "weak"; reason = `已识别 ${painCount} 个痛点但均未量化`; evidence = painDescriptions.length > 0 ? `已知痛点：${painDescriptions.slice(0, 2).join("；")}` : `${painCount} 个定性痛点`; nextAction = "将痛点量化，构建 Why Now 论述"; }
    else { status = "strong"; reason = `${quantifiedPainCount}/${painCount} 个痛点已量化`; evidence = painDescriptions.length > 0 ? painDescriptions.slice(0, 2).join("；") : `${quantifiedPainCount} 条量化数据`; nextAction = "将量化痛点整合到价值提案和 ROI 模型中"; }
    dims.push({ key: "why_now", label: "紧迫性", status, reason, evidence, nextAction });
  }
  // Proof
  { let status: DimensionStatus, reason: string, evidence: string, nextAction: string;
    if (competitorCount === 0) { status = "missing"; reason = "竞争情报为空"; evidence = "未记录任何竞争对手信息"; nextAction = "调查客户同时评估的其他方案和供应商"; }
    else if (competitorCount < 2) { status = "weak"; reason = `仅掌握 ${competitorCount} 个竞争对手信息`; evidence = competitorNames.length > 0 ? `已知：${competitorNames.join("、")}` : `${competitorCount} 个竞品`; nextAction = "补充竞品的产品能力对比和客户案例差异分析"; }
    else { status = "strong"; reason = `已掌握 ${competitorCount} 个竞争对手情报`; evidence = competitorNames.length > 0 ? competitorNames.join("、") : `${competitorCount} 个竞品已分析`; nextAction = "持续更新竞品动态，准备针对性的异议处理话术"; }
    dims.push({ key: "proof", label: "竞争与证明", status, reason, evidence, nextAction });
  }
  return dims;
}

// ─── Build fallback health ───────────────────────────────────────────

function buildFallbackHealth(accounts: { id: string; name: string }[], opportunities: FallbackOpp[]): AccountHealth[] {
  const nowMs = Date.now();
  return accounts.map((acct) => {
    const acctOpps = opportunities.filter((o) => o.accountId === acct.id && o.stage !== "closed_won" && o.stage !== "closed_lost");
    const scores = acctOpps.map((o) => getMeddiccScore(o.meddicc)).filter((s) => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 50;

    const findings: CILAccountHealthReport["lintFindings"] = [];
    let staleClaims = 0, orphanCount = 0, totalEvidence = 0, linkedEvidence = 0;
    const missingPageTypes: string[] = [];

    for (const opp of acctOpps) {
      const m = opp.meddicc; if (!m) continue;
      const champDate = m.champion?.lastEngagement;
      if (champDate) {
        const daysSince = Math.floor((nowMs - new Date(champDate).getTime()) / 86400000);
        if (daysSince > 14) { staleClaims++; findings.push(daysSince > 21 ? { checkType: "stale", severity: "critical", targetType: "claim", title: `Champion 互动已过期 ${daysSince} 天`, description: `上次接触 ${champDate}`, suggestedAction: "立即安排 Champion 沟通" } : { checkType: "stale", severity: "warning", targetType: "claim", title: "Champion 互动趋于过期", description: `距上次接触已 ${daysSince} 天`, suggestedAction: "安排近期沟通" }); }
      }
      for (const step of m.decisionProcess ?? []) {
        if (step.status === "in_progress" && step.dueDate && new Date(step.dueDate).getTime() < nowMs) { staleClaims++; findings.push({ checkType: "stale", severity: "warning", targetType: "claim", title: "决策流程节点已超期", description: `原定截止日 ${step.dueDate} 已过`, suggestedAction: "确认该流程节点的最新状态" }); }
      }
      const pains = m.identifiedPain ?? [];
      const quantifiedPains = pains.filter((p) => p.quantified);
      totalEvidence += pains.length + (m.competition?.length ?? 0);
      const metricsConfirmed = m.metrics?.status === "confirmed";
      const ebEngaged = m.economicBuyer?.status === "engaged";
      if (metricsConfirmed || ebEngaged) { linkedEvidence += pains.length; } else { linkedEvidence += Math.max(0, pains.length - quantifiedPains.length); if (quantifiedPains.length > 0 && !metricsConfirmed) { orphanCount += quantifiedPains.length; } }
      if ((m.decisionCriteria?.length ?? 0) === 0) missingPageTypes.push("决策标准");
      if ((m.competition?.length ?? 0) === 0) missingPageTypes.push("竞争情报");
    }

    if (findings.length === 0 && avgScore < 35) {
      findings.push({ checkType: "unsupported", severity: "critical", targetType: "account", title: "MEDDICC 证据严重不足", description: "关键维度缺失", suggestedAction: "补齐关键证据" });
    }

    const seen = new Set<string>();
    const dedupedFindings = findings.filter((f) => { if (seen.has(f.title)) return false; seen.add(f.title); return true; });
    const stalePenalty = Math.min(staleClaims * 6, 20);
    const orphanPenalty = Math.min(orphanCount * 4, 12);
    const gapPenalty = dedupedFindings.filter((f) => f.checkType === "critical_gap").length * 5;
    const adjustedScore = Math.max(10, Math.min(100, avgScore - stalePenalty - orphanPenalty - gapPenalty));
    const activeCount = Math.max(scores.length, 1);
    const uniquePageTypes = [...new Set(missingPageTypes)];

    return {
      accountId: acct.id, name: acct.name, dimensions: buildDimensionsFromOpps(acctOpps), error: false,
      report: { accountId: acct.id, healthScore: adjustedScore, claimDistribution: { active: activeCount, stale: staleClaims, archived: 0, total: activeCount + staleClaims }, evidenceCoverage: { total: Math.max(totalEvidence, 1), linked: linkedEvidence, orphaned: orphanCount }, knowledgeFreshness: { freshPages: activeCount, stalePages: staleClaims, missingPageTypes: uniquePageTypes }, lintFindings: dedupedFindings, refreshTargets: [], summary: "" } as CILAccountHealthReport,
    };
  });
}

// ─── Gap classification ──────────────────────────────────────────────

type GapType = "认知盲区" | "证据薄弱" | "信息过期" | "模型完整";

function classifyGapType(dims: ModelDimension[]): { type: GapType; label: string } {
  const missingCount = dims.filter((d) => d.status === "missing").length;
  const staleCount = dims.filter((d) => d.status === "stale").length;
  const weakCount = dims.filter((d) => d.status === "weak").length;
  if (missingCount >= 2) return { type: "认知盲区", label: `${missingCount} 个维度完全缺失` };
  if (staleCount >= 2) return { type: "信息过期", label: `${staleCount} 个维度信息过期` };
  if (missingCount + staleCount >= 2) return { type: "认知盲区", label: `${missingCount} 缺失 + ${staleCount} 过期` };
  if (weakCount >= 2 || (weakCount >= 1 && (missingCount + staleCount) >= 1)) return { type: "证据薄弱", label: `${weakCount + missingCount + staleCount} 个维度待补强` };
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

// ─── Evidence claim severity styles ──────────────────────────────────

const CLAIM_STYLES = {
  critical: { badge: "bg-[var(--dash-severity-critical-bg)] text-[var(--dash-severity-critical-dark)] border-[var(--dash-severity-critical-border)]", strip: "bg-[var(--dash-severity-critical)]", icon: ShieldAlert },
  warning:  { badge: "bg-[var(--dash-severity-warning-bg)] text-[var(--dash-severity-warning-dark)] border-[var(--dash-severity-warning-border)]", strip: "bg-[var(--dash-severity-warning)]", icon: AlertTriangle },
  focus:    { badge: "bg-[var(--dash-severity-focus-bg)] text-[var(--dash-severity-focus)] border-[var(--dash-severity-focus-border)]", strip: "bg-[var(--dash-severity-focus)]", icon: FileSearch },
} as const;

// ─── Props ───────────────────────────────────────────────────────────

interface UnifiedPortfolioInsightsProps {
  accounts: { id: string; name: string }[];
  riskDeals: Opportunity[];
  riskAccounts: Array<{ id: string; name: string; dealHealth?: string }>;
  overdueTaskCount: number;
}

// ─── Main Component ──────────────────────────────────────────────────

export function UnifiedPortfolioInsights({
  accounts,
  riskDeals,
  riskAccounts,
  overdueTaskCount,
}: UnifiedPortfolioInsightsProps) {
  const [healthData, setHealthData] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"health" | "claims">("health");
  const opportunities = useStore((s) => s.opportunities);
  const hasLoadedRef = useRef(false);

  // ── Fetch CIL health data ──
  const fetchAll = useCallback(async (forceRefresh = false) => {
    if (accounts.length === 0) { setHealthData([]); setLoading(false); return; }
    if (hasLoadedRef.current) setRefreshing(true); else setLoading(true);

    try {
      const res = await fetch("/api/cil-explain-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: accounts.map((a) => a.id), forceRefresh }),
      });
      if (!res.ok) throw new Error("fetch failed");

      const json = await res.json() as { reports: Record<string, CILAccountHealthReport | null> };
      // A valid report must have a healthScore; empty objects ({}) from cache are not valid
      const isValidReport = (r: unknown): r is CILAccountHealthReport =>
        r !== null && typeof r === 'object' && 'healthScore' in (r as Record<string, unknown>);
      const hasAnyReport = Object.values(json.reports).some(isValidReport);

      if (!hasAnyReport) {
        setHealthData(buildFallbackHealth(accounts, opportunities));
      } else {
        // For accounts with valid CIL reports use them; otherwise fallback to MEDDICC-based scoring
        const fallback = buildFallbackHealth(accounts, opportunities);
        const fallbackMap = Object.fromEntries(fallback.map((f) => [f.accountId, f]));
        setHealthData(accounts.map((acct) => {
          const cilReport = json.reports[acct.id];
          if (isValidReport(cilReport)) {
            const acctOpps = opportunities.filter((o) => o.accountId === acct.id && o.stage !== "closed_won" && o.stage !== "closed_lost");
            return { accountId: acct.id, name: acct.name, report: cilReport, dimensions: buildDimensionsFromOpps(acctOpps), error: false };
          }
          // No valid CIL report for this account — use MEDDICC fallback
          return fallbackMap[acct.id] ?? { accountId: acct.id, name: acct.name, report: null, dimensions: [], error: false };
        }));
      }
    } catch {
      setHealthData(buildFallbackHealth(accounts, opportunities));
    }
    setLoading(false); setRefreshing(false); hasLoadedRef.current = true;
  }, [accounts, opportunities]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── CIL reports for evidence claims ──
  const cilReports = useMemo(() => {
    const map: Record<string, CILAccountHealthReport | null> = {};
    for (const item of healthData) { map[item.accountId] = item.report; }
    return map;
  }, [healthData]);

  // ── Evidence claims ──
  const claims = useMemo(() => buildEvidenceClaims({ riskDeals, riskAccounts, overdueTaskCount, cilReports, accounts }), [riskDeals, riskAccounts, overdueTaskCount, cilReports, accounts]);

  // Auto-expand first claim
  useEffect(() => { if (claims.length > 0 && expandedClaimId === null) setExpandedClaimId(claims[0].id); }, [claims, expandedClaimId]);

  // ── Derived data ──
  const withReports = healthData.filter((d) => d.report !== null);
  const avgScore = withReports.length > 0 ? Math.round(withReports.reduce((sum, d) => sum + (d.report?.healthScore ?? 0), 0) / withReports.length) : 0;
  const sortedAccounts = [...withReports].sort((a, b) => (a.report?.healthScore ?? 0) - (b.report?.healthScore ?? 0));

  const gapTypeDist = useMemo(() => {
    const counts: Record<GapType, number> = { "认知盲区": 0, "证据薄弱": 0, "信息过期": 0, "模型完整": 0 };
    for (const item of withReports) { counts[classifyGapType(item.dimensions).type]++; }
    return counts;
  }, [withReports]);

  if (loading) {
    return (
      <div className="rounded-2xl border shadow-[var(--dash-card-shadow)] p-5" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full skeleton" />
          <div className="flex-1 space-y-2"><div className="h-4 w-32 rounded skeleton" /><div className="h-3 w-48 rounded skeleton" /></div>
        </div>
        <div className="mt-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg skeleton" />)}</div>
      </div>
    );
  }

  const hasClaims = claims.length > 0;
  const hasAccounts = sortedAccounts.length > 0;

  return (
    <section className="rounded-2xl border shadow-[var(--dash-card-shadow)] overflow-hidden" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
      {/* ── Header: score + tabs ── */}
      <div className="sticky top-0 z-10 px-4 py-4 sm:px-5" style={{ backgroundColor: 'var(--dash-card-bg)', borderBottom: '1px solid var(--dash-card-divider)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <HealthScoreRing score={avgScore} size={56} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--dash-text-primary)' }}>客户组合洞察</h3>
                {withReports.length > 0 && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: avgScore >= 80 ? "var(--dash-severity-focus-bg)" : avgScore >= 50 ? "var(--dash-severity-warning-bg)" : "var(--dash-severity-critical-bg)", color: avgScore >= 80 ? "var(--dash-health-good)" : avgScore >= 50 ? "var(--dash-health-warn)" : "var(--dash-health-bad)" }}>
                    {avgScore >= 80 ? "模型充分" : avgScore >= 50 ? "理解待补" : "认知不足"}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--dash-text-tertiary)' }}>
                {gapTypeDist["认知盲区"] > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--dash-severity-critical)' }} />
                    <span style={{ color: 'var(--dash-text-secondary)' }}>{gapTypeDist["认知盲区"]}</span> 盲区
                  </span>
                )}
                {gapTypeDist["证据薄弱"] > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--dash-severity-warning)' }} />
                    <span style={{ color: 'var(--dash-text-secondary)' }}>{gapTypeDist["证据薄弱"]}</span> 薄弱
                  </span>
                )}
                {gapTypeDist["模型完整"] > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--dash-health-good)' }} />
                    <span style={{ color: 'var(--dash-text-secondary)' }}>{gapTypeDist["模型完整"]}</span> 充分
                  </span>
                )}
                {hasClaims && (
                  <span className="inline-flex items-center gap-1">
                    <FileSearch className="h-3 w-3" />
                    <span style={{ color: 'var(--dash-text-secondary)' }}>{claims.length}</span> 条证据待处理
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => fetchAll(true)} disabled={loading || refreshing} className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--dash-hover-bg)] disabled:opacity-40" style={{ color: 'var(--dash-text-secondary)' }} aria-label="刷新">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">刷新</span>
          </button>
        </div>

        {/* Tab switcher */}
        {hasClaims && hasAccounts && (
          <div className="mt-3 flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: 'var(--dash-card-divider)' }}>
            <button onClick={() => setActiveTab("health")} className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all" style={{ backgroundColor: activeTab === "health" ? "var(--dash-card-bg)" : "transparent", color: activeTab === "health" ? "var(--dash-text-primary)" : "var(--dash-text-tertiary)", boxShadow: activeTab === "health" ? "0 1px 2px rgba(0,0,0,0.04)" : undefined }}>
              <Shield className="mr-1 inline h-3 w-3" />健康度排序
            </button>
            <button onClick={() => setActiveTab("claims")} className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all" style={{ backgroundColor: activeTab === "claims" ? "var(--dash-card-bg)" : "transparent", color: activeTab === "claims" ? "var(--dash-text-primary)" : "var(--dash-text-tertiary)", boxShadow: activeTab === "claims" ? "0 1px 2px rgba(0,0,0,0.04)" : undefined }}>
              <FileSearch className="mr-1 inline h-3 w-3" />证据溯源
              <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums" style={{ backgroundColor: 'var(--dash-counter-bg)', color: 'var(--dash-icon-accent)' }}>{claims.length}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
        {/* Health tab (or only tab when no claims) */}
        {(activeTab === "health" || !hasClaims) && hasAccounts && (
          <div className="divide-y" style={{ borderColor: 'var(--dash-card-divider)' }}>
            {sortedAccounts.map((item) => {
              const score = item.report?.healthScore ?? 0;
              const dims = item.dimensions;
              const weakDims = dims.filter((d) => d.status !== "strong");
              const gap = classifyGapType(dims);
              const gapStyle = GAP_TYPE_STYLE[gap.type];
              const primaryWeak = weakDims.sort((a, b) => {
                const pri: Record<DimensionStatus, number> = { missing: 0, stale: 1, weak: 2, strong: 3 };
                return pri[a.status] - pri[b.status];
              })[0] ?? null;
              const expanded = expandedAccountId === item.accountId;

              return (
                <div key={item.accountId} style={{ borderColor: 'var(--dash-card-divider)' }}>
                  <button
                    onClick={() => setExpandedAccountId(expanded ? null : item.accountId)}
                    className="flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-[var(--dash-hover-bg)] sm:px-5"
                  >
                    <HealthScoreRing score={score} size={44} />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/accounts/${item.accountId}`} className="text-sm font-semibold truncate hover:underline" style={{ color: 'var(--dash-text-primary)' }} onClick={(e) => e.stopPropagation()}>
                          {item.name}
                        </Link>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: gapStyle.bg, color: gapStyle.fg }}>{gap.type}</span>
                      </div>
                      <div className="w-full max-w-[200px]"><DimensionMiniBar dimensions={dims} /></div>
                      {primaryWeak ? (
                        <div className="space-y-1 pt-0.5">
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--dash-text-secondary)' }}>
                            <span className="font-semibold" style={{ color: gapStyle.fg }}>{primaryWeak.label}{STATUS_LABELS[primaryWeak.status]}</span>
                            <span className="mx-1.5" style={{ color: 'var(--dash-text-tertiary)' }}>·</span>
                            {primaryWeak.reason}
                          </p>
                          <div className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 text-[11px] font-medium" style={{ color: gapStyle.fg, backgroundColor: gapStyle.bg }}>
                            <ArrowRight className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{primaryWeak.nextAction}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 pt-0.5">
                          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--dash-health-good)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--dash-health-good)' }}>模型完整，证据链充分</span>
                        </div>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 flex-shrink-0 mt-1.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} style={{ color: 'var(--dash-text-tertiary)' }} />
                  </button>

                  {expanded && (
                    <div className="px-4 pb-4 sm:px-5" style={{ backgroundColor: 'var(--dash-expand-bg)' }}>
                      <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                        {dims.map((d) => {
                          const cfg = DIMENSION_CONFIG[d.key];
                          const Icon = cfg?.icon ?? Shield;
                          const isBad = d.status === "missing" || d.status === "stale";
                          const isWeak = d.status === "weak";
                          const accentColor = isBad ? 'var(--dash-severity-critical)' : isWeak ? 'var(--dash-severity-warning)' : 'var(--dash-health-good)';
                          const bgColor = isBad ? 'var(--dash-severity-critical-bg)' : isWeak ? 'var(--dash-severity-warning-bg)' : 'var(--dash-severity-focus-bg)';
                          return (
                            <div key={d.key} className="rounded-lg px-3 py-2.5 space-y-1" style={{ backgroundColor: bgColor }}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accentColor }} />
                                <span className="text-xs font-semibold" style={{ color: 'var(--dash-text-primary)' }}>{d.label}</span>
                                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide" style={{ color: accentColor }}>{STATUS_LABELS[d.status]}</span>
                              </div>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--dash-text-secondary)' }}>{d.reason}</p>
                              <p className="text-[11px] leading-snug" style={{ color: 'var(--dash-text-tertiary)' }}>
                                <span className="font-medium">依据：</span>{d.evidence}
                              </p>
                              {(isBad || isWeak) && (
                                <div className="flex items-start gap-1 pt-1">
                                  <ArrowRight className="h-3 w-3 flex-shrink-0 mt-0.5" style={{ color: accentColor }} />
                                  <span className="text-[11px] font-medium leading-snug" style={{ color: accentColor }}>{d.nextAction}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Claims tab */}
        {activeTab === "claims" && hasClaims && (
          <div className="divide-y" style={{ borderColor: 'var(--dash-card-divider)' }}>
            {claims.map((item) => {
              const tone = CLAIM_STYLES[item.severity];
              const Icon = tone.icon;
              const expanded = expandedClaimId === item.id;
              const sourceInfo = SOURCE_LABELS[item.sourceType];
              const SourceIcon = sourceInfo.icon;

              return (
                <div key={item.id} className="relative" style={{ borderColor: 'var(--dash-card-divider)' }}>
                  <div className={`absolute inset-y-0 left-0 w-1 ${tone.strip}`} />
                  <button
                    type="button"
                    onClick={() => setExpandedClaimId(expanded ? null : item.id)}
                    className="flex w-full items-start gap-3 pl-5 pr-4 py-3.5 text-left transition-colors hover:bg-[var(--dash-hover-bg)] sm:pl-6 sm:pr-5"
                  >
                    <span className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.badge}`}>
                      <Icon className="mr-1 inline h-3 w-3" />{item.ownerLabel}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--dash-text-primary)' }}>{item.claim}</p>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--dash-text-secondary)' }}>{item.summary}</p>
                          <div className="mt-1.5 flex items-center flex-wrap gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}><SourceIcon className="h-3 w-3" />{sourceInfo.label}</span>
                            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--dash-text-tertiary)' }}><Clock3 className="h-3 w-3" />{formatRelativeTime(item.timestamp)}</span>
                          </div>
                        </div>
                        {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--dash-text-tertiary)' }} /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--dash-text-tertiary)' }} />}
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div className="pb-4 pl-7 pr-4 sm:pl-9 sm:pr-5" style={{ backgroundColor: 'var(--dash-expand-bg)' }}>
                      <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-card-bg)' }}>
                        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--dash-text-tertiary)' }}>证据</p>
                            <ul className="mt-2 space-y-2">
                              {item.evidence.map((line) => (
                                <li key={line} className="flex items-start gap-2 text-sm" style={{ color: 'var(--dash-text-primary)' }}>
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--dash-evidence-dot)' }} />
                                  <span className="leading-relaxed">{line}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--dash-card-border)', backgroundColor: 'var(--dash-expand-bg)' }}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--dash-text-tertiary)' }}>建议下一步</p>
                            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--dash-text-primary)' }}>{item.recommendedAction}</p>
                            <Link href={item.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80" style={{ color: 'var(--dash-link-accent)' }}>
                              打开详情<ArrowRight className="h-3.5 w-3.5" />
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
        )}

        {/* Empty */}
        {!hasAccounts && !hasClaims && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="rounded-full p-3 mb-3" style={{ backgroundColor: 'var(--dash-card-divider)' }}>
              <Shield className="h-8 w-8" style={{ color: 'var(--dash-text-tertiary)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--dash-text-secondary)' }}>暂无客户数据</p>
            <p className="text-xs mt-1" style={{ color: 'var(--dash-text-tertiary)' }}>添加客户后将自动汇总洞察</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] sm:px-5" style={{ borderTop: '1px solid var(--dash-card-divider)', color: 'var(--dash-text-tertiary)' }}>
        <Clock3 className="h-3 w-3 flex-shrink-0" />
        <span>健康度排序 + 证据溯源，更细颗粒度在账户页 / 商机页下钻</span>
      </div>
    </section>
  );
}
