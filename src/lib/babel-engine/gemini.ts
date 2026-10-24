// BABEL Engine — AI Client (Gemini + OpenAI-compatible dual mode)
//
// Mode selection via environment variables:
//   - If AI_BASE_URL/AI_PROVIDER=deepseek is set → OpenAI-compatible mode
//   - Otherwise falls back to GEMINI_API_KEY → Gemini native mode
//
// The exported function name stays `callGemini` so all call-sites work unchanged.

import { logAIInvocation, type AIInvocationContext } from '@/lib/ai-invocation-log';
import {
  DEFAULT_DEEPSEEK_FLASH_MODEL,
  DEFAULT_DEEPSEEK_PRO_MODEL,
  getAiChatCompletionsUrl,
  getAiProviderConfig,
} from '@/lib/ai-provider-config';

export type ModelTier = 'flash' | 'pro';

const MODEL_MAP: Record<ModelTier, string> = {
  flash: 'gemini-2.5-flash',
  pro: 'gemini-2.5-pro',
};

// DeepSeek tier model map. Production can route pro tier to a
// different provider via AI_PRO_BASE_URL / AI_PRO_API_KEY.
const DEEPSEEK_MODEL_MAP: Record<ModelTier, string> = {
  flash: process.env.AI_MODEL ?? DEFAULT_DEEPSEEK_FLASH_MODEL,  // 标准任务：解读、邮件撰写
  pro: process.env.AI_PRO_MODEL ?? DEFAULT_DEEPSEEK_PRO_MODEL,   // 深度推理：谋局、策略分析
};

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const DEFAULT_TEMPERATURE = 0.7;

export interface GeminiRequest {
  systemPrompt: string;
  userPrompt: string;
  tier?: ModelTier;        // 'flash'(default) | 'pro'
  model?: string;          // override: use this model name directly
  temperature?: number;    // default 0.7
  jsonSchema?: Record<string, unknown>;  // Gemini Structured Output / OpenAI json_schema
  invocation?: AIInvocationContext;       // safe observability metadata; never include prompt text
}

interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

// ── helpers ──────────────────────────────────────────────────────────

function getMode(): 'openai' | 'gemini' {
  const config = getAiProviderConfig();
  return config.provider === 'gemini' ? 'gemini' : 'openai';
}

function resolveModel(req: GeminiRequest): string {
  if (req.model) return req.model;
  // Non-Gemini 模式下用分层模型，否则用 Gemini 模型
  if (process.env.AI_BASE_URL) {
    return DEEPSEEK_MODEL_MAP[req.tier ?? 'flash'];
  }
  return MODEL_MAP[req.tier ?? 'flash'];
}

function getGeminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Extract a JSON string from text that may be wrapped in markdown fences.
 */
function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1].trim() : raw.trim();
}

function extractOpenAIUsage(data: unknown): TokenUsage {
  const usage = (data as { usage?: Record<string, unknown> })?.usage;
  return {
    promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null,
    completionTokens: typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null,
    totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : null,
  };
}

function isDeepSeekModel(model: string, baseUrl?: string): boolean {
  return model.toLowerCase().startsWith('deepseek-') || /api\.deepseek\.com/i.test(baseUrl ?? '');
}

function extractGeminiUsage(data: unknown): TokenUsage {
  const usage = (data as { usageMetadata?: Record<string, unknown> })?.usageMetadata;
  return {
    promptTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : null,
    completionTokens: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
    totalTokens: typeof usage?.totalTokenCount === 'number' ? usage.totalTokenCount : null,
  };
}

// ── OpenAI-compatible backend ────────────────────────────────────────

async function callOpenAICompatible<T>(req: GeminiRequest): Promise<T> {
  const tier = req.tier ?? 'flash';
  const useProProvider = tier === 'pro' && (!req.model || req.model === process.env.AI_PRO_MODEL);
  const config = getAiProviderConfig(useProProvider ? 'pro' : 'flash');
  const model = req.model ?? config.model ?? DEEPSEEK_MODEL_MAP[tier];

  if (!config.apiKey) throw new Error(tier === 'pro' ? 'AI_PRO_API_KEY or AI_API_KEY is not configured' : 'AI_API_KEY is not configured');
  if (!model) throw new Error('AI_MODEL is not configured');

  const url = getAiChatCompletionsUrl(config);

  const isDeepSeek = isDeepSeekModel(model, config.baseUrl ?? undefined);
  const responseFormat = req.jsonSchema && !isDeepSeek
    ? {
        type: 'json_schema' as const,
        json_schema: {
          name: 'response',
          strict: true,
          schema: req.jsonSchema,
        },
      }
    : { type: 'json_object' as const };

  const schemaInstruction = req.jsonSchema && isDeepSeek
    ? `\n\n你必须只输出一个 JSON 对象，并严格符合以下 JSON Schema。不要输出 markdown、解释或额外文本：\n${JSON.stringify(req.jsonSchema)}`
    : '';

  const body = {
    model,
    messages: [
      { role: 'system' as const, content: `${req.systemPrompt}${schemaInstruction}` },
      { role: 'user' as const, content: req.userPrompt },
    ],
    temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    response_format: responseFormat,
    ...(isDeepSeek
      ? {
          thinking: { type: model.includes('pro') ? 'enabled' : 'disabled' },
          ...(model.includes('pro') ? { reasoning_effort: 'high' } : {}),
        }
      : {}),
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await res.text(); // drain body, but do not persist provider payloads in logs
        throw new Error(`AI API error (${res.status})`);
      }

      const data = await res.json();
      const usage = extractOpenAIUsage(data);
      const text: string | undefined =
        data?.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('Empty response from AI API');
      }

      const parsed = JSON.parse(extractJSON(text)) as T;

      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: config.provider === 'disabled' ? 'openai-compatible' : config.provider,
        status: 'success',
        durationMs: Date.now() - startedAt,
        ...usage,
        metadata: { ...req.invocation?.metadata, attempt: attempt + 1 },
      });

      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: config.provider === 'disabled' ? 'openai-compatible' : config.provider,
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage: lastError.message,
        metadata: { ...req.invocation?.metadata, attempt: attempt + 1 },
      });
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('AI API call failed');
}

