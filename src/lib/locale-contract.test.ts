import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_LOCALE,
  DEFAULT_SEED_LOCALE,
  isEnglishLocale,
  normalizeProductLocale,
  normalizeSeedLocale,
  outputLocaleFromProductLocale,
} from './locale-contract';
import { DEFAULT_OUTPUT_LOCALE, normalizeOutputLocale } from './output-locale';

describe('locale contract', () => {
  it('keeps Chinese as the default for product, seed, and AI output locales', () => {
    expect(DEFAULT_PRODUCT_LOCALE).toBe('zh');
    expect(DEFAULT_SEED_LOCALE).toBe('zh');
    expect(DEFAULT_OUTPUT_LOCALE).toBe('zh');
    expect(normalizeProductLocale(undefined)).toBe('zh');
    expect(normalizeSeedLocale(null)).toBe('zh');
    expect(normalizeOutputLocale('')).toBe('zh');
  });

  it('only switches to English on the explicit en value', () => {
    expect(normalizeProductLocale('en')).toBe('en');
    expect(normalizeSeedLocale('en')).toBe('en');
    expect(normalizeOutputLocale('en')).toBe('en');
    expect(outputLocaleFromProductLocale('en')).toBe('en');
    expect(isEnglishLocale('en')).toBe(true);
  });

  it('does not treat arbitrary locale-like values as English', () => {
    for (const value of ['EN', 'english', 'en-US', 'zh', 'fr', true]) {
      expect(normalizeProductLocale(value)).toBe('zh');
      expect(normalizeOutputLocale(value)).toBe('zh');
      expect(isEnglishLocale(value)).toBe(false);
    }
  });
});

