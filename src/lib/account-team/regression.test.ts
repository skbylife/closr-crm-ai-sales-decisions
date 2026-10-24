import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

describe('account team P0 regressions', () => {
  it('does not make business_team_id part of account visibility filtering', () => {
    const db = readFileSync(join(root, 'src/lib/db.ts'), 'utf8');
    expect(db).toContain('business_team_id');
    expect(db).toContain('owner_id.in.');
    expect(db).not.toMatch(/business_team_id\.in|business_team_id\.eq|owner_id\.in\.\([^`]+business_team_id/);
  });

  it('does not clear business team or pursuit team data during account transfer', () => {
    const transferRoute = readFileSync(join(root, 'src/app/api/accounts/transfer/route.ts'), 'utf8');
    expect(transferRoute).not.toContain('business_team_id');
    expect(transferRoute).not.toContain('pursuit_teams');
    expect(transferRoute).toContain(".from('accounts')");
    expect(transferRoute).toContain('owner_id');
    expect(transferRoute).toContain('user_id');
  });
});
