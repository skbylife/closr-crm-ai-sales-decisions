'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { recordAuthAuditEvent } from '@/lib/auth-audit-client';
import { DEMO_USER_ID } from '@/lib/demo';
import { setCurrentDemoUserId } from '@/lib/demo-guard';
import { clearOrgCache, setAuthUserId, setOrgContext } from '@/lib/db';
import { useStore } from '@/lib/store';
import type { OrgRole, OrgMember, UserRoleLevel } from '@/lib/babel-engine/types';

// Demo mode cookie key (also readable from middleware)
export const DEMO_MODE_KEY = 'closr-demo-mode';

// LocalStorage key for persisting demo role override across page refreshes
const DEMO_JOB_LEVEL_KEY = 'closr-demo-job-level';
const AUTH_INIT_TIMEOUT_MS = 8000;

/** Map numeric job_level to UserRoleLevel string */
function jobLevelToTitle(level: number): UserRoleLevel {
  if (level >= 2) return 'executive';
  if (level === 1) return 'director';
  return 'ae';
}

/** Map UserRoleLevel string (including legacy 'manager') to numeric job_level */
function jobTitleToLevel(title: string): number {
  if (title === 'executive' || title === 'admin') return 2;
  if (title === 'director' || title === 'manager') return 1;
  return 0;
}

function readDemoJobLevelOverride(userId: string): number | null {
  if (userId !== DEMO_USER_ID) return null;
  try {
    const savedLevel = localStorage.getItem(DEMO_JOB_LEVEL_KEY);
    if (savedLevel === null) return null;
    const level = Number(savedLevel);
    if (Number.isNaN(level)) return null;
    return Math.max(0, Math.min(2, level));
  } catch {
    return null;
  }
}

