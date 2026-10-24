import { describe, expect, it } from 'vitest';

import { buildLeadInsert, buildLeadPatch, rowToLead, type LeadRow } from './leads';

describe('lead persistence helpers', () => {
  it('validates required lead intake fields and normalizes defaults', () => {
    expect(buildLeadInsert({}, { orgId: 'org_1', userId: 'user_1' })).toEqual({ error: '公司必填' });

    const built = buildLeadInsert({
      companyName: '  Target  ',
      contactName: '  Amanda  ',
      need: '  ESL pilot  ',
      estimatedValue: '120000',
      ownerId: '',
      priority: 'urgent',
      currency: 'GBP',
    }, { orgId: 'org_1', userId: 'user_1' });

    expect('row' in built ? built.row : null).toMatchObject({
      org_id: 'org_1',
      user_id: 'user_1',
      owner_id: 'user_1',
      company_name: 'Target',
      contact_name: 'Amanda',
      need: 'ESL pilot',
      estimated_value: 120000,
      priority: 'medium',
      currency: 'GBP',
      status: 'new',
    });
  });

  it('falls back to CNY for unsupported currencies', () => {
    const built = buildLeadInsert({
      companyName: 'Target',
      contactName: 'Amanda',
      need: 'Pilot',
      currency: 'BTC',
    }, { orgId: 'org_1', userId: 'user_1' });

    expect('row' in built && built.row ? built.row.currency : null).toBe('CNY');
  });

  it('builds safe patches and rejects blank required fields', () => {
    expect(buildLeadPatch({ companyName: '   ' })).toEqual({ error: '公司必填' });
    expect(buildLeadPatch({ status: 'qualified', estimatedValue: '9000', nextStep: '' }).row).toMatchObject({
      status: 'qualified',
      estimated_value: 9000,
      next_step: null,
    });
  });

  it('maps database rows to SalesLead shape', () => {
    const row: LeadRow = {
      id: 'lead_1',
      org_id: 'org_1',
      user_id: 'user_1',
      owner_id: 'owner_1',
      company_name: 'Target',
      contact_name: 'Amanda',
      email: 'a@example.com',
      phone: null,
      title: 'VP',
      source: 'event',
      need: 'Pilot',
      estimated_value: '3000',
      currency: 'USD',
      priority: 'high',
      status: 'converted',
      next_step: null,
      notes: 'note',
      converted_at: '2026-06-11T20:00:00.000Z',
      converted_account_id: 'acc_1',
      converted_contact_id: 'con_1',
      converted_opportunity_id: 'opp_1',
      created_at: '2026-06-11T19:00:00.000Z',
      updated_at: '2026-06-11T20:00:00.000Z',
    };

    expect(rowToLead(row)).toMatchObject({
      id: 'lead_1',
      companyName: 'Target',
      contactName: 'Amanda',
      estimatedValue: 3000,
      convertedOpportunityId: 'opp_1',
    });
  });
});
