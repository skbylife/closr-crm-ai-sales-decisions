// BABEL Engine — Layer 3: Cultural Context
// Decodes communication through cultural lenses — Hofstede dimensions,
// Erin Meyer culture map, face culture, directness norms, and business etiquette.

import type { CultureCode, CulturalDecodeInput, CulturalDecodeOutput, ContactProfileResult } from './types';
import { callAIWithFallback } from './ai-fallback';
import {
  buildCulturalDecodePrompt,
  buildEnhancedCulturalPrompt,
} from './prompts/cultural';

// ─── Culture Detection (Rule-Based, No AI) ──────────────────────────

// 邮件域名 → 国家 TLD 映射
const DOMAIN_CULTURE_MAP: Record<string, CultureCode> = {
  '.cn': 'chinese_business',
  '.com.cn': 'chinese_business',
  '.jp': 'japanese_business',
  '.co.jp': 'japanese_business',
  '.kr': 'korean_business',
  '.co.kr': 'korean_business',
  '.sa': 'middle_eastern_business',
  '.ae': 'middle_eastern_business',
  '.qa': 'middle_eastern_business',
  '.kw': 'middle_eastern_business',
  '.bh': 'middle_eastern_business',
  '.om': 'middle_eastern_business',
  '.eg': 'middle_eastern_business',
  '.lb': 'middle_eastern_business',
  '.jo': 'middle_eastern_business',
  '.iq': 'middle_eastern_business',
  '.ir': 'middle_eastern_business',
  '.de': 'european_business',
  '.fr': 'european_business',
  '.nl': 'european_business',
  '.se': 'european_business',
  '.no': 'european_business',
  '.dk': 'european_business',
  '.fi': 'european_business',
  '.it': 'european_business',
  '.es': 'european_business',
  '.pt': 'european_business',
  '.at': 'european_business',
  '.ch': 'european_business',
  '.be': 'european_business',
  '.uk': 'european_business',
  '.co.uk': 'european_business',
};

// Unicode 范围检测语言
const LANGUAGE_PATTERNS: { pattern: RegExp; culture: CultureCode }[] = [
  // 中文（CJK Unified Ideographs — 排除日文假名独占范围）
  { pattern: /[\u4e00-\u9fff]{3,}/, culture: 'chinese_business' },
  // 日文假名（平假名 + 片假名）
  { pattern: /[\u3040-\u309f\u30a0-\u30ff]{2,}/, culture: 'japanese_business' },
  // 韩文 Hangul
  { pattern: /[\uac00-\ud7af\u1100-\u11ff]{2,}/, culture: 'korean_business' },
  // 阿拉伯文
  { pattern: /[\u0600-\u06ff\u0750-\u077f]{3,}/, culture: 'middle_eastern_business' },
];

// 日文特有：如果同时有汉字和假名，优先判定为日文
function hasJapaneseKana(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
}

/**
 * 从邮件地址和内容检测文化背景。纯规则匹配，不调 AI。
 * 优先级：内容语言 > 邮件域名 > 默认美国商务
 */
export function detectCulture(
  email: string,
  content: string,
): CultureCode {
  // 1. 内容语言检测（最高优先级）
  // 日文特殊处理：同时有汉字和假名 → 日文
  if (hasJapaneseKana(content) && /[\u4e00-\u9fff]/.test(content)) {
    return 'japanese_business';
  }

  for (const { pattern, culture } of LANGUAGE_PATTERNS) {
    if (pattern.test(content)) {
      // 如果匹配到中文 pattern，再确认没有日文假名
      if (culture === 'chinese_business' && hasJapaneseKana(content)) {
        return 'japanese_business';
      }
      return culture;
    }
  }

  // 2. 邮件域名检测
  const emailLower = email.toLowerCase();
  // 先匹配长后缀（.com.cn 优先于 .cn）
  const sortedDomains = Object.keys(DOMAIN_CULTURE_MAP).sort((a, b) => b.length - a.length);
  for (const domain of sortedDomains) {
    if (emailLower.endsWith(domain)) {
      return DOMAIN_CULTURE_MAP[domain];
    }
  }

  // 3. 默认：美国商务
  return 'american_business';
}

