import { DEFAULT_PRODUCT_LOCALE, normalizeProductLocale, type ProductLocale } from './locale-contract';

export type OutputLocale = 'zh' | 'en';

export function normalizeOutputLocale(value: unknown): OutputLocale {
  return normalizeProductLocale(value);
}

export function outputLocaleFromProductLocale(value: unknown): OutputLocale {
  return normalizeProductLocale(value);
}

export function outputLocaleInstruction(locale: OutputLocale): string {
  if (locale === 'en') {
    return [
      '## Output Language',
      '- Produce all analysis, recommendations, rationales, summaries, risk descriptions, titles, and action text in English.',
      '- Preserve quoted source evidence, customer names, company names, product names, and original email/RFP excerpts in their original language.',
      '- Keep JSON keys and enum values exactly as specified by the schema.',
      '- If generating an email draft or customer-facing reply, use the customer original language when explicitly requested by that workflow; otherwise explain the analysis in English.',
    ].join('\n');
  }

  return [
    '## 输出语言',
    '- 所有分析、建议、理由、摘要、风险描述、标题和行动文本必须使用中文。',
    '- 引用的原始证据、客户名、公司名、产品名、邮件/RFP 原文片段保留原语言。',
    '- JSON keys 和 enum values 必须严格保持 schema 指定格式。',
  ].join('\n');
}

export function localizedUnavailableText(locale: OutputLocale, text: { zh: string; en: string }): string {
  return locale === 'en' ? text.en : text.zh;
}

export { DEFAULT_PRODUCT_LOCALE as DEFAULT_OUTPUT_LOCALE };
export type { ProductLocale };
