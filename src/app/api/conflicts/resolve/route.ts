/**
 * POST /api/conflicts/resolve
 *
 * Resolve a conflict signal with a resolution type.
 * Body: { conflictId, accountId, resolution: 'confirmed' | 'false_positive' | 'follow_up', note?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { requireAdmin } from '@/lib/api-guard';

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = await req.json();
    const { conflictId, accountId, resolution, note } = body as {
      conflictId: string;
      accountId: string;
      resolution: 'confirmed' | 'false_positive' | 'follow_up';
      note?: string;
    };

    if (!conflictId || !accountId || !resolution) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const validResolutions = ['confirmed', 'false_positive', 'follow_up'];
    if (!validResolutions.includes(resolution)) {
      return NextResponse.json({ error: '无效的解决类型' }, { status: 400 });
    }

    const admin = requireAdmin();
    const now = new Date().toISOString();

    // Try dedicated memory_conflicts table first
    const statusMap: Record<string, string> = {
      confirmed: 'confirmed',
      false_positive: 'resolved',
      follow_up: 'follow_up',
    };

    let updated = false;

    try {
      const { error } = await admin
        .from('memory_conflicts')
        .update({
          status: statusMap[resolution],
          resolved_by: ctx.userId,
          resolved_at: now,
          resolution_note: note || null,
        })
        .eq('id', conflictId)
        .eq('org_id', ctx.orgId);

      if (!error) updated = true;
    } catch {
      // Table may not exist
    }

    // Also update in memory_snapshot's conflicts array (mark as resolved)
    if (!updated) {
      // Conflict lives in account_knowledge_pages memory_snapshot
      const { data: snapshot } = await admin
        .from('account_knowledge_pages')
        .select('id, content_json')
        .eq('org_id', ctx.orgId)
        .eq('account_id', accountId)
        .eq('page_type', 'memory_snapshot')
        .maybeSingle();

      if (snapshot?.content_json) {
        const content = snapshot.content_json as Record<string, unknown>;
        const conflicts = content.conflicts as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(conflicts)) {
          const updatedConflicts = conflicts.map((c) => {
            if ((c.id as string) === conflictId) {
              return { ...c, status: statusMap[resolution], resolvedBy: ctx.userId, resolvedAt: now, resolutionNote: note || null };
            }
            return c;
          });
          await admin
            .from('account_knowledge_pages')
            .update({ content_json: { ...content, conflicts: updatedConflicts }, updated_at: now })
            .eq('id', snapshot.id);
          updated = true;
        }
      }
    }

    if (!updated) {
      return NextResponse.json({ error: '未找到该矛盾信号' }, { status: 404 });
    }

    return NextResponse.json({ success: true, resolution });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      const apiErr = err as { status: number; message: string };
      return NextResponse.json({ error: apiErr.message }, { status: apiErr.status });
    }
    console.error('[conflicts/resolve] Error:', err);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
