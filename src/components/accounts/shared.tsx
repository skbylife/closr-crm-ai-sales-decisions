"use client";

import { useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Copy,
  Check,
} from "lucide-react";
import type {
  ContactRole,
  DecisionStyle,
  RiskAppetite,
  DealHealth,
  IntelSource,
  EmailType,
} from "@/lib/babel-engine/types";

// ─── Constants ───────────────────────────────────────────────────────

export const ROLE_CONFIG: Record<ContactRole, { label: string; icon: string; style: string }> = {
  decision_maker: { label: "决策者", icon: "👑", style: "bg-danger/10 text-danger border-danger/20" },
  economic_buyer: { label: "经济买家", icon: "💰", style: "bg-danger/10 text-danger border-danger/20" },
  executive_sponsor: { label: "高管支持者", icon: "⭐", style: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  champion: { label: "内部拥护者", icon: "🏆", style: "bg-positive/10 text-positive border-positive/20" },
  coach: { label: "教练", icon: "🎯", style: "bg-positive/10 text-positive border-positive/20" },
  influencer: { label: "影响者", icon: "💡", style: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  external_advisor: { label: "外部顾问", icon: "🧭", style: "bg-violet-500/10 text-violet-700 border-violet-500/20" },
  consultant: { label: "咨询顾问", icon: "🧩", style: "bg-violet-500/10 text-violet-700 border-violet-500/20" },
  channel_influencer: { label: "渠道影响者", icon: "🌉", style: "bg-violet-500/10 text-violet-700 border-violet-500/20" },
  project_manager: { label: "项目经理", icon: "📋", style: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  technical_evaluator: { label: "技术评估人", icon: "🔧", style: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  it_admin: { label: "IT 管理员", icon: "🖥️", style: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
  procurement: { label: "采购", icon: "📦", style: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  legal: { label: "法务", icon: "⚖️", style: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  finance: { label: "财务", icon: "📊", style: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  operations: { label: "运营", icon: "⚙️", style: "bg-card text-muted border-border" },
  blocker: { label: "阻碍者", icon: "⛔", style: "bg-warning/10 text-warning border-warning/20" },
  gate_keeper: { label: "守门人", icon: "🚪", style: "bg-card text-muted border-border" },
  committee_member: { label: "委员会成员", icon: "🗳️", style: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20" },
  end_user: { label: "最终用户", icon: "👤", style: "bg-card text-muted border-border" },
  contact: { label: "联系人", icon: "📇", style: "bg-card text-muted border-border" },
  unknown: { label: "未知", icon: "❓", style: "bg-card text-muted border-border" },
};

export const CONTACT_ROLES: { value: ContactRole; label: string }[] = [
  { value: "decision_maker", label: "👑 决策者" },
  { value: "economic_buyer", label: "💰 经济买家" },
  { value: "executive_sponsor", label: "⭐ 高管支持者" },
  { value: "champion", label: "🏆 内部拥护者" },
  { value: "coach", label: "🎯 教练" },
  { value: "influencer", label: "💡 影响者" },
  { value: "external_advisor", label: "🧭 外部顾问" },
  { value: "consultant", label: "🧩 咨询顾问" },
  { value: "channel_influencer", label: "🌉 渠道影响者" },
  { value: "project_manager", label: "📋 项目经理" },
  { value: "technical_evaluator", label: "🔧 技术评估人" },
  { value: "it_admin", label: "🖥️ IT 管理员" },
  { value: "procurement", label: "📦 采购" },
  { value: "legal", label: "⚖️ 法务" },
  { value: "finance", label: "📊 财务" },
  { value: "operations", label: "⚙️ 运营" },
  { value: "blocker", label: "⛔ 阻碍者" },
  { value: "gate_keeper", label: "🚪 守门人" },
  { value: "committee_member", label: "🗳️ 委员会成员" },
  { value: "end_user", label: "👤 最终用户" },
  { value: "contact", label: "📇 联系人" },
];

export const DECISION_STYLES: { value: DecisionStyle; label: string }[] = [
  { value: "analytical", label: "分析型" },
  { value: "driver", label: "驱动型" },
  { value: "amiable", label: "亲和型" },
  { value: "expressive", label: "表现型" },
];

export const RISK_APPETITES: { value: RiskAppetite; label: string }[] = [
  { value: "aggressive", label: "激进" },
  { value: "moderate", label: "稳健" },
  { value: "cautious", label: "保守" },
];

import { DEAL_STAGE_LABELS, RISK_LABELS, SENTIMENT_LABELS } from "@/lib/constants";
export { DEAL_STAGE_LABELS, RISK_LABELS, SENTIMENT_LABELS };

export const HEALTH_CONFIG: Record<DealHealth, { label: string; style: string }> = {
  healthy: { label: "健康", style: "bg-positive/10 text-positive border-positive/20" },
  at_risk: { label: "有风险", style: "bg-warning/10 text-warning border-warning/20" },
  critical: { label: "严重", style: "bg-danger/10 text-danger border-danger/20" },
};

export const SOURCE_LABELS: Record<IntelSource, string> = {
  supplier: "供应商",
  industry_event: "行业活动",
  news: "新闻",
  internal: "内部",
  social_media: "社交媒体",
  client_direct: "客户直接",
  other: "其他",
  email: "邮件",
  meeting: "会议",
  call: "电话",
  chat: "聊天",
  ai_decode: "AI 解读",
  ai_play: "AI 谋局",
};

export const INTEL_SOURCES: { value: IntelSource; label: string }[] = [
  { value: "supplier", label: "供应商" },
  { value: "industry_event", label: "行业活动" },
  { value: "news", label: "新闻" },
  { value: "internal", label: "内部" },
  { value: "social_media", label: "社交媒体" },
  { value: "client_direct", label: "客户直接" },
  { value: "other", label: "其他" },
];

export { DEAL_STAGE_OPTIONS as DEAL_STAGES } from "@/lib/constants";

export const EMAIL_TYPE_OPTIONS: { value: EmailType; label: string }[] = [
  { value: "cold_outreach", label: "陌生开发" },
  { value: "follow_up", label: "跟进" },
  { value: "meeting_invite", label: "会议邀请" },
  { value: "proposal_send", label: "方案发送" },
  { value: "quote_follow_up", label: "报价跟进" },
  { value: "holiday_greeting", label: "节日问候" },
  { value: "reactivation", label: "重新激活" },
  { value: "custom", label: "自定义" },
];

export const inputFieldClass = "form-input";
export const selectFieldClass = "form-select";

// ─── Helpers ─────────────────────────────────────────────────────────

export function timeAgo(dateStr?: string): string {
  if (!dateStr) return "暂无记录";
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

export function formatDealValue(v?: number): string {
  if (!v) return "—";
  if (v >= 1000000) return `$${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return `$${v.toLocaleString()}`;
}

export function sentimentIcon(trend: string) {
  if (trend === "warming") return <TrendingUp className="h-3.5 w-3.5 text-positive" />;
  if (trend === "cooling") return <TrendingDown className="h-3.5 w-3.5 text-danger" />;
  if (trend === "volatile") return <Zap className="h-3.5 w-3.5 text-warning" />;
  return <Minus className="h-3.5 w-3.5 text-secondary" />;
}

export function riskBadgeEl(level: string) {
  const styles: Record<string, string> = {
    low: "bg-positive/10 text-positive border-positive/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    high: "bg-danger/10 text-danger border-danger/20",
    critical: "bg-danger/20 text-danger border-danger/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[level] ?? styles.low}`}>
      {level === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
      {RISK_LABELS[level] ?? "未知"}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
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
        copied ? "border-accent/30 bg-accent/10 text-accent" : "bg-card text-muted hover:border-secondary hover:text-foreground"
      }`}
    >
      {copied ? <><Check className="h-3 w-3" />已复制</> : <><Copy className="h-3 w-3" />复制</>}
    </button>
  );
}

// ─── Org Chart Helpers ───────────────────────────────────────────────

export const TITLE_HIERARCHY: [RegExp, number][] = [
  [/\b(CEO|CTO|CFO|COO|CIO|CMO|VP|President|总裁|董事长|首席)\b/i, 1],
  [/\b(SVP|Senior Vice President|EVP|高级副总裁)\b/i, 2],
  [/\b(Director|Head|总监|部长)\b/i, 3],
  [/\b(Senior Manager|高级经理)\b/i, 4],
  [/\b(Manager|经理|主管)\b/i, 5],
  [/\b(Lead|Team Lead|组长)\b/i, 6],
  [/\b(Senior|高级)\b/i, 7],
];

export function inferLevel(title?: string): number {
  if (!title) return 8;
  for (const [regex, level] of TITLE_HIERARCHY) {
    if (regex.test(title)) return level;
  }
  return 8;
}

export const LEVEL_LABELS: Record<number, string> = {
  1: "C 级高管",
  2: "高级副总裁",
  3: "总监",
  4: "高级经理",
  5: "经理",
  6: "团队负责人",
  7: "资深员工",
  8: "普通员工",
};

export const REQUIRED_ROLES: ContactRole[] = [
  "decision_maker", "champion", "technical_evaluator",
];
