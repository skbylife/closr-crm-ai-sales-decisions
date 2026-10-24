import { createHash } from 'node:crypto';
import { withTransaction } from '@/lib/postgres';
import type { EngineJudgmentSnapshot } from './schema';

export class EnginePersistenceConflict extends Error { constructor(){super('Engine record conflicts with another scope');this.name='EnginePersistenceConflict'} }
export class EngineSnapshotScopeError extends Error { constructor(){super('Invalid engine snapshot scope or references');this.name='EngineSnapshotScopeError'} }
function assertSnapshotScope(snapshot:EngineJudgmentSnapshot):void {
 const fail=()=>{throw new EngineSnapshotScopeError()};
 if(!snapshot.tenantId||!snapshot.accountId||snapshot.writebackPolicy.mode!=='proposal_only'||snapshot.crmFieldUpdates.length!==0)fail();
 const scoped=(rows:Array<{id:string;tenantId:string;accountId?:string;opportunityId?:string}>,account:boolean)=>{
  const ids=new Set<string>();
  for(const row of rows){if(typeof row.id!=='string'||!row.id||row.id.length>200||ids.has(row.id)||row.tenantId!==snapshot.tenantId)fail();
   if(account&&(row.accountId!==snapshot.accountId||(row.opportunityId??null)!==(snapshot.opportunityId??null)))fail();ids.add(row.id)}
  return ids;
 };
 const sources=scoped(snapshot.sources,true),evidence=scoped(snapshot.evidenceRefs,false),judgments=scoped(snapshot.judgments,true),gaps=scoped(snapshot.winGaps,true);scoped(snapshot.moves,true);
 for(const ref of snapshot.evidenceRefs)if(!sources.has(ref.sourceRecordId))fail();
 for(const judgment of snapshot.judgments)if([...judgment.supportEvidenceIds,...judgment.counterEvidenceIds].some(id=>!evidence.has(id)))fail();
 for(const gap of snapshot.winGaps)if(gap.linkedJudgmentIds.some(id=>!judgments.has(id)))fail();
 for(const move of snapshot.moves)if(!gaps.has(move.winGapId))fail();
}

export interface PersistEngineSnapshotOptions {
  actorId?: string;
  actorType?: 'user' | 'service' | 'engine' | 'connector';
}

export interface PersistEngineSnapshotResult {
  snapshotId: string;
  counts: {
    sources: number;
    evidenceRefs: number;
    judgments: number;
    winGaps: number;
    moves: number;
    auditEvents: number;
  };
}

