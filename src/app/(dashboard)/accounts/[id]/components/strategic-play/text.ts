import { visibleBusinessText } from '@/lib/visible-business-text';

export function normalizeSignalText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isGenericEnglishPlayText(value?: string | null): boolean {
  const text = normalizeSignalText(value ?? '');
  return /^(review customer evidence|review supporting evidence|customer evidence|customer signal|sales signal|account evidence item \d+)$/i.test(text);
}

export function truncateSignalText(value: string, maxLength = 120): string {
  const text = visibleBusinessText(normalizeSignalText(value), currentClientLocale());
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

export function specificSignalText(value: string | undefined | null, fallback: string, maxLength = 120): string {
  const text = value && !isGenericEnglishPlayText(value) ? value : fallback;
  return truncateSignalText(text, maxLength);
}

export function currentClientLocale() {
  if (typeof window === 'undefined') return undefined;
  const stored = window.localStorage.getItem('closr-locale');
  return stored === 'en' || stored === 'zh' ? stored : undefined;
}

export function displayText(value?: string | null): string {
  return visibleBusinessText(value ?? '', currentClientLocale());
}

export function signalLoopLabel(zh: string, en: string): string {
  return currentClientLocale() === 'en' ? en : zh;
}
