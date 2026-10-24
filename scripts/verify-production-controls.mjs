#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const checks = [
  {
    file: 'src/proxy.ts',
    markers: [
      'export async function proxy',
      'updateSession',
      '/api/',
      'checkRateLimit',
      'rateLimitHeaders',
      'Too many requests',
      'Retry-After',
      'RATE_LIMIT_EXEMPT_PATHS',
    ],
  },
  {
    file: 'src/lib/rate-limit.ts',
    markers: [
      'export function checkRateLimit',
      'export function rateLimitHeaders',
      'RATE_LIMIT_API_WRITE_PER_MINUTE',
      'RATE_LIMIT_API_READ_PER_MINUTE',
      'RATE_LIMIT_AI_PER_MINUTE',
      'RATE_LIMIT_IMPORT_PER_MINUTE',
      'production deployments still require edge/WAF controls',
    ],
  },
  {
    file: 'src/app/api/health/route.ts',
    markers: [
      'HEALTH_CHECK_TOKEN',
      'x-health-token',
      "{ status: 'ok' }",
      'ai_config',
      'database',
    ],
  },
  {
    file: 'src/lib/error-monitor.ts',
    markers: ['ERROR_WEBHOOK_URL', 'Structured log entry', 'fireWebhook', 'withErrorMonitoring'],
  },
  {
    file: 'next.config.ts',
    markers: [
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Permissions-Policy',
      'frame-ancestors',
    ],
  },
  {
    file: 'docs/compliance/EDGE-PROTECTION-MONITORING.md',
    markers: [
      '# Edge Protection And Monitoring Controls',
      'Application Rate Limiting',
      'WAF Baseline',
      'Monitoring Baseline',
      'Release Gate',
      'Non-Claims',
    ],
  },
  {
    file: 'docs/compliance/EVIDENCE-MATRIX.md',
    markers: ['Rate limiting, WAF, and monitoring', 'verify:production-controls'],
  },
  {
    file: 'docs/compliance/README.md',
    markers: ['EDGE-PROTECTION-MONITORING.md', 'npm run verify:production-controls'],
  },
  {
    file: 'scripts/verify-enterprise-release.mjs',
    markers: ["'npm', ['run', 'verify:production-controls']"],
  },
];

let failures = 0;

for (const check of checks) {
  if (!existsSync(check.file)) {
    console.error('FAIL missing ' + check.file);
    failures += 1;
    continue;
  }

  const source = readFileSync(check.file, 'utf8');
  const missing = check.markers.filter((marker) => !source.includes(marker));
  if (missing.length > 0) {
    console.error('FAIL ' + check.file + ' missing markers: ' + missing.join(', '));
    failures += 1;
    continue;
  }

  console.log('PASS ' + check.file);
}

const enterpriseLikeTarget = /^(global-prod|cn-prod|customer-self-hosted|customer-self-hosted-lite|customer-self-hosted-enterprise)$/.test(
  process.env.DEPLOY_TARGET || '',
);
if (enterpriseLikeTarget) {
  const requiredEnv = ['HEALTH_CHECK_TOKEN', 'ERROR_WEBHOOK_URL'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      console.error('FAIL missing required production control env for ' + (process.env.DEPLOY_TARGET || 'target') + ': ' + key);
      failures += 1;
    }
  }

  if (!process.env.WAF_PROVIDER && !process.env.CLOSR_WAF_CONFIRMED) {
    console.error('FAIL enterprise target must set WAF_PROVIDER or CLOSR_WAF_CONFIRMED=1');
    failures += 1;
  }

  if (!process.env.UPTIME_MONITOR_URL && !process.env.CLOSR_MONITORING_CONFIRMED) {
    console.error('FAIL enterprise target must set UPTIME_MONITOR_URL or CLOSR_MONITORING_CONFIRMED=1');
    failures += 1;
  }
}

if (failures > 0) {
  console.error('\nProduction controls verification failed: ' + failures + ' issue(s).');
  process.exit(1);
}

console.log('\nProduction controls verification passed.');
