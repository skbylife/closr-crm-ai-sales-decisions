"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast-store';
import type {
  Account,
  BusinessTeamSummary,
  OrgMember,
  PursuitTeam,
  PursuitTeamMember,
  ResponsibilityCatalogItem,
} from '@/lib/babel-engine/types';

function getMemberDisplayName(member: OrgMember | undefined, fallbackUserId: string): string {
  if (!member) return fallbackUserId.slice(0, 8);
  if (member.displayName) return member.displayName;
  if (member.email) {
    return member.email.split('@')[0]
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return fallbackUserId.slice(0, 8);
}

function copy(en: boolean, zh: string, english: string): string {
  return en ? english : zh;
}

function formatTeamStatus(status: string | null | undefined, en: boolean): string {
  if (!status) return copy(en, '未知', 'Unknown');
  if (!en) return status;
  const labels: Record<string, string> = {
    active: 'Active',
    inactive: 'Inactive',
    archived: 'Archived',
    draft: 'Draft',
  };
  return labels[status] ?? status;
}

type MemberDraft = {
  isLead: boolean;
  coverageNote: string;
  responsibilityIds: string[];
};

type BusinessTeamPayload = {
  businessTeamId: string | null;
  teams: BusinessTeamSummary[];
};

type ProjectTeamCardProps = {
  account: Account;
};

export function ProjectTeamCard({ account }: ProjectTeamCardProps) {
  const { orgMembers } = useAuth();
  const { locale } = useLocale();
  const en = locale === 'en';
  const [loading, setLoading] = useState(true);
  const [savingBusinessTeam, setSavingBusinessTeam] = useState(false);
  const [teams, setTeams] = useState<BusinessTeamSummary[]>([]);
  const [businessTeamId, setBusinessTeamId] = useState<string | null>(account.businessTeamId ?? null);
  const [responsibilities, setResponsibilities] = useState<ResponsibilityCatalogItem[]>([]);
  const [pursuitTeam, setPursuitTeam] = useState<PursuitTeam | null>(null);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  const membersById = useMemo(() => new Map(orgMembers.map((member) => [member.userId, member])), [orgMembers]);
  const pursuitMembers = useMemo(() => pursuitTeam?.members ?? [], [pursuitTeam?.members]);
  const assignedUserIds = useMemo(() => new Set(pursuitMembers.map((member) => member.userId)), [pursuitMembers]);
  const availableMembers = useMemo(
    () => orgMembers.filter((member) => !assignedUserIds.has(member.userId)),
    [assignedUserIds, orgMembers],
  );

  const syncMemberDrafts = useCallback((members: PursuitTeamMember[]) => {
    setMemberDrafts(Object.fromEntries(members.map((member) => [
      member.id,
      {
        isLead: member.isLead,
        coverageNote: member.coverageNote ?? '',
        responsibilityIds: member.responsibilityIds ?? [],
      },
    ])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [businessRes, pursuitRes, catalogRes] = await Promise.all([
        fetch(`/api/accounts/${encodeURIComponent(account.id)}/business-team`, { cache: 'no-store' }),
        fetch(`/api/accounts/${encodeURIComponent(account.id)}/pursuit-team`, { cache: 'no-store' }),
        fetch('/api/responsibility-catalog', { cache: 'no-store' }),
      ]);
      if (!businessRes.ok || !pursuitRes.ok || !catalogRes.ok) throw new Error('load failed');
      const businessPayload = (await businessRes.json()) as BusinessTeamPayload;
      const pursuitPayload = (await pursuitRes.json()) as { pursuitTeam: PursuitTeam | null };
      const catalogPayload = (await catalogRes.json()) as { responsibilities: ResponsibilityCatalogItem[] };
      setTeams(businessPayload.teams ?? []);
      setBusinessTeamId(businessPayload.businessTeamId ?? null);
      setPursuitTeam(pursuitPayload.pursuitTeam ?? null);
      setResponsibilities(catalogPayload.responsibilities ?? []);
      syncMemberDrafts(pursuitPayload.pursuitTeam?.members ?? []);
    } catch (err) {
      console.error('[ProjectTeamCard] load failed:', err);
      toast(copy(en, '项目推进组信息加载失败', 'Failed to load pursuit team details'), 'error');
    } finally {
      setLoading(false);
    }
  }, [account.id, en, syncMemberDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateBusinessTeam(nextTeamId: string | null) {
    setSavingBusinessTeam(true);
    setBusinessTeamId(nextTeamId);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/business-team`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessTeamId: nextTeamId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { businessTeamId?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'update failed');
      setBusinessTeamId(payload.businessTeamId ?? null);
      toast(copy(en, '管理团队归属已更新', 'Business team ownership updated'), 'success');
    } catch (err) {
      console.error('[ProjectTeamCard] business team update failed:', err);
      toast(copy(en, '管理团队归属更新失败', 'Failed to update business team ownership'), 'error');
      setBusinessTeamId(account.businessTeamId ?? null);
      void load();
    } finally {
      setSavingBusinessTeam(false);
    }
  }

  async function createPursuitTeam() {
    setCreatingTeam(true);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/pursuit-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentTeamId: businessTeamId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { pursuitTeam?: PursuitTeam; error?: string };
      if (!response.ok || !payload.pursuitTeam) throw new Error(payload.error ?? 'create failed');
      setPursuitTeam(payload.pursuitTeam);
      syncMemberDrafts(payload.pursuitTeam.members ?? []);
      toast(copy(en, '项目推进组已创建', 'Pursuit team created'), 'success');
    } catch (err) {
      console.error('[ProjectTeamCard] create pursuit team failed:', err);
      toast(err instanceof Error ? err.message : copy(en, '项目推进组创建失败', 'Failed to create pursuit team'), 'error');
    } finally {
      setCreatingTeam(false);
    }
  }

  async function addMember() {
    if (!pursuitTeam || !newMemberUserId) return;
    setAddingMember(true);
    try {
      const response = await fetch(`/api/pursuit-teams/${encodeURIComponent(pursuitTeam.id)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newMemberUserId, responsibilityIds: [] }),
      });
      const payload = (await response.json().catch(() => ({}))) as { members?: PursuitTeamMember[]; error?: string };
      if (!response.ok || !payload.members) throw new Error(payload.error ?? 'add failed');
      setPursuitTeam({ ...pursuitTeam, members: payload.members });
      syncMemberDrafts(payload.members);
      setNewMemberUserId('');
      toast(copy(en, '成员已加入项目推进组', 'Member added to pursuit team'), 'success');
    } catch (err) {
      console.error('[ProjectTeamCard] add member failed:', err);
      toast(err instanceof Error ? err.message : copy(en, '添加成员失败', 'Failed to add member'), 'error');
    } finally {
      setAddingMember(false);
    }
  }

  async function saveMember(member: PursuitTeamMember) {
    if (!pursuitTeam) return;
    const draft = memberDrafts[member.id];
    if (!draft) return;
    setSavingMemberId(member.id);
    try {
      const response = await fetch(`/api/pursuit-teams/${encodeURIComponent(pursuitTeam.id)}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          isLead: draft.isLead,
          coverageNote: draft.coverageNote.trim() || null,
          responsibilityIds: draft.responsibilityIds,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { members?: PursuitTeamMember[]; error?: string };
      if (!response.ok || !payload.members) throw new Error(payload.error ?? 'save failed');
      setPursuitTeam({ ...pursuitTeam, members: payload.members });
      syncMemberDrafts(payload.members);
      toast(copy(en, '成员职责已保存', 'Member responsibilities saved'), 'success');
    } catch (err) {
      console.error('[ProjectTeamCard] save member failed:', err);
      toast(err instanceof Error ? err.message : copy(en, '保存成员失败', 'Failed to save member'), 'error');
    } finally {
      setSavingMemberId(null);
    }
  }

  async function removeMember(member: PursuitTeamMember) {
    if (!pursuitTeam) return;
    setSavingMemberId(member.id);
    try {
      const response = await fetch(`/api/pursuit-teams/${encodeURIComponent(pursuitTeam.id)}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { members?: PursuitTeamMember[]; error?: string };
      if (!response.ok || !payload.members) throw new Error(payload.error ?? 'delete failed');
      setPursuitTeam({ ...pursuitTeam, members: payload.members });
      syncMemberDrafts(payload.members);
      toast(copy(en, '成员已移除', 'Member removed'), 'success');
    } catch (err) {
      console.error('[ProjectTeamCard] remove member failed:', err);
      toast(err instanceof Error ? err.message : copy(en, '移除成员失败', 'Failed to remove member'), 'error');
    } finally {
      setSavingMemberId(null);
    }
  }

  function updateDraft(memberId: string, patch: Partial<MemberDraft>) {
    setMemberDrafts((current) => ({
      ...current,
      [memberId]: { ...current[memberId], ...patch },
    }));
  }

  function toggleResponsibility(memberId: string, responsibilityId: string) {
    const current = memberDrafts[memberId]?.responsibilityIds ?? [];
    const next = current.includes(responsibilityId)
      ? current.filter((id) => id !== responsibilityId)
      : [...current, responsibilityId];
    updateDraft(memberId, { responsibilityIds: next });
  }

  return (
    <section id="account-team-intelligence" className="scroll-mt-24 rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Users className="h-3.5 w-3.5 text-accent" />
            {copy(en, '团队详细配置', 'Team Configuration')}
          </h3>
          <p className="mt-1 text-xs text-secondary">{copy(en, '管理团队管业务归属；项目推进组管推进职责，不改变权限可见性。', 'Business teams define ownership; pursuit teams define execution roles without changing access permissions.')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-secondary hover:bg-sidebar"
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {copy(en, '刷新', 'Refresh')}
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="form-label">{copy(en, '管理团队归属', 'Business team ownership')}</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={businessTeamId ?? ''}
              onChange={(event) => void updateBusinessTeam(event.target.value || null)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-accent/40 focus:outline-none sm:max-w-xs"
              disabled={loading || savingBusinessTeam}
            >
              <option value="">{copy(en, '未设置', 'Not set')}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}{team.memberCount !== undefined ? ` · ${team.memberCount} ${copy(en, '人', 'members')}` : ''}</option>
              ))}
            </select>
            {savingBusinessTeam && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy(en, '正在加载项目推进组…', 'Loading pursuit team...')}
          </div>
        ) : !pursuitTeam ? (
          <div className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-center">
            <p className="text-sm font-medium text-foreground">{copy(en, '还没有活跃项目推进组', 'No active pursuit team yet')}</p>
            <p className="mt-1 text-xs text-muted">{copy(en, '创建后可给成员分配 Champion、采购、法务安全、会后跟进等推进职责。', 'Create one to assign champion, procurement, legal/security, and follow-up responsibilities.')}</p>
            <button
              type="button"
              onClick={() => void createPursuitTeam()}
              disabled={creatingTeam}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {creatingTeam ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {copy(en, '创建项目推进组', 'Create pursuit team')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{pursuitTeam.name}</p>
                <p className="text-xs text-muted">{pursuitMembers.length} {copy(en, '名成员', 'members')} · {copy(en, '状态', 'Status')} {formatTeamStatus(pursuitTeam.status, en)}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={newMemberUserId}
                  onChange={(event) => setNewMemberUserId(event.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground focus:border-accent/40 focus:outline-none"
                >
                  <option value="">{copy(en, '选择成员', 'Select member')}</option>
                  {availableMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>{getMemberDisplayName(member, member.userId)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void addMember()}
                  disabled={!newMemberUserId || addingMember}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-sidebar disabled:opacity-50"
                >
                  {addingMember ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  {copy(en, '添加成员', 'Add member')}
                </button>
              </div>
            </div>

            {pursuitMembers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-5 text-center text-sm text-muted">
                {copy(en, '先添加一名内部成员，再分配推进职责。', 'Add an internal member first, then assign pursuit responsibilities.')}
              </div>
            ) : (
              <div className="space-y-3">
                {pursuitMembers.map((member) => {
                  const draft = memberDrafts[member.id] ?? { isLead: member.isLead, coverageNote: member.coverageNote ?? '', responsibilityIds: member.responsibilityIds ?? [] };
                  const displayName = getMemberDisplayName(membersById.get(member.userId), member.userId);
                  return (
                    <div key={member.id} className="rounded-xl border border-border bg-background/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            {draft.isLead && <Crown className="h-3.5 w-3.5 text-warning" />}
                            {displayName}
                          </p>
                          <p className="text-xs text-muted">{membersById.get(member.userId)?.email ?? member.userId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-xs text-secondary">
                            <input
                              type="checkbox"
                              checked={draft.isLead}
                              onChange={(event) => updateDraft(member.id, { isLead: event.target.checked })}
                              className="h-3.5 w-3.5 rounded border-border"
                            />
                            {copy(en, '负责人', 'Lead')}
                          </label>
                          <button
                            type="button"
                            onClick={() => void removeMember(member)}
                            disabled={savingMemberId === member.id}
                            className="rounded-lg border border-danger/20 p-1.5 text-danger hover:bg-danger/5 disabled:opacity-50"
                            aria-label={copy(en, '移除成员', 'Remove member')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="form-label">{copy(en, '职责标签', 'Responsibility tags')}</label>
                        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2">
                          {responsibilities.map((responsibility) => {
                            const checked = draft.responsibilityIds.includes(responsibility.id);
                            return (
                              <button
                                key={responsibility.id}
                                type="button"
                                onClick={() => toggleResponsibility(member.id, responsibility.id)}
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${checked ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-background text-secondary hover:border-accent/30'}`}
                              >
                                {responsibility.label}
                              </button>
                            );
                          })}
                          {responsibilities.length === 0 && <span className="text-xs text-muted">{copy(en, '暂无职责标签', 'No responsibility tags')}</span>}
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="form-label">{copy(en, '覆盖说明', 'Coverage note')}</label>
                        <textarea
                          value={draft.coverageNote}
                          onChange={(event) => updateDraft(member.id, { coverageNote: event.target.value })}
                          rows={2}
                          className="w-full resize-none rounded-lg border border-border bg-card p-2 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none"
                          placeholder={copy(en, '例如：负责采购流程推进；与 CIO 办公室关系较熟。', 'Example: owns procurement follow-up and has a strong relationship with the CIO office.')}
                        />
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void saveMember(member)}
                          disabled={savingMemberId === member.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                        >
                          {savingMemberId === member.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          {copy(en, '保存成员', 'Save member')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
