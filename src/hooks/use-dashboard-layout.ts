import { useMemo, useState, useEffect } from "react";
import {
  getVisibleModules,
  isModuleAllowed,
  type ModuleConfig,
  type DashboardModuleKey,
  type DashboardRole,
} from "@/lib/dashboard-layout";

// ─── Module-level cache for org overrides ────────────────────────────
// Avoids re-fetching on every re-render; cleared on page navigation.

interface OrgConfigCache {
  orgConfigs: Map<DashboardRole, ModuleConfig[]>;
  fetched: boolean;
  loading: boolean;
  scopeKey: string | null;
}

const cache: OrgConfigCache = {
  orgConfigs: new Map(),
  fetched: false,
  loading: false,
  scopeKey: null,
};

let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const fn of listeners) fn();
}

function resetCache(scopeKey: string | null = cache.scopeKey) {
  cache.orgConfigs.clear();
  cache.fetched = false;
  cache.loading = false;
  cache.scopeKey = scopeKey;
}

async function fetchOrgConfigs(scopeKey: string) {
  if (cache.scopeKey !== scopeKey) {
    resetCache(scopeKey);
  }
  if (cache.fetched || cache.loading) return;
  cache.loading = true;
  try {
    const res = await fetch("/api/organization/dashboard-config");
    if (!res.ok) {
      cache.fetched = true;
      cache.loading = false;
      return;
    }
    const json = await res.json() as {
      data?: Array<{ role_level: DashboardRole; module_configs: ModuleConfig[] }>;
    };
    if (json.data && Array.isArray(json.data)) {
      for (const row of json.data) {
        if (row.module_configs && Array.isArray(row.module_configs) && row.module_configs.length > 0) {
          cache.orgConfigs.set(row.role_level, row.module_configs);
        }
      }
    }
  } catch {
    // silently fall back to defaults
  } finally {
    cache.fetched = true;
    cache.loading = false;
    notifyListeners();
  }
}

/** Force re-fetch (call after admin saves new config) */
export function invalidateOrgDashboardCache() {
  resetCache();
  notifyListeners();
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useDashboardLayout(role: DashboardRole, jobLevel: number = 0, scopeKey = "default") {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    listeners.push(handler);
    fetchOrgConfigs(scopeKey);
    return () => {
      listeners = listeners.filter((fn) => fn !== handler);
    };
  }, [scopeKey]);

  return useMemo(() => {
    // Use org override if available, otherwise fall back to defaults
    const orgOverride = cache.orgConfigs.get(role);
    const raw = orgOverride
      ? orgOverride.filter((m) => m.visible).sort((a, b) => a.priority - b.priority)
      : getVisibleModules(role);

    // Apply module-level permission guard — strip modules the user's jobLevel can't access
    const modules = raw.filter((m) => isModuleAllowed(m.key, jobLevel));

    const lookup = new Map<DashboardModuleKey, ModuleConfig>();
    for (const m of modules) lookup.set(m.key, m);

    return {
      modules,
      isVisible: (key: DashboardModuleKey) => lookup.has(key),
      getConfig: (key: DashboardModuleKey) => lookup.get(key) ?? null,
      hasOrgOverride: orgOverride !== undefined,
    };
  }, [role, jobLevel, cache.fetched]); // eslint-disable-line react-hooks/exhaustive-deps
}
