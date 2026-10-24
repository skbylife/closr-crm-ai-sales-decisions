"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  X,
  ChevronRight,
  PartyPopper,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";

interface CheckItem {
  label: string;
  done: boolean;
  href?: string;
  actionLabel?: string;
}

export function GettingStartedCard() {
  const [dismissed, setDismissed] = useState(true); // default hidden until hydrated
  const [plays, setPlays] = useState<{ id: string }[]>([]);
  const { locale } = useLocale();
  const en = locale === "en";

  const accounts = useStore((s) => s.accounts);
  const opportunities = useStore((s) => s.opportunities);
  const tasks = useStore((s) => s.tasks);

  // Check localStorage on mount
  useEffect(() => {
    const d = localStorage.getItem("closr-onboarding-dismissed");
    const frame = window.requestAnimationFrame(() => {
      setDismissed(d === "1");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Fetch plays
  useEffect(() => {
    fetch("/api/strategic-play")
      .then((r) => r.json())
      .then((data) => setPlays(data.plays ?? []))
      .catch(() => {});
  }, []);

  const hasContacts = useMemo(
    () => accounts.some((a) => a.contacts && a.contacts.length > 0),
    [accounts]
  );

  const firstAccountId = accounts[0]?.id;

  const items: CheckItem[] = useMemo(
    () => [
      { label: en ? "Create organization" : "创建组织", done: true },
      {
        label: en ? "Add first account" : "添加第一个客户",
        done: accounts.length > 0,
        href: "/accounts",
        actionLabel: en ? "Add account" : "添加客户",
      },
      {
        label: en ? "Create first opportunity" : "创建第一个商机",
        done: opportunities.length > 0,
        href: "/pipeline",
        actionLabel: en ? "Create opportunity" : "创建商机",
      },
      {
        label: en ? "Add key contacts" : "添加关键联系人",
        done: hasContacts,
        href: firstAccountId
          ? `/accounts/${firstAccountId}?tab=contacts`
          : "/accounts",
        actionLabel: en ? "Add contacts" : "添加联系人",
      },
      {
        label: en ? "Create a customer play" : "为客户创建谋局",
        done: plays.length > 0,
        href: "/plays",
        actionLabel: en ? "Create play" : "创建谋局",
      },
      {
        label: en ? "Create first task" : "创建第一个任务",
        done: tasks.length > 0,
        href: "/tasks",
        actionLabel: en ? "Create task" : "创建任务",
      },
    ],
    [accounts.length, opportunities.length, tasks.length, hasContacts, plays.length, firstAccountId, en]
  );

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem("closr-onboarding-dismissed", "1");
    setDismissed(true);
  }

  return (
    <div className="card-elevated rounded-xl border border-border bg-card p-5 relative">
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-secondary hover:bg-background hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      {allDone ? (
        <div className="flex flex-col items-center py-4 text-center">
          <PartyPopper className="h-10 w-10 text-warning mb-3" />
          <h3 className="text-base font-semibold text-foreground">
            {en ? "You have completed every onboarding step" : "恭喜！你已完成所有引导步骤"}
          </h3>
          <p className="mt-1 text-sm text-secondary">
            {en ? "You can now use the full Closr workspace" : "现在可以开始全力使用 Closr 了"}
          </p>
          <button
            onClick={handleDismiss}
            className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            {en ? "Close guide" : "关闭引导"}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 pr-6">
            <h3 className="text-sm font-semibold text-foreground">
              {en ? "Getting started" : "快速上手"}
            </h3>
            <p className="mt-0.5 text-xs text-secondary">
              {doneCount}/{items.length} {en ? "done" : "完成"}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-4 h-1.5 rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-all duration-400"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-positive flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-secondary/40 flex-shrink-0" />
                  )}
                  <span
                    className={
                      item.done
                        ? "text-secondary line-through"
                        : "text-foreground"
                    }
                  >
                    {item.label}
                  </span>
                </div>
                {!item.done && item.href && (
                  <Link
                    href={item.href}
                    className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover transition-colors flex-shrink-0"
                  >
                    {item.actionLabel}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
