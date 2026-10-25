import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { query, withTransaction } from '@/lib/postgres';
import {
  ATTACHMENT_BUCKET, StorageError, parseAttachmentPath, validateAttachment,
  hasDirectTaskAccess, type TaskAccessRow,
} from './policy';

type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type Transaction = <T>(fn: (query: Query) => Promise<T>) => Promise<T>;
interface StoredObject {
  id: string; org_id: string; task_id: string; owner_id: string; logical_path: string;
  disk_name: string; filename: string; mime_type: string; byte_size: number;
  deleted_at: string | null;
}

export function createFileService(options: { root?: string; query?: Query; transaction?: Transaction } = {}) {
  const db = options.query ?? query;
  const transaction: Transaction = options.transaction ?? (options.query ? async fn => fn(db) : withTransaction);
  const root = resolve(options.root ?? process.env.CLOSR_STORAGE_DIR ?? './.local/uploads');

  async function authorizeTask(taskId: string, userId: string): Promise<TaskAccessRow> {
    // Membership is read on every operation: revoking it revokes attachment access immediately.
    const [row] = await db<TaskAccessRow>(`
      SELECT t.id, t.org_id, t.user_id, t.assigned_to, m.role, m.job_level, m.team_id
      FROM public.tasks t JOIN public.org_memberships m ON m.org_id = t.org_id
      WHERE t.id = $1 AND m.user_id = $2::uuid LIMIT 1`, [taskId, userId]);
    if (!row) throw new StorageError(404, 'Attachment or task not found');
    if (hasDirectTaskAccess(row, userId)) return row;
    if (Number(row.job_level ?? 0) >= 1 && row.team_id && row.user_id) {
      const members = await db(`SELECT 1 FROM public.org_memberships
        WHERE org_id = $1::uuid AND user_id = $2::uuid AND team_id = $3::uuid LIMIT 1`,
      [row.org_id, row.user_id, row.team_id]);
      if (members.length) return row;
    }
    throw new StorageError(404, 'Attachment or task not found');
  }

  async function storedObject(bucket: string, path: string, userId: string, includeDeleted = false) {
    const parsed = parseAttachmentPath(bucket, path);
    const task = await authorizeTask(parsed.taskId, userId);
    const [record] = await db<StoredObject>(`SELECT * FROM public.native_file_objects
      WHERE bucket = $1 AND logical_path = $2 AND org_id = $3::uuid AND task_id = $4
      ${includeDeleted ? '' : 'AND deleted_at IS NULL'} LIMIT 1`, [bucket, path, task.org_id, task.id]);
    if (!record) throw new StorageError(404, 'Attachment or task not found');
    // Metadata is server-owned, but validate before using it as a physical pathname too.
    if (!/^[0-9a-f-]{36}\.bin$/.test(record.disk_name)) throw new StorageError(500, 'Invalid attachment metadata');
    return record;
  }

  return {
    async upload(bucket: string, path: string, userId: string, file: { type: string; bytes: Uint8Array }) {
      const parsed = parseAttachmentPath(bucket, path);
      if (parsed.ownerId !== userId) throw new StorageError(403, 'Upload path must belong to the signed-in user');
      validateAttachment(file.type, file.bytes.byteLength);
      const task = await authorizeTask(parsed.taskId, userId);
      const id = randomUUID();
      const diskName = `${id}.bin`;
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(join(root, diskName), file.bytes, { flag: 'wx', mode: 0o600 });
      try {
        await db(`INSERT INTO public.native_file_objects
          (id, bucket, logical_path, org_id, task_id, owner_id, disk_name, filename, mime_type, byte_size)
          VALUES ($1::uuid,$2,$3,$4::uuid,$5,$6::uuid,$7,$8,$9,$10)`,
        [id, ATTACHMENT_BUCKET, path, task.org_id, task.id, userId, diskName, parsed.filename, file.type, file.bytes.byteLength]);
      } catch (error) {
        await unlink(join(root, diskName)).catch(() => undefined);
        if ((error as { code?: string }).code === '23505') throw new StorageError(409, 'Attachment already exists');
        throw error;
      }
      return { id, path };
    },
    async download(bucket: string, path: string, userId: string) {
      const record = await storedObject(bucket, path, userId);
      try {
        const bytes = await readFile(join(root, record.disk_name));
        return { bytes, filename: record.filename, type: record.mime_type };
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') throw new StorageError(404, 'Attachment not found');
        throw error;
      }
    },
    async remove(bucket: string, paths: string[], userId: string) {
      if (paths.length < 1 || paths.length > 20) throw new StorageError(400, 'Choose 1 to 20 attachments');
      // Authorize the complete batch before changing anything.
      const records = await Promise.all(paths.map(path => storedObject(bucket, path, userId, true)));
      for (const record of records) {
        // Persist intent before touching bytes. A failed audit write blocks removal.
        await db(`INSERT INTO public.audit_log(org_id,user_id,action,object_type,record_id,changes)
          VALUES($1::uuid,$2::uuid,'attachment_delete_started','attachment',$3,$4::jsonb)`,
          [record.org_id, userId, record.id, JSON.stringify({ task_id: record.task_id, byte_size: record.byte_size })]);
        await db('UPDATE public.native_file_objects SET deleted_at = now() WHERE id = $1::uuid AND org_id = $2::uuid', [record.id, record.org_id]);
        try { await unlink(join(root, record.disk_name)); }
        catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
        // Keep the tombstone if finalization fails: retries can still locate it.
        // Bytes are already gone; this transaction is not a filesystem rollback.
        await transaction(async tx => {
          await tx(`INSERT INTO public.audit_log(org_id,user_id,action,object_type,record_id,changes)
            VALUES($1::uuid,$2::uuid,'attachment_delete_completed','attachment',$3,'{}'::jsonb)`, [record.org_id, userId, record.id]);
          await tx('DELETE FROM public.native_file_objects WHERE id = $1::uuid AND org_id = $2::uuid', [record.id, record.org_id]);
        });
      }
      return records.map(record => ({ name: record.logical_path }));
    },
  };
}
