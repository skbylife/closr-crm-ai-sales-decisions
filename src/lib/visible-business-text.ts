import type { ProductLocale } from './locale-contract';

/**
 * Business records are user content, not UI translation keys. Keep the original
 * wording in every interface language, including quotes and model analysis.
 * Translate application labels with the locale dictionary at their call sites.
 * The optional locale argument remains for existing callers; it never rewrites data.
 */
export function visibleBusinessText(value?: string | null, _locale?: ProductLocale): string {
  return value ?? '';
}
