"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  User,
  Target,
  CheckSquare,
  LayoutDashboard,
  Settings,
  BookOpen,
  ScanSearch,
  X,
  Clock,
  CircleHelp,
} from "lucide-react";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";

/* ─── 搜索结果类型定义 ─────────────────────────────────────────────── */

interface SearchResult {
  type: "account" | "contact" | "opportunity" | "task" | "page";
  label: string;
  sub: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  id?: string; // 用于最近访问记录
  recentlyAccessed?: number; // 最近访问时间戳
  exactMatch?: boolean; // 是否精确匹配
}

/* ─── 最近访问记录 ─────────────────────────────────────────────────── */

interface RecentItem {
  type: "account" | "contact" | "opportunity";
  id: string;
  label: string;
  sub: string;
  href: string;
  timestamp: number;
}

const RECENT_ITEMS_KEY = "closr:recent-items";
const MAX_RECENT_ITEMS = 8;

function getRecentItems(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_ITEMS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addRecentItem(item: Omit<RecentItem, "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentItems();
    const filtered = recent.filter((r) => !(r.type === item.type && r.id === item.id));
    const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT_ITEMS);
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
  } catch {
    // 忽略存储错误
  }
}

/* ─── 导航页面列表（静态快捷入口） ─────────────────────────────────── */

const PAGE_ITEMS: {
  nameKey: TranslationKey;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { nameKey: "nav.horizon", href: "/horizon", icon: LayoutDashboard },
  { nameKey: "nav.decode", href: "/decode", icon: ScanSearch },
  { nameKey: "nav.atlas", href: "/atlas", icon: Building2 },
  { nameKey: "nav.pipeline", href: "/pipeline", icon: Target },
  { nameKey: "nav.pulse", href: "/pulse", icon: CheckSquare },
  { nameKey: "nav.compose", href: "/compose", icon: BookOpen },
  { nameKey: "nav.forge", href: "/forge", icon: Settings },
  { nameKey: "nav.help", href: "/help", icon: CircleHelp },
];

/* ─── 分组标题映射 ─────────────────────────────────────────────────── */

const GROUP_LABEL_KEYS: Record<SearchResult["type"], TranslationKey> = {
  page: "cmdPalette.pages",
  account: "cmdPalette.accounts",
  contact: "cmdPalette.contacts",
  opportunity: "cmdPalette.pipeline",
  task: "cmdPalette.tasks",
};

/* ─── 组件 ─────────────────────────────────────────────────────────── */

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return <CommandPaletteContent onClose={onClose} />;
}

function CommandPaletteContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { accounts, opportunities, tasks } = useRoleFilteredData();

  /* 打开时聚焦输入框 */
  useEffect(() => {
    const frameId = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frameId);
  }, []);

  /* ─── 搜索逻辑 ───────────────────────────────────────────────────── */

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    const recentItems = getRecentItems();
    const recentMap = new Map(recentItems.map((r) => [`${r.type}:${r.id}`, r.timestamp]));

    /* 无搜索词时显示最近访问 + 页面快捷入口 */
    if (!q) {
      const items: SearchResult[] = [];

      // 最近访问的实际数据项
      for (const recent of recentItems) {
        if (recent.type === "account") {
          const acc = accounts.find((a) => a.id === recent.id);
          if (acc) {
            items.push({
              type: "account",
              label: acc.name,
              sub: acc.industry || t("cmdPalette.accounts"),
              href: `/accounts/${acc.id}`,
              icon: Building2,
              id: acc.id,
              recentlyAccessed: recent.timestamp,
            });
          }
        } else if (recent.type === "opportunity") {
          const opp = opportunities.find((o) => o.id === recent.id);
          if (opp) {
            items.push({
              type: "opportunity",
              label: opp.name,
              sub: t("cmdPalette.pipeline"),
              href: `/pipeline/${opp.id}`,
              icon: Target,
              id: opp.id,
              recentlyAccessed: recent.timestamp,
            });
          }
        }
        // contact 类型暂时跳过（因为联系人路由比较复杂）
      }

      // 页面快捷入口
      items.push(...PAGE_ITEMS.map((p) => ({
        type: "page" as const,
        label: t(p.nameKey),
        sub: "",
        href: p.href,
        icon: p.icon,
      })));

      return items.slice(0, 12);
    }

    const items: SearchResult[] = [];

    /* 页面匹配 */
    for (const p of PAGE_ITEMS) {
      const name = t(p.nameKey);
      const exactMatch = name.toLowerCase() === q;
      if (name.toLowerCase().includes(q) || p.href.includes(q)) {
        items.push({
          type: "page",
          label: name,
          sub: p.href,
          href: p.href,
          icon: p.icon,
          exactMatch,
        });
      }
    }

    /* 客户匹配 */
    for (const account of accounts) {
      const nameMatch = account.name.toLowerCase().includes(q);
      const industryMatch = account.industry?.toLowerCase().includes(q);
      const exactMatch = account.name.toLowerCase() === q;

      if (nameMatch || industryMatch) {
        const recentTimestamp = recentMap.get(`account:${account.id}`);
        items.push({
          type: "account",
          label: account.name,
          sub: account.industry || t("cmdPalette.accounts"),
          href: `/accounts/${account.id}`,
          icon: Building2,
          id: account.id,
          recentlyAccessed: recentTimestamp,
          exactMatch,
        });
      }

      /* 联系人匹配 */
      for (const contact of account.contacts) {
        const nameMatch = contact.name.toLowerCase().includes(q);
        const titleMatch = contact.title?.toLowerCase().includes(q);
        const emailMatch = contact.email?.toLowerCase().includes(q);
        const exactMatch = contact.name.toLowerCase() === q;

        if (nameMatch || titleMatch || emailMatch) {
          items.push({
            type: "contact",
            label: contact.name,
            sub: `${contact.title || ""} · ${account.name}`,
            href: `/accounts/${account.id}`,
            icon: User,
            id: contact.id,
            exactMatch,
          });
        }
      }
    }

    /* 商机匹配 */
    for (const opp of opportunities) {
      const exactMatch = opp.name.toLowerCase() === q;
      if (opp.name.toLowerCase().includes(q)) {
        const recentTimestamp = recentMap.get(`opportunity:${opp.id}`);
        items.push({
          type: "opportunity",
          label: opp.name,
          sub: t("cmdPalette.pipeline"),
          href: `/pipeline/${opp.id}`,
          icon: Target,
          id: opp.id,
          recentlyAccessed: recentTimestamp,
          exactMatch,
        });
      }
    }

    /* 任务匹配 */
    for (const task of tasks) {
      const exactMatch = task.title.toLowerCase() === q;
      if (task.title.toLowerCase().includes(q) || task.description?.toLowerCase().includes(q)) {
        items.push({
          type: "task",
          label: task.title,
          sub: task.status === "done" ? "✓" : task.priority,
          href: "/tasks",
          icon: CheckSquare,
          id: task.id,
          exactMatch,
        });
      }
    }

    // 智能排序：精确匹配 > 最近访问 > 普通匹配
    items.sort((a, b) => {
      // 1. 精确匹配优先
      if (a.exactMatch && !b.exactMatch) return -1;
      if (!a.exactMatch && b.exactMatch) return 1;

      // 2. 最近访问优先
      const aRecent = a.recentlyAccessed || 0;
      const bRecent = b.recentlyAccessed || 0;
      if (aRecent !== bRecent) return bRecent - aRecent;

      // 3. 字母顺序
      return a.label.localeCompare(b.label, 'zh-CN');
    });

    return items.slice(0, 15);
  }, [query, accounts, opportunities, tasks, t]);

  const currentActiveIndex = results[activeIndex] ? activeIndex : 0;

  /* ─── 选择结果并跳转 ─────────────────────────────────────────────── */

  const handleSelect = useCallback(
    (result: SearchResult) => {
      // 记录最近访问（仅限 account/opportunity/contact）
      if (result.id && (result.type === "account" || result.type === "opportunity" || result.type === "contact")) {
        addRecentItem({
          type: result.type,
          id: result.id,
          label: result.label,
          sub: result.sub,
          href: result.href,
        });
      }

      router.push(result.href);
      onClose();
    },
    [router, onClose]
  );

  /* ─── 键盘导航 ───────────────────────────────────────────────────── */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) {
        if (e.key === "Escape") {
          onClose();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === "Enter" && results[currentActiveIndex]) {
        e.preventDefault();
        handleSelect(results[currentActiveIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, currentActiveIndex, handleSelect, onClose]
  );

  /* 滚动到激活项 */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${currentActiveIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [currentActiveIndex]);

  /* ─── 按类型分组显示 ─────────────────────────────────────────────── */

  const grouped: { type: SearchResult["type"]; items: SearchResult[] }[] = [];

  for (const r of results) {
    const last = grouped[grouped.length - 1];
    if (last && last.type === r.type) {
      last.items.push(r);
    } else {
      grouped.push({ type: r.type, items: [r] });
    }
  }

  return (
    /* 遮罩层 */
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm animate-[fadeIn_100ms_ease-out]"
      onClick={onClose}
    >
      {/* 面板 */}
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-5 w-5 flex-shrink-0 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("cmdPalette.placeholder")}
            className="flex-1 bg-transparent text-[17px] text-[var(--foreground)] placeholder-[var(--text-secondary)] outline-none"
          />
          {/* 快捷键提示 / 关闭按钮 */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 搜索结果列表 */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              {t("cmdPalette.noResults")}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.type}>
                {/* 分组标题 */}
                {query.trim() && (
                  <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    {t(GROUP_LABEL_KEYS[group.type])}
                  </p>
                )}
                {group.items.map((item) => {
                  const idx = results.indexOf(item);
                  const Icon = item.icon;
                  const isRecent = !!item.recentlyAccessed;
                  return (
                    <button
                      key={`${item.type}-${item.href}-${idx}`}
                      type="button"
                      data-index={idx}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        idx === currentActiveIndex
                          ? "bg-accent/10 text-accent"
                          : "text-[var(--foreground)] hover:bg-[var(--border-subtle)]"
                      }`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 ${
                          idx === currentActiveIndex ? "text-accent" : "text-[var(--text-secondary)]"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">{item.label}</p>
                          {isRecent && !query.trim() && (
                            <Clock className="h-3 w-3 flex-shrink-0 text-[var(--text-secondary)] opacity-60" />
                          )}
                        </div>
                        {item.sub && (
                          <p className="truncate text-xs text-[var(--text-secondary)]">{item.sub}</p>
                        )}
                      </div>
                      {idx === currentActiveIndex && (
                        <span className="text-xs text-[var(--text-secondary)]">↵</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部快捷键提示 */}
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[12px] font-medium">↑↓</kbd>
            导航
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[12px] font-medium">↵</kbd>
            选择
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[12px] font-medium">Esc</kbd>
            关闭
          </span>
        </div>
      </div>
    </div>
  );
}
