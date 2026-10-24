export const maxDuration = 120;

/**
 * POST /api/accounts/[id]/analyze
 *
 * Triggers AI analysis for an account via SSE streaming.
 * Streams partial narrative as it's generated, then the complete result.
 */

import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { streamAccountAIAnalysis } from '@/lib/evidence-memory/ai-analysis';
import { normalizeOutputLocale } from '@/lib/output-locale';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { outputLocale?: unknown; locale?: unknown };
    const outputLocale = normalizeOutputLocale(body.outputLocale ?? body.locale);
    await requireAccountAccess(ctx, id);

    const { data: account, error } = await admin
      .from('accounts')
      .select('id, name')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (error || !account) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    const generator = streamAccountAIAnalysis({
      accountId: account.id as string,
      accountName: account.name as string,
      orgId: ctx.orgId,
      ctx,
      outputLocale,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const event of generator) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return guardResponse(err);
  }
}
