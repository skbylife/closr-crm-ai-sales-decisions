// Engine Hybrid Pipeline — AI-first with rule-based fallback.
//
// Each function attempts an LLM call; if the AI is disabled or fails,
// falls back to the deterministic rule-based engine from schema.ts.
//
// Route handlers import from this file instead of schema.ts directly.

import type { ModelTier } from '@/lib/babel-engine/gemini';
import type { AIInvocationContext } from '@/lib/ai-invocation-log';
import {
  decodeEngineSignals as ruleDecode,
  buildEngineJudgmentSnapshot as ruleSnapshot,
  generateEngineMoves as ruleMoves,
  normalizeSources,
  type EngineJudgmentSnapshotInput,
  type EngineJudgmentSnapshot,
  type EngineDecodeResult,
  type EngineStrategicPlayInput,
  type EngineStrategicPlayResult,
  type EngineSourceRecord,
  type EngineJudgment,
  type EngineWinGap,
} from './schema';
import {
  aiDecodeSources,
  aiBuildJudgment,
  aiGenerateMove,
  type EngineAiOptions,
} from './ai-adapter';

// ── Config ────────────────────────────────────────────────

function isAiEnabled(): boolean {
  return process.env.ENGINE_AI_ENABLED === '1' || process.env.ENGINE_AI_ENABLED === 'true';
}

// ── Hybrid Decode ────────────────────────────────────────

export async function decodeEngineSignals(
  input: EngineJudgmentSnapshotInput,
  options: EngineAiOptions = {},
): Promise<EngineDecodeResult> {
  // Try AI first
  if (isAiEnabled()) {
    const aiResult = await aiDecodeSources(input.sources, options);
    if (aiResult) {
      const normalized = normalizeSources(input.sources, {
        tenantId: input.tenantId,
        accountId: input.accountId,
        opportunityId: input.opportunityId,
      });

      return {
        schemaVersion: 'closr_judgment_engine_v1',
        tenantId: input.tenantId,
        accountId: input.accountId,
        opportunityId: input.opportunityId,
        sources: normalized,
        evidenceRefs: aiResult.evidenceSummaries.map((ev) => ({
          id: `ai_ev_${ev.sourceId.slice(0, 12)}`,
          tenantId: input.tenantId,
          sourceRecordId: ev.sourceId,
          evidenceType: ev.type,
          quote: ev.quote.slice(0, 240),
          summary: ev.summary,
          qualityScore: ev.qualityScore,
          freshnessScore: 0.8,
        })),
        signalProfile: {
          primaryRisk: aiResult.primaryRisk,
          patterns: aiResult.patterns,
          signalStrength: aiResult.signalStrength,
        },
      };
    }
  }

  // Fall back to rule-based
  return ruleDecode(input);
}

// ── Hybrid Snapshot ──────────────────────────────────────

