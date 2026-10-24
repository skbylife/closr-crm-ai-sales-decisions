/**
 * Regression tests for bugfix cycle 2026-04-05
 * 1. demo-login backend bypass
 * 2. public distribution excludes bundled demo seeding
 * 3. transcribe false-done on decode failure
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Bug #1: demo-login requires access password ────────────────────

const { mockSignIn } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { signInWithPassword: mockSignIn },
  }),
}));

describe('POST /api/demo-login — access password enforcement', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSignIn.mockReset();
    vi.stubEnv('DEMO_ACCESS_PASSWORD', 'test-access-pw');
    vi.stubEnv('DEMO_PASSWORD', 'test-demo-pw');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-key');
  });

  async function importRoute() {
    return await import('@/app/api/demo-login/route');
  }

  it('rejects requests without accessPassword', async () => {
    const { POST } = await importRoute();
    const req = new Request('http://localhost/api/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('未授权');
  });

  it('rejects requests with wrong accessPassword', async () => {
    const { POST } = await importRoute();
    const req = new Request('http://localhost/api/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessPassword: 'EXAMPLE_ONLY_6786324D71' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('accepts correct accessPassword and proceeds to login', async () => {
    // The route signs in via a direct fetch to the Supabase token endpoint,
    // so the success path is mocked at the fetch level (not supabase-js).
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      Response.json({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        user: { id: 'uid', email: 'example-c39293aa15@example.invalid' },
      }),
    );

    try {
      const { POST } = await importRoute();
      const req = new Request('http://localhost/api/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessPassword: 'test-access-pw' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toBe('at');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects when DEMO_ACCESS_PASSWORD is not configured', async () => {
    vi.stubEnv('DEMO_ACCESS_PASSWORD', '');
    const { POST } = await importRoute();
    const req = new Request('http://localhost/api/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessPassword: 'EXAMPLE_ONLY_EE0874170B' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

// ─── Public source distribution: bundled demo seeding is disabled ──

describe('POST /api/seed-data — excluded demo records', () => {
  it('returns Gone instead of importing bundled customer-like case data', async () => {
    const { POST } = await import('@/app/api/seed-data/route');
    const response = await POST();
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error).toContain('not included');
    expect(Object.keys(body)).toEqual(['error']);
  });

  it('does not authenticate a demo account or acquire a database administrator', async () => {
    mockSignIn.mockClear();
    mockRequireAdmin.mockClear();
    mockRequireAuth.mockClear();
    const { POST } = await import('@/app/api/seed-data/route');
    await POST();
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });
});

// ─── Bug #3: transcribe sets error status on decode failure ──────────

const { mockRequireAuth, mockRequireAdmin, mockGuardResponse } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockGuardResponse: vi.fn((err: unknown) =>
    Response.json({ error: String(err) }, { status: 500 }),
  ),
}));

vi.mock('@/lib/api-guard', () => ({
  requireAuth: () => mockRequireAuth(),
  requireAdmin: () => mockRequireAdmin(),
  guardResponse: (err: unknown) => mockGuardResponse(err),
}));

vi.mock('@/lib/compiled-intelligence/ingest', () => ({
  runCILIngest: vi.fn().mockResolvedValue(undefined),
}));

describe('POST /api/meeting-recording/transcribe — decode failure handling', () => {
  let capturedUpdates: Array<Record<string, unknown>> = [];

  function makeSupabase(recording: Record<string, unknown>) {
    return {
      from(table: string) {
        if (table === 'meeting_recordings') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: recording, error: null }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => {
              capturedUpdates.push(payload);
              return {
                eq: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [] }),
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    };
  }

  beforeEach(() => {
    capturedUpdates = [];
    vi.resetModules();
    vi.stubEnv('AI_BASE_URL', 'https://dashscope.test/compatible-mode/v1');
    vi.stubEnv('AI_API_KEY', 'test-key');
    mockRequireAuth.mockReset();
    mockRequireAdmin.mockReset();
    mockGuardResponse.mockReset();
    mockGuardResponse.mockImplementation((err: unknown) =>
      Response.json({ error: String(err) }, { status: 500 }),
    );
    mockRequireAuth.mockResolvedValue({ userId: 'u1', orgId: 'org1' });
  });

  it('sets status to error when AI decode returns null', async () => {
    const recording = {
      id: 'rec-1',
      title: 'Test meeting',
      org_id: 'org1',
      audio_url: 'https://example.com/audio.wav',
      context: null,
      duration_seconds: 60,
      attendee_contact_ids: null,
      account_id: null,
      created_at: '2026-04-05T00:00:00Z',
    };
    mockRequireAdmin.mockReturnValue(makeSupabase(recording));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('dashscope')) {
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
          text: async () => '',
        };
      }
      return originalFetch(url);
    });

    try {
      const { POST } = await import(
        '@/app/api/meeting-recording/transcribe/route'
      );
      const req = new Request('http://localhost/api/meeting-recording/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: 'rec-1' }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.status).toBe('error');

      const finalUpdate = capturedUpdates[capturedUpdates.length - 1];
      expect(finalUpdate.status).toBe('error');
      expect(finalUpdate.error_message).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sets status to done when AI decode succeeds', async () => {
    const recording = {
      id: 'rec-2',
      title: 'Good meeting',
      org_id: 'org1',
      audio_url: 'https://example.com/audio.wav',
      context: null,
      duration_seconds: 60,
      attendee_contact_ids: null,
      account_id: null,
      created_at: '2026-04-05T00:00:00Z',
    };
    mockRequireAdmin.mockReturnValue(makeSupabase(recording));

    const validDecode = {
      meetingSummary: '测试会议摘要',
      keyDecisions: ['决策1'],
      actionItems: [],
      salesSignals: {
        sentimentTrend: 'stable',
        riskLevel: 'low',
        buyerState: 'engaged',
        keySignal: '测试信号',
      },
      nextSteps: [],
      concerns: [],
      opportunities: [],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('dashscope')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify(validDecode) } }],
          }),
          text: async () => '',
        };
      }
      return originalFetch(url);
    });

    try {
      const { POST } = await import(
        '@/app/api/meeting-recording/transcribe/route'
      );
      const req = new Request('http://localhost/api/meeting-recording/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingId: 'rec-2' }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(body.status).toBe('done');
      expect(body.decodeResult).toBeTruthy();

      const finalUpdate = capturedUpdates[capturedUpdates.length - 1];
      expect(finalUpdate.status).toBe('done');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
