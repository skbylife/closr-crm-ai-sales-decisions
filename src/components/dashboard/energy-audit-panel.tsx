"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  calculateEntropy,
  extractInteractions,
} from "@/lib/relationship-entropy";
import type { EntropyResult } from "@/lib/relationship-entropy";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Users, AlertTriangle } from "lucide-react";

// ── Color mapping by entropy urgency ────────────────────────────
const URGENCY_COLORS: Record<EntropyResult["urgency"], string> = {
  low: "#22c55e",
  medium: "#3b82f6",
  high: "#f59e0b",
  critical: "#ef4444",
};

// Roles considered "important" for neglect detection
const IMPORTANT_ROLES = new Set([
  "decision_maker",
  "champion",
  "economic_buyer",
  "executive_sponsor",
]);

interface ContactRow {
  name: string;
  interactions: number;
  entropy: number;
  urgency: EntropyResult["urgency"];
  suggestion: string;
  role?: string;
}

export function EnergyAuditPanel() {
  const accounts = useStore((s) => s.accounts);
  const emailDecodes = useStore((s) => s.emailDecodes);
  const tasks = useStore((s) => s.tasks);
  const [snapshotNow] = useState(() => Date.now());

  const { chartData, neglected } = useMemo(() => {
    const thirtyDaysAgo = snapshotNow - 30 * 86400000;
    const rows: ContactRow[] = [];

    for (const account of accounts) {
      for (const contact of account.contacts) {
        const interactions = extractInteractions(
          contact.email,
          contact.name,
          emailDecodes.map((d) => ({ emailText: d.emailText, date: d.date })),
          tasks.map((t) => ({
            title: t.title,
            status: t.status,
            assignedTo: undefined,
            updatedAt: t.updatedAt,
            createdAt: t.createdAt,
          }))
        );

        // Count interactions in last 30 days
        const recentCount = interactions.filter(
          (i) => new Date(i.date).getTime() >= thirtyDaysAgo
        ).length;

        const result = calculateEntropy(
          contact,
          interactions,
          account.dealStage
        );

        rows.push({
          name: contact.name,
          interactions: recentCount,
          entropy: result.entropy,
          urgency: result.urgency,
          suggestion: result.suggestion,
          role: contact.role,
        });
      }
    }

    // Sort by interaction count descending
    rows.sort((a, b) => b.interactions - a.interactions);

    // Top 10 for chart
    const chartData = rows.slice(0, 10);

    // Neglected: entropy >= 60 AND important role
    const neglected = rows.filter(
      (r) => r.entropy >= 60 && IMPORTANT_ROLES.has(r.role ?? "")
    );

    return { chartData, neglected };
  }, [accounts, emailDecodes, tasks, snapshotNow]);

  // ── Empty state ────────────────────────────────────────────────
  const hasContacts = accounts.some((a) => a.contacts.length > 0);

  if (!hasContacts) {
    return (
      <div className="card-elevated rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-secondary" />
          <h2 className="text-sm font-semibold text-foreground">
            精力分配审计
          </h2>
        </div>
        <p className="text-xs text-muted">
          添加客户联系人后，这里将展示你的互动精力分布。
        </p>
      </div>
    );
  }

  return (
    <div className="card-elevated rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Users className="h-4 w-4 text-accent" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            精力分配审计
          </h2>
          <p className="text-xs text-muted">你的互动精力花在了哪里？</p>
        </div>
      </div>

      {/* Chart */}
      <div className="px-6 py-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
            >
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const row = props.payload as unknown as ContactRow;
                  return [
                    `${value} 次互动 · 熵 ${row?.entropy ?? ""}`,
                    "30天内",
                  ];
                }}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              />
              <Bar dataKey="interactions" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={URGENCY_COLORS[entry.urgency]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted text-center py-6">
            暂无互动数据
          </p>
        )}

        {/* Legend */}
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: URGENCY_COLORS.low }}
            />
            低熵
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: URGENCY_COLORS.medium }}
            />
            中等
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: URGENCY_COLORS.high }}
            />
            偏高
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: URGENCY_COLORS.critical }}
            />
            危急
          </span>
        </div>
      </div>

      {/* Neglected important contacts */}
      {neglected.length > 0 && (
        <div className="border-t border-border px-6 py-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-warning mb-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            ⚠️ 需要关注
          </h3>
          <div className="space-y-2">
            {neglected.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {c.name}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      c.urgency === "critical"
                        ? "text-danger"
                        : "text-warning"
                    }`}
                  >
                    熵 {c.entropy}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{c.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
