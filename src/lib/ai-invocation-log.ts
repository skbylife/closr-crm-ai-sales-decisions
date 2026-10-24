import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type AIInvocationStatus = 'success' | 'error' | 'degraded';

export interface AIInvocationContext {
  route?: string | null;
  useCase?: string | null;
  userId?: string | null;
  orgId?: string | null;
  accountId?: string | null;
  opportunityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AIInvocationLogInput extends AIInvocationContext {
  tier?: string | null;
  model?: string | null;
  provider?: string | null;
  status: AIInvocationStatus;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
}

const ROUTE_STACK_RE = /src\/app\/api\/(.*?)\/route\.(?:ts|js)/;

function sanitizeErrorMessage(message?: string | null): string | null {
  if (!message) return null;
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

function sanitizeMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> {
  if (!metadata) return {};

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    // Avoid accidentally persisting raw prompts, message bodies, or large/sensitive blobs.
    if (/prompt|content|message|body|text|transcript|api[_-]?key|token|secret/i.test(key)) continue;

    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = typeof value === 'string' && value.length > 200 ? `${value.slice(0, 197)}...` : value;
      continue;
    }

    if (Array.isArray(value)) {
      safe[key] = { type: 'array', length: value.length };
      continue;
    }

    if (typeof value === 'object') {
      safe[key] = { type: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 20) };
    }
  }
  return safe;
}

function inferRouteFromStack(): string | null {
  const stack = new Error().stack ?? '';
  const match = stack.match(ROUTE_STACK_RE);
  if (!match?.[1]) return null;
  return `/api/${match[1]}`;
}

function inferUseCase(route: string | null): string | null {
  if (!route) return null;
  return route.replace(/^\/api\//, '').replace(/\//g, '.');
}

/**
 * Best-effort AI invocation logger. Never await this on the critical path unless
 * you explicitly want to; it swallows its own failures to protect product flows.
 */
export function logAIInvocation(input: AIInvocationLogInput): void {
  const route = input.route ?? inferRouteFromStack();
  const useCase = input.useCase ?? inferUseCase(route);

  const row = {
    org_id: input.orgId ?? null,
    user_id: input.userId ?? null,
    account_id: input.accountId ?? null,
    opportunity_id: input.opportunityId ?? null,
    route,
    use_case: useCase,
    tier: input.tier ?? null,
    model: input.model ?? null,
    provider: input.provider ?? null,
    status: input.status,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    total_tokens: input.totalTokens ?? null,
    duration_ms: input.durationMs ?? null,
    error_message: sanitizeErrorMessage(input.errorMessage),
    metadata: sanitizeMetadata(input.metadata),
  };

  void (async () => {
    try {
      const admin = getSupabaseAdmin();
      if (!admin) return;
      const { error } = await admin.from('ai_invocation_logs').insert(row);
      if (error && process.env.NODE_ENV !== 'production') {
        console.warn('[ai-invocation-log] insert failed:', error.message);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[ai-invocation-log] unexpected failure:', err);
      }
    }
  })();
}
