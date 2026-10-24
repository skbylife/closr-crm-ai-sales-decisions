"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  RotateCcw,

} from "lucide-react";
import { loadPipelineStages, savePipelineStages } from "@/lib/user-settings";
import type { PipelineStage } from "@/lib/user-settings";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/constants";

// ─── Defaults ────────────────────────────────────────────────────────

const COLORS = [
  "#94a3b8", // slate
  "#60a5fa", // blue
  "#22d3ee", // cyan
  "#facc15", // yellow
  "#fb923c", // orange
  "#f87171", // red
  "#a78bfa", // violet
  "#34d399", // emerald
  "#f472b6", // pink
  "#38bdf8", // sky
];

const STORAGE_KEY = "closr-pipeline-stages";

function generateId(): string {
  return "s" + Math.random().toString(36).slice(2, 9);
}

// ─── Component ───────────────────────────────────────────────────────

export default function PipelineConfig() {
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_PIPELINE_STAGES);
  const [saved, setSaved] = useState(false);
  const [editingColorIdx, setEditingColorIdx] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load from Supabase on mount, fallback to localStorage
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const remote = await loadPipelineStages();
        if (!cancelled && remote) { setStages(remote); return; }
      } catch { /* fall through */ }
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PipelineStage[];
          if (!cancelled && Array.isArray(parsed) && parsed.length > 0) {
            setStages(parsed);
          }
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const markChanged = useCallback(() => {
    setHasChanges(true);
    setSaved(false);
  }, []);

  // ─── Stage mutations ────────────────────────────────────────────

  function updateLabel(idx: number, label: string) {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, label } : s)));
    markChanged();
  }

  function updateProbability(idx: number, val: string) {
    const num = Math.max(0, Math.min(100, parseInt(val) || 0));
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, probability: num } : s)));
    markChanged();
  }

  function updateColor(idx: number, color: string) {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, color } : s)));
    setEditingColorIdx(null);
    markChanged();
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setStages((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    markChanged();
  }

  function moveDown(idx: number) {
    setStages((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    markChanged();
  }

  function addStage() {
    const newStage: PipelineStage = {
      id: generateId(),
      key: "custom_" + Date.now(),
      label: "新阶段",
      probability: 50,
      color: COLORS[stages.length % COLORS.length],
    };
    // Insert before closed_won / closed_lost (last two)
    setStages((prev) => {
      const insertIdx = Math.max(0, prev.length - 2);
      const next = [...prev];
      next.splice(insertIdx, 0, newStage);
      return next;
    });
    markChanged();
  }

  function removeStage(idx: number) {
    const stage = stages[idx];
    if (stage.key === "closed_won" || stage.key === "closed_lost") return;
    setStages((prev) => prev.filter((_, i) => i !== idx));
    markChanged();
  }

  async function handleSave() {
    // Save to Supabase (primary) + localStorage (fallback)
    await savePipelineStages(stages);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stages)); } catch { /* ignore */ }
    setSaved(true);
    setHasChanges(false);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleReset() {
    setStages(DEFAULT_PIPELINE_STAGES);
    await savePipelineStages(DEFAULT_PIPELINE_STAGES);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setHasChanges(false);
    setSaved(false);
  }

  const isProtected = (key: string) => key === "closed_won" || key === "closed_lost";

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">销售流程配置</h2>
        <p className="mt-1 text-sm text-secondary">
          自定义销售管线的阶段名称、默认概率和颜色标识。拖拽排序可通过上下箭头调整。
        </p>
      </div>

      {/* Stage list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2.5rem_1fr_5rem_3rem_3.5rem] sm:grid-cols-[2.5rem_1fr_6rem_4rem_4rem] items-center gap-2 border-b border-border bg-sidebar/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
          <span>序</span>
          <span>阶段名称</span>
          <span className="text-center">概率%</span>
          <span className="text-center">颜色</span>
          <span className="text-center">操作</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {stages.map((stage, idx) => {
            const locked = isProtected(stage.key);
            return (
              <div
                key={stage.id}
                className="grid grid-cols-[2.5rem_1fr_5rem_3rem_3.5rem] sm:grid-cols-[2.5rem_1fr_6rem_4rem_4rem] items-center gap-2 px-4 py-3 transition-colors hover:bg-sidebar/30"
              >
                {/* Index + Move buttons */}
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="rounded p-0.5 text-muted hover:text-foreground disabled:opacity-20"
                    title="上移"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <span className="text-[12px] text-muted tabular-nums">{idx + 1}</span>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === stages.length - 1}
                    className="rounded p-0.5 text-muted hover:text-foreground disabled:opacity-20"
                    title="下移"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>

                {/* Label */}
                <input
                  value={stage.label}
                  onChange={(e) => updateLabel(idx, e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-foreground transition-colors focus:border-accent focus:bg-background focus:outline-none"
                  placeholder="阶段名称"
                />

                {/* Probability */}
                <div className="flex items-center justify-center">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={stage.probability}
                    onChange={(e) => updateProbability(idx, e.target.value)}
                    className="w-14 rounded-lg border border-transparent bg-transparent px-1.5 py-1.5 text-center text-sm tabular-nums text-foreground transition-colors focus:border-accent focus:bg-background focus:outline-none"
                  />
                </div>

                {/* Color */}
                <div className="relative flex items-center justify-center">
                  <button
                    onClick={() => setEditingColorIdx(editingColorIdx === idx ? null : idx)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/20 transition-shadow hover:shadow-md hover:border-white/40"
                    style={{ backgroundColor: stage.color }}
                    title="选择颜色"
                  />

                  {editingColorIdx === idx && (
                    <div className="absolute right-0 top-full z-50 mt-1 grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateColor(idx, c)}
                          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                            c === stage.color ? "border-foreground" : "border-transparent"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Delete */}
                <div className="flex items-center justify-center">
                  {locked ? (
                    <span className="text-[12px] text-muted" title="系统保留阶段，不可删除">🔒</span>
                  ) : (
                    <button
                      onClick={() => removeStage(idx)}
                      className="rounded p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      title="删除阶段"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add stage button */}
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={addStage}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-accent transition-colors hover:bg-accent/10"
          >
            <Plus className="h-4 w-4" />
            添加新阶段
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!hasChanges && !saved}
          className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saved ? "✅ 已保存" : "保存配置"}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm text-secondary transition-colors hover:bg-sidebar hover:text-foreground"
        >
          <RotateCcw className="h-4 w-4" />
          重置为默认
        </button>
        {hasChanges && (
          <span className="text-xs text-warning">● 有未保存的更改</span>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">流程预览</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center gap-1.5">
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white"
                style={{ backgroundColor: stage.color }}
              >
                {stage.label}
                <span className="opacity-70">{stage.probability}%</span>
              </div>
              {idx < stages.length - 1 && (
                <span className="text-muted">→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