// ─── Core Cultural Decode (AI-Powered) ──────────────────────────────

interface GeminiCulturalResponse {
  literal: string;
  actualMeaning: string;
  culturalContext: string;
  confidence: number;
  counterStrategy: string;
  crossCulturalNote?: string;
}

/**
 * 文化解码：通过文化框架分析商务沟通的真实意图。
 * 调用 AI，基于 Hofstede + Erin Meyer 框架解读。
 */
export async function decodeCultural(
  input: CulturalDecodeInput,
): Promise<CulturalDecodeOutput> {
  const systemPrompt = buildCulturalDecodePrompt(input.sourceCulture);

  const contextParts: string[] = [];
  if (input.relationship) contextParts.push(`Relationship stage: ${input.relationship}`);
  if (input.formality) contextParts.push(`Communication formality: ${input.formality}`);
  const contextLine = contextParts.length > 0 ? `\n\nContext: ${contextParts.join('. ')}` : '';

  const userPrompt = `Analyze this business communication:

"${input.text}"

Source culture: ${input.sourceCulture.replace(/_/g, ' ')}${contextLine}

Decode the cultural subtext and provide actionable intelligence.`;

  const raw = await callAIWithFallback<GeminiCulturalResponse>({
    systemPrompt,
    userPrompt,
  });

  return {
    literal: raw.literal ?? '',
    actualMeaning: raw.actualMeaning ?? '',
    culturalContext: raw.culturalContext ?? '',
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.5)),
    counterStrategy: raw.counterStrategy ?? '',
    crossCulturalNote: raw.crossCulturalNote,
  };
}

// ─── Enhanced Cultural Decode (Culture + DISC Profile) ──────────────

/**
 * 增强版文化解码：结合心理画像的 DISC 类型，
 * 文化框架 + 个人特征 = 更精准的解读。
 * 例：一个 Dominant 型的日本人可能比典型日本商务人士更直接。
 */
export async function enhancedCulturalDecode(
  input: CulturalDecodeInput,
  contactProfile?: ContactProfileResult,
): Promise<CulturalDecodeOutput> {
  // 提取 DISC 类型（从 decisionStyle 推断）
  const discType = contactProfile?.decisionStyle?.type;
  const discMap: Record<string, string> = {
    driver: 'D (Dominant)',
    expressive: 'I (Influence)',
    amiable: 'S (Steadiness)',
    analytical: 'C (Conscientiousness)',
  };
  const discLabel = discType ? discMap[discType] : undefined;

  const systemPrompt = buildEnhancedCulturalPrompt(input.sourceCulture, discLabel);

  const contextParts: string[] = [];
  if (input.relationship) contextParts.push(`Relationship stage: ${input.relationship}`);
  if (input.formality) contextParts.push(`Communication formality: ${input.formality}`);
  if (contactProfile) {
    contextParts.push(`Risk appetite: ${contactProfile.riskAppetite}`);
    contextParts.push(`Communication style: ${contactProfile.communication.formality}, ${contactProfile.communication.lengthPreference}`);
  }
  const contextLine = contextParts.length > 0 ? `\n\nContext: ${contextParts.join('. ')}` : '';

  const userPrompt = `Analyze this business communication with cultural + personality intelligence:

"${input.text}"

Source culture: ${input.sourceCulture.replace(/_/g, ' ')}${contextLine}

Decode the cultural subtext, factoring in the individual's personality profile.`;

  const raw = await callAIWithFallback<GeminiCulturalResponse>({
    systemPrompt,
    userPrompt,
  });

  return {
    literal: raw.literal ?? '',
    actualMeaning: raw.actualMeaning ?? '',
    culturalContext: raw.culturalContext ?? '',
    confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.5)),
    counterStrategy: raw.counterStrategy ?? '',
    crossCulturalNote: raw.crossCulturalNote,
  };
}
