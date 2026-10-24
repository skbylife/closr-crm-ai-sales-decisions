#!/usr/bin/env node
// Engine AI Smoke — 验证 LLM 适配器是否正常工作
// USE: ENGINE_AI_ENABLED=1 node scripts/smoke-engine-ai.mjs
//      (需要设置 AI_PROVIDER / AI_API_KEY / AI_MODEL 等环境变量)

import { aiDecodeSources, aiBuildJudgment, aiGenerateMove } from '../src/lib/engine/ai-adapter.ts';
import { decodeEngineSignals, buildEngineJudgmentSnapshot, generateEngineMoves } from '../src/lib/engine/hybrid-pipeline.ts';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';

const repoRoot = process.cwd();

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log('Closr Judgment Engine — AI Adapter Smoke');
  console.log('');

  const aiEnabled = process.env.ENGINE_AI_ENABLED === '1';
  const hasAiProvider = Boolean(process.env.AI_API_KEY || process.env.GEMINI_API_KEY);
  console.log(`- ENGINE_AI_ENABLED: ${aiEnabled}`);
  console.log(`- AI provider key found: ${hasAiProvider}`);

  if (!aiEnabled || !hasAiProvider) {
    console.log('');
    console.log('⚠️ AI not configured. Testing rule-based fallback only.');
  }
  console.log('');

  // ── Load fixture ──
  const fixturePath = join(repoRoot, 'fixtures/engine/renewal-expansion/input.json');
  assert(existsSync(fixturePath), 'fixture exists');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const sources = fixture.sources;

  // ── Test 1: Decode (AI + fallback) ──
  console.log('[Test 1] decodeEngineSignals() — AI with rule fallback');
  const start1 = Date.now();
  const decodeResult = await decodeEngineSignals({
    tenantId: fixture.tenantId,
    accountId: fixture.accountId,
    opportunityId: fixture.opportunityId,
    sources,
  });
  const dur1 = Date.now() - start1;
  assert(decodeResult.schemaVersion === 'closr_judgment_engine_v1', 'schemaVersion present');
  assert(decodeResult.signalProfile?.primaryRisk?.length > 0, 'primaryRisk detected');
  assert(decodeResult.evidenceRefs?.length > 0, 'evidenceRefs extracted');
  assert(decodeResult.sources?.length === sources.length, `all ${sources.length} sources normalized`);
  console.log(`  → primaryRisk: ${decodeResult.signalProfile.primaryRisk}`);
  console.log(`  → patterns: ${decodeResult.signalProfile.patterns.join(', ')}`);
  console.log(`  → signalStrength: ${decodeResult.signalProfile.signalStrength}`);
  console.log(`  → evidenceRefs: ${decodeResult.evidenceRefs.length}`);
  console.log(`  → duration: ${dur1}ms`);
  console.log('');

  // ── Test 2: Full Snapshot (AI-powered) ──
  console.log('[Test 2] buildEngineJudgmentSnapshot() — AI + rule fallback');
  const start2 = Date.now();
  const snapshot = await buildEngineJudgmentSnapshot({
    tenantId: fixture.tenantId,
    accountId: fixture.accountId,
    opportunityId: fixture.opportunityId,
    sources,
  });
  const dur2 = Date.now() - start2;
  assert(snapshot.schemaVersion === 'closr_judgment_engine_v1', 'schemaVersion present');
  assert(snapshot.judgmentSummary?.primaryRisk?.length > 0, 'judgmentSummary.primaryRisk');

  assert(snapshot.judgments?.length > 0, 'judgments generated');
  const j = snapshot.judgments[0];
  assert(j.answer?.length > 0, 'judgment answer present');
  assert(j.rationale?.length > 0, 'judgment rationale present');
  assert(typeof j.confidence === 'number', 'confidence is number');
  assert(j.confidence >= 0 && j.confidence <= 1, 'confidence in [0,1]');

  assert(snapshot.winGaps?.length > 0, 'winGaps generated');
  assert(snapshot.winGaps[0].currentState?.length > 0, 'winGap currentState');
  assert(snapshot.winGaps[0].desiredState?.length > 0, 'winGap desiredState');

  assert(snapshot.moves?.length > 0, 'moves generated');
  assert(snapshot.moves[0].intent?.length > 0, 'move intent');
  assert(snapshot.moves[0].ask?.length > 0, 'move ask');
  assert(snapshot.moves[0].approvalRequired === true, 'move requires approval');

  assert(snapshot.writebackPolicy?.mode === 'proposal_only', 'writeback is proposal_only');
  assert(Array.isArray(snapshot.crmFieldUpdates), 'crmFieldUpdates is array');
  assert(snapshot.crmFieldUpdates.length === 0, 'crmFieldUpdates empty');

  console.log(`  → primaryRisk: ${snapshot.judgmentSummary.primaryRisk}`);
  console.log(`  → judgment: ${j.answer.slice(0, 80)}...`);
  console.log(`  → confidence: ${j.confidence}`);
  console.log(`  → rationale: ${j.rationale.slice(0, 80)}...`);
  console.log(`  → move.intent: ${snapshot.moves[0].intent}`);
  console.log(`  → move.target: ${snapshot.moves[0].targetPerson}`);
  console.log(`  → duration: ${dur2}ms`);
  console.log('');

  // ── Test 3: Strategic Play (standalone) ──
  console.log('[Test 3] generateEngineMoves() — standalone from existing judgments');
  const start3 = Date.now();
  const playResult = await generateEngineMoves({
    tenantId: fixture.tenantId,
    accountId: fixture.accountId,
    opportunityId: fixture.opportunityId,
    judgments: snapshot.judgments,
    winGaps: snapshot.winGaps,
  });
  const dur3 = Date.now() - start3;
  assert(playResult.moves?.length > 0, 'moves generated');
  assert(playResult.moves[0].intent?.length > 0, 'move intent present');
  assert(playResult.moves[0].approvalRequired === true, 'approval required');
  assert(playResult.moves[0].winGapId === snapshot.winGaps[0].id, 'move links to winGap');

  console.log(`  → moves: ${playResult.moves.length}`);
  console.log(`  → move.intent: ${playResult.moves[0].intent}`);
  console.log(`  → move.ask: ${playResult.moves[0].ask.slice(0, 60)}...`);
  console.log(`  → duration: ${dur3}ms`);
  console.log('');

  // ── Test 4: All three fixtures ──
  console.log('[Test 4] All three fixture scenarios');
  const fixtureNames = ['renewal-expansion', 'security-review', 'rfp-tender'];
  for (const name of fixtureNames) {
    const fp = join(repoRoot, `fixtures/engine/${name}/input.json`);
    const f = JSON.parse(readFileSync(fp, 'utf8'));
    const s = await buildEngineJudgmentSnapshot({
      tenantId: f.tenantId,
      accountId: f.accountId,
      opportunityId: f.opportunityId,
      sources: f.sources,
    });
    assert(s.judgmentSummary?.primaryRisk?.length > 0, `${name}: primaryRisk detected`);
    assert(s.judgments?.length > 0, `${name}: judgment generated`);
    assert(s.moves?.length > 0, `${name}: moves generated`);
    console.log(`  → ${name}: ${s.judgmentSummary.primaryRisk} (confidence: ${s.judgmentSummary.confidence})`);
  }
  console.log('');

  // ── Summary ──
  console.log(`Engine AI smoke: pass (${dur1 + dur2 + dur3}ms total)`);
  if (aiEnabled && hasAiProvider) {
    console.log('AI mode: enabled — responses were generated with LLM assistance');
  } else {
    console.log('AI mode: disabled (ENGINE_AI_ENABLED not set or no API key) — rule fallback used');
    console.log('To test AI: ENGINE_AI_ENABLED=1 AI_API_KEY=your_key node scripts/smoke-engine-ai.mjs');
  }
}

main().catch((err) => {
  console.error(`Engine AI smoke: FAIL`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
