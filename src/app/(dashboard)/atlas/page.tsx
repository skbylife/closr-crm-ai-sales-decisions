"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SpotlightTour } from "@/components/onboarding/SpotlightTour";
import {
  Building2,
  Users,
  Waves,
  BarChart3,
  Inbox,
  Search,
  Download,
  Mail,
  ChevronRight,
  AlertTriangle,
  Plus,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';
import { useSelection } from "@/hooks/use-selection";
import type { DecisionStyle } from "@/lib/babel-engine/types";
import { downloadCsv } from "@/lib/export-csv";
import { canViewScope, getDefaultScope, getEffectiveScope, type DataScope } from "@/lib/permissions";
import { timeAgo } from "@/lib/time-utils";
import { formatDealValue } from "@/lib/format-utils";
import { DEAL_STAGES, STAGE_LABELS, HEALTH_CONFIG, INDUSTRIES, ROLE_LABELS, DISC_LABELS } from "@/lib/constants";
import { buildLeadIntakeQueue, type LeadIntakeItem } from "@/lib/crm-foundation/lead-intake";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import type { MeddiccAssessment, MutualActionPlan, OpportunityStage } from "@/lib/babel-engine/types";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/format-currency";

// ─── Types ──────────────────────────────────────────────────────────

type AtlasTab = "accounts" | "contacts" | "leads" | "pool" | "channels";

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
}

// ─── Constants ──────────────────────────────────────────────────────

const TAB_CONFIG: { key: AtlasTab; icon: typeof Building2; labelKey: TranslationKey }[] = [
  { key: "accounts", icon: Building2, labelKey: "atlas.tabs.accounts" },
  { key: "contacts", icon: Users, labelKey: "atlas.tabs.contacts" },
  { key: "leads", icon: Inbox, labelKey: "atlas.tabs.leads" },
  { key: "pool", icon: Waves, labelKey: "atlas.tabs.pool" },
  { key: "channels", icon: BarChart3, labelKey: "atlas.tabs.channels" },
];

const CONTACT_ROLE_LABELS_EN: Record<string, string> = {
  decision_maker: "Decision maker",
  economic_buyer: "Economic buyer",
  champion: "Champion",
  technical_evaluator: "Technical evaluator",
  influencer: "Influencer",
  blocker: "Blocker",
  end_user: "End user",
  procurement: "Procurement",
  legal: "Legal",
  project_manager: "Project manager",
  executive_sponsor: "Executive sponsor",
  gate_keeper: "Gatekeeper",
  coach: "Coach",
  committee_member: "Committee member",
  contact: "Contact",
  unknown: "Unknown",
};

function contactRoleLabel(role: string, en: boolean): string {
  return en ? CONTACT_ROLE_LABELS_EN[role] ?? role : ROLE_LABELS[role] || role;
}

function defaultMeddicc(): MeddiccAssessment {
  return {
    metrics: { notes: '', status: 'unconfirmed', evidence: '' },
    economicBuyer: { status: 'unknown', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 1, lastEngagement: '', notes: '' },
    competition: [],
    overallScore: 0,
  };
}

function defaultMutualActionPlan(): MutualActionPlan {
  const due = new Date();
  due.setDate(due.getDate() + 30);
  return {
    targetSignDate: due.toISOString().split('T')[0],
    confidence: 30,
    milestones: [],
  };
}

function leadUrgencyClass(urgency: LeadIntakeItem['urgency']): string {
  if (urgency === 'high') return 'border-danger/20 bg-danger/5 text-danger';
  if (urgency === 'medium') return 'border-warning/20 bg-warning/5 text-warning';
  return 'border-border bg-muted/20 text-secondary';
}

function leadStatusClass(status: LeadIntakeItem['status']): string {
  if (status === 'matched_opportunity') return 'border-positive/20 bg-positive/5 text-positive';
  if (status === 'matched_account') return 'border-accent/20 bg-accent/5 text-accent';
  return 'border-warning/20 bg-warning/5 text-warning';
}

function leadStatusLabel(status: LeadIntakeItem['status'], en: boolean): string {
  if (status === 'matched_opportunity') return en ? 'Open opportunity' : '已有商机';
  if (status === 'matched_account') return en ? 'Matched account' : '已匹配客户';
  return en ? 'New account' : '新客户';
}

function leadUrgencyLabel(urgency: LeadIntakeItem['urgency'], en: boolean): string {
  if (urgency === 'high') return en ? 'High' : '高';
  if (urgency === 'medium') return en ? 'Medium' : '中';
  return en ? 'Low' : '低';
}

