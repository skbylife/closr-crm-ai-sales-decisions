"use client";

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, FileSearch, Loader2, RefreshCw, ShieldCheck, Users2, X } from 'lucide-react';
import type { NextBestMove, RelationshipContact, RelationshipEdge, RelationshipEvidenceRef, RelationshipIntelligencePayload, RelationshipTeamMember } from '@/lib/relationship-intelligence/types';
import { externalAdvisorRoleLabel, isExternalAdvisorRole } from '@/lib/relationship-intelligence/external-advisor';

const RELATIONSHIP_LOAD_TIMEOUT_MS = 20_000;

const STATUS_LABEL: Record<RelationshipEdge['relationshipStatus'] | 'no_relationship', string> = {
  unknown: '未知 / 待确认',
  none: '无关系',
  no_relationship: '未发现关系',
  introduced: '初识',
  engaged: '有互动',
  familiar: '熟悉',
  trusted: '可信关系',
  can_introduce: '可引荐',
  risk: '风险关系',
};

const STATUS_CLASS: Record<RelationshipEdge['relationshipStatus'] | 'no_relationship', string> = {
  unknown: 'border-slate-600 bg-slate-800 text-white',
  none: 'border-zinc-600 bg-zinc-800 text-white',
  no_relationship: 'border-zinc-600 bg-zinc-800 text-white',
  introduced: 'border-blue-600 bg-blue-700 text-white',
  engaged: 'border-cyan-600 bg-cyan-700 text-white',
  familiar: 'border-indigo-600 bg-indigo-700 text-white',
  trusted: 'border-emerald-600 bg-emerald-700 text-white',
  can_introduce: 'border-teal-600 bg-teal-700 text-white',
  risk: 'border-rose-600 bg-rose-700 text-white',
};

const ROLE_LABEL: Record<string, string> = {
  economic_buyer: '预算负责人',
  decision_maker: '决策负责人',
  executive_sponsor: '高层支持者',
  champion: '内部推动者',
  coach: '内线教练',
  technical_evaluator: '技术评估者',
  procurement: '采购负责人',
  legal: '法务把关人',
  finance: '财务把关人',
  blocker: '潜在阻力来源',
  influencer: '影响者',
  external_advisor: '外部顾问',
  consultant: '咨询顾问',
  channel_influencer: '渠道影响者',
  unknown: '角色待确认',
};

const PRIORITY_CLASS: Record<NextBestMove['priority'], string> = {
  high: 'border-rose-600 bg-rose-700 text-white',
  medium: 'border-amber-600 bg-amber-700 text-white',
  low: 'border-slate-600 bg-slate-700 text-white',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '无最近证据';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  return date.toLocaleDateString('zh-CN');
}

function teamName(member: RelationshipTeamMember | undefined | null): string {
  return member?.displayName || member?.userId?.slice(0, 8) || '待分配';
}

function contactName(contact: RelationshipContact | undefined | null): string {
  return contact?.name || '待识别联系人';
}

function evidenceLabel(ref: RelationshipEvidenceRef): string {
  return ref.title || ref.summary || `${ref.sourceTable ?? ref.sourceKind}:${ref.sourceRowId ?? ref.sourceId}`;
}

export function bestEdgeForContact(edges: RelationshipEdge[], contactId: string): RelationshipEdge | null {
  return edges
    .filter((edge) => edge.toContactId === contactId)
    .sort((a, b) => {
      const statusWeight = (edge: RelationshipEdge) => edge.relationshipStatus === 'none' ? 1 : edge.relationshipStatus === 'unknown' ? 0 : 2;
      return statusWeight(b) - statusWeight(a) || b.strength - a.strength;
    })[0] ?? null;
}

function buildBrief(payload: RelationshipIntelligencePayload): string {
  const known = payload.evidenceSummary.contactsWithKnownRelationship;
  const total = payload.contacts.length;
  const highPriorityMove = payload.nextBestMoves.find((move) => move.priority === 'high');
  if (known === 0) return '当前缺少可验证关系证据，建议先确认关键联系人覆盖与最近互动。';
  if (payload.coverage.gaps.length === 0 && payload.coverage.staleRelationships.length === 0) {
    return `当前已有 ${known}/${total} 位客户联系人存在可验证关系证据，覆盖结构较健康。`;
  }
  return `当前已有 ${known}/${total} 位客户联系人存在可验证关系证据，但仍有 ${payload.coverage.gaps.length} 个覆盖缺口、${payload.coverage.staleRelationships.length} 条过期关系。${highPriorityMove ? highPriorityMove.goal : '建议优先补齐关键角色关系证据。'}`;
}

