'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X, RotateCcw, Sparkles } from 'lucide-react';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';
import { patchStrategicPlay } from './api';
import { tPlay } from './labels';
import { displayText } from './text';
import { PENDING_JUDGMENT_TEXT } from './deal-path';
import type {
  StrategicPlayWithRoutePlan,
  RouteChangeProposalForUi,
} from './deal-path';

// ─── Play Impact Alert ──────────────────────────────────────────────

interface ImpactAlertData {
  reason: string;
  signalStatement?: string;
  affectedJudgment?: string;
  evidence?: string;
  question?: string;
  nextMove?: string;
  affectedAssumptions: string[];
  suggestedAction: 'replan' | 'verify_assumption' | 'no_action';
  needsReplan: boolean;
  timestamp: string;
  routeChangeProposal?: RouteChangeProposalForUi;
}

export function PlayImpactAlert({
  play,
  en,
  onRefresh,
  replanning,
  onReplanFromStep,
}: {
  play: StrategicPlayWithRoutePlan;
  en: boolean;
  onRefresh: () => void;
  replanning: boolean;
  onReplanFromStep: (stepIndex: number) => void;
}) {
  const [impactAlert, setImpactAlert] = useState<ImpactAlertData | null>(null);
  const [dismissingAlert, setDismissingAlert] = useState(false);
  const [applyingRouteProposal, setApplyingRouteProposal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAlert = async () => {
      try {
        const res = await fetch(
          `/api/ai-insights?entityType=strategic_play&entityId=${play.id}&insightType=play_impact_alert`
        );
        if (!res.ok) return;
        const json = await res.json();
        const alerts = json.insights as { data: Record<string, unknown> }[];
        if (alerts && alerts.length > 0) {
          const data = alerts[0].data;
          if (data.impacted && !data.dismissed) {
            if (!cancelled) {
              setImpactAlert({
                reason: data.reason as string,
                signalStatement: typeof data.signalStatement === 'string' ? data.signalStatement : undefined,
                affectedJudgment: typeof data.affectedJudgment === 'string' ? data.affectedJudgment : undefined,
                evidence: typeof data.evidence === 'string' ? data.evidence : undefined,
                question: typeof data.question === 'string' ? data.question : undefined,
                nextMove: typeof data.nextMove === 'string' ? data.nextMove : undefined,
                affectedAssumptions: Array.isArray(data.affectedAssumptions)
                  ? data.affectedAssumptions.filter((item): item is string => typeof item === 'string')
                  : [],
                suggestedAction: data.suggestedAction as 'replan' | 'verify_assumption' | 'no_action',
                needsReplan: !!data.needs_replan,
                timestamp: data.timestamp as string,
                routeChangeProposal: typeof data.routeChangeProposal === 'object' && data.routeChangeProposal !== null
                  ? data.routeChangeProposal as RouteChangeProposalForUi
                  : undefined,
              });
            }
          } else {
            if (!cancelled) setImpactAlert(null);
          }
        } else {
          if (!cancelled) setImpactAlert(null);
        }
      } catch { /* ignore */ }
    };
    fetchAlert();
    return () => { cancelled = true; };
  }, [play.id]);

  const dismissImpactAlert = async () => {
    setDismissingAlert(true);
    try {
      await fetch('/api/ai-insights', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'strategic_play',
          entityId: play.id,
          insightType: 'play_impact_alert',
          patch: { dismissed: true },
        }),
      });
      setImpactAlert(null);
    } catch { /* ignore */ }
    finally { setDismissingAlert(false); }
  };

  const applyRouteChangeProposal = async () => {
    const proposal = impactAlert?.routeChangeProposal;
    const proposedWinGap = proposal?.proposedWinGap;
    const proposedVersion = proposal?.proposedVersion;
    if (!proposal || !proposedWinGap || !proposedVersion) return;

    const confirmed = await appConfirm({
      title: tPlay(en, '接受路线调整', 'Accept route adjustment'),
      message: tPlay(
        en,
        '这会把该信号写入当前谋局路线：新增/更新赢单缺口、下一验证点和路线版本记录。关键判断仍保持待验证，不会自动确认。',
        'This will write the signal into the current route: win gap, next verification point, and route version. Key judgments remain unconfirmed.',
      ),
      confirmLabel: tPlay(en, '接受调整', 'Accept adjustment'),
      cancelLabel: tPlay(en, '取消', 'Cancel'),
      variant: 'warning',
    });
    if (!confirmed) return;

    setApplyingRouteProposal(true);
    try {
      const existingGaps = play.v2?.routePlan?.winGaps ?? [];
      const gapId = proposedWinGap.id ?? 'win-gap-proposed';
      const nextWinGaps = [
        ...existingGaps.filter((gap) => gap.id !== gapId),
        {
          id: gapId,
          dimension: 'progress',
          currentState: proposedWinGap.currentState ?? impactAlert?.affectedJudgment ?? PENDING_JUDGMENT_TEXT,
          desiredState: proposedWinGap.desiredState ?? impactAlert?.nextMove ?? PENDING_JUDGMENT_TEXT,
          impact: proposedWinGap.impact ?? (impactAlert?.needsReplan ? 'high' : 'medium'),
          evidenceGap: proposedWinGap.evidenceGap ?? impactAlert?.question ?? PENDING_JUDGMENT_TEXT,
          linkedJudgmentIds: proposedVersion.changedJudgmentIds ?? [],
          status: 'open',
        },
      ];

      const existingVersions = play.v2?.routePlan?.whatChanged ?? [];
      const versionNumber = proposedVersion.version ?? existingVersions.length + 1;
      const nextVersions = [
        ...existingVersions.filter((version) => version.version !== versionNumber),
        {
          version: versionNumber,
          triggerKind: proposedVersion.triggerKind ?? 'decode_signal',
          triggerSourceRef: proposedVersion.triggerSourceRef,
          changedJudgmentIds: proposedVersion.changedJudgmentIds ?? [],
          changedWinGapIds: proposedVersion.changedWinGapIds ?? (proposedWinGap.id ? [proposedWinGap.id] : []),
          changedMoveIds: proposedVersion.changedMoveIds ?? [],
          diffSummary: proposedVersion.diffSummary ?? impactAlert?.reason ?? '路线已根据新信号调整。',
          createdAt: proposedVersion.createdAt ?? new Date().toISOString(),
        },
      ];

      await patchStrategicPlay(play, {
        routeState: {
          winGaps: nextWinGaps,
          nextVerificationPoint: proposal.proposedMoveDelta?.successTest ?? impactAlert?.question ?? null,
          playVersions: nextVersions,
        },
      });
      await dismissImpactAlert();
      toast(tPlay(en, '已接受路线调整，谋局路线已更新', 'Route adjustment accepted'), 'success');
      onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : tPlay(en, '路线调整写入失败，请刷新后重试', 'Failed to apply route adjustment');
      toast(message, 'error');
    } finally {
      setApplyingRouteProposal(false);
    }
  };

  if (!impactAlert) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            {impactAlert.needsReplan ? tPlay(en, '需要重新计划谋局', 'This play may need replanning') : tPlay(en, '新的客户沟通可能影响此谋局', 'New customer communication may affect this play')}
          </p>
          <p className="mt-1 text-xs text-amber-800">{displayText(impactAlert.reason)}</p>
          {(impactAlert.signalStatement || impactAlert.affectedJudgment || impactAlert.evidence || impactAlert.question || impactAlert.nextMove) && (
            <div className="mt-3 grid gap-2 text-xs leading-5 text-amber-900 md:grid-cols-2">
              {impactAlert.signalStatement ? (
                <p><span className="font-semibold">{tPlay(en, '这条信号说明：', 'Signal: ')}</span>{displayText(impactAlert.signalStatement)}</p>
              ) : null}
              {impactAlert.affectedJudgment ? (
                <p><span className="font-semibold">{tPlay(en, '它影响的判断：', 'Affected judgment: ')}</span>{displayText(impactAlert.affectedJudgment)}</p>
              ) : null}
              {impactAlert.evidence ? (
                <p><span className="font-semibold">{tPlay(en, '证据/来源：', 'Source: ')}</span>{displayText(impactAlert.evidence)}</p>
              ) : null}
              {impactAlert.question ? (
                <p><span className="font-semibold">{tPlay(en, '还没搞清楚：', 'Unresolved: ')}</span>{displayText(impactAlert.question)}</p>
              ) : null}
              {impactAlert.nextMove ? (
                <p className="md:col-span-2"><span className="font-semibold">{tPlay(en, '下一步打法：', 'Next move: ')}</span>{displayText(impactAlert.nextMove)}</p>
              ) : null}
            </div>
          )}
          {impactAlert.affectedAssumptions.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-amber-800">{tPlay(en, '受影响的假设：', 'Affected assumptions:')}</p>
              <ul className="mt-1 space-y-0.5">
                {impactAlert.affectedAssumptions.map((a, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                    {displayText(a)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {impactAlert.routeChangeProposal ? (
              <button
                onClick={applyRouteChangeProposal}
                disabled={applyingRouteProposal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {applyingRouteProposal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {applyingRouteProposal ? tPlay(en, '写入中…', 'Applying...') : tPlay(en, '接受路线调整', 'Accept route adjustment')}
              </button>
            ) : null}
            <button
              onClick={() => {
                const lastCompleted = play.steps.reduce((max, s, i) => normalizePlayStepExecutionStatus(s.status) === 'done' ? i : max, -1);
                onReplanFromStep(lastCompleted >= 0 ? lastCompleted : 0);
                dismissImpactAlert();
              }}
              disabled={replanning}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
                impactAlert.needsReplan
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {impactAlert.needsReplan ? (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {tPlay(en, '重新计划谋局', 'Replan play')}
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {tPlay(en, '重新规划', 'Replan')}
                </>
              )}
            </button>
            <button
              onClick={dismissImpactAlert}
              disabled={dismissingAlert}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-card px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              {tPlay(en, '忽略', 'Dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
