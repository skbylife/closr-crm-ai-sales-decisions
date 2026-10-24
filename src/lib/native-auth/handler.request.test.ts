import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeAuthPost } from './handler';
afterEach(()=>vi.unstubAllEnvs());
describe('native auth streaming body limit',()=>{
 it('cancels an oversized chunked stream without a Content-Length header',async()=>{
  vi.stubEnv('CLOSR_DATABASE_BACKEND','postgres');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.example.invalid');
  let cancelled=false,pulls=0;
  const stream=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array(8192))},cancel(){cancelled=true}});
  const request=new Request('https://app.example.invalid/api/native/auth',{method:'POST',headers:{Origin:'https://app.example.invalid','Content-Type':'application/json'},body:stream,duplex:'half'} as RequestInit & {duplex:string});
  expect(request.headers.has('content-length')).toBe(false);
  const response=await nativeAuthPost(request);expect(response.status).toBe(413);expect(cancelled).toBe(true);expect(pulls).toBeLessThanOrEqual(4);
 });
 it('counts UTF-8 bytes, even when a misleading Content-Length is supplied',async()=>{
  vi.stubEnv('CLOSR_DATABASE_BACKEND','postgres');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.example.invalid');
  const response=await nativeAuthPost(new Request('https://app.example.invalid/api/native/auth',{method:'POST',headers:{Origin:'https://app.example.invalid','Content-Length':'10','Content-Type':'application/json'},body:JSON.stringify({action:'unknown',text:'字'.repeat(6000)})}));
  expect(response.status).toBe(413);
 });
 it('rejects invalid UTF-8 within the limit without forwarding it to authentication',async()=>{
  vi.stubEnv('CLOSR_DATABASE_BACKEND','postgres');vi.stubEnv('NEXT_PUBLIC_APP_URL','https://app.example.invalid');
  const response=await nativeAuthPost(new Request('https://app.example.invalid/api/native/auth',{method:'POST',headers:{Origin:'https://app.example.invalid'},body:new Uint8Array([0xff])}));expect(response.status).toBe(400);
 });
});
