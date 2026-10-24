// BABEL Engine — Layer 1: Signal Decode
// Analyzes messages to extract intent signals, urgency, and hidden meanings.

import type { DecodeInput, DecodeOutput, DecodedMessage, DecodeMessage, ThreadAnalysis, DecodeActionItem } from './types';
import { callAIWithFallback } from './ai-fallback';
import type { AIInvocationContext } from '@/lib/ai-invocation-log';
import type { ModelTier } from './gemini';
import { BASE_PSYCHOLOGY_FRAMEWORK, CONFIDENCE_CALIBRATION } from './prompts/base';
import { B2B_SALES_PROMPT } from './prompts/b2b-sales';
import { normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const OCR_APPEND_MARKER = '【图片内容（OCR）】';

/**
 * Merge OCR-extracted text into the email body with a separator marker.
 * Pure function — safe for unit testing.
 */
export function mergeOcrTextIntoEmailText(emailText: string, ocrText?: string): string {
  const trimmedOcrText = ocrText?.trim();
  if (!trimmedOcrText) return emailText;
  return emailText
    ? `${emailText}\n\n${OCR_APPEND_MARKER}\n${trimmedOcrText}`
    : trimmedOcrText;
}

/**
 * Parse raw email text into speaker-tagged messages.
 * Splits on common thread delimiters, reverses to chronological order,
 * and alternates speaker assignment.
 */
export function parseEmailToMessages(emailText: string): DecodeMessage[] {
  const parts = emailText.split(
    /(?:^|\n)(?:---+|___+|>{3,}|\bOn .+wrote:\s*$|\bFrom:\s+.+\n|\b发件人[:：].+\n)/m
  );

  if (parts.length <= 1) {
    return [{ speaker: 'them', text: emailText.trim() }];
  }

  const cleaned = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .reverse();

  return cleaned.map((text, i) => ({
    speaker: (i % 2 === 0 ? 'them' : 'me') as 'them' | 'me',
    text,
  }));
}

// Gemini Structured Output schema for decode responses
const DECODE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string', enum: ['them', 'me'] },
          original: { type: 'string' },
          meaning: { type: 'string' },
          emotion: { type: 'string' },
          urgency: { type: 'number' },
          confidence: { type: 'number' },
        },
        required: ['speaker', 'original', 'meaning', 'emotion', 'urgency', 'confidence'],
      },
    },
    thread_analysis: {
      type: 'object',
      properties: {
        sentiment_trend: { type: 'string', enum: ['warming', 'cooling', 'stable', 'volatile'] },
        risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        buyer_state: { type: 'string', enum: ['engaged', 'evaluating', 'stalling', 'ghosting', 'evaluator_to_ghost', 'ready_to_buy'] },
        key_signal: { type: 'string' },
      },
      required: ['sentiment_trend', 'risk_level', 'buyer_state', 'key_signal'],
    },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due_in_days: { type: 'number' },
          reasoning: { type: 'string' },
          target_person: { type: 'string' },
          target_role: { type: 'string' },
        },
        required: ['title', 'priority', 'due_in_days', 'reasoning'],
      },
    },
  },
  required: ['messages', 'thread_analysis', 'action_items'],
};

interface GeminiDecodeResponse {
  messages: Array<{
    speaker: 'them' | 'me';
    original: string;
    meaning: string;
    emotion: string;
    urgency: number;
    confidence: number;
  }>;
  thread_analysis: {
    sentiment_trend: string;
    risk_level: string;
    buyer_state: string;
    key_signal: string;
  };
  action_items?: Array<{
    title: string;
    priority: string;
    due_in_days: number;
    reasoning: string;
    target_person?: string;
    target_role?: string;
  }>;
}

