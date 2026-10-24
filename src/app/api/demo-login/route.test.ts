import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { __resetDemoLoginRateLimitForTests } from './rate-limit';

function request(accessPassword: string, ip = '203.0.113.10') {
  return new Request('http://localhost/api/demo-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify({ accessPassword }),
  });
}

describe('/api/demo-login rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDemoLoginRateLimitForTests();
    process.env.DEMO_ACCESS_PASSWORD = 'EXAMPLE_ONLY_6E7F47169C';
    process.env.DEMO_PASSWORD = 'EXAMPLE_ONLY_41BD876B08';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({
        access_token: 'EXAMPLE_ONLY_A0561FD649',
        refresh_token: 'EXAMPLE_ONLY_D6CC0A088C',
        expires_in: 3600,
        user: { id: 'user_1', email: 'example-c39293aa15@example.invalid' },
      }),
    );
  });

  it('throttles repeated wrong access password attempts from the same IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(request('wrong-password'));
      expect(res.status).toBe(401);
    }

    const blocked = await POST(request('wrong-password'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clears failed attempt bucket after a successful demo login', async () => {
    for (let i = 0; i < 4; i += 1) {
      const res = await POST(request('wrong-password', '203.0.113.11'));
      expect(res.status).toBe(401);
    }

    const ok = await POST(request('EXAMPLE_ONLY_6E7F47169C', '203.0.113.11'));
    expect(ok.status).toBe(200);

    const nextFailure = await POST(request('wrong-password', '203.0.113.11'));
    expect(nextFailure.status).toBe(401);
  });
});
