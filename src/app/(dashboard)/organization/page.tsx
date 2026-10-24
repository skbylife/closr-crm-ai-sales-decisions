'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import { useState, useEffect, useCallback } from 'react';
import { Building2, Users, UserPlus, Shield, Crown, Copy, Check, Trash2, Save, Loader2, Mail, Clock, Settings as SettingsIcon, X, Plus, Search, HelpCircle, Info } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { appConfirm } from '@/lib/confirm-store';
import { useStore } from '@/lib/store';
import type { OrgRole, OrgInvitation } from '@/lib/babel-engine/types';
import { JOB_LEVEL_LABELS } from '@/lib/babel-engine/types';
import DashboardConfigSection from './dashboard-config-section';
const ROLE_LABELS: Record<OrgRole, string> = {
  owner: '拥有者',
  admin: '管理员',
  manager: '经理',
  member: '成员'
};
const ROLE_COLORS: Record<OrgRole, string> = {
  owner: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  admin: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  manager: 'bg-green-500/10 text-green-600 border-green-500/20',
  member: 'bg-gray-500/10 text-gray-600 border-gray-500/20'
};
const ROLE_ICONS: Record<OrgRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  manager: Users,
  member: Users
};
export default function OrganizationPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const {
    user,
    orgId,
    orgName,
    orgRole,
    orgMembers,
    refreshOrg
  } = useAuth();
  const addNotification = useStore(s => s.addNotification);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<OrgRole, 'owner'> | ''>('');
  const [inviteJobLevel, setInviteJobLevel] = useState<number | ''>('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [pendingInvites, setPendingInvites] = useState<OrgInvitation[]>([]);
  const [editingOrgName, setEditingOrgName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [managerCanViewDecodes, setManagerCanViewDecodes] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [showRoleGuide, setShowRoleGuide] = useState(false);

  // 邀请弹窗状态
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [modalInviteEmail, setModalInviteEmail] = useState('');
  const [modalInviteRole, setModalInviteRole] = useState<Exclude<OrgRole, 'owner'> | ''>('');
  const [modalInviteJobLevel, setModalInviteJobLevel] = useState<number | ''>('');
  const [modalInviteLoading, setModalInviteLoading] = useState(false);
  const [modalInviteError, setModalInviteError] = useState('');
  const [modalInviteSuccess, setModalInviteSuccess] = useState('');

  // 团队管理状态
  interface Team {
    id: string;
    name: string;
    memberCount: number;
    createdAt: string;
  }
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);

  // 邮箱格式验证
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canManageMembers = orgRole === 'owner' || orgRole === 'admin';
  const isOwner = orgRole === 'owner';

  // Load pending invitations
  const loadInvitations = useCallback(async () => {
    if (!orgId || !canManageMembers) return;
    try {
      const res = await fetch(`/api/invite?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setPendingInvites(data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          orgId: r.org_id as string,
          email: r.email as string,
          role: r.role as Exclude<OrgRole, 'owner'>,
          token: r.token as string,
          invitedBy: r.invited_by as string ?? undefined,
          expiresAt: r.expires_at as string,
          acceptedAt: r.accepted_at as string ?? undefined,
          createdAt: r.created_at as string
        })));
      }
    } catch (e) {
      console.error('Failed to load invitations:', e);
    }
  }, [orgId, canManageMembers]);
  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  // Load teams
  const loadTeams = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/organization/teams?orgId=${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch (e) {
      console.error('Failed to load teams:', e);
    }
  }, [orgId]);
  useEffect(() => {
    loadTeams();
  }, [loadTeams]);
  useEffect(() => {
    if (orgName) setEditingOrgName(orgName);
  }, [orgName]);
  if (!orgId) {
    return <div className="mx-auto max-w-4xl py-12 text-center">
        <Building2 className="mx-auto h-12 w-12 text-muted/40 mb-4" />
        <h1 className="text-lg font-semibold text-foreground">{tx("暂无组织")}</h1>
        <p className="mt-2 text-sm text-muted">{tx("你还没有加入任何组织")}</p>
      </div>;
  }
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    if (!inviteRole) {
      setInviteError('请选择成员角色');
      return;
    }
    if (inviteJobLevel === '') {
      setInviteError('请选择成员职级');
      return;
    }
    setInviteError('');
    setInviteLink('');
    setInviteLoading(true);

    // 解析多个邮箱并验证格式
    const rawEmails = inviteEmail.split(/[,;\s\n]+/).map(e => e.trim().toLowerCase()).filter(e => e.length > 0);
    const invalidEmails = rawEmails.filter(e => !EMAIL_REGEX.test(e));
    if (invalidEmails.length > 0) {
      setInviteError(`邮箱格式无效: ${invalidEmails.join(', ')}`);
      setInviteLoading(false);
      return;
    }
    const emails = rawEmails.filter(e => EMAIL_REGEX.test(e));
    if (emails.length === 0) {
      setInviteError('请输入有效的邮箱地址');
      setInviteLoading(false);
      return;
    }
    const results: string[] = [];
    const directlyAdded: string[] = [];
    const errors: string[] = [];
    for (const email of emails) {
      try {
        const res = await fetch('/api/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email,
            role: inviteRole,
            jobLevel: inviteJobLevel,
            orgId
          })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          errors.push(email + ': ' + (data?.error || `失败 (${res.status})`));
        } else if (data?.directlyAdded === true) {
          directlyAdded.push(data?.requiresMfaSetup ? email + '（请提醒对方在 Settings > Security 启用 MFA）' : email);
        } else if (data?.emailFailed) {
          // Invitation created but email failed — show link so user can share manually
          results.push(data.inviteLink);
          errors.push(email + ': 邮件发送失败，请手动发送邀请链接');
        } else {
          results.push(data.inviteLink);
        }
      } catch {
        errors.push(email + ': 网络错误');
      }
    }
    if (results.length > 0 || directlyAdded.length > 0) {
      const lines: string[] = [];
      if (directlyAdded.length > 0) {
        lines.push('✅ 已直接加入: ' + directlyAdded.join(', '));
      }
      if (results.length > 0) {
        lines.push(...results);
      }
      setInviteLink(lines.join('\n'));
      setInviteEmail('');
      loadInvitations();
      await refreshOrg();
      // 为每个成功邀请的邮箱生成通知
      const allInvited = [...directlyAdded, ...emails.filter(e => !errors.some(err => err.startsWith(e)))];
      for (const invited of allInvited) {
        addNotification({
          type: 'org_invite',
          title: '成员邀请已发送',
          message: `已邀请 ${invited} 加入组织`,
          actionUrl: '/organization'
        });
      }
    }
    if (errors.length > 0) {
      setInviteError(errors.join('\n'));
    }
    setInviteLoading(false);
  };
  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleChangeRole = async (memberId: string, memberUserId: string, newRole: OrgRole) => {
    setSavingMemberId(memberUserId);
    try {
      const res = await fetch('/api/organization/members', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          userId: memberUserId,
          role: newRole
        })
      });
      if (res.ok) {
        await refreshOrg();
      }
    } catch (e) {
      console.error('Failed to change role:', e);
    } finally {
      setSavingMemberId(null);
    }
  };
  const handleChangeJobLevel = async (memberUserId: string, newJobLevel: number) => {
    setSavingMemberId(memberUserId);
    try {
      const res = await fetch('/api/organization/members', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          userId: memberUserId,
          jobLevel: newJobLevel
        })
      });
      if (res.ok) {
        await refreshOrg();
      }
    } catch (e) {
      console.error('Failed to change job level:', e);
    } finally {
      setSavingMemberId(null);
    }
  };
  const handleRemoveMember = async (memberUserId: string) => {
    if (!(await appConfirm({
      message: '确定要移除该成员吗？此操作不可撤销。',
      variant: 'danger'
    }))) return;
    try {
      const res = await fetch('/api/organization/members', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          userId: memberUserId
        })
      });
      if (res.ok) {
        await refreshOrg();
      }
    } catch (e) {
      console.error('Failed to remove member:', e);
    }
  };

  // 邀请弹窗提交 → 调用 /api/invite（有认证）
  const handleModalInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalInviteEmail.trim()) return;
    if (!modalInviteRole) {
      setModalInviteError('请选择成员角色');
      return;
    }
    if (modalInviteJobLevel === '') {
      setModalInviteError('请选择成员职级');
      return;
    }
    setModalInviteError('');
    setModalInviteSuccess('');
    setModalInviteLoading(true);

    // 验证邮箱格式
    const email = modalInviteEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      setModalInviteError('邮箱格式无效');
      setModalInviteLoading(false);
      return;
    }
    try {
      if (!orgId) {
        setModalInviteError('未找到组织信息，请刷新页面');
        setModalInviteLoading(false);
        return;
      }
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          role: modalInviteRole,
          jobLevel: modalInviteJobLevel,
          orgId
        })
      });
      const text = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = JSON.parse(text);
      } catch {/* non-JSON response */}
      if (!res.ok) {
        setModalInviteError(data?.error as string || data?.message as string || `邀请失败 (${res.status}): ${text.slice(0, 100)}`);
      } else if (data) {
        const emailFailed = data.emailFailed as boolean | undefined;
        const requiresMfaSetup = data.requiresMfaSetup as boolean | undefined;
        const mfaNote = requiresMfaSetup ? ' 高权限账号创建后需在 Settings > Security 启用 MFA。' : '';
        setModalInviteSuccess((emailFailed ? `邀请已创建，但邮件发送失败。请手动将链接发给对方：${data.inviteLink}` : data.message as string || '邀请已发送') + mfaNote);
        setModalInviteEmail('');
        setModalInviteRole('');
        setModalInviteJobLevel('');
        addNotification({
          type: 'org_invite',
          title: '成员邀请已发送',
          message: `已邀请 ${email} (${ROLE_LABELS[modalInviteRole]}) 加入组织`,
          actionUrl: '/organization'
        });
        // 2 秒后自动关闭弹窗
        setTimeout(() => {
          setShowInviteModal(false);
          setModalInviteSuccess('');
        }, 2000);
      }
    } catch (err) {
      console.error('[invite-modal] fetch failed:', err);
      setModalInviteError(`请求失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setModalInviteLoading(false);
    }
  };
  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !orgId) return;
    setCreatingTeam(true);
    try {
      const res = await fetch('/api/organization/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          name: newTeamName.trim()
        })
      });
      if (res.ok) {
        setNewTeamName('');
        await loadTeams();
      }
    } catch (e) {
      console.error('Failed to create team:', e);
    } finally {
      setCreatingTeam(false);
    }
  };
  const handleDeleteTeam = async (teamId: string) => {
    if (!(await appConfirm({
      message: '确定删除此团队？成员将取消分配。',
      variant: 'danger'
    })) || !orgId) return;
    setDeletingTeamId(teamId);
    try {
      await fetch('/api/organization/teams', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          teamId
        })
      });
      await loadTeams();
    } catch (e) {
      console.error('Failed to delete team:', e);
    } finally {
      setDeletingTeamId(null);
    }
  };
  const handleAssignTeam = async (memberId: string, userId: string, teamId: string | null) => {
    if (!orgId) return;
    try {
      const res = await fetch('/api/organization/members', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          userId,
          teamId
        })
      });
      if (res.ok) {
        refreshOrg();
        await loadTeams();
      }
    } catch (e) {
      console.error('Failed to assign team:', e);
    }
  };
  const handleSaveOrgName = async () => {
    if (!editingOrgName.trim() || editingOrgName === orgName) return;
    setSavingName(true);
    try {
      const res = await fetch('/api/organization/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orgId,
          name: editingOrgName.trim()
        })
      });
      if (res.ok) {
        await refreshOrg();
      }
    } catch (e) {
      console.error('Failed to save org name:', e);
    } finally {
      setSavingName(false);
    }
  };

  // 格式化加入时间的辅助函数
  const formatJoinDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '今天加入';
    if (diffDays === 1) return '昨天加入';
    if (diffDays < 30) return `${diffDays} 天前加入`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前加入`;
    return `${Math.floor(diffDays / 365)} 年前加入`;
  };
  return <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{tx("组织管理")}</h1>
          <p className="mt-0.5 text-sm text-secondary">{tx("管理你的组织、成员和权限")}</p>
        </div>
        {canManageMembers && <button onClick={() => {
        setShowInviteModal(true);
        setModalInviteEmail('');
        setModalInviteRole('member');
        setModalInviteError('');
        setModalInviteSuccess('');
      }} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
            <UserPlus className="h-4 w-4" />{tx("邀请新成员")}</button>}
      </div>

      {/* Organization Info */}
      <div className="rounded-xl border border-border bg-card card-elevated p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="h-4 w-4 text-muted" />{tx("组织信息")}</h2>
        <div className="space-y-3">
          <div>
            <label className="form-label">{tx("组织名称")}</label>
            <div className="flex gap-2">
              <input type="text" value={editingOrgName} onChange={e => setEditingOrgName(e.target.value)} disabled={!isOwner} className="form-input flex-1" />
              {isOwner && editingOrgName !== orgName && <button onClick={handleSaveOrgName} disabled={savingName} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                  {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{tx("保存")}</button>}
            </div>
          </div>
          <div>
            <label className="form-label">{tx("你的角色")}</label>
            <div className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${ROLE_COLORS[orgRole!]}`}>
              {(() => {
              const Icon = ROLE_ICONS[orgRole!];
              return <Icon className="h-3.5 w-3.5" />;
            })()}
              {ROLE_LABELS[orgRole!]}
            </div>
          </div>
        </div>
      </div>

      {/* Members — 增强版团队成员列表 */}
      <div className="rounded-xl border border-border bg-card card-elevated p-5">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted" />{tx("团队成员")}<span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">{orgMembers.length}{tx("人")}</span>
          </h2>
          <div className="flex-1" />
          {canManageMembers && <button onClick={() => {
          setShowInviteModal(true);
          setModalInviteEmail('');
          setModalInviteRole('member');
          setModalInviteError('');
          setModalInviteSuccess('');
        }} className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10">
              <UserPlus className="h-3.5 w-3.5" />{tx("邀请")}</button>}
          <button onClick={() => setShowRoleGuide(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground hover:bg-background">
            <HelpCircle className="h-3.5 w-3.5" />{tx("权限说明")}</button>
        </div>
        {/* 搜索框 */}
        <div className="mb-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input type="text" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder={tx("搜索成员姓名、邮箱...")} className="form-input" style={{
            paddingLeft: "2.25rem"
          }} />
          </div>
        </div>
        {/* 成员列表 — 卡片排列 */}
        <div className="space-y-2">
          {orgMembers.filter(m => {
          if (!memberSearch) return true;
          const q = memberSearch.toLowerCase();
          const teamName = teams.find(t => t.id === m.teamId)?.name || '';
          return (m.displayName || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || teamName.toLowerCase().includes(q);
        }).map(member => {
          const isSelf = member.userId === user?.id;
          const memberIsOwner = member.role === 'owner';
          const canEditRole = canManageMembers && !isSelf && !memberIsOwner;
          const canEditJobTitle = canManageMembers && !memberIsOwner;
          const Icon = ROLE_ICONS[member.role];
          // 首字母头像
          const initial = (member.displayName || member.email || member.userId).charAt(0).toUpperCase();
          return <div key={member.id} className="rounded-lg border border-border px-4 py-3 hover:bg-sidebar transition-colors">
                {/* 第一行：头像 + 信息 + 角色标签 */}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent text-sm font-bold flex-shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {member.displayName || (member.email ? member.email.split('@')[0] : member.userId.slice(0, 8))}
                      </p>
                      {isSelf && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">{tx("你")}</span>}
                      {savingMemberId === member.userId && <span className="inline-flex items-center gap-1 text-xs text-accent">
                          <Loader2 className="h-3 w-3 animate-spin" />{tx("保存中")}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {member.email && <span className="text-xs text-muted truncate">{member.email}</span>}
                      <span className="text-[12px] text-secondary">
                        · {formatJoinDate(member.joinedAt)}
                      </span>
                    </div>
                  </div>
                  {/* 角色标签 */}
                  <div className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium flex-shrink-0 ${ROLE_COLORS[member.role]}`}>
                    <Icon className="h-3 w-3" />
                    {ROLE_LABELS[member.role]}
                  </div>
                </div>
                {/* 第二行：管理控件（仅管理员可见） */}
                {(canEditJobTitle || canEditRole) && <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[52px]">
                    {canEditJobTitle && <div className="flex items-center gap-1">
                        <span className="text-[12px] text-muted font-medium">{tx("职级")}</span>
                        <select value={member.jobLevel ?? 0} onChange={e => handleChangeJobLevel(member.userId, Number(e.target.value))} className="form-select text-xs w-32" title={tx("职级")}>
                          {[0, 1, 2].map(level => <option key={level} value={level}>{JOB_LEVEL_LABELS[level]}</option>)}
                        </select>
                      </div>}
                    {/* 团队分配 */}
                    {canManageMembers && teams.length > 0 && <div className="flex items-center gap-1">
                        <span className="text-[12px] text-muted font-medium">{tx("团队")}</span>
                        <select value={member.teamId || ''} onChange={e => handleAssignTeam(member.id, member.userId, e.target.value || null)} className="form-select text-xs w-28" title={tx("团队")}>
                          <option value="">{tx("未分配团队")}</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>}
                    {canEditRole && <>
                        <div className="flex items-center gap-1">
                          <span className="text-[12px] text-muted font-medium">{tx("权限")}</span>
                          <select value={member.role} onChange={e => handleChangeRole(member.id, member.userId, e.target.value as OrgRole)} className="form-select text-xs w-24">
                            {orgRole === 'owner' && <option value="admin">{tx("管理员")}</option>}
                            <option value="manager">{tx("经理")}</option>
                            <option value="member">{tx("成员")}</option>
                          </select>
                        </div>
                        <button onClick={() => handleRemoveMember(member.userId)} className="rounded p-1.5 text-secondary hover:bg-danger/10 hover:text-danger transition-colors" title={tx("移除成员")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>}
                  </div>}
              </div>;
        })}
          {orgMembers.length === 0 && <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-secondary mb-2" />
              <p className="text-sm text-foreground">{tx("暂无成员")}</p>
              <p className="text-xs text-muted mt-1">{tx("邀请团队成员加入组织")}</p>
            </div>}
        </div>
      </div>

      {/* 团队管理 */}
      {canManageMembers && <div className="rounded-xl border border-border bg-card card-elevated p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted" />{tx("团队管理")}{teams.length > 0 && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">{teams.length}</span>}
          </h2>

          {/* 创建团队 */}
          <div className="flex gap-2 mb-4">
            <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder={tx("团队名称（例：华东区、KA团队、渠道组）")} className="form-input flex-1" onKeyDown={e => e.key === 'Enter' && handleCreateTeam()} />
            <button onClick={handleCreateTeam} disabled={!newTeamName.trim() || creatingTeam} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {creatingTeam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}{tx("创建团队")}</button>
          </div>

          {/* 团队列表 */}
          {teams.length > 0 ? <div className="space-y-3">
              {teams.map(team => {
          const teamMembers = orgMembers.filter(m => m.teamId === team.id);
          return <div key={team.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-accent" />
                        <span className="text-sm font-semibold text-foreground">{team.name}</span>
                        <span className="rounded-full bg-background px-2 py-0.5 text-[12px] text-secondary">{team.memberCount}{tx("人")}</span>
                      </div>
                      <button onClick={() => handleDeleteTeam(team.id)} disabled={deletingTeamId === team.id} className="text-xs text-danger hover:text-danger/80 disabled:opacity-50">
                        {deletingTeamId === team.id ? '删除中...' : '删除'}
                      </button>
                    </div>

                    {/* 团队成员 */}
                    {teamMembers.length > 0 ? <div className="flex flex-wrap gap-2">
                        {teamMembers.map(m => <span key={m.userId} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">
                            {m.displayName || m.email?.split('@')[0] || m.userId.slice(0, 8)}
                          </span>)}
                      </div> : <p className="text-xs text-muted">{tx("暂无成员，在成员列表中分配")}</p>}
                  </div>;
        })}
            </div> : <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-secondary mb-2" />
              <p className="text-sm text-foreground">{tx("还没有团队")}</p>
              <p className="text-xs text-muted mt-1">{tx("创建团队后可以分配成员，按团队查看数据")}</p>
            </div>}
        </div>}

      {/* Invite — 原有的批量邀请区域 */}
      {canManageMembers && <div className="rounded-xl border border-border bg-card card-elevated p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserPlus className="h-4 w-4 text-muted" />{tx("批量邀请成员")}</h2>

          <form onSubmit={handleInvite} className="space-y-3">
            <textarea value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder={tx("输入邮箱地址（多个邮箱用逗号、空格或换行分隔） *")} className="form-input w-full resize-none" rows={2} required />
            {/* 邀请选项 */}
            <div className="flex flex-wrap gap-2">
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Exclude<OrgRole, 'owner'> | '')} className="form-select flex-1 min-w-[120px]" required>
                <option value="">{tx("选择角色 *")}</option>
                {isOwner && <option value="admin">{tx("管理员")}</option>}
                <option value="manager">{tx("经理")}</option>
                <option value="member">{tx("成员")}</option>
              </select>
              <select value={inviteJobLevel} onChange={e => setInviteJobLevel(e.target.value === '' ? '' : Number(e.target.value))} className="form-select flex-1 min-w-[120px]" required>
                <option value="">{tx("选择职级 *")}</option>
                {[0, 1, 2].map(level => <option key={level} value={level}>{JOB_LEVEL_LABELS[level]}</option>)}
              </select>
              <button type="submit" disabled={inviteLoading || !inviteRole || inviteJobLevel === ''} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50 whitespace-nowrap">
                {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}{tx("邀请")}</button>
            </div>
          </form>

          {inviteError && <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">
              {inviteError}
            </div>}

          {inviteLink && <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2">
              <p className="text-xs font-medium text-accent">{tx("邀请链接已生成（邮件已发送）：")}</p>
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg border border-border bg-background px-3 py-2">
                  <p className="text-xs font-mono text-foreground break-all">{inviteLink}</p>
                </div>
                <button onClick={handleCopyLink} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium ${copied ? 'bg-positive/10 text-positive border border-positive/20' : 'bg-accent text-white hover:bg-accent-hover'}`}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <p className="text-xs text-muted">{tx("链接有效期 7 天")}</p>
            </div>}

          {/* Pending invitations */}
          {pendingInvites.length > 0 && <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-secondary">{tx("待接受的邀请")}</p>
              <div className="space-y-1.5">
                {pendingInvites.map(inv => <div key={inv.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted flex-shrink-0" />
                    <span className="flex-1 text-foreground truncate">{inv.email}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[inv.role]}`}>
                      {ROLE_LABELS[inv.role]}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Clock className="h-3 w-3" />
                      {new Date(inv.expiresAt).toLocaleDateString('zh-CN')}
                    </span>
                    <button onClick={async () => {
              if (!(await appConfirm({
                message: '确定要撤回该邀请吗？',
                variant: 'danger'
              }))) return;
              try {
                const res = await fetch('/api/invite', {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    invitationId: inv.id,
                    orgId
                  })
                });
                if (res.ok) loadInvitations();
              } catch (e) {
                console.error('Failed to revoke invitation:', e);
              }
            }} className="rounded p-1.5 text-secondary hover:bg-danger/10 hover:text-danger" title={tx("撤回邀请")}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>)}
              </div>
            </div>}
        </div>}

      {/* Organization Settings */}
      {isOwner && <div className="rounded-xl border border-border bg-card card-elevated p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <SettingsIcon className="h-4 w-4 text-muted" />{tx("组织设置")}</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={managerCanViewDecodes} onChange={async e => {
            setManagerCanViewDecodes(e.target.checked);
            await fetch('/api/organization/settings', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                orgId,
                settings: {
                  managerCanViewMemberDecodes: e.target.checked
                }
              })
            });
          }} className="h-4 w-4 rounded border-border text-accent focus:ring-accent/30" />
              <div>
                <p className="text-sm font-medium text-foreground">{tx("允许经理查看成员的邮件解读")}</p>
                <p className="text-xs text-muted">{tx("启用后，经理角色可以查看其下属成员的邮件解读记录")}</p>
              </div>
            </label>
          </div>
        </div>}

      {/* 邀请新成员弹窗 */}
      {showInviteModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowInviteModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 mx-4" style={{
        boxShadow: 'var(--shadow-floating)'
      }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-accent" />{tx("邀请新成员")}</h2>
              <button onClick={() => setShowInviteModal(false)} className="rounded-lg p-1 text-secondary hover:text-foreground hover:bg-background">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleModalInvite} className="space-y-4">
              <div>
                <label className="form-label">{tx("邮箱地址")}</label>
                <input type="email" value={modalInviteEmail} onChange={e => setModalInviteEmail(e.target.value)} placeholder="example-7fbfb94aea@example.invalid" className="form-input w-full" required autoFocus />
              </div>
              <div>
                <label className="form-label">{tx("分配角色")}</label>
                <select value={modalInviteRole} onChange={e => setModalInviteRole(e.target.value as Exclude<OrgRole, 'owner'> | '')} className="form-select w-full" required>
                  <option value="">{tx("选择角色 *")}</option>
                  {isOwner && <option value="admin">{tx("管理员 — 可管理成员和设置")}</option>}
                  <option value="manager">{tx("经理 — 查看团队数据")}</option>
                  <option value="member">{tx("成员 — 查看个人数据")}</option>
                </select>
                <p className="text-[12px] text-muted mt-1">
                  {modalInviteRole === 'admin' && '管理员可以邀请/移除成员、管理团队和组织设置'}
                  {modalInviteRole === 'manager' && '经理可以查看团队数据（实际可见范围取决于职级）'}
                  {modalInviteRole === 'member' && '成员只能查看自己负责的客户和商机'}
                </p>
                {modalInviteRole === 'admin' && <p className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-[12px] text-secondary">
                    管理员账号创建或接受邀请后，需要进入 Settings &gt; Security 启用 MFA；企业上线 gate 会检查该状态。
                  </p>}
              </div>

              <div>
                <label className="form-label">{tx("成员职级")}</label>
                <select value={modalInviteJobLevel} onChange={e => setModalInviteJobLevel(e.target.value === '' ? '' : Number(e.target.value))} className="form-select w-full" required>
                  <option value="">{tx("选择职级 *")}</option>
                  {[0, 1, 2].map(level => <option key={level} value={level}>{JOB_LEVEL_LABELS[level]}</option>)}
                </select>
              </div>

              {modalInviteError && <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger flex items-center gap-2">
                  <Info className="h-4 w-4 flex-shrink-0" />
                  {modalInviteError}
                </div>}

              {modalInviteSuccess && <div className="rounded-lg border border-positive/30 bg-positive/5 px-4 py-2 text-sm text-positive flex items-center gap-2">
                  <Check className="h-4 w-4 flex-shrink-0" />
                  {modalInviteSuccess}
                </div>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-secondary hover:text-foreground hover:bg-background">{tx("取消")}</button>
                <button type="submit" disabled={modalInviteLoading || !modalInviteEmail.trim() || !modalInviteRole || modalInviteJobLevel === ''} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
                  {modalInviteLoading ? <>
                      <Loader2 className="h-4 w-4 animate-spin" />{tx("发送中...")}</> : <>
                      <Mail className="h-4 w-4" />{tx("发送邀请")}</>}
                </button>
              </div>
            </form>
          </div>
        </div>}

      {/* 角色与权限说明侧边栏 */}
      {showRoleGuide && <div className="fixed inset-0 z-50 flex justify-end backdrop-blur-sm bg-black/30" onClick={() => setShowRoleGuide(false)}>
          <div className="w-full max-w-md bg-card border-l border-border h-full overflow-y-auto p-6" style={{
        boxShadow: 'var(--shadow-floating)'
      }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-foreground">{tx("📋 角色与权限说明")}</h2>
              <button onClick={() => setShowRoleGuide(false)} className="rounded-lg p-1 text-secondary hover:text-foreground hover:bg-background">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* 系统权限 */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">{tx("🔐 系统权限")}</h3>
                <p className="text-xs text-muted mb-3">{tx("控制成员能执行的管理操作")}</p>
                <div className="space-y-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">{tx("👑 拥有者 (Owner)")}</p>
                    <p className="text-xs text-muted mt-1">{tx("组织拥有者。可执行所有操作，包括删除组织、转让所有权、管理所有设置。")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">{tx("⚙️ 管理员 (Admin)")}</p>
                    <p className="text-xs text-muted mt-1">{tx("管理员。可邀请/移除成员、管理团队、设定配额、查看审计日志。不能删除组织。")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">{tx("📊 经理 (Manager)")}</p>
                    <p className="text-xs text-muted mt-1">{tx("团队经理。可查看团队成员数据，使用团队视图。不能管理组织设置。")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">{tx("👤 成员 (Member)")}</p>
                    <p className="text-xs text-muted mt-1">{tx("普通成员。使用 Closr 日常功能，不能管理其他成员或修改组织设置。")}</p>
                  </div>
                </div>
              </div>

              {/* 业务职级 */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">{tx("📊 业务职级")}</h3>
                <p className="text-xs text-muted mb-3">{tx("决定能看到的数据范围和 AI 分析视角")}</p>
                <div className="space-y-2">
                  <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">L4 CxO</p>
                      <span className="text-[12px] text-accent">{tx("全公司")}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{tx("最高决策视角。看全公司数据，AI 提供战略级洞察。")}</p>
                  </div>
                  <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">L3 VP</p>
                      <span className="text-[12px] text-accent">{tx("全公司")}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{tx("看全公司数据 + 跨区域战略洞察。适合 VP Sales、SVP。")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{tx("L2 总监")}</p>
                      <span className="text-[12px] text-accent">{tx("全公司")}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{tx("看全公司数据，高管仪表盘视角。适合 Sales Director、区域总监。")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{tx("L1 销售经理")}</p>
                      <span className="text-[12px] text-secondary">{tx("本团队")}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{tx("看本团队所有成员的数据。AI 提供团队辅导建议。")}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{tx("L0 销售代表")}</p>
                      <span className="text-[12px] text-secondary">{tx("仅自己")}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{tx("只看自己负责的客户和商机。AI 提供个人行动建议。")}</p>
                  </div>
                </div>
              </div>

              {/* 数据可见性矩阵 */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3">{tx("👁 数据可见性")}</h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-sidebar">
                      <tr>
                        <th className="text-left py-2 px-3 text-secondary">{tx("职级")}</th>
                        <th className="text-center py-2 px-3 text-secondary">{tx("客户")}</th>
                        <th className="text-center py-2 px-3 text-secondary">{tx("商机")}</th>
                        <th className="text-center py-2 px-3 text-secondary">{tx("情报")}</th>
                        <th className="text-center py-2 px-3 text-secondary">{tx("AI 视角")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border">
                        <td className="py-2 px-3 font-medium">L3-L4</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3 text-accent">{tx("战略")}</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="py-2 px-3 font-medium">L2</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3 text-accent">{tx("战略")}</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="py-2 px-3 font-medium">L1</td>
                        <td className="text-center py-2 px-3">{tx("团队")}</td>
                        <td className="text-center py-2 px-3">{tx("团队")}</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3 text-warning">{tx("辅导")}</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="py-2 px-3 font-medium">L0</td>
                        <td className="text-center py-2 px-3">{tx("自己")}</td>
                        <td className="text-center py-2 px-3">{tx("自己")}</td>
                        <td className="text-center py-2 px-3">{tx("全部")}</td>
                        <td className="text-center py-2 px-3 text-positive">{tx("行动")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>}

      {/* Dashboard 视图配置 — 仅 admin+ 可见 */}
      {canManageMembers && <DashboardConfigSection />}
    </div>;
}
