"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  ScanSearch,
  Building2,
  GitBranch,
  LineChart,
  ClipboardList,
  UserPlus,
  Settings2,
  CircleHelp,
  Trophy,
  TrendingUp,
  Target,
  X,
} from "lucide-react";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { ClosrLogo } from "@/components/ui/closr-logo";

interface MenuItem {
  nameKey: TranslationKey;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DECODE_ITEM: MenuItem = { nameKey: "nav.decode", href: "/decode", icon: ScanSearch };

const NAV_ITEMS: MenuItem[] = [
  { nameKey: "nav.horizon", href: "/horizon", icon: LayoutDashboard },
  { nameKey: "nav.plays", href: "/plays", icon: Target },
  { nameKey: "nav.atlas", href: "/atlas", icon: Building2 },
  { nameKey: "nav.leads", href: "/leads", icon: UserPlus },
  { nameKey: "nav.pipeline", href: "/pipeline", icon: GitBranch },
  { nameKey: "nav.pulse", href: "/pulse", icon: ClipboardList },
];

const REPORT_NAV_ITEMS: MenuItem[] = [
  { nameKey: "nav.reports", href: "/reports", icon: BarChart3 },
  { nameKey: "nav.performance", href: "/performance", icon: LineChart },
  { nameKey: "nav.leaderboard", href: "/leaderboard", icon: Trophy },
  { nameKey: "nav.forecast", href: "/forecast", icon: TrendingUp },
];

const BOTTOM_NAV: MenuItem = { nameKey: "nav.forge", href: "/forge", icon: Settings2 };
const HELP_NAV: MenuItem = { nameKey: "nav.help", href: "/help", icon: CircleHelp };
const HELP_HIGHLIGHT_KEY = "closr-help-center-highlight-seen-v1";

export function Sidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();
  const { orgName } = useAuth();
  const { t } = useLocale();
  const visibleNavItems = NAV_ITEMS;
  const reportsActive = REPORT_NAV_ITEMS.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  const [reportsOpen, setReportsOpen] = useState(reportsActive);
  const reportsExpanded = reportsOpen || reportsActive;
  const [showHelpHighlight, setShowHelpHighlight] = useState(false);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (pathname === "/help" || pathname.startsWith("/help/")) return;
    try {
      if (localStorage.getItem(HELP_HIGHLIGHT_KEY)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setShowHelpHighlight(true), 1200);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const markHelpHighlightSeen = () => {
    try { localStorage.setItem(HELP_HIGHLIGHT_KEY, "1"); } catch { /* ignore */ }
    setShowHelpHighlight(false);
  };

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
      {/* Logo + Org Name */}
      <div className="flex min-h-[5.25rem] items-center justify-between px-5 pt-5 pb-4">
        <div className="flex min-w-0 flex-col">
          <ClosrLogo size="lg" variant="dark" />
          {orgName && (
            <span className="mt-1 block truncate text-[13px] text-[var(--chrome-ink-sub)]/90">
              {orgName}
            </span>
          )}
        </div>
        <button
          onClick={close}
          aria-label={t("nav.closeSidebar")}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--chrome-ink-sub)] transition-colors hover:bg-white/5 hover:text-[var(--chrome-ink)] md:hidden"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="mb-3 px-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--chrome-ink-dim)]">
          {t("nav.workspace")}
        </div>
        <div className="space-y-1">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const name = t(item.nameKey);
            return (
              <Link
                key={item.nameKey}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[16px] font-medium transition-colors duration-150 ${
                  isActive
                    ? "border border-white/7 bg-white/8 text-[var(--chrome-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "border border-transparent text-[var(--chrome-ink-sub)] hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${isActive ? "border-white/10 bg-white/8 text-[var(--chrome-ink)]" : "border-transparent bg-transparent text-[var(--chrome-ink-dim)] group-hover:border-white/6 group-hover:bg-white/4 group-hover:text-[var(--chrome-ink-sub)]"}`}>
                  <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                </span>
                <span className="flex-1 truncate">{name}</span>
              </Link>
            );
          })}
          <div>
            <button
              type="button"
              onClick={() => setReportsOpen((value) => !value)}
              aria-expanded={reportsExpanded}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[16px] font-medium transition-colors duration-150 ${
                reportsActive
                  ? "border border-white/7 bg-white/8 text-[var(--chrome-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "border border-transparent text-[var(--chrome-ink-sub)] hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${reportsActive ? "border-white/10 bg-white/8 text-[var(--chrome-ink)]" : "border-transparent bg-transparent text-[var(--chrome-ink-dim)] group-hover:border-white/6 group-hover:bg-white/4 group-hover:text-[var(--chrome-ink-sub)]"}`}>
                <BarChart3 className="h-[18px] w-[18px] flex-shrink-0" />
              </span>
              <span className="flex-1 truncate text-left">{t("nav.reports")}</span>
              <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[var(--chrome-ink-dim)] transition-transform ${reportsExpanded ? "rotate-180" : ""}`} />
            </button>
            {reportsExpanded && (
              <div className="mt-1 space-y-0.5 pl-11">
                {REPORT_NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const name = t(item.nameKey);
                  return (
                    <Link
                      key={item.nameKey}
                      href={item.href}
                      className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors duration-150 ${
                        isActive
                          ? "bg-white/8 text-[var(--chrome-ink)]"
                          : "text-[var(--chrome-ink-sub)] hover:bg-white/4 hover:text-[var(--chrome-ink)]"
                      }`}
                    >
                      <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-[var(--chrome-ink)]" : "text-[var(--chrome-ink-dim)] group-hover:text-[var(--chrome-ink-sub)]"}`} />
                      <span className="flex-1 truncate">{name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Bottom — Decode + settings + version */}
      <div className="shrink-0 border-t border-[var(--chrome-border)]/90 px-4 py-3 space-y-1.5">
        {/* Decode — prominent CTA */}
        <Link
          href={DECODE_ITEM.href}
          className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-3 text-[16px] font-semibold transition-colors duration-150 ${
            pathname === DECODE_ITEM.href || pathname.startsWith(DECODE_ITEM.href + "/")
              ? "bg-[var(--accent-primary)] text-white shadow-[0_2px_8px_rgba(223,37,49,0.3)]"
              : "bg-[var(--accent-primary)]/90 text-white hover:bg-[var(--accent-primary)] hover:shadow-[0_2px_8px_rgba(223,37,49,0.3)]"
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
            <DECODE_ITEM.icon className="h-[18px] w-[18px]" />
          </span>
          <span className="flex-1">{t(DECODE_ITEM.nameKey)}</span>
        </Link>
        {(() => {
          const isActive = pathname === BOTTOM_NAV.href || pathname.startsWith(BOTTOM_NAV.href + "/");
          const name = t(BOTTOM_NAV.nameKey);
          return (
            <Link
              href={BOTTOM_NAV.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[16px] font-medium transition-colors duration-150 ${
                isActive
                  ? "border border-white/7 bg-white/8 text-[var(--chrome-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "border border-transparent text-[var(--chrome-ink-sub)] hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${isActive ? "border-white/10 bg-white/8 text-[var(--chrome-ink)]" : "border-transparent bg-transparent text-[var(--chrome-ink-dim)] group-hover:border-white/6 group-hover:bg-white/4 group-hover:text-[var(--chrome-ink-sub)]"}`}>
                <BOTTOM_NAV.icon className="h-[18px] w-[18px] flex-shrink-0" />
              </span>
              <span className="flex-1 truncate">{name}</span>
            </Link>
          );
        })()}
        {(() => {
          const isActive = pathname === HELP_NAV.href || pathname.startsWith(HELP_NAV.href + "/");
          const name = t(HELP_NAV.nameKey);
          return (
            <div className="relative">
              <Link
                href={HELP_NAV.href}
                onClick={markHelpHighlightSeen}
                data-tour="help-center-entry"
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors duration-150 ${
                  isActive
                    ? "border border-white/7 bg-white/8 text-[var(--chrome-ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : showHelpHighlight
                      ? "border border-accent/45 bg-accent/14 text-[var(--chrome-ink)] shadow-[0_0_0_1px_rgba(223,37,49,0.12),0_0_24px_rgba(223,37,49,0.18)]"
                      : "border border-transparent text-[var(--chrome-ink-sub)] hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
                }`}
              >
                <span className={`relative flex h-8 w-8 items-center justify-center rounded-lg border ${isActive || showHelpHighlight ? "border-white/10 bg-white/8 text-[var(--chrome-ink)]" : "border-transparent bg-transparent text-[var(--chrome-ink-dim)] group-hover:border-white/6 group-hover:bg-white/4 group-hover:text-[var(--chrome-ink-sub)]"}`}>
                  {showHelpHighlight && <span className="absolute inset-0 rounded-lg bg-accent/30 animate-ping" />}
                  <HELP_NAV.icon className="relative h-[18px] w-[18px] flex-shrink-0" />
                </span>
                <span className="flex-1 truncate">{name}</span>
              </Link>
              {showHelpHighlight && (
                <div className="absolute bottom-full left-1/2 z-40 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-accent/25 bg-[var(--background)] p-3 text-[13px] leading-relaxed text-foreground shadow-2xl">
                  <p className="font-semibold">{t("nav.helpHighlightTitle")}</p>
                  <p className="mt-1 text-secondary">{t("nav.helpHighlightBody")}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Link href="/help" onClick={markHelpHighlightSeen} className="text-xs font-semibold text-accent hover:underline">{t("nav.helpHighlightOpen")}</Link>
                    <button type="button" onClick={markHelpHighlightSeen} className="text-xs text-muted hover:text-foreground">{t("nav.helpHighlightDismiss")}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <p className="px-3 pt-1 text-[13px] text-[var(--chrome-ink-dim)]">
          v1.0.0 · <span className="opacity-70">{t("common.poweredBy")}</span>
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden bg-[var(--chrome-bg)] md:flex" style={{ boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay with slide-in animation */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 animate-[fadeIn_200ms_ease-out]"
            onClick={close}
          />
          <aside className="relative flex h-full min-h-0 w-[280px] max-w-[85vw] flex-col overflow-hidden bg-[var(--chrome-bg)] animate-[slideInLeft_200ms_ease-out]">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
