import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { getUnifiedMemoryPayload } from '@/lib/evidence-memory/server';
import { loadAIAnalysis } from '@/lib/evidence-memory/ai-analysis';
import { buildDecodeContextSnapshot, buildDecodeStabilityMetadata, buildStableDecodeJudgment, diffStableDecodeJudgment } from '@/lib/judgment/decode-stability';
import type { DecodeOutput } from '@/lib/babel-engine/types';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  guardResponse: (err: unknown) => {
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    const message = err instanceof Error ? err.message : 'error';
    return Response.json({ error: message }, { status });
  },
}));

vi.mock('@/lib/evidence-memory/server', () => ({
  getUnifiedMemoryPayload: vi.fn(),
}));

vi.mock('@/lib/evidence-memory/ai-analysis', () => ({
  loadAIAnalysis: vi.fn(),
}));

type TestRow = Record<string, unknown>;

function matches(row: TestRow, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeQuery(rows: TestRow[], filters: Array<[string, unknown]> = []) {
  const query = {
    select() {
      return query;
    },
    eq(key: string, value: unknown) {
      filters.push([key, value]);
      return query;
    },
    in(key: string, values: unknown[]) {
      filters.push([key, values]);
      return query;
    },
    order() {
      return query;
    },
    async limit(limit: number) {
      const filtered = rows.filter((row) => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      return { data: filtered.slice(0, limit), error: null };
    },
    async single() {
      return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
    },
  };
  return query;
}

function makeAdmin(sourceRecords: TestRow[]) {
  return {
    from(table: string) {
      if (table === 'accounts') return makeQuery([{ id: 'acc_1', org_id: 'org_1', name: 'Acme' }]);
      if (table === 'source_records') return makeQuery(sourceRecords);
      if (['email_decodes', 'strategic_plays', 'rfps', 'contacts', 'rfp_ai_analyses'].includes(table)) return makeQuery([]);
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function memoryRequest() {
  return new Request('http://localhost/api/accounts/acc_1/memory-payload?window=30', { method: 'GET' });
}

describe('GET /api/accounts/[id]/memory-payload feedback and calibration records', () => {
  const sourceRecords: TestRow[] = [];

  beforeEach(() => {
    sourceRecords.length = 0;
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(sourceRecords));
    vi.mocked(loadAIAnalysis).mockResolvedValue(null);
    vi.mocked(getUnifiedMemoryPayload).mockResolvedValue({
      summary: {
        accountId: 'acc_1',
        narrativeSummary: 'summary',
        momentum: { status: 'steady', label: 'steady', reasoning: '' },
        people: [],
        tensions: [],
        timelineHighlights: [],
        lastComputedAt: '2026-04-30T12:00:00.000Z',
        confidence: 0.7,
        sourceCoverage: { kinds: [], totalRecords: 0, freshRecords: 0 },
      },
      conflicts: [],
      timelineItems: [],
      previousSummary: null,
      momentumShift: null,
      summaryHistory: [],
    });
  });

  it('returns judgmentFeedbacks, revisedJudgmentPreviews, and feedbackRevisionRecords from account-scoped source_records', async () => {
    sourceRecords.push({
      id: 'sr_feedback_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'human_feedback',
      source_table: 'judgment_feedback',
      source_row_id: 'fb_1',
      title: 'Human feedback · 账户综合判断',
      summary: '账户综合判断已被用户标记为过期，需刷新证据后重判：CFO 已离职。',
      occurred_at: '2026-04-30T12:00:00.000Z',
      created_at: '2026-04-30T12:00:00.000Z',
      metadata: {
        feedback: {
          id: 'fb_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          targetType: 'judgment',
          targetId: 'judgment_1',
          kind: 'stale',
          feedbackType: 'stale',
          content: 'CFO 已离职。',
          scope: 'account_only',
          status: 'active',
          evidenceRefs: [],
          createdBy: 'user_1',
          createdAt: '2026-04-30T12:00:00.000Z',
        },
        revisedPreview: {
          previousSummary: 'CFO 仍阻塞审批。',
          userCorrection: 'CFO 已离职。',
          revisedSummary: '账户综合判断已被用户标记为过期，需刷新证据后重判：CFO 已离职。',
          whyChanged: '用户指出原判断依赖的时间或事实已经过期；系统应重新拉取最新账户证据再判断。',
          confidenceDelta: -0.1,
          preservedClaims: [],
          replacedClaims: ['CFO 仍阻塞审批'],
          provisional: true,
        },
        revisionStatus: 'ready',
        previousSummary: 'CFO 仍阻塞审批。',
        scopeNote: '已记录为账户修正；将影响当前客户判断，不会影响其他客户或团队规则。',
      },
    });
    sourceRecords.push({
      id: 'sr_cross_account',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'human_feedback',
      source_table: 'judgment_feedback',
      source_row_id: 'fb_cross',
      title: 'bad',
      summary: 'bad',
      occurred_at: '2026-04-30T11:00:00.000Z',
      created_at: '2026-04-30T11:00:00.000Z',
      metadata: {
        feedback: {
          id: 'fb_cross',
          orgId: 'org_1',
          accountId: 'other_acc',
          targetType: 'judgment',
          targetId: 'judgment_1',
          kind: 'inaccurate',
          feedbackType: 'inaccurate',
          content: 'bad',
          scope: 'account_only',
          status: 'active',
          evidenceRefs: [],
          createdAt: '2026-04-30T11:00:00.000Z',
        },
        revisionStatus: 'ready',
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.judgmentFeedbacks).toHaveLength(1);
    expect(payload.judgmentFeedbacks[0]).toMatchObject({ id: 'fb_1', accountId: 'acc_1', feedbackType: 'stale' });
    expect(payload.revisedJudgmentPreviews).toHaveLength(1);
    expect(payload.feedbackRevisionRecords).toHaveLength(1);
    expect(payload.feedbackRevisionRecords[0].revisionStatus).toBe('ready');
    expect(payload.judgmentTimeline).toHaveLength(1);
    expect(payload.judgmentTimeline[0]).toMatchObject({ kind: 'feedback', id: 'feedback:fb_1', accountId: 'acc_1' });
    expect(payload.roleView).toMatchObject({ role: 'executive', generatedFrom: 'judgment_core' });
    expect(payload.roleView.coreRefs.judgmentTimelineIds).toContain('feedback:fb_1');
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
  });

  it('returns winLossCalibrations from account-scoped source_records', async () => {
    sourceRecords.push({
      id: 'sr_cal_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
      title: 'Win/Loss calibration · 丢单',
      summary: '丢单校准：低估采购阻力',
      occurred_at: '2026-05-01T12:00:00.000Z',
      created_at: '2026-05-01T12:00:00.000Z',
      metadata: {
        calibration: {
          id: 'cal_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          outcome: 'lost',
          outcomeAt: '2026-05-01T12:00:00.000Z',
          notes: '低估采购阻力。',
          validatedSignals: [],
          disprovenSignals: ['Champion 强度过度乐观'],
          lessons: ['下次必须提前验证采购路径'],
          evidenceRefs: [],
          createdAt: '2026-05-01T12:00:00.000Z',
        },
        schemaVersion: 1,
        scopeNote: '',
      },
    });
    sourceRecords.push({
      id: 'sr_cal_cross',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'win_loss_calibration',
      source_table: 'opportunities',
      source_row_id: 'opp_cross',
      title: 'bad',
      summary: 'bad',
      occurred_at: '2026-05-01T11:00:00.000Z',
      created_at: '2026-05-01T11:00:00.000Z',
      metadata: {
        calibration: {
          id: 'cal_cross',
          orgId: 'org_1',
          accountId: 'other_acc',
          opportunityId: 'opp_cross',
          outcome: 'won',
          outcomeAt: '2026-05-01T11:00:00.000Z',
          notes: 'bad',
          validatedSignals: [],
          disprovenSignals: [],
          lessons: ['bad'],
          evidenceRefs: [],
          createdAt: '2026-05-01T11:00:00.000Z',
        },
        schemaVersion: 1,
        scopeNote: '',
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.winLossCalibrations).toHaveLength(1);
    expect(payload.winLossCalibrations[0]).toMatchObject({ id: 'cal_1', accountId: 'acc_1', outcome: 'lost' });
    expect(payload.winLossCalibrations[0].lessons).toEqual(['下次必须提前验证采购路径']);
    expect(payload.judgmentTimeline).toHaveLength(1);
    expect(payload.judgmentTimeline[0]).toMatchObject({ kind: 'win_loss_calibration', id: 'win_loss_calibration:cal_1', accountId: 'acc_1' });
  });



  it('returns taskOutcomes and includes them in judgmentTimeline', async () => {
    sourceRecords.push({
      id: 'sr_task_outcome_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'task_outcome',
      source_table: 'tasks',
      source_row_id: 'task_1:2026-05-01T13-00-00-000Z',
      title: '任务执行反馈 · 完成',
      summary: '完成：李总同意下周评审',
      occurred_at: '2026-05-01T13:00:00.000Z',
      created_at: '2026-05-01T13:00:00.000Z',
      metadata: {
        schemaVersion: 1,
        taskId: 'task_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        contactId: 'con_1',
        outcome: 'completed',
        outcomeNote: '李总同意下周评审',
        reason: '李总同意下周评审',
        previousTaskStatus: 'todo',
        newTaskStatus: null,
        judgmentImpact: '验证了下一步动作有效',
        createdBy: 'user_1',
        createdAt: '2026-05-01T13:00:00.000Z',
        outcomeId: 'task_1:2026-05-01T13-00-00-000Z',
      },
    });
    sourceRecords.push({
      id: 'sr_task_outcome_cross',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'task_outcome',
      source_table: 'tasks',
      source_row_id: 'task_cross',
      title: 'bad',
      summary: 'bad',
      occurred_at: '2026-05-01T12:00:00.000Z',
      created_at: '2026-05-01T12:00:00.000Z',
      metadata: {
        taskId: 'task_cross',
        accountId: 'other_acc',
        outcome: 'blocked',
        outcomeNote: 'bad',
        createdAt: '2026-05-01T12:00:00.000Z',
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.taskOutcomes).toHaveLength(1);
    expect(payload.taskOutcomes[0]).toMatchObject({ taskId: 'task_1', accountId: 'acc_1', outcome: 'completed' });
    expect(payload.judgmentTimeline).toHaveLength(1);
    expect(payload.judgmentTimeline[0]).toMatchObject({
      kind: 'task_outcome',
      title: '任务执行反馈 · 完成',
      summary: '完成：李总同意下周评审',
    });
  });

  it('returns interventions and includes them in judgmentTimeline', async () => {
    sourceRecords.push({
      id: 'sr_intervention_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'manager_intervention',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
      title: '经理介入 · 核验证据',
      summary: '已完成：已让 AE 补一手客户证据。',
      occurred_at: '2026-05-01T14:00:00.000Z',
      created_at: '2026-05-01T14:00:00.000Z',
      metadata: {
        schemaVersion: 1,
        intervention: {
          id: 'int_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          signalId: 'verify:opp_1',
          type: 'manager_intervention',
          action: 'verify_evidence',
          status: 'completed',
          role: 'manager',
          reason: '证据不足，不能直接升级。',
          recommendedAction: '补一条一手证据。',
          outcomeNote: '已让 AE 补一手客户证据。',
          evidenceRefs: [],
          createdBy: 'user_1',
          createdAt: '2026-05-01T14:00:00.000Z',
        },
      },
    });
    sourceRecords.push({
      id: 'sr_intervention_cross',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'executive_intervention',
      source_table: 'opportunities',
      source_row_id: 'opp_cross',
      title: 'bad',
      summary: 'bad',
      occurred_at: '2026-05-01T13:00:00.000Z',
      created_at: '2026-05-01T13:00:00.000Z',
      metadata: {
        intervention: {
          id: 'int_cross',
          orgId: 'org_1',
          accountId: 'other_acc',
          type: 'executive_intervention',
          action: 'intervene',
          status: 'planned',
          reason: 'bad',
          recommendedAction: 'bad',
          evidenceRefs: [],
          createdAt: '2026-05-01T13:00:00.000Z',
        },
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.interventions).toHaveLength(1);
    expect(payload.interventions[0]).toMatchObject({ id: 'int_1', accountId: 'acc_1', action: 'verify_evidence' });
    expect(payload.judgmentTimeline).toHaveLength(1);
    expect(payload.judgmentTimeline[0]).toMatchObject({
      kind: 'intervention',
      id: 'intervention:int_1',
      title: '经理介入 · 核验证据',
      summary: '已完成：已让 AE 补一手客户证据。',
    });
  });

  it('returns intervention outcomes, judgmentLearning, and includes them in judgmentTimeline', async () => {
    sourceRecords.push({
      id: 'sr_intervention_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'manager_intervention',
      source_table: 'opportunities',
      source_row_id: 'opp_1',
      title: '经理介入 · 核验证据',
      summary: '已完成：已让 AE 补一手客户证据。',
      occurred_at: '2026-05-01T14:00:00.000Z',
      created_at: '2026-05-01T14:00:00.000Z',
      metadata: {
        schemaVersion: 1,
        intervention: {
          id: 'int_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          type: 'manager_intervention',
          action: 'verify_evidence',
          status: 'completed',
          reason: '证据不足，不能直接升级。',
          recommendedAction: '补一条一手证据。',
          evidenceRefs: [],
          createdAt: '2026-05-01T14:00:00.000Z',
        },
      },
    });
    sourceRecords.push({
      id: 'sr_outcome_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'intervention_outcome',
      source_table: 'source_records',
      source_row_id: 'out_1',
      title: '介入结果 · 有效',
      summary: '有效 · 证据改善：先核验证据比直接升级更有效。',
      occurred_at: '2026-05-01T15:00:00.000Z',
      created_at: '2026-05-01T15:00:00.000Z',
      metadata: {
        schemaVersion: 1,
        interventionOutcome: {
          id: 'out_1',
          orgId: 'org_1',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          interventionId: 'int_1',
          sourceRecordId: 'sr_intervention_1',
          role: 'manager',
          reason: '证据不足，不能直接升级。',
          outcome: 'effective',
          impact: 'evidence_improved',
          confidence: 0.8,
          outcomeNote: 'AE 补回一手采购 owner 证据。',
          learningSummary: '先核验证据比直接升级更有效。',
          evidenceRefs: [],
          createdAt: '2026-05-01T15:00:00.000Z',
        },
      },
    });
    sourceRecords.push({
      id: 'sr_outcome_cross',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'intervention_outcome',
      source_table: 'source_records',
      source_row_id: 'out_cross',
      title: 'bad',
      summary: 'bad',
      occurred_at: '2026-05-01T16:00:00.000Z',
      created_at: '2026-05-01T16:00:00.000Z',
      metadata: {
        interventionOutcome: {
          id: 'out_cross',
          orgId: 'org_1',
          accountId: 'other_acc',
          interventionId: 'int_cross',
          sourceRecordId: 'sr_cross',
          outcome: 'ineffective',
          impact: 'no_change',
          confidence: 0.5,
          outcomeNote: 'bad',
          learningSummary: 'bad',
          evidenceRefs: [],
          createdAt: '2026-05-01T16:00:00.000Z',
        },
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.interventionOutcomes).toHaveLength(1);
    expect(payload.interventionOutcomes[0]).toMatchObject({ id: 'out_1', accountId: 'acc_1', interventionId: 'int_1', outcome: 'effective' });
    expect(payload.judgmentLearning.recentLearnings).toHaveLength(1);
    expect(payload.judgmentLearning.recentLearnings[0]).toMatchObject({ id: 'out_1', impact: 'evidence_improved' });
    expect(payload.judgmentTimeline.map((item: { kind: string }) => item.kind)).toEqual(['intervention_outcome', 'intervention']);
    expect(payload.judgmentTimeline[0]).toMatchObject({
      kind: 'intervention_outcome',
      id: 'intervention_outcome:out_1',
      title: '介入结果/学习结论 · 有效',
    });
  });

  it('returns play execution events and includes them in judgmentTimeline', async () => {
    sourceRecords.push({
      id: 'sr_play_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'play_execution_event',
      source_table: 'strategic_plays',
      source_row_id: 'play_1',
      title: '谋局执行 · 受阻',
      summary: '受阻：采购拒绝透露评分表',
      occurred_at: '2026-05-02T10:00:00.000Z',
      created_at: '2026-05-02T10:00:00.000Z',
      metadata: {
        playExecutionEvent: {
          id: 'play_1:0:blocked:2026-05-02T10:00:00.000Z',
          orgId: 'org_1',
          accountId: 'acc_1',
          playId: 'play_1',
          opportunityId: 'opp_1',
          stepIndex: 0,
          stepTitle: '验证采购评分表',
          status: 'blocked',
          blockerReason: '采购拒绝透露评分表',
          nextAction: '请 sponsor 侧面验证评分标准',
          occurredAt: '2026-05-02T10:00:00.000Z',
        },
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.playExecutionEvents).toHaveLength(1);
    expect(payload.playExecutionEvents[0]).toMatchObject({ accountId: 'acc_1', playId: 'play_1', status: 'blocked' });
    expect(payload.judgmentTimeline[0]).toMatchObject({
      kind: 'play_execution_event',
      title: '谋局执行 · 受阻',
      summary: expect.stringContaining('采购拒绝透露评分表'),
      traceStatus: 'persisted',
    });
  });

  it('returns judgmentTimeline from persisted judgment memory source records', async () => {
    sourceRecords.push({
      id: 'sr_mem_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'judgment_memory',
      source_table: 'email_decodes',
      source_row_id: 'dec_1',
      title: 'Decode 判断',
      summary: '客户预算仍在，但审批人发生变化。',
      occurred_at: '2026-05-01T10:00:00.000Z',
      created_at: '2026-05-01T10:00:00.000Z',
      metadata: {
        judgmentMemory: {
          sourceKind: 'decode',
          sourceId: 'dec_1',
          accountId: 'acc_1',
          title: 'Decode 判断',
          currentJudgment: '客户预算仍在，但审批人发生变化。',
          risk: '审批链不清晰。',
          nextAction: '确认新审批人。',
          confidence: 0.7,
          provisional: true,
          evidenceRefs: [],
          createdAt: '2026-05-01T10:00:00.000Z',
        },
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.judgmentMemories).toHaveLength(1);
    expect(payload.judgmentTimeline).toHaveLength(1);
    expect(payload.judgmentTimeline[0]).toMatchObject({
      kind: 'judgment_memory',
      id: 'judgment_memory:decode:dec_1',
      title: 'Decode 判断',
      summary: '客户预算仍在，但审批人发生变化。',
      traceStatus: 'persisted',
    });
  });

  it('returns account-level decodeStabilityTimeline from judgment memory records', async () => {
    const decode: DecodeOutput = {
      messages: [{
        speaker: 'them',
        original: '客户说还要内部确认预算。',
        decode: { meaning: '预算仍未确认', emotion: '谨慎', urgency: 5, confidence: 0.6 },
      }],
      threadAnalysis: {
        sentimentTrend: 'cooling',
        riskLevel: 'medium',
        buyerState: 'stalling',
        keySignal: '预算确认存在拖延风险',
      },
      actionItems: [{ title: '确认预算时间表', priority: 'medium', dueInDays: 2, reasoning: '需要明确预算 owner。' }],
    };
    const contextSnapshot = buildDecodeContextSnapshot({ emailText: '客户说还要内部确认预算。', accountId: 'acc_1' });
    const stableJudgment = buildStableDecodeJudgment(decode);
    const decodeStability = buildDecodeStabilityMetadata({
      contextSnapshot,
      stableJudgment,
      judgmentDiff: diffStableDecodeJudgment({ current: stableJudgment, currentContext: contextSnapshot, previous: null }),
    });

    sourceRecords.push({
      id: 'sr_mem_stability_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'judgment_memory',
      source_table: 'email_decodes',
      source_row_id: 'dec_1',
      title: 'Decode 判断',
      summary: '预算确认存在拖延风险',
      occurred_at: '2026-05-01T10:00:00.000Z',
      created_at: '2026-05-01T10:00:00.000Z',
      metadata: {
        decodeStability,
        judgmentMemory: {
          sourceKind: 'decode',
          sourceId: 'dec_1',
          accountId: 'acc_1',
          title: 'Decode 判断',
          currentJudgment: '预算确认存在拖延风险',
          risk: '预算未确认。',
          nextAction: '确认预算时间表。',
          confidence: 0.6,
          provisional: true,
          evidenceRefs: [],
          createdAt: '2026-05-01T10:00:00.000Z',
        },
      },
    });

    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.decodeStabilityTimeline).toHaveLength(1);
    expect(payload.judgmentStabilityTimeline).toHaveLength(1);
    expect(payload.decodeStabilityTimeline[0]).toMatchObject({
      sourceId: 'dec_1',
      sourceRecordId: 'sr_mem_stability_1',
      status: 'changed',
      inputSummary: '客户说还要内部确认预算。',
      hasSnapshot: true,
    });
    expect(payload.judgmentMemories[0].decodeStability).toMatchObject({ schemaVersion: 1 });
    expect(payload.decodeStabilityTimeline[0].correctionCta).toMatchObject({
      visible: true,
      targetType: 'decode',
      targetId: 'dec_1',
    });
  });

  it('returns empty judgmentTimeline when no judgment records exist', async () => {
    const response = await GET(memoryRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.judgmentTimeline).toEqual([]);
  });
});
