import { ApiError, guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import type { StrategicPlay } from '@/lib/babel-engine/types';
import {
  buildStrategicPlayActionBoardArtifact,
  buildStrategicPlayActionProposals,
  isPallasActionBoardPreviewEnabled,
  pallasStrategicPlayContext,
} from '@/lib/pallas/strategic-play-action-board';
import {
  PallasActionProposalReuseConflictError,
  assertPallasContextAccess,
  buildPallasActionProposalReuseKey,
  createPallasActionProposal,
  findReusablePallasActionProposal,
} from '@/lib/pallas/server';
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
    if (!body) throw new ApiError(400, 'Pallas 持久化提案请求无效');
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
      throw new ApiError(400, '当前谋局没有可持久化为任务提案的未完成步骤');
    }

    const artifact = buildStrategicPlayActionBoardArtifact(play);
    const conversationId = `pallas-strategic-play-action-board:${play.id}`;
    const reuseKey = buildPallasActionProposalReuseKey({
      conversationId,
      context,
      actions,
    });
    const existingProposal = await findReusablePallasActionProposal({
      ctx,
      conversationId,
      context,
      actions,
      reuseKey,
    });

    if (existingProposal) {
      return Response.json({
        proposal: existingProposal,
        reused: true,
        message: '已复用待确认草稿；没有创建任务，也没有重复写入新提案。',
      });
    }

    try {
      const proposal = await createPallasActionProposal({
        ctx,
        artifactId: null,
        conversationId,
        context,
        actions,
        reuseKey,
        sourceRefs: artifact.sourceRefs,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      return Response.json({
        proposal,
        reused: false,
        message: '已生成待确认草稿；没有创建任务，也没有调用工具。',
      });
    } catch (err) {
      if (!(err instanceof PallasActionProposalReuseConflictError)) throw err;

      const racedProposal = await findReusablePallasActionProposal({
        ctx,
        conversationId,
        context,
        actions,
        reuseKey,
      });
      if (!racedProposal) throw new ApiError(409, 'Pallas 提案已被并发创建，请刷新后重试');

      return Response.json({
        proposal: racedProposal,
        reused: true,
        message: '已复用待确认草稿；没有创建任务，也没有重复写入新提案。',
      });
    }
  } catch (err) {
    return guardResponse(err);
  }
}
