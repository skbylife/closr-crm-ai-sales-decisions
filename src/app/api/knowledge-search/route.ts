import { requireAuth, guardResponse } from '@/lib/api-guard';
import { searchKnowledgeScoped } from '@/lib/knowledge-engine';

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') ?? '';

    if (!q.trim()) {
      return Response.json({ items: [] });
    }

    const items = await searchKnowledgeScoped(ctx, q, 5);
    return Response.json({ items });
  } catch (err) {
    return guardResponse(err);
  }
}
