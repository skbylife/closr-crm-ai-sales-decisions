'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Target, ChevronRight, CheckCircle2, AlertTriangle, Trash2, Play, ListChecks, FileText, Clock } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { STRATEGIC_GOAL_LABELS } from '@/lib/babel-engine/types';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { MOMENTUM_CONFIG } from '@/lib/permissions';
import { StrategicPlayEvidencePanel } from '../strategic-play-evidence-panel';
import { StrategicPlayJudgmentBriefCard } from '@/components/judgment/strategic-play-judgment-brief-card';
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';
import { useLocale } from '@/lib/i18n';
import { patchStrategicPlay, strategicPlayPatchErrorMessage } from './api';
import { PlayGeneratingOverlay, REPLAN_PHASES } from './generating-overlay';
import { GOAL_ICONS, PLAY_STATUS_CONFIG, PLAY_STATUS_LABEL_EN, MOMENTUM_LABEL_EN, tPlay, strategicGoalLabel } from './labels';
import { displayText } from './text';
import { StrategicSignalImpactCard } from './signal-impact';
import { PlayImpactAlert } from './play-impact-alert';
import { PlayAssumptionsPanel } from './play-assumptions-panel';
import { PlayLearningsSection, PlayRelationshipsSection } from './play-collapsible-sections';
import { PlayStepsTimeline } from './play-steps-timeline';
import { PlayReviewSection, PlayReviewForm } from './play-review';
import { TaskAssigneeModal } from './task-assignee-modal';
import { DealPathOverview } from './deal-path';
import { ConfidenceProfilePanel, EvidenceChainView, SituationLayersCard, WinGapsBoard } from './route-plan-panels';
import type {
  StrategicPlay,
  PlayStep,
  PlayStatus,
  PlayAssumption,
  PlayMomentum,
  PlayRelationship,
} from '@/lib/babel-engine/types';
import type {
  StrategicSignalImpactInsight,
} from './signal-impact';
import type {
  StrategicPlayWithRoutePlan,
} from './deal-path';

// ─── Right Panel: Play Detail ───────────────────────────────────────

