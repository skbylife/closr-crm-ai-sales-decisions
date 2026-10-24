import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/native-auth/server', () => ({ getNativeUser: mocks.user }));
vi.mock('@/lib/native-storage/server', () => ({ createFileService: () => mocks }));
import { GET, POST, DELETE } from './route';

describe('native attachment HTTP boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CLOSR_DATABASE_BACKEND', 'postgres');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    mocks.user.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects unauthenticated file reads and does not look up metadata', async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost:3000/api/native/files?bucket=task-attachments&path=anything'));
    expect(response.status).toBe(401); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('serves authenticated downloads as sandboxed, uncacheable attachments', async () => {
    mocks.download.mockResolvedValue({ bytes: new TextEncoder().encode('<svg/>'), type: 'image/svg+xml', filename: 'example.svg' });
    const response = await GET(new Request('http://localhost:3000/api/native/files?bucket=task-attachments&path=fictional'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('<svg/>');
  });
  it('rejects missing or foreign Origin before accepting a mutation', async () => {
    const response = await POST(new Request('http://localhost:3000/api/native/files', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }));
    expect(response.status).toBe(403); expect(mocks.upload).not.toHaveBeenCalled();
    const deletion = await DELETE(new Request('http://localhost:3000/api/native/files', { method: 'DELETE', body: '{}' }));
    expect(deletion.status).toBe(403); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('passes an authenticated bounded multipart upload to the scoped service', async () => {
    mocks.upload.mockResolvedValue({ id: 'object', path: 'fictional' });
    const form = new FormData(); form.set('bucket', 'task-attachments'); form.set('path', 'fictional');
    form.set('file', new File(['fixture'], 'example.txt', { type: 'text/plain' }));
    const response = await POST(new Request('http://localhost:3000/api/native/files', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form }));
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith('task-attachments', 'fictional', '11111111-1111-4111-8111-111111111111',
      { type: 'text/plain', bytes: new TextEncoder().encode('fixture') });
  });
  it('does not expose internal errors and bounds deletion JSON', async () => {
    mocks.download.mockRejectedValue(new Error('database internals must not be exposed'));
    const response = await GET(new Request('http://localhost:3000/api/native/files'));
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('database internals');
    const tooLarge = await DELETE(new Request('http://localhost:3000/api/native/files', {
      method: 'DELETE', headers: { origin: 'http://localhost:3000' }, body: ' '.repeat(17 * 1024),
    }));
    expect(tooLarge.status).toBe(413); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('is unavailable when the native backend is disabled', async () => {
    vi.stubEnv('CLOSR_DATABASE_BACKEND', 'supabase');
    expect((await GET(new Request('http://localhost:3000/api/native/files'))).status).toBe(404);
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