function hydrationJobLevelForUser(userId: string, level: number): number {
  // Demo role views must start from the full demo org dataset, then filter in UI.
  // Otherwise AE/manager can hydrate an empty store before the role override applies.
  return userId === DEMO_USER_ID ? 2 : level;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isDemo: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  enterDemo: () => void;
  exitDemo: () => void;
  // Organization
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  orgMembers: OrgMember[];
  jobTitle: UserRoleLevel;
  jobLevel: number; // 0=AE, 1=Director, 2=Executive
  setJobLevel: (level: number) => void;
  needsOnboarding: boolean;
  refreshOrg: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isDemo: false,
  isLoading: true,
  signOut: async () => {},
  enterDemo: () => {},
  exitDemo: () => {},
  orgId: null,
  orgName: null,
  orgRole: null,
  orgMembers: [],
  jobTitle: 'ae',
  jobLevel: 0,
  setJobLevel: () => {},
  needsOnboarding: false,
  refreshOrg: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function hasDemoCookie(): boolean {
  return document.cookie.split(';').some(c => c.trim().startsWith('closr-demo-mode=true'));
}

function clearDemoCookie() {
  document.cookie = 'closr-demo-mode=; path=/; max-age=0';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Organization state
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [jobTitle, setJobTitle] = useState<UserRoleLevel>('ae');
  const [jobLevel, setJobLevelState] = useState(0);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const resetClientTenantState = useCallback(() => {
    clearOrgCache();
    useStore.getState().resetForAuthChange();
  }, []);

  const rehydrateClientTenantState = useCallback(async () => {
    await useStore.getState().hydrate();
  }, []);

  const rehydrateClientTenantStateInBackground = useCallback(() => {
    void rehydrateClientTenantState().catch((e) => {
      console.error('[auth] background hydrate failed:', e);
    });
  }, [rehydrateClientTenantState]);

  const loadOrgInfo = useCallback(async (userId: string) => {
    try {
      const supabase = createClient();
      // Get user's org membership
      const { data: memberships } = await supabase
        .from('org_memberships')
        .select('org_id, role, job_title, team_id, organizations(name)')
        .eq('user_id', userId);

      if (memberships && memberships.length > 0) {
        const membership = memberships[0];
        const oId = membership.org_id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgData = membership.organizations as any;
        const oName = (orgData?.name as string) ?? '';
        const oRole = membership.role as OrgRole;
        setOrgId(oId);
        setOrgName(oName);
        setOrgRole(oRole);
        // 同步 org context 到 db 层（绕过 RLS 查询），含 teamId 让 manager 可见范围正确
        const teamId = (membership as Record<string, unknown>).team_id as string | null;
        // 同步 org context 到 db 层，含 jobLevel 让数据过滤正确
        const memberJobLevel = jobTitleToLevel(((membership as Record<string, unknown>).job_title as string) || 'ae');
        const demoLevel = readDemoJobLevelOverride(userId);
        const effectiveMemberJobLevel = demoLevel ?? memberJobLevel;
        setOrgContext(oId, oRole, teamId, hydrationJobLevelForUser(userId, effectiveMemberJobLevel));
        // 使用 job_title 字段（但不覆盖手动切换的值，如 Demo 职级切换）
        if (!jobLevelOverrideRef.current) {
          const level = demoLevel;
          if (level !== null) {
            jobLevelOverrideRef.current = true;
            setJobLevelState(level);
            setJobTitle(jobLevelToTitle(level));
          }
          if (!jobLevelOverrideRef.current) {
            const title = ((membership as Record<string, unknown>).job_title as UserRoleLevel) || 'ae';
            setJobTitle(title);
            setJobLevelState(jobTitleToLevel(title));
          }
        }
        setNeedsOnboarding(false);

        // Load members + emails in parallel
        const [membersResult, emailResult] = await Promise.all([
          supabase
            .from('org_memberships')
            .select('*')
            .eq('org_id', oId)
            .order('joined_at', { ascending: true }),
          fetch('/api/organization/members?orgId=' + oId)
            .then(r => r.ok ? r.json() : [])
            .catch(() => []),
        ]);

        const members = membersResult.data;
        const emailMap: Record<string, string> = Array.isArray(emailResult)
          ? Object.fromEntries(emailResult.map((e: { userId: string; email: string }) => [e.userId, e.email]))
          : {};

        if (members) {
          setOrgMembers(members.map((r: Record<string, unknown>) => {
            const memberJobTitle = ((r.job_title as UserRoleLevel) || 'ae');
            return {
              id: r.id as string,
              userId: r.user_id as string,
              orgId: r.org_id as string,
              teamId: (r.team_id as string) ?? undefined,
              role: r.role as OrgRole,
              jobTitle: memberJobTitle,
              jobLevel: jobTitleToLevel(memberJobTitle),
              displayName: (r.display_name as string) ?? undefined,
              email: emailMap[r.user_id as string] ?? undefined,
              invitedBy: (r.invited_by as string) ?? undefined,
              joinedAt: r.joined_at as string,
            };
          }));
        }
      } else {
        // No org — needs onboarding (but not for demo user)
        setOrgId(null);
        setOrgName(null);
        setOrgRole(null);
        setJobTitle('ae');
        setJobLevelState(0);
        setOrgMembers([]);
        setNeedsOnboarding(userId !== DEMO_USER_ID);
      }
    } catch (e) {
      console.error('[auth] loadOrgInfo failed:', e);
      setNeedsOnboarding(true);
    }
  }, []);

  const refreshOrg = useCallback(async () => {
    if (user?.id) {
      await loadOrgInfo(user.id);
    }
  }, [user, loadOrgInfo]);

  // Track current user ID to detect same-user re-auth (tab switch)
  const currentUserIdRef = useRef<string | null>(null);

  // Track manual override to prevent DB from overwriting demo role switch
  const jobLevelOverrideRef = useRef(false);

  const setJobLevel = useCallback((level: number) => {
    // eslint-disable-next-line react-hooks/immutability
    jobLevelOverrideRef.current = true;
    setJobLevelState(level);
    setJobTitle(jobLevelToTitle(level));
    // Persist demo role choice to localStorage so it survives page refresh
    try { localStorage.setItem(DEMO_JOB_LEVEL_KEY, String(level)); } catch {}
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Get initial session
    withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS, 'auth.getSession').then(async ({ data: { session: s }, error }) => {
      if (!mounted) return;
      if (error) {
        console.warn('[auth] getSession error:', error.message);
        // Invalid refresh token — clear state and let user re-login
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }
      setSession(s);
      setUser(s?.user ?? null);
      setCurrentDemoUserId(s?.user?.id ?? null);
      setAuthUserId(s?.user?.id ?? null);
      currentUserIdRef.current = s?.user?.id ?? null;
      // Detect demo mode: user is the demo user AND cookie is set
      if (s?.user?.id === DEMO_USER_ID && hasDemoCookie()) {
        setIsDemo(true);
      }
      resetClientTenantState();
      // Load org info before hydrating so role-aware data queries use the right scope.
      if (s?.user?.id) {
        await loadOrgInfo(s.user.id);
        const level = readDemoJobLevelOverride(s.user.id);
        if (level !== null) {
          jobLevelOverrideRef.current = true;
          setJobLevelState(level);
          setJobTitle(jobLevelToTitle(level));
          useStore.getState().setJobLevel(level);
        }
      }
      rehydrateClientTenantStateInBackground();
      setIsLoading(false);
    }).catch((error) => {
      if (!mounted) return;
      console.warn('[auth] initial session unavailable:', error instanceof Error ? error.message : error);
      setSession(null);
      setUser(null);
      setCurrentDemoUserId(null);
      setAuthUserId(null);
      currentUserIdRef.current = null;
      resetClientTenantState();
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // INITIAL_SESSION fires when the listener is first set up — already handled
      // by getSession() above, so skip to avoid a double reset + skeleton flash.
      if (event === 'INITIAL_SESSION') return;

      // Handle token refresh failure — sign out gracefully
      if (event === 'TOKEN_REFRESHED' && !s) {
        console.warn('[auth] token refresh failed, signing out');
        supabase.auth.signOut();
        return;
      }

      // Token refresh with same user — just update session, skip full reload
      if (event === 'TOKEN_REFRESHED' && s) {
        setSession(s);
        return;
      }

      // Same user re-authenticated (e.g. tab switch auto-refresh) — just update session, no reset
      if (event === 'SIGNED_IN' && s?.user?.id && s.user.id === currentUserIdRef.current) {
        setSession(s);
        return;
      }

      // Real auth change (SIGNED_IN with different/new user, SIGNED_OUT, USER_UPDATED)
      void (async () => {
        setSession(s);
        setUser(s?.user ?? null);
        setCurrentDemoUserId(s?.user?.id ?? null);
        setAuthUserId(s?.user?.id ?? null);
        currentUserIdRef.current = s?.user?.id ?? null;
        if (s?.user?.id === DEMO_USER_ID && hasDemoCookie()) {
          setIsDemo(true);
        } else {
          setIsDemo(false);
        }
        resetClientTenantState();
        if (s?.user?.id) {
          await loadOrgInfo(s.user.id);
        } else {
          setOrgId(null);
          setOrgName(null);
          setOrgRole(null);
          setJobTitle('ae');
          setJobLevelState(0);
          setOrgMembers([]);
          setNeedsOnboarding(false);
        }
        rehydrateClientTenantStateInBackground();
        if (s?.user?.id) {
          const level = readDemoJobLevelOverride(s.user.id);
          if (level !== null) {
            jobLevelOverrideRef.current = true;
            setJobLevelState(level);
            setJobTitle(jobLevelToTitle(level));
            useStore.getState().setJobLevel(level);
          }
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadOrgInfo, rehydrateClientTenantStateInBackground, resetClientTenantState]);

  const signOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await recordAuthAuditEvent('logout', { email: user?.email ?? undefined });
      await supabase.auth.signOut();
      resetClientTenantState();
      await rehydrateClientTenantState();
    } catch (e) {
      console.warn('[auth] signOut error (proceeding to redirect):', e);
    }
    setUser(null);
    setSession(null);
    clearDemoCookie();
    setIsDemo(false);
    setOrgId(null);
    setOrgName(null);
    setOrgRole(null);
    setJobTitle('ae');
    setJobLevelState(0);
    setOrgMembers([]);
    setNeedsOnboarding(false);
    window.location.href = '/login';
  }, [rehydrateClientTenantState, resetClientTenantState, user?.email]);

  const enterDemo = useCallback(() => {
    // enterDemo is now handled via Supabase signIn in the login page
    // This is kept for backward compatibility but shouldn't be called directly
    document.cookie = 'closr-demo-mode=true; path=/; max-age=86400';
    setIsDemo(true);
    setIsLoading(false);
  }, []);

  const exitDemo = useCallback(async () => {
    const supabase = createClient();
    await recordAuthAuditEvent('logout', { email: user?.email ?? 'example-c39293aa15@example.invalid', metadata: { demo: true } });
    await supabase.auth.signOut();
    resetClientTenantState();
    clearDemoCookie();
    setIsDemo(false);
    setUser(null);
    setSession(null);
    // Clear demo localStorage data
    localStorage.removeItem('closr-store');
    localStorage.removeItem(DEMO_JOB_LEVEL_KEY);
    window.location.href = '/login';
  }, [resetClientTenantState, user?.email]);

  return (
    <AuthContext.Provider value={{
      user, session, isDemo, isLoading, signOut, enterDemo, exitDemo,
      orgId, orgName, orgRole, orgMembers, jobTitle, jobLevel, setJobLevel, needsOnboarding, refreshOrg,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
