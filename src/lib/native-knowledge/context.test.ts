import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), access: vi.fn() }));
vi.mock('@/lib/postgres', () => ({ query: mocks.query, queryOne: vi.fn() }));
vi.mock('@/lib/api-guard', () => ({ requireAccountAccess: mocks.access }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => { throw new Error('Native path must not use Supabase'); } }));
import { injectKnowledgeContextScoped } from '@/lib/knowledge-engine';
import { searchSimilarCases } from '@/lib/babel-engine/vector-store';
import type { UserContext } from '@/lib/permissions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLOSR_DATABASE_BACKEND', 'postgres');
  vi.stubEnv('AI_PROVIDER', 'disabled');
  vi.stubEnv('AI_BASE_URL', '');
  vi.stubEnv('AI_API_KEY', '');
  vi.stubEnv('DEEPSEEK_API_KEY', '');
  mocks.access.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe('native knowledge is connected to existing prompt retrieval', () => {
  it('puts a readable scoped result into the existing prompt context without model/network calls', async () => {
    mocks.query.mockResolvedValue([{ id: 'original-note', category: '谈判学', title: 'BATNA', content: 'Compare alternatives using verified information.', applicable_scenarios: ['negotiation'] }]);
    const ctx = { orgId: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222' } as UserContext;
    const context = await injectKnowledgeContextScoped(ctx, 'account-example', 'BATNA');
    expect(mocks.access).toHaveBeenCalledWith(ctx, 'account-example');
    expect(context).toContain('BATNA');
    expect(context).toContain('Compare alternatives');
    expect(context).toContain('[参考数据结束]');
  });
  it('uses the native strategy-case path with no configured embedding provider', async () => {
    mocks.query.mockResolvedValue([{ id: 'case', situation: 'Champion', approach: 'Map the roles.' }]);
    expect(await searchSimilarCases('Champion')).toEqual([{ id: 'case', situation: 'Champion', approach: 'Map the roles.' }]);
    expect(mocks.query.mock.calls[0][0]).toContain('is_general_knowledge = true AND org_id IS NULL');
  });
});
