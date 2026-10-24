import { describe, expect, it } from 'vitest';
import { visibleBusinessText } from './visible-business-text';

describe('business text preserves original evidence', () => {
  it.each(['en', 'zh'] as const)('keeps customer wording intact in %s UI', (locale) => {
    const input = '客户原文：Yes，我们尚未批准。\n  Champion / MEDDICC / source_records are quoted identifiers.  ';
    expect(visibleBusinessText(input, locale)).toBe(input);
  });

  it('does not replace unknown Chinese with generic English evidence placeholders', () => {
    const input = '请在周五之前确认附件保存期限，预算尚未批准。';
    expect(visibleBusinessText(input, 'en')).toBe(input);
  });

  it('retains names, punctuation, whitespace, and decision qualifiers', () => {
    const input = 'Yes: "Not approved"\n\n  Project forecast_pattern_01 — 0.64 ≠ a commitment.';
    expect(visibleBusinessText(input)).toBe(input);
  });

  it('returns an empty string only for missing content', () => {
    expect(visibleBusinessText(null)).toBe('');
    expect(visibleBusinessText(undefined)).toBe('');
    expect(visibleBusinessText('')).toBe('');
  });
});
