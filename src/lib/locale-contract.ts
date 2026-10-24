export type ProductLocale = 'zh' | 'en';
export type SeedLocale = ProductLocale;

export const DEFAULT_PRODUCT_LOCALE: ProductLocale = 'zh';
export const DEFAULT_SEED_LOCALE: SeedLocale = DEFAULT_PRODUCT_LOCALE;

export function normalizeProductLocale(value: unknown): ProductLocale {
  return value === 'en' ? 'en' : DEFAULT_PRODUCT_LOCALE;
}

export function normalizeSeedLocale(value: unknown): SeedLocale {
  return normalizeProductLocale(value);
}

export function outputLocaleFromProductLocale(value: unknown): ProductLocale {
  return normalizeProductLocale(value);
}

export function isEnglishLocale(value: unknown): boolean {
  return normalizeProductLocale(value) === 'en';
}

