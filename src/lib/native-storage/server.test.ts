import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('@/lib/postgres', () => ({ query: vi.fn() }));
import { createFileService } from './server';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const orgId = '33333333-3333-4333-8333-333333333333';
const logicalPath = `${userId}/task_1/123_notes.txt`;
type Row = Record<string, unknown>;

describe('native attachment service', () => {
  let root: string;
  let records: Row[];
  let failInsert: boolean;
  async function query<T>(sql: string, args: unknown[] = []): Promise<T[]> {
    if (sql.includes('FROM public.tasks')) {
      const [taskId, caller] = args;
      return (caller === userId && taskId === 'task_1' ? [{ id: 'task_1', org_id: orgId, user_id: userId, assigned_to: null, role: 'member', job_level: 0, team_id: null }] : []) as T[];
    }
    if (sql.includes('INSERT INTO')) {
      if (failInsert) throw new Error('database unavailable');
      const [id, bucket, path, org, task, owner, disk, filename, type, size] = args;
      if (records.some(r => r.logical_path === path)) throw Object.assign(new Error('duplicate'), { code: '23505' });
      records.push({ id, bucket, logical_path: path, org_id: org, task_id: task, owner_id: owner, disk_name: disk, filename, mime_type: type, byte_size: size, deleted_at: null });
      return [];
    }
    if (sql.includes('SELECT *')) {
      return records.filter(r => r.bucket === args[0] && r.logical_path === args[1] && r.org_id === args[2] && r.task_id === args[3]
        && (!sql.includes('deleted_at IS NULL') || r.deleted_at === null)) as T[];
    }
    if (sql.includes('UPDATE public.native_file_objects')) records.filter(r => r.id === args[0]).forEach(r => { r.deleted_at = new Date().toISOString(); });
    if (sql.includes('DELETE FROM')) records = records.filter(r => r.id !== args[0]);
    return [];
  }
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'closr-storage-test-')); records = []; failInsert = false; });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  const file = () => ({ type: 'text/plain', bytes: new TextEncoder().encode('Fictional attachment') });

  it('writes with opaque names and restrictive permissions, then reads and deletes', async () => {
    const service = createFileService({ root, query });
    await service.upload('task-attachments', logicalPath, userId, file());
    const names = await readdir(root);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^[0-9a-f-]{36}\.bin$/);
    expect((await stat(join(root, names[0]))).mode & 0o777).toBe(0o600);
    const downloaded = await service.download('task-attachments', logicalPath, userId);
    expect(downloaded.bytes.toString()).toBe('Fictional attachment');
    await service.remove('task-attachments', [logicalPath], userId);
    expect(await readdir(root)).toEqual([]);
    expect(records).toEqual([]);
  });
  it('rejects cross-tenant reads, deletes and forged upload owners', async () => {
    const service = createFileService({ root, query });
    await service.upload('task-attachments', logicalPath, userId, file());
    await expect(service.download('task-attachments', logicalPath, otherUserId)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove('task-attachments', [logicalPath], otherUserId)).rejects.toMatchObject({ status: 404 });
    await expect(service.upload('task-attachments', logicalPath, otherUserId, file())).rejects.toMatchObject({ status: 403 });
    expect(await readdir(root)).toHaveLength(1);
    expect(records).toHaveLength(1);
  });
  it('cleans up filesystem writes when metadata insertion fails or conflicts', async () => {
    const service = createFileService({ root, query });
    failInsert = true;
    await expect(service.upload('task-attachments', logicalPath, userId, file())).rejects.toThrow('database unavailable');
    expect(await readdir(root)).toEqual([]);
    failInsert = false;
    await service.upload('task-attachments', logicalPath, userId, file());
    await expect(service.upload('task-attachments', logicalPath, userId, file())).rejects.toMatchObject({ status: 409 });
    expect(await readdir(root)).toHaveLength(1);
  });
  it('authorizes every requested delete before removing any file', async () => {
    const service = createFileService({ root, query });
    await service.upload('task-attachments', logicalPath, userId, file());
    await expect(service.remove('task-attachments', [logicalPath, `${userId}/task_other/notes.txt`], userId)).rejects.toMatchObject({ status: 404 });
    expect(await readdir(root)).toHaveLength(1);
    expect(records).toHaveLength(1);
  });
});
