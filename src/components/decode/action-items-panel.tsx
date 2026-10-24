"use client";

// ─── Action Items Panel ──────────────────────────────────────────────

import { useState } from "react";
import {
  Zap,
  Calendar,
  Plus,
  CheckCircle2,
  Target,
  Briefcase,
} from "lucide-react";
import type { DecodeOutput } from "@/lib/babel-engine/types";
import type { TranslationKey } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import Link from "next/link";

// ─── Props ───────────────────────────────────────────────────────────

export interface ActionItemsPanelProps {
  decodeResult: DecodeOutput;
  clientName: string;
  accountId?: string;
  opportunityId?: string;
}

// ─── Component ───────────────────────────────────────────────────────

export default function ActionItemsPanel({
  decodeResult,
  clientName,
  accountId,
  opportunityId,
}: ActionItemsPanelProps) {
  const { t } = useLocale();
  const { accounts, opportunities } = useRoleFilteredData();
  const addTask = useStore((s) => s.addTask);
  const [addedActionItems, setAddedActionItems] = useState<Set<number>>(new Set());

  const actionItems = decodeResult.actionItems;
  if (!actionItems || actionItems.length === 0) return null;

  const selectedAccount = accountId
    ? accounts.find((a) => a.id === accountId)
    : clientName
    ? accounts.find((a) => a.name === clientName)
    : undefined;
  const opportunity = opportunityId
    ? opportunities.find((o) => o.id === opportunityId)
    : undefined;

  return (
    <div className="rounded-xl border border-border bg-card card-elevated">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Zap className="h-4 w-4 text-yellow-500" />
            {t("decode.actionItems")}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            AI 已为你提炼出 {actionItems.length} 项待办事项
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedAccount && (
            <Link
              href={`/tasks?accountId=${selectedAccount.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
            >
              <Briefcase className="h-3 w-3" />
              查看所有任务
            </Link>
          )}
          {opportunity && (
            <Link
              href={`/pipeline/${opportunity.id}?tab=execution`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
            >
              <Target className="h-3 w-3" />
              商机执行计划
            </Link>
          )}
          <button
            onClick={() => {
              actionItems.forEach((item, idx) => {
                if (!addedActionItems.has(idx)) {
                  const dueDate = new Date();
                  dueDate.setDate(dueDate.getDate() + item.dueInDays);
                  addTask({
                    title: item.title,
                    description: [
                      item.targetPerson ? `建议对象：${item.targetPerson}${item.targetRole ? `（${item.targetRole}）` : ""}` : "",
                      item.reasoning,
                    ].filter(Boolean).join("\n"),
                    status: "todo",
                    priority: item.priority,
                    accountId: selectedAccount?.id,
                    opportunityId: opportunityId,
                    dueDate: dueDate.toISOString().split("T")[0],
                    source: "decode",
                    aiGenerated: true,
                  });
                }
              });
              setAddedActionItems(new Set(actionItems.map((_, i) => i)));
            }}
            disabled={addedActionItems.size === actionItems.length}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {addedActionItems.size === actionItems.length ? (
              <><CheckCircle2 className="h-3.5 w-3.5" />{t("decode.actionItems.added")}</>
            ) : (
              <><Plus className="h-3.5 w-3.5" />{t("decode.actionItems.addAll")}</>
            )}
          </button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {actionItems.map((item, idx) => {
          const isAdded = addedActionItems.has(idx);
          const priorityColors: Record<string, string> = {
            low: "bg-gray-500 text-white",
            medium: "bg-blue-600 text-white",
            high: "bg-orange-500 text-white",
            urgent: "bg-red-600 text-white",
          };
          return (
            <div key={idx} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" />
                  <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${priorityColors[item.priority] ?? priorityColors.medium}`}>
                    {t(`tasks.priority.${item.priority}` as TranslationKey)}
                  </span>
                  <span className="text-xs text-muted flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {item.dueInDays}{t("decode.actionItems.dueInDays").replace("{0}", "")}
                  </span>
                </div>
                {item.reasoning && (
                  <p className="mt-1 text-xs text-secondary leading-relaxed">{item.reasoning}</p>
                )}
                {item.targetPerson && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
                      建议对象：{item.targetPerson}
                    </span>
                    {item.targetRole && (
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted">
                        {item.targetRole}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (isAdded) return;
                  const dueDate = new Date();
                  dueDate.setDate(dueDate.getDate() + item.dueInDays);
                  addTask({
                    title: item.title,
                    description: [
                      item.targetPerson ? `建议对象：${item.targetPerson}${item.targetRole ? `（${item.targetRole}）` : ""}` : "",
                      item.reasoning,
                    ].filter(Boolean).join("\n"),
                    status: "todo",
                    priority: item.priority,
                    accountId: selectedAccount?.id,
                    opportunityId: opportunityId,
                    dueDate: dueDate.toISOString().split("T")[0],
                    source: "decode",
                    aiGenerated: true,
                  });
                  setAddedActionItems((prev) => new Set([...prev, idx]));
                }}
                disabled={isAdded}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isAdded
                    ? "border-positive/20 bg-positive/10 text-positive cursor-not-allowed"
                    : "border-accent/20 bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {isAdded ? (
                  <><CheckCircle2 className="h-3 w-3" />{t("decode.actionItems.added")}</>
                ) : (
                  <><Plus className="h-3 w-3" />{t("decode.actionItems.addToTask")}</>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
