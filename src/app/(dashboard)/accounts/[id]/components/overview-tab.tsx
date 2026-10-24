"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Plus,
  Swords,
  ChevronRight,
  Radio,
  AlertTriangle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import type {
  Account,
  IntelItem,
  SavedDecode,
  DealHealth,
  Opportunity,
} from "@/lib/babel-engine/types";
import { STAGE_LABELS } from "@/lib/babel-engine/types";
import {
  DEAL_STAGES,
  inputFieldClass,
  selectFieldClass,
} from "@/components/accounts/shared";
import { AccountTeamLightConfig, getOrgMemberDisplayName } from "./account-team-light-config";
import { buildAccountBasicsUpdate } from "./account-basics-form";
import { MOMENTUM_CONFIG } from "@/lib/permissions";
import type { StrategicPlay, PlayMomentum } from "@/lib/babel-engine/types";
import { toast } from "@/lib/toast-store";
import { DECODE_SOURCE_LABELS } from "@/components/decode/decode-helpers";

const OVERVIEW_PLAYS_CACHE_TTL_MS = 30_000;
const OVERVIEW_PLAYS_RETRY_DELAY_MS = 5_000;

type OverviewPlaysPayload = {
  plays: StrategicPlay[];
};

const overviewPlaysCache = new Map<string, { timestamp: number; payload: OverviewPlaysPayload }>();
const overviewPlaysInFlight = new Map<string, Promise<OverviewPlaysPayload>>();
const overviewPlaysBackoffUntil = new Map<string, number>();

