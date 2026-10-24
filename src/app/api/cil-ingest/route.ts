/**
 * CIL Ingest API Route
 *
 * POST /api/cil-ingest
 * Triggers the Compiled Intelligence Layer ingest pipeline for a given source.
 *
 * Body:
 *   accountId: string (required)
 *   sourceId: string (required)
 *   sourceType: 'call_transcript' | 'meeting_note' | 'note' | 'email' (required)
 *   rawText: string (required)
 *   context?: string
 *   occurredAt?: string (ISO)
 *
 * Returns the ingest result summary.
 */

import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { runCILIngest } from '@/lib/compiled-intelligence/ingest';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const body = await request.json();
    const { accountId, sourceId, sourceType, rawText, context, occurredAt } = body as {
      accountId?: string;
      sourceId?: string;
      sourceType?: string;
      rawText?: string;
      context?: string;
      occurredAt?: string;
    };

    if (!accountId || !sourceId || !sourceType || !rawText) {
      return Response.json(
        { error: '缺少必填参数: accountId, sourceId, sourceType, rawText' },
        { status: 400 },
      );
    }

    const validSourceTypes = ['call_transcript', 'meeting_note', 'note', 'email'];
    if (!validSourceTypes.includes(sourceType)) {
      return Response.json(
        { error: `无效的 sourceType，允许: ${validSourceTypes.join(', ')}` },
        { status: 400 },
      );
    }

    await requireAccountAccess(ctx, accountId);

    // Fetch account name for AI context
    const { data: account } = await admin
      .from('accounts')
      .select('name')
      .eq('id', accountId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    const accountName = account?.name ?? accountId;

    const result = await runCILIngest({
      orgId: ctx.orgId,
      accountId,
      userId: ctx.userId,
      accountName,
      sourceId,
      sourceType: sourceType as 'call_transcript' | 'meeting_note' | 'note' | 'email',
      rawText,
      context,
      occurredAt,
    });

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
