import { NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/api-auth';
import { guardResponse, requireAdmin, requireAuth } from '@/lib/api-guard';
import {
  backfillDemoJudgmentMemorySources,
  DEMO_JUDGMENT_MEMORY_BACKFILL_CONFIRM,
} from '@/lib/judgment/demo-backfill';

export const dynamic = 'force-dynamic';

const DEMO_USER_EMAIL = 'example-c39293aa15@example.invalid';

interface DemoJudgmentMemoryBackfillBody {
  confirm?: string;
  dryRun?: boolean;
  accountIds?: unknown;
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value) && value.length <= 128;
}

function normalizeAccountIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter(isValidId))];
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return unauthorizedResponse();

    const ctx = await requireAuth();
    if (ctx.userId !== authUser.id) {
      return NextResponse.json({ error: 'Auth context mismatch' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as DemoJudgmentMemoryBackfillBody;
    if (body.confirm !== DEMO_JUDGMENT_MEMORY_BACKFILL_CONFIRM) {
      return NextResponse.json({
        error: `Missing confirm=${DEMO_JUDGMENT_MEMORY_BACKFILL_CONFIRM}`,
      }, { status: 400 });
    }

    const demoConfigured = Boolean(process.env.DEMO_PASSWORD) && Boolean(process.env.DEMO_ACCESS_PASSWORD);
    if (!demoConfigured) {
      return NextResponse.json({ error: 'Demo 未配置' }, { status: 403 });
    }

    if (authUser.email !== DEMO_USER_EMAIL) {
      return NextResponse.json({ error: '仅 demo 账号可执行此操作' }, { status: 403 });
    }

    const admin = requireAdmin();
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select('id, slug, name')
      .eq('id', ctx.orgId)
      .maybeSingle();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    const orgSlug = typeof org?.slug === 'string' ? org.slug : '';
    const orgName = typeof org?.name === 'string' ? org.name : '';
    if (orgSlug !== 'closr-demo' && orgName !== 'Closr Demo') {
      return NextResponse.json({ error: '仅 Closr Demo 组织可执行此 backfill' }, { status: 403 });
    }

    const result = await backfillDemoJudgmentMemorySources({
      admin,
      orgId: ctx.orgId,
      userId: ctx.userId,
      requestedAccountIds: normalizeAccountIds(body.accountIds),
      dryRun: body.dryRun === true,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return guardResponse(err);
  }
}
