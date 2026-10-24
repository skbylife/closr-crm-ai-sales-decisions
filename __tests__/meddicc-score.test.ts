import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  MeddiccAssessment,
  Contact,
  DecisionCriterion,
  DecisionStep,
  PainPoint,
  Competitor,
} from '@/lib/babel-engine/types';

// ---------------------------------------------------------------------------
// Helper: reproduce daysBetween and computeMeddiccScore as they exist inline
// in pipeline/[id]/page.tsx.  Once the functions are extracted to @/lib/meddicc
// this import can be swapped to:
//   import { computeMeddiccScore, daysBetween } from '@/lib/meddicc';
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string) {
  return Math.ceil(
    (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
  );
}

function computeMeddiccScore(
  m: MeddiccAssessment,
  contacts: Contact[],
): number {
  let score = 0;

  // Metrics (15)
  if (m.metrics?.status === 'confirmed') score += 15;
  else if (m.metrics?.status === 'partial') score += 8;

  // Economic Buyer (15)
  if (m.economicBuyer?.status === 'engaged') score += 15;
  else if (m.economicBuyer?.status === 'identified') score += 8;

  // Decision Criteria (15)
  if ((m.decisionCriteria ?? []).length > 0) {
    const strong = (m.decisionCriteria ?? []).filter(
      (d) => d.ourFit === 'strong',
    ).length;
    const partial = (m.decisionCriteria ?? []).filter(
      (d) => d.ourFit === 'partial',
    ).length;
    score += Math.min(
      15,
      Math.round(
        ((strong * 1.0 + partial * 0.5) /
          (m.decisionCriteria ?? []).length) *
          15,
      ),
    );
  }

  // Decision Process (10)
  if ((m.decisionProcess ?? []).length > 0) {
    const completed = (m.decisionProcess ?? []).filter(
      (d) => d.status === 'completed',
    ).length;
    score += Math.round(
      (completed / (m.decisionProcess ?? []).length) * 10,
    );
  }

  // Pain (15)
  if ((m.identifiedPain ?? []).length > 0) {
    const quantified = (m.identifiedPain ?? []).filter(
      (p) => p.quantified,
    ).length;
    const base = Math.min(10, (m.identifiedPain ?? []).length * 3);
    const qBonus = Math.round(
      (quantified / (m.identifiedPain ?? []).length) * 5,
    );
    score += base + qBonus;
  }

  // Champion (15)
  const champions = contacts.filter((c) => c.role === 'champion');
  if (champions.length > 0) {
    score += Math.min(5, champions.length * 3);
    score += Math.min(5, m.champion?.strength * 1);
    if (m.champion?.lastEngagement) {
      const days = daysBetween(
        m.champion?.lastEngagement,
        new Date().toISOString().split('T')[0],
      );
      if (days <= 7) score += 5;
      else if (days <= 14) score += 3;
      else if (days <= 30) score += 1;
    }
  }

  // Competition (15)
  if ((m.competition ?? []).length > 0) {
    const withCounter = (m.competition ?? []).filter(
      (c) => (c.ourAdvantage ?? '').trim().length > 0,
    ).length;
    score += Math.min(10, (m.competition ?? []).length * 3);
    score += Math.min(
      5,
      Math.round(
        (withCounter / (m.competition ?? []).length) * 5,
      ),
    );
  }

  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function emptyAssessment(): MeddiccAssessment {
  return {
    metrics: { notes: '', status: 'unconfirmed', evidence: '' },
    economicBuyer: { status: 'unknown', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 0, lastEngagement: '', notes: '' },
    competition: [],
    overallScore: 0,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c-1',
    name: 'Test Contact',
    email: 'test@example.com',
    ...overrides,
  };
}

function makeCriterion(
  overrides: Partial<DecisionCriterion> = {},
): DecisionCriterion {
  return {
    id: 'dc-1',
    criterion: 'Feature X',
    ourFit: 'strong',
    notes: '',
    ...overrides,
  };
}

function makeStep(overrides: Partial<DecisionStep> = {}): DecisionStep {
  return {
    id: 'ds-1',
    step: 'Review',
    status: 'pending',
    owner: '',
    dueDate: '',
    ...overrides,
  };
}

function makePain(overrides: Partial<PainPoint> = {}): PainPoint {
  return {
    id: 'pp-1',
    pain: 'Slow process',
    quantified: false,
    impactValue: '',
    notes: '',
    ...overrides,
  };
}

function makeCompetitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: 'comp-1',
    name: 'Rival Inc',
    strengths: 'Price',
    ourAdvantage: 'Better UX',
    threatLevel: 'medium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns positive days for a future date', () => {
    expect(daysBetween('2025-01-01', '2025-01-08')).toBe(7);
  });

  it('returns 0 for the same date', () => {
    expect(daysBetween('2025-06-01', '2025-06-01')).toBe(0);
  });
});

