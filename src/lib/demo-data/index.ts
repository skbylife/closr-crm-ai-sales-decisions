// ═══════════════════════════════════════════════════════════════════════
// Demo Data Aggregator
// Imports all case modules and merges them into a single CaseData object
// ═══════════════════════════════════════════════════════════════════════

import { getChineseDemoData, getPrimaryChineseDemoData } from './chinese';
import { getEnglishDemoData } from './english';
import type { CaseData } from './types';
import { normalizeProductLocale } from '@/lib/locale-contract';
import {
  normalizeDemoSeedLocale,
  normalizeDemoSeedVariant,
  type DemoSeedLocale,
  type DemoSeedVariant,
} from './variants';

export type { CaseData } from './types';
export type { DemoSeedLocale, DemoSeedVariant } from './variants';
export { ACC, CON, OPP, EV, CL } from './ids';
export { mergeCaseData } from './types';
export { getChineseDemoData, getEnglishDemoData };
export { localizeDemoValue } from './english';

/**
 * Get all demo data merged from:
 * - Hero case (华东某头部互联网平台)
 * - Case A (某全国性股份制银行 — 客户沉默但内部仍在推进)
 * - Case B (某全国性通信运营商 — Champion活跃但deal不动)
 * - No supporting accounts in the primary seed: Enterprise 1.0 demo stays focused on 3 scenarios
 */
export function getAllDemoData(): CaseData {
  return getPrimaryChineseDemoData();
}

/**
 * Seed A is the current stable Enterprise 1.0 demo.
 * Seed B is a separate 3-account retail demo for executive retail demos
 * and does not include Seed A accounts.
 */
export function getDemoData(
  variant: DemoSeedVariant = 'seed-a',
  locale: DemoSeedLocale = 'zh',
): CaseData {
  const normalizedLocale = normalizeProductLocale(locale);
  return normalizedLocale === 'en' ? getEnglishDemoData(variant) : getChineseDemoData(variant);
}

export { normalizeDemoSeedLocale, normalizeDemoSeedVariant };
