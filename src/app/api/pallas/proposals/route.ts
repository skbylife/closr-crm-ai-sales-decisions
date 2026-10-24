import { ApiError, guardResponse, requireAuth } from '@/lib/api-guard';
import { isPallasPreviewGateValue, parsePallasProposalBody } from '@/lib/pallas/api';
import { createPallasActionProposal } from '@/lib/pallas/server';

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const rawBody = await request.json();
    if (
      typeof rawBody !== 'object' ||
      rawBody === null ||
      Array.isArray(rawBody) ||
      !isPallasPreviewGateValue((rawBody as Record<string, unknown>).pallas)
    ) {
      throw new ApiError(404, 'Pallas 预览未开启');
    }

    const body = parsePallasProposalBody(rawBody);
    if (!body) throw new ApiError(400, 'Pallas proposal 请求无效');

    const proposal = await createPallasActionProposal({ ctx, ...body });
    return Response.json({ proposal });
  } catch (err) {
    return guardResponse(err);
  }
}
