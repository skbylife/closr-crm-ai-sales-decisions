import { normalizeCurrencyCode, type CurrencyCode } from '@/lib/format-currency';
import { create } from 'zustand';

import type { UserSettings } from '@/lib/user-settings';
import { loadUserSettings, saveUserSettings, migrateFromLocalStorage, clearMigratedLocalStorage, DEFAULT_USER_SETTINGS } from '@/lib/user-settings';
import type {
  Account,
  Contact,
  IntelItem,
  SavedDecode,
  Credibility,
  Urgency,
  IntelSource,
  IntelAnalysis,
  KnowledgeItem,
  Opportunity,
  OpportunityStage,
  MeetingPrepRecord,
  MeetingPrepInput,
  MeetingPrepResult,
  ComposedEmail,
  SpinItem,
  Task,
  TaskStatus,
  TaskPriority,
  TaskSource,
  AIAdvice,
  DecodeFeedback,
  SalesLead,
  SalesLeadStatus,
} from '@/lib/babel-engine/types';
import { STAGE_LABELS } from '@/lib/babel-engine/types';
import {
  dbSaveAccount,
  dbDeleteAccount,
  dbSaveContact,
  dbDeleteContact,
  dbSaveIntel,
  dbDeleteIntel,
  dbSaveDecode,
  dbDeleteDecode,
  dbSaveKnowledge,
  dbDeleteKnowledge,
  dbSaveOpportunity,
  dbDeleteOpportunity,
  dbSaveMeetingPrep,
  dbDeleteMeetingPrep,
  dbSaveComposedEmail,
  dbHydrateCritical,
  dbHydrateDeferred,
  dbGetAccounts,
  dbGetOpportunities,
  dbGetIntelItems,
  dbGetDecodes,
  dbLoadTasks,
  dbSaveTask,
  dbDeleteTask,
  dbSaveAIAdvice,
  dbSaveDecodeFeedback,
  logActivity,
  isSupabaseConfigured,
} from '@/lib/db';
import type { CriticalData, DeferredData } from '@/lib/db';
import { getCached, setCache, invalidatePrefix, clearAll as clearFetchCache, FRESHNESS } from '@/lib/fetch-cache';
import { getSupabase } from '@/lib/supabase';
import { toast } from '@/lib/toast-store';

import {
  sampleAccounts,
  sampleOpportunities,
  sampleIntelItems,
  sampleEmailDecodes,
  sampleKnowledgeItems,
  sampleTasks,
} from '@/lib/sample-data';

// ─── Hydrate 代次 & Realtime 订阅引用 ──────────────────────────────
// 用于防止旧 hydrate 覆盖新状态，以及避免重复订阅累积
let _hydrateGeneration = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _realtimeChannel: any = null;
let _realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// ─── 事件通知类型 ────────────────────────────────────────────────────

export type EventNotificationType = 'task_assigned' | 'new_decode' | 'org_invite';

export interface EventNotification {
  id: string;
  type: EventNotificationType;
  title: string;
  message: string;
  /** 点击跳转的目标路径 */
  actionUrl: string;
  /** 关联实体 ID（任务 / 解读 / 邀请） */
  entityId?: string;
  read: boolean;
  createdAt: string;
}

// ─── Store Interface ─────────────────────────────────────────────────

interface ClosrStore {
  // ── User Settings (Supabase-backed) ──
  userSettings: UserSettings;
  setUserSettings: (partial: Partial<UserSettings>) => void;

  // Job Level (determines dashboard view)
  jobLevel: number;
  setJobLevel: (level: number) => void;

  // Currency
  currencyCode: CurrencyCode;
  setCurrencyCode: (code: CurrencyCode) => void;

  // Hydration
  isHydrated: boolean;
  isDeferredHydrated: boolean;
  hydrate: () => Promise<void>;
  resetForAuthChange: () => void;

  // Data
  accounts: Account[];
  intelItems: IntelItem[];
  emailDecodes: SavedDecode[];

  // Account CRUD
  addAccount: (account: Omit<Account, 'id' | 'contacts'>) => string;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  getAccount: (id: string) => Account | undefined;

  // Contact CRUD
  addContact: (accountId: string, contact: Omit<Contact, 'id'>) => string;
  updateContact: (accountId: string, contactId: string, data: Partial<Contact>) => void;
  deleteContact: (accountId: string, contactId: string) => void;

  // Intel CRUD
  addIntel: (intel: {
    accountName: string;
    source: IntelSource;
    content: string;
    credibility: Credibility;
    urgency: Urgency;
    analysis?: IntelAnalysis;
    relatedContactIds?: string[];
    opportunityId?: string;
    spinClassification?: SpinItem[];
    type?: IntelItem['type'];
  }) => string;
  deleteIntel: (id: string) => void;
  getIntelForAccount: (accountId: string) => IntelItem[];
  getIntelForOpportunity: (opportunityId: string) => IntelItem[];
  updateIntel: (id: string, data: Partial<IntelItem>) => void;

  // Email Decode CRUD
  saveDecode: (decode: Omit<SavedDecode, 'id' | 'date'>) => string;
  updateDecode: (id: string, data: Partial<SavedDecode>) => void;
  deleteDecode: (id: string) => void;
  getDecodesForAccount: (accountId: string) => SavedDecode[];

