// User Settings — Supabase-backed persistence (migrated from localStorage)

import { getSupabase } from '@/lib/supabase';
import { normalizeCurrencyCode, type CurrencyCode } from '@/lib/format-currency';
import type { Locale } from '@/lib/i18n';

export interface NotificationPrefs {
  taskAssigned: boolean;
  decodeComplete: boolean;
  teamChange: boolean;
  inApp: boolean;
}

export interface UserSettings {
  displayName: string;
  email: string;
  roleDescription: string;
  companyDomain: string;
  jobLevel: number;
  currencyCode: CurrencyCode;
  quarterlyTarget: number;
  monthlyTarget: number;
  coverageTarget: number;
  notificationPrefs: NotificationPrefs;
  locale: Locale;
  /** Null until the user explicitly confirms the post-login language choice. */
  languageSelectedAt: string | null;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: '',
  email: '',
  roleDescription: '',
  companyDomain: '',
  jobLevel: 0,
  currencyCode: 'CNY',
  quarterlyTarget: 0,
  monthlyTarget: 0,
  coverageTarget: 3,
  notificationPrefs: { taskAssigned: true, decodeComplete: true, teamChange: true, inApp: true },
  locale: 'zh',
  languageSelectedAt: null,
};

/** Load user settings from Supabase. Returns null if not found or not logged in. */
export async function loadUserSettings(): Promise<UserSettings | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
  if (error || !data) return null;

  return {
    displayName: data.display_name ?? '',
    email: data.email ?? '',
    roleDescription: data.role_description ?? '',
    companyDomain: data.company_domain ?? '',
    jobLevel: data.job_level ?? 0,
    currencyCode: normalizeCurrencyCode(data.currency_code) ?? 'CNY',
    quarterlyTarget: Number(data.quarterly_target) || 0,
    monthlyTarget: Number(data.monthly_target) || 0,
    coverageTarget: Number(data.coverage_target) || 3,
    notificationPrefs: (data.notification_prefs as NotificationPrefs) ?? DEFAULT_USER_SETTINGS.notificationPrefs,
    locale: (data.locale ?? 'zh') as Locale,
    languageSelectedAt: (data.language_selected_at as string | null) ?? null,
  };
}

/** Save (upsert) user settings to Supabase. */
export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  // Map camelCase to snake_case for DB columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: Record<string, any> = { id: user.id, user_id: user.id, updated_at: new Date().toISOString() };
  if (settings.displayName !== undefined) row.display_name = settings.displayName;
  if (settings.email !== undefined) row.email = settings.email;
  if (settings.roleDescription !== undefined) row.role_description = settings.roleDescription;
  if (settings.companyDomain !== undefined) row.company_domain = settings.companyDomain;
  if (settings.jobLevel !== undefined) row.job_level = settings.jobLevel;
  if (settings.currencyCode !== undefined) row.currency_code = settings.currencyCode;
  if (settings.quarterlyTarget !== undefined) row.quarterly_target = settings.quarterlyTarget;
  if (settings.monthlyTarget !== undefined) row.monthly_target = settings.monthlyTarget;
  if (settings.coverageTarget !== undefined) row.coverage_target = settings.coverageTarget;
  if (settings.notificationPrefs !== undefined) row.notification_prefs = settings.notificationPrefs;
  if (settings.locale !== undefined) row.locale = settings.locale;
  if (settings.languageSelectedAt !== undefined) row.language_selected_at = settings.languageSelectedAt;

  await sb.from('user_settings').upsert(row, { onConflict: 'user_id' });
}

/** Migrate settings from localStorage to Supabase (one-time, on first login). */
export function migrateFromLocalStorage(): Partial<UserSettings> {
  if (typeof window === 'undefined') return {};

  const settings: Partial<UserSettings> = {};

  const name = localStorage.getItem('closr-user-name');
  if (name) settings.displayName = name;

  const email = localStorage.getItem('closr-user-email');
  if (email) settings.email = email;

  const role = localStorage.getItem('closr-user-role');
  if (role) settings.roleDescription = role;

  const domain = localStorage.getItem('closr-company-domain');
  if (domain) settings.companyDomain = domain;

  const level = localStorage.getItem('closr-job-level');
  if (level) settings.jobLevel = parseInt(level) || 0;

  // currencyCode is in Zustand persist store
  try {
    const storeStr = localStorage.getItem('closr-store');
    if (storeStr) {
      const parsed = JSON.parse(storeStr);
      const currencyCode = normalizeCurrencyCode(parsed?.state?.currencyCode);
      if (currencyCode) settings.currencyCode = currencyCode;
    }
  } catch { /* ignore parse errors */ }

  const qt = localStorage.getItem('closr-quarterly-target');
  if (qt) settings.quarterlyTarget = Number(qt) || 0;

  const mt = localStorage.getItem('closr-monthly-target');
  if (mt) settings.monthlyTarget = Number(mt) || 0;

  const ct = localStorage.getItem('closr-coverage-target');
  if (ct) settings.coverageTarget = Number(ct) || 0;

  try {
    const notif = localStorage.getItem('closr-notification-prefs');
    if (notif) settings.notificationPrefs = JSON.parse(notif);
  } catch { /* ignore */ }

  const locale = localStorage.getItem('closr-locale');
  if (locale === 'zh' || locale === 'en') settings.locale = locale;

  return settings;
}

// ─── Pipeline Stages ────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  key: string;
  label: string;
  probability: number;
  color: string;
}

/** Load pipeline stages from Supabase user_settings. Returns null if not found. */
export async function loadPipelineStages(): Promise<PipelineStage[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb.from('user_settings').select('pipeline_stages').eq('user_id', user.id).maybeSingle();
  if (error || !data) return null;

  const stages = data.pipeline_stages as PipelineStage[] | null;
  if (!Array.isArray(stages) || stages.length === 0) return null;
  return stages;
}

/** Save pipeline stages to Supabase user_settings. */
export async function savePipelineStages(stages: PipelineStage[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  await sb.from('user_settings').upsert(
    { id: user.id, user_id: user.id, pipeline_stages: stages, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

// ─── Chat History ───────────────────────────────────────────────────

export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  timestamp?: number;
  /** Optional UI scope used to prevent account-specific assistant context from leaking across pages. */
  contextKey?: string;
  accountId?: string;
  accountName?: string;
}

/** Load chat history from Supabase user_settings. Returns null if not found. */
export async function loadChatHistory(): Promise<StoredChatMessage[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb.from('user_settings').select('chat_history').eq('user_id', user.id).maybeSingle();
  if (error || !data) return null;

  const history = data.chat_history as StoredChatMessage[] | null;
  if (!Array.isArray(history) || history.length === 0) return null;
  return history;
}

/** Save chat history to Supabase user_settings (max 50 messages). */
export async function saveChatHistory(messages: StoredChatMessage[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const trimmed = messages.slice(-50);
  await sb.from('user_settings').upsert(
    { id: user.id, user_id: user.id, chat_history: trimmed, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

/** Clean up migrated localStorage keys (call after successful migration). */
export function clearMigratedLocalStorage(): void {
  if (typeof window === 'undefined') return;
  const keys = [
    'closr-user-name',
    'closr-user-email',
    'closr-user-role',
    'closr-company-domain',
    'closr-job-level',
    'closr-quarterly-target',
    'closr-monthly-target',
    'closr-coverage-target',
    'closr-notification-prefs',
    'closr-locale',
  ];
  for (const key of keys) localStorage.removeItem(key);
}