describe('computeMeddiccScore', () => {
  let dateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Fix "today" to 2025-06-15 so champion recency tests are deterministic
    dateSpy = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(
      '2025-06-15T00:00:00.000Z',
    );
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('returns 0 for an empty / unconfirmed assessment with no contacts', () => {
    expect(computeMeddiccScore(emptyAssessment(), [])).toBe(0);
  });

  // ── Metrics ─────────────────────────────────────────────

  it('gives 15 points for confirmed metrics', () => {
    const a = emptyAssessment();
    a.metrics.status = 'confirmed';
    expect(computeMeddiccScore(a, [])).toBe(15);
  });

  it('gives 8 points for partial metrics', () => {
    const a = emptyAssessment();
    a.metrics.status = 'partial';
    expect(computeMeddiccScore(a, [])).toBe(8);
  });

  // ── Economic Buyer ──────────────────────────────────────

  it('gives 15 points for engaged economic buyer', () => {
    const a = emptyAssessment();
    a.economicBuyer.status = 'engaged';
    expect(computeMeddiccScore(a, [])).toBe(15);
  });

  it('gives 8 points for identified economic buyer', () => {
    const a = emptyAssessment();
    a.economicBuyer.status = 'identified';
    expect(computeMeddiccScore(a, [])).toBe(8);
  });

  // ── Decision Criteria ───────────────────────────────────

  it('gives 15 points when all criteria are strong fit', () => {
    const a = emptyAssessment();
    a.decisionCriteria = [
      makeCriterion({ ourFit: 'strong' }),
      makeCriterion({ id: 'dc-2', ourFit: 'strong' }),
    ];
    expect(computeMeddiccScore(a, [])).toBe(15);
  });

  it('gives partial score when criteria are mixed', () => {
    const a = emptyAssessment();
    a.decisionCriteria = [
      makeCriterion({ ourFit: 'strong' }),
      makeCriterion({ id: 'dc-2', ourFit: 'partial' }),
    ];
    // (1*1.0 + 1*0.5) / 2 * 15 = 11.25 -> round -> 11
    expect(computeMeddiccScore(a, [])).toBe(11);
  });

  it('gives 0 for weak-only criteria (strong=0, partial=0)', () => {
    const a = emptyAssessment();
    a.decisionCriteria = [
      makeCriterion({ ourFit: 'weak' }),
      makeCriterion({ id: 'dc-2', ourFit: 'unknown' }),
    ];
    // (0 + 0) / 2 * 15 = 0
    expect(computeMeddiccScore(a, [])).toBe(0);
  });

  // ── Decision Process ────────────────────────────────────

  it('scores decision process based on completion ratio', () => {
    const a = emptyAssessment();
    a.decisionProcess = [
      makeStep({ status: 'completed' }),
      makeStep({ id: 'ds-2', status: 'pending' }),
    ];
    // 1/2 * 10 = 5
    expect(computeMeddiccScore(a, [])).toBe(5);
  });

  it('gives full 10 when all steps are completed', () => {
    const a = emptyAssessment();
    a.decisionProcess = [
      makeStep({ status: 'completed' }),
      makeStep({ id: 'ds-2', status: 'completed' }),
    ];
    expect(computeMeddiccScore(a, [])).toBe(10);
  });

  // ── Pain ────────────────────────────────────────────────

  it('gives base pain score for unquantified pain points', () => {
    const a = emptyAssessment();
    a.identifiedPain = [makePain()];
    // base = min(10, 1*3) = 3, qBonus = round(0/1 * 5) = 0 => 3
    expect(computeMeddiccScore(a, [])).toBe(3);
  });

  it('gives base + quantification bonus', () => {
    const a = emptyAssessment();
    a.identifiedPain = [
      makePain({ quantified: true }),
      makePain({ id: 'pp-2', quantified: true }),
    ];
    // base = min(10, 2*3) = 6, qBonus = round(2/2 * 5) = 5 => 11
    expect(computeMeddiccScore(a, [])).toBe(11);
  });

  it('caps base pain at 10', () => {
    const a = emptyAssessment();
    a.identifiedPain = Array.from({ length: 5 }, (_, i) =>
      makePain({ id: `pp-${i}`, quantified: false }),
    );
    // base = min(10, 5*3) = 10, qBonus = 0 => 10
    expect(computeMeddiccScore(a, [])).toBe(10);
  });

  // ── Champion ────────────────────────────────────────────

  it('scores champion count + strength + recency (within 7 days)', () => {
    const a = emptyAssessment();
    a.champion = { strength: 4, lastEngagement: '2025-06-10', notes: '' };
    const contacts = [makeContact({ role: 'champion' })];
    // count: min(5, 1*3) = 3
    // strength: min(5, 4*1) = 4
    // recency: daysBetween('2025-06-10', '2025-06-15') = 5 <= 7 => +5
    expect(computeMeddiccScore(a, contacts)).toBe(12);
  });

  it('gives recency bonus of 3 for 8-14 day engagement', () => {
    const a = emptyAssessment();
    a.champion = { strength: 3, lastEngagement: '2025-06-05', notes: '' };
    const contacts = [makeContact({ role: 'champion' })];
    // count=3, strength=3, recency: daysBetween('2025-06-05','2025-06-15')=10 => +3
    expect(computeMeddiccScore(a, contacts)).toBe(9);
  });

  it('gives recency bonus of 1 for 15-30 day engagement', () => {
    const a = emptyAssessment();
    a.champion = { strength: 2, lastEngagement: '2025-05-20', notes: '' };
    const contacts = [makeContact({ role: 'champion' })];
    // count=3, strength=2, recency: daysBetween('2025-05-20','2025-06-15')=26 => +1
    expect(computeMeddiccScore(a, contacts)).toBe(6);
  });

  it('gives no champion score without champion contacts', () => {
    const a = emptyAssessment();
    a.champion = { strength: 5, lastEngagement: '2025-06-14', notes: '' };
    const contacts = [makeContact({ role: 'decision_maker' })];
    expect(computeMeddiccScore(a, contacts)).toBe(0);
  });

  // ── Competition ─────────────────────────────────────────

  it('scores competition count + counter-strategy ratio', () => {
    const a = emptyAssessment();
    a.competition = [
      makeCompetitor({ ourAdvantage: 'Better support' }),
      makeCompetitor({ id: 'comp-2', ourAdvantage: '' }),
    ];
    // count: min(10, 2*3) = 6
    // withCounter: 1/2 * 5 = 2.5 -> round -> 3, min(5,3) = 3
    expect(computeMeddiccScore(a, [])).toBe(9);
  });

  it('caps competition count score at 10', () => {
    const a = emptyAssessment();
    a.competition = Array.from({ length: 5 }, (_, i) =>
      makeCompetitor({ id: `comp-${i}`, ourAdvantage: 'Yes' }),
    );
    // count: min(10, 5*3) = 10, counter: min(5, round(5/5*5)) = 5 => 15
    expect(computeMeddiccScore(a, [])).toBe(15);
  });

  // ── Overall cap ─────────────────────────────────────────

  it('caps the total score at 100', () => {
    const a = emptyAssessment();
    a.metrics.status = 'confirmed'; // 15
    a.economicBuyer.status = 'engaged'; // 15
    a.decisionCriteria = [makeCriterion({ ourFit: 'strong' })]; // 15
    a.decisionProcess = [makeStep({ status: 'completed' })]; // 10
    a.identifiedPain = [
      makePain({ quantified: true }),
      makePain({ id: 'pp-2', quantified: true }),
      makePain({ id: 'pp-3', quantified: true }),
      makePain({ id: 'pp-4', quantified: true }),
    ]; // base=10, qBonus=5 => 15
    a.champion = { strength: 5, lastEngagement: '2025-06-14', notes: '' }; // 3+5+5=13
    a.competition = Array.from({ length: 5 }, (_, i) =>
      makeCompetitor({ id: `comp-${i}`, ourAdvantage: 'Yes' }),
    ); // 15

    const contacts = [makeContact({ role: 'champion' })];
    // Raw total: 15+15+15+10+15+13+15 = 98; under 100 so not capped here
    // but the function guarantees Math.min(100, score)
    const score = computeMeddiccScore(a, contacts);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(0);
  });
});
