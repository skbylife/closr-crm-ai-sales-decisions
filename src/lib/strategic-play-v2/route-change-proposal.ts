import type { EvidenceTraceRef } from '@/lib/evidence-provenance';
import type { RouteVersionTriggerKind } from './types';

export interface RouteChangeProposalPlayInput {
  id: string;
  goalDescription?: string | null;
  situationJudgment?: string | null;
  strategicObjective?: string | null;
  steps?: unknown;
  assumptions?: unknown;
  playVersions?: unknown;
}

export interface RouteChangeProposalSignalInput {
  signalStatement: string;
  affectedJudgment: string;
  evidence: string;
  question: string;
  nextMove: string;
  needsReplan: boolean;
  sourceRef?: EvidenceTraceRef;
  triggerKind: RouteVersionTriggerKind;
  now: string;
}

export interface RouteChangeProposal {
  status: 'proposed';
  requiresHumanConfirmation: true;
  triggerKind: RouteVersionTriggerKind;
  triggerSourceRef?: EvidenceTraceRef;
  changedJudgmentIds: string[];
  changedWinGapIds: string[];
  changedMoveIds: string[];
  proposedWinGap: {
    id: string;
    currentState: string;
    desiredState: string;
    evidenceGap: string;
    impact: 'medium' | 'high' | 'critical';
  };
  proposedMoveDelta: {
    moveId: string;
    currentMoveTitle: string;
    proposedNextMove: string;
    expectedJudgmentDelta: string;
    successTest: string;
    failureTest: string;
  };
  proposedVersion: {
    version: number;
    triggerKind: RouteVersionTriggerKind;
    triggerSourceRef?: EvidenceTraceRef;
    changedJudgmentIds: string[];
    changedWinGapIds: string[];
    changedMoveIds: string[];
    diffSummary: string;
    createdAt: string;
  };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    : [];
}

function nextVersion(value: unknown): number {
  const versions = records(value);
  const maxVersion = versions.reduce((max, item) => Math.max(max, Number(item.version) || 0), 0);
  return maxVersion + 1;
}

function firstOpenMove(steps: unknown): { id: string; title: string } {
  const step = records(steps).find((item) => {
    const status = cleanText(item.status).toLowerCase();
    return !['done', 'completed', 'cancelled', 'skipped', 'invalidated'].includes(status);
  }) ?? records(steps)[0];

  const index = Number(step?.index);
  const fallbackId = Number.isFinite(index) && index > 0 ? 'move-' + index : 'move-1';
  return {
    id: cleanText(step?.id) || fallbackId,
    title: cleanText(step?.title) || '当前下一步',
  };
}

function impact(needsReplan: boolean, evidence: string): 'medium' | 'high' | 'critical' {
  if (/否决|暂停|法务|采购|预算|竞品|安全|cfo|critical/i.test(evidence)) return 'critical';
  return needsReplan ? 'high' : 'medium';
}

function slugId(prefix: string, value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return prefix + '-' + (normalized || 'signal');
}

export function buildRouteChangeProposal(params: {
  play: RouteChangeProposalPlayInput;
  signal: RouteChangeProposalSignalInput;
}): RouteChangeProposal {
  const { play, signal } = params;
  const move = firstOpenMove(play.steps);
  const judgmentId = 'judgment-signal-' + play.id;
  const winGapId = slugId('win-gap', signal.affectedJudgment || signal.signalStatement);
  const changedMoveIds = [move.id];
  const changedJudgmentIds = [judgmentId];
  const changedWinGapIds = [winGapId];
  const desiredState = signal.needsReplan
    ? '先确认该信号是否改变原路线，再推进后续步骤'
    : '补齐证据后再决定是否调整当前步骤';
  const failureTest = '如果无法确认「' + signal.question + '」，当前路线必须保持 proposed，不得自动确认关键判断。';
  const diffSummary = '新信号「' + signal.signalStatement + '」影响「' + signal.affectedJudgment + '」，建议把当前步骤从「' + move.title + '」校准为「' + signal.nextMove + '」。';

  return {
    status: 'proposed',
    requiresHumanConfirmation: true,
    triggerKind: signal.triggerKind,
    ...(signal.sourceRef ? { triggerSourceRef: signal.sourceRef } : {}),
    changedJudgmentIds,
    changedWinGapIds,
    changedMoveIds,
    proposedWinGap: {
      id: winGapId,
      currentState: signal.affectedJudgment,
      desiredState,
      evidenceGap: signal.question,
      impact: impact(signal.needsReplan, signal.evidence + ' ' + signal.signalStatement),
    },
    proposedMoveDelta: {
      moveId: move.id,
      currentMoveTitle: move.title,
      proposedNextMove: signal.nextMove,
      expectedJudgmentDelta: signal.affectedJudgment,
      successTest: '确认：' + signal.question,
      failureTest,
    },
    proposedVersion: {
      version: nextVersion(play.playVersions),
      triggerKind: signal.triggerKind,
      ...(signal.sourceRef ? { triggerSourceRef: signal.sourceRef } : {}),
      changedJudgmentIds,
      changedWinGapIds,
      changedMoveIds,
      diffSummary,
      createdAt: signal.now,
    },
  };
}
