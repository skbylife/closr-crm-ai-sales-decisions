import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateAccountCaches } from '@/lib/evidence-memory/server';
import { persistJudgmentMemorySourceRecord } from '@/lib/judgment/persistence';
import {
  normalizeStrategicPlayForJudgment,
  persistStrategicPlayJudgmentMemory,
  persistStrategicPlayJudgmentMemoryById,
  type StrategicPlayMemoryRow,
} from './strategic-play-judgment-memory';

vi.mock('@/lib/evidence-memory/server', () => ({ invalidateAccountCaches: vi.fn() }));
vi.mock('@/lib/judgment/persistence', () => ({ persistJudgmentMemorySourceRecord: vi.fn(async () => ({ status: 'persisted' })) }));

const baseRow: StrategicPlayMemoryRow = {
  id: 'play_1',
  account_id: 'acc_1',
  opportunity_id: 'opp_1',
  target_contact_id: 'contact_1',
  goal_description: ' 推动 CFO 确认 Q2 扩容 ',
  steps: [{ title: '约 CFO', description: '请 Champion 引荐 CFO' }],
  confidence: 82,
  assumptions: [{ id: 'assumption_1', text: 'Champion 能影响 CFO', status: 'pending' }],
  knowledge_traces: [{ id: 'kb_1', title: '扩容案例', category: 'case', relevanceReason: '相似路径', contentSnippet: '先确认预算' }],
  knowledge_gaps: ['采购流程未知'],
  created_at: '2026-05-06T14:00:00.000Z',
  updated_at: '2026-05-06T14:30:00.000Z',
};

const persistedProvenance = {
  evidenceIds: ['ev_1'],
  sourceIds: ['sr_1'],
  sourceTypes: ['source_record'],
  confidence: 0.82,
  contradictions: [],
  tensions: ['采购流程仍需确认'],
  rationale: '基于已保存证据',
  traces: [
    {
      evidenceId: 'ev_1',
      sourceId: 'sr_1',
      sourceType: 'source_record',
      sourceKind: 'source_record',
      sourceTable: 'source_records',
      sourceRowId: 'sr_1',
      title: '预算邮件',
      excerpt: '客户提到 Q2 预算',
    },
  ],
  fieldEvidenceAttributions: [
    {
      field: 'situationJudgment',
      classification: 'fact',
      evidenceRefs: [{ sourceId: 'sr_1', sourceType: 'source_record', sourceTable: 'source_records', title: '预算邮件' }],
      gaps: [],
      rationale: '邮件直接支持预算窗口判断',
    },
    {
      field: 'steps[0].expectedOutcome',
      classification: 'inference',
      evidenceRefs: [{ sourceId: 'sr_1', sourceType: 'source_record', title: '预算邮件' }],
      gaps: ['未确认 CFO 是否参与'],
      rationale: '基于预算邮件推断下一步产出',
      calibrations: [
        {
          id: 'cal_1',
          sourceRef: {
            sourceId: 'sr_exec_1',
            sourceType: 'play_execution_event',
            sourceKind: 'source_record',
            sourceTable: 'source_records',
            sourceRowId: 'sr_exec_1',
            title: '执行结果：CFO 已确认预算',
            excerpt: 'CFO 同意进入采购流程',
          },
          executionStatus: 'done',
          outcomeAssessment: 'verified',
          previousClassification: 'inference',
          calibratedClassification: 'verified',
          note: '执行结果验证了 CFO 预算判断',
          occurredAt: '2026-05-06T15:00:00.000Z',
          createdBy: 'user_1',
        },
      ],
    },
  ],
  generatedAt: '2026-05-06T14:10:00.000Z',
};

