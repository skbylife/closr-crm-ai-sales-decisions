import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

describe('engine API smoke scripts', () => {
  it('ships a dedicated route-level smoke command for the derivative engine API', () => {
    const scriptPath = join(repoRoot, 'scripts/smoke-engine-api.mjs');
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts?.['smoke:engine-api']).toBe('node scripts/smoke-engine-api.mjs');

    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toContain('src/app/api/engine/judgment/snapshot/route.test.ts');
    expect(script).toContain('persist=false');
    expect(script).toContain('persist=true');
  });

  it('ships a real HTTP smoke command that refuses to persist snapshots', () => {
    const scriptPath = join(repoRoot, 'scripts/smoke-engine-http.mjs');
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts?.['smoke:engine-http']).toBe('node scripts/smoke-engine-http.mjs');

    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toContain('/api/engine/judgment/snapshot');
    expect(script).toContain('fetch(');
    expect(script).toContain('next');
    expect(script).toContain('start');
    expect(script).toContain('persist: false');
    expect(script).toContain('requestBody.persist === false');
    expect(script).not.toContain('persist: true');
    expect(script).not.toContain('persist=true');
    expect(script).toContain('writebackPolicy');
    expect(script).toContain('proposal_only');
    expect(script).toContain('crmFieldUpdates');
    expect(script).toContain('persistence?.persisted === false');
    expect(script).toContain('DATABASE_URL');
    expect(script).toContain('SUPABASE_DB_URL');
    expect(script).toContain('renewal-expansion');
    expect(script).toContain('security-review');
    expect(script).toContain('rfp-tender');
  });
});
