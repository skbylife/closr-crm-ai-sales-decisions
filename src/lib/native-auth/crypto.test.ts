import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, totpCode, verifyTotp, tokenHash, randomToken } from './crypto';
import { assertSameOrigin, validatePassword } from './security';
describe('native authentication primitives',()=>{
 it('uses salted hashes and rejects incorrect or malformed passwords',async()=>{
  const password='EXAMPLE_ONLY_password_239';const a=await hashPassword(password),b=await hashPassword(password);
  expect(a).not.toEqual(b);expect(a).not.toContain(password);expect(await verifyPassword(password,a)).toBe(true);
  expect(await verifyPassword('incorrect',a)).toBe(false);expect(await verifyPassword(password,'invalid')).toBe(false);
 });
 it('matches the RFC 6238 SHA1 vector truncated to six digits and blocks replay',()=>{
  // Public RFC 6238 Appendix B test vector; not a deployed MFA secret.
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  expect(totpCode(secret,1)).toBe('287082');expect(verifyTotp(secret,'287082',null,59_000)).toBe(1);
  expect(verifyTotp(secret,'287082',1,59_000)).toBeNull();expect(verifyTotp(secret,'not-code',null,59_000)).toBeNull();
 });
 it('makes opaque random session tokens and one-way hashes',()=>{
  const a=randomToken(),b=randomToken();expect(a).not.toBe(b);expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(tokenHash(a)).toHaveLength(64);
 });
 it('rejects foreign and missing origins for cookie-auth mutations',()=>{
  const old=process.env.NEXT_PUBLIC_APP_URL;process.env.NEXT_PUBLIC_APP_URL='https://app.example.invalid';
  try{
   expect(()=>assertSameOrigin(new Request('https://app.example.invalid/api',{headers:{origin:'https://app.example.invalid'}}))).not.toThrow();
   expect(()=>assertSameOrigin(new Request('https://app.example.invalid/api',{headers:{origin:'https://other.example.invalid'}}))).toThrow();
   expect(()=>assertSameOrigin(new Request('https://app.example.invalid/api'))).toThrow();
   expect(()=>validatePassword('short')).toThrow();
  }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=old}
 });
});
