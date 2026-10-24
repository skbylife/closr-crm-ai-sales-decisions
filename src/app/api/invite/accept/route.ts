import { isNativeDatabase } from '@/lib/database-backend';
import { acceptExistingInvitation } from '@/lib/native-auth/service';
import { assertSameOrigin } from '@/lib/native-auth/security';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dbAcceptInvitation, dbMigrateUserDataToOrg } from '@/lib/db-server';
import { requireAdmin } from '@/lib/api-guard';
import { recordAuthAuditForUser } from '@/lib/compliance-audit';

export async function POST(request: Request) {
  try {
    if (isNativeDatabase()) assertSameOrigin(request);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { token } = await request.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: '无效的邀请 token' }, { status: 400 });
    }

    const result = isNativeDatabase()
      ? await acceptExistingInvitation({ id: user.id, email: user.email }, token)
      : await dbAcceptInvitation(token, user.id);
    if (!result) {
      return NextResponse.json({ error: '邀请无效或已过期' }, { status: 400 });
    }

    // Migrate any existing data
    await dbMigrateUserDataToOrg(user.id, result.orgId);
    await recordAuthAuditForUser({
      admin: requireAdmin(),
      userId: user.id,
      action: 'invitation_accepted',
      request,
      recordName: result.orgId,
      changes: { orgId: result.orgId, role: result.role },
    });

    return NextResponse.json({ orgId: result.orgId, role: result.role });
  } catch (e) {
    console.error('[api/invite/accept] POST failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
