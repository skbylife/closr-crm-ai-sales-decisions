import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlayStatus } from '@/lib/babel-engine/types';
import { calculateConfidence } from '@/lib/play-utils';
import { persistStrategicPlayJudgmentMemoryById } from '@/lib/strategic-play-judgment-memory';

type StrategicPlayMutationAdminClient = SupabaseClient<any, 'public', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StrategicPlayMutationContext {
  admin: StrategicPlayMutationAdminClient;
  orgId: string;
  playId: string;
  expectedUpdatedAt?: string;
}

export interface StrategicPlayAssumptionInput {
  id: string;
  text: string;
  status: string;
  evidence?: string;
  impact?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StrategicPlayLearningInput {
  stepIndex: number;
  learning: string;
  newSignal?: string;
}

export interface StrategicPlayReviewInput {
  result: 'achieved' | 'partially_achieved' | 'failed' | 'abandoned';
  whatWorked: string[];
  whatSurprised: string[];
  assumptionsReview: { assumptionId: string; outcome: string }[];
  lessonsForFuture: string[];
  reviewedAt: string;
}

export interface StrategicPlayV2RouteStateInput {
  situationLayers?: unknown[];
  confidenceProfile?: Record<string, unknown>;
  winGaps?: unknown[];
  nextVerificationPoint?: string | null;
  playVersions?: unknown[];
}

export type StrategicPlayMutationResult =
  | { body: { ok: true; judgmentMemory?: unknown } }
  | { body: { error: string }; init: { status: number } };

type StrategicPlayMutationRow = Record<string, unknown> & { updated_at?: string | null };

async function buildStrategicPlayMutationSuccess(params: StrategicPlayMutationContext): Promise<StrategicPlayMutationResult> {
  const judgmentMemory = await persistStrategicPlayJudgmentMemoryById({
    admin: params.admin,
    orgId: params.orgId,
    playId: params.playId,
  });
  return { body: { ok: true, ...(judgmentMemory ? { judgmentMemory } : {}) } };
}

function updateFailed(): StrategicPlayMutationResult {
  return { body: { error: 'Update failed' }, init: { status: 500 } };
}

function playNotFound(): StrategicPlayMutationResult {
  return { body: { error: 'Play not found' }, init: { status: 404 } };
}

function conflictDetected(): StrategicPlayMutationResult {
  return {
    body: { error: 'Strategic Play 已被其他成员更新，请刷新后再保存。' },
    init: { status: 409 },
  };
}

function hasVersionConflict(params: StrategicPlayMutationContext, play: StrategicPlayMutationRow | null): boolean {
  if (!params.expectedUpdatedAt || !play?.updated_at) return false;
  return play.updated_at !== params.expectedUpdatedAt;
}

async function loadStrategicPlayForMutation<T extends StrategicPlayMutationRow>(
  params: StrategicPlayMutationContext,
  columns: string,
): Promise<{ play: T | null; conflict: boolean }> {
  const { data: play } = await params.admin
    .from('strategic_plays')
    .select(columns.includes('updated_at') ? columns : columns + ', updated_at')
    .eq('id', params.playId)
    .eq('org_id', params.orgId)
    .single();

  const row = (play ?? null) as T | null;
  return { play: row, conflict: hasVersionConflict(params, row) };
}

export async function updateStrategicPlayStatus(params: StrategicPlayMutationContext & { status: PlayStatus }): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, status } = params;
  if (params.expectedUpdatedAt) {
    const { play, conflict } = await loadStrategicPlayForMutation(params, 'updated_at');
    if (!play) return playNotFound();
    if (conflict) return conflictDetected();
  }
  const { error } = await admin
    .from('strategic_plays')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', playId)
    .eq('org_id', orgId);

  if (error) return updateFailed();
  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayStepPreparationChecklist(params: StrategicPlayMutationContext & {
  stepIndex: number;
  preparationChecklist: { text: string; done: boolean }[];
}): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, stepIndex, preparationChecklist } = params;
  const { play, conflict } = await loadStrategicPlayForMutation<{ steps?: unknown; updated_at?: string | null }>(params, 'steps');

  if (!play) return playNotFound();
  if (conflict) return conflictDetected();

  const steps = play.steps as Record<string, unknown>[];
  if (stepIndex >= 0 && stepIndex < steps.length) {
    steps[stepIndex] = {
      ...steps[stepIndex],
      preparationChecklist,
    };

    await admin
      .from('strategic_plays')
      .update({ steps, updated_at: new Date().toISOString() })
      .eq('id', playId)
      .eq('org_id', orgId);
  }

  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayStepActualResult(params: StrategicPlayMutationContext & {
  stepIndex: number;
  actualResult: string;
  actualOutcome?: string;
}): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, stepIndex, actualResult, actualOutcome } = params;
  const { play, conflict } = await loadStrategicPlayForMutation<{ steps?: unknown; updated_at?: string | null }>(params, 'steps');

  if (!play) return playNotFound();
  if (conflict) return conflictDetected();

  const steps = play.steps as Record<string, unknown>[];
  if (stepIndex >= 0 && stepIndex < steps.length) {
    steps[stepIndex] = {
      ...steps[stepIndex],
      actualResult,
      actualOutcome: actualOutcome ?? actualResult,
      resultRecordedAt: new Date().toISOString(),
    };

    await admin
      .from('strategic_plays')
      .update({ steps, updated_at: new Date().toISOString() })
      .eq('id', playId)
      .eq('org_id', orgId);
  }

  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayMomentum(params: StrategicPlayMutationContext & { momentum: string }): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, momentum } = params;
  if (params.expectedUpdatedAt) {
    const { play, conflict } = await loadStrategicPlayForMutation(params, 'updated_at');
    if (!play) return playNotFound();
    if (conflict) return conflictDetected();
  }
  const { error } = await admin
    .from('strategic_plays')
    .update({ momentum, updated_at: new Date().toISOString() })
    .eq('id', playId)
    .eq('org_id', orgId);

  if (error) return updateFailed();
  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayAssumptions(params: StrategicPlayMutationContext & {
  assumptions: StrategicPlayAssumptionInput[];
}): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, assumptions } = params;
  const { play, conflict } = await loadStrategicPlayForMutation<{
    steps?: unknown;
    confidence?: unknown;
    last_step_at?: string;
    updated_at?: string | null;
  }>(params, 'steps, confidence, last_step_at');
  if (conflict) return conflictDetected();

  const newConfidence = play ? calculateConfidence({
    confidence: Number(play.confidence),
    steps: (play.steps as Record<string, unknown>[]) ?? [],
    assumptions: assumptions as unknown as Record<string, unknown>[],
    lastStepAt: play.last_step_at as string | undefined,
  }) : undefined;

  const { error } = await admin
    .from('strategic_plays')
    .update({
      assumptions,
      ...(newConfidence !== undefined ? { confidence: newConfidence } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', playId)
    .eq('org_id', orgId);

  if (error) return updateFailed();
  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayLearning(params: StrategicPlayMutationContext & {
  learning: StrategicPlayLearningInput;
}): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, learning } = params;
  const { play, conflict } = await loadStrategicPlayForMutation<{
    learnings?: unknown;
    steps?: unknown;
    confidence?: unknown;
    assumptions?: unknown;
    last_step_at?: string;
    updated_at?: string | null;
  }>(params, 'learnings, steps, confidence, assumptions, last_step_at');

  if (!play) return playNotFound();
  if (conflict) return conflictDetected();

  const learnings = (play.learnings as Record<string, unknown>[]) ?? [];
  const newSignals = learning.newSignal
    ? learning.newSignal.split(/[,，]/).map((signal: string) => signal.trim()).filter(Boolean)
    : [];

  learnings.push({
    stepIndex: learning.stepIndex,
    learning: learning.learning,
    newSignal: learning.newSignal ?? null,
    timestamp: new Date().toISOString(),
  });

  const steps = play.steps as Record<string, unknown>[];
  const si = learning.stepIndex;
  if (si >= 0 && si < steps.length) {
    steps[si] = {
      ...steps[si],
      ...(learning.learning ? { learning: learning.learning } : {}),
      ...(newSignals.length > 0 ? { newSignals } : {}),
    };
  }

  const newConfidence = calculateConfidence({
    confidence: Number(play.confidence),
    steps,
    assumptions: (play.assumptions as Record<string, unknown>[]) ?? [],
    lastStepAt: play.last_step_at as string | undefined,
  });

  const { error } = await admin
    .from('strategic_plays')
    .update({ learnings, steps, confidence: newConfidence, updated_at: new Date().toISOString() })
    .eq('id', playId)
    .eq('org_id', orgId);

  if (error) return updateFailed();
  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayReview(params: StrategicPlayMutationContext & { review: StrategicPlayReviewInput }): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, review } = params;
  if (params.expectedUpdatedAt) {
    const { play, conflict } = await loadStrategicPlayForMutation(params, 'updated_at');
    if (!play) return playNotFound();
    if (conflict) return conflictDetected();
  }
  const { error } = await admin
    .from('strategic_plays')
    .update({ review, updated_at: new Date().toISOString() })
    .eq('id', playId)
    .eq('org_id', orgId);

  if (error) return updateFailed();
  return buildStrategicPlayMutationSuccess(params);
}

