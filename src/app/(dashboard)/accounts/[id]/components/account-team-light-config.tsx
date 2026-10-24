"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Loader2, Users } from 'lucide-react';
import type { Account, BusinessTeamSummary, OrgMember, PursuitTeam } from '@/lib/babel-engine/types';
import { toast } from '@/lib/toast-store';
import { selectFieldClass } from '@/components/accounts/shared';
import { getAccountTeamDetailHref } from './account-detail-navigation';

export type BusinessTeamPayload = {
  businessTeamId: string | null;
  teams: BusinessTeamSummary[];
};

export type AccountTeamLightConfigProps = {
  account: Account;
  orgMembers: OrgMember[];
  canAssignOwner: boolean;
  effectiveOwnerId?: string | null;
  ownerName?: string | null;
  onChangeOwner: (userId: string | null) => void | Promise<void>;
  onBusinessTeamChanged?: (businessTeamId: string | null) => void;
  detailHref?: string;
};

export function getOrgMemberDisplayName(member: OrgMember): string {
  if (member.displayName) return member.displayName;
  if (member.email) {
    return member.email.split('@')[0]
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return member.userId.slice(0, 8);
}

export function accountVisibilityText(effectiveOwnerId?: string | null): string {
  if (!effectiveOwnerId) return '公海客户：组织成员可见，可由有权限成员认领。';
  return '跟随客户负责人：成员看本人客户，管理者看团队范围，管理员 / 所有者看组织范围。';
}

function pursuitTeamStatusText(team: PursuitTeam | null): string {
  if (!team) return '未创建项目推进组';
  const memberCount = team.members?.length ?? 0;
  return `${team.name} · ${memberCount} 名成员`;
}

export function AccountTeamLightConfig({
  account,
  orgMembers,
  canAssignOwner,
  effectiveOwnerId,
  ownerName,
  onChangeOwner,
  onBusinessTeamChanged,
  detailHref,
}: AccountTeamLightConfigProps) {
  const resolvedDetailHref = detailHref ?? getAccountTeamDetailHref(account.id);
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingBusinessTeam, setSavingBusinessTeam] = useState(false);
  const [teams, setTeams] = useState<BusinessTeamSummary[]>([]);
  const [businessTeamId, setBusinessTeamId] = useState<string | null>(account.businessTeamId ?? null);
  const [pursuitTeam, setPursuitTeam] = useState<PursuitTeam | null>(null);

  const selectedBusinessTeam = useMemo(
    () => teams.find((team) => team.id === businessTeamId) ?? null,
    [businessTeamId, teams],
  );

  const loadTeamSummary = useCallback(async () => {
    setLoading(true);
    try {
      const [businessRes, pursuitRes] = await Promise.all([
        fetch(`/api/accounts/${encodeURIComponent(account.id)}/business-team`, { cache: 'no-store' }),
        fetch(`/api/accounts/${encodeURIComponent(account.id)}/pursuit-team`, { cache: 'no-store' }),
      ]);
      if (!businessRes.ok || !pursuitRes.ok) throw new Error('load failed');
      const businessPayload = (await businessRes.json()) as BusinessTeamPayload;
      const pursuitPayload = (await pursuitRes.json()) as { pursuitTeam: PursuitTeam | null };
      setTeams(businessPayload.teams ?? []);
      setBusinessTeamId(businessPayload.businessTeamId ?? null);
      setPursuitTeam(pursuitPayload.pursuitTeam ?? null);
    } catch (err) {
      console.error('[AccountTeamLightConfig] load failed:', err);
      toast('团队与负责人信息加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [account.id]);

  useEffect(() => {
    void loadTeamSummary();
  }, [loadTeamSummary]);

  async function updateBusinessTeam(nextTeamId: string | null) {
    setSavingBusinessTeam(true);
    const previousTeamId = businessTeamId;
    setBusinessTeamId(nextTeamId);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/business-team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessTeamId: nextTeamId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { businessTeamId?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'update failed');
      const savedTeamId = payload.businessTeamId ?? null;
      setBusinessTeamId(savedTeamId);
      onBusinessTeamChanged?.(savedTeamId);
      toast('管理团队归属已更新', 'success');
    } catch (err) {
      console.error('[AccountTeamLightConfig] business team update failed:', err);
      setBusinessTeamId(previousTeamId);
      toast('管理团队归属更新失败', 'error');
    } finally {
      setSavingBusinessTeam(false);
    }
  }

  function handleOwnerChange(nextUserId: string | null) {
    setOwnerDropdownOpen(false);
    void onChangeOwner(nextUserId);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-label="团队与负责人">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Users className="h-3.5 w-3.5 text-accent" />
            团队与负责人
          </h3>
          <p className="mt-1 text-xs leading-5 text-secondary">轻量配置归属与负责人；成员职责请到团队详细配置维护。</p>
        </div>
        <a
          href={resolvedDetailHref}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-sidebar hover:text-foreground"
        >
          打开团队详细配置
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <label className="form-label">管理团队归属</label>
          <div className="flex items-center gap-2">
            <select
              value={businessTeamId ?? ''}
              onChange={(event) => void updateBusinessTeam(event.target.value || null)}
              className={`${selectFieldClass} min-w-0`}
              disabled={loading || savingBusinessTeam}
            >
              <option value="">未设置</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}{team.memberCount !== undefined ? ` · ${team.memberCount}人` : ''}</option>
              ))}
            </select>
            {(loading || savingBusinessTeam) && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />}
          </div>
          {selectedBusinessTeam ? (
            <p className="mt-2 truncate text-xs text-muted">当前：{selectedBusinessTeam.name}</p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">未分配团队，后续协作和汇报可能断层。</p>
          )}
        </div>

        <div className="relative rounded-lg border border-border bg-background/40 p-3">
          <label className="form-label">客户负责人</label>
          {canAssignOwner ? (
            <button
              type="button"
              onClick={() => setOwnerDropdownOpen((value) => !value)}
              className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground hover:text-accent"
            >
              <span className="truncate">{ownerName ?? '未分配'}</span>
              <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted" />
            </button>
          ) : (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground">{ownerName ?? '未分配'}</p>
          )}
          {ownerDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOwnerDropdownOpen(false)} />
              <div className="absolute left-3 right-3 top-[calc(100%-0.5rem)] z-20 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                <button
                  type="button"
                  onClick={() => handleOwnerChange(null)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar ${!effectiveOwnerId ? 'font-semibold text-accent' : 'text-secondary'}`}
                >
                  未分配
                </button>
                {orgMembers.map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => handleOwnerChange(member.userId)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar ${effectiveOwnerId === member.userId ? 'font-semibold text-accent' : 'text-foreground'}`}
                  >
                    <span>{getOrgMemberDisplayName(member)}</span>
                    {member.email && <span className="ml-1 text-xs text-muted">({member.email})</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-3">
          <label className="form-label">项目推进组</label>
          <p className="truncate text-sm font-medium text-foreground">{loading ? '正在加载…' : pursuitTeamStatusText(pursuitTeam)}</p>
          {pursuitTeam ? (
            <p className="mt-2 text-xs leading-5 text-muted">成员列表、牵头人、职责标签和覆盖说明保留在团队详细配置中维护。</p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">未创建项目推进组，Champion / 采购 / 法务等推进责任还没有明确。</p>
          )}
          <a
            href={resolvedDetailHref}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-secondary hover:bg-sidebar hover:text-foreground"
          >
            {pursuitTeam ? '管理成员职责' : '创建项目推进组'}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-3">
          <label className="form-label">可见性范围</label>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-border bg-card px-2 py-1 text-xs text-foreground">本人客户</span>
            <span className="rounded-full border border-border bg-card px-2 py-1 text-xs text-foreground">团队范围</span>
            <span className="rounded-full border border-border bg-card px-2 py-1 text-xs text-foreground">组织管理员可见</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">由角色权限决定，此处不单独修改。{accountVisibilityText(effectiveOwnerId)}</p>
        </div>
      </div>
    </section>
  );
}