const DISC_DECODE_HINTS: Record<string, string> = {
  D: '此联系人为 D 型（支配型/Driver）：沟通直接、结果导向、不耐烦废话。解读时注意：他们说的话往往就是字面意思，隐藏信号更多体现在"没说的事"和"语气变化"上。',
  I: '此联系人为 I 型（影响型/Expressive）：热情外向、重关系、爱讲故事。解读时注意：他们的热情不等于承诺，需要区分"社交性认可"和"真实购买信号"。',
  S: '此联系人为 S 型（稳定型/Amiable）：求稳、避免冲突、决策慢。解读时注意：他们很少直接拒绝，"我再想想"可能就是婉拒。沉默和拖延是关键风险信号。',
  C: '此联系人为 C 型（谨慎型/Analytical）：重数据、重逻辑、追求完美。解读时注意：他们问很多细节不代表有兴趣，可能只是在找漏洞。关注他们是否开始讨论实施细节（正面信号）。',
};

function buildDiscDirective(discType?: string): string {
  if (!discType) return '';
  const hint = DISC_DECODE_HINTS[discType.toUpperCase()];
  return hint ? `\n## DISC 性格适配\n${hint}` : '';
}

export function buildDecodePrompt(input: DecodeInput, contextMemory?: string, culturalContext?: string, cilContext?: string): { system: string; user: string } {
  const domainPrompt = input.domain === 'b2b_sales' ? B2B_SALES_PROMPT : '';
  const outputLocale = normalizeOutputLocale(input.outputLocale);
  const isEnglish = outputLocale === 'en';

  // DISC 性格适配指令
  const discDirective = buildDiscDirective(input.contactDiscType);

  const system = [
    BASE_PSYCHOLOGY_FRAMEWORK,
    CONFIDENCE_CALIBRATION,
    domainPrompt,
    culturalContext || '',
    contextMemory || '',
    cilContext || '',
    discDirective,
    `
## Output Schema

Return valid JSON matching this exact structure:
{
  "messages": [
    {
      "speaker": "them" | "me",
      "original": "the original message text",
      "meaning": "${isEnglish ? 'One sharp sentence that reveals the true intent, under 14 words, bullet-point style' : '一句话点破真实意图，不超过20字，用bullet point风格'}",
      "emotion": "${isEnglish ? 'One word or short phrase describing the emotion' : '一个词概括情绪（如：焦虑、伪装冷静、试探、防御）'}",
      "urgency": 1-10,
      "confidence": 0.0-1.0
    }
  ],
  "thread_analysis": {
    "sentiment_trend": "warming" | "cooling" | "stable" | "volatile",
    "risk_level": "low" | "medium" | "high" | "critical",
    "buyer_state": "engaged" | "evaluating" | "stalling" | "ghosting" | "evaluator_to_ghost" | "ready_to_buy",
    "key_signal": "${isEnglish ? 'One sentence summarizing the most important signal, under 18 words' : '一句话总结最关键的信号，不超过25字'}"
  },
  "action_items": [
    {
      "title": "${isEnglish ? 'Specific actionable next step in English' : '具体可执行的行动（中文）'}",
      "priority": "low" | "medium" | "high" | "urgent",
      "due_in_days": 1-14,
      "reasoning": "${isEnglish ? 'Why this action is needed, in English' : '为什么需要这个行动（中文）'}",
      "target_person": "${isEnglish ? 'Who should be contacted or influenced next, if clear from the message' : '下一步建议跟进或影响的人；如果邮件里不明确则留空'}",
      "target_role": "${isEnglish ? 'The target person role, if clear' : '该对象角色，如采购、技术评审、预算人、内线；不明确则留空'}"
    }
  ]
}

Generate 2-5 action items based on the email analysis. Each action should be specific, actionable, and tied to signals found in the messages. If the next action is clearly about a person, fill target_person and target_role so the UI can show who to follow up with.

Analyze EVERY message in the thread.

## 输出风格
- ${isEnglish ? 'Concise, executive-ready, bullet-point style' : '简洁有力，bullet point 风格'}
- ${isEnglish ? 'meaning under 14 words; one sentence that cuts to the point' : 'meaning 不超过 20 字，一句话戳中要害'}
- ${isEnglish ? 'emotion should be one word or a short phrase, not a sentence' : 'emotion 用一个词，不要长句'}
- ${isEnglish ? 'key_signal under 18 words' : 'key_signal 不超过 25 字'}
- ${isEnglish ? 'No fluff, no repetition, no polite filler' : '不要写废话、不要重复原文、不要客套'}
- ${isEnglish ? 'Write like an intelligence brief for a sales leader' : '像给老板汇报一样精炼'}

${outputLocaleInstruction(outputLocale)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const messagesText = input.messages
    .map((m) => `[${m.speaker === 'them' ? 'CLIENT' : 'YOU'}]: ${m.text}`)
    .join('\n\n');

  const contextLine = input.context ? `\nAdditional context: ${input.context}` : '';

  const user = `Decode the following email thread:

${messagesText}
${contextLine}

Analyze each message for hidden signals, intent patterns, and true meaning.`;

  return { system, user };
}

function normalizeResponse(raw: GeminiDecodeResponse): DecodeOutput {
  const validTrends = ['warming', 'cooling', 'stable', 'volatile'] as const;
  const validRisks = ['low', 'medium', 'high', 'critical'] as const;
  const validStates = ['engaged', 'evaluating', 'stalling', 'ghosting', 'evaluator_to_ghost', 'ready_to_buy'] as const;

  const messages: DecodedMessage[] = (raw.messages ?? []).map((m) => ({
    speaker: m.speaker === 'me' ? 'me' : 'them',
    original: m.original ?? '',
    decode: {
      meaning: m.meaning ?? '',
      emotion: m.emotion ?? '',
      urgency: Math.max(1, Math.min(10, Math.round(m.urgency ?? 5))),
      confidence: Math.max(0, Math.min(1, m.confidence ?? 0.5)),
    },
  }));

  const ta = raw.thread_analysis ?? {};
  const threadAnalysis: ThreadAnalysis = {
    sentimentTrend: validTrends.includes(ta.sentiment_trend as typeof validTrends[number])
      ? (ta.sentiment_trend as ThreadAnalysis['sentimentTrend'])
      : 'stable',
    riskLevel: validRisks.includes(ta.risk_level as typeof validRisks[number])
      ? (ta.risk_level as ThreadAnalysis['riskLevel'])
      : 'low',
    buyerState: validStates.includes(ta.buyer_state as typeof validStates[number])
      ? (ta.buyer_state as ThreadAnalysis['buyerState'])
      : 'evaluating',
    keySignal: ta.key_signal ?? '',
  };

  // Parse action items
  const validPriorities = ['low', 'medium', 'high', 'urgent'] as const;
  const actionItems: DecodeActionItem[] = (raw.action_items ?? []).map((item) => ({
    title: item.title ?? '',
    priority: validPriorities.includes(item.priority as typeof validPriorities[number])
      ? (item.priority as DecodeActionItem['priority'])
      : 'medium',
    dueInDays: Math.max(1, Math.min(14, Math.round(item.due_in_days ?? 3))),
    reasoning: item.reasoning ?? '',
    targetPerson: item.target_person || undefined,
    targetRole: item.target_role || undefined,
  }));

  return { messages, threadAnalysis, actionItems: actionItems.length > 0 ? actionItems : undefined };
}

export async function decodeMessages(
  input: DecodeInput,
  contextMemory?: string,
  culturalContext?: string,
  options?: { tier?: ModelTier; cilContext?: string; invocation?: AIInvocationContext },
): Promise<DecodeOutput> {
  const { system, user } = buildDecodePrompt(input, contextMemory, culturalContext, options?.cilContext);
  const raw = await callAIWithFallback<GeminiDecodeResponse>({
    systemPrompt: system,
    userPrompt: user,
    tier: options?.tier,
    jsonSchema: DECODE_OUTPUT_SCHEMA,
    invocation: options?.invocation,
  });
  return normalizeResponse(raw);
}

export async function decodeThread(
  messages: DecodeInput['messages'],
  domain: DecodeInput['domain']
): Promise<DecodeOutput> {
  return decodeMessages({ messages, mode: 'real', domain });
}
