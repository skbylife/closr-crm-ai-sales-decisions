import { getHeroCaseData } from './hero-case';
import { getCaseASilentData } from './case-a-silent';
import { getCaseBStuckData } from './case-b-stuck';
import { getRetailSeedData } from './retail';
import { mergeCaseData } from './types';
import type { CaseData } from './types';
import type { DemoSeedVariant } from './variants';

/**
 * Seed A is the stable Chinese Enterprise 1.0 demo.
 *
 * Keep this as the only Chinese seed assembly point. English seeds should use
 * their own entry point instead of asking callers to localize this object.
 */
export function getPrimaryChineseDemoData(): CaseData {
  return mergeCaseData(
    getHeroCaseData(),
    getCaseASilentData(),
    getCaseBStuckData(),
  );
}

export function getChineseDemoData(variant: DemoSeedVariant = 'seed-a'): CaseData {
  return variant === 'seed-b-retail' ? getRetailSeedData() : getPrimaryChineseDemoData();
}
