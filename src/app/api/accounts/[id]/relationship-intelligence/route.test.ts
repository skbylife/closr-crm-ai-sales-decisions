import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
  guardResponse: (err: unknown) => {
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    const message = err instanceof Error ? err.message : 'error';
    return Response.json({ error: message }, { status });
  },
}));

type TestRow = Record<string, unknown>;
type Filter = { key: string; op: 'eq' | 'in' | 'not-null'; value?: unknown };

function matches(row: TestRow, filters: Filter[]) {
  return filters.every((filter) => {
    if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(row[filter.key]);
    if (filter.op === 'not-null') return row[filter.key] !== null && row[filter.key] !== undefined;
    return row[filter.key] === filter.value;
  });
}

function makeQuery(rows: TestRow[], filters: Filter[] = []) {
  const result = () => ({ data: rows.filter((row) => matches(row, filters)), error: null });
  const query = {
    select() { return query; },
    eq(key: string, value: unknown) { filters.push({ key, op: 'eq', value }); return query; },
    in(key: string, value: unknown[]) { filters.push({ key, op: 'in', value }); return query; },
    not(key: string) { filters.push({ key, op: 'not-null' }); return query; },
    order() { return query; },
    limit(limit: number) {
      const { data } = result();
      return Promise.resolve({ data: data.slice(0, limit), error: null });
    },
    maybeSingle() {
      const { data } = result();
      return Promise.resolve({ data: data[0] ?? null, error: null });
    },
    single() {
      const { data } = result();
      return Promise.resolve({ data: data[0] ?? null, error: null });
    },
    then(resolve: (value: { data: TestRow[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(result()).then(resolve, reject);
    },
  };
  return query;
}

function makeAdmin(overrides: Partial<Record<string, TestRow[]>> = {}) {
  const rows: Record<string, TestRow[]> = {
    accounts: [{ id: 'acc_1', org_id: 'org_1', name: 'Acme', business_team_id: 'team_1' }],
    contacts: [
      { id: 'contact_1', org_id: 'org_1', account_id: 'acc_1', name: 'Dana', email: 'example-e82f07aaf1@example.invalid', title: 'CFO', role: 'economic_buyer', department: 'Finance', last_contacted_at: null, updated_at: '2026-05-13T12:00:00.000Z' },
      { id: 'contact_2', org_id: 'org_1', account_id: 'acc_1', name: 'Lee', email: 'example-28de364cbc@example.invalid', title: 'Legal', role: 'legal', department: 'Legal', last_contacted_at: null, updated_at: '2026-05-13T12:00:00.000Z' },
      { id: 'contact_other', org_id: 'org_2', account_id: 'acc_other', name: 'Other', email: 'other@example.com', title: null, role: null, department: null, last_contacted_at: null, updated_at: null },
    ],
    org_memberships: [
      { user_id: 'user_a', org_id: 'org_1', team_id: 'team_1', role: 'manager', display_name: 'Anna' },
      { user_id: 'user_b', org_id: 'org_1', team_id: 'team_1', role: 'member', display_name: 'Ben' },
      { user_id: 'user_other', org_id: 'org_2', team_id: 'team_2', role: 'member', display_name: 'Other User' },
    ],
    contact_coverage_assignments: [
      { id: 'assign_1', org_id: 'org_1', pursuit_team_id: 'pt_1', account_id: 'acc_1', contact_id: 'contact_1', primary_user_id: 'user_a', backup_user_id: 'user_b', relationship_goal: 'Build finance trust', relationship_status: 'warming', notes: null, coverage_health: 'unknown', desired_relationship_status: 'trusted', cadence_days: 45, last_touch_at: null, next_touch_due_at: null, last_signal_id: null, confidence: 0.5, risk_reasons: [], reviewed_at: null, created_at: '2026-05-13T12:00:00.000Z', updated_at: null },
    ],
    relationship_signals: [],
    relationship_edges: [],
    email_decodes: [
      { id: 'fwd_a', org_id: 'org_1', account_id: 'acc_1', opportunity_id: null, user_id: 'user_a', email_text: 'Dana asked for ROI proof.', decode: { forwardedEmail: { fingerprint: 'fp_a' } }, date: '2026-05-12T12:00:00.000Z', created_at: '2026-05-12T12:00:00.000Z', original_sender_email: 'example-e82f07aaf1@example.invalid', original_sender_name: 'Dana', matched_contact_id: 'contact_1', matched_account_id: 'acc_1', matched_account_name: 'Acme', direction: 'inbound', signal_source: 'forwarded_email' },
      { id: 'fwd_b', org_id: 'org_1', account_id: 'acc_1', opportunity_id: null, user_id: 'user_b', email_text: 'Dana confirmed timing.', decode: { forwardedEmail: { fingerprint: 'fp_b' } }, date: '2026-05-11T12:00:00.000Z', created_at: '2026-05-11T12:00:00.000Z', original_sender_email: 'example-e82f07aaf1@example.invalid', original_sender_name: 'Dana', matched_contact_id: 'contact_1', matched_account_id: 'acc_1', matched_account_name: 'Acme', direction: 'inbound', signal_source: 'forwarded_email' },
      { id: 'fwd_other', org_id: 'org_2', account_id: 'acc_other', opportunity_id: null, user_id: 'user_other', email_text: 'Other org private mail.', decode: { forwardedEmail: { fingerprint: 'fp_o' } }, date: '2026-05-11T12:00:00.000Z', created_at: '2026-05-11T12:00:00.000Z', original_sender_email: 'other@example.com', original_sender_name: 'Other', matched_contact_id: 'contact_other', matched_account_id: 'acc_other', matched_account_name: 'Other', direction: 'inbound', signal_source: 'forwarded_email' },
    ],
    source_records: [
      { id: 'sr_a', org_id: 'org_1', account_id: 'acc_1', source_kind: 'email_decode', source_table: 'email_decodes', source_row_id: 'fwd_a', title: 'Dana ROI email', summary: 'ROI proof requested', occurred_at: '2026-05-12T12:00:00.000Z', metadata: { intake: { type: 'forwarded_email' } }, created_at: '2026-05-12T12:00:00.000Z' },
      { id: 'sr_b', org_id: 'org_1', account_id: 'acc_1', source_kind: 'email_decode', source_table: 'email_decodes', source_row_id: 'fwd_b', title: 'Dana timing email', summary: 'Timing confirmed', occurred_at: '2026-05-11T12:00:00.000Z', metadata: { intake: { type: 'forwarded_email' } }, created_at: '2026-05-11T12:00:00.000Z' },
      { id: 'sr_other', org_id: 'org_2', account_id: 'acc_other', source_kind: 'email_decode', source_table: 'email_decodes', source_row_id: 'fwd_other', title: 'Other', summary: 'Other org', occurred_at: '2026-05-11T12:00:00.000Z', metadata: { intake: { type: 'forwarded_email' } }, created_at: '2026-05-11T12:00:00.000Z' },
    ],
    integration_emails: [],
    activity_logs: [],
    meeting_preps: [],
    ...overrides,
  };

  return {
    from(table: string) {
      if (!(table in rows)) throw new Error(`unexpected table ${table}`);
      return makeQuery(rows[table]);
    },
  } as unknown as ReturnType<typeof requireAdmin>;
}

describe('GET /api/accounts/[id]/relationship-intelligence', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_a',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: 'team_1',
      teamMemberIds: ['user_b'],
    });
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin());
  });

  it('returns account-level relationship intelligence payload with graph, coverage, signals, and evidence summary', async () => {
    const response = await GET(new Request('http://localhost/api/accounts/acc_1/relationship-intelligence'), { params: Promise.resolve({ id: 'acc_1' }) });
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.accountId).toBe('acc_1');
    expect(payload.ourTeam).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'user_a' }), expect.objectContaining({ userId: 'user_b' })]));
    expect(payload.contacts).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'contact_1', name: 'Dana' })]));
    expect(payload.edges.filter((edge: { toContactId: string }) => edge.toContactId === 'contact_1')).toHaveLength(2);
    expect(new Set(payload.edges.map((edge: { fromUserId: string | null }) => edge.fromUserId))).toEqual(new Set(['user_a', 'user_b']));
    expect(payload.coverage.gaps).toEqual(expect.any(Array));
    expect(payload.nextBestMoves).toEqual(expect.any(Array));
    expect(payload.recentSignals).toHaveLength(2);
    expect(payload.evidenceSummary).toEqual(expect.objectContaining({ signalCount: 2, edgeCount: 2 }));
  });

  it('merges persisted and derived edges by semantic relationship, not database id', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      relationship_edges: [
        { id: 'edge_uuid_a', org_id: 'org_1', account_id: 'acc_1', opportunity_id: null, from_entity_type: 'user', from_user_id: 'user_a', from_contact_id: null, to_contact_id: 'contact_1', edge_type: 'communication', relationship_status: 'trusted', strength: 90, trend: 'steady', confidence: 0.9, signal_count: 0, last_signal_at: null, evidence_refs: [], computed_at: '2026-05-13T12:00:00.000Z', stale_after: null, status_flags: [], metadata: {} },
      ],
    }));

    const response = await GET(new Request('http://localhost/api/accounts/acc_1/relationship-intelligence'), { params: Promise.resolve({ id: 'acc_1' }) });
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.edges.filter((edge: { toContactId: string }) => edge.toContactId === 'contact_1')).toHaveLength(2);
    expect(payload.evidenceSummary.edgeCount).toBe(2);
  });

  it('does not count persisted edges without evidence as known relationships, while preserving explicit no-relationship edges', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      relationship_edges: [
        { id: 'edge_untrusted', org_id: 'org_1', account_id: 'acc_1', opportunity_id: null, from_entity_type: 'user', from_user_id: 'user_a', from_contact_id: null, to_contact_id: 'contact_2', edge_type: 'communication', relationship_status: 'trusted', strength: 95, trend: 'steady', confidence: 0.95, signal_count: 0, last_signal_at: null, evidence_refs: [], computed_at: '2026-05-13T12:00:00.000Z', stale_after: null, status_flags: [], metadata: {} },
        { id: 'edge_none', org_id: 'org_1', account_id: 'acc_1', opportunity_id: null, from_entity_type: 'user', from_user_id: 'user_b', from_contact_id: null, to_contact_id: 'contact_2', edge_type: 'communication', relationship_status: 'none', strength: 0, trend: 'unknown', confidence: 0, signal_count: 0, last_signal_at: null, evidence_refs: [], computed_at: '2026-05-13T12:00:00.000Z', stale_after: null, status_flags: [], metadata: {} },
      ],
    }));

    const response = await GET(new Request('http://localhost/api/accounts/acc_1/relationship-intelligence'), { params: Promise.resolve({ id: 'acc_1' }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    const untrusted = payload.edges.find((item: { id: string }) => item.id === 'edge_untrusted');
    const explicitNone = payload.edges.find((item: { id: string }) => item.id === 'edge_none');

    expect(untrusted).toEqual(expect.objectContaining({ relationshipStatus: 'unknown', strength: 0, confidence: 0 }));
    expect(untrusted.statusFlags).toContain('evidence_missing');
    expect(explicitNone).toEqual(expect.objectContaining({ relationshipStatus: 'none', strength: 0, confidence: 0 }));
    expect(explicitNone.statusFlags).not.toContain('evidence_missing');
    expect(payload.evidenceSummary.contactsWithKnownRelationship).toBe(1);
  });

  it('lets assignment explicit no-relationship override an old evidence-missing persisted edge with the same semantic key', async () => {
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin({
      contact_coverage_assignments: [
        { id: 'assign_none', org_id: 'org_1', pursuit_team_id: 'pt_1', account_id: 'acc_1', contact_id: 'contact_2', primary_user_id: 'user_a', backup_user_id: null, relationship_goal: '确认是否需要法务关系覆盖', relationship_status: 'none', notes: null, coverage_health: 'gap', desired_relationship_status: 'engaged', cadence_days: 45, last_touch_at: null, next_touch_due_at: null, last_signal_id: null, confidence: 0.5, risk_reasons: [], reviewed_at: null, created_at: '2026-05-13T12:00:00.000Z', updated_at: null },
      ],
      relationship_edges: [
        { id: 'edge_old_untrusted', org_id: 'org_1', account_id: 'acc_1', opportunity_id: null, from_entity_type: 'user', from_user_id: 'user_a', from_contact_id: null, to_contact_id: 'contact_2', edge_type: 'communication', relationship_status: 'trusted', strength: 95, trend: 'steady', confidence: 0.95, signal_count: 0, last_signal_at: null, evidence_refs: [], computed_at: '2026-05-13T12:00:00.000Z', stale_after: null, status_flags: [], metadata: {} },
      ],
      email_decodes: [],
      source_records: [],
    }));

    const response = await GET(new Request('http://localhost/api/accounts/acc_1/relationship-intelligence'), { params: Promise.resolve({ id: 'acc_1' }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    const edge = payload.edges.find((item: { toContactId: string; fromUserId: string | null }) => item.toContactId === 'contact_2' && item.fromUserId === 'user_a');

    expect(edge).toEqual(expect.objectContaining({ relationshipStatus: 'none', strength: 0 }));
    expect(edge.statusFlags).not.toContain('evidence_missing');
  });

  it('does not cross org boundaries when loading an account', async () => {
    const response = await GET(new Request('http://localhost/api/accounts/acc_other/relationship-intelligence'), { params: Promise.resolve({ id: 'acc_other' }) });
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe('客户不存在');
  });
});
