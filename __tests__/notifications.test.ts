import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// The store helpers uid() and findAccountByName() are not exported from
// src/lib/store.ts (they are module-private). We reproduce them here so we
// can unit-test their logic independently. When/if they are extracted to a
// shared utility module these tests can switch to a real import.
// ---------------------------------------------------------------------------

// ── uid() ─────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

describe('uid', () => {
  it('returns a non-empty string', () => {
    expect(uid().length).toBeGreaterThan(0);
  });

  it('generates unique values across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    expect(ids.size).toBe(100);
  });

  it('contains only alphanumeric characters', () => {
    const id = uid();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it('starts with a base-36 timestamp portion', () => {
    const before = Date.now();
    const id = uid();
    // The timestamp portion is Date.now().toString(36).
    // Its length should be ~8 chars for current epoch.
    // We just verify the full id is reasonably long.
    expect(id.length).toBeGreaterThanOrEqual(10);
    const after = Date.now();
    // The first ~8 chars decoded back should be within our time window
    const tsChars = id.slice(0, 8);
    const decoded = parseInt(tsChars, 36);
    // Should be a plausible recent timestamp (within last minute or so)
    expect(decoded).toBeGreaterThan(before - 60_000);
    expect(decoded).toBeLessThanOrEqual(after);
  });
});

// ── findAccountByName() ───────────────────────────────────────────────

interface SimpleAccount {
  id: string;
  name: string;
}

function findAccountByName(
  accounts: SimpleAccount[],
  name: string,
): SimpleAccount | undefined {
  const normalized = name.trim().toLowerCase();
  return accounts.find((a) => a.name.toLowerCase() === normalized);
}

describe('findAccountByName', () => {
  const accounts: SimpleAccount[] = [
    { id: '1', name: 'Acme Corp' },
    { id: '2', name: 'Beta Industries' },
    { id: '3', name: 'GAMMA Tech' },
  ];

  it('finds an account by exact name', () => {
    expect(findAccountByName(accounts, 'Acme Corp')).toEqual({
      id: '1',
      name: 'Acme Corp',
    });
  });

  it('matches case-insensitively', () => {
    expect(findAccountByName(accounts, 'acme corp')?.id).toBe('1');
    expect(findAccountByName(accounts, 'ACME CORP')?.id).toBe('1');
    expect(findAccountByName(accounts, 'gamma tech')?.id).toBe('3');
  });

  it('trims leading and trailing whitespace', () => {
    expect(findAccountByName(accounts, '  Beta Industries  ')?.id).toBe('2');
  });

  it('returns undefined when no match is found', () => {
    expect(findAccountByName(accounts, 'NonExistent')).toBeUndefined();
  });

  it('returns undefined for empty account list', () => {
    expect(findAccountByName([], 'Acme Corp')).toBeUndefined();
  });

  it('returns undefined for empty search string', () => {
    expect(findAccountByName(accounts, '')).toBeUndefined();
  });
});
