import { describe, expect, it } from 'vitest';
import { buildOrganizationSlug } from './db-server';

describe('buildOrganizationSlug', () => {
  it('keeps ascii org names readable and appends a uniqueness suffix', () => {
    expect(buildOrganizationSlug('Acme Corp 销售团队', 'abc12345')).toBe('acme-corp-abc12345');
  });

  it('uses a non-empty fallback for Chinese-only org names', () => {
    expect(buildOrganizationSlug('华东智造集团', '9f8e7d6c')).toBe('org-9f8e7d6c');
  });

  it('normalizes duplicate display names with different suffixes to different slugs', () => {
    expect(buildOrganizationSlug('Acme', 'aaa111')).toBe('acme-aaa111');
    expect(buildOrganizationSlug('Acme', 'bbb222')).toBe('acme-bbb222');
  });
});
