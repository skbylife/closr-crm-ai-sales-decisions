import { describe, expect, it } from 'vitest';

import {
  buildEnvReadinessChecks,
  buildLicenseSnapshot,
  checkModuleEntitlement,
  isLicenseExpired,
  summarizeReadiness,
} from '@/lib/self-hosted-readiness';

describe('self-hosted readiness', () => {
  it('builds offline license snapshots from env without online billing', () => {
    const snapshot = buildLicenseSnapshot({
      CLOSR_LICENSE_KEY: 'license-local',
      CLOSR_LICENSE_PLAN: 'enterprise',
      CLOSR_LICENSE_MAX_SEATS: '25',
      CLOSR_LICENSE_MODULES: 'judgment,evidence,admin',
      CLOSR_LICENSE_EXPIRES_AT: '2027-01-01',
    } as unknown as NodeJS.ProcessEnv);

    expect(snapshot).toEqual({
      mode: 'offline',
      plan: 'enterprise',
      seats: 25,
      modules: ['judgment', 'evidence', 'admin'],
      expiresAt: '2027-01-01',
    });
  });

  it('flags missing critical deployment env while keeping optional checks manual', () => {
    const checks = buildEnvReadinessChecks({} as unknown as NodeJS.ProcessEnv);

    expect(checks.find((check) => check.id === 'env:supabase-public')).toMatchObject({ status: 'fail' });
    expect(checks.find((check) => check.id === 'env:supabase-service')).toMatchObject({ status: 'fail' });
    expect(checks.find((check) => check.id === 'env:mail-ingress')).toMatchObject({ status: 'manual' });
  });

  it('checks offline module entitlement without requiring online billing', () => {
    const env = {
      CLOSR_LICENSE_KEY: 'license-local',
      CLOSR_LICENSE_PLAN: 'enterprise',
      CLOSR_LICENSE_MODULES: 'judgment,evidence',
      CLOSR_LICENSE_EXPIRES_AT: '2027-01-01',
    } as unknown as NodeJS.ProcessEnv;

    expect(checkModuleEntitlement('judgment', env, new Date('2026-01-01'))).toMatchObject({ enabled: true });
    expect(checkModuleEntitlement('integrations', env, new Date('2026-01-01'))).toMatchObject({ enabled: false });
    expect(isLicenseExpired(buildLicenseSnapshot(env), new Date('2028-01-01'))).toBe(true);
  });

  it('summarizes failure before warning and manual states', () => {
    const summary = summarizeReadiness([
      { id: 'a', phase: 'P0', label: 'a', status: 'pass', detail: 'ok' },
      { id: 'b', phase: 'P1', label: 'b', status: 'manual', detail: 'manual' },
      { id: 'c', phase: 'P2', label: 'c', status: 'warn', detail: 'warn' },
      { id: 'd', phase: 'P3', label: 'd', status: 'fail', detail: 'fail' },
    ]);

    expect(summary).toMatchObject({ overall: 'fail', pass: 1, manual: 1, warn: 1, fail: 1 });
  });
  it('recognizes native PostgreSQL without requiring any Supabase credentials', () => {
    const checks = buildEnvReadinessChecks({
      NODE_ENV: 'test', CLOSR_DATABASE_BACKEND: 'postgres', NEXT_PUBLIC_CLOSR_DATABASE_BACKEND: 'postgres',
      DATABASE_URL: 'postgresql://EXAMPLE_USER:EXAMPLE_PASSWORD@db.example.invalid/closr',
      CLOSR_STORAGE_DIR: '/data/attachments', CLOSR_DATA_DIR: '/data/closr',
    });
    expect(checks.some(check => check.id.startsWith('env:supabase'))).toBe(false);
    expect(checks.find(check => check.id === 'env:database-url')).toMatchObject({ status: 'pass' });
    expect(checks.find(check => check.id === 'env:native-auth')).toMatchObject({ status: 'manual' });
    expect(checks.find(check => check.id === 'env:native-storage')).toMatchObject({ status: 'manual' });
    expect(JSON.stringify(checks)).not.toContain('EXAMPLE_PASSWORD');
  });

  it('fails native configuration missing DATABASE_URL instead of accepting a legacy fallback', () => {
    const checks = buildEnvReadinessChecks({ NODE_ENV: 'test', CLOSR_DATABASE_BACKEND: 'postgres', SUPABASE_DB_URL: 'postgresql://example.invalid/legacy' });
    expect(checks.find(check => check.id === 'env:database-url')).toMatchObject({ status: 'fail' });
    expect(checks.find(check => check.id === 'env:database-backend')).toMatchObject({ status: 'warn' });
    const invalid = buildEnvReadinessChecks({ NODE_ENV: 'test', CLOSR_DATABASE_BACKEND: 'postgres', DATABASE_URL: 'https://example.invalid' });
    expect(invalid.find(check => check.id === 'env:database-url')).toMatchObject({ status: 'fail' });
  });

});