export async function buildEngineJudgmentSnapshot(
  input: EngineJudgmentSnapshotInput,
  options: EngineAiOptions = {},
): Promise<EngineJudgmentSnapshot> {
  // Try AI-first decode
  if (isAiEnabled()) {
    const aiDecode = await aiDecodeSources(input.sources, options);
    if (aiDecode) {
      const normalized = normalizeSources(input.sources, {
        tenantId: input.tenantId,
        accountId: input.accountId,
        opportunityId: input.opportunityId,
      });

      const evidenceRefs = aiDecode.evidenceSummaries.map((ev) => ({
        id: `ai_ev_${ev.sourceId.slice(0, 12)}`,
        tenantId: input.tenantId,
        sourceRecordId: ev.sourceId,
        evidenceType: ev.type as 'support' | 'counter' | 'missing' | 'context',
        quote: ev.quote.slice(0, 240),
        summary: ev.summary,
        qualityScore: ev.qualityScore,
        freshnessScore: 0.8,
      }));

      // Try AI judgment
      const aiJudgment = await aiBuildJudgment({
        primaryRisk: aiDecode.primaryRisk,
        patterns: aiDecode.patterns,
        signalStrength: aiDecode.signalStrength,
        evidenceSummaries: aiDecode.evidenceSummaries.map((ev) => ({
          sourceId: ev.sourceId,
          summary: ev.summary,
          qualityScore: ev.qualityScore,
        })),
      }, options);

      const supportEvidenceIds = evidenceRefs
        .filter((ref) => ref.evidenceType === 'support')
        .map((ref) => ref.id);

      if (aiJudgment) {
        const judgment: EngineJudgment = {
          id: `ai_judg_${input.tenantId.slice(0, 8)}_${input.accountId.slice(0, 8)}`,
          tenantId: input.tenantId,
          accountId: input.accountId,
          opportunityId: input.opportunityId,
          dimension: aiJudgment.dimension as EngineJudgment['dimension'],
          answer: aiJudgment.answer,
          status: 'proposed',
          confidence: aiJudgment.confidence,
          impact: aiJudgment.impact,
          supportEvidenceIds,
          counterEvidenceIds: [],
          missingEvidence: aiJudgment.missingEvidence,
          rationale: aiJudgment.rationale,
        };

        const winGap: EngineWinGap = {
          id: `ai_gap_${judgment.id.slice(-12)}`,
          tenantId: input.tenantId,
          accountId: input.accountId,
          opportunityId: input.opportunityId,
          dimension: aiJudgment.dimension,
          currentState: aiJudgment.currentState,
          desiredState: aiJudgment.desiredState,
          impact: aiJudgment.impact === 'critical' ? 'blocks deal' : aiJudgment.impact === 'high' ? 'blocks progress' : 'slows progress',
          linkedJudgmentIds: [judgment.id],
          evidenceGap: aiJudgment.missingEvidence[0] ?? '未识别到关键缺失证据',
          status: 'open',
        };

        // Try AI move
        const aiMove = await aiGenerateMove({
          judgmentAnswer: aiJudgment.answer,
          judgmentDimension: aiJudgment.dimension,
          missingEvidence: aiJudgment.missingEvidence,
          currentState: aiJudgment.currentState,
          desiredState: aiJudgment.desiredState,
        }, options);

        const move = aiMove ? {
          id: `ai_move_${winGap.id.slice(-12)}`,
          tenantId: input.tenantId,
          accountId: input.accountId,
          opportunityId: input.opportunityId,
          winGapId: winGap.id,
          intent: aiMove.intent,
          targetPerson: aiMove.targetPerson,
          ask: aiMove.ask,
          expectedJudgmentDelta: aiMove.expectedJudgmentDelta,
          successTest: aiMove.successTest,
          failureTest: aiMove.failureTest,
          status: 'proposed' as const,
          approvalRequired: aiMove.approvalRequired,
        } : {
          id: `move_${winGap.id.slice(-12)}`,
          tenantId: input.tenantId,
          accountId: input.accountId,
          opportunityId: input.opportunityId,
          winGapId: winGap.id,
          intent: 'collect missing evidence',
          targetPerson: '责任人',
          ask: '确认当前情况并补充缺失证据。',
          expectedJudgmentDelta: '补充证据后可更新判断。',
          successTest: '获得缺失证据或明确答复',
          failureTest: '无回应或继续模糊',
          status: 'proposed' as const,
          approvalRequired: true,
        };

        return {
          schemaVersion: 'closr_judgment_engine_v1',
          tenantId: input.tenantId,
          accountId: input.accountId,
          opportunityId: input.opportunityId,
          judgmentSummary: {
            health: 'at_risk',
            momentum: aiDecode.signalStrength === 'strong' ? 'cooling' : 'stable',
            primaryRisk: aiDecode.primaryRisk,
            confidence: aiJudgment.confidence,
            evidenceQuality: aiJudgment.confidence >= 0.65 ? 'medium' : aiJudgment.confidence >= 0.4 ? 'low' : 'low',
          },
          sources: normalized,
          evidenceRefs,
          judgments: [judgment],
          winGaps: [winGap],
          moves: [move],
          writebackPolicy: {
            mode: 'proposal_only',
            prohibitedFields: [
              'opportunity.stage', 'opportunity.amount', 'opportunity.forecast_category',
              'opportunity.close_date', 'opportunity.owner',
            ],
          },
          crmFieldUpdates: [],
        };
      }
    }
  }

  // Fall back to rule-based snapshot
  return ruleSnapshot(input);
}

// ── Hybrid Strategic Play ────────────────────────────────

export async function generateEngineMoves(
  input: EngineStrategicPlayInput,
  options: EngineAiOptions = {},
): Promise<EngineStrategicPlayResult> {
  // Try AI for each judgment + winGap pair
  if (isAiEnabled()) {
    const moves: import('./schema').EngineMove[] = [];

    for (const judgment of input.judgments) {
      for (const winGap of input.winGaps) {
        const aiResult = await aiGenerateMove({
          judgmentAnswer: judgment.answer,
          judgmentDimension: judgment.dimension,
          missingEvidence: judgment.missingEvidence,
          currentState: winGap.currentState,
          desiredState: winGap.desiredState,
          playGoal: input.playGoal,
        }, options);

        if (aiResult) {
          moves.push({
            id: `ai_move_${winGap.id.slice(-12)}`,
            tenantId: input.tenantId,
            accountId: input.accountId,
            opportunityId: input.opportunityId,
            winGapId: winGap.id,
            intent: aiResult.intent,
            targetPerson: aiResult.targetPerson,
            ask: aiResult.ask,
            expectedJudgmentDelta: aiResult.expectedJudgmentDelta,
            successTest: aiResult.successTest,
            failureTest: aiResult.failureTest,
            status: 'proposed',
            approvalRequired: aiResult.approvalRequired,
          });
        }
      }
    }

    if (moves.length > 0) {
      return {
        schemaVersion: 'closr_judgment_engine_v1',
        tenantId: input.tenantId,
        accountId: input.accountId,
        opportunityId: input.opportunityId,
        judgments: input.judgments,
        winGaps: input.winGaps,
        moves,
      };
    }
  }

  // Fall back to rule-based moves
  return ruleMoves(input);
}
