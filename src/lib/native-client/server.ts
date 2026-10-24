import type { SupabaseClient } from '@supabase/supabase-js';
import { createQueryClient } from '@/lib/native-db/query';
import { executeNativeQuery } from '@/lib/native-db/executor';
import { createNativeServerAuth, getNativeUser } from '@/lib/native-auth/server';

/** Server-only construction. Never expose the admin option through a browser request. */
export function createNativeServerClient(admin = false): SupabaseClient {
  const queries = createQueryClient(async (spec) => {
    if (admin) return executeNativeQuery(spec, { admin: true });
    const user = await getNativeUser();
    if (!user) return { data: null, error: { code: '401', message: 'Authentication required' }, count: null, status: 401, statusText: 'Unauthorized' };
    return executeNativeQuery(spec, { userId: user.id });
  });
  return { ...queries, auth: createNativeServerAuth({ admin }) } as unknown as SupabaseClient;
}
