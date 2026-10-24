import { describe, expect, it } from 'vitest';
import { getAllDemoData, getChineseDemoData, getDemoData, getEnglishDemoData } from './index';

// The private demo corpus is deliberately not redistributed. Keep the public
// compatibility entry points usable without silently restoring customer-like seeds.
describe('source distribution demo-data boundary', () => {
  it.each(['seed-a', 'seed-b-retail'] as const)('contains no bundled records in %s in either locale', variant => {
    for (const data of [getDemoData(variant, 'zh'), getDemoData(variant, 'en'), getChineseDemoData(variant), getEnglishDemoData(variant)]) {
      for (const rows of Object.values(data)) expect(rows).toEqual([]);
    }
  });
  it('keeps the legacy aggregate empty as well', () => {
    for (const rows of Object.values(getAllDemoData())) expect(rows).toEqual([]);
  });
});