export function PlayDetail({
  play,
  onRefresh,
  onBack,
  relationships,
  allPlays,
  signalImpactInsight,
}: {
  play: StrategicPlayWithRoutePlan;
  onRefresh: () => void;
  onBack?: () => void; // mobile only
  relationships?: PlayRelationship[];
  allPlays?: StrategicPlayWithRoutePlan[];
  signalImpactInsight?: StrategicSignalImpactInsight | null;
}) {
  const addTask = useStore(s => s.addTask);
  const { orgMembers } = useAuth();
  const { locale } = useLocale();
  const en = locale === 'en';
  const ownerMember = orgMembers.find(m => m.userId === play.userId);
  const ownerName = ownerMember?.displayName || ownerMember?.email?.split('@')[0] || null;
  const [replanningStep, setReplanningStep] = useState<number | null>(null);
  const [replanDoneStep, setReplanDoneStep] = useState<number | null>(null);

  // Assumptions state (shared with replanFromStep, edited inside PlayAssumptionsPanel)
  const [localAssumptions, setLocalAssumptions] = useState<PlayAssumption[]>(play.assumptions ?? []);

  // Deal path open state (forced open by replanFromStep, toggled inside PlayStepsTimeline)
  const [dealPathOpen, setDealPathOpen] = useState(true);
  const playTopRef = useRef<HTMLDivElement | null>(null);

  // Review form visibility (form state lives inside PlayReviewForm)
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Sync assumptions when play changes
  useEffect(() => {
    setLocalAssumptions(play.assumptions ?? []);
  }, [play.assumptions]);

  // Blocked upstream detection
  const blockedUpstream = useMemo(() => {
    if (!relationships || !allPlays) return [];
    const playById = new Map(allPlays.map(p => [p.id, p]));
    return (relationships ?? [])
      .filter(r => r.sourcePlayId === play.id && r.relationship === 'depends_on')
      .map(r => {
        const target = playById.get(r.targetPlayId);
        if (!target) return null;
        if (target.momentum === 'stalled' || target.momentum === 'blocked') {
          return { play: target, daysSince: target.daysSinceProgress ?? 0 };
        }
        return null;
      })
      .filter((x): x is { play: StrategicPlay; daysSince: number } => x !== null);
  }, [play.id, relationships, allPlays]);

  const GoalIcon = GOAL_ICONS[play.goalType] ?? Target;
  const statusConfig = PLAY_STATUS_CONFIG[play.status];
  const completedSteps = play.steps.filter(s => normalizePlayStepExecutionStatus(s.status) === 'done').length;
  const progress = play.steps.length > 0 ? Math.round((completedSteps / play.steps.length) * 100) : 0;
  const routePlan = play.v2?.routePlan;

  const scrollToPlayTop = useCallback(() => {
    requestAnimationFrame(() => {
      playTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const updatePlayStatus = async (status: PlayStatus) => {
    try {
      await patchStrategicPlay(play, { playStatus: status });
      onRefresh();
    } catch (err) {
      toast(strategicPlayPatchErrorMessage(err), 'error');
    }
  };

  const deletePlay = async () => {
    if (!await appConfirm({ message: '确定删除这个谋局计划？', variant: 'danger' })) return;
    try {
      await fetch(`/api/strategic-play?playId=${play.id}`, { method: 'DELETE' });
      onRefresh();
    } catch { /* ignore */ }
  };

  const replanFromStep = async (stepIndex: number) => {
    setDealPathOpen(true);
    scrollToPlayTop();
    setReplanningStep(stepIndex);
    try {
      const previousSteps = play.steps.slice(0, stepIndex + 1).map(s => ({
        index: s.index,
        title: s.title,
        status: s.status,
        actualResult: s.actualResult,
        learning: s.learning,
        newSignals: s.newSignals,
      }));
      const res = await fetch('/api/strategic-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputLocale: locale,
          replanFromStep: {
            playId: play.id,
            stepIndex,
            actualResult: play.steps[stepIndex]?.actualResult,
            previousSteps,
            assumptions: localAssumptions,
            learnings: play.learnings ?? [],
          },
        }),
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) {
          console.error(`[strategic-play] Replan timeout/non-JSON: ${res.status}`);
          toast('重新规划超时，请稍后重试', 'error');
        } else {
          console.error('[strategic-play] Replan returned error:', await res.text());
        }
      } else {
        setReplanDoneStep(stepIndex);
      }
      // Small delay to ensure DB write is committed before refetch
      await new Promise(r => setTimeout(r, 500));
      onRefresh();
      setTimeout(scrollToPlayTop, 150);
    } catch (err) {
      console.error('[strategic-play] Replan failed:', err);
      toast('重新规划失败，请检查网络后重试', 'error');
      await new Promise(r => setTimeout(r, 500));
      onRefresh();
      setTimeout(scrollToPlayTop, 150);
    } finally {
      setReplanningStep(null);
    }
  };

  const [taskCreatedStep, setTaskCreatedStep] = useState<number | null>(null);

  // --- Convert step to task with assignee picker ---
  const [pendingTaskStep, setPendingTaskStep] = useState<PlayStep | null>(null);
  const [taskAssignee, setTaskAssignee] = useState('');

  const convertStepToTask = (step: PlayStep) => {
    // step.who 是 AI 生成的角色描述（如"你（AE）"），不是 userId
    // 默认指派给谋局创建者，用户可在弹窗中改选
    setTaskAssignee(play.userId || '');
    setPendingTaskStep(step);
  };

  const stepArrayIndex = (step: PlayStep) => {
    const exact = play.steps.findIndex((item) => item === step);
    if (exact >= 0) return exact;
    const byIndex = play.steps.findIndex((item) => item.index === step.index && item.title === step.title);
    return byIndex >= 0 ? byIndex : Math.max(0, step.index - 1);
  };

  const assigneeLabel = (userId: string | undefined, fallback?: string) => {
    if (!userId) return fallback;
    const member = orgMembers.find((m) => m.userId === userId);
    return member?.displayName || member?.email || fallback || userId;
  };

  const linkStepToTask = async (step: PlayStep, taskId: string, assigneeId: string | undefined) => {
    const index = stepArrayIndex(step);
    await patchStrategicPlay(play, {
        accountId: play.accountId,
        stepIndex: index,
        executionStatus: normalizePlayStepExecutionStatus(step.status),
        owner: assigneeLabel(assigneeId, step.who),
        assignedToUserId: assigneeId,
        linkedTaskId: taskId,
        executionOwnerSource: 'task',
    });
  };

  const confirmConvertStepToTask = async () => {
    if (!pendingTaskStep) return;
    const step = pendingTaskStep;
    const index = stepArrayIndex(step);
    const assignedTo = taskAssignee.trim() || undefined;
    const playLabel = `谋局:${STRATEGIC_GOAL_LABELS[play.goalType]}`;
    const taskId = addTask({
      accountId: play.accountId,
      opportunityId: play.opportunityId ?? undefined,
      title: `[${playLabel}] ${displayText(step.title)}`,
      description: `${displayText(step.description)}\n\n执行人：${displayText(step.who)}\n目标：${displayText(step.target)}\n行动：${displayText(step.action)}\n目的：${displayText(step.purpose)}${step.rationale ? `\n📖 理论依据：${displayText(step.rationale)}` : ''}\n\n风险：${displayText(step.risk)}\n备选：${displayText(step.fallback)}${step.culturalNote ? `\n文化注意：${displayText(step.culturalNote)}` : ''}`,
      status: 'todo',
      priority: step.index <= 2 ? 'high' : 'medium',
      dueDate: undefined,
      assignedTo,
      labels: [playLabel, `第 ${step.index} 步`],
      source: 'strategic_play',
      sourceId: `${play.id}:step:${index}`,
      aiGenerated: true,
    });
    await linkStepToTask(step, taskId, assignedTo);
    setTaskCreatedStep(step.index);
    setPendingTaskStep(null);
    setTaskAssignee('');
    onRefresh();
    setTimeout(() => setTaskCreatedStep(null), 2000);
  };

  // --- Batch convert all steps ---
  const [showBatchAssignee, setShowBatchAssignee] = useState(false);
  const [batchAssignee, setBatchAssignee] = useState('');

  const convertAllStepsToTasks = () => {
    // 默认指派给谋局创建者
    setBatchAssignee(play.userId || '');
    setShowBatchAssignee(true);
  };

  const confirmBatchConvert = async () => {
    const playLabel = `谋局:${STRATEGIC_GOAL_LABELS[play.goalType]}`;
    let count = 0;
    for (const step of play.steps) {
      if (normalizePlayStepExecutionStatus(step.status) !== 'done') {
        const index = stepArrayIndex(step);
        const assignedTo = batchAssignee.trim() || undefined;
        const taskId = addTask({
          accountId: play.accountId,
          opportunityId: play.opportunityId ?? undefined,
          title: `[${playLabel}] 第 ${step.index} 步：${displayText(step.title)}`,
          description: `${displayText(step.description)}\n\n执行人：${displayText(step.who)}\n目标：${displayText(step.target)}\n行动：${displayText(step.action)}\n目的：${displayText(step.purpose)}${step.rationale ? `\n📖 理论依据：${displayText(step.rationale)}` : ''}\n\n风险：${displayText(step.risk)}\n备选：${displayText(step.fallback)}${step.culturalNote ? `\n文化注意：${displayText(step.culturalNote)}` : ''}`,
          status: 'todo',
          priority: step.index <= 2 ? 'high' : 'medium',
          dueDate: undefined,
          assignedTo,
          labels: [playLabel, `第 ${step.index} 步`, displayText(step.timing)],
          source: 'strategic_play',
          sourceId: `${play.id}:step:${index}`,
          aiGenerated: true,
        });
        await linkStepToTask(step, taskId, assignedTo);
        count++;
      }
    }
    setShowBatchAssignee(false);
    setBatchAssignee('');
    onRefresh();
    toast(`已将 ${count} 个步骤转为任务`, 'success');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {onBack && (
              <button
                onClick={onBack}
                className="mt-1 rounded-lg p-1 text-secondary hover:text-foreground lg:hidden"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <GoalIcon className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">
                  {strategicGoalLabel(play.goalType, en)}
                </p>
                <span className={`inline-flex rounded-md px-2 py-0.5 text-[12px] font-semibold ${statusConfig.style}`}>
                  {en ? (PLAY_STATUS_LABEL_EN[play.status] ?? statusConfig.label) : statusConfig.label}
                </span>
                <span className="text-xs text-secondary">{tPlay(en, '判断可信度', 'Judgment confidence')} {play.confidence}%</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">{displayText(play.goalDescription)}</p>
              {ownerName && (
                <p className="mt-0.5 text-[13px] text-secondary">👤 {tPlay(en, '负责人', 'Owner')}: {ownerName}</p>
              )}
              {/* Momentum + Confidence + Last Activity */}
              {(() => {
                const mc = MOMENTUM_CONFIG[play.momentum as PlayMomentum] ?? MOMENTUM_CONFIG.active;
                const daysSince = play.daysSinceProgress ?? 0;
                const lastActivity = daysSince === 0 ? tPlay(en, '今天', 'today') : tPlay(en, `${daysSince} 天前`, `${daysSince} days ago`);
                return (
                  <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[13px]">
                    <span className={`flex items-center gap-1 font-medium ${mc.color}`}>
                      <span className={`inline-block h-2 w-2 rounded-full ${mc.dotColor}`} />
                      {en ? (MOMENTUM_LABEL_EN[play.momentum as string] ?? mc.label) : mc.label}
                    </span>
                    <span className="text-secondary">{tPlay(en, '判断可信度', 'Judgment confidence')}: {play.confidence}%</span>
                    <span className="flex items-center gap-1 text-muted">
                      <Clock className="h-3 w-3" />
                      {tPlay(en, '最后活动', 'Last activity')}: {lastActivity}
                    </span>
                  </div>
                );
              })()}
              {play.successCriteria && (
                <p className="mt-1 text-[13px] text-secondary">
                  <span className="font-medium text-foreground">{tPlay(en, '成功标准', 'Success criteria')}:</span> {displayText(play.successCriteria)}
                </p>
              )}
              {play.deadline && (() => {
                const days = Math.ceil((new Date(play.deadline).getTime() - Date.now()) / 86400000);
                const urgent = days <= 7;
                return (
                  <p className={`mt-0.5 text-[13px] font-medium ${urgent ? 'text-danger' : 'text-secondary'}`}>
                    {tPlay(en, '截止', 'Due')}: {new Date(play.deadline).toLocaleDateString(en ? 'en-US' : 'zh-CN')}{tPlay(en, `（还剩 ${days} 天）`, ` (${days} days left)`)}
                  </p>
                );
              })()}
              {/* Blocked Upstream Warning */}
              {blockedUpstream.length > 0 && (
                <div className="mt-2 space-y-1">
                  {blockedUpstream.map(({ play: dep, daysSince }) => (
                    <div key={dep.id} className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                      <span className="text-[13px] font-medium text-warning">
                        上游阻塞：{displayText(dep.goalDescription)}（停滞 {daysSince} 天）
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Progress */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 w-32 rounded-full bg-border/50">
                  <div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-[12px] text-secondary">{completedSteps}/{play.steps.length} {tPlay(en, '步骤', 'steps')}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Action buttons */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {play.status === 'active' && (
            <button
              onClick={() => updatePlayStatus('in_progress')}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors"
            >
              <Play className="h-3 w-3" /> {tPlay(en, '开始执行', 'Start')}
            </button>
          )}
          {play.status === 'in_progress' && completedSteps === play.steps.length && play.steps.length > 0 && (
            <button
              onClick={() => updatePlayStatus('completed')}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
            >
              <CheckCircle2 className="h-3 w-3" /> {tPlay(en, '标记完成', 'Mark complete')}
            </button>
          )}
          {play.status === 'in_progress' && completedSteps < play.steps.length && (
            <span className="flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-secondary">
              {tPlay(en, `执行中 · ${completedSteps}/${play.steps.length} 步已完成`, `In progress · ${completedSteps}/${play.steps.length} steps completed`)}
            </span>
          )}
          {(play.status === 'active' || play.status === 'in_progress') && (
            <button
              onClick={convertAllStepsToTasks}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
            >
              <ListChecks className="h-3 w-3" /> {tPlay(en, '全部转为任务', 'Convert all to tasks')}
            </button>
          )}
          {(play.status === 'completed' || play.status === 'abandoned') && !play.review && (
            <button
              onClick={() => setShowReviewForm(true)}
              className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
            >
              <FileText className="h-3 w-3" /> {tPlay(en, '复盘', 'Review')}
            </button>
          )}
          <button
            onClick={deletePlay}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 className="h-3 w-3" /> {tPlay(en, '删除', 'Delete')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div ref={playTopRef} className="scroll-mt-4" />

        {/* ─── Replan Overlay ─── */}
        {replanningStep !== null && (
          <div className="rounded-2xl border border-purple-200 bg-purple-50/30">
            <PlayGeneratingOverlay phases={REPLAN_PHASES} title={tPlay(en, '重新规划中', 'Replanning')} />
          </div>
        )}

        {/* ─── Play Impact Alert ─── */}
        <PlayImpactAlert
          play={play}
          en={en}
          onRefresh={onRefresh}
          replanning={replanningStep !== null}
          onReplanFromStep={replanFromStep}
        />


        {signalImpactInsight ? (
          <StrategicSignalImpactCard insight={signalImpactInsight} accountId={play.accountId} play={play} onRefresh={onRefresh} />
        ) : null}

        <StrategicPlayJudgmentBriefCard
          play={play}
          showJudgmentBrief={false}
        />

        <StrategicPlayEvidencePanel accountId={play.accountId} playId={play.id} />

        {/* ─── Assumptions Panel ─── */}
        <PlayAssumptionsPanel
          play={play}
          en={en}
          localAssumptions={localAssumptions}
          setLocalAssumptions={setLocalAssumptions}
          onRefresh={onRefresh}
          replanning={replanningStep !== null}
          onReplanFromStep={replanFromStep}
        />


        <DealPathOverview play={play} />

        <ConfidenceProfilePanel profile={routePlan?.routeRationale.confidenceProfile} en={en} />

        <SituationLayersCard routePlan={routePlan} en={en} />

        <WinGapsBoard routePlan={routePlan} en={en} />

        <EvidenceChainView routePlan={routePlan} en={en} />

        {/* ─── Learnings Section ─── */}
        <PlayLearningsSection play={play} en={en} />

        {/* ─── Relationships Section ─── */}
        <PlayRelationshipsSection
          play={play}
          relationships={relationships}
          allPlays={allPlays}
          blockedUpstream={blockedUpstream}
        />

        {/* ─── Deal Path Timeline ─── */}
        <PlayStepsTimeline
          play={play}
          en={en}
          onRefresh={onRefresh}
          dealPathOpen={dealPathOpen}
          setDealPathOpen={setDealPathOpen}
          replanningStep={replanningStep}
          replanDoneStep={replanDoneStep}
          onReplanFromStep={replanFromStep}
          taskCreatedStep={taskCreatedStep}
          onConvertStepToTask={convertStepToTask}
        />

        {/* ─── Play Review / In-progress learning ─── */}
        <PlayReviewSection play={play} en={en} />

        {/* Review Form */}
        <PlayReviewForm
          play={play}
          en={en}
          show={showReviewForm}
          onClose={() => setShowReviewForm(false)}
          onRefresh={onRefresh}
        />
      </div>

      {/* Single step → task assignee picker */}
      {pendingTaskStep && (
        <TaskAssigneeModal
          en={en}
          title={tPlay(en, '转为任务', 'Convert to task')}
          subtitle={pendingTaskStep.title}
          subtitleClassName="text-xs text-secondary mb-4 truncate"
          orgMembers={orgMembers}
          assignee={taskAssignee}
          setAssignee={setTaskAssignee}
          onCancel={() => setPendingTaskStep(null)}
          onConfirm={confirmConvertStepToTask}
        />
      )}

      {/* Batch convert assignee picker */}
      {showBatchAssignee && (
        <TaskAssigneeModal
          en={en}
          title={tPlay(en, '全部转为任务', 'Convert all to tasks')}
          subtitle={tPlay(en, '为所有未完成步骤统一指定负责人', 'Assign one owner for all unfinished steps')}
          orgMembers={orgMembers}
          assignee={batchAssignee}
          setAssignee={setBatchAssignee}
          onCancel={() => setShowBatchAssignee(false)}
          onConfirm={confirmBatchConvert}
        />
      )}
    </div>
  );
}
