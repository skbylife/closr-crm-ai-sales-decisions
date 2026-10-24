import { ApiError, guardResponse, requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { normalizeInterventionSourceRow } from '@/lib/judgment/intervention';
import { normalizeInterventionOutcomeSourceRow, INTERVENTION_IMPACT_LABEL, INTERVENTION_OUTCOME_LABEL } from '@/lib/judgment/intervention-learning';
import { buildJudgmentPatternLibrary, type JudgmentPattern, type JudgmentPatternType } from '@/lib/judgment/pattern-library';
import { assertAllowedSourceRecordKinds } from '@/lib/judgment/source-record-taxonomy';

export const dynamic = 'force-dynamic';

type AdminClient = ReturnType<typeof requireAdmin>;
type AuthContext = Awaited<ReturnType<typeof requireAuth>>;

type SourceRecordPatternRow = {
  id?: string | null;
  org_id?: string | null;
  account_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

const PATTERN_SOURCE_KINDS = ['manager_intervention', 'executive_intervention', 'intervention_outcome'] as const;
assertAllowedSourceRecordKinds(PATTERN_SOURCE_KINDS, 'judgment-patterns reader');

function isSourceRecordsUnavailable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? '';
  return message.includes('source_records') || message.includes('schema cache') || message.includes('does not exist');
}

function isOrgPatternReader(ctx: AuthContext): boolean {
  return ctx.orgRole === 'owner' || ctx.orgRole === 'admin' || ctx.roleLevel === 'admin' || Number(ctx.jobLevel ?? 0) >= 1;
}

function patternCounts(patterns: JudgmentPattern[]): Record<JudgmentPatternType, number> {
  return patterns.reduce((acc, pattern) => {
    acc[pattern.patternType] = (acc[pattern.patternType] ?? 0) + 1;
    return acc;
  }, {
    effective_intervention: 0,
    ineffective_intervention: 0,
    evidence_gap: 0,
    risk_reversal: 0,
    stakeholder_shift: 0,
  } as Record<JudgmentPatternType, number>);
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

async function loadJudgmentPatternRows(admin: AdminClient, params: {
  orgId: string;
  accountId?: string | null;
  maxRows: number;
}): Promise<SourceRecordPatternRow[]> {
  let query = admin
    .from('source_records')
    .select('id, org_id, account_id, source_kind, source_table, source_row_id, occurred_at, created_at, metadata')
    .eq('org_id', params.orgId)
    .in('source_kind', [...PATTERN_SOURCE_KINDS])
    .order('occurred_at', { ascending: false })
    .limit(params.maxRows);

  if (params.accountId) query = query.eq('account_id', params.accountId);

  const { data, error } = await query;
  if (error) {
    if (isSourceRecordsUnavailable(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SourceRecordPatternRow[];
}

function buildRecentLearningSamples(outcomes: NonNullable<ReturnType<typeof normalizeInterventionOutcomeSourceRow>>[], limit: number) {
  return [...outcomes]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      accountId: item.accountId,
      interventionId: item.interventionId,
      label: `${INTERVENTION_OUTCOME_LABEL[item.outcome]} · ${INTERVENTION_IMPACT_LABEL[item.impact]}`,
      outcome: item.outcome,
      impact: item.impact,
      confidence: item.confidence,
      summary: item.learningSummary,
      caveat: '账户级介入结果样本，用于组织判断校准；不是自动真理。',
      createdAt: item.createdAt,
    }));
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId')?.trim() || null;
    const limit = boundedNumber(searchParams.get('limit'), 8, 1, 20);
    const maxRows = boundedNumber(searchParams.get('maxRows'), 160, 20, 400);

    if (accountId) {
      await requireAccountAccess(ctx, accountId);
    } else if (!isOrgPatternReader(ctx)) {
      throw new ApiError(403, '权限不足：成员只能查看自己可访问账户的 judgment patterns，请指定 accountId。');
    }

    const rows = await loadJudgmentPatternRows(admin, {
      orgId: ctx.orgId,
      accountId,
      maxRows,
    });

    const interventions = rows
      .map((row) => normalizeInterventionSourceRow(row))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const interventionOutcomes = rows
      .map((row) => normalizeInterventionOutcomeSourceRow(row))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const patterns = buildJudgmentPatternLibrary({ interventions, interventionOutcomes, limit });
    const recentLearningSamples = buildRecentLearningSamples(interventionOutcomes, 4);

    return Response.json({
      patterns,
      recentLearningSamples,
      summary: {
        totalPatterns: patterns.length,
        totalSamples: interventionOutcomes.length,
        counts: patternCounts(patterns),
      },
      scope: accountId ? { type: 'account', accountId } : { type: 'org', orgId: ctx.orgId },
      calibrationNote: patterns.length === 0
        ? '暂无可复用 judgment pattern；系统不会把单次介入当作组织规则。'
        : '这些 pattern 是可追踪、可校正的组织级 judgment memory，不是自动真理。',
    });
  } catch (err) {
    return guardResponse(err);
  }
}
