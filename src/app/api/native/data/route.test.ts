import { beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ user: vi.fn(), origin: vi.fn(), query: vi.fn() }));
const limiter = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/lib/native-auth/server', () => ({ getNativeUser: auth.user, assertSameOrigin: auth.origin }));
vi.mock('@/lib/native-db/executor', () => ({ executeNativeQuery: auth.query }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: limiter.check, rateLimitHeaders: () => ({}) }));
import { POST } from './route';
import { NativeAuthError } from '@/lib/native-auth/security';
const query = { table: 'accounts', action: 'select', filters: [], orders: [] };
const request = (body: unknown) => new Request('http://localhost/api/native/data', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify(body) });
describe('native browser database boundary', () => {
 beforeEach(() => { vi.clearAllMocks(); process.env.CLOSR_DATABASE_BACKEND = 'postgres'; auth.user.mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' }); auth.origin.mockImplementation(() => {}); auth.query.mockResolvedValue({ data: [], error: null, status: 200 }); limiter.check.mockReturnValue({ limited: false, retryAfter: 1 }); });
 it('does not expose the adapter when the native backend is disabled', async () => { process.env.CLOSR_DATABASE_BACKEND = 'supabase'; delete process.env.NEXT_PUBLIC_CLOSR_DATABASE_BACKEND; expect((await POST(request(query))).status).toBe(404); expect(auth.query).not.toHaveBeenCalled(); });
 it('requires an authenticated session', async () => { auth.user.mockResolvedValue(null); expect((await POST(request(query))).status).toBe(401); expect(auth.query).not.toHaveBeenCalled(); });
 it('rejects cross-origin requests before querying', async () => { auth.origin.mockImplementation(() => { throw new NativeAuthError(403, 'Same-origin request required', 'csrf'); }); expect((await POST(request(query))).status).toBe(403); expect(auth.query).not.toHaveBeenCalled(); });
 it('derives identity and role from the session, never browser options', async () => { const body = { ...query, admin: true, userId: '00000000-0000-0000-0000-000000000002' }; expect((await POST(request(body))).status).toBe(200); expect(auth.query).toHaveBeenCalledWith(body, { userId: '00000000-0000-0000-0000-000000000001' }); });
 it('cancels an oversized stream even without Content-Length', async () => { let cancelled = false; const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2_000_001)); }, cancel() { cancelled = true; } }); const incoming = new Request('http://localhost/api/native/data', { method: 'POST', body, duplex: 'half' } as RequestInit); expect((await POST(incoming)).status).toBe(413); expect(cancelled).toBe(true); expect(auth.query).not.toHaveBeenCalled(); });
 it('uses the read quota for real selects and ignores client tier hints on writes', async () => {
  await POST(request(query)); expect(limiter.check).toHaveBeenLastCalledWith('native-data:read:00000000-0000-0000-0000-000000000001', 'read');
  await POST(request({ ...query, action: 'update', tier: 'read', values: { name: 'Fictional' } }));
  expect(limiter.check).toHaveBeenLastCalledWith('native-data:default:00000000-0000-0000-0000-000000000001', 'default');
  await POST(request({ ...query, action: 'rpc', tier: 'read' })); expect(limiter.check).toHaveBeenLastCalledWith(expect.any(String), 'default');
 });
 it('rejects a limited write before invoking the database executor', async () => {
  limiter.check.mockReturnValue({ limited: true, retryAfter: 7 });
  const response = await POST(request({ ...query, action: 'delete' }));
  expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('7'); expect(auth.query).not.toHaveBeenCalled();
 });
});
