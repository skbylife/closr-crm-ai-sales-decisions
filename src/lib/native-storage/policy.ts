export const ATTACHMENT_BUCKET = 'task-attachments';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
]);

export class StorageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Logical paths are never used as filesystem paths. Do not normalize traversal away. */
export function parseAttachmentPath(bucket: string, logicalPath: string) {
  if (bucket !== ATTACHMENT_BUCKET || logicalPath.length > 512 || /[\\%\u0000-\u001f]/u.test(logicalPath)) {
    throw new StorageError(400, 'Invalid attachment path');
  }
  const parts = logicalPath.split('/');
  if (parts.length !== 3 || parts.some(p => !p || p === '.' || p === '..')) {
    throw new StorageError(400, 'Invalid attachment path');
  }
  const [ownerId, taskId, filename] = parts;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(taskId)
    || !/^[\p{L}\p{N}._-]{1,255}$/u.test(filename)) {
    throw new StorageError(400, 'Invalid attachment path');
  }
  return { ownerId, taskId, filename };
}

export function validateAttachment(type: string, size: number) {
  if (!ALLOWED_ATTACHMENT_TYPES.has(type)) throw new StorageError(415, 'Unsupported attachment type');
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ATTACHMENT_BYTES) {
    throw new StorageError(413, 'Attachment exceeds the 10 MB limit');
  }
}

export interface TaskAccessRow {
  id: string;
  org_id: string;
  user_id: string | null;
  assigned_to: string | null;
  role: string;
  job_level: number | null;
  team_id: string | null;
}

export function hasDirectTaskAccess(row: TaskAccessRow, userId: string) {
  return row.role === 'owner' || row.role === 'admin' || Number(row.job_level ?? 0) >= 2
    || row.user_id === userId || row.assigned_to === userId;
}
