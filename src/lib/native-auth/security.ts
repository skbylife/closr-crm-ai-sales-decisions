export class NativeAuthError extends Error {
  constructor(public status: number, message: string, public code = 'auth_error') { super(message); }
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new NativeAuthError(403, 'Same-origin request required', 'csrf');
  }
}
export function normalizeEmail(input: unknown): string {
  if (typeof input !== 'string' || input.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())) throw new NativeAuthError(400, 'A valid email is required');
  return input.trim().toLowerCase();
}
export function validatePassword(input: unknown): asserts input is string {
  if (typeof input !== 'string' || input.length < 12 || input.length > 256) throw new NativeAuthError(400, 'Password must contain 12–256 characters');
}
