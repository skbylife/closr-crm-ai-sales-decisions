'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, ChevronDown, X, RotateCcw, Eye, Edit3 } from 'lucide-react';
import { genId } from '@/lib/gen-id';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { toast } from '@/lib/toast-store';
import { patchStrategicPlay, strategicPlayPatchErrorMessage } from './api';
import { tPlay } from './labels';
import { displayText } from './text';
import type { PlayAssumption } from '@/lib/babel-engine/types';
import type { StrategicPlayWithRoutePlan } from './deal-path';

// ─── Assumptions Panel ──────────────────────────────────────────────

export function PlayAssumptionsPanel({
  play,
  en,
  localAssumptions,
  setLocalAssumptions,
  onRefresh,
  replanning,
  onReplanFromStep,
}: {
  play: StrategicPlayWithRoutePlan;
  en: boolean;
  localAssumptions: PlayAssumption[];
  setLocalAssumptions: (assumptions: PlayAssumption[]) => void;
  onRefresh: () => void;
  replanning: boolean;
  onReplanFromStep: (stepIndex: number) => void;
}) {
  const [editingAssumptions, setEditingAssumptions] = useState(false);
  const [newAssumptionText, setNewAssumptionText] = useState('');
  const [savingAssumptions, setSavingAssumptions] = useState(false);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // Auto-expand on important signals
  const hasInvalidatedAssumption = localAssumptions.some(a => a.status === 'invalidated');

  useEffect(() => {
    if (hasInvalidatedAssumption) setAssumptionsOpen(true);
  }, [hasInvalidatedAssumption]);

  const saveAssumptions = async (updated: PlayAssumption[]) => {
    setSavingAssumptions(true);
    try {
      await patchStrategicPlay(play, { assumptions: updated });
      setLocalAssumptions(updated);
      onRefresh();
    } catch (err) {
      console.error('[strategic-play] Save assumptions failed:', err);
      toast(strategicPlayPatchErrorMessage(err), 'error');
    } finally {
      setSavingAssumptions(false);
    }
  };

  const toggleAssumptionStatus = (id: string) => {
    const updated = localAssumptions.map(a => {
      if (a.id !== id) return a;
      const nextStatus = a.status === 'pending' ? 'verified'
        : a.status === 'verified' ? 'invalidated' : 'pending';
      return { ...a, status: nextStatus as PlayAssumption['status'], updatedAt: new Date().toISOString() };
    });
    saveAssumptions(updated);
  };

  const addPlayAssumption = () => {
    if (!newAssumptionText.trim()) return;
    const updated: PlayAssumption[] = [...localAssumptions, {
      id: genId(),
      text: newAssumptionText.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }];
    setNewAssumptionText('');
    saveAssumptions(updated);
  };

  const removePlayAssumption = (id: string) => {
    saveAssumptions(localAssumptions.filter(a => a.id !== id));
  };

  const updateAssumptionField = (id: string, field: 'evidence' | 'impact', value: string) => {
    const updated = localAssumptions.map(a =>
      a.id === id ? { ...a, [field]: value, updatedAt: new Date().toISOString() } : a
    );
    setLocalAssumptions(updated);
  };

  const saveAssumptionEdits = () => {
    setEditingAssumptions(false);
    saveAssumptions(localAssumptions);
  };

  if (play.status !== 'active' && play.status !== 'in_progress') return null;

  const verifiedCount = localAssumptions.filter(a => a.status === 'verified').length;
  const invalidatedCount = localAssumptions.filter(a => a.status === 'invalidated').length;
  const summaryParts = [tPlay(en, `${localAssumptions.length} 项`, `${localAssumptions.length} items`)];
  if (verifiedCount > 0) summaryParts.push(tPlay(en, `${verifiedCount} 已验证`, `${verifiedCount} verified`));
  if (invalidatedCount > 0) summaryParts.push(tPlay(en, `${invalidatedCount} 已否定`, `${invalidatedCount} invalidated`));

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setAssumptionsOpen(!assumptionsOpen)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-sidebar/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-secondary" />
          <span className="text-sm font-semibold text-foreground">{tPlay(en, '关键假设', 'Key assumptions')}</span>
          <span className="text-xs text-muted">{summaryParts.length > 1 ? `${summaryParts[0]}（${summaryParts.slice(1).join(', ')}）` : summaryParts[0]}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.06] px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/[0.1]">
          {assumptionsOpen ? tPlay(en, '折叠', 'Collapse') : tPlay(en, '展开', 'Expand')}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${assumptionsOpen ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {assumptionsOpen && (
      <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] text-muted leading-relaxed">
          {tPlay(en, '每个谋局方案背后都有尚未验证的前提。把它们写下来，在推进中逐一验证或否定 — 假设被否定时，是重新规划的最佳时机。', 'Every play rests on assumptions that still need validation. Capture them here, then verify or invalidate them during execution. When an assumption breaks, it is the right moment to replan.')}
        </p>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {editingAssumptions ? (
            <button
              onClick={saveAssumptionEdits}
              disabled={savingAssumptions}
              className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {savingAssumptions ? <Loader2 className="h-3 w-3 animate-spin" /> : tPlay(en, '保存', 'Save')}
            </button>
          ) : (
            <button
              onClick={() => setEditingAssumptions(true)}
              className="rounded-md p-1 text-muted hover:text-foreground"
              title={tPlay(en, '编辑假设', 'Edit assumptions')}
            >
              <Edit3 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {localAssumptions.length === 0 ? (
        <p className="text-xs text-muted">{tPlay(en, '暂无假设', 'No assumptions yet')}</p>
      ) : (
        <div className="max-h-[400px] overflow-y-auto space-y-2">
          {localAssumptions.map((a) => {
            const statusIcon = a.status === 'verified' ? '✓' : a.status === 'invalidated' ? '✗' : '?';
            const statusColor = a.status === 'verified' ? 'text-positive' : a.status === 'invalidated' ? 'text-danger' : 'text-warning';
            return (
              <div key={a.id} className="group">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggleAssumptionStatus(a.id)}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold transition-colors hover:bg-background ${statusColor}`}
                    title={tPlay(en, '点击切换状态: 待验证 → 已验证 → 已否定', 'Click to cycle status: pending -> verified -> invalidated')}
                  >
                    {statusIcon}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-foreground">{displayText(a.text)}</span>
                    {a.evidence && (
                      <span className="text-[12px] text-muted ml-1">— {displayText(a.evidence)}</span>
                    )}
                    {a.status === 'invalidated' && a.impact && (
                      <p className="mt-0.5 text-[12px] text-danger/80">{tPlay(en, '→ 影响：', 'Impact: ')}{displayText(a.impact)}</p>
                    )}
                  </div>
                  {editingAssumptions && (
                    <button
                      onClick={() => removePlayAssumption(a.id)}
                      className="shrink-0 rounded p-0.5 text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {/* Inline editing for evidence/impact */}
                {editingAssumptions && (
                  <div className="ml-7 mt-1.5 flex gap-2">
                    <input
                      value={a.evidence ?? ''}
                      onChange={(e) => updateAssumptionField(a.id, 'evidence', e.target.value)}
                      placeholder={tPlay(en, '证据...', 'Evidence...')}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground placeholder:text-muted"
                    />
                    <input
                      value={a.impact ?? ''}
                      onChange={(e) => updateAssumptionField(a.id, 'impact', e.target.value)}
                      placeholder={tPlay(en, '影响...', 'Impact...')}
                      className="flex-1 rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground placeholder:text-muted"
                    />
                  </div>
                )}
                {/* Prompt to replan when invalidated */}
                {a.status === 'invalidated' && !editingAssumptions && (
                  <div className="ml-7 mt-1">
                    <button
                      onClick={() => {
                        const lastCompleted = play.steps.findLastIndex(s => normalizePlayStepExecutionStatus(s.status) === 'done');
                        onReplanFromStep(lastCompleted >= 0 ? lastCompleted : 0);
                      }}
                      disabled={replanning}
                      className="flex items-center gap-1 rounded border border-warning/30 bg-warning/5 px-2 py-0.5 text-[12px] font-medium text-warning hover:bg-warning/10 disabled:opacity-50 transition-colors"
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                      {tPlay(en, '是否需要重新规划？', 'Replan?')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add new assumption */}
      <div className="mt-3 flex gap-2">
        <input
          value={newAssumptionText}
          onChange={(e) => setNewAssumptionText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPlayAssumption()}
          placeholder={tPlay(en, '添加假设...', 'Add assumption...')}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted"
        />
        <button
          onClick={addPlayAssumption}
          disabled={!newAssumptionText.trim() || savingAssumptions}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-secondary hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {tPlay(en, '添加', 'Add')}
        </button>
      </div>
    </div>
    )}
    </div>
  );
}
