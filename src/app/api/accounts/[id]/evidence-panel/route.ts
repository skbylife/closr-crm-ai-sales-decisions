import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { getAdHocEvidenceBundlePayload, getEvidenceBundlePayload } from '@/lib/evidence-memory/server';
import { emptyProvenance } from '@/lib/evidence-provenance';
import type { RecommendationEvidenceBundle, StrategicPlay } from '@/lib/babel-engine/types';

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildEmptyBundle(params: {
  accountId: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendationSummary: string;
  confidence: number;
  recommendationSurface: 'strategic_play' | 'ad_hoc';
}): RecommendationEvidenceBundle {
  const { accountId, recommendationId, recommendationTitle, recommendationSummary, confidence, recommendationSurface } = params;
  return {
    accountId,
    recommendationId,
    recommendationTitle,
    recommendationSummary,
    recommendationSurface,
    isCoreRecommendationSurface: recommendationSurface === 'strategic_play',
    confidence,
    evidenceStrengthLabel: '低证据支持',
    lowEvidence: true,
    lowEvidenceReasons: ['evidence_bundle_generation_failed'],
    conflictDetected: false,
    evidenceItems: [],
    relatedConflictIds: [],
    provenance: emptyProvenance('证据包生成失败，返回空 trace 以保持前端兼容；该推荐不应被视为已完成证据归因。'),
    generatedAt: new Date().toISOString(),
  };
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const { searchParams } = new URL(request.url);
    const playId = searchParams.get('playId');
    if (!playId) {
      return Response.json({ error: 'playId is required' }, { status: 400 });
    }

    const admin = requireAdmin();
    const { data: row, error } = await admin
      .from('strategic_plays')
      .select('*')
      .eq('id', playId)
      .eq('account_id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (error || !row) {
      return Response.json({ error: 'Strategic play not found' }, { status: 404 });
    }

    const play: StrategicPlay = {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      accountId: row.account_id,
      opportunityId: row.opportunity_id,
      targetContactId: row.target_contact_id,
      goalType: row.goal_type,
      goalDescription: row.goal_description,
      steps: toArray(row.steps),
      alternativePaths: toArray(row.alternative_paths),
      confidence: Number(row.confidence ?? 0),
      status: row.status,
      aiModel: row.ai_model ?? undefined,
      momentum: row.momentum ?? 'active',
      successCriteria: row.success_criteria ?? undefined,
      knowledgeTraces: toArray(row.knowledge_traces),
      knowledgeGaps: toArray(row.knowledge_gaps),
      provenance: row.evidence_provenance ?? null,
      deadline: row.deadline ?? null,
      assumptions: toArray(row.assumptions),
      learnings: toArray(row.learnings),
      review: row.review ?? undefined,
      lastStepAt: row.last_step_at ?? undefined,
      daysSinceProgress: Number(row.days_since_progress ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    try {
      const bundle = await getEvidenceBundlePayload(id, play, ctx.orgId, ctx);
      return Response.json(bundle);
    } catch (bundleError) {
      console.error('[api/accounts/evidence-panel] Failed to build bundle:', bundleError);
      return Response.json(buildEmptyBundle({
        accountId: id,
        recommendationId: play.id,
        recommendationTitle: play.goalDescription,
        recommendationSummary: play.steps[0]?.description ?? play.goalDescription,
        confidence: play.confidence,
        recommendationSurface: 'strategic_play',
      }));
    }
  } catch (err) {
    return guardResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const body = await request.json() as {
      recommendationId?: string;
      recommendationTitle?: string;
      recommendationSummary?: string;
      confidence?: number;
    };

    if (!body.recommendationId || !body.recommendationTitle || !body.recommendationSummary) {
      return Response.json({ error: 'recommendationId, recommendationTitle, recommendationSummary are required' }, { status: 400 });
    }

    try {
      const bundle = await getAdHocEvidenceBundlePayload({
        accountId: id,
        orgId: ctx.orgId,
        recommendationId: body.recommendationId,
        recommendationTitle: body.recommendationTitle,
        recommendationSummary: body.recommendationSummary,
        confidence: Number(body.confidence ?? 0),
        ctx,
      });

      return Response.json(bundle);
    } catch (bundleError) {
      console.error('[api/accounts/evidence-panel] Failed to build ad hoc bundle:', bundleError);
      return Response.json(buildEmptyBundle({
        accountId: id,
        recommendationId: body.recommendationId,
        recommendationTitle: body.recommendationTitle,
        recommendationSummary: body.recommendationSummary,
        confidence: Number(body.confidence ?? 0),
        recommendationSurface: 'ad_hoc',
      }));
    }
  } catch (err) {
    return guardResponse(err);
  }
}
