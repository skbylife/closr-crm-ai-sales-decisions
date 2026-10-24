import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock('@/lib/postgres', () => mocks);
import { validateEmbedding, vectorParameter } from './embedding';
import { searchNativeKnowledge, searchNativeCases, saveNativeKnowledge } from './repository';

const org = '11111111-1111-4111-8111-111111111111';
const vector = Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0);
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([]); mocks.queryOne.mockResolvedValue({ id: 'saved' }); });

describe('embedding schema contract', () => {
  it('rejects wrong dimensions, zero norm, non-finite values and unnamed spaces', () => {
    expect(() => validateEmbedding([1, 2], 'model-a')).toThrow('1536');
    expect(() => validateEmbedding(Array(1536).fill(0), 'model-a')).toThrow('nonzero');
    expect(() => validateEmbedding([...vector.slice(0,-1), Infinity], 'model-a')).toThrow('finite');
    expect(() => validateEmbedding(vector, '')).toThrow('model');
    expect(JSON.parse(vectorParameter({ values: vector, model: 'test-only-model' }))).toHaveLength(1536);
  });
});
describe('native knowledge scoping', () => {
  it('requires an explicit valid organization scope before querying', async () => {
    await expect(searchNativeKnowledge({ orgId: '', text: 'negotiation' })).rejects.toThrow('organization');
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('parameterizes malicious keyword inputs and includes only same-model vector rows', async () => {
    mocks.query.mockResolvedValueOnce([{ id: 'relevant' }]);
    await searchNativeKnowledge({ orgId: org, accountId: 'account-a', text: "x'); DROP TABLE users; --", embedding: { values: vector, model: 'model-a' } });
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain('org_id = $1::uuid');
    expect(sql).toContain('org_id IS NULL AND account_id IS NULL');
    expect(sql).toContain('embedding_model = $3');
    expect(params.slice(0, 3)).toEqual([org, 'account-a', 'model-a']);
    expect(sql).not.toContain('DROP TABLE');
  });
  it('falls back to escaped keywords when no compatible model vectors exist', async () => {
    await searchNativeKnowledge({ orgId: org, text: 'price_100%', embedding: { values: vector, model: 'model-b' } });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][1][2]).toEqual(['%price\\_100\\%%']);
  });
  it('never returns unclassified or tenant case rows as global strategy examples', async () => {
    await searchNativeCases({ text: 'negotiation' });
    expect(mocks.query.mock.calls[0][0]).toContain('is_general_knowledge = true AND org_id IS NULL');
  });
  it('writes private records with scoped parameters and explicit model metadata', async () => {
    await saveNativeKnowledge({ orgId: org, accountId: 'account-a', title: 'Private', content: 'Example', category: 'notes', embedding: { values: vector, model: 'model-a' } });
    const [sql, params] = mocks.queryOne.mock.calls[0];
    expect(sql).toContain('$12,false');
    expect(params.slice(-2)).toEqual(['model-a', 1536]);
  });
});
