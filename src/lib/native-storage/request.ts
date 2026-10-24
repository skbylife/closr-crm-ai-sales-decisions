import { MAX_ATTACHMENT_BYTES, StorageError } from './policy';

/** Limit streamed input before buffering it, including bodies without Content-Length. */
export async function readBoundedBody(request: Request, max: number) {
  const length = request.headers.get('content-length');
  if (length && Number(length) > max) throw new StorageError(413, 'Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new StorageError(400, 'Missing request body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new StorageError(413, 'Request too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function boundedUploadForm(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data;')) throw new StorageError(415, 'Use multipart form data');
  const bytes = await readBoundedBody(request, MAX_ATTACHMENT_BYTES + 64 * 1024);
  try { return await new Response(bytes, { headers: { 'content-type': contentType } }).formData(); }
  catch { throw new StorageError(400, 'Invalid multipart body'); }
}
