import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requireAccountAccess } from '@/lib/api-guard';
import { getUserContext } from '@/lib/permissions-server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { executeReadAccountContext } from './read-context';

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ...actual,
    requireAccountAccess: vi.fn(),
  };
});

vi.mock('@/lib/permissions-server', () => ({
  getUserContext: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe('executeReadAccountContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns an access failure before reading account data when account access is denied', async () => {
    const from = vi.fn();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseAdmin>);
    vi.mocked(getUserContext).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: ['user_1'],
    });
    vi.mocked(requireAccountAccess).mockRejectedValue(new ApiError(403, '只能操作自己的数据'));

    const result = await executeReadAccountContext({
      accountId: 'acc_other',
      userId: 'user_1',
    });

    expect(result).toEqual({ success: false, message: '只能操作自己的数据' });
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }), 'acc_other');
    expect(from).not.toHaveBeenCalled();
  });
});
