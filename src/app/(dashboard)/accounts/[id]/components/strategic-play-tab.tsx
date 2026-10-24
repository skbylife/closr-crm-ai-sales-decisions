'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Brain } from 'lucide-react';
import { OrgMap } from '@/components/org-map/org-map';
import { useHighlightScroll } from '@/lib/hooks/use-highlight-scroll';
import { useLocale } from '@/lib/i18n';
import { tPlay } from './strategic-play/labels';
import { buildStrategicSignalImpactInsight } from './strategic-play/signal-impact';
import { filterLowQualityDemoPlays } from './strategic-play/demo-play-quality';
import { NewPlayForm } from './strategic-play/new-play-form';
import { PlayListItem } from './strategic-play/play-list-item';
import { PlayDetail } from './strategic-play/play-detail';
import type {
  Account,
  Opportunity,
  StrategicPlay,
  PlayStatus,
  PlayRelationship,
} from '@/lib/babel-engine/types';
import type {
  JudgmentMemorySourceItem,
} from '@/lib/judgment/memory-sources';

// ─── Main Tab Component ─────────────────────────────────────────────

export function StrategicPlayTab({
  account,
  opportunities = [],
  prefill,
  onPrefillConsumed,
  filterOpportunityId,
  initialPlayId,
}: {
  account: Account;
  opportunities?: Opportunity[];
  prefill?: { goalType?: string; goalDescription?: string; successCriteria?: string; opportunityId?: string; additionalContext?: string } | null;
  onPrefillConsumed?: () => void;
  /** When set, only show plays for this specific opportunity */
  filterOpportunityId?: string;
  /** When set, auto-select this play on mount */
  initialPlayId?: string;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [relationships, setRelationships] = useState<PlayRelationship[]>([]);
  const [judgmentMemories, setJudgmentMemories] = useState<JudgmentMemorySourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPlayId, setSelectedPlayId] = useState<string | null>(initialPlayId ?? null);
  const [mobileShowDetail, setMobileShowDetail] = useState(!!initialPlayId);
  const [formPrefill, setFormPrefill] = useState<{ goalType?: string; goalDescription?: string; successCriteria?: string; opportunityId?: string; additionalContext?: string } | null>(null);
  const { highlightProps } = useHighlightScroll(initialPlayId ?? null);

  const fetchJudgmentMemories = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(account.id)}/memory-payload?window=30`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { judgmentMemories?: JudgmentMemorySourceItem[] };
      setJudgmentMemories(data.judgmentMemories ?? []);
    } catch (err) {
      console.warn('[strategic-play] judgment memory fetch failed:', err);
    }
  }, [account.id]);

  useEffect(() => {
    void fetchJudgmentMemories();
  }, [fetchJudgmentMemories]);

  useEffect(() => {
    function handleDecodeJudgmentMemorySaved(event: Event) {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (!detail?.accountId || detail.accountId === account.id) void fetchJudgmentMemories();
    }
    window.addEventListener('closr:decode-judgment-memory-saved', handleDecodeJudgmentMemorySaved);
    return () => window.removeEventListener('closr:decode-judgment-memory-saved', handleDecodeJudgmentMemorySaved);
  }, [account.id, fetchJudgmentMemories]);

  // Auto-open form when prefill arrives from action buttons
  useEffect(() => {
    if (prefill) {
      setShowForm(true);
      setMobileShowDetail(true);
      setSelectedPlayId(null);
      setFormPrefill(prefill);
      onPrefillConsumed?.();
      // Scroll to top so form is visible
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }
  }, [prefill, onPrefillConsumed]);

  useEffect(() => {
    if (!initialPlayId) return;
    setSelectedPlayId(initialPlayId);
    setMobileShowDetail(true);
  }, [initialPlayId]);

  const fetchPlays = useCallback(async (autoSelectNewest?: boolean | string) => {
    try {
      const url = `/api/strategic-play?accountId=${encodeURIComponent(account.id)}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`[strategic-play] Fetch failed: ${res.status} ${res.statusText} — accountId=${account.id}`);
        return;
      }
      const data = await res.json();
      if (data._debug) {
        console.warn('[strategic-play] API debug:', data._debug, data._error);
      }
      let fetchedPlays: StrategicPlay[] = filterLowQualityDemoPlays(data.plays ?? []);
      // Filter to specific opportunity if requested
      if (filterOpportunityId) {
        fetchedPlays = fetchedPlays.filter(p => p.opportunityId === filterOpportunityId);
      }
      setPlays(fetchedPlays);
      if (typeof autoSelectNewest === 'string') {
        // Select specific play by ID; if the deep-linked play is stale or
        // filtered out, fall back to the first play so ?tab=plays still opens
        // an obvious Strategic Play detail view instead of an empty overview-like shell.
        const selected = fetchedPlays.find((play) => play.id === autoSelectNewest)?.id ?? fetchedPlays[0]?.id ?? autoSelectNewest;
        setSelectedPlayId(selected);
        setMobileShowDetail(true);
      } else if (autoSelectNewest && fetchedPlays.length > 0) {
        setSelectedPlayId(fetchedPlays[0].id);
        setMobileShowDetail(true);
      } else {
        setSelectedPlayId((prev) => {
          if (initialPlayId) {
            return fetchedPlays.find((play) => play.id === initialPlayId)?.id ?? fetchedPlays[0]?.id ?? prev;
          }
          if (!prev && fetchedPlays.length > 0) return fetchedPlays[0].id;
          if (prev && !fetchedPlays.some((play) => play.id === prev)) return fetchedPlays[0]?.id ?? null;
          return prev;
        });
        if (initialPlayId && fetchedPlays.length > 0) setMobileShowDetail(true);
      }

      // Fetch relationships for blocked upstream detection
      const playIds = fetchedPlays.map(p => p.id);
      if (playIds.length > 0) {
        const relResults = await Promise.all(
          playIds.map(id =>
            fetch(`/api/play-relationships?sourcePlayId=${id}`)
              .then(r => r.json())
              .then((d: { relationships?: PlayRelationship[] }) => d.relationships ?? [])
              .catch(() => [] as PlayRelationship[])
          )
        );
        const seen = new Set<string>();
        const allRels: PlayRelationship[] = [];
        for (const batch of relResults) {
          for (const r of batch) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              allRels.push(r);
            }
          }
        }
        setRelationships(allRels);
      }
    } catch (err) {
      console.error('[strategic-play] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [account.id, filterOpportunityId, initialPlayId]);

  useEffect(() => {
    fetchPlays();
  }, [fetchPlays]);

  // Sort: active/in_progress first, then completed/abandoned
  const sortedPlays = [...plays].sort((a, b) => {
    const order: Record<PlayStatus, number> = { in_progress: 0, active: 1, completed: 2, abandoned: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  const selectedPlay = plays.find(p => p.id === selectedPlayId) ?? null;
  const selectedSignalImpactInsight = useMemo(
    () => selectedPlay ? buildStrategicSignalImpactInsight(selectedPlay, judgmentMemories) : null,
    [selectedPlay, judgmentMemories],
  );

  const handleSelectPlay = (playId: string) => {
    setSelectedPlayId(playId);
    setShowForm(false);
    setMobileShowDetail(true);
  };

  const handleRefresh = () => {
    fetchPlays();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{en ? 'Opportunity Plans' : '单局谋划'}</h2>
            <p className="mt-0.5 text-xs text-muted">{en ? 'Capture account context, key assumptions, evidence, priority actions, and execution updates around critical opportunities.' : '围绕关键机会沉淀局势判断、关键假设、证据链、下一步打法和执行校正。'}</p>
          </div>
        </div>
      </div>

      {/* Organization Map */}
      <OrgMap accountId={account.id} contacts={account.contacts} />

      {/* Split Panel */}
      <div className="rounded-2xl border border-border overflow-hidden" style={{ minHeight: '500px' }}>
        <div className="flex h-full" style={{ minHeight: '500px' }}>
          {/* ─── Left Panel ─── */}
          <div className={`w-full shrink-0 border-r border-border bg-background/50 flex flex-col lg:w-[280px] ${
            mobileShowDetail ? 'hidden lg:flex' : 'flex'
          }`}>
            {/* Left Header */}
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Brain className="h-4 w-4 text-accent" />
                  {tPlay(en, '谋局计划', 'Opportunity Plans')}
                  {plays.length > 0 && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">
                      {plays.length}
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => { setShowForm(true); setSelectedPlayId(null); setMobileShowDetail(true); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-secondary hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-colors"
                  title={tPlay(en, '新建', 'New')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Play List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="divide-y divide-border/50">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="px-4 py-3 space-y-2">
                      <div className="skeleton h-3.5 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/2 rounded" />
                      <div className="flex gap-2">
                        <div className="skeleton h-5 w-14 rounded-full" />
                        <div className="skeleton h-5 w-10 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : sortedPlays.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {sortedPlays.map(play => (
                    <div key={play.id} {...highlightProps(play.id)}>
                      <PlayListItem
                        play={play}
                        isSelected={play.id === selectedPlayId}
                        onClick={() => handleSelectPlay(play.id)}
                        opportunityName={play.opportunityId ? opportunities.find(o => o.id === play.opportunityId)?.name : undefined}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-10 text-center">
                  <Brain className="mx-auto h-8 w-8 text-secondary/50 mb-2" />
                  <p className="text-xs text-muted">{tPlay(en, '暂无推进计划', 'No play plans yet')}</p>
                </div>
              )}
            </div>

            {/* Bottom: New Play button */}
            <div className="shrink-0 border-t border-border p-3">
              <button
                onClick={() => { setShowForm(true); setSelectedPlayId(null); setMobileShowDetail(true); }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {tPlay(en, '新建', 'New')}
              </button>
            </div>
          </div>

          {/* ─── Right Panel ─── */}
          <div className={`flex-1 min-w-0 bg-card flex flex-col ${
            !mobileShowDetail ? 'hidden lg:flex' : 'flex'
          }`}>
            {showForm ? (
              <div className="p-5">
                <NewPlayForm
                  contacts={account.contacts}
                  accountId={account.id}
                  accountName={account.name}
                  opportunities={opportunities}
                  initialGoalType={formPrefill?.goalType}
                  initialGoalDescription={formPrefill?.goalDescription}
                  initialSuccessCriteria={formPrefill?.successCriteria}
                  initialOpportunityId={formPrefill?.opportunityId}
                  initialAdditionalContext={formPrefill?.additionalContext}
                  onCreated={async (newPlayId) => { await fetchPlays(newPlayId || true); setShowForm(false); setFormPrefill(null); }}
                  onCancel={() => { setShowForm(false); setFormPrefill(null); }}
                />
              </div>
            ) : selectedPlay ? (
              <PlayDetail
                play={selectedPlay}
                onRefresh={handleRefresh}
                onBack={() => setMobileShowDetail(false)}
                relationships={relationships}
                allPlays={plays}
                signalImpactInsight={selectedSignalImpactInsight}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-10">
                <div className="text-center">
                  <Brain className="mx-auto h-12 w-12 text-secondary/30 mb-3" />
                  <p className="text-sm font-medium text-secondary">{tPlay(en, '选择一个推进计划查看详情', 'Select a play to view details')}</p>
                  <p className="mt-1 text-xs text-muted">{tPlay(en, '或点击左侧「新建」创建单局谋划', 'Or click New on the left to create an opportunity play')}</p>
                  <button
                    onClick={() => { setShowForm(true); setMobileShowDetail(true); }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    {tPlay(en, '创建单局谋划', 'Create Opportunity Play')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
