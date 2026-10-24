import { ApiError, guardResponse, requireAuth } from '@/lib/api-guard';
import { buildPallasLifecycleAuditSummary, parsePallasLifecycleStatusBody } from '@/lib/pallas/api';
import { updatePallasProposalLifecycleStatus } from '@/lib/pallas/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    if (!id) throw new ApiError(400, '缺少 Pallas proposal id');

    const body = parsePallasLifecycleStatusBody(await request.json());
    if (!body) throw new ApiError(400, 'Pallas proposal status 请求无效');

    const proposal = await updatePallasProposalLifecycleStatus({
      ctx,
      proposalId: id,
      status: body.status,
      resultSummary: buildPallasLifecycleAuditSummary(body),
    });
    return Response.json({ proposal });
  } catch (err) {
    return guardResponse(err);
  }
}
