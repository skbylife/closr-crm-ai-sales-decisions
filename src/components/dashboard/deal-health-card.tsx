import type { DealHealth } from "@/lib/babel-engine/types";

// TODO: Wire up to real account data
// TODO: Add sentiment trend sparkline
// TODO: Add click-through to account detail page

interface DealHealthCardProps {
  accountName: string;
  dealValue?: number;
  dealStage?: string;
  health: DealHealth;
  lastActivity?: string;
  nextStep?: string;
}

const healthConfig = {
  healthy: { color: "border-positive/50 bg-positive/5", label: "正常", dot: "bg-positive" },
  at_risk: { color: "border-warning/50 bg-warning/5", label: "风险", dot: "bg-warning" },
  critical: { color: "border-danger/50 bg-danger/5", label: "严重", dot: "bg-danger" },
} as const;

export function DealHealthCard({
  accountName,
  dealValue,
  dealStage,
  health,
  lastActivity,
  nextStep,
}: DealHealthCardProps) {
  const config = healthConfig[health];

  return (
    <div className={`rounded-lg border p-5 ${config.color}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{accountName}</h3>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 w-2 rounded-full ${config.dot}`} />
          <span className="text-xs text-muted">{config.label}</span>
        </div>
      </div>
      {(dealValue || dealStage) && (
        <p className="mt-1 text-sm text-muted">
          {dealValue && `$${(dealValue / 1000).toFixed(0)}K`}
          {dealValue && dealStage && " · "}
          {dealStage}
        </p>
      )}
      {lastActivity && (
        <p className="mt-2 text-xs text-muted">最后活动: {lastActivity}</p>
      )}
      {nextStep && (
        <p className="mt-1 text-xs text-accent">下一步: {nextStep}</p>
      )}
    </div>
  );
}
