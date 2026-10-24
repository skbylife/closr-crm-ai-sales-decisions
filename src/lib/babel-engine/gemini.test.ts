import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => null),
}));

function mockOpenAIResponse() {
  return new Response(JSON.stringify({
    choices: [{ message: { content: '{"ok":true}' } }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

describe('callGemini OpenAI-compatible provider routing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('AI_BASE_URL', 'https://flash.example/v1');
    vi.stubEnv('AI_API_KEY', 'flash-key');
    vi.stubEnv('AI_MODEL', 'deepseek-v4-flash');
    vi.stubEnv('AI_PRO_BASE_URL', 'https://pro.example/v1');
    vi.stubEnv('AI_PRO_API_KEY', 'pro-key');
    vi.stubEnv('AI_PRO_MODEL', 'deepseek-v4-pro');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes an explicit pro model override matching AI_PRO_MODEL to the pro provider', async () => {
    const fetchMock = vi.fn(async () => mockOpenAIResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { callGemini } = await import('./gemini');

    await expect(callGemini<{ ok: boolean }>({
      systemPrompt: 'Return JSON.',
      userPrompt: 'ok',
      tier: 'pro',
      model: 'deepseek-v4-pro',
    })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(String(url)).toBe('https://pro.example/v1/chat/completions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer pro-key' });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: 'deepseek-v4-pro', thinking: { type: 'enabled' }, reasoning_effort: 'high' });
  });

  it('keeps a non-pro explicit model on the base provider', async () => {
    const fetchMock = vi.fn(async () => mockOpenAIResponse());
    vi.stubGlobal('fetch', fetchMock);

    const { callGemini } = await import('./gemini');

    await callGemini<{ ok: boolean }>({
      systemPrompt: 'Return JSON.',
      userPrompt: 'ok',
      tier: 'pro',
      model: 'deepseek-v4-flash',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(String(url)).toBe('https://flash.example/v1/chat/completions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer flash-key' });
  });
});
