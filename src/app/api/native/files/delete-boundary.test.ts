import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from './route';
import { getNativeUser } from '@/lib/native-auth/server';
import { createFileService } from '@/lib/native-storage/server';
import { StorageError } from '@/lib/native-storage/policy';
vi.mock('@/lib/native-auth/server', () => ({ getNativeUser: vi.fn() }));
vi.mock('@/lib/native-storage/server', () => ({ createFileService: vi.fn() }));
const remove = vi.fn();
const request = (body: unknown, origin = 'https://crm.example.invalid') => new Request('https://crm.example.invalid/api/native/files', { method: 'DELETE', headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('CLOSR_DATABASE_BACKEND', 'postgres'); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://crm.example.invalid');
  vi.mocked(getNativeUser).mockResolvedValue({ id: 'synthetic-user' } as Awaited<ReturnType<typeof getNativeUser>>);
  vi.mocked(createFileService).mockReturnValue({ remove } as unknown as ReturnType<typeof createFileService>);
  remove.mockResolvedValue([{ name: 'synthetic-path' }]);
});
afterEach(() => vi.unstubAllEnvs());
describe('native attachment DELETE boundary', () => {
  it('requires same origin and authentication before invoking storage', async () => {
    expect((await DELETE(request({}, 'https://other.example.invalid'))).status).toBe(403);
    vi.mocked(getNativeUser).mockResolvedValue(null);
    expect((await DELETE(request({ bucket: 'task-attachments', paths: ['synthetic-path'] }))).status).toBe(401);
    expect(remove).not.toHaveBeenCalled();
  });
  it('rejects null, arrays, invalid JSON and non-string paths without storage calls', async () => {
    for (const body of [null, [], { bucket: 'task-attachments', paths: [1] }]) expect((await DELETE(request(body))).status).toBe(400);
    expect((await DELETE(new Request('https://crm.example.invalid/api/native/files', { method: 'DELETE', headers: { origin: 'https://crm.example.invalid' }, body: '{' }))).status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
  });
  it('passes only authenticated identity, and does not convert failed removal into success', async () => {
    expect((await DELETE(request({ bucket: 'task-attachments', paths: ['synthetic-path'], userId: 'forged' }))).status).toBe(200);
    expect(remove).toHaveBeenCalledWith('task-attachments', ['synthetic-path'], 'synthetic-user');
    remove.mockRejectedValue(new StorageError(404, 'Attachment or task not found'));
    expect((await DELETE(request({ bucket: 'task-attachments', paths: ['foreign-path'] }))).status).toBe(404);
  });
  it('rejects oversized bodies before storage and disables route on other backends', async () => {
    expect((await DELETE(request({ bucket: 'task-attachments', paths: ['x'.repeat(17000)] }))).status).toBe(413);
    vi.stubEnv('CLOSR_DATABASE_BACKEND', 'supabase'); expect((await DELETE(request({}))).status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });
});
