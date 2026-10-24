import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionResult } from '@/lib/compiled-intelligence/ai-extract';
import { getSourceRecordKindDefinition } from '@/lib/judgment/source-record-taxonomy';

const mockGetSupabaseAdmin = vi.fn();
const mockExtractIntelligence = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: mockGetSupabaseAdmin,
}));

vi.mock('@/lib/compiled-intelligence/ai-extract', () => ({
  extractIntelligence: mockExtractIntelligence,
}));

function makeOpenQuestionSelectResult() {
  return {
    eq() {
      return {
        eq() {
          return {
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        },
      };
    },
  };
}

function makeKnowledgePageDeleteResult() {
  return {
    eq() {
      return {
        eq() {
          return {
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        },
      };
    },
  };
}

function makeAdminMocks(options?: { sourceRecordError?: { message: string } | null }) {
  const sourceUpsert = vi.fn().mockResolvedValue({ error: options?.sourceRecordError ?? null });
  const updateLogInsert = vi.fn().mockResolvedValue({ error: null });

  const admin = {
    from(table: string) {
      if (table === 'source_records') {
        return {
          upsert: sourceUpsert,
        };
      }
      if (table === 'account_open_questions') {
        return {
          select: vi.fn().mockReturnValue(makeOpenQuestionSelectResult()),
        };
      }
      if (table === 'knowledge_update_log') {
        return {
          insert: updateLogInsert,
        };
      }
      if (table === 'account_knowledge_pages') {
        return {
          delete: vi.fn().mockReturnValue(makeKnowledgePageDeleteResult()),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { admin, sourceUpsert, updateLogInsert };
}

const baseExtraction: ExtractionResult = {
  evidence: [],
  claims: [],
  openQuestions: [],
  pageUpdates: [],
  summary: '已提取到关键信号摘要',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractIntelligence.mockResolvedValue(baseExtraction);
});

describe('runCILIngest source_records write chain', () => {
  it('writes source_records with deterministic source mapping for note/email ingest', async () => {
    const { admin, sourceUpsert, updateLogInsert } = makeAdminMocks();
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { runCILIngest } = await import('@/lib/compiled-intelligence/ingest');
    const result = await runCILIngest({
      orgId: 'org-1',
      accountId: 'acc-1',
      accountName: '华东某头部互联网平台',
      sourceId: 'intel_001',
      sourceType: 'note',
      rawText: '客户确认预算路径已进入最终审批。',
      occurredAt: '2026-04-08T10:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(sourceUpsert).toHaveBeenCalledTimes(1);
    expect(sourceUpsert.mock.calls[0][0]).toMatchObject({
      org_id: 'org-1',
      account_id: 'acc-1',
      source_kind: 'intel_item',
      source_table: 'intel_items',
      source_row_id: 'intel_001',
      occurred_at: '2026-04-08T10:00:00.000Z',
    });
    expect(sourceUpsert.mock.calls[0][1]).toEqual({
      onConflict: 'org_id,source_kind,source_row_id',
    });
    expect(updateLogInsert).toHaveBeenCalledTimes(1);
  });

  it('writes only active/transitional source_records kinds for all CIL source types', async () => {
    const cases: Array<{
      sourceType: 'note' | 'email' | 'meeting_note' | 'call_transcript';
      sourceId: string;
      expectedSourceKind: string;
      expectedSourceTable: string;
    }> = [
      { sourceType: 'note', sourceId: 'intel_002', expectedSourceKind: 'intel_item', expectedSourceTable: 'intel_items' },
      { sourceType: 'email', sourceId: 'email_002', expectedSourceKind: 'intel_item', expectedSourceTable: 'intel_items' },
      { sourceType: 'meeting_note', sourceId: 'meeting_002', expectedSourceKind: 'meeting_prep', expectedSourceTable: 'meeting_preps' },
      { sourceType: 'call_transcript', sourceId: 'call_002', expectedSourceKind: 'meeting_prep', expectedSourceTable: 'meeting_recordings' },
    ];

    const { runCILIngest } = await import('@/lib/compiled-intelligence/ingest');

    for (const testCase of cases) {
      const { admin, sourceUpsert } = makeAdminMocks();
      mockGetSupabaseAdmin.mockReturnValue(admin);

      const result = await runCILIngest({
        orgId: 'org-1',
        accountId: 'acc-1',
        accountName: '华东某头部互联网平台',
        sourceId: testCase.sourceId,
        sourceType: testCase.sourceType,
        rawText: '客户确认预算路径已进入最终审批。',
      });

      expect(result.success).toBe(true);
      expect(sourceUpsert).toHaveBeenCalledTimes(1);
      const row = sourceUpsert.mock.calls[0][0];
      expect(row).toMatchObject({
        source_kind: testCase.expectedSourceKind,
        source_table: testCase.expectedSourceTable,
        source_row_id: testCase.sourceId,
        metadata: expect.objectContaining({ source_type: testCase.sourceType }),
      });
      expect(getSourceRecordKindDefinition(row.source_kind).writePolicy).not.toBe('legacy_read_only');
    }
  });

  it('does not block ingest when source_records table is missing', async () => {
    const { admin, sourceUpsert, updateLogInsert } = makeAdminMocks({
      sourceRecordError: { message: `relation "public.source_records" does not exist` },
    });
    mockGetSupabaseAdmin.mockReturnValue(admin);

    const { runCILIngest } = await import('@/lib/compiled-intelligence/ingest');
    const result = await runCILIngest({
      orgId: 'org-1',
      accountId: 'acc-1',
      accountName: '华东某头部互联网平台',
      sourceId: 'meeting_001',
      sourceType: 'call_transcript',
      rawText: '会议结论：本周补齐法务材料并推进采购审批。',
    });

    expect(sourceUpsert).toHaveBeenCalledTimes(1);
    expect(updateLogInsert).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});