  // Knowledge Base CRUD
  knowledgeItems: KnowledgeItem[];
  addKnowledge: (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => string;
  updateKnowledge: (id: string, data: Partial<KnowledgeItem>) => void;
  deleteKnowledge: (id: string) => void;

  // Opportunity CRUD
  opportunities: Opportunity[];
  addOpportunity: (data: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateOpportunity: (id: string, data: Partial<Opportunity>) => void;
  deleteOpportunity: (id: string) => void;
  getOpportunity: (id: string) => Opportunity | undefined;
  getOpportunitiesByAccount: (accountId: string) => Opportunity[];

  // Lead intake and conversion
  leads: SalesLead[];
  addLead: (lead: Omit<SalesLead, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { status?: SalesLeadStatus }) => string;
  updateLead: (id: string, data: Partial<SalesLead>) => void;
  deleteLead: (id: string) => void;
  convertLead: (id: string) => { accountId: string; contactId?: string; opportunityId: string } | null;
  getLead: (id: string) => SalesLead | undefined;

  // Meeting Prep CRUD
  addMeetingPrep: (accountId: string, input: MeetingPrepInput, result: MeetingPrepResult) => string;
  getMeetingPreps: (accountId: string) => MeetingPrepRecord[];
  deleteMeetingPrep: (accountId: string, prepId: string) => void;

  // Composed Email CRUD
  composedEmails: ComposedEmail[];
  addComposedEmail: (data: Omit<ComposedEmail, 'id' | 'createdAt'>) => string;
  updateComposedEmail: (id: string, data: Partial<ComposedEmail>) => void;

  // Task CRUD
  tasks: Task[];
  addTask: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTask: (id: string, data: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, status: TaskStatus) => void;
  createTaskFromAI: (params: { title: string; description: string; accountId?: string; opportunityId?: string; source: string; dueDate?: string; urgency?: 'high' | 'medium' | 'low'; priority?: TaskPriority; assignedTo?: string }) => string;

  // 事件通知
  eventNotifications: EventNotification[];
  addNotification: (data: Omit<EventNotification, 'id' | 'read' | 'createdAt'>) => string;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;

  // AI Advice Tracking
  aiAdvices: AIAdvice[];
  decodeFeedbacks: DecodeFeedback[];
  addAIAdvice: (advice: Omit<AIAdvice, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateAIAdviceStatus: (id: string, status: AIAdvice['status']) => void;
  addDecodeFeedback: (feedback: Omit<DecodeFeedback, 'createdAt'>) => void;

  // Data Import/Export
  exportData: () => ExportData;
  importData: (data: ExportData) => void;

  // Sample Data
  loadSampleData: () => void;

  // Dashboard module collapse state (UI preference)
  dashboardCollapseState: Record<string, boolean>;
  setModuleExpanded: (key: string, expanded: boolean) => void;
}

// ─── Export Data Shape ────────────────────────────────────────────────

export interface ExportData {
  accounts: Account[];
  opportunities: Opportunity[];
  intelItems: IntelItem[];
  emailDecodes: SavedDecode[];
  composedEmails: ComposedEmail[];
  knowledgeItems: KnowledgeItem[];
  tasks: Task[];
  leads: SalesLead[];
}

function getEmptySessionState() {
  return {
    accounts: [] as Account[],
    intelItems: [] as IntelItem[],
    emailDecodes: [] as SavedDecode[],
    knowledgeItems: [] as KnowledgeItem[],
    opportunities: [] as Opportunity[],
    leads: [] as SalesLead[],
    composedEmails: [] as ComposedEmail[],
    tasks: [] as Task[],
    aiAdvices: [] as AIAdvice[],
    decodeFeedbacks: [] as DecodeFeedback[],
    eventNotifications: [] as EventNotification[],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. HTTP without localhost)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const LEADS_STORAGE_KEY = 'closr:leads:v1';

function loadStoredLeads(): SalesLead[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEADS_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((lead): lead is SalesLead =>
      typeof lead === 'object' &&
      lead !== null &&
      typeof (lead as SalesLead).id === 'string' &&
      typeof (lead as SalesLead).companyName === 'string' &&
      typeof (lead as SalesLead).contactName === 'string'
    );
  } catch {
    return [];
  }
}

function saveStoredLeads(leads: SalesLead[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
  } catch {
    // Lead intake remains usable even when browser storage is unavailable.
  }
}

function emptyMeddiccAssessment(): Opportunity['meddicc'] {
  return {
    metrics: { notes: '', status: 'unconfirmed', evidence: '' },
    economicBuyer: { status: 'unknown', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 0, lastEngagement: '', notes: '' },
    competition: [],
    overallScore: 0,
  };
}

function emptyMutualActionPlan(): Opportunity['mutualActionPlan'] {
  return { targetSignDate: '', confidence: 50, milestones: [] };
}

function findAccountByName(accounts: Account[], name: string): Account | undefined {
  const normalized = name.trim().toLowerCase();
  return accounts.find((a) => a.name.toLowerCase() === normalized);
}

/** Invalidate all hydration SWR cache entries */
function invalidateHydrationCache() {
  invalidatePrefix('hydrate:');
}

// Fire-and-forget DB write (no await in store mutations)
// Demo mode now uses real Supabase auth, so writes go through normally
function bg(fn: () => Promise<void>) {
  fn().catch((e) => {
    console.error('[store→db] 持久化失败:', e);
    // Surface the error to the user via toast
    toast('数据保存到服务器失败，请刷新页面重试', 'error');
  });
}

/** Fire-and-forget DB write + invalidate hydration cache */
function bgInvalidate(fn: () => Promise<void>) {
  fn().then(() => invalidateHydrationCache()).catch((e) => {
    console.error('[store→db] 持久化失败:', e);
    toast('数据保存到服务器失败，请刷新页面重试', 'error');
  });
}

function parseStrategicPlayTaskLink(task: Task): { playId: string; stepIndex: number } | null {
  if (task.source !== 'strategic_play' || !task.sourceId) return null;

  const sourceMatch = task.sourceId.match(/^(.+):step:(\d+)$/);
  if (sourceMatch) {
    return { playId: sourceMatch[1], stepIndex: Number(sourceMatch[2]) };
  }

  const labelStep = (task.labels ?? [])
    .map((label) => label.match(/^Step\s+(\d+)$/i)?.[1])
    .find(Boolean);
  if (!labelStep) return null;

  return { playId: task.sourceId, stepIndex: Math.max(0, Number(labelStep) - 1) };
}

async function syncStrategicPlayTaskExecution(task: Task) {
  if (typeof window === 'undefined') return;
  const link = parseStrategicPlayTaskLink(task);
  if (!link) return;

  const executionStatus =
    task.status === 'todo' ? 'planned' :
    task.status === 'done' ? 'done' :
    task.status;

  const body: Record<string, unknown> = {
    playId: link.playId,
    accountId: task.accountId,
    stepIndex: link.stepIndex,
    executionStatus,
    linkedTaskId: task.id,
    assignedToUserId: task.assignedTo,
    executionOwnerSource: 'task_sync',
  };

  if (task.dueDate) body.dueDate = task.dueDate;
  if (task.status === 'done') {
    body.actualOutcome = `任务「${task.title}」已完成`;
    body.outcomeAssessment = 'unknown';
  }
  if (task.status === 'blocked') {
    body.blockerReason = `任务「${task.title}」被标记为受阻`;
    body.outcomeAssessment = 'blocked';
  }

  const res = await fetch('/api/strategic-play', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`strategic play task sync failed: ${res.status}`);
  }
}

// Fire-and-forget CIL ingest trigger (client → server)
function triggerCILIngest(params: {
  accountId: string;
  sourceId: string;
  sourceType: 'note' | 'meeting_note' | 'call_transcript' | 'email';
  rawText: string;
  context?: string;
}) {
  if (!params.rawText || params.rawText.length < 20) return;
  fetch('/api/cil-ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch((e) => console.warn('[cil-ingest] trigger failed (non-blocking):', e));
}

async function triggerDecodeJudgmentMemory(saved: SavedDecode) {
  if (!saved.accountId || typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/decode/judgment-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decodeId: saved.id, accountId: saved.accountId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[decode-judgment-memory] trigger failed (non-blocking):', res.status);
      return;
    }
    if (!(payload as { skipped?: boolean }).skipped) {
      window.dispatchEvent(new CustomEvent('closr:decode-judgment-memory-saved', {
        detail: {
          accountId: saved.accountId,
          decodeId: saved.id,
          sourceRecordId: (payload as { sourceRecord?: { source_row_id?: string } }).sourceRecord?.source_row_id ?? saved.id,
        },
      }));
    }
  } catch (e) {
    console.warn('[decode-judgment-memory] trigger failed (non-blocking):', e);
  }
}

async function triggerDecodePlayImpact(saved: SavedDecode) {
  if ((!saved.accountId && !saved.matchedContactId && !saved.opportunityId) || typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/decode/play-impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decodeId: saved.id,
        accountId: saved.accountId ?? saved.matchedAccountId,
        contactId: saved.matchedContactId,
        opportunityId: saved.opportunityId,
        accountName: saved.accountName ?? saved.matchedAccountName ?? saved.clientName,
        emailText: saved.emailText,
        decode: saved.decode,
      }),
    });
    if (!res.ok) {
      console.warn('[decode-play-impact] trigger failed (non-blocking):', res.status);
    }
  } catch (e) {
    console.warn('[decode-play-impact] trigger failed (non-blocking):', e);
  }
}

