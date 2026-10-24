import { ApiError, guardResponse, requireAuth } from '@/lib/api-guard';
import { isPallasPreviewGateValue } from '@/lib/pallas/api';
import { executePallasConfirmedCreateTaskProposal } from '@/lib/pallas/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    if (!id) throw new ApiError(400, '缺少 Pallas proposal id');

    const body = await request.json().catch(() => ({}));
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !isPallasPreviewGateValue((body as Record<string, unknown>).pallas)
    ) {
      throw new ApiError(404, 'Pallas 预览未开启');
    }

    const result = await executePallasConfirmedCreateTaskProposal({ ctx, proposalId: id });

    return Response.json({
      proposal: result.proposal,
      toolRun: result.toolRun,
      task: result.task,
      reused: result.reused,
      message: result.reused
        ? 'Pallas 已复用此 proposal 的既有 Closr 内部任务。未调用外部工具。'
        : 'Pallas 已创建 Closr 内部任务。未调用外部工具，未触发第三方连接器。',
    });
  } catch (err) {
    return guardResponse(err);
  }
}
