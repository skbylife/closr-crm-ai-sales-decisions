import { describe, expect, it } from 'vitest';
import { externalAdvisorRoleLabel, isExternalAdvisorRole } from './external-advisor';

describe('external advisor role helpers', () => {
  it('treats advisor and consultant roles as external influence nodes', () => {
    expect(isExternalAdvisorRole('external_advisor')).toBe(true);
    expect(isExternalAdvisorRole('consultant')).toBe(true);
    expect(isExternalAdvisorRole('channel_influencer')).toBe(true);
    expect(isExternalAdvisorRole('champion')).toBe(false);
  });

  it('keeps role labels separate from internal team membership', () => {
    expect(externalAdvisorRoleLabel('external_advisor')).toBe('外部顾问');
    expect(externalAdvisorRoleLabel('consultant')).toBe('咨询顾问');
    expect(externalAdvisorRoleLabel('channel_influencer')).toBe('渠道影响者');
    expect(externalAdvisorRoleLabel(null)).toBe('外部影响者');
  });
});