function EvidenceDrawer({
  edge,
  move,
  contactsById,
  teamById,
  onClose,
}: {
  edge?: RelationshipEdge | null;
  move?: NextBestMove | null;
  contactsById: Map<string, RelationshipContact>;
  teamById: Map<string, RelationshipTeamMember>;
  onClose: () => void;
}) {
  const refs = edge?.evidenceRefs ?? move?.evidenceRefs ?? [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">判断依据</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              {edge ? `${teamName(teamById.get(edge.fromUserId ?? ''))} → ${contactName(contactsById.get(edge.toContactId))}` : '建议下一步依据'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-border p-2 text-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {edge ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="关系状态" value={STATUS_LABEL[edge.relationshipStatus]} />
            <Metric label="可信度" value={`${Math.round(edge.confidence * 100)}%`} />
            <Metric label="证据数量" value={String(edge.signalCount)} />
            <Metric label="最近证据" value={formatDate(edge.lastSignalAt)} />
          </div>
        ) : null}

        {move ? (
          <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm">
            <p className="font-medium text-foreground">建议动作</p>
            <p className="mt-2 text-secondary">建议由 {teamName(teamById.get(move.ownerUserId ?? ''))} 联系 {contactName(contactsById.get(move.targetContactId ?? ''))}</p>
            <p className="mt-2 text-secondary">原因：{move.reason}</p>
            <p className="mt-2 text-secondary">目标：{move.goal}</p>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-foreground">原始证据</p>
          {refs.length > 0 ? refs.map((ref) => (
            <div key={`${ref.sourceTable}:${ref.sourceRowId}:${ref.sourceId}`} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{ref.sourceTable ?? ref.sourceKind}</span>
                <span>·</span>
                <span>{formatDate(ref.occurredAt)}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-foreground">{evidenceLabel(ref)}</p>
              {ref.summary ? <p className="mt-1 text-sm text-secondary">{ref.summary}</p> : null}
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-border bg-background p-4 text-sm text-secondary">
              没有可审计证据，因此不会显示为可信关系。
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ExternalAdvisorSignalCapture({
  accountId,
  contacts,
  onSubmitted,
}: {
  accountId: string;
  contacts: RelationshipContact[];
  onSubmitted: () => void;
}) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? '');
  const [summary, setSummary] = useState('');
  const [influenceDomain, setInfluenceDomain] = useState('strategy');
  const [biasDirection, setBiasDirection] = useState('unknown');
  const [accessMode, setAccessMode] = useState('via_internal_owner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (contacts.length === 0) return null;

  async function submit() {
    if (!contactId || summary.trim().length < 8) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/relationship-intelligence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          summary: summary.trim(),
          influenceDomain,
          biasDirection,
          accessMode,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? '外部顾问信号保存失败');
      setSummary('');
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : '外部顾问信号保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-200">代录外部顾问信号</p>
      <p className="mt-1 text-xs text-secondary">信号进入关系与判断层；不会给外部顾问账号，也不会改变客户权限。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <select value={contactId} onChange={(event) => setContactId(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
          {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {externalAdvisorRoleLabel(contact.role)}</option>)}
        </select>
        <select value={influenceDomain} onChange={(event) => setInfluenceDomain(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
          <option value="strategy">策略</option>
          <option value="technical">技术</option>
          <option value="procurement">采购</option>
          <option value="legal">法务</option>
          <option value="finance">财务</option>
          <option value="relationship">关系</option>
          <option value="other">其他</option>
        </select>
        <select value={biasDirection} onChange={(event) => setBiasDirection(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
          <option value="unknown">倾向未知</option>
          <option value="supports_us">偏支持我们</option>
          <option value="against_us">偏反对我们</option>
          <option value="neutral">中立</option>
          <option value="mixed">混合</option>
        </select>
        <select value={accessMode} onChange={(event) => setAccessMode(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
          <option value="via_internal_owner">由内部 owner 代录</option>
          <option value="direct">直接接触</option>
          <option value="via_customer">客户转述</option>
          <option value="unknown">来源待确认</option>
        </select>
      </div>
      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} placeholder="记录顾问说了什么、影响哪个判断、需要谁验证…" className="mt-2 w-full resize-none rounded-lg border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted/60 focus:border-accent/40 focus:outline-none" />
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <button type="button" onClick={() => void submit()} disabled={saving || summary.trim().length < 8} className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
        {saving ? '保存中…' : '保存信号'}
      </button>
    </div>
  );
}

export function RelationshipIntelligenceTab({ accountId }: { accountId: string }) {
  const [resource, setResource] = useState<{
    accountId: string;
    payload: RelationshipIntelligencePayload | null;
    error: string | null;
    pending: boolean;
  }>({ accountId, payload: null, error: null, pending: true });
  const [selectedEdge, setSelectedEdge] = useState<RelationshipEdge | null>(null);
  const [selectedMove, setSelectedMove] = useState<NextBestMove | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, RELATIONSHIP_LOAD_TIMEOUT_MS);
    fetch(`/api/accounts/${accountId}/relationship-intelligence`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<RelationshipIntelligencePayload>;
      })
      .then((data) => setResource({ accountId, payload: data, error: null, pending: false }))
      .catch((err: unknown) => {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        if (isAbort && !didTimeout) return;
        setResource({
          accountId,
          payload: null,
          error: isAbort ? '加载超时，请刷新或稍后重试' : err instanceof Error ? err.message : '关系智能加载失败',
          pending: false,
        });
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [accountId, reloadKey]);

  const payload = resource.accountId === accountId ? resource.payload : null;
  const error = resource.accountId === accountId ? resource.error : null;
  const loading = resource.accountId !== accountId || resource.pending;
  const contactsById = useMemo(() => new Map(payload?.contacts.map((contact) => [contact.id, contact]) ?? []), [payload]);
  const teamById = useMemo(() => new Map(payload?.ourTeam.map((member) => [member.userId, member]) ?? []), [payload]);
  const externalInfluencers = useMemo(() => payload?.contacts.filter((contact) => isExternalAdvisorRole(contact.role)) ?? [], [payload]);
  const customerContacts = useMemo(() => payload?.contacts.filter((contact) => !isExternalAdvisorRole(contact.role)) ?? [], [payload]);
  const assignmentsByPair = useMemo(() => {
    const set = new Set<string>();
    for (const assignment of payload?.coverage.assignments ?? []) {
      if (assignment.primaryUserId) set.add(`${assignment.contactId}:${assignment.primaryUserId}`);
      if (assignment.backupUserId) set.add(`${assignment.contactId}:${assignment.backupUserId}`);
    }
    return set;
  }, [payload]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-secondary shadow-sm">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> 正在加载关系智能…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
        <AlertCircle className="mr-2 inline h-4 w-4" /> 关系智能暂不可用：{error}
      </div>
    );
  }

  if (!payload) return null;

  const openEvidence = (edge: RelationshipEdge) => {
    setSelectedMove(null);
    setSelectedEdge(edge);
  };
  const openMove = (move: NextBestMove) => {
    setSelectedEdge(null);
    setSelectedMove(move);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">关系简报</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{buildBrief(payload)}</h2>
            <p className="mt-2 text-sm text-secondary">所有可信判断都必须有证据；未知与无关系分开展示，避免把缺证据误读成强关系。</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Metric label="客户联系人" value={String(customerContacts.length)} />
            <Metric label="外部影响者" value={String(externalInfluencers.length)} />
            <Metric label="关系边" value={String(payload.evidenceSummary.edgeCount)} />
            <Metric label="信号" value={String(payload.evidenceSummary.signalCount)} />
            <Metric label="过期" value={String(payload.evidenceSummary.staleEdgeCount)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">关系覆盖</p>
              <p className="mt-1 text-sm text-muted">按客户角色查看覆盖健康度与证据状态。</p>
            </div>
            <Users2 className="h-5 w-5 text-foreground" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {customerContacts.map((contact) => {
              const best = bestEdgeForContact(payload.edges, contact.id);
              const role = contact.role ? ROLE_LABEL[contact.role] ?? contact.role : '角色待确认';
              const gaps = payload.coverage.gaps.filter((gap) => gap.contactId === contact.id);
              return (
                <div key={contact.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{contact.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{role} · {contact.title ?? '职位待确认'}</p>
                    </div>
                    {best ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-amber-500" />}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs ${best ? STATUS_CLASS[best.relationshipStatus] : STATUS_CLASS.unknown}`}>{best ? STATUS_LABEL[best.relationshipStatus] : '未知 / 待确认'}</span>
                    {gaps.map((gap) => <span key={gap.kind} className="rounded-full border border-amber-700 bg-amber-900 px-2 py-1 text-xs text-amber-50">{gap.summary}</span>)}
                  </div>
                  {best ? (
                    <button type="button" onClick={() => openEvidence(best)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                      查看依据 <ChevronRight className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">建议下一步</p>
              <p className="mt-1 text-sm text-muted">谁联系谁、为什么、目标是什么。</p>
            </div>
            <RefreshCw className="h-5 w-5 text-foreground" />
          </div>
          <div className="space-y-3">
            {payload.nextBestMoves.length > 0 ? payload.nextBestMoves.map((move) => (
              <button key={move.id} type="button" onClick={() => openMove(move)} className="w-full rounded-xl border border-border bg-background p-4 text-left transition hover:border-accent/50 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full border px-2 py-1 text-xs ${PRIORITY_CLASS[move.priority]}`}>{move.priority === 'high' ? '高优先级' : move.priority === 'medium' ? '中优先级' : '低优先级'}</span>
                  <FileSearch className="h-4 w-4 text-foreground" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">建议由 {teamName(teamById.get(move.ownerUserId ?? ''))} 联系 {contactName(contactsById.get(move.targetContactId ?? ''))}</p>
                <p className="mt-2 text-xs text-secondary">原因：{move.reason}</p>
                <p className="mt-1 text-xs text-secondary">目标：{move.goal}</p>
              </button>
            )) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-secondary">暂无需要优先处理的关系动作。</div>
            )}
          </div>
        </aside>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">外部影响者</p>
            <p className="mt-1 text-sm text-muted">外部顾问 / 咨询顾问 / 渠道影响者只进入关系与判断层，不进入内部团队权限。</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-violet-500" />
        </div>
        {externalInfluencers.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-3 md:grid-cols-2">
              {externalInfluencers.map((contact) => {
                const best = bestEdgeForContact(payload.edges, contact.id);
                return (
                  <div key={contact.id} className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{contact.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{externalAdvisorRoleLabel(contact.role)} · {contact.title ?? '身份待确认'}</p>
                      </div>
                      <span className="rounded-full border border-violet-600 bg-violet-700 px-2 py-1 text-xs text-white">不进权限</span>
                    </div>
                    <p className="mt-3 text-xs text-secondary">由内部 owner 代录其信号；用于解释风险、倾向和下一步动作。</p>
                    {best ? (
                      <button type="button" onClick={() => openEvidence(best)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                        查看影响依据 <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <ExternalAdvisorSignalCapture accountId={accountId} contacts={externalInfluencers} onSubmitted={() => setReloadKey((value) => value + 1)} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-secondary">暂无外部顾问。可在联系人角色中选择「外部顾问 / 咨询顾问 / 渠道影响者」。</div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">关系矩阵</p>
            <p className="mt-1 text-sm text-muted">客户联系人 × 我方团队成员；同一联系人可被多名成员独立覆盖。</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-foreground" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 text-left text-xs font-semibold text-foreground">客户联系人</th>
                {payload.ourTeam.map((member) => (
                  <th key={member.userId} className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-foreground">{teamName(member)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customerContacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="sticky left-0 z-10 border-b border-border bg-card px-3 py-3 align-top">
                    <p className="font-medium text-foreground">{contact.name}</p>
                    <p className="text-xs text-secondary">{contact.role ? ROLE_LABEL[contact.role] ?? contact.role : '角色待确认'}</p>
                  </td>
                  {payload.ourTeam.map((member) => {
                    const edge = payload.edges.find((item) => item.toContactId === contact.id && item.fromUserId === member.userId) ?? null;
                    const hasCoverageIntent = assignmentsByPair.has(`${contact.id}:${member.userId}`);
                    const status = edge?.relationshipStatus ?? (hasCoverageIntent ? 'unknown' : 'no_relationship');
                    const hasEvidence = (edge?.evidenceRefs.length ?? 0) > 0 || (edge?.signalCount ?? 0) > 0;
                    return (
                      <td key={member.userId} className="min-w-[180px] border-b border-border px-3 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => edge ? openEvidence(edge) : undefined}
                          className={`w-full rounded-xl border p-3 text-left ${STATUS_CLASS[status]} ${edge ? 'hover:shadow-sm' : 'cursor-default'}`}
                        >
                          <p className="text-xs font-semibold">{STATUS_LABEL[status]}</p>
                          <p className="mt-1 text-[11px] text-white/95">强度 {edge?.strength ?? 0} · 证据 {edge?.signalCount ?? 0}</p>
                          <p className="mt-1 text-[11px] text-white/95">最近：{formatDate(edge?.lastSignalAt)}</p>
                          {!hasEvidence && status !== 'no_relationship' ? <p className="mt-2 text-[11px] font-medium text-white">无证据，不显示为可信关系</p> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-secondary">最近关系信号</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {payload.recentSignals.slice(0, 8).map((signal) => (
            <div key={signal.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{signal.kind}</span><span>·</span><span>{formatDate(signal.occurredAt)}</span><span>·</span><span>可信度 {Math.round(signal.confidence * 100)}%</span>
              </div>
              <p className="mt-2 text-sm text-foreground">{signal.summary}</p>
              {signal.evidence ? <p className="mt-1 text-xs text-secondary">依据：{evidenceLabel(signal.evidence)}</p> : null}
            </div>
          ))}
          {payload.recentSignals.length === 0 ? <div className="rounded-xl border border-dashed border-border p-4 text-sm text-secondary">暂无关系信号。</div> : null}
        </div>
      </section>

      {(selectedEdge || selectedMove) ? (
        <EvidenceDrawer
          edge={selectedEdge}
          move={selectedMove}
          contactsById={contactsById}
          teamById={teamById}
          onClose={() => { setSelectedEdge(null); setSelectedMove(null); }}
        />
      ) : null}
    </div>
  );
}