function snapshotId(snapshot: EngineJudgmentSnapshot): string {
  const basis = JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    tenantId: snapshot.tenantId,
    accountId: snapshot.accountId,
    opportunityId: snapshot.opportunityId,
    sourceIds: snapshot.sources.map((source) => source.id),
    judgmentIds: snapshot.judgments.map((judgment) => judgment.id),
  });
  return `snap_${createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

export async function persistEngineJudgmentSnapshot(
  snapshot: EngineJudgmentSnapshot,
  options: PersistEngineSnapshotOptions = {},
): Promise<PersistEngineSnapshotResult> {
  assertSnapshotScope(snapshot);
  const id = snapshotId(snapshot);
  return withTransaction(async (execute) => {
  const query = async (sql:string,params?:unknown[]) => {
    const rows = await execute(sql,params);
    if (rows.length === 0) throw new EnginePersistenceConflict();
    return rows;
  };

  for (const source of snapshot.sources) {
    await query(
      `INSERT INTO engine_source_records (
         id, tenant_id, source_type, external_source_id, account_id, opportunity_id,
         contact_ids, occurred_at, author_side, author_name, author_email,
         content, content_hash, metadata, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
       ON CONFLICT (id) DO UPDATE SET
         source_type = EXCLUDED.source_type,
         external_source_id = EXCLUDED.external_source_id,
         contact_ids = EXCLUDED.contact_ids,
         occurred_at = EXCLUDED.occurred_at,
         author_side = EXCLUDED.author_side,
         author_name = EXCLUDED.author_name,
         author_email = EXCLUDED.author_email,
         content = EXCLUDED.content,
         content_hash = EXCLUDED.content_hash,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       WHERE engine_source_records.tenant_id = EXCLUDED.tenant_id
         AND engine_source_records.account_id IS NOT DISTINCT FROM EXCLUDED.account_id
         AND engine_source_records.opportunity_id IS NOT DISTINCT FROM EXCLUDED.opportunity_id
       RETURNING id`,
      [
        source.id,
        source.tenantId,
        source.sourceType,
        source.externalSourceId ?? null,
        source.accountId ?? null,
        source.opportunityId ?? null,
        source.contactIds ?? [],
        source.occurredAt,
        source.author?.side ?? null,
        source.author?.name ?? null,
        source.author?.email ?? null,
        source.content ?? null,
        source.contentHash,
        source.metadata ?? {},
      ],
    );
  }

  for (const evidence of snapshot.evidenceRefs) {
    await query(
      `INSERT INTO engine_evidence_refs (
         id, tenant_id, source_record_id, evidence_type, quote, summary,
         quality_score, freshness_score
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         source_record_id = EXCLUDED.source_record_id,
         evidence_type = EXCLUDED.evidence_type,
         quote = EXCLUDED.quote,
         summary = EXCLUDED.summary,
         quality_score = EXCLUDED.quality_score,
         freshness_score = EXCLUDED.freshness_score
       WHERE engine_evidence_refs.tenant_id = EXCLUDED.tenant_id
         AND engine_evidence_refs.source_record_id = EXCLUDED.source_record_id
       RETURNING id`,
      [
        evidence.id,
        evidence.tenantId,
        evidence.sourceRecordId,
        evidence.evidenceType,
        evidence.quote,
        evidence.summary,
        evidence.qualityScore,
        evidence.freshnessScore,
      ],
    );
  }

  for (const judgment of snapshot.judgments) {
    await query(
      `INSERT INTO engine_judgments (
         id, tenant_id, account_id, opportunity_id, dimension, answer, status,
         confidence, impact, support_evidence_ids, counter_evidence_ids,
         missing_evidence, rationale, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (id) DO UPDATE SET
         dimension = EXCLUDED.dimension,
         answer = EXCLUDED.answer,
         status = EXCLUDED.status,
         confidence = EXCLUDED.confidence,
         impact = EXCLUDED.impact,
         support_evidence_ids = EXCLUDED.support_evidence_ids,
         counter_evidence_ids = EXCLUDED.counter_evidence_ids,
         missing_evidence = EXCLUDED.missing_evidence,
         rationale = EXCLUDED.rationale,
         updated_at = now()
       WHERE engine_judgments.tenant_id = EXCLUDED.tenant_id
         AND engine_judgments.account_id IS NOT DISTINCT FROM EXCLUDED.account_id
         AND engine_judgments.opportunity_id IS NOT DISTINCT FROM EXCLUDED.opportunity_id
       RETURNING id`,
      [
        judgment.id,
        judgment.tenantId,
        judgment.accountId,
        judgment.opportunityId ?? null,
        judgment.dimension,
        judgment.answer,
        judgment.status,
        judgment.confidence,
        judgment.impact,
        judgment.supportEvidenceIds,
        judgment.counterEvidenceIds,
        judgment.missingEvidence,
        judgment.rationale,
      ],
    );
  }

  for (const gap of snapshot.winGaps) {
    await query(
      `INSERT INTO engine_win_gaps (
         id, tenant_id, account_id, opportunity_id, dimension, current_state,
         desired_state, impact, linked_judgment_ids, evidence_gap, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (id) DO UPDATE SET
         dimension = EXCLUDED.dimension,
         current_state = EXCLUDED.current_state,
         desired_state = EXCLUDED.desired_state,
         impact = EXCLUDED.impact,
         linked_judgment_ids = EXCLUDED.linked_judgment_ids,
         evidence_gap = EXCLUDED.evidence_gap,
         status = EXCLUDED.status,
         updated_at = now()
       WHERE engine_win_gaps.tenant_id = EXCLUDED.tenant_id
         AND engine_win_gaps.account_id IS NOT DISTINCT FROM EXCLUDED.account_id
         AND engine_win_gaps.opportunity_id IS NOT DISTINCT FROM EXCLUDED.opportunity_id
       RETURNING id`,
      [
        gap.id,
        gap.tenantId,
        gap.accountId,
        gap.opportunityId ?? null,
        gap.dimension,
        gap.currentState,
        gap.desiredState,
        gap.impact,
        gap.linkedJudgmentIds,
        gap.evidenceGap,
        gap.status,
      ],
    );
  }

  for (const move of snapshot.moves) {
    await query(
      `INSERT INTO engine_moves (
         id, tenant_id, account_id, opportunity_id, win_gap_id, intent,
         target_person, ask, expected_judgment_delta, success_test,
         failure_test, status, approval_required, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (id) DO UPDATE SET
         win_gap_id = EXCLUDED.win_gap_id,
         intent = EXCLUDED.intent,
         target_person = EXCLUDED.target_person,
         ask = EXCLUDED.ask,
         expected_judgment_delta = EXCLUDED.expected_judgment_delta,
         success_test = EXCLUDED.success_test,
         failure_test = EXCLUDED.failure_test,
         status = EXCLUDED.status,
         approval_required = EXCLUDED.approval_required,
         updated_at = now()
       WHERE engine_moves.tenant_id = EXCLUDED.tenant_id
         AND engine_moves.account_id IS NOT DISTINCT FROM EXCLUDED.account_id
         AND engine_moves.opportunity_id IS NOT DISTINCT FROM EXCLUDED.opportunity_id
       RETURNING id`,
      [
        move.id,
        move.tenantId,
        move.accountId,
        move.opportunityId ?? null,
        move.winGapId,
        move.intent,
        move.targetPerson,
        move.ask,
        move.expectedJudgmentDelta,
        move.successTest,
        move.failureTest,
        move.status,
        move.approvalRequired,
      ],
    );
  }

  await query(
    `INSERT INTO engine_audit_events (
       id, tenant_id, actor_id, actor_type, event_type, object_type, object_id,
       summary, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET id = engine_audit_events.id
     WHERE engine_audit_events.tenant_id = EXCLUDED.tenant_id
     RETURNING id`,
    [
      stableAuditId(id),
      snapshot.tenantId,
      options.actorId ?? null,
      options.actorType ?? 'engine',
      'engine.snapshot.persisted',
      'engine_judgment_snapshot',
      id,
      'Persisted Closr Judgment Engine snapshot with proposal-only writeback boundary.',
      {
        schemaVersion: snapshot.schemaVersion,
        accountId: snapshot.accountId,
        opportunityId: snapshot.opportunityId ?? null,
        primaryRisk: snapshot.judgmentSummary.primaryRisk,
        writebackMode: snapshot.writebackPolicy.mode,
      },
    ],
  );

  return {
    snapshotId: id,
    counts: {
      sources: snapshot.sources.length,
      evidenceRefs: snapshot.evidenceRefs.length,
      judgments: snapshot.judgments.length,
      winGaps: snapshot.winGaps.length,
      moves: snapshot.moves.length,
      auditEvents: 1,
    },
  };
  });
}

function stableAuditId(id: string): string {
  return `aud_${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;
}
