import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth, requireOwnership } from '@/lib/api-guard';
import { buildRelationshipGraph, generateStrategicPlay } from '@/lib/strategic-play-engine';
import { getAccountMemoryPayload } from '@/lib/evidence-memory/server';
import { buildMemoryProvenance } from '@/lib/evidence-provenance';
import { persistJudgmentMemorySourceRecord } from '@/lib/judgment/persistence';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireOwnership: vi.fn(),
  requireAccountAccess: vi.fn(),
  requireContactAccess: vi.fn(),
  requireOpportunityAccess: vi.fn(),
  guardResponse: (err: unknown) => {
    const message = err instanceof Error ? err.message : 'error';
    return Response.json({ error: message }, { status: 500 });
  },
}));

vi.mock('@/lib/strategic-play-engine', () => ({
  buildRelationshipGraph: vi.fn(),
  generateStrategicPlay: vi.fn(),
}));

vi.mock('@/lib/knowledge-engine', () => ({ depositKnowledge: vi.fn() }));
vi.mock('@/lib/evidence-memory/server', () => ({ getAccountMemoryPayload: vi.fn(), invalidateAccountCaches: vi.fn() }));
vi.mock('@/lib/evidence-provenance', () => ({ buildMemoryProvenance: vi.fn() }));
vi.mock('@/lib/judgment/memory', () => ({ buildJudgmentMemoryFromStrategicPlay: vi.fn(() => ({ id: 'jm_1' })) }));
vi.mock('@/lib/judgment/persistence', () => ({ persistJudgmentMemorySourceRecord: vi.fn(async () => ({ status: 'persisted' })) }));

type Row = Record<string, unknown>;

type QueryResult = { data: Row[] | Row | null; error: { message?: string } | null };

const provenanceFixture = {
  evidenceIds: ['sr_1'],
  sourceIds: ['sr_1'],
  sourceTypes: ['source_record'],
  confidence: 0.72,
  contradictions: [],
  tensions: ['预算窗口仍需确认'],
  rationale: '测试证据归因',
  traces: [{ sourceId: 'sr_1', sourceType: 'source_record', sourceTable: 'source_records', sourceRowId: 'sr_1', title: '预算邮件', excerpt: '客户提到 Q2 预算' }],
  generatedAt: '2026-05-06T14:00:00.000Z',
};

function matches(row: Row, filters: Array<[string, unknown]>, gteFilters: Array<[string, string]>) {
  return filters.every(([key, value]) => row[key] === value)
    && gteFilters.every(([key, value]) => typeof row[key] === 'string' && String(row[key]) >= value);
}