export async function updateStrategicPlayV2RouteState(params: StrategicPlayMutationContext & {
  routeState: StrategicPlayV2RouteStateInput;
}): Promise<StrategicPlayMutationResult> {
  const { admin, orgId, playId, routeState } = params;
  const { play, conflict } = await loadStrategicPlayForMutation(params, 'updated_at');
  if (!play) return playNotFound();
  if (conflict) return conflictDetected();

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (routeState.situationLayers !== undefined) payload.situation_layers = routeState.situationLayers;
  if (routeState.confidenceProfile !== undefined) payload.confidence_profile = routeState.confidenceProfile;
  if (routeState.winGaps !== undefined) payload.win_gaps = routeState.winGaps;
  if (routeState.nextVerificationPoint !== undefined) payload.next_verification_point = routeState.nextVerificationPoint;
  if (routeState.playVersions !== undefined) payload.play_versions = routeState.playVersions;

  const hasRouteUpdate = Object.keys(payload).some((key) => key !== 'updated_at');
  if (!hasRouteUpdate) return { body: { error: 'No route state update specified' }, init: { status: 400 } };

  const { error } = await admin
    .from('strategic_plays')
    .update(payload)
    .eq('id', playId)
    .eq('org_id', orgId);

  if (error) return updateFailed();
  return buildStrategicPlayMutationSuccess(params);
}
