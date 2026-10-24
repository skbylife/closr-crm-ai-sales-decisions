import { describe, it, expect } from 'vitest';
import {
  assessClaimRelation,
  buildAnswerSnippet,
  buildResolutionExplanation,
  deepMergePatch,
  isClaimStale,
  lintHighImpactClaims,
  normalizeText,
  roundConfidence,
  tokenOverlapScore,
} from '@/lib/compiled-intelligence/ingest';
import type { ExtractionResult } from '@/lib/compiled-intelligence/ai-extract';

// ─── deepMergePatch: localized update core logic ────────────────────

describe('deepMergePatch (localized update)', () => {
  it('merges top-level keys without destroying existing ones', () => {
    const base = { company: 'Acme', temperature: 'warm', summary: '原有摘要' };
    const patch = { temperature: 'hot', newField: 'added' };
    const result = deepMergePatch(base, patch);

    expect(result.company).toBe('Acme');
    expect(result.summary).toBe('原有摘要');
    expect(result.temperature).toBe('hot');
    expect(result.newField).toBe('added');
  });

  it('recursively merges nested objects', () => {
    const base = {
      stakeholders: {
        jane: { role: 'champion', stance: 'positive' },
        bob: { role: 'blocker', stance: 'negative' },
      },
    };
    const patch = {
      stakeholders: {
        jane: { confidence: 0.8 },
        carol: { role: 'evaluator', stance: 'neutral' },
      },
    };
    const result = deepMergePatch(base, patch);
    const sh = result.stakeholders as Record<string, Record<string, unknown>>;

    expect(sh.jane.role).toBe('champion');
    expect(sh.jane.stance).toBe('positive');
    expect(sh.jane.confidence).toBe(0.8);
    expect(sh.bob.role).toBe('blocker');
    expect(sh.carol.role).toBe('evaluator');
  });

  it('replaces arrays entirely (not deep-merged)', () => {
    const base = { risks: ['旧风险1', '旧风险2'] };
    const patch = { risks: ['新风险1'] };
    const result = deepMergePatch(base, patch);

    expect(result.risks).toEqual(['新风险1']);
  });

  it('handles empty patch (no-op)', () => {
    const base = { foo: 'bar', nested: { a: 1 } };
    const result = deepMergePatch(base, {});

    expect(result).toEqual(base);
  });

  it('handles empty base (create from patch)', () => {
    const patch = { status: 'active', priorities: ['p1'] };
    const result = deepMergePatch({}, patch);

    expect(result).toEqual(patch);
  });

  it('does not mutate original base object', () => {
    const base = { a: { b: 1 } };
    const baseCopy = JSON.parse(JSON.stringify(base));
    deepMergePatch(base, { a: { b: 2, c: 3 } });

    expect(base).toEqual(baseCopy);
  });
});

// ─── normalizeText ──────────────────────────────────────────────────

