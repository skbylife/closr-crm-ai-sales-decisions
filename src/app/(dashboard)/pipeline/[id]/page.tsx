'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { ChevronRight, Edit3, Radio, Trash2 } from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';

import { computeMeddiccScore } from '@/lib/meddicc';
import { NewsSearchPanel } from "@/components/accounts/NewsSearchPanel";
import { TaskListSection } from '@/components/tasks/TaskListSection';

// Extracted components
import { DealCockpit } from './components/cockpit-view';
import { MeddiccTab } from './components/meddicc-panel';
import { MapTab } from './components/map-panel';
import { ActivityTab } from './components/activity-tab';
import { IntelNotesSection } from './components/intel-notes-section';
import { RfpTab } from './components/rfp-tab';
import { WinProbabilityPanel } from './components/win-probability-panel';
import { CompetitivePositioningCard } from '@/components/pipeline/competitive-positioning-card';
import { CompetitorMatrix } from '@/components/pipeline/competitor-matrix';
import { AIForecastPanel } from '@/components/pipeline/ai-forecast-panel';
import { WinLossCard } from '@/components/pipeline/win-loss-card';
import { StrategicPlayTab } from '@/app/(dashboard)/accounts/[id]/components/strategic-play-tab';
import { BriefingPack } from '@/components/meeting/briefing-pack';
import { MeetingReview } from '@/components/meeting/meeting-review';
import { StrategyRecommender } from '@/components/pipeline/strategy-recommender';
import { CommentThread } from '@/components/collaboration/comment-thread';

import { PageBackButton } from '@/components/navigation/page-back-button';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { useEffectiveJobLevel } from '@/hooks/use-effective-job-level';
import { DECODE_SOURCE_LABELS } from '@/components/decode/decode-helpers';
import { RoleFocusBanner } from '@/components/shared/role-focus-banner';
import { useLocale, type TranslationKey } from '@/lib/i18n';
import { ContactOpportunityRolePanel, UnifiedTimelinePanel } from './components/crm-foundation-panels';

// ─── Main Page ───────────────────────────────────────────────────────