// ─── Add Account Modal ──────────────────────────────────────────────

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
      <div className="card-elevated mx-3 w-full max-w-md rounded-2xl border border-border bg-card p-4 sm:mx-0 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("accounts.modal.title")}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-background hover:text-foreground">
            <span className="text-lg">×</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">{t("accounts.modal.companyName")}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("accounts.modal.companyPlaceholder")} className="form-input" autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("accounts.modal.industry")}</label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="form-select">
                <option value="">{t("accounts.modal.selectIndustry")}</option>
                {INDUSTRIES.map((ind) => (<option key={ind} value={ind}>{ind}</option>))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("accounts.modal.dealStage")}</label>
              <select value={dealStage} onChange={(e) => setDealStage(e.target.value)} className="form-select">
                <option value="">{t("accounts.modal.selectStage")}</option>
                {DEAL_STAGES.map((stage) => (<option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("accounts.modal.website")}</label>
              <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={t("accounts.modal.websitePlaceholder")} className="form-input" />
            </div>
            <div>
              <label className="form-label">{t("accounts.modal.dealValue")}</label>
              <input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder={t("accounts.modal.dealValuePlaceholder")} className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">{t("accounts.modal.notes")}</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("accounts.modal.notesPlaceholder")} className="form-input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-background">
              {t("accounts.modal.cancel")}
            </button>
            <button type="submit" disabled={!name.trim()} className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-40">
              {t("accounts.modal.add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Accounts Tab ───────────────────────────────────────────────────

function AccountsTab() {
  const { accounts, opportunities, updateAccount, updateOpportunity } = useStore();
  const { t, locale } = useLocale();
  const en = locale === "en";
  const { orgMembers, user } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const defaultScope = getDefaultScope(jobLevel);
  const [scope, setScope] = useState<DataScope>(defaultScope);
  const effectiveScope = canViewScope(jobLevel, scope) ? scope : getEffectiveScope(jobLevel);

  const currentMember = orgMembers.find(m => m.userId === user?.id);
  const teamMemberIds = currentMember?.teamId
    ? orgMembers.filter(m => m.teamId === currentMember.teamId).map(m => m.userId)
    : user?.id ? [user.id] : [];

  function getOwnerName(userId?: string): string {
    if (!userId) return "—";
    const member = orgMembers.find((m) => m.userId === userId);
    if (member?.displayName) return member.displayName;
    if (member?.email) {
      const localPart = member.email.split("@")[0];
      return localPart.replace(/[._-]/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

  function getActiveDeals(accountId: string) {
    return opportunities.filter(
      (o) => o.accountId === accountId && o.stage !== "closed_won" && o.stage !== "closed_lost"
    ).length;
  }

  function handleExportAccounts() {
    const headers = ["名称", "行业", "联系人数", "机会数", "创建时间"];
    const rows = filtered.map((a) => [
      a.name, a.industry || "", String(a.contacts.length),
      String(opportunities.filter((o) => o.accountId === a.id).length),
      a.createdAt ? new Date(a.createdAt).toLocaleDateString("zh-CN") : "",
    ]);
    downloadCsv("closr-accounts", headers, rows);
  }

  const uniqueIndustries = [...new Set(accounts.map(a => a.industry).filter(Boolean))] as string[];

  function getTotalDealValue(accountId: string) {
    return opportunities
      .filter((o) => o.accountId === accountId)
      .reduce((sum, o) => sum + (o.value || 0), 0);
  }

  const filtered = accounts.filter((a) => {
    const aOwner = a.ownerId ?? a.userId;
    if (effectiveScope === 'mine' && aOwner && aOwner !== user?.id) return false;
    if (effectiveScope === 'team' && aOwner && !teamMemberIds.includes(aOwner)) return false;
    if (accountSearch) {
      const q = accountSearch.toLowerCase();
      if (!a.name.toLowerCase().includes(q)) return false;
    }
    if (filterIndustry !== 'all' && a.industry !== filterIndustry) return false;
    if (filterHasDeals !== 'all') {
      const activeDeals = getActiveDeals(a.id);
      if (filterHasDeals === 'active' && activeDeals === 0) return false;
      if (filterHasDeals === 'none' && activeDeals > 0) return false;
    }
    return true;
  }).sort((a, b) => getTotalDealValue(b.id) - getTotalDealValue(a.id));

  const selection = useSelection(filtered);

  function handleExportSelected() {
    const selected = filtered.filter(a => selection.selectedIds.has(a.id));
    const headers = ["名称", "行业", "联系人数", "机会数", "创建时间"];
    const rows = selected.map((a) => [
      a.name, a.industry || "", String(a.contacts.length),
      String(opportunities.filter((o) => o.accountId === a.id).length),
      a.createdAt ? new Date(a.createdAt).toLocaleDateString("zh-CN") : "",
    ]);
    downloadCsv("closr-accounts-selected", headers, rows);
  }

  return (
    <>
      {/* 头部 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-secondary">
            {accounts.length > 0
              ? t("accounts.subtitle.withCount").replace("{0}", String(accounts.length))
              : t("accounts.subtitle.empty")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && (
            <button onClick={handleExportAccounts} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background sm:px-4 sm:py-3" title={en ? "Export CSV" : "导出 CSV"}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{en ? "Export" : "导出"}</span>
            </button>
          )}
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:shadow-md sm:px-5 sm:py-3">
            <Plus className="h-4 w-4" />
            {t("accounts.addAccount")}
          </button>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="flex gap-1 rounded-lg bg-sidebar p-1">
          {(['mine', 'team', 'all'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${effectiveScope === s ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'}`}>
              {s === 'mine' ? (en ? 'My accounts' : '我的客户') : s === 'team' ? (en ? 'Team accounts' : '团队客户') : (en ? 'All accounts' : '全部客户')}
            </button>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input type="text" value={accountSearch} onChange={e => setAccountSearch(e.target.value)} placeholder={en ? "Search account name..." : "搜索客户名称..."} className="form-input w-full" style={{ paddingLeft: "2.25rem" }} />
          </div>
          <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{en ? "All industries" : "全部行业"}</option>
            {uniqueIndustries.map(ind => (<option key={ind} value={ind}>{ind}</option>))}
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
          {selection.count > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 mb-3">
              <span className="text-sm font-medium text-accent">{en ? selection.count + " selected" : "已选 " + selection.count + " 项"}</span>
              <button onClick={handleExportSelected} className="text-xs text-accent hover:underline">{en ? "Export CSV" : "导出CSV"}</button>
              <button onClick={selection.clearAll} className="ml-auto text-xs text-muted hover:text-foreground">{en ? "Clear selection" : "取消选择"}</button>
            </div>
          )}

          {/* 桌面端表格 */}
          <div className="card-elevated hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <div className="overflow-x-auto table-scroll-mobile">
              <table className="table-nextadmin">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} className="h-4 w-4 rounded border-border accent-accent cursor-pointer" />
                    </th>
                    <th>{t("accounts.companyName")}</th>
                    <th>{en ? "Owner" : "负责人"}</th>
                    <th>{t("accounts.industry")}</th>
                    <th>{t("accounts.contacts")}</th>
                    <th>{t("accounts.activeDeals")}</th>
                    <th>{t("accounts.health")}</th>
                    <th>{t("accounts.lastActivity")}</th>
                    <th>{t("accounts.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((account) => {
                    const activeDeals = getActiveDeals(account.id);
                    return (
                      <tr key={account.id}>
                        <td>
                          <input type="checkbox" checked={selection.isSelected(account.id)} onChange={() => selection.toggle(account.id)} className="h-4 w-4 rounded border-border accent-accent cursor-pointer" />
                        </td>
                        <td>
                          <Link href={`/accounts/${account.id}`} className="font-medium text-foreground hover:text-accent transition-colors">{account.name}</Link>
                        </td>
                        <td className="text-secondary text-[15px]">
                          <span className="flex items-center gap-2">
                            {getOwnerName(account.ownerId ?? account.userId)}
                            {!(account.ownerId ?? account.userId) && (
                              <button onClick={() => claimAccount(account.id)} className="rounded-lg bg-accent px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">领取</button>
                            )}
                          </span>
                        </td>
                        <td className="text-secondary">{account.industry || "—"}</td>
                        <td><span className="flex items-center gap-1.5 text-secondary"><Users className="h-3.5 w-3.5" />{account.contacts.length}</span></td>
                        <td>{activeDeals > 0 ? <span className="font-medium text-foreground">{activeDeals}</span> : <span className="text-secondary">—</span>}</td>
                        <td>
                          {account.dealHealth ? (
                            <span className={HEALTH_CONFIG[account.dealHealth].badgeClass}>
                              {account.dealHealth === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                              {t(HEALTH_CONFIG[account.dealHealth].labelKey)}
                            </span>
                          ) : <span className="text-secondary">—</span>}
                        </td>
                        <td className="text-secondary text-[15px]">{timeAgo(account.lastActivity)}</td>
                        <td>
                          <Link href={`/accounts/${account.id}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-background hover:text-foreground">
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

          {/* 移动端卡片 */}
          <div className="space-y-3 md:hidden">
            {filtered.map((account) => {
              const activeDeals = getActiveDeals(account.id);
              return (
                <Link key={account.id} href={`/accounts/${account.id}`} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-stripe">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{account.name}</p>
                    <div className="flex items-center gap-2">
                      {!(account.ownerId ?? account.userId) && (
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); claimAccount(account.id); }} className="rounded-lg bg-accent px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">领取</button>
                      )}
                      <ChevronRight className="h-4 w-4 text-secondary" />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-secondary">
                    <span className="text-[12px] text-muted">
                      {(account.ownerId ?? account.userId) ? ((account.ownerId ?? account.userId) === user?.id ? '👤 我负责' : '负责人: ' + getOwnerName(account.ownerId ?? account.userId)) : '📥 公海'}
                    </span>
                    {account.industry && <span>{account.industry}</span>}
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{account.contacts.length} {t("accounts.contacts")}</span>
                    {activeDeals > 0 && <span>{activeDeals} 活跃 Deal</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {account.dealHealth && (
                      <span className={HEALTH_CONFIG[account.dealHealth].badgeClass}>
                        {account.dealHealth === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                        {t(HEALTH_CONFIG[account.dealHealth].labelKey)}
                      </span>
                    )}
                    <span className="text-xs text-secondary">{timeAgo(account.lastActivity)}</span>
                  </div>
                </Link>
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
          <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-secondary">{t("accounts.addFirstHint")}</p>
          <button onClick={() => setShowAdd(true)} className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover">
            <Plus className="h-4 w-4" />{t("accounts.addAccount")}
          </button>
          <button onClick={() => { useStore.getState().loadSampleData(); window.location.reload(); }} className="mt-3 text-sm text-accent hover:underline">
            {t("accounts.loadSample")}
          </button>
        </div>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} getOwnerName={getOwnerName} />}
    </>
  );
}

// ─── Contacts Tab ───────────────────────────────────────────────────

function ContactsTab() {
  const accounts = useStore((s) => s.accounts);
  const { locale } = useLocale();
  const en = locale === "en";
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterDisc, setFilterDisc] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "account" | "role">("name");

  const allContacts: ContactRow[] = useMemo(() => {
    return accounts.flatMap((account) =>
      (account.contacts || []).map((c) => ({
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
      }))
    );
  }, [accounts]);

  const filtered = useMemo(() => {
    let list = allContacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) ||
        c.accountName.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
      );
    }
    if (filterRole !== "all") list = list.filter((c) => c.role === filterRole);
    if (filterDisc !== "all") list = list.filter((c) => c.decisionStyle === filterDisc);
    if (filterAccount !== "all") list = list.filter((c) => c.accountId === filterAccount);
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "account") return a.accountName.localeCompare(b.accountName);
      return a.role.localeCompare(b.role);
    });
    return list;
  }, [allContacts, search, filterRole, filterDisc, filterAccount, sortBy]);

  const selection = useSelection(filtered);

  const exportCSV = () => {
    const targets = selection.count > 0 ? filtered.filter(c => selection.selectedIds.has(c.id)) : filtered;
    const headers = en
      ? ["Name", "Title", "Email", "Phone", "Company", "Role", "DISC Type", "Profile"]
      : ["姓名", "职位", "邮箱", "电话", "公司", "角色", "DISC类型", "有画像"];
    const rows = targets.map((c) => [
      c.name, c.title, c.email, c.phone, c.accountName,
      contactRoleLabel(c.role, en),
      c.decisionStyle ? DISC_LABELS[c.decisionStyle]?.label || c.decisionStyle : "",
      c.hasProfile ? (en ? "Yes" : "是") : (en ? "No" : "否"),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueRoles = [...new Set(allContacts.map((c) => c.role).filter(Boolean))];
  const uniqueAccounts = [...new Map(accounts.map((a) => [a.id, a.name])).entries()];

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">{filtered.length} / {allContacts.length} {en ? "people" : "人"}</p>
        <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background">
          <Download className="h-4 w-4" />{en ? "Export CSV" : "导出 CSV"}
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={en ? "Search name, email, company, or title..." : "搜索姓名、邮箱、公司、职位..."} className="form-input w-full" style={{ paddingLeft: "2.25rem" }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{en ? "All companies" : "全部公司"}</option>
            {uniqueAccounts.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
          </select>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{en ? "All roles" : "全部角色"}</option>
            {uniqueRoles.map((r) => (<option key={r} value={r}>{contactRoleLabel(r, en)}</option>))}
          </select>
          <select value={filterDisc} onChange={(e) => setFilterDisc(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="all">{en ? "All DISC" : "全部 DISC"}</option>
            <option value="driver">{en ? "D Driver" : "D 驱动型"}</option>
            <option value="analytical">{en ? "A Analytical" : "A 分析型"}</option>
            <option value="amiable">{en ? "A Amiable" : "A 亲和型"}</option>
            <option value="expressive">{en ? "E Expressive" : "E 表现型"}</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "account" | "role")} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
            <option value="name">{en ? "Sort by name" : "按姓名排序"}</option>
            <option value="account">{en ? "Sort by company" : "按公司排序"}</option>
            <option value="role">{en ? "Sort by role" : "按角色排序"}</option>
          </select>
        </div>
      </div>

      {selection.count > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2">
          <span className="text-sm font-medium text-accent">{en ? `${selection.count} selected` : `已选 ${selection.count} 项`}</span>
          <button onClick={exportCSV} className="text-xs text-accent hover:underline">{en ? "Export CSV" : "导出CSV"}</button>
          <button onClick={selection.clearAll} className="ml-auto text-xs text-muted hover:text-foreground">{en ? "Clear selection" : "取消选择"}</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden gap-2 border-b border-border px-4 py-2 text-[12px] font-semibold uppercase text-secondary sm:grid sm:grid-cols-[32px_1fr_150px_120px_100px_80px_40px]">
          <span><input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} className="h-4 w-4 rounded border-border accent-accent cursor-pointer" /></span>
          <span>{en ? "Contact" : "联系人"}</span><span>{en ? "Company" : "公司"}</span><span>{en ? "Role" : "角色"}</span><span>DISC</span><span>{en ? "Profile" : "画像"}</span><span></span>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">{en ? "No matching contacts" : "没有匹配的联系人"}</div>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="grid items-center gap-2 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-background sm:grid-cols-[32px_1fr_150px_120px_100px_80px_40px]">
              <div className="hidden sm:block">
                <input type="checkbox" checked={selection.isSelected(c.id)} onChange={() => selection.toggle(c.id)} className="h-4 w-4 rounded border-border accent-accent cursor-pointer" />
              </div>
              <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar text-xs font-bold text-secondary">{c.name.charAt(0)}</div>
                <div>
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-[12px] text-muted">{c.title}</p>
                </div>
              </Link>
              <Link href={`/accounts/${c.accountId}`} className="truncate text-xs text-secondary hover:text-accent hover:underline">{c.accountName}</Link>
              <span className="text-[12px] text-muted">{contactRoleLabel(c.role, en)}</span>
              {c.decisionStyle && DISC_LABELS[c.decisionStyle] ? (
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${DISC_LABELS[c.decisionStyle].color}`}>{DISC_LABELS[c.decisionStyle].label}</span>
              ) : (
                <span className="text-[12px] text-muted">&mdash;</span>
              )}
              <span className={`text-[12px] ${c.hasProfile ? "text-positive" : "text-muted"}`}>{c.hasProfile ? (en ? "Yes" : "有") : "—"}</span>
              {c.email ? (
                <Link href={`/compose?to=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name)}&title=${encodeURIComponent(c.title)}&accountId=${encodeURIComponent(c.accountId)}&contactId=${encodeURIComponent(c.id)}`} className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent/10 hover:text-accent" title={en ? "Send email" : "发邮件"}>
                  <Mail className="h-3.5 w-3.5" />
                </Link>
              ) : <span />}
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ─── Leads Tab ──────────────────────────────────────────────────────

function LeadsTab() {
  const { locale } = useLocale();
  const en = locale === "en";
  const { user } = useAuth();
  const { addAccount, addContact, addOpportunity, currencyCode } = useStore();
  const { accounts, opportunities, emailDecodes, intelItems } = useRoleFilteredData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LeadIntakeItem['status'] | "all">("all");
  const [convertedOpportunityIds, setConvertedOpportunityIds] = useState<Record<string, string>>({});
  const [conversionLead, setConversionLead] = useState<LeadIntakeItem | null>(null);
  const [conversionDraft, setConversionDraft] = useState({
    name: "",
    value: "0",
    currency: currencyCode,
    expectedCloseDate: "",
  });

  const queue = useMemo(() => buildLeadIntakeQueue({
    accounts,
    opportunities,
    decodes: emailDecodes,
    intelItems,
  }), [accounts, opportunities, emailDecodes, intelItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue.filter((lead) => {
      if (status !== "all" && lead.status !== status) return false;
      if (!q) return true;
      return [
        lead.companyName,
        lead.contactName,
        lead.contactEmail,
        lead.title,
        lead.signal,
        lead.nextAction,
      ].some((value) => value?.toLowerCase().includes(q));
    });
  }, [queue, search, status]);

  function openConversionDrawer(lead: LeadIntakeItem) {
    const closeDate = new Date();
    closeDate.setDate(closeDate.getDate() + 30);
    setConversionDraft({
      name: lead.companyName + " - " + lead.title,
      value: "0",
      currency: currencyCode,
      expectedCloseDate: closeDate.toISOString().split("T")[0],
    });
    setConversionLead(lead);
  }

  function createOpportunityForLead(lead: LeadIntakeItem): string {
    let accountId = lead.matchedAccountId;
    if (!accountId) {
      accountId = addAccount({
        name: lead.companyName,
        notes: lead.signal,
        dealStage: "lead_identified",
        dealHealth: lead.urgency === "high" ? "at_risk" : "healthy",
        lastActivity: lead.occurredAt,
        userId: user?.id,
        ownerId: user?.id,
      });
    }

    if (!lead.matchedContactId && lead.contactName) {
      addContact(accountId, {
        name: lead.contactName,
        email: lead.contactEmail ?? "",
        role: "contact",
        lastContactedAt: lead.occurredAt,
      });
    }

    return addOpportunity({
      accountId,
      name: conversionDraft.name.trim() || lead.companyName + " - " + lead.title,
      value: Number(conversionDraft.value) || 0,
      currency: conversionDraft.currency || currencyCode,
      stage: "lead_identified" as OpportunityStage,
      probability: 10,
      expectedCloseDate: conversionDraft.expectedCloseDate,
      owner: user?.email ?? "",
      assignedTo: user?.id,
      userId: user?.id,
      source: lead.source === "decode" ? "decode" : "intel",
      meddicc: defaultMeddicc(),
      mutualActionPlan: defaultMutualActionPlan(),
      competitorIds: [],
      notes: lead.signal,
    });
  }

  function handleConvert(lead: LeadIntakeItem) {
    if (lead.matchedOpportunityId) {
      setConvertedOpportunityIds((prev) => ({ ...prev, [lead.id]: lead.matchedOpportunityId! }));
      toast(en ? "Linked to existing opportunity" : "已挂入现有商机", "success");
      return;
    }
    openConversionDrawer(lead);
  }

  function confirmConversion() {
    if (!conversionLead) return;
    const opportunityId = createOpportunityForLead(conversionLead);
    setConvertedOpportunityIds((prev) => ({ ...prev, [conversionLead.id]: opportunityId }));
    setConversionLead(null);
    toast(en ? "Opportunity created" : "已创建商机", "success");
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-secondary">
          {en ? `${filtered.length} / ${queue.length} leads` : `${filtered.length} / ${queue.length} 条线索`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={en ? "Search lead, company, signal..." : "搜索线索、客户、信号..."}
              className="form-input w-full"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as LeadIntakeItem['status'] | "all")} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <option value="all">{en ? "All statuses" : "全部状态"}</option>
            <option value="ready_to_convert">{en ? "New account" : "新客户"}</option>
            <option value="matched_account">{en ? "Matched account" : "已匹配客户"}</option>
            <option value="matched_opportunity">{en ? "Open opportunity" : "已有商机"}</option>
          </select>
        </div>
      </div>

      {filtered.length > 0 ? (
        <>
          <div className="grid gap-3 md:hidden">
            {filtered.map((lead) => {
              const convertedOpportunityId = convertedOpportunityIds[lead.id] ?? lead.matchedOpportunityId;
              return (
                <div key={lead.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{lead.companyName}</p>
                      <p className="mt-1 line-clamp-2 text-[13px] text-secondary">{lead.signal}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${leadUrgencyClass(lead.urgency)}`}>
                      {leadUrgencyLabel(lead.urgency, en)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    <span className={`rounded-full border px-2 py-0.5 font-medium ${leadStatusClass(lead.status)}`}>
                      {leadStatusLabel(lead.status, en)}
                    </span>
                    <span>{lead.source === "decode" ? "Decode" : "Intel"}</span>
                    <span>{timeAgo(lead.occurredAt)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[12px] text-secondary">{lead.nextAction}</span>
                    {convertedOpportunityId ? (
                      <Link href={`/pipeline/${convertedOpportunityId}`} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
                        {en ? "Open" : "打开"}
                      </Link>
                    ) : (
                      <button onClick={() => handleConvert(lead)} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
                        {en ? "Convert" : "转化"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="table-nextadmin">
                <thead>
                  <tr>
                    <th>{en ? "Signal" : "线索信号"}</th>
                    <th>{en ? "Company" : "客户"}</th>
                    <th>{en ? "Contact" : "联系人"}</th>
                    <th>{en ? "Match" : "匹配"}</th>
                    <th>{en ? "Urgency" : "优先级"}</th>
                    <th>{en ? "Action" : "动作"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => {
                    const convertedOpportunityId = convertedOpportunityIds[lead.id] ?? lead.matchedOpportunityId;
                    return (
                      <tr key={lead.id}>
                        <td className="max-w-[360px]">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-sidebar px-2 py-0.5 text-[11px] font-medium text-secondary">{lead.source === "decode" ? "Decode" : "Intel"}</span>
                              <span className="text-[12px] text-muted">{timeAgo(lead.occurredAt)}</span>
                            </div>
                            <p className="mt-1 truncate text-sm font-medium text-foreground">{lead.title}</p>
                            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-secondary">{lead.signal}</p>
                          </div>
                        </td>
                        <td>
                          {lead.matchedAccountId ? (
                            <Link href={`/accounts/${lead.matchedAccountId}`} className="font-medium text-foreground hover:text-accent">{lead.companyName}</Link>
                          ) : (
                            <span className="font-medium text-foreground">{lead.companyName}</span>
                          )}
                        </td>
                        <td className="text-secondary">
                          {lead.contactName ? (
                            <div>
                              <p className="text-sm text-foreground">{lead.contactName}</p>
                              <p className="text-[12px] text-muted">{lead.contactEmail || "—"}</p>
                            </div>
                          ) : "—"}
                        </td>
                        <td>
                          <span className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${leadStatusClass(lead.status)}`}>
                            {leadStatusLabel(lead.status, en)}
                          </span>
                        </td>
                        <td>
                          <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${leadUrgencyClass(lead.urgency)}`}>
                            {leadUrgencyLabel(lead.urgency, en)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap text-[12px] text-secondary">{lead.nextAction}</span>
                            {convertedOpportunityId ? (
                              <Link href={`/pipeline/${convertedOpportunityId}`} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
                                {en ? "Open" : "打开"}
                              </Link>
                            ) : (
                              <button onClick={() => handleConvert(lead)} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
                                {en ? "Convert" : "转化"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
          <Inbox className="mb-4 h-10 w-10 text-muted" />
          <p className="text-sm font-medium text-foreground">{en ? "No leads to convert" : "暂无待转化线索"}</p>
        </div>
      )}

      {conversionLead && (
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setConversionLead(null)}>
          <aside
            className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{en ? "Lead conversion" : "线索转化"}</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">{conversionLead.companyName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setConversionLead(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={"rounded-full border px-2 py-0.5 text-[11px] font-semibold " + leadUrgencyClass(conversionLead.urgency)}>
                    {leadUrgencyLabel(conversionLead.urgency, en)}
                  </span>
                  <span className={"rounded-full border px-2 py-0.5 text-[11px] font-medium " + leadStatusClass(conversionLead.status)}>
                    {leadStatusLabel(conversionLead.status, en)}
                  </span>
                  <span className="text-[12px] text-muted">{conversionLead.source === "decode" ? "Decode" : "Intel"} · {timeAgo(conversionLead.occurredAt)}</span>
                </div>
                <p className="mt-3 text-sm font-medium leading-6 text-foreground">{conversionLead.signal}</p>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="rounded-xl border border-border px-4 py-3">
                  <p className="text-xs font-semibold text-muted">{en ? "Account" : "客户"}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{conversionLead.companyName}</p>
                  <p className="mt-1 text-[12px] text-secondary">
                    {conversionLead.matchedAccountId ? (en ? "Use matched account" : "使用已匹配客户") : (en ? "Create new account" : "创建新客户")}
                  </p>
                </div>
                <div className="rounded-xl border border-border px-4 py-3">
                  <p className="text-xs font-semibold text-muted">{en ? "Contact" : "联系人"}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{conversionLead.contactName || "—"}</p>
                  <p className="mt-1 text-[12px] text-secondary">{conversionLead.contactEmail || (en ? "No email" : "无邮箱")}</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="form-label">{en ? "Opportunity name" : "商机名称"}</label>
                  <input
                    value={conversionDraft.name}
                    onChange={(event) => setConversionDraft((prev) => ({ ...prev, name: event.target.value }))}
                    className="form-input"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="form-label">{en ? "Value" : "金额"}</label>
                    <input
                      value={conversionDraft.value}
                      inputMode="decimal"
                      onChange={(event) => setConversionDraft((prev) => ({ ...prev, value: event.target.value.replace(/[^\d.]/g, "") }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">{en ? "Currency" : "币种"}</label>
                    <select
                      value={conversionDraft.currency}
                      onChange={(event) => setConversionDraft((prev) => ({ ...prev, currency: event.target.value as CurrencyCode }))}
                      className="form-select"
                    >
                      {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">{en ? "Close date" : "预计关单"}</label>
                    <input
                      type="date"
                      value={conversionDraft.expectedCloseDate}
                      onChange={(event) => setConversionDraft((prev) => ({ ...prev, expectedCloseDate: event.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setConversionLead(null)}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                {en ? "Cancel" : "取消"}
              </button>
              <button
                type="button"
                onClick={confirmConversion}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                {en ? "Create opportunity" : "创建商机"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ─── Pool Tab (公海) ────────────────────────────────────────────────

function PoolTab() {
  const { accounts, opportunities, updateAccount, updateOpportunity } = useStore();
  const { t } = useLocale();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [nowTs] = useState(() => Date.now());

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
      updateAccount(accountId, { ownerId: user.id, userId: user.id, lastActivity: new Date().toISOString() });
      for (const opp of opportunities) {
        if (opp.accountId === accountId) {
          updateOpportunity(opp.id, { assignedTo: user.id, userId: user.id });
        }
      }
    } catch {
      toast('领取失败，请重试', 'error');
    }
  }

  // 公海 = 没有 owner 或者 30天+ 没有活动
  const DORMANT_DAYS = 30;
  const poolAccounts = useMemo(() => {
    const cutoff = nowTs - DORMANT_DAYS * 24 * 60 * 60 * 1000;
    return accounts.filter((a) => {
      if (!(a.ownerId ?? a.userId)) return true;
      if (a.lastActivity && new Date(a.lastActivity).getTime() < cutoff) return true;
      return false;
    });
  }, [accounts, nowTs]);

  const filtered = useMemo(() => {
    if (!search) return poolAccounts;
    const q = search.toLowerCase();
    return poolAccounts.filter((a) => a.name.toLowerCase().includes(q));
  }, [poolAccounts, search]);

  function getActiveDeals(accountId: string) {
    return opportunities.filter(
      (o) => o.accountId === accountId && o.stage !== "closed_won" && o.stage !== "closed_lost"
    ).length;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">
          {t("atlas.pool.desc")} — {poolAccounts.length} 家
        </p>
      </div>

      {poolAccounts.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索公海客户..." className="form-input w-full" style={{ paddingLeft: "2.25rem" }} />
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="table-nextadmin">
              <thead>
                <tr>
                  <th>客户名称</th>
                  <th>行业</th>
                  <th>联系人</th>
                  <th>活跃商机</th>
                  <th>最近活动</th>
                  <th>原因</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => {
                  const acctOwner = account.ownerId ?? account.userId;
                  const isDormant = acctOwner && account.lastActivity && new Date(account.lastActivity).getTime() < nowTs - DORMANT_DAYS * 24 * 60 * 60 * 1000;
                  return (
                    <tr key={account.id}>
                      <td>
                        <Link href={`/accounts/${account.id}`} className="font-medium text-foreground hover:text-accent transition-colors">{account.name}</Link>
                      </td>
                      <td className="text-secondary">{account.industry || "—"}</td>
                      <td><span className="flex items-center gap-1.5 text-secondary"><Users className="h-3.5 w-3.5" />{account.contacts.length}</span></td>
                      <td className="text-secondary">{getActiveDeals(account.id) || "—"}</td>
                      <td className="text-secondary text-[15px]">{timeAgo(account.lastActivity)}</td>
                      <td>
                        {!acctOwner ? (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[12px] font-semibold text-white">未分配</span>
                        ) : isDormant ? (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[12px] font-semibold text-white">休眠 30天+</span>
                        ) : null}
                      </td>
                      <td>
                        {!acctOwner ? (
                          <button onClick={() => claimAccount(account.id)} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
                            领取
                          </button>
                        ) : (
                          <span className="text-[12px] text-muted">需管理员释放</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
          <div className="mb-4 text-4xl">🌊</div>
          <p className="text-sm font-medium text-foreground">{t("atlas.pool.empty")}</p>
          <p className="mt-1 text-xs text-secondary">{t("atlas.pool.desc")}</p>
        </div>
      )}
    </>
  );
}

// ─── Channels Tab (渠道) ────────────────────────────────────────────

function ChannelsTab() {
  const { opportunities } = useStore();
  const { t } = useLocale();

  // 按 source 统计商机
  const channelStats = useMemo(() => {
    const sourceMap: Record<string, { count: number; totalValue: number; wonCount: number; wonValue: number; accountIds: Set<string> }> = {};
    for (const opp of opportunities) {
      const source = opp.source || "未知";
      if (!sourceMap[source]) {
        sourceMap[source] = { count: 0, totalValue: 0, wonCount: 0, wonValue: 0, accountIds: new Set() };
      }
      sourceMap[source].count += 1;
      sourceMap[source].totalValue += opp.value || 0;
      sourceMap[source].accountIds.add(opp.accountId);
      if (opp.stage === "closed_won") {
        sourceMap[source].wonCount += 1;
        sourceMap[source].wonValue += opp.value || 0;
      }
    }
    return Object.entries(sourceMap)
      .map(([source, data]) => ({
        source,
        count: data.count,
        totalValue: data.totalValue,
        wonCount: data.wonCount,
        wonValue: data.wonValue,
        accountCount: data.accountIds.size,
        winRate: data.count > 0 ? Math.round((data.wonCount / data.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [opportunities]);

  const totalOpps = channelStats.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">
          {channelStats.length} 个渠道 — {totalOpps} 个商机
        </p>
      </div>

      {channelStats.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="table-nextadmin">
            <thead>
              <tr>
                <th>渠道来源</th>
                <th>商机数</th>
                <th>客户数</th>
                <th>总金额</th>
                <th>已成交</th>
                <th>成交金额</th>
                <th>赢单率</th>
                <th>占比</th>
              </tr>
            </thead>
            <tbody>
              {channelStats.map((ch) => (
                <tr key={ch.source}>
                  <td className="font-medium text-foreground">{ch.source}</td>
                  <td className="text-secondary">{ch.count}</td>
                  <td className="text-secondary">{ch.accountCount}</td>
                  <td className="text-secondary">{formatDealValue(ch.totalValue)}</td>
                  <td className="text-secondary">{ch.wonCount}</td>
                  <td className="text-secondary">{formatDealValue(ch.wonValue)}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${ch.winRate >= 50 ? 'bg-positive/10 text-positive' : ch.winRate >= 20 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}>
                      {ch.winRate}%
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-sidebar overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${totalOpps > 0 ? (ch.count / totalOpps) * 100 : 0}%` }} />
                      </div>
                      <span className="text-[12px] text-muted">{totalOpps > 0 ? Math.round((ch.count / totalOpps) * 100) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
          <div className="mb-4 text-4xl">📊</div>
          <p className="text-sm font-medium text-foreground">{t("atlas.channels.empty")}</p>
          <p className="mt-1 text-xs text-secondary">添加商机并设置来源以查看渠道分布</p>
        </div>
      )}
    </>
  );
}

// ─── Main Atlas Page ────────────────────────────────────────────────

export default function AtlasPage() {
  const [activeTab, setActiveTab] = useState<AtlasTab>("accounts");
  const { t, locale } = useLocale();
  const en = locale === "en";
  const { accounts, opportunities, emailDecodes, intelItems } = useRoleFilteredData();
  const [nowTs] = useState(() => Date.now());

  // Tab badge counts
  const poolCount = useMemo(() => {
    const cutoff = nowTs - 30 * 24 * 60 * 60 * 1000;
    return accounts.filter((a) => !(a.ownerId ?? a.userId) || (a.lastActivity && new Date(a.lastActivity).getTime() < cutoff)).length;
  }, [accounts, nowTs]);

  const contactCount = useMemo(() => {
    return accounts.reduce((sum, a) => sum + (a.contacts?.length || 0), 0);
  }, [accounts]);

  const leadCount = useMemo(() => buildLeadIntakeQueue({
    accounts,
    opportunities,
    decodes: emailDecodes,
    intelItems,
  }).length, [accounts, opportunities, emailDecodes, intelItems]);

  return (
    <div className="page-shell">
      <SpotlightTour tourKey="atlas" steps={[
        { target: "body", title: en ? "Accounts - Relationship Lens" : "客户 — 客户全貌", content: en ? "Manage accounts, contacts, and opportunities. Open an account to review details, plays, and stakeholder intelligence." : "管理所有客户、联系人和商机信息。点击任何客户查看详情、谋局方案和利益相关方分析。添加客户的关键联系人，AI 就能帮你分析决策结构。", position: "bottom" },
      ]} />
      <div className="page-hero">
        <div className="page-hero-row">
          <div>
            <div className="page-kicker">{en ? "Relationship Lens" : "客户透镜"}</div>
            <h1 className="page-title">{t("nav.atlas")}</h1>
            <p className="page-subtitle">{en ? "Manage accounts, key contacts, open-pool leads, and channel assets in one relationship view." : "统一管理客户、关键联系人、公海线索与渠道资产，让客户关系与销售动作处在同一视野里。"}</p>
          </div>
          <div className="page-meta">{en ? accounts.length + " accounts · " + contactCount + " contacts · " + leadCount + " leads · " + poolCount + " open pool" : accounts.length + " 客户 · " + contactCount + " 联系人 · " + leadCount + " 线索 · " + poolCount + " 公海"}</div>
        </div>

        <div className="module-tabs">

        {TAB_CONFIG.map(({ key, icon: Icon, labelKey }) => {
          const isActive = activeTab === key;
          const badge = key === "pool" ? poolCount : key === "contacts" ? contactCount : key === "leads" ? leadCount : null;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`module-tab ${isActive ? "module-tab-active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
              {badge != null && badge > 0 && (
                <span className="module-tab-badge">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === "accounts" && <AccountsTab />}
        {activeTab === "contacts" && <ContactsTab />}
        {activeTab === "leads" && <LeadsTab />}
        {activeTab === "pool" && <PoolTab />}
        {activeTab === "channels" && <ChannelsTab />}
      </div>
    </div>
  );
}
