"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Bell, ChevronRight, Building2, User, Target, X, Menu, LogOut, Settings, ClipboardCheck, Radio, BookOpen, ScanSearch, Clock, Calendar as CalendarIcon } from "lucide-react";
import { ROLE_LEVEL_LABELS } from "@/lib/babel-engine/types";
import { useStore } from "@/lib/store";
import { useNotifications } from "@/components/dashboard/notifications";
import { useSidebar } from "@/components/dashboard/sidebar-context";
import { useAuth } from "@/lib/auth-context";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";

const ROUTE_LABEL_KEYS: Record<string, TranslationKey> = {
  horizon: "route.horizon",
  decode: "route.decode",
  atlas: "route.atlas",
  compass: "route.compass",
  arena: "route.arena",
  plays: "route.plays",
  pulse: "route.pulse",
  compose: "route.compose",
  forge: "route.forge",
  help: "route.help",
  // Legacy routes
  dashboard: "route.dashboard",
  accounts: "route.accounts",
  pipeline: "route.pipeline",
  reports: "route.reports",
  performance: "route.performance",
  leaderboard: "route.leaderboard",
  forecast: "route.forecast",
  intel: "route.intel",
  knowledge: "route.knowledge",
  settings: "route.settings",
  products: "nav.products",
  pool: "nav.pool",
  notifications: "route.notifications",
};

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const { accounts, opportunities } = useRoleFilteredData();
  const { t } = useLocale();

  if (segments.length === 0) return null;

  function resolveLabel(segment: string, idx: number): string {
    if (ROUTE_LABEL_KEYS[segment]) return t(ROUTE_LABEL_KEYS[segment]);
    if (idx > 0 && segments[idx - 1] === "accounts") {
      const account = accounts.find((a) => a.id === segment);
      if (account) return account.name;
    }
    if (idx > 0 && segments[idx - 1] === "pipeline") {
      const opp = opportunities.find((o) => o.id === segment);
      if (opp) return opp.name;
    }
    if (idx > 0 && segments[idx - 1] === "contacts") {
      for (const acc of accounts) {
        const contact = acc.contacts.find((c) => c.id === segment);
        if (contact) return contact.name;
      }
    }
    return segment;
  }

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {segments.map((segment, idx) => {
        const href = "/" + segments.slice(0, idx + 1).join("/");
        const label = resolveLabel(segment, idx);
        const isLast = idx === segments.length - 1;

        return (
          <span key={href} className="flex items-center gap-1.5">
            {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-[var(--chrome-ink-sub)]" />}
            {isLast ? (
              <span className="font-medium text-[var(--chrome-ink)]">{label}</span>
            ) : (
              <Link href={href} className="text-[var(--chrome-ink-sub)] transition-colors hover:text-[var(--chrome-ink)]">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

interface SearchResult {
  type: "account" | "contact" | "opportunity" | "task" | "intel" | "knowledge" | "decode";
  label: string;
  sub: string;
  href: string;
}

const TYPE_SECTION_LABELS: Record<SearchResult["type"], TranslationKey> = {
  account: "search.type.account",
  contact: "search.type.contact",
  opportunity: "search.type.opportunity",
  task: "search.type.task",
  intel: "search.type.intel",
  knowledge: "search.type.knowledge",
  decode: "search.type.decode",
};

export function Topbar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const roleLevel = jobLevel >= 2 ? 'executive' : jobLevel >= 1 ? 'director' : 'ae';
  const { t } = useLocale();
  const userName = useStore((s) => s.userSettings.displayName) || "Closr";
  const userRole = useStore((s) => s.userSettings.roleDescription);
  const notifications = useNotifications();
  const badgeCount = notifications.filter(
    (n) => n.severity === "critical" || n.severity === "warning"
  ).length;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { accounts, opportunities, tasks, intelItems, emailDecodes } = useRoleFilteredData();
  const knowledgeItems = useStore((s) => s.knowledgeItems);

  // Search history
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("closr-search-history");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage on mount
      if (stored) setSearchHistory(JSON.parse(stored));
    } catch {}
  }, []);
  const addToSearchHistory = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setSearchHistory((prev) => {
      const next = [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 5);
      localStorage.setItem("closr-search-history", JSON.stringify(next));
      return next;
    });
  };

  // Determine display name
  const displayName = user?.email?.split("@")[0] || userName;
  const displaySub = user?.email || userRole || ROLE_LEVEL_LABELS[roleLevel];

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen]);

  // Close search on Escape
  useEffect(() => {
    if (!searchOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  // Autofocus search
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Close notification panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [userMenuOpen]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: SearchResult[] = [];

    for (const account of accounts) {
      if (account.name.toLowerCase().includes(q) || account.industry?.toLowerCase().includes(q)) {
        results.push({ type: "account", label: account.name, sub: account.industry || t("search.sub.account"), href: `/accounts/${account.id}` });
      }
      for (const contact of account.contacts) {
        if (contact.name.toLowerCase().includes(q) || contact.title?.toLowerCase().includes(q) || contact.email?.toLowerCase().includes(q)) {
          results.push({ type: "contact", label: contact.name, sub: `${contact.title || ""} · ${account.name}`, href: `/contacts/${contact.id}` });
        }
      }
    }

    for (const opp of opportunities) {
      if (opp.name.toLowerCase().includes(q)) {
        results.push({ type: "opportunity", label: opp.name, sub: t("search.sub.opportunity"), href: `/pipeline/${opp.id}` });
      }
    }

    // Tasks
    for (const task of tasks) {
      if (task.title.toLowerCase().includes(q) || task.description?.toLowerCase().includes(q)) {
        results.push({ type: "task", label: task.title, sub: `${t("search.sub.task")} · ${task.status}`, href: "/tasks" });
      }
    }

    // Intel
    for (const item of intelItems) {
      if (item.title.toLowerCase().includes(q) || item.content?.toLowerCase().includes(q)) {
        results.push({ type: "intel", label: item.title, sub: t("search.sub.intel"), href: "/intel" });
      }
    }

    // Knowledge (knowledge page removed; link to forge)
    for (const k of knowledgeItems) {
      if (k.title.toLowerCase().includes(q) || k.content?.toLowerCase().includes(q)) {
        results.push({ type: "knowledge", label: k.title, sub: t("search.sub.knowledge"), href: "/forge" });
      }
    }

    // Decodes
    for (const d of emailDecodes) {
      if (d.emailText?.toLowerCase().includes(q) || d.clientName?.toLowerCase().includes(q)) {
        results.push({ type: "decode", label: d.clientName || t("search.sub.decodeRecord"), sub: d.accountName || t("search.sub.babelDecode"), href: "/decode" });
      }
    }

    return results;
  }, [searchQuery, accounts, opportunities, tasks, intelItems, knowledgeItems, emailDecodes, t]);

  // Group results by type, max 3 per group
  const groupedResults = useMemo(() => {
    const groups: Partial<Record<SearchResult["type"], SearchResult[]>> = {};
    for (const r of searchResults) {
      if (!groups[r.type]) groups[r.type] = [];
      if (groups[r.type]!.length < 3) groups[r.type]!.push(r);
    }
    return groups;
  }, [searchResults]);

  const resultIcons: Record<SearchResult["type"], React.ComponentType<{ className?: string }>> = {
    account: Building2,
    contact: User,
    opportunity: Target,
    task: ClipboardCheck,
    intel: Radio,
    knowledge: BookOpen,
    decode: ScanSearch,
  };

  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-[4.25rem] items-center justify-between border-b border-[var(--chrome-border)]/90 bg-[var(--chrome-card)]/95 backdrop-blur-sm px-3 sm:px-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Left: hamburger + breadcrumbs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={t("nav.openSidebar")}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[var(--chrome-ink-sub)] transition-colors duration-150 hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)] md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden sm:block">
          <Breadcrumbs />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div ref={searchRef} className="relative">
          {searchOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Search className="h-4 w-4 flex-shrink-0 text-[var(--chrome-ink-sub)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("search.placeholder")}
                  className="w-32 bg-transparent text-sm text-[#F3EFEB] placeholder-[var(--chrome-ink-dim)] outline-none sm:w-52"
                />
                <button type="button" aria-label={t("search.close")} onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
                  <X className="h-4 w-4 text-[var(--chrome-ink-sub)] hover:text-[var(--chrome-ink)]" />
                </button>
              </div>

              {/* Dropdown */}
              {searchQuery.trim() ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-96 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/8 bg-[var(--chrome-card)] shadow-2xl">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-[var(--chrome-ink-sub)]">{t("search.noResults")}</p>
                  ) : (
                    (Object.keys(groupedResults) as SearchResult["type"][]).map((type) => (
                      <div key={type}>
                        <div className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-[var(--chrome-ink-dim)]">
                          {t(TYPE_SECTION_LABELS[type])}
                        </div>
                        {groupedResults[type]!.map((r, i) => {
                          const Icon = resultIcons[r.type];
                          return (
                            <button
                              key={`${r.type}-${r.href}-${i}`}
                              type="button"
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                              onClick={() => {
                                addToSearchHistory(searchQuery.trim());
                                router.push(r.href);
                                setSearchOpen(false);
                                setSearchQuery("");
                              }}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0 text-[var(--chrome-ink-dim)]" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-[#F3EFEB]">{r.label}</p>
                                <p className="truncate text-xs text-[var(--chrome-ink-sub)]">{r.sub}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              ) : searchOpen && searchHistory.length > 0 ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/8 bg-[var(--chrome-card)] shadow-2xl">
                  <div className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-[var(--chrome-ink-dim)]">
                    {t("search.recent")}
                  </div>
                  {searchHistory.map((term, i) => (
                    <button
                      key={`history-${i}`}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                      onClick={() => setSearchQuery(term)}
                    >
                      <Clock className="h-4 w-4 flex-shrink-0 text-[var(--chrome-ink-dim)]" />
                      <p className="truncate text-sm text-[var(--chrome-ink-sub)]">{term}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              aria-label={t("search.open")}
              onClick={() => setSearchOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[var(--chrome-ink-sub)] transition-colors duration-150 hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>

        {/* Calendar button */}
        <button
          type="button"
          aria-label={t("calendar.open")}
          onClick={() => router.push("/calendar")}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[var(--chrome-ink-sub)] transition-colors duration-150 hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
        >
          <CalendarIcon className="h-[18px] w-[18px]" />
        </button>

        {/* Notification button + dropdown */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            aria-label={t("notifications.open")}
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[var(--chrome-ink-sub)] transition-colors duration-150 hover:border-white/6 hover:bg-white/4 hover:text-[var(--chrome-ink)]"
          >
            <Bell className="h-[18px] w-[18px]" />
            {badgeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold leading-none text-white">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-white/8 bg-[var(--chrome-card)] shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--chrome-border)] bg-[var(--chrome-card)] px-4 py-3 rounded-t-2xl">
                <span className="text-sm font-semibold text-[var(--chrome-ink)]">{t("nav.notifications")}</span>
                <button onClick={() => { setNotifOpen(false); router.push("/notifications"); }} className="text-[13px] text-accent hover:underline">{t("dashboard.viewAll")}</button>
              </div>
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[var(--chrome-ink-sub)]">{t("notifications.empty")}</p>
              ) : (
                <div className="divide-y divide-[var(--chrome-border)]">
                  {notifications.slice(0, 8).map((n, i) => (
                    <div key={i} className="px-4 py-3 hover:bg-white/4 transition-colors">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${n.severity === 'critical' ? 'bg-red-500' : n.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--chrome-ink)] leading-snug line-clamp-2">{n.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-[var(--chrome-border)]" />

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            aria-label={t("userMenu.open")}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-1.5 transition-colors duration-150 hover:border-white/6 hover:bg-white/4"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/7 text-sm font-semibold text-[var(--chrome-ink)]">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium leading-tight text-[var(--chrome-ink)]">{displayName}</p>
              <p className="max-w-[140px] truncate text-xs leading-tight text-[var(--chrome-ink-sub)]">{displaySub}</p>
            </div>
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/8 bg-[var(--chrome-card)] shadow-2xl">
              {/* User info */}
              <div className="border-b border-[#383639] px-4 py-3">
                <p className="text-sm font-medium text-[var(--chrome-ink)]">{displayName}</p>
                <p className="truncate text-xs text-[var(--chrome-ink-sub)]">{displaySub}</p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/forge");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--chrome-ink-sub)] transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--chrome-ink)]"
                >
                  <Settings className="h-4 w-4" />
                  {t("topbar.personalSettings")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger/80 transition-colors hover:bg-[rgba(255,255,255,0.05)] hover:text-danger"
                >
                  <LogOut className="h-4 w-4" />
                  {t("topbar.signOut")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
