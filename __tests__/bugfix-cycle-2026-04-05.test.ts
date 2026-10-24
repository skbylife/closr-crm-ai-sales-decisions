// Regression: transcription failures must not be reported as completed work.
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
