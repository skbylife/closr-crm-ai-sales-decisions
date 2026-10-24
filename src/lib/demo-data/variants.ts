import { DEFAULT_PRODUCT_LOCALE, normalizeProductLocale, type ProductLocale } from '@/lib/locale-contract';

export type DemoSeedVariant = 'seed-a' | 'seed-b-retail';
export type DemoSeedLocale = ProductLocale;

export function normalizeDemoSeedVariant(value: unknown): DemoSeedVariant {
  return value === 'seed-b-retail' || value === 'B' ? 'seed-b-retail' : 'seed-a';
}

export function normalizeDemoSeedLocale(value: unknown): DemoSeedLocale {
  return normalizeProductLocale(value ?? DEFAULT_PRODUCT_LOCALE);
}
