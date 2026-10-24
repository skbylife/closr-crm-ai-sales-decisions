import { describe, it, expect } from 'vitest';
import { buildRevisionHistory } from '@/lib/judgment';
import { normalizeComparisonWindow } from '@/lib/comparison-window';
import type { AccountMemorySummarySnapshot } from '@/lib/babel-engine/types';

// ─── Minimal snapshot factory ─────────────────────────────────────────

function makeSnapshot(
  id: string,
  lastComputedAt: string,
  timelineHighlightOccurredAt?: string,
): AccountMemorySummarySnapshot {
  return {
    id,
    label: id,
    summary: {
      accountId: 'acc-1',
      narrativeSummary: `narrative-${id}`,
      momentum: { status: 'steady', label: `momentum-${id}`, reasoning: '' },
      people: [],
      tensions: [],
      timelineHighlights: timelineHighlightOccurredAt
        ? [
            {
              id: `hl-${id}`,
              accountId: 'acc-1',
              sourceId: `src-${id}`,
              sourceKind: 'email_decode',
              title: `highlight-${id}`,
              summary: `hl-summary-${id}`,
              occurredAt: timelineHighlightOccurredAt,
              signal: 'positive',
            },
          ]
        : [],
      lastComputedAt,
      confidence: 0.7,
      sourceCoverage: { kinds: [], totalRecords: 1, freshRecords: 1 },
    },
  };
}

// ─── buildRevisionHistory ─────────────────────────────────────────────

describe('buildRevisionHistory', () => {
  it('returns fallback when summaryHistory is empty', () => {
    const fallback = [{ id: 'f1', title: 'fallback', summary: 's', changedAt: '2025-01-01T00:00:00Z' }];
    const result = buildRevisionHistory({
      kind: 'momentum',
      title: '动量',
      summaryHistory: [],
      fallback,
    });
    expect(result).toBe(fallback);
  });

  it('returns fallback when summaryHistory is undefined', () => {
    const fallback = [{ id: 'f1', title: 'fallback', summary: 's', changedAt: '2025-01-01T00:00:00Z' }];
    const result = buildRevisionHistory({
      kind: 'momentum',
      title: '动量',
      summaryHistory: undefined,
      fallback,
    });
    expect(result).toBe(fallback);
  });

  it('returns items in chronological order — oldest first', () => {
    // Snapshots are passed newest→oldest (as if fetched from DB desc order)
    const snapshots = [
      makeSnapshot('snap-3', '2025-03-01T00:00:00Z'),
      makeSnapshot('snap-2', '2025-02-01T00:00:00Z'),
      makeSnapshot('snap-1', '2025-01-01T00:00:00Z'),
    ];
    const result = buildRevisionHistory({
      kind: 'momentum',
      title: '动量',
      summaryHistory: snapshots,
    });
    // After .reverse() the oldest snapshot (originally last) is at index 0
    expect(result[0].id).toBe('动量:snap-1');
    expect(result[1].id).toBe('动量:snap-2');
    expect(result[2].id).toBe('动量:snap-3');
  });

  it('uses timelineHighlights[0].occurredAt as changedAt when present', () => {
    const highlightDate = '2025-04-15T10:00:00Z';
    const computedDate = '2025-04-20T00:00:00Z';
    const snapshots = [makeSnapshot('snap-a', computedDate, highlightDate)];

    const result = buildRevisionHistory({
      kind: 'general',
      title: '事件',
      summaryHistory: snapshots,
    });
    expect(result[0].changedAt).toBe(highlightDate);
  });

  it('falls back to lastComputedAt when timelineHighlights is empty', () => {
    const computedDate = '2025-04-20T00:00:00Z';
    // No highlight date passed → timelineHighlights will be []
    const snapshots = [makeSnapshot('snap-b', computedDate)];

    const result = buildRevisionHistory({
      kind: 'general',
      title: '事件',
      summaryHistory: snapshots,
    });
    expect(result[0].changedAt).toBe(computedDate);
  });
});

// ─── normalizeComparisonWindow ────────────────────────────────────────

describe('normalizeComparisonWindow', () => {
  it.each([14, 30, 90] as const)('passes through valid value %i', (v) => {
    expect(normalizeComparisonWindow(v)).toBe(v);
  });

  it.each([14, 30, 90] as const)('accepts string representation of valid value "%i"', (v) => {
    expect(normalizeComparisonWindow(String(v))).toBe(v);
  });

  it('normalizes undefined to 30', () => {
    expect(normalizeComparisonWindow(undefined)).toBe(30);
  });

  it('normalizes null to 30', () => {
    expect(normalizeComparisonWindow(null)).toBe(30);
  });

  it('normalizes empty string to 30', () => {
    expect(normalizeComparisonWindow('')).toBe(30);
  });

  it('normalizes arbitrary number to 30', () => {
    expect(normalizeComparisonWindow(7)).toBe(30);
    expect(normalizeComparisonWindow(180)).toBe(30);
    expect(normalizeComparisonWindow(0)).toBe(30);
    expect(normalizeComparisonWindow(-1)).toBe(30);
  });

  it('normalizes non-numeric string to 30', () => {
    expect(normalizeComparisonWindow('abc')).toBe(30);
  });
});
