import { ApiError, guardResponse, requireAuth } from '@/lib/api-guard';
import { isPallasPreviewGateValue } from '@/lib/pallas/api';
import { buildPallasConfirmationDetailContract } from '@/lib/pallas/confirmation-detail';
import { getPallasActionProposal } from '@/lib/pallas/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const url = new URL(request.url);
    if (!isPallasPreviewGateValue(url.searchParams.get('pallas'))) {
      throw new ApiError(404, 'Pallas 预览未开启');
    }

    const { id } = await params;
    if (!id) throw new ApiError(400, '缺少 Pallas proposal id');

    const proposal = await getPallasActionProposal({ ctx, proposalId: id });
    const confirmation = buildPallasConfirmationDetailContract(proposal, { mode: 'persisted' });
    return Response.json({ proposal, confirmation });
  } catch (err) {
    return guardResponse(err);
  }
}
