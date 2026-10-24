import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
}));

type TestTableRow = Record<string, unknown>;
type QueryResult = { data: TestTableRow[] | null; error: { message?: string } | null };

function matches(row: TestTableRow, filters: Array<[string, unknown]>, neqFilters: Array<[string, unknown]>, inFilters: Array<[string, unknown[]]>) {
  return filters.every(([key, value]) => row[key] === value)
    && neqFilters.every(([key, value]) => row[key] !== value)
    && inFilters.every(([key, values]) => values.includes(row[key]));
}

function makeAdmin(tables: Record<string, TestTableRow[]>, overrides: Record<string, QueryResult> = {}) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const neqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      let capped = tables[table]?.length ?? 0;
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        neq(key: string, value: unknown) {
          neqFilters.push([key, value]);
          return query;
        },
        in(key: string, values: unknown[]) {
          inFilters.push([key, values]);
          return query;
        },
        order() {
          return query;
        },
        limit(value: number) {
          capped = value;
          return query;
        },
        then(resolve: (value: QueryResult) => void) {
          if (overrides[table]) return Promise.resolve(overrides[table]).then(resolve);
          const data = (tables[table] ?? []).filter((row) => matches(row, filters, neqFilters, inFilters)).slice(0, capped);
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function interventionRow(): TestTableRow {
  return {
    id: 'sr_int_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'manager_intervention',
    source_table: 'opportunities',
    source_row_id: 'opp_1',
    occurred_at: '2026-05-01T12:00:00.000Z',
    created_at: '2026-05-01T12:00:00.000Z',
    metadata: {
      intervention: {
        id: 'int_1',
        orgId: 'org_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        type: 'manager_intervention',
        action: 'verify_evidence',
        status: 'completed',
        role: 'manager',
        reason: '风险高，先核验证据。',
        recommendedAction: '核验证据和 sponsor。',
        evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_reason_1', sourceTable: 'source_records', sourceRowId: 'sr_reason_1' }],
        createdAt: '2026-05-01T12:00:00.000Z',
      },
    },
  };
}

function playExecutionRow(): TestTableRow {
  return {
    id: 'sr_play_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'play_execution_event',
    source_table: 'strategic_plays',
    source_row_id: 'play_1',
    occurred_at: '2026-05-05T12:00:00.000Z',
    created_at: '2026-05-05T12:00:00.000Z',
    metadata: {
      playExecutionEvent: {
        id: 'play_1:0:blocked:2026-05-05T12:00:00.000Z',
        orgId: 'org_1',
        accountId: 'acc_1',
        playId: 'play_1',
        opportunityId: 'opp_1',
        goalDescription: 'Win expansion',
        stepIndex: 0,
        stepTitle: 'Get procurement criteria',
        status: 'blocked',
        blockerReason: 'Procurement refuses to share scorecard.',
        nextAction: 'Ask sponsor to verify criteria.',
        occurredAt: '2026-05-05T12:00:00.000Z',
      },
    },
  };
}

function outcomeRow(): TestTableRow {
  return {
    id: 'sr_out_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'intervention_outcome',
    source_table: 'source_records',
    source_row_id: 'out_1',
    occurred_at: '2026-05-04T12:00:00.000Z',
    created_at: '2026-05-04T12:00:00.000Z',
    metadata: {
      interventionOutcome: {
        id: 'out_1',
        orgId: 'org_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        interventionId: 'int_1',
        sourceRecordId: 'sr_int_1',
        role: 'manager',
        reason: '风险高，先核验证据。',
        outcome: 'effective',
        impact: 'risk_reduced',
        confidence: 0.82,
        outcomeNote: '风险降低。',
        learningSummary: '先核验证据和 sponsor 后，风险下降。',
        evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_outcome_1', sourceTable: 'source_records', sourceRowId: 'sr_outcome_1' }],
        createdAt: '2026-05-04T12:00:00.000Z',
      },
    },
  };
}

function publicWebRow(): TestTableRow {
  return {
    id: 'sr_public_1',
    org_id: 'org_1',
    account_id: 'acc_1',
    source_kind: 'public_web',
    source_table: 'public_web',
    source_row_id: 'official-page:1',
    title: 'Acme leadership update',
    summary: '官网出现新的数字化负责人介绍。',
    occurred_at: '2026-05-06T12:00:00.000Z',
    created_at: '2026-05-06T12:00:00.000Z',
    metadata: {
      public_web_type: 'official_page',
      page_type: 'leadership',
      url: 'https://example.com/leadership',
      captured_at: '2026-05-06T12:05:00.000Z',
      extraction_method: 'scrapling_company_scraper',
      should_auto_writeback: false,
    },
  };
}

describe('/api/portfolio-signals pattern-aware output', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'owner',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
  });

  it('keeps existing portfolio fields and adds scoped pattern-aware signals', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      account_knowledge_pages: [],
      account_open_questions: [],
      accounts: [{ id: 'acc_1', name: 'Acme Corp', deal_value: 180_000, deal_health: 'at_risk', last_activity: '2026-05-01T12:00:00.000Z', org_id: 'org_1' }],
      opportunities: [{
        id: 'opp_1',
        name: 'Enterprise Expansion',
        account_id: 'acc_1',
        value: 180_000,
        stage: 'negotiation',
        probability: 75,
        expected_close_date: null,
        updated_at: '2026-05-02T12:00:00.000Z',
        org_id: 'org_1',
        meddicc: { overallScore: 42, metrics: { status: 'partial', evidence: '' }, economicBuyer: { status: 'unknown' }, champion: { strength: 2 } },
        mutual_action_plan: { milestones: [{ status: 'at_risk', title: 'Legal review' }] },
      }],
      tasks: [],
      source_records: [interventionRow(), outcomeRow(), playExecutionRow(), publicWebRow()],
      memory_conflicts: [],
    }));

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.conflicts).toEqual([]);
    expect(payload.questions).toEqual([]);
    expect(payload.portfolioJudgment.summary.openOpportunities).toBe(1);
    expect(payload.portfolioJudgment.summary.ownershipGaps).toBe(1);
    expect(payload.portfolioJudgment.managementQueue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        queueType: 'ownership_gap',
        accountId: 'acc_1',
        ownerSummary: expect.objectContaining({ status: 'gap' }),
      }),
    ]));
    expect(payload.patternAwareSignals).toHaveLength(1);
    expect(payload.patternAwareSignals[0]).toMatchObject({
      accountId: 'acc_1',
      patternType: 'risk_reversal',
      signalType: 'successful_recovery_pattern',
    });
    expect(payload.patternAwareSignals[0].evidenceRefs.map((ref: { sourceId: string }) => ref.sourceId)).toEqual(expect.arrayContaining(['sr_int_1', 'opp_1']));
    expect(payload.patternSignalSummary.status).toBe('ready');
    expect(payload.patternSignalSummary.calibrationNote).toContain('不是自动结论');
    expect(payload.playExecutionSignals).toHaveLength(1);
    expect(payload.playExecutionSignals[0]).toMatchObject({
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      status: 'blocked',
      severity: 'warning',
      summary: 'Procurement refuses to share scorecard.',
    });
    expect(payload.playExecutionSignalSummary).toMatchObject({ status: 'ready', totalEvents: 1, blockedOrInvalidated: 1 });
    expect(payload.publicWebSignals).toHaveLength(1);
    expect(payload.publicWebSignals[0]).toMatchObject({
      accountId: 'acc_1',
      sourceUrl: 'https://example.com/leadership',
      auditLabel: '关键人公开证据',
      evidenceStrengthLabel: '可追溯公开来源',
      judgmentImpact: expect.stringContaining('关键人路径'),
    });
    expect(payload.publicWebSignalSummary).toMatchObject({ status: 'ready', totalEvidence: 1, emittedSignals: 1 });
  });
});
