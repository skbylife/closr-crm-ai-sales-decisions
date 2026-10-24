'use client';

import { useState } from 'react';
import { Target, Plus, Loader2, ChevronRight, ChevronDown, CheckCircle2, Zap, AlertTriangle, X, Play, GitBranch, ListChecks, Sparkles, FileText, MessageSquarePlus, Lightbulb, Clock, Square, CheckSquare } from 'lucide-react';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { toast } from '@/lib/toast-store';
import { patchStrategicPlay, strategicPlayPatchErrorMessage } from './api';
import { STATUS_CONFIG, STATUS_LABEL_EN, tPlay } from './labels';
import { displayText } from './text';
import { PENDING_JUDGMENT_TEXT, buildWhyNow, buildStepInfluence, buildExpectedJudgment, buildFailureLearning, StepEvidenceEntry } from './deal-path';
import type { PlayStep } from '@/lib/babel-engine/types';
import type { StrategicPlayWithRoutePlan } from './deal-path';

// ─── Deal Path Timeline (单局谋划步骤) ───────────────────────────────

export function PlayStepsTimeline({
  play,
  en,
  onRefresh,
  dealPathOpen,
  setDealPathOpen,
  replanningStep,
  replanDoneStep,
  onReplanFromStep,
  taskCreatedStep,
  onConvertStepToTask,
}: {
  play: StrategicPlayWithRoutePlan;
  en: boolean;
  onRefresh: () => void;
  dealPathOpen: boolean;
  setDealPathOpen: (open: boolean) => void;
  replanningStep: number | null;
  replanDoneStep: number | null;
  onReplanFromStep: (stepIndex: number) => void;
  taskCreatedStep: number | null;
  onConvertStepToTask: (step: PlayStep) => void;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [updatingStep, setUpdatingStep] = useState<number | null>(null);
  const [stepHint, setStepHint] = useState<string | null>(null);
  const [recordingStep, setRecordingStep] = useState<number | null>(null);
  const [resultText, setResultText] = useState('');
  const [resultOutcomeAssessment, setResultOutcomeAssessment] = useState<'' | 'matched_expected' | 'partially_matched' | 'missed_expected' | 'blocked' | 'invalidated'>('');
  const [learningText, setLearningText] = useState('');
  const [newSignalsText, setNewSignalsText] = useState('');
  const [savingResult, setSavingResult] = useState(false);

  // Preparation checklist state
  const [newChecklistText, setNewChecklistText] = useState('');
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [prepChecklistOpen, setPrepChecklistOpen] = useState(false);

  const updateStepStatus = async (stepIndex: number, status: PlayStep['status'], extra: Record<string, unknown> = {}) => {
    setUpdatingStep(stepIndex);
    try {
      await patchStrategicPlay(play, { accountId: play.accountId, stepIndex, executionStatus: status, ...extra });
      onRefresh();

      // 步骤完成后显示下一步提示
      if (normalizePlayStepExecutionStatus(status) === 'done') {
        const nextStep = play.steps.find((s, i) => i > stepIndex && normalizePlayStepExecutionStatus(s.status) !== 'done');
        if (nextStep) {
          setStepHint(`✅ 步骤完成！下一步：${nextStep.title}`);
        } else {
          setStepHint('🎉 所有步骤完成！考虑进行谋局 Review。');
        }
        setTimeout(() => setStepHint(null), 5000);
      }
    } catch (err) {
      toast(strategicPlayPatchErrorMessage(err), 'error');
    } finally {
      setUpdatingStep(null);
    }
  };

  // ─── Preparation checklist ───
  const addChecklistItem = async (stepIndex: number) => {
    if (!newChecklistText.trim()) return;
    setSavingChecklist(true);
    try {
      const step = play.steps[stepIndex];
      const checklist = [...(step.preparationChecklist ?? []), { text: newChecklistText.trim(), done: false }];
      await patchStrategicPlay(play, { stepIndex, preparationChecklist: checklist });
      setNewChecklistText('');
      onRefresh();
    } catch (err) {
      console.error('[strategic-play] Add checklist item failed:', err);
      toast(strategicPlayPatchErrorMessage(err), 'error');
    } finally {
      setSavingChecklist(false);
    }
  };

  const toggleChecklistItem = async (stepIndex: number, itemIndex: number) => {
    const step = play.steps[stepIndex];
    const checklist = (step.preparationChecklist ?? []).map((item, idx) =>
      idx === itemIndex ? { ...item, done: !item.done } : item
    );
    try {
      await patchStrategicPlay(play, { stepIndex, preparationChecklist: checklist });
      onRefresh();
    } catch (err) {
      console.error('[strategic-play] Toggle checklist failed:', err);
      toast(strategicPlayPatchErrorMessage(err), 'error');
    }
  };

  // ─── Save step result (enhanced with learning + signals) ───
  const saveStepResult = async (stepIndex: number) => {
    if (!resultText.trim() || !resultOutcomeAssessment) return;
    setSavingResult(true);
    try {
      // Save result through execution writeback so source_records and calibration cannot be bypassed.
      await patchStrategicPlay(play, {
          accountId: play.accountId,
          stepIndex,
          executionStatus: 'done',
          actualResult: resultText.trim(),
          actualOutcome: resultText.trim(),
          outcomeAssessment: resultOutcomeAssessment,
          calibrationNote: learningText.trim() || undefined,
      });

      // Save learning if provided
      if (learningText.trim() || newSignalsText.trim()) {
        await patchStrategicPlay(play, {
            learning: {
              stepIndex,
              learning: learningText.trim(),
              newSignal: newSignalsText.trim() || undefined,
            },
        });
      }

      setRecordingStep(null);
      setResultText('');
      setResultOutcomeAssessment('');
      setLearningText('');
      setNewSignalsText('');
      onRefresh();
    } catch (err) {
      console.error('[strategic-play] Save result failed:', err);
      toast(strategicPlayPatchErrorMessage(err), 'error');
    } finally {
      setSavingResult(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3">
    <button
      type="button"
      onClick={() => setDealPathOpen(!dealPathOpen)}
      className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.045] px-3 py-2.5 text-left transition-colors hover:border-accent/35 hover:bg-accent/[0.075]"
    >
      <div>
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-accent uppercase tracking-wider">{tPlay(en, '单局谋划步骤', 'Opportunity Play Steps')}</h4>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-secondary">{play.steps.length} {tPlay(en, '步', 'steps')}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {tPlay(en, '每一步都是一次判断推进：确认假设、记录反证，并让后续打法可校准。', 'Each step advances a judgment: confirm assumptions, capture counter-evidence, and keep later moves calibratable.')}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm">
        {dealPathOpen ? tPlay(en, '收起步骤', 'Collapse steps') : tPlay(en, '展开步骤', 'Expand steps')}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dealPathOpen ? '' : '-rotate-90'}`} />
      </span>
    </button>
    {dealPathOpen && (
    <div className="relative pr-1">
      {/* Timeline connecting line */}
      <div className="absolute left-[13px] top-4 bottom-4 w-px bg-border" />

      <div className="space-y-1">
        {play.steps.map((step, i) => {
          const normalizedStatus = normalizePlayStepExecutionStatus(step.status);
          const stepStatus = STATUS_CONFIG[normalizedStatus] ?? STATUS_CONFIG.planned;
          const isActive = normalizedStatus === 'in_progress';
          const isCompleted = normalizedStatus === 'done';
          const isBlocked = normalizedStatus === 'blocked';
          const isInvalidated = normalizedStatus === 'invalidated';
          const isRecording = recordingStep === i;
          const isReplanning = replanningStep === i;
          const hasResult = !!(step.actualOutcome || step.actualResult);

          return (
            <div key={i} className="relative pl-8">
              {/* Timeline dot */}
              <div className={`absolute left-0 top-3 flex h-7 w-7 items-center justify-center rounded-full z-10 ${
                isCompleted
                  ? 'bg-positive text-white'
                  : isActive
                  ? 'bg-accent text-white ring-4 ring-accent/20'
                  : isBlocked
                  ? 'bg-warning text-white ring-4 ring-warning/20'
                  : isInvalidated
                  ? 'bg-danger text-white ring-4 ring-danger/20'
                  : step.status === 'skipped'
                  ? 'bg-neutral-400 text-white'
                  : step.aiAdjusted
                  ? 'bg-purple-500 text-white ring-4 ring-purple-200'
                  : 'bg-background border-2 border-border text-secondary'
              }`}>
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-bold">{step.index}</span>
                )}
              </div>

              <div className={`rounded-xl border p-3 transition-colors ${
                isActive
                  ? 'border-accent/30 bg-accent/[0.03] shadow-sm'
                  : step.aiAdjusted && !isCompleted
                  ? 'border-purple-200 bg-purple-50/30 shadow-sm'
                  : 'border-border bg-card hover:border-border/80'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${stepStatus.style}`}>
                        {displayText(step.title)}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isBlocked ? 'bg-warning/10 text-warning' : isInvalidated ? 'bg-danger/10 text-danger' : 'bg-muted/10 text-muted'}`}>
                              {stepStatus.icon} {en ? (STATUS_LABEL_EN[normalizedStatus] ?? stepStatus.label) : stepStatus.label}
                      </span>
                      <span className="text-[12px] text-muted">{displayText(step.timing)}</span>
                      {step.aiAdjusted && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[12px] font-semibold text-purple-700 animate-pulse">
                          <Sparkles className="h-3 w-3" /> {tPlay(en, '已根据反馈调整', 'Adjusted from feedback')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-secondary leading-relaxed">{displayText(step.description)}</p>

                    <div className="mt-2 space-y-2">
                      <section className="rounded-lg border border-accent/20 bg-accent/[0.035] px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                          <Target className="h-3.5 w-3.5" />
                          {tPlay(en, '结论与证据', 'Conclusion & Evidence')}
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-5 text-foreground">{displayText(buildExpectedJudgment(step))}</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-5 text-secondary">{tPlay(en, '证据口径', 'Evidence basis')}: {displayText(buildWhyNow(step))}</p>
                      </section>

                      <div className="grid gap-2 md:grid-cols-2">
                        <section className="rounded-lg border border-border bg-background/60 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary">
                              <Clock className="h-3.5 w-3.5" />
                              {tPlay(en, '正在进行的计划', 'Active plan')}
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isBlocked ? 'bg-warning/10 text-warning' : isInvalidated ? 'bg-danger/10 text-danger' : isCompleted ? 'bg-positive/10 text-positive' : isActive ? 'bg-accent/10 text-accent' : 'bg-muted/10 text-muted'}`}>
                              {en ? (STATUS_LABEL_EN[normalizedStatus] ?? stepStatus.label) : stepStatus.label}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">{displayText(buildStepInfluence(step))}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-muted">{tPlay(en, '细节', 'Details')}: {displayText(step.description || step.purpose || PENDING_JUDGMENT_TEXT)}</p>
                        </section>

                        <section className="rounded-lg border border-warning/20 bg-warning/[0.035] px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-warning">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {tPlay(en, '下一步计划', 'Next-step plan')}
                            </div>
                            <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-warning">
                              {step.nextAction ? tPlay(en, '已定义', 'Defined') : tPlay(en, '待校准', 'Needs calibration')}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground">{displayText(step.nextAction || step.fallback || buildFailureLearning(step))}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-5 text-muted">{tPlay(en, '失败/受阻时', 'If failed/blocked')}: {displayText(buildFailureLearning(step))}</p>
                        </section>
                      </div>

                      <StepEvidenceEntry play={play} step={step} stepIndex={i} />
                    </div>

                    {(step.owner || step.dueDate || step.executionNote || step.actualOutcome || step.nextAction || step.blockerReason) && (
                      <div className="mt-2 rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-[12px] text-secondary space-y-1">
                        <div className="font-semibold text-foreground">{tPlay(en, '执行追踪 · 会写回客户记忆', 'Execution tracking · writes back to account memory')}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {step.owner && <span>{tPlay(en, '负责人', 'Owner')}: {displayText(step.owner)}</span>}
                          {step.linkedTaskId && <span>{tPlay(en, '任务', 'Task')}: {step.linkedTaskId.slice(0, 8)}</span>}
                          {step.dueDate && <span>{tPlay(en, '截止', 'Due')}: {step.dueDate}</span>}
                          {step.startedAt && <span>{tPlay(en, '开始', 'Started')}: {new Date(step.startedAt).toLocaleDateString(en ? 'en-US' : 'zh-CN')}</span>}
                          {step.completedAt && <span>{tPlay(en, '完成', 'Completed')}: {new Date(step.completedAt).toLocaleDateString(en ? 'en-US' : 'zh-CN')}</span>}
                        </div>
                        {step.executionNote && <p>{tPlay(en, '记录', 'Note')}: {displayText(step.executionNote)}</p>}
                        {step.actualOutcome && <p className="text-positive/90">{tPlay(en, '实际产出', 'Actual outcome')}: {displayText(step.actualOutcome)}</p>}
                        {step.nextAction && <p className="text-accent/90">{tPlay(en, '下一步', 'Next')}: {displayText(step.nextAction)}</p>}
                        {step.blockerReason && <p className="text-warning">{tPlay(en, '阻塞原因', 'Blocker')}: {displayText(step.blockerReason)}</p>}
                      </div>
                    )}

                    {(isBlocked || isInvalidated) && (
                      <div className="mt-2 rounded-lg border border-danger/25 bg-danger/[0.05] px-3 py-2 text-xs font-medium text-danger">
                        {tPlay(en, '这一步显示推进实施受阻：需要重新判断局势或调整打法，不建议继续机械推进原步骤。', 'This step is blocked: reassess the situation or adjust the approach before continuing.')}
                      </div>
                    )}

                    {step.culturalNote && (
                      <p className="mt-2 rounded-lg border border-accent/20 bg-accent/[0.03] px-3 py-2 text-[13px] text-accent">🌍 {tPlay(en, '文化注意', 'Cultural note')}: {displayText(step.culturalNote)}</p>
                    )}

                    {/* Preparation Checklist (for in_progress step) */}
                    {isActive && (() => {
                      const checklist = step.preparationChecklist ?? [];
                      const doneCount = checklist.filter(item => item.done).length;
                      return (
                      <div className="mt-3 rounded-lg border border-accent/20 bg-accent/[0.02]">
                        <button
                          onClick={() => setPrepChecklistOpen(!prepChecklistOpen)}
                          className="flex w-full items-center justify-between px-3 py-2 hover:bg-accent/[0.04] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ListChecks className="h-3 w-3 text-accent" />
                            <span className="text-[12px] font-semibold text-accent">准备清单</span>
                            <span className="text-[12px] text-muted">{doneCount}/{checklist.length} 完成</span>
                          </div>
                          <ChevronDown className={`h-3 w-3 text-muted transition-transform ${prepChecklistOpen ? '' : '-rotate-90'}`} />
                        </button>
                        {prepChecklistOpen && (
                        <div className="px-3 pb-2.5">
                        {(step.preparationChecklist ?? []).length > 0 && (
                          <div className="space-y-1 mb-2">
                            {(step.preparationChecklist ?? []).map((item, ci) => (
                              <button
                                key={ci}
                                onClick={() => toggleChecklistItem(i, ci)}
                                className="flex items-center gap-2 w-full text-left group"
                              >
                                {item.done ? (
                                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-positive" />
                                ) : (
                                  <Square className="h-3.5 w-3.5 shrink-0 text-muted group-hover:text-accent" />
                                )}
                                <span className={`text-xs ${item.done ? 'text-muted line-through' : 'text-foreground'}`}>
                                  {displayText(item.text)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center overflow-hidden">
                          <input
                            value={newChecklistText}
                            onChange={(e) => setNewChecklistText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(i)}
                            placeholder="添加准备项..."
                            className="min-w-0 w-full flex-1 rounded border border-border bg-background px-2 py-1 text-[13px] text-foreground placeholder:text-muted"
                          />
                          <button
                            onClick={() => addChecklistItem(i)}
                            disabled={!newChecklistText.trim() || savingChecklist}
                            className="inline-flex shrink-0 w-full sm:w-auto items-center justify-center gap-0.5 rounded border border-border px-2 py-1 text-[12px] font-medium text-secondary hover:text-foreground disabled:opacity-50 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            添加
                          </button>
                        </div>
                        </div>
                        )}
                      </div>
                      );
                    })()}

                    {/* Actual Result Display + Learning + Signals */}
                    {hasResult && !isRecording && (
                      <div className="mt-2 space-y-1.5">
                        <div className="rounded-lg border border-positive/20 bg-positive/5 px-3 py-2">
                          <p className="text-[12px] font-semibold text-positive mb-0.5">{tPlay(en, '实际结果', 'Actual Result')}</p>
                          <p className="text-xs text-foreground">{displayText(step.actualOutcome ?? step.actualResult)}</p>
                        </div>
                        {step.learning && (
                          <div className="flex items-start gap-1.5 px-3">
                            <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-yellow-500" />
                            <div>
                              <span className="text-[12px] font-medium text-yellow-600">{tPlay(en, '学习', 'Learning')}:</span>
                              <span className="text-xs text-foreground ml-1">{displayText(step.learning)}</span>
                            </div>
                          </div>
                        )}
                        {step.newSignals && step.newSignals.length > 0 && (
                          <div className="flex items-start gap-1.5 px-3">
                            <Zap className="h-3 w-3 shrink-0 mt-0.5 text-accent" />
                            <div>
                              <span className="text-[12px] font-medium text-accent">{tPlay(en, '新信号', 'New signal')}:</span>
                              {step.newSignals.map((sig, si) => (
                                <span key={si} className="ml-1 inline-flex rounded bg-accent/10 px-1.5 py-0.5 text-[12px] text-accent">
                                  {displayText(sig)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Record Result Inline (enhanced with learning + signals) */}
                    {isRecording && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={resultText}
                          onChange={(e) => setResultText(e.target.value)}
                          placeholder={tPlay(en, '描述这一步的实际执行结果...', 'Describe the actual result for this step...')}
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none focus:border-accent focus:outline-none"
                          autoFocus
                        />
                        <textarea
                          value={learningText}
                          onChange={(e) => setLearningText(e.target.value)}
                          placeholder={tPlay(en, '这步学到了什么？（可选）', 'What did this step teach us? (optional)')}
                          rows={2}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted resize-none focus:border-accent focus:outline-none"
                        />
                        <select
                          value={resultOutcomeAssessment}
                          onChange={(e) => setResultOutcomeAssessment(e.target.value as typeof resultOutcomeAssessment)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
                        >
                          <option value="">{tPlay(en, '选择这次执行如何校正原判断...', 'Select how this execution calibrates the original judgment...')}</option>
                          <option value="matched_expected">{tPlay(en, '符合预期：原判断得到验证', 'Matched expected: original judgment validated')}</option>
                          <option value="partially_matched">{tPlay(en, '部分符合：需要轻微修正', 'Partially matched: minor correction needed')}</option>
                          <option value="missed_expected">{tPlay(en, '未达预期：原判断偏差明显', 'Missed expected: clear judgment gap')}</option>
                          <option value="blocked">{tPlay(en, '受阻：执行条件或路径有问题', 'Blocked: execution condition or path issue')}</option>
                          <option value="invalidated">{tPlay(en, '已否定：原假设/打法失效', 'Invalidated: assumption or approach failed')}</option>
                        </select>
                        <input
                          value={newSignalsText}
                          onChange={(e) => setNewSignalsText(e.target.value)}
                          placeholder={tPlay(en, '发现了什么意外信息？逗号分隔（可选）', 'Any unexpected information? Separate with commas (optional)')}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => saveStepResult(i)}
                            disabled={!resultText.trim() || !resultOutcomeAssessment || savingResult}
                            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                          >
                            {savingResult ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                            {tPlay(en, '保存结果', 'Save result')}
                          </button>
                          <button
                            onClick={() => { setRecordingStep(null); setResultText(''); setResultOutcomeAssessment(''); setLearningText(''); setNewSignalsText(''); }}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:text-foreground transition-colors"
                          >
                            {tPlay(en, '取消', 'Cancel')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* AI Replan button — only show on the LAST completed step that has a result */}
                    {hasResult && !isRecording && (() => {
                      // Find the index of the last completed step with actualResult
                      const lastCompletedWithResult = play.steps.reduce((last, s, idx) =>
                        (normalizePlayStepExecutionStatus(s.status) === 'done' && (s.actualOutcome || s.actualResult)) ? idx : last, -1);
                      // Also show on the last step before planned ones (transition point)
                      const hasRemainingSteps = i < play.steps.length - 1 && play.steps.slice(i + 1).some(s => normalizePlayStepExecutionStatus(s.status) === 'planned');
                      return i === lastCompletedWithResult && hasRemainingSteps;
                    })() && (
                      <div className="mt-2">
                        {replanDoneStep === i ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-positive/30 bg-positive/5 px-3 py-1.5 text-xs font-medium text-positive">
                            <CheckCircle2 className="h-3 w-3" />
                            {tPlay(en, '已重新规划后续步骤', 'Follow-up steps replanned')}
                          </span>
                        ) : !isReplanning && (
                          <button
                            onClick={() => onReplanFromStep(i)}
                            disabled={replanningStep !== null}
                            className="flex items-center gap-1 rounded-lg border border-purple-300 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
                          >
                            <Sparkles className="h-3 w-3" />
                            {tPlay(en, '重新规划后续步骤', 'Replan follow-up steps')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Step actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {updatingStep === i ? (
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    ) : (
                      <>
                        {normalizedStatus === 'planned' && (
                          <button
                            onClick={() => updateStepStatus(i, 'in_progress')}
                            className="rounded-md p-1.5 text-secondary hover:text-accent hover:bg-accent/10"
                            title={tPlay(en, '开始执行', 'Start')}
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {normalizedStatus === 'in_progress' && (
                          <button
                            onClick={() => {
                              setRecordingStep(i);
                              setResultText(step.actualOutcome ?? step.actualResult ?? '');
                              setResultOutcomeAssessment('');
                            }}
                            className="rounded-md p-1.5 text-secondary hover:text-positive hover:bg-positive/10"
                            title={tPlay(en, '录入结果并标记完成', 'Record result and mark complete')}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {normalizedStatus !== 'done' && normalizedStatus !== 'blocked' && (
                          <button
                            onClick={() => {
                              const blockerReason = window.prompt(tPlay(en, '这一步为什么受阻？（会进入谋局执行记录）', 'Why is this step blocked? (This will be saved to the play execution record)'));
                              if (blockerReason?.trim()) updateStepStatus(i, 'blocked', { blockerReason: blockerReason.trim() });
                            }}
                            className="rounded-md p-1.5 text-secondary hover:text-warning hover:bg-warning/10"
                            title={tPlay(en, '标记受阻', 'Mark blocked')}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {normalizedStatus !== 'done' && normalizedStatus !== 'invalidated' && (
                          <button
                            onClick={() => {
                              const executionNote = window.prompt(tPlay(en, '哪条假设/打法失效了？（建议随后重新判断局势）', 'Which assumption/approach failed? Reassess the situation afterward.'));
                              if (executionNote?.trim()) updateStepStatus(i, 'invalidated', { executionNote: executionNote.trim() });
                            }}
                            className="rounded-md p-1.5 text-secondary hover:text-danger hover:bg-danger/10"
                            title={tPlay(en, '标记打法失效', 'Mark approach invalidated')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!isRecording && (
                          <button
                            onClick={() => { setRecordingStep(i); setResultText(step.actualOutcome ?? step.actualResult ?? ''); setResultOutcomeAssessment(''); }}
                            className="rounded-md p-1.5 text-secondary hover:text-accent hover:bg-accent/10"
                            title={tPlay(en, '录入结果', 'Record result')}
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {taskCreatedStep === step.index ? (
                          <span className="flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-[12px] font-semibold text-white">
                            ✓ {tPlay(en, '已转为任务', 'Converted to task')}
                          </span>
                        ) : (
                          <button
                            onClick={() => onConvertStepToTask(step)}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] font-medium text-secondary hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-colors"
                            title={tPlay(en, '转为任务', 'Convert to task')}
                          >
                            <ListChecks className="h-3 w-3" />
                            {tPlay(en, '转为任务', 'Convert to task')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    )}

    {/* 步骤完成提示 */}
    {stepHint && (
      <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm font-medium text-accent animate-in fade-in slide-in-from-top-1 duration-250">
        {stepHint}
      </div>
    )}

    {/* Alternative Paths */}
    {play.alternativePaths && play.alternativePaths.length > 0 && (
      <div className="mt-6">
        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="flex items-center gap-1.5 text-xs font-medium text-secondary hover:text-foreground transition-colors"
        >
          <GitBranch className="h-3.5 w-3.5" />
          备选路径 ({play.alternativePaths.length})
          {showAlternatives ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {showAlternatives && (
          <div className="mt-3 space-y-3">
            {play.alternativePaths.map((path, pi) => (
              <div key={pi} className="rounded-xl border border-dashed border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">{displayText(path.name)}</p>
                  <span className="text-[12px] text-secondary">{path.confidence}% 置信度</span>
                </div>
                <p className="mt-1 text-[13px] text-muted">{displayText(path.reason)}</p>
                <div className="mt-2 space-y-1">
                  {path.steps.map((step, si) => (
                    <p key={si} className="text-[13px] text-secondary flex items-center gap-1">
                      <span className="font-medium">{si + 1}.</span> {displayText(step.title)}
                      <span className="text-muted">— {displayText(step.timing)}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    </div>
  );
}
