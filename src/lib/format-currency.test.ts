import { describe, expect, it } from 'vitest';

import { currencyForLocale, formatCurrency, normalizeCurrencyCode } from './format-currency';

describe('currency locale defaults', () => {
  it('uses CNY for Chinese UI', () => {
    expect(currencyForLocale('zh', 'en-US')).toBe('CNY');
  });

  it('uses USD for generic English or US English', () => {
    expect(currencyForLocale('en')).toBe('USD');
    expect(currencyForLocale('en', 'en-US')).toBe('USD');
  });

  it('maps major English-speaking regions to local currencies', () => {
    expect(currencyForLocale('en', 'en-GB')).toBe('GBP');
    expect(currencyForLocale('en', 'en-CA')).toBe('CAD');
    expect(currencyForLocale('en', 'en-AU')).toBe('AUD');
    expect(currencyForLocale('en', 'en-NZ')).toBe('NZD');
    expect(currencyForLocale('en', 'en-SG')).toBe('SGD');
    expect(currencyForLocale('en', 'en-HK')).toBe('HKD');
    expect(currencyForLocale('en', 'en-IE')).toBe('EUR');
    expect(currencyForLocale('en', 'en-IN')).toBe('INR');
    expect(currencyForLocale('en', 'en-ZA')).toBe('ZAR');
    expect(currencyForLocale('en', 'en-NG')).toBe('NGN');
  });

  it('normalizes and formats supported currencies', () => {
    expect(normalizeCurrencyCode('gbp')).toBe('GBP');
    expect(normalizeCurrencyCode('BTC')).toBeNull();
    expect(formatCurrency(1200000, 'GBP', 'en')).toBe('£1.2M');
    expect(formatCurrency(1200000, 'AUD', 'en')).toBe('A$1.2M');
  });
});
