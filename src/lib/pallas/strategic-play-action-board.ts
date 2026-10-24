import type { PlayStep, StrategicPlay } from '@/lib/babel-engine/types';
import type { PendingAction } from '@/components/chat/ConfirmationCard';
import type {
  PallasArtifactKind,
  PallasEntityContext,
  PallasJson,
  PallasProposedAction,
  PallasSourceRef,
} from './types';
import { isPallasPreviewGateValue } from './api';
import { toPallasProposedActions } from './proposals';

export type PallasStrategicPlayActionItem = {
  stepIndex: number;
  title: string;
  description: string;
  owner: string | null;
  target: string | null;
  action: string | null;
  timing: string | null;
  status: string;
  dueDate: string | null;
  priority: 'high' | 'medium' | 'low';
  expectedOutcome: string | null;
  risk: string | null;
  fallback: string | null;
};

export type PallasStrategicPlayActionBoardData = {
  playId: string;
  accountId: string;
  opportunityId: string | null;
  goalDescription: string;
  items: PallasStrategicPlayActionItem[];
};

const DONE_STATUSES = new Set(['done', 'completed', 'invalidated', 'cancelled', 'canceled', 'skipped']);

export function isPallasActionBoardPreviewEnabled(searchParams: Pick<URLSearchParams, 'get'>): boolean {
  return isPallasPreviewGateValue(searchParams.get('pallas'));
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stepStatus(step: PlayStep): string {
  return clean(step.status) ?? 'planned';
}

function stepPriority(step: PlayStep): 'high' | 'medium' | 'low' {
  const status = stepStatus(step);
  if (status === 'blocked') return 'high';
  if (clean(step.risk)) return 'medium';
  return 'medium';
}

export function pallasStrategicPlayContext(play: Pick<StrategicPlay, 'id' | 'accountId' | 'opportunityId'>): PallasEntityContext {
  return {
    entityType: 'strategic_play',
    entityId: play.id,
    accountId: play.accountId,
    opportunityId: play.opportunityId ?? null,
    strategicPlayId: play.id,
  };
}

export function buildStrategicPlayActionBoardData(play: Pick<StrategicPlay, 'id' | 'accountId' | 'opportunityId' | 'goalDescription' | 'steps'>): PallasStrategicPlayActionBoardData {
  return {
    playId: play.id,
    accountId: play.accountId,
    opportunityId: play.opportunityId ?? null,
    goalDescription: play.goalDescription,
    items: (play.steps ?? []).map((step, index) => ({
      stepIndex: typeof step.index === 'number' ? step.index : index + 1,
      title: clean(step.title) ?? `步骤 ${index + 1}`,
      description: clean(step.description) ?? '',
      owner: clean(step.owner) ?? clean(step.who),
      target: clean(step.target),
      action: clean(step.action),
      timing: clean(step.timing),
      status: stepStatus(step),
      dueDate: clean(step.dueDate),
      priority: stepPriority(step),
      expectedOutcome: clean(step.expectedOutcome),
      risk: clean(step.risk),
      fallback: clean(step.fallback),
    })),
  };
}

export function buildStrategicPlayActionBoardArtifact(play: Pick<StrategicPlay, 'id' | 'accountId' | 'opportunityId' | 'goalDescription' | 'steps'>): {
  kind: PallasArtifactKind;
  title: string;
  context: PallasEntityContext;
  data: PallasJson;
  sourceRefs: PallasSourceRef[];
} {
  return {
    kind: 'strategic_play_action_board',
    title: `谋局行动板：${play.goalDescription}`,
    context: pallasStrategicPlayContext(play),
    data: buildStrategicPlayActionBoardData(play) as unknown as PallasJson,
    sourceRefs: [{
      kind: 'closr_record',
      label: 'Strategic Play',
      entityType: 'strategic_play',
      entityId: play.id,
    }],
  };
}

export function buildStrategicPlayCreateTaskPendingActions(play: Pick<StrategicPlay, 'id' | 'accountId' | 'opportunityId' | 'goalDescription' | 'steps'>): PendingAction[] {
  const board = buildStrategicPlayActionBoardData(play);

  return board.items
    .filter((item) => !DONE_STATUSES.has(item.status))
    .map((item) => {
      const sourceQuote = `谋局步骤 ${item.stepIndex}：${item.title}`;
      const description = [
        item.description,
        item.target ? `目标：${item.target}` : null,
        item.action ? `动作：${item.action}` : null,
        item.expectedOutcome ? `预期结果：${item.expectedOutcome}` : null,
        item.risk ? `风险：${item.risk}` : null,
        item.fallback ? `备选：${item.fallback}` : null,
      ].filter(Boolean).join('\n');

      return {
        toolName: 'create_task',
        displayName: `创建任务：${item.title}`,
        requiresConfirmation: true,
        args: {
          title: item.title,
          accountId: play.accountId,
          opportunityId: play.opportunityId ?? null,
          priority: item.priority,
          dueDate: item.dueDate,
          description,
          strategicPlayId: play.id,
          strategicPlayStepIndex: item.stepIndex,
        },
        fields: [
          { field: 'title', value: item.title, confidence: 'explicit', source_quote: sourceQuote },
          { field: 'priority', value: item.priority, confidence: 'implied', source_quote: sourceQuote },
          { field: 'dueDate', value: item.dueDate, confidence: item.dueDate ? 'explicit' : 'implied', source_quote: sourceQuote },
          { field: 'description', value: description, confidence: 'implied', source_quote: sourceQuote },
          { field: 'accountId', value: play.accountId, confidence: 'explicit', source_quote: sourceQuote },
          { field: 'opportunityId', value: play.opportunityId ?? null, confidence: play.opportunityId ? 'explicit' : 'implied', source_quote: sourceQuote },
        ],
      };
    });
}

export function buildStrategicPlayActionProposals(play: Pick<StrategicPlay, 'id' | 'accountId' | 'opportunityId' | 'goalDescription' | 'steps'>): PallasProposedAction[] {
  return toPallasProposedActions(buildStrategicPlayCreateTaskPendingActions(play));
}
