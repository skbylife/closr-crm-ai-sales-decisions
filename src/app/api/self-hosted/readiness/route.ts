import { NextResponse } from 'next/server';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { isNativeDatabase } from '@/lib/database-backend';
import { query } from '@/lib/postgres';
import { requireAdmin, requireAuth, requireRole, guardResponse } from '@/lib/api-guard';
import {
  buildEnvReadinessChecks,
  buildLicenseSnapshot,
  summarizeReadiness,
  type ReadinessCheck,
} from '@/lib/self-hosted-readiness';

const REQUIRED_TABLES = [
  'accounts',
  'contacts',
  'opportunities',
  'tasks',
  'source_records',
  'ai_invocation_logs',
] as const;

async function checkTable(admin: ReturnType<typeof requireAdmin>, table: string): Promise<ReadinessCheck> {
  const { error } = await admin.from(table).select('id').limit(1);
  return {
    id: `db:${table}`,
    phase: table === 'source_records' || table === 'ai_invocation_logs' ? 'P2' : 'P1',
    label: `DB table: ${table}`,
    status: error ? 'fail' : 'pass',
    detail: error ? error.message : '表可访问，基础 schema 存在。',
    action: error ? (isNativeDatabase() ? '运行原生数据库 migration，并确认服务器 DATABASE_URL 指向正确实例。' : '运行数据库 migration，并确认 service role 连接的是正确实例。') : undefined,
  };
}

async function buildNativeRuntimeChecks(): Promise<ReadinessCheck[]> {
  if (!isNativeDatabase()) return [];
  const checks: ReadinessCheck[] = [];
  try {
    const [row] = await query<{ vector: boolean; accounts: boolean }>(`SELECT
      EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector') AS vector,
      to_regclass('auth.native_sessions') IS NOT NULL AND to_regclass('auth.native_mfa') IS NOT NULL AS accounts`);
    checks.push({ id: 'db:pgvector', phase: 'P1', label: 'pgvector extension', status: row?.vector ? 'pass' : 'fail',
      detail: row?.vector ? 'pgvector 扩展存在；此探测不代表向量语料、模型兼容或检索效果已经验收。' : '未找到 pgvector 扩展。', action: '运行原生初始化迁移并验证知识导入与离线向量检索。' });
    checks.push({ id: 'db:native-auth', phase: 'P2', label: 'Native authentication tables', status: row?.accounts ? 'pass' : 'fail',
      detail: row?.accounts ? '会话和 MFA 表存在；这不是完整认证安全验收。' : '原生会话或 MFA 表缺失。', action: '运行原生认证迁移并验收完整登录/MFA/恢复流程。' });
  } catch {
    checks.push({ id: 'db:native-capabilities', phase: 'P1', label: 'Native database capabilities', status: 'fail',
      detail: '无法读取原生数据库能力；连接细节与凭据不在此响应中回显。', action: '检查服务器 DATABASE_URL、数据库状态与迁移日志。' });
  }
  for (const [id, label, directory] of [
    ['storage:attachments', 'Local attachment directory', resolve(process.env.CLOSR_STORAGE_DIR ?? './.local/uploads')],
    ['storage:auth-data', 'Local authentication data directory', resolve(process.env.CLOSR_DATA_DIR ?? '/data/closr')],
  ]) {
    try {
      if (!(await stat(directory)).isDirectory()) throw new Error('not a directory');
      await access(directory, constants.R_OK | constants.W_OK);
      checks.push({ id, phase: 'P3', label, status: 'pass', detail: '目录存在且当前进程可读写；未检查 Docker 卷持久性、容量或灾难恢复。' });
    } catch {
      checks.push({ id, phase: 'P3', label, status: 'warn', detail: '目录尚未创建或当前进程不可读写；首次使用前需要确认目录与持久卷配置。' });
    }
  }
  try {
    const key = await stat(join(process.env.CLOSR_DATA_DIR ?? '/data/closr', 'auth-encryption.key'));
    checks.push({ id: 'storage:mfa-key', phase: 'P2', label: 'TOTP encryption key file', status: key.isFile() && key.size === 32 && (key.mode & 0o077) === 0 ? 'pass' : 'fail',
      detail: '只检查密钥文件大小与访问权限，未读取密钥；完整恢复能力仍需备份恢复演练。' });
  } catch {
    checks.push({ id: 'storage:mfa-key', phase: 'P2', label: 'TOTP encryption key file', status: 'manual',
      detail: '密钥文件不存在或不可检查；首次 TOTP enrollment 时创建。若已有 MFA 用户，缺少该文件会阻止验证。' });
  }
  return checks;
}

