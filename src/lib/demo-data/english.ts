import type { CaseData } from './types';
import englishSeedA from './english-seed-a.json';
import englishSeedBRetail from './english-seed-b-retail.json';
import type { DemoSeedVariant } from './variants';
import type { ProductLocale } from '@/lib/locale-contract';

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike | undefined };

const REPLACEMENTS: Array<[string, string]> = [];

const SENTENCE_REPLACEMENTS: Array<[RegExp, string]> = [];

function translateText(text: string): string {
  let translated = text;
  const ordered = [...REPLACEMENTS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of ordered) {
    translated = translated.split(from).join(to);
  }
  for (const [pattern, to] of SENTENCE_REPLACEMENTS) {
    translated = translated.replace(pattern, to);
  }
  return translated;
}

function englishFallbackForKey(key: string | undefined): string {
  if (!key) return 'Review the specific decision evidence';
  if (/(name|clientName|accountName)$/i.test(key)) return 'Named stakeholder';
  if (/(contact|owner|who|speaker|assignedTo)$/i.test(key)) return 'Decision owner';
  if (/(title|subject|step)$/i.test(key)) return 'Decision evidence review';
  if (/(emailText|fullText|draft|message|content|body|transcript)$/i.test(key)) {
    return 'Sanitized customer communication excerpt prepared for demo analysis.';
  }
  if (/(notes|summary|description|reason|reasoning|narrative|detail|analysis|evidence|what|why|goal|approach|mitigation|risk|opportunity|signal|text)$/i.test(key)) {
    return 'Review account context, risk, stakeholders, and next action.';
  }
  if (/(department|role|industry)$/i.test(key)) return 'Business team';
  return 'Review the specific decision evidence';
}

function localizeValue(value: unknown, locale: ProductLocale, key?: string): unknown {
  if (locale !== 'en') return value;
  if (Array.isArray(value)) return value.map((item) => localizeValue(item, locale, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        localizeValue(childValue, locale, childKey),
      ]),
    );
  }
  if (typeof value !== 'string') return value;
  if (key === 'preferred_language') return 'en';
  const translated = translateText(value);
  return /[\u4e00-\u9fff]/.test(translated) ? englishFallbackForKey(key) : translated;
}

export function localizeDemoValue<T>(value: T, locale: ProductLocale): T {
  return localizeValue(value as JsonLike, locale) as T;
}

const ENGLISH_DEMO_DATA_BY_VARIANT: Record<DemoSeedVariant, CaseData> = {
  'seed-a': englishSeedA as CaseData,
  'seed-b-retail': englishSeedBRetail as CaseData,
};

function cloneEnglishDemoData(data: CaseData): CaseData {
  return JSON.parse(JSON.stringify(data)) as CaseData;
}

export function getEnglishDemoData(variant: DemoSeedVariant = 'seed-a'): CaseData {
  return cloneEnglishDemoData(ENGLISH_DEMO_DATA_BY_VARIANT[variant] ?? ENGLISH_DEMO_DATA_BY_VARIANT['seed-a']);
}

type DemoRecord = Record<string, unknown>;

function mergeStep(existing: unknown, override: DemoRecord): DemoRecord {
  return {
    ...((existing && typeof existing === 'object') ? existing as DemoRecord : {}),
    ...override,
  };
}

function replaceStrategicPlayText(play: DemoRecord, override: DemoRecord): DemoRecord {
  const existingSteps = Array.isArray(play.steps) ? play.steps : [];
  const overrideSteps = Array.isArray(override.steps) ? override.steps as DemoRecord[] : [];
  return {
    ...play,
    ...override,
    steps: existingSteps.map((step, index) => mergeStep(step, overrideSteps[index] ?? {})),
  };
}

