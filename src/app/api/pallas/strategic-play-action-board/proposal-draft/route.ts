import { ApiError, guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import type { StrategicPlay } from '@/lib/babel-engine/types';
import {
  buildStrategicPlayActionBoardArtifact,
  buildStrategicPlayActionProposals,
  isPallasActionBoardPreviewEnabled,
  pallasStrategicPlayContext,
} from '@/lib/pallas/strategic-play-action-board';
import { createPallasProposalDraft } from '@/lib/pallas/proposals';
import { assertPallasContextAccess } from '@/lib/pallas/server';
import { mapStrategicPlayRowToApiPlay } from '@/lib/strategic-play-mapping';

export const dynamic = 'force-dynamic';

function parseBody(value: unknown): { playId: string; pallas: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.playId !== 'string' || !body.playId.trim()) return null;
  if (typeof body.pallas !== 'string') return null;
  return { playId: body.playId.trim(), pallas: body.pallas };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = parseBody(await request.json());
    if (!body) throw new ApiError(400, 'Pallas 任务草稿请求无效');
    if (!isPallasActionBoardPreviewEnabled({ get: (key) => key === 'pallas' ? body.pallas : null })) {
      throw new ApiError(404, 'Pallas 预览未开启');
    }

    const admin = requireAdmin();
    const { data, error } = await admin
      .from('strategic_plays')
      .select('*')
      .eq('id', body.playId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (error) throw new Error(`读取 Pallas 谋局失败：${error.message}`);
    if (!data) throw new ApiError(404, '谋局不存在');

    const play = {
      ...mapStrategicPlayRowToApiPlay(data as Record<string, unknown>),
      orgId: ctx.orgId,
    } as unknown as StrategicPlay;
    const context = pallasStrategicPlayContext(play);
    await assertPallasContextAccess(ctx, context);

    const actions = buildStrategicPlayActionProposals(play);
    if (actions.length === 0) {
      throw new ApiError(400, '当前谋局没有可生成任务草稿的未完成步骤');
    }

    const artifact = buildStrategicPlayActionBoardArtifact(play);
    const proposal = createPallasProposalDraft({
      orgId: ctx.orgId,
      userId: ctx.userId,
      artifactId: null,
      conversationId: `pallas-strategic-play-action-board:${play.id}`,
      context,
      actions,
      sourceRefs: artifact.sourceRefs,
    });

    return Response.json({ proposal });
  } catch (err) {
    return guardResponse(err);
  }
}
