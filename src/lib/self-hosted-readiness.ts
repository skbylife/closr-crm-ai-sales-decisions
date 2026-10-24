export type SelfHostedPhaseKey = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type ReadinessStatus = 'pass' | 'warn' | 'fail' | 'manual';

export interface ReadinessCheck {
  id: string;
  phase: SelfHostedPhaseKey;
  label: string;
  status: ReadinessStatus;
  detail: string;
  action?: string;
}

export interface LicenseSnapshot {
  mode: 'unconfigured' | 'offline';
  plan: string;
  seats: number | null;
  modules: string[];
  expiresAt: string | null;
}

export type LicenseModule =
  | 'judgment'
  | 'evidence'
  | 'integrations'
  | 'admin'
  | 'mail'
  | 'public_web'
  | 'exports';

export interface EntitlementCheck {
  enabled: boolean;
  reason: string;
}

export interface SelfHostedReadinessSummary {
  overall: ReadinessStatus;
  pass: number;
  warn: number;
  fail: number;
  manual: number;
}

export const SELF_HOSTED_PHASES: Array<{
  key: SelfHostedPhaseKey;
  title: string;
  goal: string;
}> = [
  { key: 'P0', title: '可运营可诊断', goal: '管理员能看到系统健康、AI 用量、数据边界和错误定位入口。' },
  { key: 'P1', title: '部署与环境自检', goal: '本地/私有化安装后能自动检查关键环境变量、DB、AI、邮件和 scraper。' },
  { key: 'P2', title: '权限与数据边界硬化', goal: '组织、团队、角色、RLS、审计和敏感内容留存边界清晰。' },
  { key: 'P3', title: '内网运维能力', goal: '备份、恢复、迁移、日志导出、升级和回滚有明确操作路径。' },
  { key: 'P4', title: 'License / Entitlement', goal: '离线授权、席位限制和模块开关可控，不依赖在线 billing。' },
];

