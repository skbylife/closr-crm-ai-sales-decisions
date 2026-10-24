"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Users } from 'lucide-react';
import type { Account, BusinessTeamSummary, PursuitTeam } from '@/lib/babel-engine/types';
import { useLocale } from '@/lib/i18n';

export type AccountTeamSummaryPayload = {
  businessTeamId: string | null;
  teams: BusinessTeamSummary[];
  pursuitTeam: PursuitTeam | null;
};

type AccountTeamSummaryStripProps = {
  account: Account;
  ownerName: string;
  onEditBasics: () => void;
  onOpenTeamTab: () => void;
  readOnly?: boolean;
};

function getBusinessTeamLabel(teamId: string | null | undefined, teams: BusinessTeamSummary[]): string {
  if (!teamId) return '未分配团队';
  return teams.find((team) => team.id === teamId)?.name ?? '已设置团队';
}

function label(locale: 'zh' | 'en', zh: string, en: string): string {
  return locale === 'en' ? en : zh;
}

function getPursuitTeamLabel(team: PursuitTeam | null, locale: 'zh' | 'en' = 'zh'): string {
  if (!team) return label(locale, '未创建推进组', 'No pursuit team');
  const memberCount = team.members?.length ?? 0;
  return memberCount > 0 ? `${team.name} · ${memberCount} ${label(locale, '人', 'members')}` : team.name;
}

export function getAccountTeamSummaryState(payload: AccountTeamSummaryPayload, locale: 'zh' | 'en' = 'zh') {
  const businessTeamLabel = getBusinessTeamLabel(payload.businessTeamId, payload.teams);
  const pursuitTeamLabel = getPursuitTeamLabel(payload.pursuitTeam, locale);

  return {
    businessTeamLabel,
    pursuitTeamLabel,
    hasBusinessTeam: Boolean(payload.businessTeamId),
    hasPursuitTeam: Boolean(payload.pursuitTeam),
  };
}

export function AccountTeamSummaryStrip({
  account,
  ownerName,
  onEditBasics,
  onOpenTeamTab,
  readOnly = false,
}: AccountTeamSummaryStripProps) {
  const { locale } = useLocale();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<AccountTeamSummaryPayload>({
    businessTeamId: account.businessTeamId ?? null,
    teams: [],
    pursuitTeam: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [businessRes, pursuitRes] = await Promise.all([
        fetch(`/api/accounts/${encodeURIComponent(account.id)}/business-team`, { cache: 'no-store' }),
        fetch(`/api/accounts/${encodeURIComponent(account.id)}/pursuit-team`, { cache: 'no-store' }),
      ]);
      if (!businessRes.ok || !pursuitRes.ok) throw new Error('load failed');
      const businessPayload = (await businessRes.json()) as { businessTeamId: string | null; teams: BusinessTeamSummary[] };
      const pursuitPayload = (await pursuitRes.json()) as { pursuitTeam: PursuitTeam | null };
      setPayload({
        businessTeamId: businessPayload.businessTeamId ?? null,
        teams: businessPayload.teams ?? [],
        pursuitTeam: pursuitPayload.pursuitTeam ?? null,
      });
    } catch {
      setPayload((current) => ({ ...current, businessTeamId: account.businessTeamId ?? current.businessTeamId }));
    } finally {
      setLoading(false);
    }
  }, [account.businessTeamId, account.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const state = useMemo(() => getAccountTeamSummaryState(payload, locale), [locale, payload]);
  const businessTeamLabel = state.hasBusinessTeam ? state.businessTeamLabel : label(locale, '未分配团队', 'No team assigned');
  const pursuitTeamLabel = state.hasPursuitTeam ? state.pursuitTeamLabel : label(locale, '未创建推进组', 'No pursuit team');
  const businessTeamRisk = !state.hasBusinessTeam;
  const pursuitTeamRisk = !state.hasPursuitTeam;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-white shadow-sm sm:p-4" aria-label={label(locale, '客户团队摘要', 'Account team summary')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-100">
          <Users className="h-3.5 w-3.5 text-white" />
          {label(locale, '判断责任摘要', 'Ownership summary')}
          {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-300" />}
        </div>
        {(businessTeamRisk || pursuitTeamRisk) && (
          <p className="flex items-center gap-1 text-xs font-medium text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            {label(locale, '团队责任未完全配置', 'Team ownership is incomplete')}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={readOnly ? undefined : onEditBasics}
          className={`inline-flex max-w-full items-center rounded-full border border-white/15 bg-slate-900 px-2.5 py-1 text-white ${readOnly ? 'cursor-default' : 'hover:border-white/35 hover:bg-slate-800'}`}
        >
          <span className="shrink-0 text-slate-300">{label(locale, '负责人：', 'Owner: ')}</span>
          <span className="truncate font-medium">{ownerName}</span>
        </button>
        <button
          type="button"
          onClick={readOnly ? undefined : onEditBasics}
          className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 ${readOnly ? 'cursor-default' : 'hover:border-white/35 hover:bg-slate-800'} ${businessTeamRisk ? 'border-amber-400/50 bg-amber-400/15 text-amber-100' : 'border-white/15 bg-slate-900 text-white'}`}
          title={businessTeamRisk ? label(locale, '未分配团队，后续协作和汇报可能断层。', 'No team assigned; collaboration and reporting may break down.') : undefined}
        >
          <span className="shrink-0 text-slate-300">{label(locale, '团队：', 'Team: ')}</span>
          <span className="truncate font-medium">{businessTeamLabel}</span>
        </button>
        <button
          type="button"
          onClick={readOnly ? undefined : onOpenTeamTab}
          className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 ${readOnly ? 'cursor-default' : 'hover:border-white/35 hover:bg-slate-800'} ${pursuitTeamRisk ? 'border-amber-400/50 bg-amber-400/15 text-amber-100' : 'border-white/15 bg-slate-900 text-white'}`}
          title={pursuitTeamRisk ? label(locale, '未创建项目推进组，Champion / 采购 / 法务等推进责任还没有明确。', 'No pursuit team has been created, so champion, procurement, and legal ownership are not clear.') : undefined}
        >
          <span className="shrink-0 text-slate-300">{label(locale, '推进组：', 'Pursuit team: ')}</span>
          <span className="truncate font-medium">{pursuitTeamLabel}</span>
        </button>
      </div>
    </section>
  );
}
