"use client";

// ─── Strategy Output Panel ───────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Plus,
  CheckCircle2,
  Target,
  Calendar,
  Mail,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
import type { StrategyOutput } from "@/lib/babel-engine/types";
import { useLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { CopyButton, SkeletonStrategy } from "./decode-shared";
import { SaveToKnowledgeButton } from "@/components/shared/save-to-knowledge-button";

// ─── Props ───────────────────────────────────────────────────────────

export interface StrategyOutputProps {
  strategyResult: StrategyOutput | null;
  strategizing: boolean;
  error?: string | null;
  savedAccountId: string;
  opportunityId?: string;
}

// ─── Component ───────────────────────────────────────────────────────

export default function StrategyOutputPanel({
  strategyResult,
  strategizing,
  error,
  savedAccountId,
  opportunityId,
}: StrategyOutputProps) {
  const { t } = useLocale();
  const addTask = useStore((s) => s.addTask);
  const { opportunities } = useRoleFilteredData();
  const [addedStrategies, setAddedStrategies] = useState<Set<number>>(new Set());

  const opportunity = opportunityId
    ? opportunities.find((o) => o.id === opportunityId)
    : undefined;

  if (!strategizing && !strategyResult && !error) return null;

  return (
    <div className="rounded-xl border border-border bg-card card-elevated">
      <div className="border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Shield className="h-4 w-4 text-accent" />
          {t("decode.replyStrategy")}
        </h2>
        {strategyResult && (
          <p className="mt-1 text-xs text-muted">
            {strategyResult.reasoning}
          </p>
        )}
      </div>

      {strategizing && !strategyResult && <SkeletonStrategy />}

      {!strategizing && error && !strategyResult && (
        <div className="m-5 rounded-xl border border-warning/25 bg-warning/[0.04] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">推荐邮件暂时没有生成</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">{error}</p>
            </div>
          </div>
        </div>
      )}

      {strategyResult && (
        <>
        {(!strategyResult.strategies || strategyResult.strategies.length === 0) && (
          <div className="m-5 rounded-xl border border-warning/25 bg-warning/[0.04] p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-semibold text-foreground">推荐邮件为空</p>
                <p className="mt-1 text-sm leading-relaxed text-secondary">
                  解读已经完成，但策略模型没有返回可展示的邮件草稿。请重新生成，或先根据上方判断手动撰写。
                </p>
              </div>
            </div>
          </div>
        )}

        {savedAccountId && (
          <div className="border-b border-border px-5 py-3 bg-gradient-to-r from-accent/5 to-accent/10">
            <p className="mb-2 text-xs font-semibold text-foreground">
              🎯 下一步行动建议
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/accounts/${savedAccountId}?tab=plays`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <Target className="h-4 w-4" />
                创建谋局方案
              </Link>
              {opportunity && (
                <Link
                  href={`/pipeline/${opportunity.id}?tab=meeting`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  准备会议 Briefing
                </Link>
              )}
              <Link
                href={`/compose?to=&accountId=${savedAccountId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
              >
                <Mail className="h-3.5 w-3.5" />
                撰写邮件
              </Link>
              <Link
                href={`/tasks?accountId=${savedAccountId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
              >
                <Briefcase className="h-3.5 w-3.5" />
                查看任务
              </Link>
              <Link
                href={`/accounts/${savedAccountId}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5"
              >
                查看客户档案
              </Link>
              <SaveToKnowledgeButton
                accountId={savedAccountId}
                title={`策略建议：${strategyResult.strategies[strategyResult.recommended ?? 0]?.name ?? '回复策略'}`}
                content={[
                  strategyResult.reasoning,
                  ...strategyResult.strategies.map((s) => `${s.name}：${s.approach}`),
                ].filter(Boolean).join('\n')}
                category="ai_insight"
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 items-start">
          {strategyResult.strategies.map((strategy, i) => {
            const isRecommended = i === strategyResult.recommended;
            return (
              <div
                key={i}
                className={`flex h-[760px] flex-col rounded-xl border p-4 transition-colors duration-150 ${
                  isRecommended
                    ? "border-accent/25 bg-accent/[0.03] strategy-recommended"
                    : "border-border bg-sidebar"
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {strategy.name}
                      {isRecommended && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-accent">
                          {t("decode.recommended")}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-xs text-accent">{strategy.goal}</p>
                  </div>
                </div>

                <p className="mb-3 line-clamp-4 text-xs leading-relaxed text-secondary">{strategy.approach}</p>

                <div className="mb-3 flex items-center gap-4 border-t border-border pt-3 text-xs">
                  <span className="text-muted">
                    {t("decode.tone")} <span className="font-medium text-foreground">{strategy.tone}</span>
                  </span>
                  <span className="text-muted">
                    {t("decode.timing")} <span className="font-medium text-foreground">{strategy.urgency}</span>
                  </span>
                </div>

                <div className="mt-3 flex min-h-0 flex-1 flex-col">
                  <div className="rounded-lg border border-border bg-background p-3 flex-1 overflow-y-auto overscroll-contain">
                    <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-secondary">
                      {strategy.draft}
                    </p>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <CopyButton text={strategy.draft} />
                    {addedStrategies.has(i) ? (
                      <span className="flex items-center gap-1 text-xs text-positive">
                        <CheckCircle2 className="h-3 w-3" />
                        已创建
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          addTask({
                            title: strategy.name,
                            description: strategy.approach + (strategy.draft ? '\n\n草稿：' + strategy.draft : ''),
                            status: 'todo',
                            priority: strategy.urgency === '立即' || strategy.urgency === '紧急' ? 'high' : 'medium',
                            source: 'decode',
                            aiGenerated: true,
                            accountId: savedAccountId || undefined,
                            opportunityId: opportunityId,
                          });
                          setAddedStrategies((prev) => new Set(prev).add(i));
                        }}
                        className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        创建跟进任务
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
