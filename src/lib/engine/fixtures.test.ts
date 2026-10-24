import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEngineJudgmentSnapshot, type EngineJudgmentSnapshotInput } from './schema';

const repoRoot = process.cwd();
const fixtureNames = ['renewal-expansion', 'security-review', 'rfp-tender'] as const;

function loadFixture(name: string): EngineJudgmentSnapshotInput {
  const path = join(repoRoot, 'fixtures/engine', name, 'input.json');
  return JSON.parse(readFileSync(path, 'utf8')) as EngineJudgmentSnapshotInput;
}

describe('engine fixture harness contract', () => {
  it('ships three golden-path input fixtures', () => {
    for (const name of fixtureNames) {
      expect(existsSync(join(repoRoot, 'fixtures/engine', name, 'input.json'))).toBe(true);
    }
  });

  it('builds valid snapshots with evidence, judgment, win gap, and move for every fixture', () => {
    for (const name of fixtureNames) {
      const snapshot = buildEngineJudgmentSnapshot(loadFixture(name));

      expect(snapshot.schemaVersion).toBe('closr_judgment_engine_v1');
      expect(snapshot.sources.length, name).toBeGreaterThan(0);
      expect(snapshot.judgments.length, name).toBeGreaterThan(0);
      expect(snapshot.winGaps.length, name).toBeGreaterThan(0);
      expect(snapshot.moves.length, name).toBeGreaterThan(0);
      expect(snapshot.judgments[0].supportEvidenceIds.length, name).toBeGreaterThan(0);
      expect(snapshot.winGaps[0].linkedJudgmentIds, name).toContain(snapshot.judgments[0].id);
      expect(snapshot.moves[0].winGapId, name).toBe(snapshot.winGaps[0].id);
      expect(snapshot.writebackPolicy.mode).toBe('proposal_only');
      expect(snapshot.crmFieldUpdates).toEqual([]);
    }
  });

  it('keeps each fixture mapped to a specific primary risk', () => {
    const expectations = {
      'renewal-expansion': 'finance/procurement blocker',
      'security-review': 'security/compliance blocker',
      'rfp-tender': 'rfp/tender process blocker',
    } as const;

    for (const name of fixtureNames) {
      const snapshot = buildEngineJudgmentSnapshot(loadFixture(name));
      expect(snapshot.judgmentSummary.primaryRisk).toBe(expectations[name]);
    }
  });
});
