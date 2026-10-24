import { createHash, randomBytes, scrypt as rawScrypt, timingSafeEqual, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
const scrypt = promisify(rawScrypt);
export function tokenHash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function randomToken(): string { return randomBytes(32).toString('base64url'); }
export async function hashPassword(password: string): Promise<string> {
 const salt = randomBytes(16).toString('hex');
 const hash = await scrypt(password, salt, 64) as Buffer;
 return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
 const [algorithm, salt, expected] = encoded.split('$');
 if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(expected ?? '')) return false;
 const actual = await scrypt(password, salt, 64) as Buffer;
 return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function generateTotpSecret(): string {
 const bytes = randomBytes(20); let bits = '';
 for (const b of bytes) bits += b.toString(2).padStart(8, '0');
 return bits.match(/.{5}/g)!.map(x => alphabet[parseInt(x, 2)]).join('');
}
function decodeBase32(secret: string): Buffer {
 if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid TOTP secret');
 const bits = [...secret].map(x => alphabet.indexOf(x).toString(2).padStart(5,'0')).join('');
 return Buffer.from(bits.match(/.{8}/g)!.map(x=>parseInt(x,2)));
}
export function totpCode(secret: string, counter: number): string {
 const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
 const h = createHmac('sha1', decodeBase32(secret)).update(b).digest();
 const offset = h[h.length-1]&15;
 return ((h.readUInt32BE(offset)&0x7fffffff)%1_000_000).toString().padStart(6,'0');
}
export function verifyTotp(secret: string, code: string, lastCounter: number | null = null, now = Date.now()): number | null {
 if (!/^\d{6}$/.test(code)) return null;
 const current = Math.floor(now/30_000);
 for (const c of [current,current-1,current+1]) {
  if (lastCounter !== null && c <= lastCounter) continue;
  if (timingSafeEqual(Buffer.from(totpCode(secret,c)),Buffer.from(code))) return c;
 }
 return null;
}
let cachedKey: Promise<Buffer> | undefined;
async function encryptionKey(): Promise<Buffer> {
 if (!cachedKey) cachedKey = (async()=>{
  const dir = process.env.CLOSR_DATA_DIR || '/data/closr';
  await mkdir(dir,{recursive:true,mode:0o700});
  const path = join(dir,'auth-encryption.key');
  try { await writeFile(path,randomBytes(32),{flag:'wx',mode:0o600}); } catch(e) { if ((e as NodeJS.ErrnoException).code!=='EEXIST') throw e; }
  const key = await readFile(path); if(key.length!==32) throw new Error('Invalid auth encryption key'); return key;
 })();
 return cachedKey;
}
export async function encryptSecret(secret: string): Promise<string> {
 const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',await encryptionKey(),iv);
 const content=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),content]).toString('base64');
}
export async function decryptSecret(encoded: string): Promise<string> {
 const b=Buffer.from(encoded,'base64'); const decipher=createDecipheriv('aes-256-gcm',await encryptionKey(),b.subarray(0,12));
 decipher.setAuthTag(b.subarray(12,28)); return Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString('utf8');
}
