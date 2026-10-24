import { describe, expect, it, vi } from 'vitest';
import { boundedUploadForm, readBoundedBody } from './request';

describe('attachment request limits', () => {
  it('cancels a chunked request as soon as its byte limit is exceeded', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(16)); },
      cancel,
    });
    const request = new Request('http://localhost/api/native/files', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(readBoundedBody(request, 20)).rejects.toMatchObject({ status: 413 });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('rejects oversized declared bodies without consuming them', async () => {
    const request = new Request('http://localhost/api/native/files', { method: 'DELETE', headers: { 'Content-Length': '100' }, body: '{}' });
    await expect(readBoundedBody(request, 20)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });
  it('parses one bounded multipart upload and rejects other formats', async () => {
    const data = new FormData(); data.set('file', new File(['fictional'], 'example.txt', { type: 'text/plain' }));
    const parsed = await boundedUploadForm(new Request('http://localhost/api/native/files', { method: 'POST', body: data }));
    expect(await (parsed.get('file') as File).text()).toBe('fictional');
    await expect(boundedUploadForm(new Request('http://localhost/api/native/files', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 });
  });
});
