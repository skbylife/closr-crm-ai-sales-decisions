'use client';

function objectUrl(bucket: string, path: string) {
  return `/api/native/files?${new URLSearchParams({ bucket, path })}`;
}

async function result(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { data: null, error: { message: typeof body.error === 'string' ? body.error : 'Attachment request failed' } };
  return { data: body.data, error: null };
}

export function createNativeStorageClient() {
  return {
    from(bucket: string) {
      return {
        async upload(path: string, file: File, options?: { upsert?: boolean }) {
          if (options?.upsert) return { data: null, error: { message: 'Attachment overwrite is not supported; upload a new filename' } };
          const form = new FormData();
          form.set('bucket', bucket); form.set('path', path); form.set('file', file);
          try { return await result(await fetch('/api/native/files', { method: 'POST', body: form, credentials: 'same-origin' })); }
          catch { return { data: null, error: { message: 'Attachment upload failed' } }; }
        },
        // Compatibility name only: this URL always checks the signed-in user's task access.
        getPublicUrl(path: string) { return { data: { publicUrl: objectUrl(bucket, path) } }; },
        async remove(paths: string[]) {
          try { return await result(await fetch('/api/native/files', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ bucket, paths }),
          })); }
          catch { return { data: null, error: { message: 'Attachment deletion failed' } }; }
        },
      };
    },
  };
}
