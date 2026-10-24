"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  AlertTriangle,
  Users,
  X,
  ChevronRight,
  Download,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import { downloadCsv } from "@/lib/export-csv";
import { useSelection } from "@/hooks/use-selection";
import { canViewScope, getDefaultScope, getEffectiveScope, type DataScope } from "@/lib/permissions";
import { timeAgo } from "@/lib/time-utils";
import { DEAL_STAGES, STAGE_LABELS, HEALTH_CONFIG, INDUSTRIES } from "@/lib/constants";
import { RoleFocusBanner } from "@/components/shared/role-focus-banner";

// ─── Constants ───────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────

// ─── Add Account Modal ───────────────────────────────────────────────

function AddAccountModal({ onClose, getOwnerName }: { onClose: () => void; getOwnerName: (userId?: string) => string }) {
  const { addAccount, accounts } = useStore();
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [dealStage, setDealStage] = useState("");
  const [dealValue, setDealValue] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    // 防撞单：检查同名客户
    const existingAccount = accounts.find(
      a => a.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (existingAccount) {
      const confirmed = await appConfirm({
        message: `已有同名客户「${existingAccount.name}」${existingAccount.userId ? '（负责人：' + getOwnerName(existingAccount.userId) + '）' : '（公海池）'}。确定要创建吗？`,
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    addAccount({
      name: name.trim(),
      industry: industry || undefined,
      website: website.trim() || undefined,
      notes: notes.trim() || undefined,
      dealStage: dealStage || undefined,
      dealValue: dealValue ? Number(dealValue) : undefined,
      dealHealth: "healthy",
      lastActivity: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="card-elevated mx-3 w-full max-w-md rounded-2xl border border-border bg-card p-4 sm:mx-0 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("accounts.modal.title")}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-background hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">{t("accounts.modal.companyName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("accounts.modal.companyPlaceholder")}
              className="form-input"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("accounts.modal.industry")}</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="form-select">
                <option value="">{t("accounts.modal.selectIndustry")}</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("accounts.modal.dealStage")}</label>
              <select value={dealStage} onChange={(e) => setDealStage(e.target.value)} className="form-select">
                <option value="">{t("accounts.modal.selectStage")}</option>
                {DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("accounts.modal.website")}</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder={t("accounts.modal.websitePlaceholder")}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">{t("accounts.modal.dealValue")}</label>
              <input
                type="number"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder={t("accounts.modal.dealValuePlaceholder")}
                className="form-input"
              />
            </div>
          </div>

          <div>
            <label className="form-label">{t("accounts.modal.notes")}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("accounts.modal.notesPlaceholder")}
              className="form-input"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-background"
            >
              {t("accounts.modal.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-40"
            >
              {t("accounts.modal.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function AccountsPage() {
  const { updateAccount, updateOpportunity } = useStore();
  const { accounts: roleFilteredAccounts, intelItems, opportunities } = useRoleFilteredData();
  const { t, locale } = useLocale();
  const en = locale === "en";
  const { orgMembers, user } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const defaultScope = getDefaultScope(jobLevel);
  const [scope, setScope] = useState<DataScope>(defaultScope);
  const effectiveScope = canViewScope(jobLevel, scope) ? scope : getEffectiveScope(jobLevel);

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  // 计算团队成员 IDs（用于 team scope UI 过滤 on top of role-filtered data）
  const currentMember = orgMembers.find(m => m.userId === user?.id);
  const teamMemberIds = currentMember?.teamId
    ? orgMembers.filter(m => m.teamId === currentMember.teamId).map(m => m.userId)
    : user?.id ? [user.id] : [];

  // Apply scope UI filter on top of role-filtered baseline
  const accounts = roleFilteredAccounts.filter((a) => {
    const aOwner = a.ownerId ?? a.userId;
    if (effectiveScope === 'mine' && aOwner && aOwner !== user?.id) return false;
    if (effectiveScope === 'team' && aOwner && !teamMemberIds.includes(aOwner)) return false;
    return true;
  });

  /** 根据 user_id 查找成员显示名 */
  function getOwnerName(userId?: string): string {
    if (!userId) return "—";
    const member = orgMembers.find((m) => m.userId === userId);
    if (member?.displayName) return member.displayName;
    if (member?.email) {
      // 从邮箱提取名字：jason.liu → Jason Liu
      const localPart = member.email.split("@")[0];
      return localPart
        .replace(/[._-]/g, " ")
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    return "—";
  }
  /** 公海领取：通过服务端 transfer API 完成（含审计 + 上下文同步） */
  async function claimAccount(accountId: string) {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/accounts/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, toUserId: user.id, reason: 'claim' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '领取失败' }));
        toast(err.error || '领取失败', 'error');
        return;
      }
      // 服务端已完成数据库更新，同步本地 store 以刷新 UI
      updateAccount(accountId, { ownerId: user.id, userId: user.id });
      for (const opp of opportunities) {
        if (opp.accountId === accountId) {
          updateOpportunity(opp.id, { assignedTo: user.id, userId: user.id });
        }
      }
    } catch {
      toast('领取失败，请重试', 'error');
    }
  }

  const [showAdd, setShowAdd] = useState(false);
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [filterHasDeals, setFilterHasDeals] = useState('all');
  const [accountSearch, setAccountSearch] = useState('');

  /** 导出客户数据为 CSV */
  function handleExportAccounts() {
    const headers = ["名称", "行业", "联系人数", "机会数", "创建时间"];
    const rows = filtered.map((a) => [
      a.name,
      a.industry || "",
      String(a.contacts.length),
      String(opportunities.filter((o) => o.accountId === a.id).length),
      a.createdAt ? new Date(a.createdAt).toLocaleDateString("zh-CN") : "",
    ]);
    downloadCsv("closr-accounts", headers, rows);
  }

  function getActiveDeals(accountId: string) {
    return opportunities.filter(
      (o) => o.accountId === accountId && o.stage !== "closed_won" && o.stage !== "closed_lost"
    ).length;
  }

  const uniqueIndustries = [...new Set(accounts.map(a => a.industry).filter(Boolean))] as string[];

  const filtered = accounts.filter((a) => {
    // Search filter
    if (accountSearch) {
      const q = accountSearch.toLowerCase();
      if (!a.name.toLowerCase().includes(q)) return false;
    }
    // Industry filter
    if (filterIndustry !== 'all' && a.industry !== filterIndustry) return false;
    // Has deals filter
    if (filterHasDeals !== 'all') {
      const activeDeals = getActiveDeals(a.id);
      if (filterHasDeals === 'active' && activeDeals === 0) return false;
      if (filterHasDeals === 'none' && activeDeals > 0) return false;
    }
    return true;
  }).sort((a, b) => {
    const aValue = opportunities.filter(o => o.accountId === a.id).reduce((sum, o) => sum + (o.value || 0), 0);
    const bValue = opportunities.filter(o => o.accountId === b.id).reduce((sum, o) => sum + (o.value || 0), 0);
    return bValue - aValue;
  });

  // ── 智能信号计算 ──
  function getAccountSignals(accountId: string) {
    // 高紧急情报
    const urgentIntel = intelItems.filter(
      (i) => i.accountId === accountId && i.urgency === 'high'
    ).length;

    // 所有情报数
    const allIntel = intelItems.filter(
      (i) => i.accountId === accountId
    ).length;

    return { urgentIntel, allIntel };
  }

  // ── 批量选择 ──
  const selection = useSelection(filtered);

  function handleExportSelected() {
    const selected = filtered.filter(a => selection.selectedIds.has(a.id));
    const headers = ["名称", "行业", "联系人数", "机会数", "创建时间"];
    const rows = selected.map((a) => [
      a.name,
      a.industry || "",
      String(a.contacts.length),
      String(opportunities.filter((o) => o.accountId === a.id).length),
      a.createdAt ? new Date(a.createdAt).toLocaleDateString("zh-CN") : "",
    ]);
    downloadCsv("closr-accounts-selected", headers, rows);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 头部 — 移动端按钮换行 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t("accounts.title")}</h1>
          <p className="mt-0.5 text-sm text-secondary">
            {accounts.length > 0
              ? t("accounts.subtitle.withCount").replace("{0}", String(accounts.length))
              : t("accounts.subtitle.empty")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <button
              onClick={handleExportAccounts}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background sm:px-4 sm:py-3"
              title={en ? "Export CSV" : "导出 CSV"}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{en ? "Export" : "导出"}</span>
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:shadow-md sm:px-5 sm:py-3"
          >
            <Plus className="h-4 w-4" />
            {t("accounts.addAccount")}
          </button>
        </div>
      </div>

      <RoleFocusBanner surface="accounts" jobLevel={jobLevel} />

      {accounts.length > 0 && (
        <div className="flex gap-1 rounded-lg bg-sidebar p-1">
          {(['mine', 'team', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                effectiveScope === s ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'
              }`}
            >
              {s === 'mine' ? (en ? 'My accounts' : '我的客户') : s === 'team' ? (en ? 'Team accounts' : '团队客户') : (en ? 'All accounts' : '全部客户')}
            </button>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              value={accountSearch}
              onChange={e => setAccountSearch(e.target.value)}
              placeholder={en ? "Search account name..." : "搜索客户名称..."}
              className="form-input w-full" style={{ paddingLeft: "2.25rem" }}
            />
          </div>
          <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{en ? "All industries" : "全部行业"}</option>
            {uniqueIndustries.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
          <select value={filterHasDeals} onChange={e => setFilterHasDeals(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{en ? "All statuses" : "全部状态"}</option>
            <option value="active">{en ? "Has active opportunities" : "有活跃商机"}</option>
            <option value="none">{en ? "No opportunities" : "无商机"}</option>
          </select>
        </div>
      )}

      {filtered.length > 0 ? (
        <>
          {/* 批量操作栏 */}
          {selection.count > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 mb-3">
              <span className="text-sm font-medium text-accent">{en ? selection.count + " selected" : "已选 " + selection.count + " 项"}</span>
              <button onClick={handleExportSelected} className="text-xs text-accent hover:underline">{en ? "Export CSV" : "导出CSV"}</button>
              <button onClick={selection.clearAll} className="ml-auto text-xs text-muted hover:text-foreground">{en ? "Clear selection" : "取消选择"}</button>
            </div>
          )}

          {/* 桌面端表格 — 添加横向滚动支持 */}
          <div className="card-elevated hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <div className="overflow-x-auto table-scroll-mobile">
            <table className="table-nextadmin">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selection.isAllSelected}
                      onChange={selection.toggleAll}
                      className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                    />
                  </th>
                  <th>{t("accounts.companyName")}</th>
                    <th>{en ? "Owner" : "负责人"}</th>
                  <th>{t("accounts.industry")}</th>
                  <th>{t("accounts.contacts")}</th>
                  <th>{t("accounts.activeDeals")}</th>
                  <th>{t("accounts.health")}</th>
                  <th>{en ? "AI Signals" : "智能信号"}</th>
                  <th>{t("accounts.lastActivity")}</th>
                  <th>{t("accounts.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => {
                  const activeDeals = getActiveDeals(account.id);
                  const signals = getAccountSignals(account.id);
                  return (
                    <tr key={account.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selection.isSelected(account.id)}
                          onChange={() => selection.toggle(account.id)}
                          className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                        />
                      </td>
                      <td>
                        <Link href={`/accounts/${account.id}`} className="font-medium text-foreground hover:text-accent transition-colors">
                          {account.name}
                        </Link>
                      </td>
                      <td className="text-secondary text-[15px]">
                        <span className="flex items-center gap-2">
                          {getOwnerName(account.ownerId ?? account.userId)}
                          {!(account.ownerId ?? account.userId) && (
                            <button
                              onClick={() => claimAccount(account.id)}
                              className="rounded-lg bg-accent px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
                            >
                              领取
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="text-secondary">{account.industry || "—"}</td>
                      <td>
                        <span className="flex items-center gap-1.5 text-secondary">
                          <Users className="h-3.5 w-3.5" />
                          {account.contacts.length}
                        </span>
                      </td>
                      <td>
                        {activeDeals > 0 ? (
                          <span className="font-medium text-foreground">{activeDeals}</span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                      <td>
                        {account.dealHealth ? (
                          <span className={HEALTH_CONFIG[account.dealHealth].badgeClass}>
                            {account.dealHealth === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {t(HEALTH_CONFIG[account.dealHealth].labelKey)}
                          </span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {signals.urgentIntel > 0 && (
                            <Link
                              href={`/accounts/${account.id}?tab=activity`}
                              className="inline-flex items-center gap-0.5 rounded-full bg-danger/10 border border-danger/20 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/15 transition-colors"
                              title={`${signals.urgentIntel} 条紧急情报`}
                            >
                              🚨 {signals.urgentIntel}
                            </Link>
                          )}
                          {signals.allIntel > 0 && signals.urgentIntel === 0 && (
                            <Link
                              href={`/accounts/${account.id}?tab=activity`}
                              className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
                              title={`${signals.allIntel} 条情报`}
                            >
                              💡 {signals.allIntel}
                            </Link>
                          )}
                          {signals.allIntel === 0 && (
                            <span className="text-secondary text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="text-secondary text-[15px]">{timeAgo(account.lastActivity)}</td>
                      <td>
                        <Link
                          href={`/accounts/${account.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-background hover:text-foreground"
                        >
                          {t("accounts.view")} <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* 移动端卡片视图 */}
          <div className="space-y-3 md:hidden">
            {filtered.map((account) => {
              const activeDeals = getActiveDeals(account.id);
              const signals = getAccountSignals(account.id);
              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-stripe"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/accounts/${account.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{account.name}</p>
                    </Link>
                    <div className="flex items-center gap-2">
                      {!(account.ownerId ?? account.userId) && (
                        <button
                          onClick={() => claimAccount(account.id)}
                          className="rounded-lg bg-accent px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
                        >
                          领取
                        </button>
                      )}
                      <Link
                        href={`/accounts/${account.id}`}
                        className="inline-flex items-center rounded-lg p-1 text-secondary transition-colors hover:bg-background hover:text-foreground"
                        aria-label={`查看 ${account.name}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-secondary">
                    <span className="text-[12px] text-muted">
                      {(account.ownerId ?? account.userId) ? ((account.ownerId ?? account.userId) === user?.id ? (en ? '👤 Mine' : '👤 我负责') : (en ? 'Owner: ' : '负责人: ') + getOwnerName(account.ownerId ?? account.userId)) : (en ? '📥 Open pool' : '📥 公海')}
                    </span>
                    {account.industry && <span>{account.industry}</span>}
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {account.contacts.length} {t("accounts.contacts")}
                    </span>
                    {activeDeals > 0 && <span>{activeDeals} 活跃 Deal</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {account.dealHealth && (
                      <span className={HEALTH_CONFIG[account.dealHealth].badgeClass}>
                        {account.dealHealth === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                        {t(HEALTH_CONFIG[account.dealHealth].labelKey)}
                      </span>
                    )}
                    {signals.urgentIntel > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-danger/10 border border-danger/20 px-2 py-0.5 text-xs font-medium text-danger"
                      >
                        🚨 {signals.urgentIntel} 紧急情报
                      </span>
                    )}
                    {signals.allIntel > 0 && signals.urgentIntel === 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-600"
                      >
                        💡 {signals.allIntel} 条情报
                      </span>
                    )}
                    <span className="text-xs text-secondary">{timeAgo(account.lastActivity)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : accounts.length > 0 ? (
        <div className="card-elevated rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted">{t("accounts.noMatch")}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
          <div className="mb-5 text-4xl sm:text-5xl">🏢</div>
          <p className="text-base font-semibold text-foreground">{t("accounts.addFirstTitle")}</p>
          <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-secondary">
            {t("accounts.addFirstHint")}
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            {t("accounts.addAccount")}
          </button>

        </div>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} getOwnerName={getOwnerName} />}
    </div>
  );
}
