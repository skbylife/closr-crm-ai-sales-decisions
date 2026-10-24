// Unified error monitoring — structured logging + optional webhook alerts.
//
// Environment variables:
//   ERROR_WEBHOOK_URL — optional webhook (Slack/Lark/DingTalk) for critical alerts

// ── Structured log entry ─────────────────────────────────────────────

interface ErrorLogEntry {
  timestamp: string;
  level: 'error' | 'warn';
  source: string;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

/**
 * Log an error as structured JSON to console and optionally fire a webhook.
 */
export function logError(
  source: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    source,
    message: err.message,
    stack: err.stack,
    meta,
  };

  console.error(JSON.stringify(entry));

  // Fire-and-forget webhook if configured
  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (webhookUrl) {
    void fireWebhook(webhookUrl, entry).catch((whErr) => {
      console.warn('[error-monitor] Webhook delivery failed:', whErr instanceof Error ? whErr.message : whErr);
    });
  }
}

/**
 * Log a warning (non-critical).
 */
export function logWarn(
  source: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const entry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    source,
    message,
    meta,
  };

  console.warn(JSON.stringify(entry));
}

// ── Webhook ──────────────────────────────────────────────────────────

async function fireWebhook(url: string, entry: ErrorLogEntry): Promise<void> {
  const text = `[${entry.level.toUpperCase()}] ${entry.source}: ${entry.message}${
    entry.meta ? `\n${JSON.stringify(entry.meta)}` : ''
  }`;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, content: text, msg_type: 'text' }),
    signal: AbortSignal.timeout(5000),
  });
}

// ── Fire-and-forget safety net ───────────────────────────────────────

/**
 * 为 fire-and-forget Promise 提供统一兜底日志。
 * 用法：void doSomething().catch(safeCatch('decode', 'profile-update', { contactId }));
 */
export function safeCatch(
  source: string,
  action: string,
  meta?: Record<string, unknown>,
): (err: unknown) => void {
  return (err: unknown) => {
    logError(source, err, { action, ...meta });
  };
}

// ── API route wrapper ────────────────────────────────────────────────

/**
 * Wrap an API route handler with error monitoring.
 * Catches unhandled errors, logs them, and returns a 500 response.
 */
export function withErrorMonitoring(
  routeName: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (err) {
      logError(routeName, err, {
        url: request.url,
        method: request.method,
      });
      const message = err instanceof Error ? err.message : 'Internal server error';
      return Response.json({ error: message }, { status: 500 });
    }
  };
}
