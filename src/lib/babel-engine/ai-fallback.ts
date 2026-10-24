// AI Fallback wrapper — retry, circuit breaker, and graceful degradation.
//
// Wraps callGemini with:
//   1. Timeout (15s)
//   2. 1 automatic retry with exponential backoff
//   3. Circuit breaker: 5 consecutive failures → skip to fallback for 30s
//   4. Static degraded response when all else fails

import { callGemini, type GeminiRequest } from './gemini';
import { logError } from '../error-monitor';
import { logAIInvocation } from '@/lib/ai-invocation-log';
import { DEFAULT_DEEPSEEK_FLASH_MODEL, DEFAULT_DEEPSEEK_PRO_MODEL } from '@/lib/ai-provider-config';

// ── Circuit Breaker state ────────────────────────────────────────────

let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000; // 30 seconds

function isCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_THRESHOLD) return false;
  if (Date.now() >= circuitOpenUntil) {
    // Half-open: allow one attempt
    consecutiveFailures = CIRCUIT_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  }
}

// ── Timeout helper ───────────────────────────────────────────────────

const AI_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// ── Public API ───────────────────────────────────────────────────────

export interface FallbackOptions<T> {
  /** Static response to return when all AI providers fail */
  degradedResponse?: T;
  /** Override timeout (default 60s) */
  timeoutMs?: number;
  /** Max retry attempts (default 2) */
  maxAttempts?: number;
}

/**
 * Call AI with automatic retry, circuit breaker, and fallback.
 *
 * Flow:
 *   circuit open? → degradedResponse (if provided) or throw
 *   attempt 1 → timeout 15s
 *   fail → retry once (2s backoff)
 *   fail → degradedResponse (if provided) or throw
 */
export async function callAIWithFallback<T>(
  req: GeminiRequest,
  options: FallbackOptions<T> = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;

  // Circuit breaker check
  if (isCircuitOpen()) {
    logError('ai-fallback', new Error('Circuit breaker open — skipping AI call'), {
      consecutiveFailures,
      circuitOpenUntil: new Date(circuitOpenUntil).toISOString(),
    });
    if (options.degradedResponse !== undefined) {
      logAIInvocation({
        ...req.invocation,
        tier: req.tier ?? 'flash',
        model: req.model ?? null,
        provider: null,
        status: 'degraded',
        errorMessage: 'Circuit breaker open',
        metadata: { ...req.invocation?.metadata, reason: 'circuit_open' },
      });
      return options.degradedResponse;
    }
    throw new Error('AI 服务暂时不可用，请稍后重试。');
  }

  const MAX_ATTEMPTS = options.maxAttempts ?? 2;
  let lastError: Error | null = null;

  const fallbackModels = req.model
    ? [req.model]
    : req.tier === 'pro'
      ? [process.env.AI_PRO_MODEL ?? DEFAULT_DEEPSEEK_PRO_MODEL, process.env.AI_MODEL ?? DEFAULT_DEEPSEEK_FLASH_MODEL]
      : [process.env.AI_MODEL ?? DEFAULT_DEEPSEEK_FLASH_MODEL, process.env.AI_PRO_MODEL ?? DEFAULT_DEEPSEEK_PRO_MODEL];

  for (const model of fallbackModels) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await withTimeout(callGemini<T>({ ...req, model }), timeoutMs);
        recordSuccess();
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logError('ai-fallback', lastError, {
          attempt: attempt + 1,
          model,
          tier: req.tier ?? 'default',
        });

        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  recordFailure();

  if (options.degradedResponse !== undefined) {
    logError('ai-fallback', new Error('All AI attempts failed — returning degraded response'), {
      originalError: lastError?.message,
    });
    logAIInvocation({
      ...req.invocation,
      tier: req.tier ?? 'flash',
      model: req.model ?? null,
      provider: null,
      status: 'degraded',
      errorMessage: lastError?.message ?? 'All AI attempts failed',
      metadata: { ...req.invocation?.metadata, reason: 'all_attempts_failed' },
    });
    return options.degradedResponse;
  }

  throw lastError ?? new Error('AI 调用失败，请重试。');
}

// ── Convenience: pre-built degraded responses ────────────────────────

export const DEGRADED_RESPONSES = {
  decode: {
    messages: [],
    thread_analysis: null,
    _degraded: true,
    _message: 'AI 服务暂时不可用，无法完成解读。请稍后重试。',
  },
  strategy: {
    strategies: [],
    _degraded: true,
    _message: 'AI 服务暂时不可用，无法生成策略建议。请稍后重试。',
  },
  generic: {
    _degraded: true,
    _message: 'AI 服务暂时不可用，请稍后重试。',
  },
} as const;
