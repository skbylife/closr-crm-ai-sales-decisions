/**
 * Shared constants used across multiple pages
 * ─── 唯一真相源 (Single Source of Truth) ──────────────────────────────
 */

import type { DealHealth } from "@/lib/babel-engine/types";
import type { PipelineStage } from "@/lib/user-settings";

// ─── Deal Stages ────────────────────────────────────────────────────

export const DEAL_STAGES = [
  "Prospecting",
  "Discovery",
  "Proposal",
  "Negotiation",
  "Closing",
  "Won",
  "Lost",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  Prospecting: "线索开发",
  Discovery: "需求发现",
  Proposal: "方案提交",
  Negotiation: "谈判",
  Closing: "签约中",
  Won: "赢单",
  Lost: "丢单",
  lead_identified: "线索确认",
  discovery: "需求发现",
  solution_presented: "方案演示",
  proposal_sent: "方案已发送",
  negotiation: "谈判中",
  contract_review: "合同审核",
  closed_won: "赢单",
  closed_lost: "丢单",
};

/** Backward-compatible alias — identical to STAGE_LABELS */
export const DEAL_STAGE_LABELS = STAGE_LABELS;

/** Pre-built {value, label}[] for <select> / dropdown components */
export const DEAL_STAGE_OPTIONS = DEAL_STAGES.map((s) => ({
  value: s,
  label: STAGE_LABELS[s],
})) as readonly { value: string; label: string }[];

export const HEALTH_CONFIG: Record<DealHealth, { labelKey: "health.healthy" | "health.at_risk" | "health.critical"; badgeClass: string }> = {
  healthy: { labelKey: "health.healthy", badgeClass: "badge badge-success" },
  at_risk: { labelKey: "health.at_risk", badgeClass: "badge badge-warning" },
  critical: { labelKey: "health.critical", badgeClass: "badge badge-danger" },
};

export const ROLE_LABELS: Record<string, string> = {
  decision_maker: "决策者",
  champion: "内部拥护者",
  blocker: "阻碍者",
  technical_evaluator: "技术评估人",
  influencer: "影响者",
  external_advisor: "外部顾问",
  consultant: "咨询顾问",
  channel_influencer: "渠道影响者",
  end_user: "最终用户",
  gate_keeper: "守门人",
  procurement: "采购",
  legal: "法务",
  finance: "财务",
  operations: "运营",
  it_admin: "IT 管理员",
  project_manager: "项目经理",
  economic_buyer: "经济买家",
  coach: "教练",
  committee_member: "委员会成员",
  executive_sponsor: "高管支持者",
  contact: "联系人",
  unknown: "未知",
};

export const DISC_LABELS: Record<string, { label: string; color: string }> = {
  driver: { label: "D 驱动型", color: "bg-danger/10 text-danger" },
  analytical: { label: "A 分析型", color: "bg-blue-500/10 text-blue-600" },
  amiable: { label: "A 亲和型", color: "bg-positive/10 text-positive" },
  expressive: { label: "E 表现型", color: "bg-warning/10 text-warning" },
};

// ─── Risk & Sentiment ───────────────────────────────────────────────

export const RISK_LABELS: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  critical: "严重",
};

export const SENTIMENT_LABELS: Record<string, string> = {
  warming: "升温",
  cooling: "降温",
  stable: "平稳",
  volatile: "波动",
};

// ─── Industries ─────────────────────────────────────────────────────

export const INDUSTRIES = [
  "零售",
  "电商",
  "物流",
  "制造业",
  "医药",
  "餐饮",
  "其他",
] as const;

// ─── Default Pipeline Stages ────────────────────────────────────────

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: "s1", key: "lead_identified", label: "线索确认", probability: 10, color: "#94a3b8" },
  { id: "s2", key: "discovery", label: "需求发现", probability: 20, color: "#60a5fa" },
  { id: "s3", key: "solution_presented", label: "方案演示", probability: 40, color: "#22d3ee" },
  { id: "s4", key: "proposal_sent", label: "方案已发", probability: 50, color: "#facc15" },
  { id: "s5", key: "negotiation", label: "谈判", probability: 70, color: "#fb923c" },
  { id: "s6", key: "contract_review", label: "合同审核", probability: 85, color: "#f87171" },
  { id: "s7", key: "closed_won", label: "赢单", probability: 100, color: "#34d399" },
  { id: "s8", key: "closed_lost", label: "丢单", probability: 0, color: "#64748b" },
];