function buildMultiUserCapacityChecks(): ReadinessCheck[] {
  const maxSeats = Number(process.env.CLOSR_LICENSE_MAX_SEATS ?? 0);
  const expectedConcurrentUsers = Number(process.env.CLOSR_EXPECTED_CONCURRENT_USERS ?? 0);
  const memory = process.memoryUsage();
  const heapLimitMb = Math.round(memory.heapTotal / 1024 / 1024);
  const rssMb = Math.round(memory.rss / 1024 / 1024);

  return [
    {
      id: 'ops:node-memory-headroom',
      phase: 'P4',
      label: 'Node memory headroom',
      status: heapLimitMb >= 128 ? 'pass' : 'warn',
      detail: `rss=${rssMb}MB, heapTotal=${heapLimitMb}MB. 多用户 pilot 建议至少 2C4G；30+ 并发建议 4C8G 或拆分 AI worker。`,
      action: heapLimitMb >= 128 ? undefined : '提高 Node.js / 宿主机内存，避免多人 AI 任务与页面 hydration 抢资源。',
    },
    {
      id: 'ops:expected-concurrency',
      phase: 'P4',
      label: 'Expected concurrent users',
      status: expectedConcurrentUsers > 0 ? 'pass' : 'manual',
      detail: expectedConcurrentUsers > 0
        ? `${expectedConcurrentUsers} expected concurrent users configured`
        : '未配置 CLOSR_EXPECTED_CONCURRENT_USERS；当前 readiness 无法判断目标并发档位。',
      action: '为企业 pilot 配置 CLOSR_EXPECTED_CONCURRENT_USERS，并按 10/30/100 人档做压测。',
    },
    {
      id: 'ops:seat-vs-concurrency',
      phase: 'P4',
      label: 'Seat/concurrency ratio',
      status: maxSeats > 0 && expectedConcurrentUsers > maxSeats ? 'fail' : maxSeats > 0 && expectedConcurrentUsers > 0 ? 'pass' : 'manual',
      detail: `maxSeats=${maxSeats || 'unset'}, expectedConcurrentUsers=${expectedConcurrentUsers || 'unset'}`,
      action: '并发人数不应高于授权席位；未配置时需要人工确认企业试点规模。',
    },
  ];
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    const admin = requireAdmin();
    const license = buildLicenseSnapshot();

    const native = isNativeDatabase();
    const envChecks = buildEnvReadinessChecks();
    const nativeChecks = await buildNativeRuntimeChecks();
    const dbChecks = await Promise.all(REQUIRED_TABLES.map((table) => checkTable(admin, table)));
    const { count: memberCount, error: memberCountError } = await admin
      .from('org_memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', ctx.orgId);
    const boundaryChecks: ReadinessCheck[] = [
      {
        id: 'privacy:ai-log-redaction',
        phase: 'P2',
        label: 'AI log redaction',
        status: native ? 'manual' : 'pass',
        detail: native ? '需复核实际 AI 日志脱敏与保留策略；此 readiness 请求不读取日志正文，也不证明生产数据已脱敏。' : 'AI invocation log 只保存 route/use_case/model/token/duration/error metadata，不保存 prompt/completion 原文。',
      },
      {
        id: 'privacy:evidence-scope',
        phase: 'P2',
        label: 'Evidence account scoping',
        status: dbChecks.some((check) => check.id === 'db:source_records' && check.status === 'pass') ? (native ? 'manual' : 'pass') : 'fail',
        detail: native ? 'source_records 表可访问不等于租户隔离已验证；还需双租户 RLS/API 越权测试。' : 'source_records 是 Judgment Layer 证据账本；必须按 org/account 范围访问。',
        action: '确认 source_records migration、RLS policy 和 API account scope guard。',
      },
      {
        id: 'ops:runtime-diagnostics',
        phase: 'P0',
        label: 'Runtime diagnostics',
        status: 'pass',
        detail: '当前 readiness API 已可被 owner/admin 用于部署后自检。',
      },
      {
        id: 'license:seat-limit',
        phase: 'P4',
        label: 'Seat entitlement',
        status: memberCountError
          ? 'warn'
          : license.seats && typeof memberCount === 'number' && memberCount > license.seats
            ? 'fail'
            : license.seats
              ? 'pass'
              : 'manual',
        detail: memberCountError
          ? memberCountError.message
          : license.seats
            ? `${memberCount ?? 0}/${license.seats} seats used`
            : `${memberCount ?? 0} seats used; no offline seat limit configured`,
        action: '使用 CLOSR_LICENSE_MAX_SEATS 设置客户部署的离线席位上限。',
      },
    ];

    const checks = [...boundaryChecks, ...buildMultiUserCapacityChecks(), ...envChecks, ...dbChecks, ...nativeChecks];
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      orgId: ctx.orgId,
      deployment: {
        mode: process.env.CLOSR_DEPLOYMENT_MODE || 'self-hosted',
        backend: native ? 'postgres' : 'supabase',
        nodeEnv: process.env.NODE_ENV || 'development',
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || null,
      },
      license: {
        ...license,
        seatsUsed: memberCount ?? null,
      },
      summary: summarizeReadiness(checks),
      checks,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