describe('normalizeText', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeText('  Hello   World  ')).toBe('hello world');
  });

  it('strips Chinese punctuation', () => {
    expect(normalizeText('预算审批权？谁拥有！')).toBe('预算审批权 谁拥有');
  });

  it('handles mixed Chinese/English', () => {
    const result = normalizeText('VP Sales 是 champion，但缺少预算控制权。');
    expect(result).toBe('vp sales 是 champion 但缺少预算控制权');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

// ─── tokenOverlapScore ──────────────────────────────────────────────

describe('tokenOverlapScore', () => {
  it('returns 1 for identical statements', () => {
    const s = 'Jane Doe 很可能是 champion';
    expect(tokenOverlapScore(s, s)).toBe(1);
  });

  it('returns high score for similar claims', () => {
    const a = 'Jane Doe 很可能是 champion，但未必拥有预算控制权';
    const b = 'Jane Doe 是 champion，但可能缺少预算控制权';
    const score = tokenOverlapScore(a, b);
    expect(score).toBeGreaterThan(0.45);
  });

  it('returns high score for overlapping Chinese phrases without spaces', () => {
    const a = '谁拥有最终预算审批权';
    const b = '预算审批权仍待CFO确认';
    const score = tokenOverlapScore(a, b);
    expect(score).toBeGreaterThan(0.25);
  });

  it('returns low score for unrelated statements', () => {
    const a = '采购流程可能提前介入并拉长推进周期';
    const b = 'VP Sales 对产品兴趣很高';
    const score = tokenOverlapScore(a, b);
    expect(score).toBeLessThan(0.3);
  });

  it('returns 0 for empty strings', () => {
    expect(tokenOverlapScore('', 'hello world')).toBe(0);
    expect(tokenOverlapScore('hello', '')).toBe(0);
  });

  it('ignores single-character tokens', () => {
    expect(tokenOverlapScore('a b c', 'a b c')).toBe(0);
  });
});

// ─── claim revalidation regression ─────────────────────────────────

describe('claim stability helpers', () => {
  it('treats polarity-flipped overlap as conflict', () => {
    const oldClaim = 'Jane Doe 是 champion，并会推动项目';
    const newClaim = 'Jane Doe 不是 champion，也不会推动项目';

    expect(assessClaimRelation(oldClaim, newClaim)).toBe('conflict');
  });

  it('marks downgraded low-confidence claims as stale candidates', () => {
    const downgradedConfidence = roundConfidence(Math.max(0.1, 0.62 * 0.55 - 0.92 * 0.15));
    expect(downgradedConfidence).toBeLessThanOrEqual(0.4);
    expect(isClaimStale('2026-03-01T00:00:00.000Z', '2026-04-05T00:00:00.000Z')).toBe(true);
  });
});

// ─── open question explainability regression ───────────────────────

describe('open question answer explainability', () => {
  const extraction: ExtractionResult = {
    evidence: [
      {
        evidenceType: 'budget_signal',
        quoteText: 'CFO 会在下周确认预算审批路径。',
        summary: '预算审批权目前在 CFO 侧待确认。',
        relevanceScore: 0.92,
        linkedPageTypes: ['overview', 'open_questions'],
      },
    ],
    claims: [
      {
        claimType: 'budget_signal',
        statement: '最终预算审批权很可能在 CFO 手里，但本周尚未正式确认。',
        confidence: 0.81,
        affectedPageTypes: ['overview', 'open_questions'],
        stance: 'supports',
      },
    ],
    openQuestions: [],
    pageUpdates: [],
    summary: '预算审批路径已收敛到 CFO，但仍需一次正式确认。',
  };

  it('returns a resolution object with claim, evidence and summary', () => {
    const resolution = buildResolutionExplanation('谁拥有最终预算审批权？', extraction);

    expect(resolution.claim).toContain('预算审批权');
    expect(resolution.evidence).toContain('CFO');
    expect(resolution.summary).toContain('预算审批路径');
  });

  it('builds answer snippets that include explainability lines', () => {
    const answer = buildAnswerSnippet('谁拥有最终预算审批权？', extraction);

    expect(answer).toContain('CFO');
    expect(answer).toContain('解答依据：');
    expect(answer).toContain('claim：');
    expect(answer).toContain('evidence：');
    expect(answer).toContain('summary：');
  });
});

// ─── lint / refresh pass ───────────────────────────────────────────

describe('lintHighImpactClaims', () => {
  it('flags high-impact claims that have gone too long without revalidation', () => {
    const findings = lintHighImpactClaims([
      {
        id: 'claim-1',
        claim_type: 'risk_hypothesis',
        statement: '采购会阻塞本季度推进',
        confidence: 0.86,
        status: 'active',
        last_revalidated_at: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'claim-2',
        claim_type: 'general',
        statement: '客户对 demo 反馈积极',
        confidence: 0.55,
        status: 'active',
        last_revalidated_at: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'claim-3',
        claim_type: 'budget_signal',
        statement: '预算被冻结',
        confidence: 0.74,
        status: 'active',
        last_revalidated_at: '2026-03-01T00:00:00.000Z',
      },
    ], '2026-04-05T00:00:00.000Z');

    expect(findings).toHaveLength(2);
    expect(findings[0].claimId).toBe('claim-3');
    expect(findings[0].severity).toBe('stale_candidate');
    expect(findings[1].claimId).toBe('claim-1');
    expect(findings[1].severity).toBe('review');
  });

  it('ignores recently revalidated or low-impact claims', () => {
    const findings = lintHighImpactClaims([
      {
        id: 'claim-4',
        claim_type: 'general',
        statement: '客户喜欢报告样式',
        confidence: 0.45,
        status: 'active',
        last_revalidated_at: '2026-04-03T00:00:00.000Z',
      },
      {
        id: 'claim-5',
        claim_type: 'general',
        statement: '联系人偏好微信沟通',
        confidence: 0.69,
        status: 'active',
        last_revalidated_at: '2026-03-10T00:00:00.000Z',
      },
    ], '2026-04-05T00:00:00.000Z');

    expect(findings).toEqual([]);
  });
});
