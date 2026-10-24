import { ApiError, guardResponse, requireAuth } from '@/lib/api-guard';
import { parsePallasArtifactBody, parsePallasEntityContext } from '@/lib/pallas/api';
import { createPallasArtifact, listPallasArtifacts } from '@/lib/pallas/server';

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const url = new URL(request.url);
    const entityType = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    const accountId = url.searchParams.get('accountId');
    const limitRaw = Number(url.searchParams.get('limit') ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20;
    const parsedContext = entityType
      ? parsePallasEntityContext({
          entityType,
          entityId,
          accountId,
        })
      : undefined;

    if (entityType && !parsedContext) {
      throw new ApiError(400, 'Pallas artifact context 无效');
    }

    const context = parsedContext ?? undefined;
    const artifacts = await listPallasArtifacts({ ctx, context, limit });
    return Response.json({ artifacts });
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = parsePallasArtifactBody(await request.json());
    if (!body) throw new ApiError(400, 'Pallas artifact 请求无效');

    const artifact = await createPallasArtifact({ ctx, ...body });
    return Response.json({ artifact });
  } catch (err) {
    return guardResponse(err);
  }
}
