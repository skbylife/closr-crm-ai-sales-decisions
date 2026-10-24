export type CurrencyCode =
  | 'USD'
  | 'CNY'
  | 'EUR'
  | 'GBP'
  | 'CAD'
  | 'AUD'
  | 'NZD'
  | 'SGD'
  | 'HKD'
  | 'INR'
  | 'ZAR'
  | 'NGN';
type CurrencyLocale = 'zh' | 'en';

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  'CNY',
  'USD',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'SGD',
  'HKD',
  'EUR',
  'INR',
  'ZAR',
  'NGN',
];

export const CURRENCY_LABELS: Record<CurrencyCode, { symbol: string; zh: string; en: string }> = {
  CNY: { symbol: '¥', zh: '人民币', en: 'Chinese Yuan' },
  USD: { symbol: '$', zh: '美元', en: 'US Dollar' },
  GBP: { symbol: '£', zh: '英镑', en: 'British Pound' },
  CAD: { symbol: 'C$', zh: '加拿大元', en: 'Canadian Dollar' },
  AUD: { symbol: 'A$', zh: '澳元', en: 'Australian Dollar' },
  NZD: { symbol: 'NZ$', zh: '新西兰元', en: 'New Zealand Dollar' },
  SGD: { symbol: 'S$', zh: '新加坡元', en: 'Singapore Dollar' },
  HKD: { symbol: 'HK$', zh: '港元', en: 'Hong Kong Dollar' },
  EUR: { symbol: '€', zh: '欧元', en: 'Euro' },
  INR: { symbol: '₹', zh: '印度卢比', en: 'Indian Rupee' },
  ZAR: { symbol: 'R', zh: '南非兰特', en: 'South African Rand' },
  NGN: { symbol: '₦', zh: '尼日利亚奈拉', en: 'Nigerian Naira' },
};

const ENGLISH_REGION_CURRENCIES: Record<string, CurrencyCode> = {
  US: 'USD',
  GB: 'GBP',
  UK: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  SG: 'SGD',
  HK: 'HKD',
  IE: 'EUR',
  IN: 'INR',
  ZA: 'ZAR',
  NG: 'NGN',
};

/**
 * 获取全局默认币种（从 Zustand store 读取，通过 getState 避免循环依赖）
 */
function getDefaultCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return 'CNY';
  try {
    // Dynamic import to avoid circular dependency with store.ts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useStore } = require('@/lib/store');
    return normalizeCurrencyCode(useStore.getState().currencyCode) ?? 'CNY';
  } catch {
    return 'CNY';
  }
}

function getDefaultLocale(): CurrencyLocale {
  if (typeof window === 'undefined') return 'zh';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useStore } = require('@/lib/store');
    const storeLocale = useStore.getState().userSettings?.locale;
    if (storeLocale === 'zh' || storeLocale === 'en') return storeLocale;
    const stored = window.localStorage.getItem('closr-locale');
    return stored === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

function getBrowserLocaleTag(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.navigator.languages?.[0] ?? window.navigator.language;
}

function regionFromLocaleTag(languageTag?: string): string | undefined {
  if (!languageTag) return undefined;
  try {
    const region = new Intl.Locale(languageTag).region;
    return region ? region.toUpperCase() : undefined;
  } catch {
    const region = languageTag.match(/[-_]([A-Za-z]{2}|\d{3})\b/)?.[1];
    return region?.toUpperCase();
  }
}

export function normalizeCurrencyCode(value: unknown): CurrencyCode | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase() as CurrencyCode;
  return SUPPORTED_CURRENCIES.includes(code) ? code : null;
}

export function currencyForLocale(locale: CurrencyLocale, languageTag = getBrowserLocaleTag()): CurrencyCode {
  if (locale === 'zh') return 'CNY';
  const region = regionFromLocaleTag(languageTag);
  return region ? ENGLISH_REGION_CURRENCIES[region] ?? 'USD' : 'USD';
}

export function formatCurrency(value: number, currency?: CurrencyCode, locale?: CurrencyLocale): string {
  const code = normalizeCurrencyCode(currency) ?? getDefaultCurrency();
  const displayLocale = locale ?? getDefaultLocale();
  if (code === 'CNY') {
    if (displayLocale === 'en') {
      if (value >= 1_000_000_000) return '¥' + (value / 1_000_000_000).toFixed(1) + 'B';
      if (value >= 1_000_000) return '¥' + (value / 1_000_000).toFixed(1) + 'M';
      if (value >= 1_000) return '¥' + (value / 1_000).toFixed(0) + 'K';
      return '¥' + value.toLocaleString();
    }
    if (value >= 100_000_000) return `¥${(value / 100_000_000).toFixed(1)}亿`;
    if (value >= 10_000) return `¥${(value / 10_000).toFixed(0)}万`;
    return `¥${value.toLocaleString()}`;
  }
  const symbol = CURRENCY_LABELS[code]?.symbol ?? code + ' ';
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`;
  return `${symbol}${value.toLocaleString()}`;
}
