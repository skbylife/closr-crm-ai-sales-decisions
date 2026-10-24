import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlayAssumption, PlayStep, StrategicPlay } from '@/lib/babel-engine/types';
import { invalidateAccountCaches } from '@/lib/evidence-memory/server';
import { buildJudgmentMemoryFromStrategicPlay } from '@/lib/judgment/memory';
import { persistJudgmentMemorySourceRecord } from '@/lib/judgment/persistence';
import { normalizeEvidenceProvenance, strategicPlayEvidenceTraceResponse } from '@/lib/strategic-play-mapping';

type StrategicPlayJudgmentMemoryAdminClient = SupabaseClient<any, 'public', any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type StrategicPlayMemoryRow = {
  id?: string | null;
  account_id?: string | null;
  opportunity_id?: string | null;
  target_contact_id?: string | null;
  goal_description?: string | null;
  situation_judgment?: string | null;
  strategic_objective?: string | null;
  stakeholder_path?: unknown;
  evidence_basis?: unknown;
  risk_counter_evidence?: unknown;
  success_criteria?: string | null;
  knowledge_traces?: unknown;
  knowledge_gaps?: unknown;
  evidence_provenance?: unknown;
  steps?: unknown;
  confidence?: unknown;
  assumptions?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StrategicPlayJudgmentMemoryInput = Pick<
  StrategicPlay,
  'id' | 'accountId' | 'goalDescription' | 'steps' | 'confidence' | 'assumptions' | 'updatedAt' | 'createdAt'
> & Pick<Partial<StrategicPlay>, 'fieldEvidenceAttributions'>;

const STRATEGIC_PLAY_JUDGMENT_MEMORY_SELECT = 'id, account_id, opportunity_id, target_contact_id, goal_description, steps, confidence, assumptions, knowledge_traces, knowledge_gaps, evidence_provenance, created_at, updated_at';

export function normalizeStrategicPlayForJudgment(row: StrategicPlayMemoryRow): StrategicPlayJudgmentMemoryInput | null {
  const id = typeof row.id === 'string' ? row.id : '';
  const accountId = typeof row.account_id === 'string' ? row.account_id : '';
  const goalDescription = typeof row.goal_description === 'string' ? row.goal_description.trim() : '';
  if (!id || !accountId || !goalDescription) return null;

  const now = new Date().toISOString();
  const provenance = normalizeEvidenceProvenance(row.evidence_provenance);
  return {
    id,
    accountId,
    goalDescription,
    steps: Array.isArray(row.steps) ? row.steps as PlayStep[] : [],
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.5,
    assumptions: Array.isArray(row.assumptions) ? row.assumptions as PlayAssumption[] : [],
    ...(provenance?.fieldEvidenceAttributions ? { fieldEvidenceAttributions: provenance.fieldEvidenceAttributions } : {}),
    createdAt: row.created_at ?? row.updated_at ?? now,
    updatedAt: row.updated_at ?? row.created_at ?? now,
  };
}

export async function persistStrategicPlayJudgmentMemoryById(params: {
  admin: StrategicPlayJudgmentMemoryAdminClient;
  orgId: string;
  playId: string;
}) {
  const { admin, orgId, playId } = params;
  const { data, error } = await admin
    .from('strategic_plays')
    .select(STRATEGIC_PLAY_JUDGMENT_MEMORY_SELECT)
    .eq('id', playId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.warn('[strategic-play] judgment memory play reload failed:', error.message);
    return null;
  }
  if (!data) return null;

  return persistStrategicPlayJudgmentMemory({ admin, orgId, play: data as StrategicPlayMemoryRow });
}

export async function persistStrategicPlayJudgmentMemory(params: {
  admin: StrategicPlayJudgmentMemoryAdminClient;
  orgId: string;
  play: StrategicPlayMemoryRow;
}) {
  const { admin, orgId, play: row } = params;

  try {
    const play = normalizeStrategicPlayForJudgment(row);
    if (!play) return null;

    const judgmentMemory = buildJudgmentMemoryFromStrategicPlay(play);
    const persistResult = await persistJudgmentMemorySourceRecord({
      admin,
      orgId,
      judgmentMemory,
      sourceTable: 'strategic_plays',
      expectedAccountId: play.accountId,
      extraMetadata: {
        opportunityId: row.opportunity_id ?? null,
        targetContactId: row.target_contact_id ?? null,
        strategicPlayEvidenceTrace: strategicPlayEvidenceTraceResponse({
          knowledge_traces: row.knowledge_traces,
          knowledge_gaps: row.knowledge_gaps,
          evidence_provenance: row.evidence_provenance,
        }),
      },
    });

    if (persistResult.status === 'skipped') {
      console.warn('[strategic-play] judgment memory source record skipped:', persistResult.reason);
      return judgmentMemory;
    }

    invalidateAccountCaches(play.accountId, orgId);
    return judgmentMemory;
  } catch (err) {
    console.warn('[strategic-play] judgment memory persistence skipped:', err);
    return null;
  }
}