// ─── Store ───────────────────────────────────────────────────────────

export const useStore = create<ClosrStore>()(
  (set, get) => ({
      // ── User Settings ──────────────────────────────────────────
      userSettings: { ...DEFAULT_USER_SETTINGS },
      setUserSettings: (partial) => {
        const updated = { ...get().userSettings, ...partial };
        set({ userSettings: updated });
        // Sync derived fields
        if (partial.jobLevel !== undefined) set({ jobLevel: partial.jobLevel });
        if (partial.currencyCode !== undefined) set({ currencyCode: partial.currencyCode });
        // Persist to Supabase (fire-and-forget)
        bg(() => saveUserSettings(partial));
      },

      jobLevel: 0, // Hydrated from Supabase user_settings
      setJobLevel: (level) => {
        set({ jobLevel: level });
        get().setUserSettings({ jobLevel: level });
      },

      currencyCode: 'CNY' as CurrencyCode,
      setCurrencyCode: (code) => {
        const currencyCode = normalizeCurrencyCode(code) ?? 'CNY';
        set({ currencyCode });
        get().setUserSettings({ currencyCode });
      },

      isHydrated: false,
      isDeferredHydrated: false,
      ...getEmptySessionState(),
      leads: loadStoredLeads(),

      resetForAuthChange: () => {
        // 递增代次，使任何正在进行的旧 hydrate 自动失效
        _hydrateGeneration++;
        // 清理旧 realtime 订阅
        if (_realtimeChannel) {
          const sb = getSupabase();
          if (sb) sb.removeChannel(_realtimeChannel);
          _realtimeChannel = null;
        }
        if (_realtimeDebounceTimer) {
          clearTimeout(_realtimeDebounceTimer);
          _realtimeDebounceTimer = null;
        }
        // Clear ALL client-side caches to prevent cross-user data leakage
        clearFetchCache();
        set({
          userSettings: { ...DEFAULT_USER_SETTINGS },
          jobLevel: DEFAULT_USER_SETTINGS.jobLevel,
          currencyCode: DEFAULT_USER_SETTINGS.currencyCode,
          ...getEmptySessionState(),
          leads: loadStoredLeads(),
          isHydrated: false,
          isDeferredHydrated: false,
        });
      },

      // ── Hydrate from Supabase ──────────────────────────────────

      hydrate: async () => {
        if (!isSupabaseConfigured) {
          set({ isHydrated: true, isDeferredHydrated: true });
          return;
        }

        // 代次保护：记录本次 hydrate 的代次，后续 set 前检查是否已过期
        const gen = ++_hydrateGeneration;
        const isStale = () => gen !== _hydrateGeneration;

        try {
          // ── SWR: Try to serve from cache instantly ──
          const cachedCritical = getCached<CriticalData>('hydrate:critical', FRESHNESS.HYDRATION);
          const cachedDeferred = getCached<DeferredData>('hydrate:deferred', FRESHNESS.HYDRATION);

          if (cachedCritical) {
            // Instant render from cache
            const cd = cachedCritical.data;
            if (cd.accounts.length > 0 || cd.opportunities.length > 0) {
              set({
                accounts: cd.accounts,
                opportunities: cd.opportunities,
                tasks: cd.tasks ?? [],
                isHydrated: true,
              });
            }
            if (cachedDeferred) {
              const dd = cachedDeferred.data;
              set({
                intelItems: dd.intelItems ?? [],
                emailDecodes: dd.emailDecodes ?? [],
                knowledgeItems: dd.knowledgeItems ?? [],
                composedEmails: dd.composedEmails ?? [],
                aiAdvices: dd.aiAdvices ?? [],
                decodeFeedbacks: dd.decodeFeedbacks ?? [],
                isDeferredHydrated: true,
              });
            }
          }

          // Load user settings from Supabase (parallel with critical data hydration)
          const [critical, remoteSettings] = await Promise.all([
            dbHydrateCritical(),
            loadUserSettings(),
          ]);

          // 如果在 await 期间有新的 hydrate 或 resetForAuthChange，放弃本次结果
          if (isStale()) return;

          // ── User Settings hydration ──
          if (remoteSettings) {
            set({
              userSettings: remoteSettings,
              jobLevel: remoteSettings.jobLevel,
              currencyCode: remoteSettings.currencyCode,
            });
          } else {
            const migrated = migrateFromLocalStorage();
            if (Object.keys(migrated).length > 0) {
              const full = { ...DEFAULT_USER_SETTINGS, ...migrated };
              set({
                userSettings: full,
                jobLevel: full.jobLevel,
                currencyCode: full.currencyCode,
              });
              bg(() => saveUserSettings(full).then(() => clearMigratedLocalStorage()));
            }
          }

          if (isStale()) return;

          // ── Phase 1: Critical data — UI unblocks here ──
          if (critical && (critical.accounts.length > 0 || critical.opportunities.length > 0)) {
            set({
              accounts: critical.accounts,
              opportunities: critical.opportunities,
              tasks: critical.tasks ?? [],
              isHydrated: true,
            });
            setCache('hydrate:critical', critical);
          } else if (!cachedCritical) {
            // New user / empty tenant: explicitly clear prior in-memory data
            set({
              ...getEmptySessionState(),
              userSettings: get().userSettings,
              jobLevel: get().jobLevel,
              currencyCode: get().currencyCode,
              isHydrated: true,
              isDeferredHydrated: true,
            });
          } else {
            // Cache served data but fresh fetch returned empty — update
            set({
              ...getEmptySessionState(),
              userSettings: get().userSettings,
              jobLevel: get().jobLevel,
              currencyCode: get().currencyCode,
              isHydrated: true,
              isDeferredHydrated: true,
            });
          }

          if (isStale()) return;

          // ── Phase 2: Deferred data — loaded in background ──
          void dbHydrateDeferred().then((deferred) => {
            if (isStale()) return;
            if (deferred) {
              set({
                intelItems: deferred.intelItems,
                emailDecodes: deferred.emailDecodes,
                knowledgeItems: deferred.knowledgeItems,
                composedEmails: deferred.composedEmails,
                aiAdvices: deferred.aiAdvices,
                decodeFeedbacks: deferred.decodeFeedbacks,
                isDeferredHydrated: true,
              });
              setCache('hydrate:deferred', deferred);
            } else {
              set({ isDeferredHydrated: true });
            }
          }).catch((e) => {
            console.error('[store] deferred hydration failed:', e);
            if (!isStale()) set({ isDeferredHydrated: true });
          });

          if (isStale()) return;

          // Subscribe to Supabase Realtime for live updates
          const sb = getSupabase();
          if (sb) {
            if (_realtimeChannel) {
              sb.removeChannel(_realtimeChannel);
              _realtimeChannel = null;
            }

            const debounceRefresh = (fn: () => Promise<void>) => {
              if (_realtimeDebounceTimer) clearTimeout(_realtimeDebounceTimer);
              _realtimeDebounceTimer = setTimeout(() => {
                invalidateHydrationCache();
                fn().catch((e) => console.error('[realtime] refresh failed:', e));
              }, 500);
            };
            const notifyRealtimeChange = (name: string) => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(name));
              }
            };

            _realtimeChannel = sb.channel('closr-changes')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
                if (isStale()) return;
                debounceRefresh(() => dbGetAccounts().then((accounts) => { set({ accounts }); return; }));
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, () => {
                if (isStale()) return;
                debounceRefresh(() => dbGetOpportunities().then((opportunities) => { set({ opportunities }); return; }));
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'intel_items' }, () => {
                if (isStale()) return;
                debounceRefresh(() => dbGetIntelItems().then((intelItems) => { set({ intelItems }); return; }));
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'email_decodes' }, () => {
                if (isStale()) return;
                debounceRefresh(() => dbGetDecodes().then((emailDecodes) => { set({ emailDecodes }); return; }));
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
                if (isStale()) return;
                debounceRefresh(() => dbLoadTasks().then((tasks) => { set({ tasks }); return; }));
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'strategic_plays' }, () => {
                if (isStale()) return;
                notifyRealtimeChange('closr:strategic-plays-changed');
              })
              .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => {
                if (isStale()) return;
                notifyRealtimeChange('closr:activity-logs-changed');
              })
              .subscribe();
          }
        } catch (e) {
          console.error('[store] hydrate failed, falling back to localStorage:', e);
          if (!isStale()) set({ isHydrated: true, isDeferredHydrated: true });
        }
      },

      // ── Account ──────────────────────────────────────────────

      addAccount: (data) => {
        const id = uid();
        const account: Account = { ...data, id, contacts: [], opportunityIds: [], createdAt: new Date().toISOString() };
        set((s) => ({ accounts: [...s.accounts, account] }));
        bgInvalidate(() => dbSaveAccount(account));
        bg(() => logActivity('account_created', `新建客户: ${data.name}`, { entityType: 'account', entityId: id, entityName: data.name }));
        return id;
      },

      updateAccount: (id, data) => {
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === id ? { ...a, ...data } : a
          ),
        }));
        const updated = get().accounts.find((a) => a.id === id);
        if (updated) {
          bgInvalidate(() => dbSaveAccount(updated, { preserveOwnership: true }));
          bg(() => logActivity('account_updated', `更新客户: ${updated.name}`, { entityType: 'account', entityId: id, entityName: updated.name }));
        }
      },

      deleteAccount: (id) => {
        const account = get().accounts.find((a) => a.id === id);
        set((s) => ({
          accounts: s.accounts.filter((a) => a.id !== id),
          intelItems: s.intelItems.filter((i) => i.accountId !== id),
          emailDecodes: s.emailDecodes.filter((d) => d.accountId !== id),
        }));
        bgInvalidate(() => dbDeleteAccount(id));
        bg(() => logActivity('account_deleted', `删除客户: ${account?.name ?? id}`, { entityType: 'account', entityId: id, entityName: account?.name }));
      },

      getAccount: (id) => get().accounts.find((a) => a.id === id),

      // ── Contact ──────────────────────────────────────────────

      addContact: (accountId, data) => {
        const id = uid();
        const contact: Contact = { ...data, id, createdAt: new Date().toISOString() };
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === accountId
              ? { ...a, contacts: [...a.contacts, contact] }
              : a
          ),
        }));
        bgInvalidate(() => dbSaveContact(contact, accountId));
        bg(() => logActivity('contact_created', `新建联系人: ${contact.name}`, { entityType: 'contact', entityId: id, entityName: contact.name, accountId }));
        return id;
      },

      updateContact: (accountId, contactId, data) => {
        const prevContact = get().accounts.find((a) => a.id === accountId)?.contacts.find((c) => c.id === contactId);
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  contacts: a.contacts.map((c) =>
                    c.id === contactId ? { ...c, ...data } : c
                  ),
                }
              : a
          ),
        }));
        const account = get().accounts.find((a) => a.id === accountId);
        const contact = account?.contacts.find((c) => c.id === contactId);
        if (contact) bgInvalidate(() => dbSaveContact(contact, accountId));
        if (data.role && data.role !== prevContact?.role && contact) {
          bg(() => logActivity('contact_role_changed', `更新联系人角色: ${contact.name} → ${data.role}`, { entityType: 'contact', entityId: contactId, entityName: contact.name, accountId, accountName: account?.name }));
        }
      },

      deleteContact: (accountId, contactId) => {
        const contact = get().accounts.find((a) => a.id === accountId)?.contacts.find((c) => c.id === contactId);
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === accountId
              ? { ...a, contacts: a.contacts.filter((c) => c.id !== contactId) }
              : a
          ),
        }));
        bgInvalidate(() => dbDeleteContact(contactId));
        bg(() => logActivity('contact_deleted', `删除联系人: ${contact?.name ?? contactId}`, { entityType: 'contact', entityId: contactId, entityName: contact?.name, accountId }));
      },

      // ── Intel ────────────────────────────────────────────────

      addIntel: (data) => {
        const id = uid();
        // Find or create account
        const state = get();
        let account = findAccountByName(state.accounts, data.accountName);
        if (!account) {
          const accountId = get().addAccount({ name: data.accountName.trim() });
          account = get().getAccount(accountId);
        }
        const accountId = account!.id;

        const summary =
          data.content.length > 80
            ? data.content.slice(0, 80) + '...'
            : data.content;

        const intel: IntelItem = {
          id,
          accountId,
          accountName: data.accountName.trim(),
          type: data.type ?? 'manual',
          source: data.source,
          title: summary.split(/[。.!！?\n]/)[0] || summary,
          content: data.content,
          summary,
          credibility: data.credibility,
          urgency: data.urgency,
          relevance: '',
          date: new Date().toISOString(),
          analysis: data.analysis,
          relatedContactIds: data.relatedContactIds ?? [],
          opportunityId: data.opportunityId,
          spinClassification: data.spinClassification,
        };

        set((s) => ({
          intelItems: [intel, ...s.intelItems],
          accounts: s.accounts.map((a) =>
            a.id === accountId
              ? { ...a, lastActivity: new Date().toISOString() }
              : a
          ),
        }));
        bgInvalidate(() => dbSaveIntel(intel));
        bg(() => logActivity('intel_created', `新增情报: ${intel.title}`, { entityType: 'intel', entityId: id, entityName: intel.title, accountId }));
        // CIL ingest: fire-and-forget for manual notes and decode-generated intel
        if (data.content && data.content.length >= 20) {
          triggerCILIngest({
            accountId,
            sourceId: id,
            sourceType: data.source === 'ai_decode' ? 'email' : 'note',
            rawText: data.content,
            context: `情报来源: ${data.source ?? 'manual'}, 类型: ${data.type ?? 'manual'}`,
          });
        }
        return id;
      },

      deleteIntel: (id) => {
        set((s) => ({ intelItems: s.intelItems.filter((i) => i.id !== id) }));
        bgInvalidate(() => dbDeleteIntel(id));
      },

      getIntelForAccount: (accountId) =>
        get().intelItems.filter((i) => i.accountId === accountId),

      getIntelForOpportunity: (opportunityId) =>
        get().intelItems.filter((i) => i.opportunityId === opportunityId),

      updateIntel: (id, data) => {
        set((s) => ({
          intelItems: s.intelItems.map((i) =>
            i.id === id ? { ...i, ...data } : i
          ),
        }));
        const updated = get().intelItems.find((i) => i.id === id);
        if (updated) bgInvalidate(() => dbSaveIntel(updated));
      },

      // ── Email Decode ─────────────────────────────────────────

      saveDecode: (data) => {
        const id = uid();
        const saved: SavedDecode = {
          ...data,
          id,
          signalStatus: data.signalStatus ?? 'new',
          date: new Date().toISOString(),
        };
        set((s) => ({ emailDecodes: [saved, ...s.emailDecodes] }));
        bgInvalidate(async () => {
          await dbSaveDecode(saved);
          await triggerDecodeJudgmentMemory(saved);
          await triggerDecodePlayImpact(saved);
        });
        bg(() => logActivity('decode_created', `新建邮件解读: ${data.accountName || data.clientName || '未知'}`, { entityType: 'decode', entityId: id, entityName: data.accountName || data.clientName }));
        // 新邮件解读时生成通知
        const label = data.accountName || data.clientName || '未知客户';
        get().addNotification({
          type: 'new_decode',
          title: '新邮件解读',
          message: `来自 ${label} 的邮件已完成解读`,
          actionUrl: data.accountId ? `/accounts/${data.accountId}?tab=activity&targetKind=email_decode&targetId=${id}` : '/decode',
          entityId: id,
        });

        // F3: 自动写入 intel_items 活动记录
        if (data.accountId && data.accountName) {
          const keySignal = data.decode?.threadAnalysis?.keySignal ?? '';
          const decodeSummary = keySignal || data.decode?.messages?.[0]?.decode?.meaning || '';
          const emailSubject = data.emailText?.split('\n')[0]?.slice(0, 60) || '邮件';
          get().addIntel({
            accountName: data.accountName,
            source: 'ai_decode',
            type: 'email_decode',
            content: decodeSummary.slice(0, 200),
            credibility: 'medium',
            urgency: 'medium',
            opportunityId: data.opportunityId,
            relatedContactIds: data.matchedContactId ? [data.matchedContactId] : [],
          });

          // F4: 自动触发 CIL 编译（fire-and-forget）
          bg(async () => {
            await fetch('/api/cil-ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accountId: data.accountId,
                sourceType: 'email',
                sourceId: id,
                rawText: `[邮件解读] ${emailSubject}\n\n关键信号: ${keySignal}\n\n${decodeSummary}\n\n原文摘要: ${(data.emailText ?? '').slice(0, 500)}`,
                occurredAt: new Date().toISOString(),
              }),
            }).catch(() => {});
          });
        }

        return id;
      },

      updateDecode: (id, data) => {
        const patch: Partial<SavedDecode> = {
          ...data,
          signalStatusUpdatedAt: data.signalStatus ? new Date().toISOString() : data.signalStatusUpdatedAt,
        };
        set((s) => ({
          emailDecodes: s.emailDecodes.map((decode) =>
            decode.id === id ? { ...decode, ...patch } : decode
          ),
        }));
        const updated = get().emailDecodes.find((decode) => decode.id === id);
        if (updated) bgInvalidate(() => dbSaveDecode(updated));
      },

      deleteDecode: (id) => {
        set((s) => ({
          emailDecodes: s.emailDecodes.filter((d) => d.id !== id),
        }));
        bgInvalidate(() => dbDeleteDecode(id));
      },

      getDecodesForAccount: (accountId) =>
        get().emailDecodes.filter((d) => d.accountId === accountId),

      // ── Knowledge Base ─────────────────────────────────────────

      addKnowledge: (data) => {
        const id = uid();
        const item: KnowledgeItem = {
          ...data,
          id,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ knowledgeItems: [item, ...s.knowledgeItems] }));
        bgInvalidate(() => dbSaveKnowledge(item));
        bg(() => logActivity('knowledge_created', `新增知识: ${data.title}`, { entityType: 'knowledge', entityId: id, entityName: data.title }));
        return id;
      },

      updateKnowledge: (id, data) => {
        set((s) => ({
          knowledgeItems: s.knowledgeItems.map((k) =>
            k.id === id ? { ...k, ...data } : k
          ),
        }));
        const updated = get().knowledgeItems.find((k) => k.id === id);
        if (updated) bgInvalidate(() => dbSaveKnowledge(updated));
      },

      deleteKnowledge: (id) => {
        set((s) => ({ knowledgeItems: s.knowledgeItems.filter((k) => k.id !== id) }));
        bgInvalidate(() => dbDeleteKnowledge(id));
      },

      // ── Opportunity ────────────────────────────────────────────

      opportunities: [],

      addOpportunity: (data) => {
        const id = uid();
        const now = new Date().toISOString();
        const opp: Opportunity = { ...data, id, createdAt: now, updatedAt: now };
        set((s) => ({
          opportunities: [...s.opportunities, opp],
          accounts: s.accounts.map((a) =>
            a.id === data.accountId
              ? { ...a, opportunityIds: [...(a.opportunityIds || []), id], lastActivity: now }
              : a
          ),
        }));
        bgInvalidate(() => dbSaveOpportunity(opp));
        // Also persist the updated account's opportunityIds
        const updatedAccount = get().accounts.find((a) => a.id === data.accountId);
        if (updatedAccount) bgInvalidate(() => dbSaveAccount(updatedAccount, { preserveOwnership: true }));
        bg(() => logActivity('opportunity_created', `新建机会: ${data.name}`, { entityType: 'opportunity', entityId: id, entityName: data.name, accountId: data.accountId, accountName: updatedAccount?.name }));
        return id;
      },

      updateOpportunity: (id, data) => {
        const prevOpp = get().opportunities.find((o) => o.id === id);
        set((s) => ({
          opportunities: s.opportunities.map((o) =>
            o.id === id ? { ...o, ...data, updatedAt: new Date().toISOString() } : o
          ),
        }));
        const updated = get().opportunities.find((o) => o.id === id);
        if (updated) bgInvalidate(() => dbSaveOpportunity(updated, { preserveOwnership: true }));
        if (data.stage && data.stage !== prevOpp?.stage && updated) {
          bg(() => logActivity('deal_stage_changed', `机会阶段变更: ${updated.name} ${prevOpp?.stage} → ${data.stage}`, { entityType: 'opportunity', entityId: id, entityName: updated.name, accountId: updated.accountId }));

          // ── 自动生成阶段跟进任务 ──
          const stageTaskTitles: Record<OpportunityStage, string> = {
            lead_identified: '确认线索：了解客户需求和预算',
            discovery: '需求挖掘：安排深入沟通会议',
            solution_presented: '方案跟进：确认客户对方案的反馈',
            proposal_sent: '报价跟进：确认客户对报价的意见',
            negotiation: '谈判准备：梳理让步底线和条款',
            contract_review: '合同审核跟进：推动合同签署',
            closed_won: '赢单后续：安排交付和客户成功对接',
            closed_lost: '丢单复盘：记录原因和教训',
          };
          const highPriorityStages: OpportunityStage[] = ['negotiation', 'contract_review'];
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 3);
          get().addTask({
            accountId: updated.accountId,
            opportunityId: updated.id,
            title: stageTaskTitles[data.stage],
            status: 'todo',
            priority: highPriorityStages.includes(data.stage) ? 'high' : 'medium',
            dueDate: dueDate.toISOString().split('T')[0],
            source: 'system',
            aiGenerated: true,
            labels: ['自动生成', STAGE_LABELS[data.stage]],
          });

          // ── 赢单后自动创建交付 Checklist ──
          if (data.stage === 'closed_won' && prevOpp?.stage !== 'closed_won') {
            const checklist: { title: string; priority: 'high' | 'medium' | 'low'; dueDays: number }[] = [
              { title: '📝 合同签署确认', priority: 'high', dueDays: 3 },
              { title: '💰 首付款/全款确认', priority: 'high', dueDays: 7 },
              { title: '🤝 销售→交付团队交接会议', priority: 'medium', dueDays: 5 },
              { title: '🚀 客户实施启动会', priority: 'medium', dueDays: 14 },
              { title: '✅ 客户验收确认', priority: 'medium', dueDays: 30 },
              { title: '📅 设置续约提醒 (合同到期前60天)', priority: 'low', dueDays: 7 },
            ];
            for (const item of checklist) {
              const due = new Date();
              due.setDate(due.getDate() + item.dueDays);
              get().addTask({
                accountId: updated.accountId,
                opportunityId: updated.id,
                title: item.title,
                status: 'todo',
                priority: item.priority,
                dueDate: due.toISOString().split('T')[0],
                source: 'system',
                aiGenerated: true,
                labels: ['赢单交付', '自动生成'],
              });
            }
          }
        }
      },

      deleteOpportunity: (id) => {
        set((s) => {
          const opp = s.opportunities.find((o) => o.id === id);
          return {
            opportunities: s.opportunities.filter((o) => o.id !== id),
            accounts: opp
              ? s.accounts.map((a) =>
                  a.id === opp.accountId
                    ? { ...a, opportunityIds: (a.opportunityIds || []).filter((oid) => oid !== id) }
                    : a
                )
              : s.accounts,
          };
        });
        bgInvalidate(() => dbDeleteOpportunity(id));
      },

      getOpportunity: (id) => get().opportunities.find((o) => o.id === id),

      getOpportunitiesByAccount: (accountId) =>
        get().opportunities.filter((o) => o.accountId === accountId),

      // ── Lead intake ───────────────────────────────────────────

      addLead: (data) => {
        const id = uid();
        const now = new Date().toISOString();
        const lead: SalesLead = {
          ...data,
          id,
          companyName: data.companyName.trim(),
          contactName: data.contactName.trim(),
          source: data.source.trim(),
          need: data.need.trim(),
          estimatedValue: Number.isFinite(data.estimatedValue) ? data.estimatedValue : 0,
          currency: data.currency || get().currencyCode,
          priority: data.priority ?? 'medium',
          status: data.status ?? 'new',
          createdAt: now,
          updatedAt: now,
        };
        set((s) => {
          const leads = [lead, ...s.leads];
          saveStoredLeads(leads);
          return { leads };
        });
        bg(() => logActivity('lead_created', `新建线索: ${lead.companyName}`, { entityType: 'lead', entityId: id, entityName: lead.companyName }));
        return id;
      },

      updateLead: (id, data) => {
        set((s) => {
          const leads = s.leads.map((lead) =>
            lead.id === id ? { ...lead, ...data, updatedAt: new Date().toISOString() } : lead
          );
          saveStoredLeads(leads);
          return { leads };
        });
      },

      deleteLead: (id) => {
        set((s) => {
          const leads = s.leads.filter((lead) => lead.id !== id);
          saveStoredLeads(leads);
          return { leads };
        });
      },

      convertLead: (id) => {
        const lead = get().leads.find((item) => item.id === id);
        if (!lead || lead.status === 'converted') return null;

        let account = findAccountByName(get().accounts, lead.companyName);
        let accountId = account?.id;
        if (!accountId) {
          accountId = get().addAccount({
            name: lead.companyName,
            dealValue: lead.estimatedValue,
            dealStage: 'lead_identified',
            dealHealth: 'healthy',
            notes: lead.notes,
            opportunityIds: [],
          });
          account = get().accounts.find((item) => item.id === accountId);
        }

        let contactId: string | undefined;
        const existingContact = account?.contacts.find((contact) => {
          const sameEmail = Boolean(lead.email && contact.email && contact.email.toLowerCase() === lead.email.toLowerCase());
          const sameName = contact.name.trim().toLowerCase() === lead.contactName.trim().toLowerCase();
          return sameEmail || sameName;
        });
        if (existingContact) {
          contactId = existingContact.id;
        } else if (lead.contactName) {
          contactId = get().addContact(accountId, {
            name: lead.contactName,
            email: lead.email ?? '',
            phone: lead.phone,
            title: lead.title,
            role: 'unknown',
            personalNotes: lead.notes,
          });
        }

        const opportunityId = get().addOpportunity({
          accountId,
          name: lead.need || `${lead.companyName} 新线索`,
          value: lead.estimatedValue,
          currency: lead.currency || get().currencyCode,
          stage: 'lead_identified',
          probability: 10,
          expectedCloseDate: '',
          owner: '',
          assignedTo: lead.ownerId,
          source: lead.source,
          meddicc: emptyMeddiccAssessment(),
          mutualActionPlan: emptyMutualActionPlan(),
          competitorIds: [],
          notes: lead.notes ?? lead.nextStep ?? '',
        });

        const now = new Date().toISOString();
        set((s) => {
          const leads: SalesLead[] = s.leads.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'converted' as const,
                  convertedAt: now,
                  convertedAccountId: accountId,
                  convertedContactId: contactId,
                  convertedOpportunityId: opportunityId,
                  updatedAt: now,
                }
              : item
          );
          saveStoredLeads(leads);
          return { leads };
        });
        bg(() => logActivity('lead_converted', `线索转化: ${lead.companyName}`, { entityType: 'lead', entityId: id, entityName: lead.companyName, accountId }));
        return { accountId, contactId, opportunityId };
      },

      getLead: (id) => get().leads.find((lead) => lead.id === id),

      // ── Meeting Prep ─────────────────────────────────────────

      addMeetingPrep: (accountId, input, result) => {
        const id = uid();
        const record: MeetingPrepRecord = {
          id,
          accountId,
          input,
          result,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === accountId
              ? { ...a, meetingPreps: [record, ...(a.meetingPreps || [])] }
              : a
          ),
        }));
        bgInvalidate(() => dbSaveMeetingPrep(record));
        return id;
      },

      getMeetingPreps: (accountId) => {
        const account = get().accounts.find((a) => a.id === accountId);
        return account?.meetingPreps || [];
      },

      deleteMeetingPrep: (accountId, prepId) => {
        set((s) => ({
          accounts: s.accounts.map((a) =>
            a.id === accountId
              ? { ...a, meetingPreps: (a.meetingPreps || []).filter((p) => p.id !== prepId) }
              : a
          ),
        }));
        bgInvalidate(() => dbDeleteMeetingPrep(prepId));
      },

      // ── Composed Email ──────────────────────────────────────────

      composedEmails: [],

      addComposedEmail: (data) => {
        const id = uid();
        const email: ComposedEmail = { ...data, id, createdAt: new Date().toISOString() };
        set((s) => ({ composedEmails: [email, ...s.composedEmails] }));
        bgInvalidate(() => dbSaveComposedEmail(email));
        return id;
      },

      updateComposedEmail: (id, data) => {
        set((s) => ({
          composedEmails: s.composedEmails.map((e) =>
            e.id === id ? { ...e, ...data } : e
          ),
        }));
        const updated = get().composedEmails.find((e) => e.id === id);
        if (updated) bgInvalidate(() => dbSaveComposedEmail(updated));
      },

      // ── Task CRUD ────────────────────────────────────────────────

      addTask: (data) => {
        const id = uid();
        const now = new Date().toISOString();
        const task: Task = { ...data, id, createdAt: now, updatedAt: now };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        bgInvalidate(() => dbSaveTask(task, { updateAssignee: true }));
        bg(() => logActivity('task_created', `新建任务: ${task.title}`, { entityType: 'task', entityId: id, entityName: task.title, accountId: task.accountId ?? undefined }));
        return id;
      },

      updateTask: (id, data) => {
        const prevTask = get().tasks.find((t) => t.id === id);
        // preserveOwnership: 不在内存态覆盖 assignedTo，避免覆盖 transfer/claim 的服务端真源
        // 只有当调用方明确传入了不同的 assignedTo 时才更新
        const assigneeChanged = 'assignedTo' in data && data.assignedTo !== prevTask?.assignedTo;
        const safeData = { ...data };
        if (!assigneeChanged) delete safeData.assignedTo;
        const mergeData = assigneeChanged ? data : safeData;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, ...mergeData, updatedAt: new Date().toISOString() } : t
          ),
        }));
        const updated = get().tasks.find((t) => t.id === id);
        if (updated) {
          bgInvalidate(() => dbSaveTask(updated, { preserveOwnership: true, updateAssignee: assigneeChanged }));
          bg(() => logActivity('task_updated', `更新任务: ${updated.title}`, { entityType: 'task', entityId: id, entityName: updated.title, accountId: updated.accountId ?? undefined }));
        }
        if (updated && data.status && data.status !== prevTask?.status) {
          bg(() => syncStrategicPlayTaskExecution(updated));
        }
        // 任务指派变更时生成通知
        if (assigneeChanged && data.assignedTo && updated) {
          get().addNotification({
            type: 'task_assigned',
            title: '任务指派',
            message: `你被分配了新任务: ${updated.title}`,
            actionUrl: '/tasks',
            entityId: id,
          });
        }
      },

      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
        bgInvalidate(() => dbDeleteTask(id));
        bg(() => logActivity('task_deleted', `删除任务: ${task?.title ?? id}`, { entityType: 'task', entityId: id, entityName: task?.title, accountId: task?.accountId ?? undefined }));
      },

      moveTask: (id, status) => {
        const prevTask = get().tasks.find((t) => t.id === id);
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t
          ),
        }));
        const updated = get().tasks.find((t) => t.id === id);
        if (updated) bgInvalidate(() => dbSaveTask(updated, { preserveOwnership: true }));
        if (updated && status !== prevTask?.status) {
          bg(() => syncStrategicPlayTaskExecution(updated));
        }
        if (status === 'done' && prevTask?.status !== 'done' && updated) {
          bg(() => logActivity('task_completed', `完成任务: ${updated.title}`, { entityType: 'task', entityId: id, entityName: updated.title, accountId: updated.accountId ?? undefined }));
        }
      },

      createTaskFromAI: (params) => {
        const id = uid();
        const now = new Date().toISOString();
        // Use caller-provided dueDate/priority/assignedTo when available (from action plan),
        // otherwise fall back to defaults
        const urgencyToDays: Record<string, number> = { high: 1, medium: 3, low: 7 };
        const defaultDays = params.urgency ? (urgencyToDays[params.urgency] ?? 3) : 3;
        const dueDate = params.dueDate ?? new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const priority = params.priority ?? (params.urgency === 'low' ? 'medium' as const : 'high' as const);
        const task: Task = {
          id,
          title: params.title,
          description: params.description,
          accountId: params.accountId,
          opportunityId: params.opportunityId,
          assignedTo: params.assignedTo,
          status: 'todo',
          priority,
          dueDate,
          source: params.source as TaskSource,
          aiGenerated: true,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        bgInvalidate(() => dbSaveTask(task, { updateAssignee: true }));
        bg(() => logActivity('task_created', `AI建议转任务: ${task.title}`, { entityType: 'task', entityId: id, entityName: task.title, accountId: task.accountId ?? undefined }));
        // 同时创建 AIAdvice 记录
        get().addAIAdvice({
          text: params.title + (params.description ? ": " + params.description : ""),
          source: (params.source === "intel" ? "intel" : params.source === "meddicc" ? "meddicc" : "strategy") as AIAdvice["source"],
          status: "adopted",
          accountId: params.accountId,
          opportunityId: params.opportunityId,
          taskId: id,
        });
        return id;
      },

            // ── 事件通知 ───────────────────────────────────────────────────

      addNotification: (data) => {
        const id = uid();
        const notification: EventNotification = {
          ...data,
          id,
          read: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ eventNotifications: [notification, ...s.eventNotifications] }));
        return id;
      },

      markNotificationRead: (id) => {
        set((s) => ({
          eventNotifications: s.eventNotifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      clearNotifications: () => {
        set({ eventNotifications: [] });
      },

      // ── AI Advice Tracking ───────────────────────────────────────

      addAIAdvice: (data) => {
        const id = uid();
        const now = new Date().toISOString();
        const advice: AIAdvice = { ...data, id, createdAt: now, updatedAt: now };
        set((s) => ({ aiAdvices: [advice, ...s.aiAdvices] }));
        bgInvalidate(() => dbSaveAIAdvice(advice));
        return id;
      },

      updateAIAdviceStatus: (id, status) => {
        set((s) => ({
          aiAdvices: s.aiAdvices.map((a) =>
            a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a
          ),
        }));
        const updated = get().aiAdvices.find((a) => a.id === id);
        if (updated) bgInvalidate(() => dbSaveAIAdvice(updated));
      },

      addDecodeFeedback: (data) => {
        const now = new Date().toISOString();
        const feedback: DecodeFeedback = { ...data, createdAt: now };
        set((s) => ({
          decodeFeedbacks: [
            ...s.decodeFeedbacks.filter((f) => f.decodeId !== data.decodeId),
            feedback,
          ],
        }));
        bgInvalidate(() => dbSaveDecodeFeedback(feedback));
      },

      // ── Data Import/Export ────────────────────────────────────────

      exportData: () => {
        const s = get();
        return {
          accounts: s.accounts,
          opportunities: s.opportunities,
          intelItems: s.intelItems,
          emailDecodes: s.emailDecodes,
          composedEmails: s.composedEmails,
          knowledgeItems: s.knowledgeItems,
          tasks: s.tasks,
          leads: s.leads,
        };
      },

      importData: (data) => {
        const s = get();
        const existingAccountIds = new Set(s.accounts.map((a) => a.id));
        const existingOppIds = new Set(s.opportunities.map((o) => o.id));
        const existingIntelIds = new Set(s.intelItems.map((i) => i.id));
        const existingDecodeIds = new Set(s.emailDecodes.map((d) => d.id));
        const existingEmailIds = new Set(s.composedEmails.map((e) => e.id));
        const existingTaskIds = new Set(s.tasks.map((t) => t.id));
        const existingKbIds = new Set(s.knowledgeItems.map((k) => k.id));
        const existingLeadIds = new Set(s.leads.map((lead) => lead.id));

        const newAccounts = (data.accounts || []).filter((a) => !existingAccountIds.has(a.id));
        const newOpps = (data.opportunities || []).filter((o) => !existingOppIds.has(o.id));
        const newIntel = (data.intelItems || []).filter((i) => !existingIntelIds.has(i.id));
        const newDecodes = (data.emailDecodes || []).filter((d) => !existingDecodeIds.has(d.id));
        const newEmails = (data.composedEmails || []).filter((e) => !existingEmailIds.has(e.id));
        const newKb = (data.knowledgeItems || []).filter((k) => !existingKbIds.has(k.id));
        const newTasks = (data.tasks || []).filter((t) => !existingTaskIds.has(t.id));
        const newLeads = (data.leads || []).filter((lead) => !existingLeadIds.has(lead.id));

        const mergedLeads = [...s.leads, ...newLeads];
        set({
          accounts: [...s.accounts, ...newAccounts],
          opportunities: [...s.opportunities, ...newOpps],
          intelItems: [...s.intelItems, ...newIntel],
          emailDecodes: [...s.emailDecodes, ...newDecodes],
          composedEmails: [...s.composedEmails, ...newEmails],
          knowledgeItems: [...s.knowledgeItems, ...newKb],
          tasks: [...s.tasks, ...newTasks],
          leads: mergedLeads,
        });
        saveStoredLeads(mergedLeads);

        // Persist new items to Supabase (after set)
        for (const a of newAccounts) bgInvalidate(() => dbSaveAccount(a));
        for (const o of newOpps) bgInvalidate(() => dbSaveOpportunity(o));
        for (const i of newIntel) bgInvalidate(() => dbSaveIntel(i));
        for (const d of newDecodes) bgInvalidate(() => dbSaveDecode(d));
        for (const e of newEmails) bgInvalidate(() => dbSaveComposedEmail(e));
        for (const k of newKb) bgInvalidate(() => dbSaveKnowledge(k));
        for (const t of newTasks) bgInvalidate(() => dbSaveTask(t, { updateAssignee: true }));
      },

      // ── Sample Data ─────────────────────────────────────────────

      loadSampleData: () => {
        // Set all data locally from sample-data.ts
        set({
          accounts: sampleAccounts,
          intelItems: sampleIntelItems,
          emailDecodes: sampleEmailDecodes,
          opportunities: sampleOpportunities,
          knowledgeItems: sampleKnowledgeItems,
          composedEmails: [],
          tasks: sampleTasks,
          leads: loadStoredLeads(),
          aiAdvices: [],
          eventNotifications: [],
        });

        // Persist all sample data to Supabase
        for (const a of sampleAccounts) bgInvalidate(() => dbSaveAccount(a));
        for (const o of sampleOpportunities) bgInvalidate(() => dbSaveOpportunity(o));
        for (const i of sampleIntelItems) bgInvalidate(() => dbSaveIntel(i));
        for (const d of sampleEmailDecodes) bgInvalidate(() => dbSaveDecode(d));
        for (const k of sampleKnowledgeItems) bgInvalidate(() => dbSaveKnowledge(k));
        for (const t of sampleTasks) bgInvalidate(() => dbSaveTask(t, { updateAssignee: true }));
      },

      // ── Dashboard module collapse state ──
      dashboardCollapseState: {},
      setModuleExpanded: (key, expanded) => {
        set((s) => ({
          dashboardCollapseState: { ...s.dashboardCollapseState, [key]: expanded },
        }));
      },
  })
);