function meaningfulStrategicPlayFallback(key: string | undefined): string {
  if (!key) return 'Strategic play item';
  if (/title|subject/i.test(key)) return 'Customer-source evidence';
  if (/relevanceReason|reasoning|reason|rationale/i.test(key)) return 'Relevant evidence for the current sales judgment.';
  if (/contentSnippet|snippet|summary|description|detail|analysis/i.test(key)) return 'Customer context, stakeholder signal, risk, and recommended next move for this opportunity.';
  if (/goal_description|goal|objective/i.test(key)) return 'Advance the account strategy through evidence-backed stakeholder action.';
  if (/action/i.test(key)) return 'Run the next stakeholder action and capture the result.';
  if (/purpose|why/i.test(key)) return 'Validate the account judgment and reduce execution risk.';
  if (/risk/i.test(key)) return 'The customer may delay, challenge the evidence, or require additional approval.';
  if (/fallback/i.test(key)) return 'Use an alternate stakeholder route and narrow the scope if needed.';
  if (/target|who|owner|contact/i.test(key)) return 'Customer stakeholder';
  if (/timing/i.test(key)) return 'Next two weeks';
  if (/learning|lesson/i.test(key)) return 'Future plays should connect relationship access, proof, and procurement path before execution.';
  if (/evidence/i.test(key)) return 'Evidence from customer communication, discovery notes, and execution history.';
  if (/text|note|impact/i.test(key)) return 'Validate this assumption with customer evidence before relying on it.';
  if (/name/i.test(key)) return 'Alternate stakeholder route';
  return 'Strategic play detail';
}

function scrubStrategicPlayPlaceholders(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => scrubStrategicPlayPlaceholders(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as DemoRecord).map(([childKey, childValue]) => [
        childKey,
        scrubStrategicPlayPlaceholders(childValue, childKey),
      ]),
    );
  }
  if (typeof value !== 'string') return value;
  return /English demo (value|signal|analysis|item|communication content)/i.test(value)
    || /^Sales detail$/i.test(value)
    || value === 'English Demo Account'
    || value === 'English Demo Stakeholder'
    ? meaningfulStrategicPlayFallback(key)
    : value;
}

const ENGLISH_STRATEGIC_PLAY_OVERRIDES: DemoRecord[] = [];

const ENGLISH_OPPORTUNITY_NAMES: Record<string, string> = {};

const ENGLISH_OPPORTUNITY_NOTES: Record<string, string> = {};

const ENGLISH_OPPORTUNITY_OVERRIDES: Record<string, DemoRecord> = {};

const ENGLISH_CONTACT_OVERRIDES: Record<string, Pick<DemoRecord, 'name' | 'email' | 'title' | 'department'>> = {};

const ENGLISH_ACCOUNT_OVERRIDES: Record<string, Pick<DemoRecord, 'name' | 'industry' | 'notes'>> = {};

function polishEnglishStrategicPlays(data: CaseData): CaseData {
  return {
    ...data,
    accounts: data.accounts.map((account) => scrubStrategicPlayPlaceholders({
      ...account,
      ...(typeof account.id === 'string' ? ENGLISH_ACCOUNT_OVERRIDES[account.id] ?? {} : {}),
    }) as DemoRecord),
    contacts: data.contacts.map((contact) => scrubStrategicPlayPlaceholders({
      ...contact,
      ...(typeof contact.id === 'string' ? ENGLISH_CONTACT_OVERRIDES[contact.id] ?? {} : {}),
    }) as DemoRecord),
    opportunities: data.opportunities.map((opportunity) => scrubStrategicPlayPlaceholders({
      ...opportunity,
      ...(typeof opportunity.id === 'string' ? ENGLISH_OPPORTUNITY_OVERRIDES[opportunity.id] ?? {} : {}),
      name: typeof opportunity.id === 'string'
        ? ENGLISH_OPPORTUNITY_NAMES[opportunity.id] ?? opportunity.name
        : opportunity.name,
      notes: typeof opportunity.id === 'string'
        ? ENGLISH_OPPORTUNITY_NOTES[opportunity.id] ?? opportunity.notes
        : opportunity.notes,
    }) as DemoRecord),
    strategicPlays: data.strategicPlays.map((play, index) => scrubStrategicPlayPlaceholders(replaceStrategicPlayText(
      play,
      ENGLISH_STRATEGIC_PLAY_OVERRIDES[index] ?? {},
    )) as DemoRecord),
  };
}

export function localizeDemoData(data: CaseData, locale: ProductLocale): CaseData {
  const localized = localizeDemoValue(data, locale);
  return locale === 'en' ? polishEnglishStrategicPlays(localized) : localized;
}
