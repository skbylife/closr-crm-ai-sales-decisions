import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
}: StatCardProps) {
  const changeColor = {
    positive: "text-positive",
    negative: "text-danger",
    neutral: "text-muted",
  }[changeType];

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-medium text-secondary">{title}</p>
        {icon && <div className="text-muted">{icon}</div>}
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {change && (
        <p className={`mt-1.5 text-xs font-medium ${changeColor}`}>{change}</p>
      )}
    </div>
  );
}
