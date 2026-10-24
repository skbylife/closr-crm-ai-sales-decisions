'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Save,
  RotateCcw,
  Loader2,
  Eye,
  EyeOff,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ROLE_LAYOUTS,
  MODULE_LABELS,
  type ModuleConfig,
  type DashboardModuleKey,
  type DashboardRole,
} from '@/lib/dashboard-layout';
import { invalidateOrgDashboardCache } from '@/hooks/use-dashboard-layout';

const ROLE_TABS: { key: DashboardRole; label: string }[] = [
  { key: 'ae', label: 'AE' },
  { key: 'ae-lead', label: 'AE Lead' },
  { key: 'director', label: '经理' },
  { key: 'executive', label: '高管' },
  { key: 'owner', label: '拥有者' },
];

interface OrgConfig {
  role_level: DashboardRole;
  module_configs: ModuleConfig[];
}

export default function DashboardConfigSection() {
  const [activeRole, setActiveRole] = useState<DashboardRole>('ae');
  const [configs, setConfigs] = useState<Map<DashboardRole, ModuleConfig[]>>(new Map());
  const [editing, setEditing] = useState<ModuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load org configs
  const loadConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/organization/dashboard-config');
      if (!res.ok) return;
      const json = await res.json() as { data?: OrgConfig[] };
      const map = new Map<DashboardRole, ModuleConfig[]>();
      if (json.data) {
        for (const row of json.data) {
          map.set(row.role_level, row.module_configs);
        }
      }
      setConfigs(map);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // When activeRole or configs change, populate editing state
  useEffect(() => {
    const override = configs.get(activeRole);
    const base = override ?? ROLE_LAYOUTS[activeRole];
    setEditing([...base].sort((a, b) => a.priority - b.priority));
    setDirty(false);
  }, [activeRole, configs]);

  // ─── Handlers ──────────────────────────────────────────────────────

  function toggleVisible(key: DashboardModuleKey) {
    setEditing((prev) =>
      prev.map((m) => (m.key === key ? { ...m, visible: !m.visible } : m))
    );
    setDirty(true);
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setEditing((prev) => {
      const next = [...prev];
      // Swap priorities
      const tempPrio = next[index].priority;
      next[index] = { ...next[index], priority: next[index - 1].priority };
      next[index - 1] = { ...next[index - 1], priority: tempPrio };
      // Re-sort
      return next.sort((a, b) => a.priority - b.priority);
    });
    setDirty(true);
  }

  function moveDown(index: number) {
    if (index >= editing.length - 1) return;
    setEditing((prev) => {
      const next = [...prev];
      const tempPrio = next[index].priority;
      next[index] = { ...next[index], priority: next[index + 1].priority };
      next[index + 1] = { ...next[index + 1], priority: tempPrio };
      return next.sort((a, b) => a.priority - b.priority);
    });
    setDirty(true);
  }

  function resetToDefault() {
    setEditing([...ROLE_LAYOUTS[activeRole]].sort((a, b) => a.priority - b.priority));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/organization/dashboard-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleLevel: activeRole,
          moduleConfigs: editing,
        }),
      });
      if (res.ok) {
        const updated = new Map(configs);
        updated.set(activeRole, editing);
        setConfigs(updated);
        setDirty(false);
        invalidateOrgDashboardCache();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organization/dashboard-config?roleLevel=${activeRole}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const updated = new Map(configs);
        updated.delete(activeRole);
        setConfigs(updated);
        setDirty(false);
        invalidateOrgDashboardCache();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  const hasOverride = configs.has(activeRole);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">加载视图配置...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-accent" />
          <h3 className="text-base font-semibold text-foreground">仪表盘视图配置</h3>
          {hasOverride && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              已自定义
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={resetToDefault}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-muted/10 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              恢复默认
            </button>
          )}
          {hasOverride && !dirty && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-muted/10 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              删除自定义
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            保存
          </button>
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 border-b border-border px-5 py-2">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveRole(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeRole === tab.key
                ? 'bg-accent/10 text-accent'
                : 'text-muted hover:text-foreground hover:bg-muted/10'
            }`}
          >
            {tab.label}
            {configs.has(tab.key) && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Module list */}
      <div className="divide-y divide-border">
        {editing.map((mod, idx) => (
          <div
            key={mod.key}
            className={`flex items-center gap-3 px-5 py-2.5 transition-colors ${
              mod.visible ? '' : 'opacity-50'
            }`}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted/40 flex-shrink-0" />

            {/* Move buttons */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="rounded p-0.5 text-muted hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === editing.length - 1}
                className="rounded p-0.5 text-muted hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            {/* Module label */}
            <span className="flex-1 text-sm text-foreground">
              {MODULE_LABELS[mod.key] || mod.key}
            </span>

            {/* Priority badge */}
            <span className="text-[10px] tabular-nums text-muted/60">
              P{mod.priority}
            </span>

            {/* Visibility toggle */}
            <button
              onClick={() => toggleVisible(mod.key)}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                mod.visible
                  ? 'bg-positive/10 text-positive'
                  : 'bg-muted/10 text-muted'
              }`}
            >
              {mod.visible ? (
                <>
                  <Eye className="h-3 w-3" /> 显示
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3" /> 隐藏
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 text-[11px] text-muted">
        调整模块顺序和可见性后点击保存。此配置影响该角色的所有用户。
      </div>
    </div>
  );
}
