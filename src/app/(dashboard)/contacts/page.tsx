"use client";

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Download, User2, Mail } from "lucide-react";
import { useSelection } from "@/hooks/use-selection";
import { useLocale } from "@/lib/i18n";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import type { ContactRole, DecisionStyle } from "@/lib/babel-engine/types";
import { ROLE_LABELS, DISC_LABELS } from "@/lib/constants";
interface ContactRow {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  accountId: string;
  accountName: string;
  role: string;
  decisionStyle: DecisionStyle | null;
  hasProfile: boolean;
  lastContactedAt: string | null;
}
export default function ContactsPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const {
    accounts
  } = useRoleFilteredData();
  const {
    t
  } = useLocale();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterDisc, setFilterDisc] = useState("all");
  const [filterHasProfile, setFilterHasProfile] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "account" | "role">("name");

  // Flatten contacts from accounts
  const allContacts: ContactRow[] = useMemo(() => {
    return accounts.flatMap(account => (account.contacts || []).map(c => ({
      id: c.id,
      name: c.name,
      title: c.title || "",
      email: c.email || "",
      phone: c.phone || "",
      accountId: account.id,
      accountName: account.name,
      role: c.role || "",
      decisionStyle: c.decisionStyle || c.contactProfile?.decisionStyle?.type || null,
      hasProfile: !!c.contactProfile || !!c.decisionStyle,
      lastContactedAt: c.lastContactedAt || null
    })));
  }, [accounts]);

  // Filter & sort
  const filtered = useMemo(() => {
    let list = allContacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.accountName.toLowerCase().includes(q) || c.title.toLowerCase().includes(q));
    }
    if (filterRole !== "all") list = list.filter(c => c.role === filterRole);
    if (filterDisc !== "all") list = list.filter(c => c.decisionStyle === filterDisc);
    if (filterHasProfile !== "all") list = list.filter(c => filterHasProfile === "yes" ? c.hasProfile : !c.hasProfile);
    if (filterAccount !== "all") list = list.filter(c => c.accountId === filterAccount);
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "account") return a.accountName.localeCompare(b.accountName);
      return a.role.localeCompare(b.role);
    });
    return list;
  }, [allContacts, search, filterRole, filterDisc, filterHasProfile, filterAccount, sortBy]);

  // CSV Export
  const exportCSV = () => {
    const headers = ["姓名", "职位", "邮箱", "电话", "公司", "角色", "DISC类型", "有画像"];
    const rows = filtered.map(c => [c.name, c.title, c.email, c.phone, c.accountName, ROLE_LABELS[c.role] || c.role, c.decisionStyle ? DISC_LABELS[c.decisionStyle]?.label || c.decisionStyle : "", c.hasProfile ? "是" : "否"]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 批量选择 ──
  const selection = useSelection(filtered);
  function handleExportSelected() {
    const selected = filtered.filter(c => selection.selectedIds.has(c.id));
    const headers = ["姓名", "职位", "邮箱", "电话", "公司", "角色", "DISC类型", "有画像"];
    const rows = selected.map(c => [c.name, c.title, c.email, c.phone, c.accountName, ROLE_LABELS[c.role] || c.role, c.decisionStyle ? DISC_LABELS[c.decisionStyle]?.label || c.decisionStyle : "", c.hasProfile ? "是" : "否"]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-selected-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const uniqueRoles = [...new Set(allContacts.map(c => c.role).filter(Boolean))];
  const uniqueAccounts = [...new Map(accounts.map(a => [a.id, a.name])).entries()];
  return <div className="mx-auto max-w-7xl space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            <User2 className="mr-2 inline-block h-6 w-6" />
            {t("nav.contacts")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} / {allContacts.length}{tx("人")}</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background">
          <Download className="h-4 w-4" />{tx("导出 CSV")}</button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={tx("搜索姓名、邮箱、公司、职位...")} className="form-input w-full" style={{
          paddingLeft: "2.25rem"
        }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{tx("全部公司")}</option>
            {uniqueAccounts.map(([id, name]) => <option key={id} value={id}>
                {name}
              </option>)}
          </select>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{tx("全部角色")}</option>
            {uniqueRoles.map(r => <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>)}
          </select>
          <select value={filterDisc} onChange={e => setFilterDisc(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{tx("全部 DISC")}</option>
            <option value="driver">{tx("D 驱动型")}</option>
            <option value="analytical">{tx("A 分析型")}</option>
            <option value="amiable">{tx("A 亲和型")}</option>
            <option value="expressive">{tx("E 表现型")}</option>
          </select>
          <select value={filterHasProfile} onChange={e => setFilterHasProfile(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{tx("全部画像")}</option>
            <option value="yes">{tx("有画像")}</option>
            <option value="no">{tx("无画像")}</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as "name" | "account" | "role")} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="name">{tx("按姓名排序")}</option>
            <option value="account">{tx("按公司排序")}</option>
            <option value="role">{tx("按角色排序")}</option>
          </select>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selection.count > 0 && <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 mb-3">
          <span className="text-sm font-medium text-accent">{tx("已选")}{selection.count}{tx("项")}</span>
          <button onClick={handleExportSelected} className="text-xs text-accent hover:underline">{tx("导出CSV")}</button>
          <button onClick={selection.clearAll} className="ml-auto text-xs text-muted hover:text-foreground">{tx("取消选择")}</button>
        </div>}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden gap-2 border-b border-border px-4 py-2 text-[12px] font-semibold uppercase text-secondary sm:grid sm:grid-cols-[32px_1fr_150px_120px_100px_80px_40px]">
          <span>
            <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} className="h-4 w-4 rounded border-border accent-accent cursor-pointer" />
          </span>
          <span>{tx("联系人")}</span>
          <span>{tx("公司")}</span>
          <span>{tx("角色")}</span>
          <span>DISC</span>
          <span>{tx("画像")}</span>
          <span></span>
        </div>
        {filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted">{tx("没有匹配的联系人")}</div> : filtered.map(c => <div key={c.id} className="grid items-center gap-2 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-background sm:grid-cols-[32px_1fr_150px_120px_100px_80px_40px]">
              <div className="hidden sm:block">
                <input type="checkbox" checked={selection.isSelected(c.id)} onChange={() => selection.toggle(c.id)} className="h-4 w-4 rounded border-border accent-accent cursor-pointer" />
              </div>
              <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-secondary">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {c.name}
                  </p>
                  <p className="text-[12px] text-muted">{c.title}</p>
                </div>
              </Link>
              <Link href={`/accounts/${c.accountId}`} className="truncate text-xs text-secondary hover:text-accent hover:underline">
                {c.accountName}
              </Link>
              <span className="text-[12px] text-muted">
                {ROLE_LABELS[c.role] || c.role}
              </span>
              {c.decisionStyle && DISC_LABELS[c.decisionStyle] ? <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${DISC_LABELS[c.decisionStyle].color}`}>
                  {DISC_LABELS[c.decisionStyle].label}
                </span> : <span className="text-[12px] text-muted">&mdash;</span>}
              <span className={`text-[12px] ${c.hasProfile ? "text-positive" : "text-muted"}`}>
                {c.hasProfile ? "有" : "&mdash;"}
              </span>
              {c.email ? <Link href={`/compose?to=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}&title=${encodeURIComponent(c.title)}&accountId=${encodeURIComponent(c.accountId)}&contactId=${encodeURIComponent(c.id)}`} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent/10 hover:text-accent" title={tx("发邮件")}>
                  <Mail className="h-3.5 w-3.5" />
                </Link> : <span />}
            </div>)}
      </div>
    </div>;
}