function makeAdmin(tables: Record<string, Row[]>, options?: { updateErrorTables?: string[] }) {
  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      const rows = tables[table];
      const filters: Array<[string, unknown]> = [];
      const gteFilters: Array<[string, string]> = [];
      let pendingInsert: Row | null = null;
      let pendingUpdate: Row | null = null;
      let limitCount: number | null = null;
      let orderKey: string | null = null;
      let ascending = true;

      const filteredRows = () => {
        let result = rows.filter((row) => matches(row, filters, gteFilters));
        if (orderKey) {
          result = [...result].sort((a, b) => {
            const av = String(a[orderKey!] ?? '');
            const bv = String(b[orderKey!] ?? '');
            return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        return limitCount === null ? result : result.slice(0, limitCount);
      };

      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push([key, value]); return query; },
        gte(key: string, value: string) { gteFilters.push([key, value]); return query; },
        order(key: string, opts?: { ascending?: boolean }) { orderKey = key; ascending = opts?.ascending ?? true; return query; },
        limit(count: number) { limitCount = count; return query; },
        insert(payload: Row) { pendingInsert = { ...payload }; return query; },
        update(payload: Row) { pendingUpdate = payload; return query; },
        async single() {
          if (pendingInsert) {
            const inserted = {
              id: pendingInsert.id ?? 'play_new',
              created_at: pendingInsert.created_at ?? '2026-05-06T14:00:00.000Z',
              updated_at: pendingInsert.updated_at ?? '2026-05-06T14:00:00.000Z',
              ...pendingInsert,
            };
            rows.push(inserted);
            return { data: inserted, error: null };
          }
          return { data: filteredRows()[0] ?? null, error: null };
        },
        async maybeSingle() {
          if (pendingUpdate) {
            if (options?.updateErrorTables?.includes(table)) {
              return { data: null, error: { message: 'update failed' } };
            }
            const matched = filteredRows();
            for (const row of matched) Object.assign(row, pendingUpdate);
            return { data: matched[0] ?? null, error: null };
          }
          return { data: filteredRows()[0] ?? null, error: null };
        },
        then(resolve: (value: QueryResult) => void) {
          if (pendingInsert) {
            rows.push({ ...pendingInsert, id: pendingInsert.id ?? `${table}_${rows.length + 1}` });
            resolve({ data: null, error: null });
            return;
          }
          if (pendingUpdate) {
            if (options?.updateErrorTables?.includes(table)) {
              resolve({ data: null, error: { message: 'update failed' } });
              return;
            }
            for (const row of rows) {
              if (matches(row, filters, gteFilters)) Object.assign(row, pendingUpdate);
            }
            resolve({ data: null, error: null });
            return;
          }
          resolve({ data: filteredRows(), error: null });
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

function jsonRequest(method: string, body?: Record<string, unknown>) {
  return new Request('http://localhost/api/strategic-play?accountId=acc_1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('/api/strategic-play schema v1', () => {
  const tables: Record<string, Row[]> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    tables.strategic_plays = [];
    tables.accounts = [{ id: 'acc_1', org_id: 'org_1', name: 'Acme', competitors: [] }];
    tables.contacts = [];
    tables.opportunities = [];
    tables.intel_items = [];
    tables.source_records = [];

    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 1,
      teamMemberIds: ['user_1'],
    } as Awaited<ReturnType<typeof requireAuth>>);
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireOwnership).mockImplementation(() => undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(tables));
    vi.mocked(buildRelationshipGraph).mockResolvedValue({ ourTeam: [], theirTeam: [], edges: [] });
    vi.mocked(getAccountMemoryPayload).mockResolvedValue({ records: [], summary: null, conflicts: [] } as never);
    vi.mocked(buildMemoryProvenance).mockReturnValue(provenanceFixture as never);
    vi.mocked(persistJudgmentMemorySourceRecord).mockResolvedValue({ status: 'persisted' } as never);
  });

  it('saves and returns schema v1 fields plus step expectedOutcome on POST', async () => {
    vi.mocked(generateStrategicPlay).mockResolvedValue({
      situationJudgment: '预算窗口打开，但采购链路不透明。',
      strategicObjective: '锁定 CFO 预算承诺',
      stakeholderPath: ['Champion → CFO'],
      evidenceBasis: ['Champion 回复积极'],
      riskCounterEvidence: ['采购标准未知'],
      actionPlan: [{ index: 1, title: '验证预算人', description: '请 Champion 引荐 CFO', who: 'AE', target: 'Champion', action: '发邮件', timing: '本周', purpose: '确认预算链', rationale: 'MEDDIC Economic Buyer', expectedOutcome: 'Champion 给出 CFO 引荐或明确拒绝原因', risk: 'Champion 回避', fallback: '找技术负责人侧证', status: 'planned' }],
      steps: [{ index: 1, title: '验证预算人', description: '请 Champion 引荐 CFO', who: 'AE', target: 'Champion', action: '发邮件', timing: '本周', purpose: '确认预算链', rationale: 'MEDDIC Economic Buyer', expectedOutcome: 'Champion 给出 CFO 引荐或明确拒绝原因', risk: 'Champion 回避', fallback: '找技术负责人侧证', status: 'planned' }],
      alternativePaths: [],
      successCriteria: 'CFO 确认预算和下一步会议',
      confidence: 72,
      ragCases: [],
      fieldEvidenceAttributions: [
        { field: 'situationJudgment', classification: 'mixed', evidenceRefs: [{ sourceId: 'kb_1', sourceType: 'knowledge_items', sourceTable: 'knowledge_items', title: 'Acme 扩容案例' }], gaps: ['采购评分标准未知'], rationale: '预算判断有案例支持，但采购标准缺证据' },
        { field: 'steps[0].expectedOutcome', classification: 'inference', evidenceRefs: [{ sourceId: 'kb_1', sourceType: 'knowledge_items', title: 'Acme 扩容案例' }], gaps: [], rationale: '预期产出来自相似扩容路径推断' },
      ],
      knowledgeTraces: [{ id: 'kb_1', title: 'Acme 扩容案例', category: 'case_study', source: 'knowledge_base', sourceType: 'knowledge_items', relevanceReason: '相似扩容路径', contentSnippet: '先确认 CFO 预算再推进扩容' }],
      knowledgeGaps: ['缺少采购评分标准证据'],
    });

    const response = await POST(jsonRequest('POST', {
      accountId: 'acc_1',
      accountName: 'Acme',
      goalType: 'expand_deal',
      goalDescription: '推动 Q2 扩容',
      successCriteria: '拿到 CFO 下一步会议',
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      situationJudgment: '预算窗口打开，但采购链路不透明。',
      strategicObjective: '锁定 CFO 预算承诺',
      stakeholderPath: ['Champion → CFO'],
      evidenceBasis: ['Champion 回复积极'],
      riskCounterEvidence: ['采购标准未知'],
      successCriteria: 'CFO 确认预算和下一步会议',
      knowledgeTraces: [{ id: 'kb_1', title: 'Acme 扩容案例', category: 'case_study', source: 'knowledge_base', sourceType: 'knowledge_items', relevanceReason: '相似扩容路径', contentSnippet: '先确认 CFO 预算再推进扩容' }],
      knowledgeGaps: ['缺少采购评分标准证据'],
      provenance: expect.objectContaining({ sourceIds: ['sr_1'] }),
    });
    expect(payload.fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'situationJudgment', classification: 'mixed', gaps: ['采购评分标准未知'] }),
      expect.objectContaining({ field: 'steps[0].expectedOutcome', classification: 'inference' }),
    ]));
    expect(payload.evidenceTrace.fieldEvidenceAttributions).toEqual(payload.fieldEvidenceAttributions);
    expect(payload.evidenceTrace.fieldEvidenceRefs.situationJudgment[0]).toMatchObject({ sourceId: 'kb_1', sourceTable: 'knowledge_items' });
    expect(payload.actionPlan[0].expectedOutcome).toBe('Champion 给出 CFO 引荐或明确拒绝原因');
    expect(tables.strategic_plays[0]).toMatchObject({
      situation_judgment: '预算窗口打开，但采购链路不透明。',
      strategic_objective: '锁定 CFO 预算承诺',
      stakeholder_path: ['Champion → CFO'],
      evidence_basis: ['Champion 回复积极'],
      risk_counter_evidence: ['采购标准未知'],
      success_criteria: 'CFO 确认预算和下一步会议',
      knowledge_traces: [{ id: 'kb_1', title: 'Acme 扩容案例', category: 'case_study', source: 'knowledge_base', sourceType: 'knowledge_items', relevanceReason: '相似扩容路径', contentSnippet: '先确认 CFO 预算再推进扩容' }],
      knowledge_gaps: ['缺少采购评分标准证据'],
      evidence_provenance: expect.objectContaining({
        ...provenanceFixture,
        fieldEvidenceAttributions: expect.arrayContaining([expect.objectContaining({ field: 'steps[0].expectedOutcome' })]),
      }),
    });
    expect((tables.strategic_plays[0].evidence_provenance as Row).fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'situationJudgment', classification: 'mixed' }),
    ]));
    expect((tables.strategic_plays[0].steps as Row[])[0].expectedOutcome).toBe('Champion 给出 CFO 引荐或明确拒绝原因');
  });

  it('GET maps old plays safely with deterministic v1 fallbacks', async () => {
    tables.strategic_plays.push({
      id: 'play_old',
      org_id: 'org_1',
      account_id: 'acc_1',
      goal_type: 'custom',
      goal_description: '旧谋局',
      steps: [{ index: 1, title: '旧步骤', description: '旧描述', who: 'AE', target: '客户', action: '跟进', timing: '本周', purpose: '推进', risk: '无响应', fallback: '再跟进', status: 'planned', expected_outcome: '客户回复' }],
      alternative_paths: [],
      confidence: 60,
      status: 'active',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    });

    const response = await GET(jsonRequest('GET'));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plays[0]).toMatchObject({
      id: 'play_old',
      situationJudgment: expect.stringContaining('旧谋局'),
      strategicObjective: '旧谋局',
      stakeholderPath: ['待识别关键人路径'],
      evidenceBasis: ['历史谋局记录/用户目标/关系图谱'],
      riskCounterEvidence: ['旧数据未记录反证；执行中需持续验证。'],
      knowledgeTraces: [],
      knowledgeGaps: [],
      provenance: null,
    });
    expect(payload.plays[0].evidenceTrace.fieldEvidenceRefs.situationJudgment).toEqual([]);
    expect(payload.plays[0].fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'situationJudgment', classification: 'gap', gaps: [expect.stringContaining('缺少可追踪')] }),
      expect.objectContaining({ field: 'steps[0].expectedOutcome', classification: 'gap' }),
    ]));
    expect(payload.plays[0].steps[0].expectedOutcome).toBe('客户回复');
    expect(payload.plays[0].actionPlan).toEqual(payload.plays[0].steps);
  });

  it('GET returns persisted evidence trace, gaps, and provenance for saved plays', async () => {
    tables.strategic_plays.push({
      id: 'play_trace',
      org_id: 'org_1',
      account_id: 'acc_1',
      goal_type: 'expand_deal',
      goal_description: '扩容谋局',
      situation_judgment: '已有预算信号',
      strategic_objective: '锁定预算',
      stakeholder_path: ['Champion → CFO'],
      evidence_basis: ['预算邮件'],
      risk_counter_evidence: ['采购标准未知'],
      knowledge_traces: [{ id: 'kb_2', title: '扩容打法', category: 'methodology', relevanceReason: '同类路径', contentSnippet: '先找经济买家' }],
      knowledge_gaps: ['缺少竞对报价证据'],
      evidence_provenance: {
        ...provenanceFixture,
        fieldEvidenceAttributions: [{ field: 'evidenceBasis', classification: 'fact', evidenceRefs: [{ sourceId: 'sr_1', sourceType: 'source_record', sourceTable: 'source_records' }], gaps: [], rationale: '预算邮件是事实证据' }],
      },
      steps: [],
      alternative_paths: [],
      confidence: 70,
      status: 'active',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    });

    const response = await GET(jsonRequest('GET'));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.plays[0]).toMatchObject({
      id: 'play_trace',
      knowledgeTraces: [{ id: 'kb_2', title: '扩容打法', category: 'methodology', relevanceReason: '同类路径', contentSnippet: '先找经济买家' }],
      knowledgeGaps: ['缺少竞对报价证据'],
      provenance: expect.objectContaining({ sourceIds: ['sr_1'] }),
    });
    expect(payload.plays[0].fieldEvidenceAttributions).toEqual([expect.objectContaining({ field: 'evidenceBasis', classification: 'fact' })]);
    expect(payload.plays[0].evidenceTrace.fieldEvidenceRefs.evidenceBasis[0]).toMatchObject({ sourceId: 'sr_1' });
  });

  it('keeps the main play save when judgment source_records persistence is unavailable', async () => {
    vi.mocked(persistJudgmentMemorySourceRecord).mockResolvedValue({ status: 'skipped', reason: 'source_records_unavailable' } as never);
    vi.mocked(generateStrategicPlay).mockResolvedValue({
      situationJudgment: '证据有限但目标明确',
      strategicObjective: '确认预算链',
      stakeholderPath: ['Champion → CFO'],
      evidenceBasis: ['用户目标'],
      riskCounterEvidence: ['source_records 不可用不应阻断保存'],
      actionPlan: [{ index: 1, title: '补证据', description: '补齐预算证据', who: 'AE', target: 'Champion', action: '跟进', timing: '本周', purpose: '补证据', expectedOutcome: '拿到预算链', risk: '无响应', fallback: '找二线联系人', status: 'planned' }],
      steps: [{ index: 1, title: '补证据', description: '补齐预算证据', who: 'AE', target: 'Champion', action: '跟进', timing: '本周', purpose: '补证据', expectedOutcome: '拿到预算链', risk: '无响应', fallback: '找二线联系人', status: 'planned' }],
      alternativePaths: [],
      successCriteria: '确认 CFO 预算链',
      confidence: 60,
      ragCases: [],
      knowledgeTraces: [],
      knowledgeGaps: ['缺少 source_records 持久化链路'],
    });

    const response = await POST(jsonRequest('POST', {
      accountId: 'acc_1',
      accountName: 'Acme',
      goalType: 'expand_deal',
      goalDescription: 'source_records unavailable case',
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.id).toBe('play_new');
    expect(payload.knowledgeGaps).toEqual(['缺少 source_records 持久化链路']);
    expect(payload.fieldEvidenceAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'situationJudgment', classification: 'mixed', gaps: ['缺少 source_records 持久化链路'] }),
      expect.objectContaining({ field: 'steps[0].expectedOutcome', classification: 'mixed' }),
    ]));
    expect(tables.strategic_plays[0]).toMatchObject({
      goal_description: 'source_records unavailable case',
      knowledge_gaps: ['缺少 source_records 持久化链路'],
    });
  });

  it('returns an error when replan generation cannot be persisted', async () => {
    tables.strategic_plays.push({
      id: 'play_replan',
      org_id: 'org_1',
      user_id: 'user_1',
      account_id: 'acc_1',
      opportunity_id: null,
      goal_type: 'expand_deal',
      goal_description: '重规划测试',
      success_criteria: '拿到下一步',
      steps: [{ index: 1, title: '旧步骤', description: '旧描述', status: 'done' }],
      alternative_paths: [],
      confidence: 60,
      evidence_provenance: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(tables, { updateErrorTables: ['strategic_plays'] }));
    vi.mocked(generateStrategicPlay).mockResolvedValue({
      situationJudgment: '需要调整路径',
      strategicObjective: '保留目标，调整后续打法',
      stakeholderPath: ['Champion → CFO'],
      evidenceBasis: ['旧步骤已完成'],
      riskCounterEvidence: [],
      actionPlan: [{ index: 1, title: '新步骤', description: '新描述', who: 'AE', target: 'Champion', action: '跟进', timing: '本周', purpose: '推进', expectedOutcome: '确认下一步', risk: '无响应', fallback: '找二线联系人', status: 'planned' }],
      steps: [{ index: 1, title: '新步骤', description: '新描述', who: 'AE', target: 'Champion', action: '跟进', timing: '本周', purpose: '推进', expectedOutcome: '确认下一步', risk: '无响应', fallback: '找二线联系人', status: 'planned' }],
      alternativePaths: [],
      successCriteria: '拿到下一步',
      confidence: 70,
      ragCases: [],
      knowledgeTraces: [],
      knowledgeGaps: [],
    });

    const response = await POST(jsonRequest('POST', {
      replanFromStep: {
        playId: 'play_replan',
        stepIndex: 0,
        previousSteps: [{ index: 1, title: '旧步骤', status: 'done' }],
        assumptions: [],
        learnings: [],
      },
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: 'Failed to save replanned play' });
    expect(tables.strategic_plays[0].steps).toEqual([{ index: 1, title: '旧步骤', description: '旧描述', status: 'done' }]);
  });
});
