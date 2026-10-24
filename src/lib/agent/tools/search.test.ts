import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requireAccountAccess, requireContactAccess, requireOpportunityAccess } from '@/lib/api-guard';
import { getUserContext } from '@/lib/permissions-server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { executeSearchAccounts, executeSearchContacts, executeSearchOpportunities } from './search';

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ...actual,
    requireAccountAccess: vi.fn(),
    requireContactAccess: vi.fn(),
    requireOpportunityAccess: vi.fn(),
  };
});

vi.mock('@/lib/permissions-server', () => ({
  getUserContext: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const userContext = {
  userId: 'user_1',
  orgId: 'org_1',
  orgRole: 'member' as const,
  roleLevel: 'member' as const,
  jobLevel: 0,
  teamId: null,
  teamMemberIds: ['user_1'],
};

function makeQuery(result: { data: unknown[] | null; error: { message: string } | null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    ilike: vi.fn(() => query),
    in: vi.fn(() => result),
    limit: vi.fn(() => result),
  };
  return query;
}

describe('Sales Agent search tools access scope', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filters account search results through requireAccountAccess before returning data', async () => {
    vi.mocked(getUserContext).mockResolvedValue(userContext);
    vi.mocked(requireAccountAccess).mockImplementation(async (_ctx, accountId) => {
      if (accountId === 'acc_hidden') throw new ApiError(403, '只能操作自己的数据');
    });

    const accountsQuery = makeQuery({
      data: [
        { id: 'acc_visible', name: '华东平台客户', industry: '互联网', deal_stage: 'proposal', deal_value: 100 },
        { id: 'acc_hidden', name: '华东隐藏客户', industry: '制造', deal_stage: 'discovery', deal_value: 200 },
      ],
      error: null,
    });
    const contactsQuery = makeQuery({
      data: [{ id: 'con_1', name: '李总', title: 'VP', role: 'champion', account_id: 'acc_visible' }],
      error: null,
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => table === 'accounts' ? accountsQuery : contactsQuery),
    } as unknown as ReturnType<typeof getSupabaseAdmin>);

    const result = await executeSearchAccounts({ query: '华东', userId: 'user_1' });
    const data = result.data as { id: string; contacts: { id: string }[] }[];

    expect(result.success).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('acc_visible');
    expect(data[0].contacts).toEqual([{ id: 'con_1', name: '李总', title: 'VP', role: 'champion' }]);
    expect(contactsQuery.in).toHaveBeenCalledWith('account_id', ['acc_visible']);
  });

  it('filters contact search results through requireContactAccess before returning data', async () => {
    vi.mocked(getUserContext).mockResolvedValue(userContext);
    vi.mocked(requireContactAccess).mockImplementation(async (_ctx, contactId) => {
      if (contactId === 'con_hidden') throw new ApiError(403, '只能操作自己的数据');
      return { id: contactId, account_id: 'acc_visible', user_id: 'user_1' };
    });

    const contactsQuery = makeQuery({
      data: [
        { id: 'con_visible', name: '李总', title: 'VP', role: 'champion', account_id: 'acc_visible', email: 'li@example.com' },
        { id: 'con_hidden', name: '李总', title: 'CFO', role: 'decision_maker', account_id: 'acc_hidden', email: 'hidden@example.com' },
      ],
      error: null,
    });
    const accountsQuery = makeQuery({
      data: [{ id: 'acc_visible', name: '华东平台客户' }],
      error: null,
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => table === 'contacts' ? contactsQuery : accountsQuery),
    } as unknown as ReturnType<typeof getSupabaseAdmin>);

    const result = await executeSearchContacts({ query: '李总', userId: 'user_1' });
    const data = result.data as { id: string; accountName: string | null }[];

    expect(result.success).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: 'con_visible', accountName: '华东平台客户' });
  });

  it('does not query opportunities when the requested accountId is outside the user scope', async () => {
    vi.mocked(getUserContext).mockResolvedValue(userContext);
    vi.mocked(requireAccountAccess).mockRejectedValue(new ApiError(403, '只能操作自己的数据'));
    const from = vi.fn();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseAdmin>);

    const result = await executeSearchOpportunities({
      query: '扩容',
      accountId: 'acc_hidden',
      userId: 'user_1',
    });

    expect(result).toEqual({
      success: true,
      message: '未找到匹配的商机（query=扩容, accountId=acc_hidden）',
      data: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('includes account contacts when searching opportunities', async () => {
    vi.mocked(getUserContext).mockResolvedValue(userContext);
    vi.mocked(requireOpportunityAccess).mockResolvedValue({
      id: 'opp_visible',
      account_id: 'acc_visible',
      user_id: 'user_1',
      assigned_to: null,
    });

    const opportunitiesQuery = makeQuery({
      data: [{ id: 'opp_visible', name: '平台基础设施智能运维升级', account_id: 'acc_visible', stage: 'negotiation', value: 35000000, user_id: 'user_1', assigned_to: null }],
      error: null,
    });
    const accountsQuery = makeQuery({
      data: [{ id: 'acc_visible', name: '华东平台客户' }],
      error: null,
    });
    const contactsQuery = makeQuery({
      data: [
        { id: 'con_1', name: '李总', title: '数字化转型部 VP', role: 'decision_maker', account_id: 'acc_visible' },
        { id: 'con_2', name: '王磊', title: '云服务架构师', role: 'champion', account_id: 'acc_visible' },
      ],
      error: null,
    });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'opportunities') return opportunitiesQuery;
        if (table === 'accounts') return accountsQuery;
        return contactsQuery;
      }),
    } as unknown as ReturnType<typeof getSupabaseAdmin>);

    const result = await executeSearchOpportunities({
      query: '平台基础设施智能运维升级',
      userId: 'user_1',
    });
    const data = result.data as { id: string; contacts: { id: string; name: string }[] }[];

    expect(result.success).toBe(true);
    expect(data[0].id).toBe('opp_visible');
    expect(data[0].contacts).toEqual([
      { id: 'con_1', name: '李总', title: '数字化转型部 VP', role: 'decision_maker' },
      { id: 'con_2', name: '王磊', title: '云服务架构师', role: 'champion' },
    ]);
    expect(contactsQuery.in).toHaveBeenCalledWith('account_id', ['acc_visible']);
  });
});