async function getOverviewPlays(accountId: string): Promise<OverviewPlaysPayload> {
  const now = Date.now();
  const cached = overviewPlaysCache.get(accountId);
  if (cached && now - cached.timestamp < OVERVIEW_PLAYS_CACHE_TTL_MS) {
    return cached.payload;
  }

  const backoffUntil = overviewPlaysBackoffUntil.get(accountId) ?? 0;
  if (backoffUntil > now) {
    return cached?.payload ?? { plays: [] };
  }

  let request = overviewPlaysInFlight.get(accountId);
  if (!request) {
    request = fetch(`/api/strategic-play?accountId=${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 429) {
            overviewPlaysBackoffUntil.set(accountId, Date.now() + OVERVIEW_PLAYS_RETRY_DELAY_MS);
          }
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as { plays?: StrategicPlay[] };
        const payload = { plays: data.plays ?? [] };
        overviewPlaysCache.set(accountId, { timestamp: Date.now(), payload });
        overviewPlaysBackoffUntil.delete(accountId);
        return payload;
      })
      .finally(() => {
        overviewPlaysInFlight.delete(accountId);
      });
    overviewPlaysInFlight.set(accountId, request);
  }

  return request;
}

type AccountBasicsPanelProps = {
  account: Account;
  isEditing: boolean;
  onEditDone: () => void;
  onTransfer?: () => void;
  onReclaim?: () => void;
};

export function AccountBasicsPanel({
  account,
  isEditing,
  onEditDone,
  onTransfer,
  onReclaim,
}: AccountBasicsPanelProps) {
  const { updateAccount, hydrate } = useStore();
  const { orgMembers, orgRole } = useAuth();
  const jobLevel = useEffectiveJobLevel();

  const canAssignOwner = orgRole === 'owner' || orgRole === 'admin' || jobLevel >= 1;

  async function changeOwnerViaApi(newUserId: string | null) {
    try {
      const res = await fetch('/api/accounts/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          toUserId: newUserId,
          reason: newUserId ? 'transfer' : 'reclaim',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '操作失败' }));
        toast(err.error || '操作失败', 'error');
        return;
      }
      await hydrate();
    } catch {
      toast('操作失败，请重试', 'error');
    }
  }

  const effectiveOwnerId = account.ownerId ?? account.userId;
  const currentOwner = orgMembers.find((m) => m.userId === effectiveOwnerId);
  const ownerName = currentOwner ? getOrgMemberDisplayName(currentOwner) : null;

  const [editName, setEditName] = useState(account.name);
  const [editIndustry, setEditIndustry] = useState(account.industry ?? "");
  const [editWebsite, setEditWebsite] = useState(account.website ?? "");
  const [editNotes, setEditNotes] = useState(account.notes ?? "");
  const [editDealStage, setEditDealStage] = useState(account.dealStage ?? "");
  const [editDealValue, setEditDealValue] = useState(account.dealValue?.toString() ?? "");
  const [editDealHealth, setEditDealHealth] = useState<DealHealth | "">(account.dealHealth ?? "");

  function handleSave() {
    updateAccount(account.id, buildAccountBasicsUpdate(account, {
      name: editName,
      industry: editIndustry,
      website: editWebsite,
      notes: editNotes,
      dealStage: editDealStage,
      dealValue: editDealValue,
      dealHealth: editDealHealth,
    }));
    onEditDone();
  }

  function handleCancel() {
    setEditName(account.name);
    setEditIndustry(account.industry ?? "");
    setEditWebsite(account.website ?? "");
    setEditNotes(account.notes ?? "");
    setEditDealStage(account.dealStage ?? "");
    setEditDealValue(account.dealValue?.toString() ?? "");
    setEditDealHealth(account.dealHealth ?? "");
    onEditDone();
  }

  if (!isEditing) {
    return null;
  }

  return (
    <div id="account-basics-edit-form" className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-secondary uppercase tracking-wider">
          <ChevronDown className="h-3.5 w-3.5" />
          编辑基本信息
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onTransfer && (
            <button onClick={onTransfer} className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-secondary hover:bg-sidebar hover:text-foreground">转移</button>
          )}
          {onReclaim && (
            <button onClick={onReclaim} className="rounded-lg border border-danger/30 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/5">释放至公海</button>
          )}
          <div className="w-px h-4 bg-border mx-1" />
          <button onClick={handleCancel} className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-secondary hover:bg-sidebar">取消</button>
          <button onClick={handleSave} className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover">保存</button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-sm p-4">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <label className="form-label">公司名称</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputFieldClass} />
          </div>
          <div>
            <label className="form-label">行业</label>
            <input type="text" value={editIndustry} onChange={(e) => setEditIndustry(e.target.value)} className={inputFieldClass} />
          </div>
          <div>
            <label className="form-label">网站</label>
            <input type="text" value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} className={inputFieldClass} />
          </div>
          <div>
            <label className="form-label">商机阶段</label>
            <select value={editDealStage} onChange={(e) => setEditDealStage(e.target.value)} className={selectFieldClass}>
              <option value="">未设置</option>
              {DEAL_STAGES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </div>
          <div>
            <label className="form-label">商机金额</label>
            <input type="number" value={editDealValue} onChange={(e) => setEditDealValue(e.target.value)} className={inputFieldClass} placeholder="例如 2000000" />
          </div>
          <div>
            <label className="form-label">商机健康度</label>
            <select value={editDealHealth} onChange={(e) => setEditDealHealth(e.target.value as DealHealth | "")} className={selectFieldClass}>
              <option value="">未设置</option>
              <option value="healthy">正常</option>
              <option value="at_risk">风险</option>
              <option value="critical">严重</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">备注</label>
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none" rows={3} />
          </div>
        </div>
      </div>
      <AccountTeamLightConfig
        account={account}
        orgMembers={orgMembers}
        canAssignOwner={canAssignOwner}
        effectiveOwnerId={effectiveOwnerId}
        ownerName={ownerName}
        onChangeOwner={changeOwnerViaApi}
      />
    </div>
  );
}

export function OverviewTab({
  account,
  intelItems: accountIntel,
  decodes: accountDecodes,
  opportunities,
  onSwitchTab,
}: {
  account: Account;
  intelItems: IntelItem[];
  decodes: SavedDecode[];
  opportunities: Opportunity[];
  onSwitchTab?: (tab: string, prefill?: { goalType?: string; goalDescription?: string }) => void;
}) {
  const activeOpportunities = opportunities.filter((o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost');
  const recentSignalCount = accountIntel.length + accountDecodes.length;
  const recentDecodes = [...accountDecodes]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  // Fetch plays for this account (single request for both active and all)
  const [activePlays, setActivePlays] = useState<StrategicPlay[]>([]);
  useEffect(() => {
    let cancelled = false;
    getOverviewPlays(account.id)
      .then(({ plays }) => {
        if (!cancelled) {
          setActivePlays(plays.filter(p => p.status === 'active' || p.status === 'in_progress'));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[overview] Plays fetch failed:', err);
        }
      });
    return () => { cancelled = true; };
  }, [account.id]);

  // Play lookup by opportunityId for inline momentum dots
  const playByOppId = useMemo(() => {
    const map = new Map<string, StrategicPlay>();
    for (const p of activePlays) {
      if (p.opportunityId) map.set(p.opportunityId, p);
    }
    return map;
  }, [activePlays]);

  return (
    <div className="space-y-5">
      {/* Active Plays (PROMINENT, first content section) */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              活跃谋局
            </h3>
            <button
              onClick={() => onSwitchTab?.("plays")}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-3 w-3" />
              新建谋局
            </button>
          </div>
        </div>
        <div className="p-4">
          {activePlays.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {activePlays.map((play) => {
                const mc = MOMENTUM_CONFIG[play.momentum as PlayMomentum] ?? MOMENTUM_CONFIG.active;
                const nextStep = play.steps.find(s => s.status === 'pending' || s.status === 'in_progress');
                return (
                  <div key={play.id} onClick={() => onSwitchTab?.("plays")} className="cursor-pointer">
                    <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${mc.dotColor}`} title={mc.label} />
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{play.goalDescription}</span>
                        <span className="text-xs text-secondary">{play.confidence}%</span>
                      </div>
                      {nextStep && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-muted ml-[18px]">
                          <ChevronRight className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">下一步: {nextStep.title}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card">
                <Swords className="h-4 w-4 text-muted" />
              </div>
              <p className="text-xs font-medium text-foreground">该账户暂无活跃谋局</p>
              <button
                onClick={() => onSwitchTab?.("plays")}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
              >
                <Plus className="h-3 w-3" />
                开始谋局
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Signals */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <Radio className="h-3.5 w-3.5 text-accent" />
              最近客户信号
            </h3>
            <button
              onClick={() => onSwitchTab?.("activity")}
              className="text-xs font-medium text-accent hover:text-accent-hover"
            >
              查看信号库
            </button>
          </div>
        </div>
        <div className="p-4">
          {recentDecodes.length > 0 ? (
            <div className="space-y-2">
              {recentDecodes.map((decode) => {
                const risk = decode.decode.threadAnalysis?.riskLevel;
                const riskClass = risk === "critical" || risk === "high"
                  ? "border-danger/20 bg-danger/5 text-danger"
                  : risk === "medium"
                    ? "border-warning/20 bg-warning/5 text-warning"
                    : "border-positive/20 bg-positive/5 text-positive";
                const sourceLabel = DECODE_SOURCE_LABELS[decode.signalSource || "email"]?.zh ?? "邮件";
                return (
                  <button
                    key={decode.id}
                    onClick={() => onSwitchTab?.("activity")}
                    className="w-full rounded-xl border border-border bg-background/40 px-3 py-3 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.03]"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${riskClass}`}>
                        {(risk === "critical" || risk === "high") && <AlertTriangle className="h-3 w-3" />}
                        {sourceLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {decode.decode.threadAnalysis?.keySignal || decode.emailText.slice(0, 120)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {new Date(decode.date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                          {decode.analysisGoal ? ` · ${decode.analysisGoal}` : ""}
                          {decode.opportunityId ? " · 已关联商机" : ""}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-5 text-center">
              <p className="text-sm font-medium text-foreground">暂无已沉淀信号</p>
              <p className="mt-1 text-xs text-muted">从信号录入页或活动页补充客户沟通后，这里会显示最近 3 条关键判断。</p>
              <Link href="/decode" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
                去录入信号
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 4. Active Opportunities (with play coverage) */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              活跃商机
            </h3>
            <Link
              href={`/pipeline?new=true&accountId=${account.id}&accountName=${encodeURIComponent(account.name)}`}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-3 w-3" />
              新建商机
            </Link>
          </div>
        </div>
        <div className="p-4">
          {activeOpportunities.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {activeOpportunities.map((opp) => {
                const oppPlay = playByOppId.get(opp.id);
                return (
                  <Link key={opp.id} href={`/pipeline/${opp.id}`}>
                    <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md cursor-pointer">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          {oppPlay ? (
                            (() => {
                              const mc = MOMENTUM_CONFIG[oppPlay.momentum as PlayMomentum] ?? MOMENTUM_CONFIG.active;
                              return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${mc.dotColor}`} title={`谋局: ${mc.label}`} />;
                            })()
                          ) : null}
                          {opp.name}
                          {!oppPlay && (
                            <span className="ml-1.5 rounded bg-muted/10 border border-border px-1.5 py-0.5 text-[12px] text-muted">无谋局</span>
                          )}
                        </span>
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          {STAGE_LABELS[opp.stage]}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">
                          {opp.currency === 'CNY' ? '¥' : opp.currency === 'EUR' ? '€' : '$'}{opp.value.toLocaleString()}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted">MEDDICC {opp.meddicc.overallScore}%</span>
                          <div className="h-1.5 w-16 rounded-full bg-border">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${opp.meddicc.overallScore}%`,
                                backgroundColor: opp.meddicc.overallScore >= 70 ? 'var(--positive)' : opp.meddicc.overallScore >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted text-center py-4">暂无活跃商机</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            推进补充信息
          </h3>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <p className="text-xs text-muted">联系人</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{account.contacts.length}</p>
            <p className="mt-1 text-xs text-secondary">更细的干系人分析留在联系人与分析页。</p>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <p className="text-xs text-muted">最近信号</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{recentSignalCount}</p>
            <button
              onClick={() => onSwitchTab?.('activity')}
              className="mt-1 text-xs font-medium text-accent hover:text-accent-hover"
            >
              去活动页看完整上下文 →
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
