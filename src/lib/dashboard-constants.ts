import type { DealHealth, OpportunityStage } from "@/lib/babel-engine/types";

export const HEALTH_CONFIG: Record<
  DealHealth,
  { labelKey: "health.healthy" | "health.at_risk" | "health.critical"; style: string }
> = {
  healthy: { labelKey: "health.healthy", style: "bg-positive/10 text-positive border-positive/20" },
  at_risk: { labelKey: "health.at_risk", style: "bg-warning/10 text-warning border-warning/20" },
  critical: { labelKey: "health.critical", style: "bg-danger/10 text-danger border-danger/20" },
};

export const ALL_STAGES: OpportunityStage[] = [
  "lead_identified",
  "discovery",
  "solution_presented",
  "proposal_sent",
  "negotiation",
  "contract_review",
  "closed_won",
  "closed_lost",
];

export const STAGE_SHORT_LABELS: Record<OpportunityStage, string> = {
  lead_identified: "线索",
  discovery: "发现",
  solution_presented: "方案",
  proposal_sent: "提案",
  negotiation: "谈判",
  contract_review: "合同",
  closed_won: "成交",
  closed_lost: "丢失",
};

export const STAGE_COLORS: Record<OpportunityStage, string> = {
  lead_identified: "bg-slate-300",
  discovery: "bg-blue-300",
  solution_presented: "bg-cyan-400",
  proposal_sent: "bg-amber-400",
  negotiation: "bg-orange-500",
  contract_review: "bg-rose-500",
  closed_won: "bg-positive",
  closed_lost: "bg-slate-500",
};

export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  lead_identified: 5,
  discovery: 15,
  solution_presented: 30,
  proposal_sent: 40,
  negotiation: 60,
  contract_review: 80,
  closed_won: 100,
  closed_lost: 0,
};
