import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ping } from '@/lib/postgres';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const ok = await ping();
  return NextResponse.json(
    { postgres: ok ? 'connected' : 'unreachable' },
    { status: ok ? 200 : 503 },
  );
}
