import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  guardResponse: (err: unknown) => {
    const message = err instanceof Error ? err.message : 'error';
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    return Response.json({ error: message }, { status });
  },
}));

vi.mock('@/lib/db', () => ({
  dbLogActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/error-monitor', () => ({
  safeCatch: () => () => undefined,
}));

type Row = Record<string, unknown>;

function postRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/import-governance/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeAdmin(params?: { missingTables?: boolean; jobs?: Row[] }) {
  const writes: Record<string, Row[]> = {
    import_jobs: [],
    field_mappings: [],
    import_rows: [],
    duplicate_candidates: [],
    merge_decisions: [],
    data_quality_findings: [],
  };
  const jobs = params?.jobs ?? [];

  const admin = {
    writes,
    from(table: string) {
      const query = {
        insert(payload: Row | Row[]) {
          if (params?.missingTables) {
            const error = { code: 'PGRST205', message: 'Could not find the table public.' + table };
            return {
              select() { return this; },
              async single() { return { data: null, error }; },
              error,
            };
          }

          const rows = Array.isArray(payload) ? payload : [payload];
          writes[table] = writes[table] ?? [];
          writes[table].push(...rows);

          if (table === 'import_jobs') {
            const inserted = { id: 'job_1', ...rows[0] };
            return {
              select() { return this; },
              async single() { return { data: inserted, error: null }; },
              error: null,
            };
          }

          return { error: null };
        },
        select() { return query; },
        eq() { return query; },
        order() { return query; },
        limit() { return query; },
        then(resolve: (value: { data: Row[] | null; error: Row | null }) => void) {
          if (params?.missingTables) {
            resolve({ data: null, error: { code: 'PGRST205', message: 'Could not find import_jobs' } });
            return;
          }
          resolve({ data: jobs, error: null });
        },
      };
      return query;
    },
  };

  return admin as unknown as ReturnType<typeof requireAdmin> & { writes: Record<string, Row[]> };
}

describe('/api/import-governance/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    } as Awaited<ReturnType<typeof requireAuth>>);
  });

  it('persists import governance jobs, rows, duplicates, decisions, and findings', async () => {
    const admin = makeAdmin();
    vi.mocked(requireAdmin).mockReturnValue(admin);

    const res = await POST(postRequest({
      objectType: 'accounts',
      sourceFilename: 'accounts.csv',
      status: 'published',
      rowCount: 2,
      counts: { create: 1, update: 0, skip: 0, conflict: 1 },
      mapping: { name: 'Company', website: 'Website' },
      decisions: { 1: 'create' },
      rows: [
        { rowIndex: 0, sourceValues: { Company: 'NewCo' }, mappedValues: { name: 'NewCo' }, plannedAction: 'create' },
        { rowIndex: 1, sourceValues: { Company: 'Northstar' }, mappedValues: { name: 'Northstar' }, plannedAction: 'create' },
      ],
      duplicates: [
        {
          rowIndex: 1,
          importedName: 'Northstar',
          existingId: 'acc_1',
          existingName: 'Northstar Foods',
          matchType: 'name',
          confidence: 'medium',
          recommendation: 'review',
        },
      ],
      findings: [
        { rowIndex: 1, field: 'website', label: '网站格式异常', detail: 'bad', severity: 'low' },
      ],
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, jobId: 'job_1' });
    expect(admin.writes.import_jobs[0]).toMatchObject({
      org_id: 'org_1',
      user_id: 'user_1',
      object_type: 'accounts',
      status: 'published',
      row_count: 2,
      create_count: 1,
      conflict_count: 1,
      finding_count: 1,
    });
    expect(admin.writes.import_rows).toHaveLength(2);
    expect(admin.writes.duplicate_candidates[0]).toMatchObject({
      existing_entity_type: 'account',
      existing_entity_id: 'acc_1',
      match_type: 'name',
    });
    expect(admin.writes.merge_decisions[0]).toMatchObject({
      import_row_index: 1,
      decision: 'keep_both',
      decided_by: 'user_1',
    });
    expect(admin.writes.data_quality_findings[0]).toMatchObject({
      field: 'website',
      severity: 'low',
    });
  });

  it('returns recent import jobs for the current org', async () => {
    const admin = makeAdmin({
      jobs: [
        {
          id: 'job_1',
          object_type: 'contacts',
          source_filename: 'contacts.csv',
          status: 'previewed',
          row_count: 3,
          create_count: 2,
          conflict_count: 1,
          skip_count: 0,
          finding_count: 1,
          created_at: '2026-06-09T12:00:00.000Z',
          published_at: null,
        },
      ],
    });
    vi.mocked(requireAdmin).mockReturnValue(admin);

    const res = await GET(new Request('http://localhost/api/import-governance/jobs?limit=5'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      jobs: [
        {
          id: 'job_1',
          objectType: 'contacts',
          sourceFilename: 'contacts.csv',
          status: 'previewed',
          rowCount: 3,
          createCount: 2,
          conflictCount: 1,
          skipCount: 0,
          findingCount: 1,
          createdAt: '2026-06-09T12:00:00.000Z',
          publishedAt: null,
        },
      ],
    });
  });

  it('degrades gracefully when import governance tables are not applied', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({ missingTables: true }));

    const res = await POST(postRequest({
      objectType: 'contacts',
      rowCount: 0,
      counts: { create: 0, update: 0, skip: 0, conflict: 0 },
      mapping: {},
      rows: [],
    }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ skipped: true, reason: 'import_governance_tables_missing' });
  });
});