const TABS = [
  { key: 'cockpit', labelKey: 'pipeline.tab.cockpit' },
  { key: 'meddicc', labelKey: 'pipeline.tab.meddicc' },
  { key: 'plays', labelKey: 'pipeline.tab.plays' },
  { key: 'meeting', labelKey: 'pipeline.tab.meeting' },
  { key: 'execution', labelKey: 'pipeline.tab.execution' },
  { key: 'activity', labelKey: 'pipeline.tab.activity' },
  { key: 'rfp', labelKey: 'pipeline.tab.rfp' },
  { key: 'collab', labelKey: 'pipeline.tab.collab' },
];

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { locale, t } = useLocale();
  const format = (key: TranslationKey, value: string) => t(key).replace('{0}', value);
  const id = params.id as string;
  const { orgMembers, user } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const {
    opportunities,
    accounts,
    emailDecodes,
    intelItems,
    composedEmails,
    tasks,
  } = useRoleFilteredData();
  const opp = opportunities.find((o) => o.id === id);
  const updateOpportunity = useStore((s) => s.updateOpportunity);
  const deleteOpportunity = useStore((s) => s.deleteOpportunity);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'cockpit';
  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [editing, setEditing] = useState(false);
  const searchTab = searchParams.get('tab');
  const activeTab = TABS.some((tab) => tab.key === searchTab)
    ? searchTab
    : TABS.some((tab) => tab.key === selectedTab)
      ? selectedTab
      : 'cockpit';
  const handleTabChange = (tabKey: string) => {
    setSelectedTab(tabKey);
    router.replace(`/pipeline/${id}?tab=${tabKey}`, { scroll: false });
  };

  // Auto-update MEDDICC score
  const account = accounts.find((a) => a.id === opp?.accountId);
  const contacts = useMemo(() => account?.contacts || [], [account?.contacts]);
  useEffect(() => {
    if (!opp) return;
    const computed = computeMeddiccScore(opp.meddicc, contacts);
    if (computed !== opp.meddicc?.overallScore) {
      updateOpportunity(opp.id, { meddicc: { ...opp.meddicc, overallScore: computed } });
    }
  }, [opp, contacts, updateOpportunity]);

  if (!opp) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-muted">{t('pipeline.notFound')}</p>
        <button onClick={() => router.push('/pipeline')} className="mt-3 text-sm text-accent hover:underline">{t('pipeline.backToPipeline')}</button>
      </div>
    );
  }

  const currentOpp = opp;
  const accountName = account?.name || t('pipeline.unknownAccount');
  const ownerUserId = opp.assignedTo ?? opp.userId;
  const ownerMember = ownerUserId ? orgMembers.find((member) => member.userId === ownerUserId) : undefined;
  const ownerName = ownerUserId === user?.id
    ? t('pipeline.me')
    : ownerMember?.displayName || ownerMember?.email || opp.owner || t('pipeline.unassigned');
  const recentOpportunitySignals = emailDecodes
    .filter((decode) => decode.opportunityId === opp.id || (!decode.opportunityId && decode.accountId === opp.accountId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageBackButton fallbackHref="/pipeline" label={t('pipeline.back')} />

      {/* Breadcrumb + Stage Badge + Edit */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm min-w-0 overflow-x-auto">
          <button onClick={() => router.push('/pipeline')} className="text-secondary hover:text-accent transition-colors">{t('pipeline.breadcrumb')}</button>
          <ChevronRight className="h-3.5 w-3.5 text-muted" />
          <button onClick={() => router.push(`/accounts/${opp.accountId}`)} className="text-secondary hover:text-accent transition-colors">{accountName}</button>
          <ChevronRight className="h-3.5 w-3.5 text-muted" />
          <span className="font-semibold text-foreground">{opp.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            {t(`stage.${opp.stage}` as TranslationKey)}
          </span>
          {editing ? (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[11px] text-muted font-medium block mb-0.5">{t('pipeline.valueCny')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={opp.value || ''}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d.]/g, '');
                    updateOpportunity(opp.id, { value: cleaned ? Number(cleaned) : 0 });
                  }}
                  className="w-32 form-input text-sm"
                  placeholder={t('pipeline.valuePlaceholder')}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium block mb-0.5">{t('pipeline.winProbability')}</label>
                <input
                  type="number" min={0} max={100}
                  value={opp.probability}
                  onChange={(e) => updateOpportunity(opp.id, { probability: Number(e.target.value) })}
                  className="w-20 form-input text-sm"
                  placeholder="70"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted font-medium block mb-0.5">{t('pipeline.expectedCloseDate')}</label>
                <input
                  type="date"
                  value={opp.expectedCloseDate}
                  onChange={(e) => updateOpportunity(opp.id, { expectedCloseDate: e.target.value })}
                  className="form-input text-sm"
                />
              </div>
              <div className="self-end flex gap-2">
                <button
                  onClick={async () => {
                    if (await appConfirm({ message: format('pipeline.deleteConfirm', opp.name), variant: 'danger' })) {
                      deleteOpportunity(opp.id);
                      router.push('/pipeline');
                    }
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                  title={t('pipeline.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setEditing(false)} className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent-hover">{t('pipeline.done')}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-background hover:text-foreground transition-colors">
              <Edit3 className="h-3.5 w-3.5" /> {t('pipeline.edit')}
            </button>
          )}
        </div>
      </div>

      <RoleFocusBanner surface="opportunity" jobLevel={jobLevel} />

      {/* Tabs -- bottom border-2 brand color indicator with dividers */}
      <div className="flex overflow-x-auto border-b border-border flex-nowrap scrollbar-hide">
        {TABS.map((tab, idx) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`relative border-b-2 px-5 py-3 text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
              idx < TABS.length - 1 ? 'border-r border-r-border' : ''
            } ${
              activeTab === tab.key
                ? 'border-b-accent text-accent font-bold'
                : 'border-b-transparent text-secondary font-medium hover:text-foreground'
            }`}
          >
            {t(tab.labelKey as TranslationKey)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'cockpit' && (
        <div className="space-y-5">
          <DealCockpit opp={opp} accountName={accountName} contacts={contacts} ownerName={ownerName} />
          <ContactOpportunityRolePanel opportunity={opp} contacts={contacts} />
          <UnifiedTimelinePanel
            opportunity={opp}
            accountId={opp.accountId}
            intelItems={intelItems.filter((item) => item.accountId === opp.accountId && (!item.opportunityId || item.opportunityId === opp.id))}
            decodes={emailDecodes.filter((decode) => decode.opportunityId === opp.id || (!decode.opportunityId && decode.accountId === opp.accountId))}
            composedEmails={composedEmails.filter((email) => email.accountId === opp.accountId && email.opportunityId === opp.id)}
            tasks={tasks.filter((task) => task.opportunityId === opp.id || (!task.opportunityId && task.accountId === opp.accountId))}
          />
          {opp && false && (
          <div className="rounded-xl border border-border bg-card px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Radio className="h-4 w-4 text-accent" />
                  {t('pipeline.recentSignals')}
                </h2>
                <p className="mt-1 text-xs text-muted">{t('pipeline.recentSignalsDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/accounts/' + currentOpp.accountId + '?tab=activity')}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/20"
              >
                {t('pipeline.viewAccountSignals')}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {recentOpportunitySignals.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {recentOpportunitySignals.map((decode) => {
                  const risk = decode.decode.threadAnalysis?.riskLevel;
                  const riskClass = risk === 'critical' || risk === 'high'
                    ? 'border-danger/20 bg-danger/5 text-danger'
                    : risk === 'medium'
                      ? 'border-warning/20 bg-warning/5 text-warning'
                      : 'border-positive/20 bg-positive/5 text-positive';
                  return (
                    <button
                      key={decode.id}
                      type="button"
                      onClick={() => router.push('/accounts/' + currentOpp.accountId + '?tab=activity&targetKind=email_decode&targetId=' + decode.id)}
                      className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${riskClass}`}>
                          {DECODE_SOURCE_LABELS[decode.signalSource || 'email']?.[locale] ?? DECODE_SOURCE_LABELS.email[locale]}
                        </span>
                        <span className="text-[11px] text-muted">
                          {new Date(decode.date).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                        {decode.decode.threadAnalysis?.keySignal || decode.emailText.slice(0, 120)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {decode.opportunityId === currentOpp.id ? t('pipeline.linkedOpportunitySignal') : t('pipeline.accountSignal')}
                        {decode.strategy?.strategies?.length ? ` · ${t('pipeline.hasReplyStrategy')}` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
                <p className="text-sm font-medium text-foreground">{t('pipeline.noSignals')}</p>
                <p className="mt-1 text-xs text-muted">{t('pipeline.noSignalsDesc')}</p>
              </div>
            )}
          </div>
          )}
          <WinProbabilityPanel opportunityId={opp.id} accountId={opp.accountId} />
          {opp.stage !== 'closed_won' && opp.stage !== 'closed_lost' && (
            <AIForecastPanel opportunityId={opp.id} />
          )}
          {(opp.stage === 'closed_won' || opp.stage === 'closed_lost') && (
            <WinLossCard opportunity={opp} />
          )}
          {opp.stage !== 'closed_won' && opp.stage !== 'closed_lost' && (
            <StrategyRecommender opportunityId={opp.id} accountId={opp.accountId} />
          )}
        </div>
      )}
      {activeTab === 'meeting' && (
        <div className="space-y-6">
          <BriefingPack opp={opp} accountId={opp.accountId} contacts={contacts} />
          <MeetingReview opp={opp} accountId={opp.accountId} />
        </div>
      )}
      {activeTab === 'meddicc' && (
        <div className="space-y-6">
          <MeddiccTab opp={opp} />
          <CompetitorMatrix opportunity={opp} />
          <CompetitivePositioningCard opportunity={opp} />
        </div>
      )}
      {activeTab === 'plays' && account && (
        <StrategicPlayTab account={account} opportunities={[opp]} filterOpportunityId={opp.id} />
      )}
      {activeTab === 'execution' && (
        <div className="space-y-6">
          <MapTab opp={opp} />
          <TaskListSection accountId={opp.accountId} opportunityId={opp.id} title={t('pipeline.relatedTasks')} />
        </div>
      )}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <IntelNotesSection opportunityId={opp.id} opp={opp} accountName={accountName} />
          <NewsSearchPanel accountName={accountName} />
          <ActivityTab opp={opp} />
        </div>
      )}
      {activeTab === 'rfp' && <RfpTab opportunityId={opp.id} accountId={opp.accountId} />}
      {activeTab === 'collab' && (
        <div className="space-y-5">
          <CommentThread entityType="opportunity" entityId={opp.id} />
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="text-xs text-secondary">
              {t('pipeline.handoffPrefix')}
              <button
                onClick={() => router.push(`/accounts/${opp.accountId}?tab=collab`)}
                className="mx-1 text-accent hover:underline font-medium"
              >
                {format('pipeline.accountPage', accountName)}
              </button>
              {t('pipeline.handoffSuffix')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
