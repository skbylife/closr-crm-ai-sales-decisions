import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  lookup: vi.fn(),
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
}));

vi.mock('child_process', () => ({ execFile: mocks.execFile }));
vi.mock('dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('@/lib/api-guard', () => ({
  requireAuth: mocks.requireAuth,
  requireAdmin: mocks.requireAdmin,
  requireAccountAccess: mocks.requireAccountAccess,
  guardResponse: (err: unknown) => Response.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 }),
}));

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/company-intel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/company-intel public web smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'owner',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(requireAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'source_records') return { upsert };
        if (table === 'knowledge_base') return { insert };
        return {};
      }),
    } as unknown as ReturnType<typeof requireAdmin>);
  });

  it('accepts a public URL and writes account-scoped public web evidence', async () => {
    mocks.execFile.mockImplementation((_cmd: unknown, _args: unknown, _options: unknown, callback: unknown) => {
      const done = callback as (error: Error | null, stdout: string, stderr: string) => void;
      done(
        null,
        JSON.stringify({
          company_name: 'Example Corp',
          timestamp: '2026-05-16T07:00:00.000Z',
          website: {
            url: 'https://example.com/',
            title: 'Example Corp',
            description: '公开官网介绍。',
            scraped_at: '2026-05-16T07:01:00.000Z',
          },
          public_pages: [
            {
              url: 'https://example.com/leadership',
              title: 'Leadership',
              summary: '公开领导团队页面。',
              page_type: 'leadership',
              scraped_at: '2026-05-16T07:02:00.000Z',
            },
          ],
          news: [],
          social_signals: {},
        }),
        '',
      );
      return { kill: vi.fn() };
    });

    const response = await POST(request({
      companyName: 'Example Corp',
      websiteUrl: 'https://example.com/',
      accountId: 'acc_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(vi.mocked(requireAccountAccess)).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(payload.evidence).toEqual({ written: 2, skipped: 0 });

    const admin = vi.mocked(requireAdmin).mock.results[0]?.value as { from: ReturnType<typeof vi.fn> };
    const sourceRecordsTable = admin.from.mock.results.find((result) => result.value?.upsert)?.value;
    expect(sourceRecordsTable.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          org_id: 'org_1',
          account_id: 'acc_1',
          source_kind: 'public_web',
          metadata: expect.objectContaining({ should_auto_writeback: false, visibility: 'public' }),
        }),
      ]),
      { onConflict: 'org_id,source_kind,source_row_id' },
    );
  });

  it('rejects unsafe URLs before running the scraper', async () => {
    const response = await POST(request({
      companyName: 'Example Corp',
      websiteUrl: 'http://127.0.0.1:54321/admin',
      accountId: 'acc_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('不允许访问该地址');
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(vi.mocked(requireAccountAccess)).not.toHaveBeenCalled();
  });

  it('rejects IPv4-mapped IPv6 local URLs before running the scraper', async () => {
    const response = await POST(request({
      companyName: 'Example Corp',
      websiteUrl: 'http://[::ffff:7f00:1]/admin',
      accountId: 'acc_1',
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('不允许访问该地址');
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(vi.mocked(requireAccountAccess)).not.toHaveBeenCalled();
  });
});
