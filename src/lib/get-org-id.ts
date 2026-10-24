// 服务端获取用户的 org_id（从 org_memberships 表查询）
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * 根据 userId 获取其所属组织 ID。
 * 一个用户只属于一个组织（当前设计），取第一个。
 */
export async function getOrgIdForUser(userId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  try {
    const { data, error } = await admin
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.org_id as string;
  } catch {
    return null;
  }
}