function makeSelectAdmin(result: { data: StrategicPlayMemoryRow | null; error: { message?: string } | null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  const admin = {
    from: vi.fn(() => query),
  };
  return { admin, query };
}

describe('strategic-play-judgment-memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(persistJudgmentMemorySourceRecord).mockResolvedValue({ status: 'persisted' } as never);
  });

  it('normalizes old strategic_plays row into judgment memory input without crashing', () => {
    const memoryInput = normalizeStrategicPlayForJudgment({
      id: 'play_old',
      account_id: 'acc_old',
      goal_description: ' 旧谋局 ',
      steps: null,
      confidence: 'not-a-number',
      assumptions: null,
      updated_at: '2026-05-06T13:00:00.000Z',
    });

    expect(memoryInput).toMatchObject({
      id: 'play_old',
      accountId: 'acc_old',
      goalDescription: '旧谋局',
      steps: [],
      confidence: 0.5,
      assumptions: [],
      createdAt: '2026-05-06T13:00:00.000Z',
      updatedAt: '2026-05-06T13:00:00.000Z',
    });
  });

  it('preserves calibration trace and evidence provenance in persistence metadata', async () => {
    const judgmentMemory = await persistStrategicPlayJudgmentMemory({
      admin: {} as never,
      orgId: 'org_1',
      play: { ...baseRow, evidence_provenance: persistedProvenance },
    });

    expect(judgmentMemory).toEqual(expect.objectContaining({
      sourceKind: 'strategic_play',
      sourceId: 'play_1',
      accountId: 'acc_1',
      uncertainty: '最近执行校准：steps[0].expectedOutcome → verified（verified）。',
      rationale: '执行结果验证了 CFO 预算判断',
    }));
    expect(judgmentMemory?.evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'play_1', sourceTable: 'strategic_plays', sourceRowId: 'play_1' }),
      expect.objectContaining({ sourceId: 'sr_exec_1', sourceTable: 'source_records', sourceRowId: 'sr_exec_1' }),
    ]));
    expect(persistJudgmentMemorySourceRecord).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org_1',
      sourceTable: 'strategic_plays',
      expectedAccountId: 'acc_1',
      extraMetadata: expect.objectContaining({
        opportunityId: 'opp_1',
        targetContactId: 'contact_1',
        strategicPlayEvidenceTrace: expect.objectContaining({
          provenance: expect.objectContaining({
            evidenceIds: ['ev_1'],
            fieldEvidenceAttributions: expect.arrayContaining([
              expect.objectContaining({ field: 'steps[0].expectedOutcome', calibrations: expect.arrayContaining([expect.objectContaining({ id: 'cal_1' })]) }),
            ]),
          }),
        }),
      }),
    }));
    expect(invalidateAccountCaches).toHaveBeenCalledWith('acc_1', 'org_1');
  });

  it('keeps source_records unavailable warning behavior and still returns judgment memory', async () => {
    vi.mocked(persistJudgmentMemorySourceRecord).mockResolvedValue({ status: 'skipped', reason: 'source_records_unavailable' } as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const judgmentMemory = await persistStrategicPlayJudgmentMemory({
      admin: {} as never,
      orgId: 'org_1',
      play: baseRow,
    });

    expect(judgmentMemory).toEqual(expect.objectContaining({ sourceId: 'play_1' }));
    expect(warn).toHaveBeenCalledWith('[strategic-play] judgment memory source record skipped:', 'source_records_unavailable');
    expect(invalidateAccountCaches).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('refetches strategic play and persists the equivalent judgment memory source record', async () => {
    const { admin, query } = makeSelectAdmin({ data: { ...baseRow, evidence_provenance: persistedProvenance }, error: null });

    const judgmentMemory = await persistStrategicPlayJudgmentMemoryById({
      admin: admin as never,
      orgId: 'org_1',
      playId: 'play_1',
    });

    expect(admin.from).toHaveBeenCalledWith('strategic_plays');
    expect(query.select).toHaveBeenCalledWith('id, account_id, opportunity_id, target_contact_id, goal_description, steps, confidence, assumptions, knowledge_traces, knowledge_gaps, evidence_provenance, created_at, updated_at');
    expect(query.eq).toHaveBeenCalledWith('id', 'play_1');
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org_1');
    expect(query.maybeSingle).toHaveBeenCalled();
    expect(judgmentMemory).toEqual(expect.objectContaining({ sourceId: 'play_1', accountId: 'acc_1' }));
    expect(persistJudgmentMemorySourceRecord).toHaveBeenCalledWith(expect.objectContaining({
      judgmentMemory: expect.objectContaining({ sourceKind: 'strategic_play', sourceId: 'play_1', accountId: 'acc_1' }),
      sourceTable: 'strategic_plays',
      expectedAccountId: 'acc_1',
    }));
  });
});