export function buildLicenseSnapshot(env: NodeJS.ProcessEnv = process.env): LicenseSnapshot {
  const modules = (env.CLOSR_LICENSE_MODULES ?? env.CLOSR_ENABLED_MODULES ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const seatsRaw = Number(env.CLOSR_LICENSE_MAX_SEATS ?? env.CLOSR_MAX_SEATS ?? '');
  const hasLicense = Boolean(env.CLOSR_LICENSE_KEY || env.CLOSR_LICENSE_PLAN || modules.length > 0);

  return {
    mode: hasLicense ? 'offline' : 'unconfigured',
    plan: env.CLOSR_LICENSE_PLAN || env.CLOSR_DEPLOYMENT_PLAN || 'self-hosted',
    seats: Number.isFinite(seatsRaw) && seatsRaw > 0 ? Math.trunc(seatsRaw) : null,
    modules,
    expiresAt: env.CLOSR_LICENSE_EXPIRES_AT || null,
  };
}

export function isLicenseExpired(snapshot: Pick<LicenseSnapshot, 'expiresAt'>, now = new Date()): boolean {
  if (!snapshot.expiresAt) return false;
  const expiresAt = new Date(snapshot.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return true;
  return expiresAt.getTime() < now.getTime();
}

export function checkModuleEntitlement(
  module: LicenseModule,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): EntitlementCheck {
  const license = buildLicenseSnapshot(env);
  if (license.mode === 'unconfigured') {
    return { enabled: true, reason: 'license unconfigured; development/self-hosted manual mode' };
  }
  if (isLicenseExpired(license, now)) {
    return { enabled: false, reason: `license expired at ${license.expiresAt}` };
  }
  if (license.modules.length === 0 || license.modules.includes('all') || license.modules.includes(module)) {
    return { enabled: true, reason: `module ${module} enabled for plan ${license.plan}` };
  }
  return { enabled: false, reason: `module ${module} is not enabled for plan ${license.plan}` };
}

export function summarizeReadiness(checks: ReadinessCheck[]): SelfHostedReadinessSummary {
  const summary = checks.reduce<SelfHostedReadinessSummary>((acc, check) => {
    acc[check.status] += 1;
    return acc;
  }, { overall: 'pass', pass: 0, warn: 0, fail: 0, manual: 0 });

  summary.overall = summary.fail > 0
    ? 'fail'
    : summary.warn > 0
      ? 'warn'
      : summary.manual > 0
        ? 'manual'
        : 'pass';
  return summary;
}

export function buildEnvReadinessChecks(env: NodeJS.ProcessEnv = process.env): ReadinessCheck[] {
  const has = (key: string) => Boolean(env[key]);
  const hasAny = (keys: string[]) => keys.some((key) => has(key));
  const license = buildLicenseSnapshot(env);

  const native = env.CLOSR_DATABASE_BACKEND === 'postgres' || env.NEXT_PUBLIC_CLOSR_DATABASE_BACKEND === 'postgres';
  let validPostgresUrl = false;
  if (env.DATABASE_URL) {
    try { validPostgresUrl = ['postgres:', 'postgresql:'].includes(new URL(env.DATABASE_URL).protocol); } catch { /* report configuration only, never the URL */ }
  }
  const backendChecks: ReadinessCheck[] = native ? [
    {
      id: 'env:database-backend', phase: 'P1', label: 'Native PostgreSQL backend',
      status: env.NEXT_PUBLIC_CLOSR_DATABASE_BACKEND === 'postgres' ? 'pass' : 'warn',
      detail: '原生 PostgreSQL 模式不需要 Supabase URL、anon key 或 service role key。此项只确认配置选择，不证明连接或权限验收完成。',
      action: '确保 NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=postgres 已用于构建浏览器资源；运行空库迁移和租户隔离测试。',
    },
    {
      id: 'env:database-url', phase: 'P1', label: 'Native PostgreSQL connection configuration',
      status: validPostgresUrl ? 'pass' : 'fail',
      detail: validPostgresUrl ? '已配置 PostgreSQL 连接串；实际连接由下方表访问探测检查，不回显连接凭据。' : '原生模式需要服务器端有效的 DATABASE_URL；不能仅提供 SUPABASE_DB_URL。',
      action: '通过本机环境或 Docker secrets 配置 DATABASE_URL，禁止暴露到浏览器。',
    },
    {
      id: 'env:native-auth', phase: 'P2', label: 'Application-managed accounts and MFA', status: 'manual',
      detail: '使用应用自身的账号、HttpOnly 会话与 TOTP；无需外部 Auth 服务。当前检查不验证密码恢复、MFA 或租户隔离完整性。',
      action: '完成首次 owner 设置，并验收登录、退出、TOTP、防重放和恢复流程。',
    },
    {
      id: 'env:native-storage', phase: 'P3', label: 'Local files and authentication key persistence', status: 'manual',
      detail: '附件使用 CLOSR_STORAGE_DIR；TOTP 加密密钥使用 CLOSR_DATA_DIR。环境变量存在不代表已挂载持久卷或完成恢复演练。',
      action: '持久挂载附件目录和认证数据目录，并将 auth-encryption.key 与数据库一起备份及验证恢复。',
    },
  ] : [
    {
      id: 'env:supabase-public', phase: 'P1', label: 'Supabase public env',
      status: has('NEXT_PUBLIC_SUPABASE_URL') && has('NEXT_PUBLIC_SUPABASE_ANON_KEY') ? 'pass' : 'fail',
      detail: '兼容 Supabase 模式需要 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY。',
      action: '在客户服务器 .env 中补齐 Supabase public 配置。',
    },
    {
      id: 'env:supabase-service', phase: 'P1', label: 'Supabase service role',
      status: has('SUPABASE_SERVICE_ROLE_KEY') ? 'pass' : 'fail',
      detail: '兼容 Supabase 模式的后台管理、自检和诊断需要 service role key。',
      action: '只在服务器端配置 SUPABASE_SERVICE_ROLE_KEY，禁止暴露到客户端。',
    },
    {
      id: 'env:database-url', phase: 'P1', label: 'Database migration access',
      status: hasAny(['DATABASE_URL', 'SUPABASE_DB_URL']) ? 'pass' : 'warn',
      detail: '兼容模式升级/迁移最好具备 DATABASE_URL 或 SUPABASE_DB_URL。',
      action: '为运维脚本配置只在服务器可见的数据库连接串。',
    },
  ];

  return [
    ...backendChecks,
    {
      id: 'env:ai-provider',
      phase: 'P1',
      label: 'AI provider',
      status: hasAny(['DEEPSEEK_API_KEY', 'AI_API_KEY', 'GEMINI_API_KEY']) && (hasAny(['AI_MODEL', 'SG_AI_MODEL']) || env.AI_PROVIDER === 'gemini' || env.AI_PROVIDER === 'deepseek') ? 'pass' : 'warn',
      detail: 'Closr 可以运行，但没有客户批准的 AI provider 时 Judgment/Decode 能力会降级。',
      action: '本地部署优先配置 AI_PROVIDER=customer-openai-compatible、AI_BASE_URL、AI_MODEL、AI_API_KEY；Gemini 仅用于明确批准的托管环境。',
    },
    {
      id: 'env:mail-ingress',
      phase: 'P1',
      label: 'Mail ingress',
      status: hasAny(['AGENTMAIL_API_KEY', 'AGENTMAIL_INBOX', 'WEBHOOK_SECRET']) ? 'pass' : 'manual',
      detail: '邮件转发/同步入口需要按客户内网策略单独确认。',
      action: '确认 AgentMail、Microsoft webhook 或客户内网邮件网关。',
    },
    {
      id: 'env:public-web-evidence',
      phase: 'P1',
      label: 'Public web evidence',
      status: hasAny(['TAVILY_API_KEY', 'SCRAPLING_ENABLED', 'PUBLIC_WEB_EVIDENCE_ENABLED']) ? 'pass' : 'manual',
      detail: '公开网页证据抓取可按客户网络策略启用；内网客户可能需要代理或禁用。',
      action: '确认客户服务器是否允许访问公开互联网和 robots.txt。',
    },
    {
      id: 'ops:health-token',
      phase: 'P3',
      label: 'Tokenized health check',
      status: has('HEALTH_CHECK_TOKEN') ? 'pass' : 'warn',
      detail: '公开 /api/health 只返回 minimal ok；详细数据库/AI 状态需要 x-health-token。',
      action: '为企业部署配置 HEALTH_CHECK_TOKEN，并把 uptime monitor 配到带 token 的详细检查。',
    },
    {
      id: 'ops:error-alerting',
      phase: 'P3',
      label: 'Error alerting',
      status: has('ERROR_WEBHOOK_URL') ? 'pass' : 'warn',
      detail: 'ERROR_WEBHOOK_URL 用于服务端关键错误 webhook 告警。',
      action: '接入客户批准的 Slack/Lark/DingTalk/自有告警入口。',
    },
    {
      id: 'ops:waf-edge-protection',
      phase: 'P3',
      label: 'WAF / edge protection',
      status: hasAny(['WAF_PROVIDER', 'CLOSR_WAF_CONFIRMED']) ? 'pass' : 'manual',
      detail: '应用内 proxy 提供兜底 API rate limiting；正式上线仍需要客户边缘/WAF/DDoS 控制。',
      action: '配置 Cloudflare/AWS WAF/阿里云 WAF/Nginx rate limit，或由客户安全团队确认等效控制。',
    },
    {
      id: 'ops:uptime-monitoring',
      phase: 'P3',
      label: 'Uptime monitoring',
      status: hasAny(['UPTIME_MONITOR_URL', 'CLOSR_MONITORING_CONFIRMED']) ? 'pass' : 'manual',
      detail: '企业上线需要外部 synthetic uptime check 与告警去向。',
      action: '配置 UPTIME_MONITOR_URL 或记录客户监控系统确认。',
    },
    {
      id: 'ops:backup-runbook',
      phase: 'P3',
      label: 'Backup / restore runbook',
      status: 'manual',
      detail: '私有化客户需要在交付前确认备份、恢复、迁移和回滚流程。',
      action: native ? '按 SELF_HOSTING.md 备份数据库、附件卷及认证加密密钥；在独立环境演练恢复。' : '使用 docs/SELF_HOSTED_OPERATIONS.md 作为交付 runbook。',
    },
    {
      id: 'license:offline',
      phase: 'P4',
      label: 'Offline entitlement',
      status: license.mode === 'offline' && !isLicenseExpired(license) ? 'pass' : license.mode === 'offline' ? 'fail' : 'manual',
      detail: license.mode === 'offline'
        ? `plan=${license.plan}, seats=${license.seats ?? 'unlimited'}, modules=${license.modules.join(',') || 'all'}, expiresAt=${license.expiresAt ?? 'none'}`
        : '当前未配置离线 license；开发/单客户交付可先手动启用。',
      action: '后续用 CLOSR_LICENSE_* 环境变量或 license 文件控制 seat/module entitlement。',
    },
  ];
}
