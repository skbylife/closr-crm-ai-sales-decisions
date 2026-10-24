"use client";

import Link from "next/link";
import {
  Building2,
  Target,
  User,
  ExternalLink,
  Briefcase,
  Calendar,
  Plus,
  Swords,
} from "lucide-react";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { STAGE_LABELS } from "@/lib/babel-engine/types";

// ─── Props ───────────────────────────────────────────────────────────

export interface DecodeContextCardProps {
  accountId: string;
  accountName: string;
  opportunityId?: string;
  contactId?: string;
}

// ─── Component ───────────────────────────────────────────────────────

export function DecodeContextCard({
  accountId,
  accountName,
  opportunityId,
  contactId,
}: DecodeContextCardProps) {
  const { accounts, opportunities, tasks } = useRoleFilteredData();

  const account = accounts.find((a) => a.id === accountId);
  const opportunity = opportunityId
    ? opportunities.find((o) => o.id === opportunityId)
    : undefined;
  const contact = contactId
    ? account?.contacts?.find((c) => c.id === contactId)
    : undefined;

  // 统计该客户的待办任务
  const accountTasks = tasks.filter(
    (t) => t.accountId === accountId && t.status !== "done"
  );
  const overdueTasks = accountTasks.filter((t) => {
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < new Date();
  });

  if (!account) return null;

  return (
    <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent/5 to-accent/10 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          📋 关联上下文
        </h3>
        <Link
          href={`/accounts/${accountId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-accent/20 bg-card px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
        >
          <ExternalLink className="h-3 w-3" />
          查看完整档案
        </Link>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Account */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Building2 className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted">客户</p>
            <Link
              href={`/accounts/${accountId}`}
              className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:text-accent"
            >
              {accountName}
            </Link>
            {account.industry && (
              <p className="mt-0.5 text-xs text-muted">{account.industry}</p>
            )}
          </div>
        </div>

        {/* Opportunity */}
        {opportunity ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-500/10">
              <Target className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">商机</p>
              <Link
                href={`/pipeline/${opportunity.id}`}
                className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:text-accent"
              >
                {opportunity.name}
              </Link>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                  {STAGE_LABELS[opportunity.stage]}
                </span>
                <span className="text-xs text-muted">
                  ${opportunity.value.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Link
            href={`/accounts/${accountId}?createOpp=true`}
            className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-card/50 p-3 transition-colors hover:border-accent/30 hover:bg-accent/5"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/10">
              <Plus className="h-4 w-4 text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">商机</p>
              <p className="mt-0.5 text-sm font-semibold text-secondary">
                创建商机
              </p>
              <p className="mt-0.5 text-xs text-muted">暂无关联商机</p>
            </div>
          </Link>
        )}

        {/* Contact */}
        {contact ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <User className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">联系人</p>
              <Link
                href={`/accounts/${accountId}?tab=contacts`}
                className="mt-0.5 block truncate text-sm font-semibold text-foreground hover:text-accent"
              >
                {contact.name}
              </Link>
              {contact.title && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  {contact.title}
                </p>
              )}
            </div>
          </div>
        ) : (
          <Link
            href={`/accounts/${accountId}?tab=contacts&action=add`}
            className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-card/50 p-3 transition-colors hover:border-accent/30 hover:bg-accent/5"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted/10">
              <Plus className="h-4 w-4 text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">联系人</p>
              <p className="mt-0.5 text-sm font-semibold text-secondary">
                添加联系人
              </p>
              <p className="mt-0.5 text-xs text-muted">从邮件中识别</p>
            </div>
          </Link>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted">快捷操作：</span>
        <Link
          href={`/accounts/${accountId}?tab=plays`}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
        >
          <Swords className="h-3 w-3" />
          创建谋局
        </Link>
        <Link
          href={`/tasks?accountId=${accountId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
        >
          <Briefcase className="h-3 w-3" />
          查看任务
          {accountTasks.length > 0 && (
            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
              {accountTasks.length}
            </span>
          )}
          {overdueTasks.length > 0 && (
            <span className="text-xs text-danger">({overdueTasks.length}逾期)</span>
          )}
        </Link>
        {opportunity && (
          <Link
            href={`/pipeline/${opportunity.id}?tab=meeting`}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
          >
            <Calendar className="h-3 w-3" />
            准备会议
          </Link>
        )}
      </div>
    </div>
  );
}
