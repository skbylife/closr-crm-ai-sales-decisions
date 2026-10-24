"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  Building2,
  Mail,
  ClipboardList,
  Radio,
  Swords,
  TrendingUp,
  Target,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

interface QuickAction {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: TranslationKey;
  color: string;
  primary?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/pipeline",
    icon: GitBranch,
    labelKey: "dashboard.createOpportunity",
    color: "text-accent",
    primary: true,
  },
  {
    href: "/accounts",
    icon: Building2,
    labelKey: "dashboard.addCustomer",
    color: "text-blue-500",
  },
  {
    href: "/decode",
    icon: Mail,
    labelKey: "dashboard.viewEmail",
    color: "text-warning",
  },
  {
    href: "/tasks",
    icon: ClipboardList,
    labelKey: "dashboard.createTask",
    color: "text-positive",
  },
  {
    href: "/intel",
    icon: Radio,
    labelKey: "dashboard.intelScan",
    color: "text-purple-500",
  },
  {
    href: "/plays",
    icon: Swords,
    labelKey: "dashboard.strategicPlays",
    color: "text-orange-500",
  },
  {
    href: "/forecast",
    icon: TrendingUp,
    labelKey: "dashboard.salesForecast",
    color: "text-teal-500",
  },
  {
    href: "/competitive-analysis",
    icon: Target,
    labelKey: "dashboard.competitiveInsights",
    color: "text-pink-500",
  },
];

export function QuickActions({ t }: { t: (key: TranslationKey) => string }) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const prefetchedHrefs = useMemo(() => QUICK_ACTIONS.map((action) => action.href), []);

  useEffect(() => {
    prefetchedHrefs.forEach((href) => router.prefetch(href));
  }, [prefetchedHrefs, router]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">快捷动作</h2>
        <span className="text-xs text-muted">常用功能快速入口</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-4">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              prefetch
              onMouseEnter={() => router.prefetch(action.href)}
              onFocus={() => router.prefetch(action.href)}
              onClick={() => {
                setPendingHref(action.href);
                startTransition(() => {
                  router.push(action.href);
                });
              }}
              className={`group relative flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-stripe hover:shadow-sm ${
                action.primary ? "ring-1 ring-accent/20 shadow-[0_0_0_1px_rgba(223,37,49,0.04)]" : ""
              } ${pendingHref === action.href ? "border-accent/40 bg-stripe" : ""}`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  action.primary ? "bg-accent/10" : "bg-background"
                } transition-transform duration-200 group-hover:scale-105`}
              >
                <Icon className={`h-4 w-4 ${action.color}`} />
              </div>
              <span className="text-[12px] font-medium leading-4 text-foreground [word-break:keep-all] [overflow-wrap:anywhere] whitespace-normal">
                {t(action.labelKey)}
              </span>
              {pendingHref === action.href && (
                <span className="text-[10px] text-accent">正在打开...</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
