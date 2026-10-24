export async function recordAuthAuditEvent(
  event: string,
  payload?: { email?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    await fetch('/api/auth/audit-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        event,
        email: payload?.email,
        metadata: payload?.metadata ?? {},
      }),
    });
  } catch {
    // Auth audit is best-effort from the browser; server-side security controls
    // and Supabase session state remain authoritative.
  }
}