// ── Gemini native backend ────────────────────────────────────────────

async function callGeminiNative<T>(req: GeminiRequest): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = resolveModel(req);
  const endpoint = getGeminiEndpoint(model);

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: req.temperature ?? DEFAULT_TEMPERATURE,
  };

  if (req.jsonSchema) {
    generationConfig.responseSchema = req.jsonSchema;
  }

  const body = {
    system_instruction: {
      parts: [{ text: req.systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: req.userPrompt }],
      },
    ],
    generationConfig,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        await res.text(); // drain body, but do not persist provider payloads in logs
        throw new Error(`Gemini API error (${res.status})`);
      }

      const data = await res.json();
      const usage = extractGeminiUsage(data);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      const parsed = JSON.parse(text) as T;

      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: 'gemini',
        status: 'success',
        durationMs: Date.now() - startedAt,
        ...usage,
        metadata: { ...req.invocation?.metadata, attempt: attempt + 1 },
      });

      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: 'gemini',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage: lastError.message,
        metadata: { ...req.invocation?.metadata, attempt: attempt + 1 },
      });
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error('Gemini API call failed');
}

// ── public API (name kept for backward compatibility) ────────────────

export async function callGemini<T>(req: GeminiRequest): Promise<T> {
  return getMode() === 'openai'
    ? callOpenAICompatible<T>(req)
    : callGeminiNative<T>(req);
}

/** Alias — use either name. */
export const callAI = callGemini;

// ── Vision API (image + text input) ──────────────────────────────────

export interface ImagePart {
  base64: string;
  mimeType: string;
}

export interface GeminiVisionRequest {
  systemPrompt: string;
  userPrompt: string;
  images: ImagePart[];
  tier?: ModelTier;
  model?: string;
  temperature?: number;
  invocation?: AIInvocationContext;       // safe observability metadata; never include image/prompt text
}

async function callGeminiVisionNative<T>(req: GeminiVisionRequest): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const model = req.model ?? MODEL_MAP[req.tier ?? 'flash'];
  const endpoint = getGeminiEndpoint(model);

  const userParts: Record<string, unknown>[] = [];
  for (const img of req.images) {
    userParts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  userParts.push({ text: req.userPrompt });

  const body = {
    system_instruction: { parts: [{ text: req.systemPrompt }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    },
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        await res.text(); // drain body, but do not persist provider payloads in logs
        throw new Error(`Gemini Vision API error (${res.status})`);
      }
      const data = await res.json();
      const usage = extractGeminiUsage(data);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini Vision API');
      const parsed = JSON.parse(text) as T;
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: 'gemini',
        status: 'success',
        durationMs: Date.now() - startedAt,
        ...usage,
        metadata: { ...req.invocation?.metadata, imageCount: req.images.length, attempt: attempt + 1 },
      });
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: 'gemini',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage: lastError.message,
        metadata: { ...req.invocation?.metadata, imageCount: req.images.length, attempt: attempt + 1 },
      });
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError ?? new Error('Gemini Vision API call failed');
}

async function callOpenAIVisionCompatible<T>(req: GeminiVisionRequest): Promise<T> {
  const config = getAiProviderConfig(req.tier ?? 'flash');
  const model = req.model ?? config.model;

  if (!config.apiKey) throw new Error('AI_API_KEY is not configured');
  if (!model) throw new Error('AI_MODEL is not configured');

  const url = getAiChatCompletionsUrl(config);

  const contentParts: Record<string, unknown>[] = [];
  for (const img of req.images) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }
  contentParts.push({ type: 'text', text: req.userPrompt });

  const body = {
    model,
    messages: [
      { role: 'system' as const, content: req.systemPrompt },
      { role: 'user' as const, content: contentParts },
    ],
    temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    response_format: { type: 'json_object' as const },
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        await res.text(); // drain body, but do not persist provider payloads in logs
        throw new Error(`AI Vision API error (${res.status})`);
      }
      const data = await res.json();
      const usage = extractOpenAIUsage(data);
      const text: string | undefined = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty response from AI Vision API');
      const parsed = JSON.parse(extractJSON(text)) as T;
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: config.provider === 'disabled' ? 'openai-compatible' : config.provider,
        status: 'success',
        durationMs: Date.now() - startedAt,
        ...usage,
        metadata: { ...req.invocation?.metadata, imageCount: req.images.length, attempt: attempt + 1 },
      });
      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model,
        provider: config.provider === 'disabled' ? 'openai-compatible' : config.provider,
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage: lastError.message,
        metadata: { ...req.invocation?.metadata, imageCount: req.images.length, attempt: attempt + 1 },
      });
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError ?? new Error('AI Vision API call failed');
}

export async function callGeminiWithImage<T>(req: GeminiVisionRequest): Promise<T> {
  return getMode() === 'openai'
    ? callOpenAIVisionCompatible<T>(req)
    : callGeminiVisionNative<T>(req);
}
