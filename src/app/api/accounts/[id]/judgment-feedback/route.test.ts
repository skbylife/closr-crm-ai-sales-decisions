import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import type { JudgmentFeedbackSourceRecordRow } from '@/lib/judgment/feedback';

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

type SourceRecordTestRow = JudgmentFeedbackSourceRecordRow & { id?: string | null };
type TestTableRow = Record<string, unknown>;

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/accounts/acc_1/judgment-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new Request('http://localhost/api/accounts/acc_1/judgment-feedback?limit=10', { method: 'GET' });
}

function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
  return filters.every(([key, value]) => row[key] === value);
}

function makeAdmin(
  sourceRecords: SourceRecordTestRow[],
  inserted: JudgmentFeedbackSourceRecordRow[],
  tables: Record<string, TestTableRow[]> = {},
) {
  const tableRows: Record<string, TestTableRow[]> = {
    ...tables,
    source_records: sourceRecords as unknown as TestTableRow[],
  };

  return {
    from(table: string) {
      const rows = tableRows[table];
      if (!rows) throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          return query;
        },
        order() {
          return query;
        },
        async limit(limit: number) {
          return { data: rows.filter((row) => matches(row, filters)).slice(0, limit), error: null };
        },
        async maybeSingle() {
          return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
        },
        async insert(row: JudgmentFeedbackSourceRecordRow) {
          if (table !== 'source_records') throw new Error(`unexpected insert table ${table}`);
          inserted.push(row);
          sourceRecords.unshift({ id: row.source_row_id, ...row });
          return { error: null };
        },
      };
      return query;
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('/api/accounts/[id]/judgment-feedback', () => {
  const inserted: JudgmentFeedbackSourceRecordRow[] = [];
  const sourceRecords: SourceRecordTestRow[] = [];
  const rfps: TestTableRow[] = [];
  const rfpAiAnalyses: TestTableRow[] = [];
  const emailDecodes: TestTableRow[] = [];

  beforeEach(() => {
    inserted.length = 0;
    sourceRecords.length = 0;
    rfps.length = 0;
    rfpAiAnalyses.length = 0;
    emailDecodes.length = 0;
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
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin(sourceRecords, inserted, {
      email_decodes: emailDecodes,
      rfps,
      rfp_ai_analyses: rfpAiAnalyses,
    }));
  });

  it('persists account-scoped feedback on the server', async () => {
    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'open_question',
      targetId: 'oq_1',
      kind: 'missing_evidence',
      content: 'VP Operations 才是真正 owner，但缺少最新会议证据。',
      previousSummary: '当前问题假设 CFO 是 owner。',
      scope: 'account_only',
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.feedback.content).toBe('VP Operations 才是真正 owner，但缺少最新会议证据。');
    expect(payload.feedback.feedbackType).toBe('missing_evidence');
    expect(payload.revisionStatus).toBe('ready');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'human_feedback',
      source_table: 'judgment_feedback',
    });
    expect(inserted[0].metadata.feedback).toMatchObject({
      orgId: 'org_1',
      accountId: 'acc_1',
      createdBy: 'user_1',
      kind: 'missing_evidence',
      feedbackType: 'missing_evidence',
      targetType: 'open_question',
      targetId: 'oq_1',
      scope: 'account_only',
    });
    expect(inserted[0].metadata.feedback.createdAt).toEqual(expect.any(String));
    expect(inserted[0].metadata.revisionStatus).toBe('ready');
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
  });

  it('rejects invalid feedback type', async () => {
    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'correction',
      content: '旧类型不能再写入。',
      scope: 'account_only',
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('requires account-scoped validation and does not persist mismatched account feedback', async () => {
    const response = await POST(request({
      accountId: 'other_acc',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'inaccurate',
      content: '这条反馈不能写入其他账户。',
      scope: 'account_only',
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(400);
    expect(inserted).toHaveLength(0);
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
  });

  it('returns access denied without persisting feedback', async () => {
    vi.mocked(requireAccountAccess).mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'inaccurate',
      content: '无权限时不能写入。',
      scope: 'account_only',
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it('rejects source pointers from another account/org', async () => {
    sourceRecords.push({
      id: 'sr_other',
      org_id: 'org_1',
      account_id: 'other_acc',
      source_kind: 'human_feedback',
      source_table: 'judgment_feedback',
      source_row_id: 'fb_other',
      title: 'other',
      summary: 'other',
      occurred_at: '2026-04-30T12:00:00.000Z',
      metadata: {
        feedback: {
          id: 'fb_other',
          orgId: 'org_1',
          accountId: 'other_acc',
          targetType: 'judgment',
          targetId: 'judgment_1',
          kind: 'inaccurate',
          feedbackType: 'inaccurate',
          content: 'other',
          scope: 'account_only',
          status: 'active',
          evidenceRefs: [],
          createdAt: '2026-04-30T12:00:00.000Z',
        },
        revisionStatus: 'ready',
        previousSummary: '',
        scopeNote: '',
      },
    });

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'inaccurate',
      content: '不能引用其他 account 的来源。',
      scope: 'account_only',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'sr_other', sourceTable: 'source_records' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('source pointer');
    expect(inserted).toHaveLength(0);
  });

  it('accepts decode stability CTA source pointers owned by the current account/org', async () => {
    sourceRecords.push({
      id: 'sr_decode_memory_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_1',
      title: 'Decode 判断',
      summary: '判断记忆',
      occurred_at: '2026-05-01T10:00:00.000Z',
      metadata: {
        judgmentMemory: {
          sourceKind: 'decode',
          sourceId: 'decode_1',
          accountId: 'acc_1',
          currentJudgment: '预算确认存在拖延风险',
          risk: '预算未确认',
          nextAction: '确认预算时间表',
          confidence: 0.6,
          provisional: true,
          evidenceRefs: [],
          createdAt: '2026-05-01T10:00:00.000Z',
        },
      },
    } as unknown as SourceRecordTestRow);
    emailDecodes.push({ id: 'decode_1', org_id: 'org_1', account_id: 'acc_1' });

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'decode',
      targetId: 'decode_1',
      kind: 'missing_evidence',
      content: '需要补充 CFO 已要求 ROI 测算这个背景。',
      previousSummary: '预算确认存在拖延风险',
      scope: 'account_only',
      evidenceRefs: [
        { sourceKind: 'source_record', sourceId: 'sr_decode_memory_1', sourceTable: 'source_records' },
        { sourceKind: 'email_decode', sourceId: 'decode_1', sourceTable: 'email_decodes' },
      ],
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].metadata.feedback).toMatchObject({
      targetType: 'decode',
      targetId: 'decode_1',
      evidenceRefs: [
        expect.objectContaining({ sourceTable: 'source_records', sourceId: 'sr_decode_memory_1' }),
        expect.objectContaining({ sourceTable: 'email_decodes', sourceId: 'decode_1' }),
      ],
    });
  });

  it('accepts rfp source pointers owned by the current account/org', async () => {
    rfps.push({ id: 'rfp_1', org_id: 'org_1', account_id: 'acc_1' });

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'rfp',
      targetId: 'rfp_1',
      kind: 'accurate',
      content: 'RFP 判断来源属于当前账户。',
      scope: 'account_only',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'rfp_1', sourceTable: 'rfps' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(201);
    expect(inserted).toHaveLength(1);
  });

  it('rejects rfp source pointers from another account', async () => {
    rfps.push({ id: 'rfp_other', org_id: 'org_1', account_id: 'other_acc' });

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'rfp',
      targetId: 'rfp_1',
      kind: 'inaccurate',
      content: '不能引用其他账户的 RFP。',
      scope: 'account_only',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'rfp_other', sourceTable: 'rfps' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('source pointer');
    expect(inserted).toHaveLength(0);
  });

  it('accepts rfp_ai_analyses source pointers through an owned rfp', async () => {
    rfps.push({ id: 'rfp_1', org_id: 'org_1', account_id: 'acc_1' });
    rfpAiAnalyses.push({ id: 'analysis_1', org_id: 'org_1', rfp_id: 'rfp_1' });

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'rfp',
      targetId: 'rfp_1',
      kind: 'missing_evidence',
      content: 'RFP AI 分析来源属于当前账户。',
      scope: 'account_only',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'analysis_1', sourceTable: 'rfp_ai_analyses' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });

    expect(response.status).toBe(201);
    expect(inserted).toHaveLength(1);
  });

  it('rejects rfp_ai_analyses source pointers when the linked rfp belongs to another account', async () => {
    rfps.push({ id: 'rfp_other', org_id: 'org_1', account_id: 'other_acc' });
    rfpAiAnalyses.push({ id: 'analysis_other', org_id: 'org_1', rfp_id: 'rfp_other' });

    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'rfp',
      targetId: 'rfp_1',
      kind: 'over_inferred',
      content: '不能引用其他账户 RFP 的 AI 分析。',
      scope: 'account_only',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'analysis_other', sourceTable: 'rfp_ai_analyses' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('source pointer');
    expect(inserted).toHaveLength(0);
  });

  it('rejects unsupported sourceTable instead of silently accepting it', async () => {
    const response = await POST(request({
      accountId: 'acc_1',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'inaccurate',
      content: '未知 account-scoped 来源不能静默通过。',
      scope: 'account_only',
      evidenceRefs: [{ sourceKind: 'source_record', sourceId: 'doc_1', sourceTable: 'rfp_documents' }],
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain('unsupported sourceTable');
    expect(inserted).toHaveLength(0);
  });

  it('reads feedback revision records from source_records', async () => {
    const post = await POST(request({
      accountId: 'acc_1',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'stale',
      content: 'CFO 已离职，旧判断过期。',
      previousSummary: 'CFO 仍阻塞审批。',
      scope: 'account_only',
    }), { params: Promise.resolve({ id: 'acc_1' }) });
    expect(post.status).toBe(201);

    const response = await GET(getRequest(), { params: Promise.resolve({ id: 'acc_1' }) });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.judgmentFeedbacks).toHaveLength(1);
    expect(payload.judgmentFeedbacks[0].feedbackType).toBe('stale');
    expect(payload.revisedJudgmentPreviews).toHaveLength(1);
    expect(payload.feedbackRevisionRecords).toHaveLength(1);
    expect(payload.feedbackRevisionRecords[0].revisionStatus).toBe('ready');
  });
});
