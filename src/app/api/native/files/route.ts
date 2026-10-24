import { getNativeUser } from '@/lib/native-auth/server';
import { assertSameOrigin } from '@/lib/native-auth/security';
import { createFileService } from '@/lib/native-storage/server';
import { StorageError } from '@/lib/native-storage/policy';
import { boundedUploadForm, readBoundedBody } from '@/lib/native-storage/request';

export const runtime = 'nodejs';

function unavailable() {
  return process.env.CLOSR_DATABASE_BACKEND !== 'postgres';
}

function failure(error: unknown) {
  const status = error instanceof StorageError ? error.status : (error as { status?: number })?.status;
  if (status && status >= 400 && status < 500) {
    return Response.json({ error: error instanceof Error ? error.message : 'Request rejected' }, { status });
  }
  console.error('[native-storage] operation failed');
  return Response.json({ error: 'Attachment operation failed' }, { status: 500 });
}

async function identity(request: Request) {
  const user = await getNativeUser(request);
  if (!user) throw new StorageError(401, 'Sign in to access attachments');
  return user.id;
}

export async function POST(request: Request) {
  if (unavailable()) return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request);
    const userId = await identity(request);
    const form = await boundedUploadForm(request);
    const bucket = form.get('bucket');
    const path = form.get('path');
    const file = form.get('file');
    if (typeof bucket !== 'string' || typeof path !== 'string' || !(file instanceof File)) {
      throw new StorageError(400, 'Missing attachment fields');
    }
    const data = await createFileService().upload(bucket, path, userId,
      { type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return Response.json({ data, error: null }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  if (unavailable()) return new Response(null, { status: 404 });
  try {
    const userId = await identity(request);
    const params = new URL(request.url).searchParams;
    const file = await createFileService().download(params.get('bucket') ?? '', params.get('path') ?? '', userId);
    // Even SVGs are downloads, never executable same-origin documents.
    return new Response(new Uint8Array(file.bytes), { headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    } });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  if (unavailable()) return new Response(null, { status: 404 });
  try {
    assertSameOrigin(request);
    const userId = await identity(request);
    const text = new TextDecoder().decode(await readBoundedBody(request, 16 * 1024));
    let body: { bucket?: unknown; paths?: unknown };
    try { body = JSON.parse(text); } catch { throw new StorageError(400, 'Invalid JSON'); }
    if (typeof body.bucket !== 'string' || !Array.isArray(body.paths) || !body.paths.every(p => typeof p === 'string')) {
      throw new StorageError(400, 'Invalid attachment selection');
    }
    const data = await createFileService().remove(body.bucket, body.paths, userId);
    return Response.json({ data, error: null });
  } catch (error) { return failure(error); }
}
