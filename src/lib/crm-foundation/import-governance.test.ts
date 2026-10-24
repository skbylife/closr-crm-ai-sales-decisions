import { describe, expect, it } from 'vitest';
import type { Account } from '@/lib/babel-engine/types';
import { buildImportGovernanceModel, buildMergePlan } from './import-governance';

const accounts = [
  {
    id: 'a1',
    name: 'Northstar Foods',
    website: 'www.northstarfoods.example',
    contacts: [
      {
        id: 'c1',
        name: 'Julia Chen',
        email: 'julia.chen@northstarfoods.example',
        title: 'VP Store Operations',
        role: 'champion',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
    opportunityIds: [],
    createdAt: '2026-06-01T00:00:00.000Z',
  },
] as Account[];

describe('buildImportGovernanceModel', () => {
  it('detects account duplicates by website and marks them as conflicts', () => {
    const model = buildImportGovernanceModel({
      type: 'accounts',
      accounts,
      fields: [
        { key: 'name', label: '公司名称', required: true },
        { key: 'website', label: '网站', required: false },
      ],
      mapping: { name: 'Company', website: 'Website' },
      rows: [
        { rowIndex: 0, values: { Company: 'Northstar Foods Inc.', Website: 'https://northstarfoods.example/' } },
      ],
    });

    expect(model.counts.conflict).toBe(1);
    expect(model.duplicates[0]).toMatchObject({
      existingName: 'Northstar Foods',
      matchType: 'website',
      confidence: 'high',
    });
  });

  it('detects contact duplicates by email', () => {
    const model = buildImportGovernanceModel({
      type: 'contacts',
      accounts,
      fields: [
        { key: 'name', label: '姓名', required: true },
        { key: 'company', label: '公司名称', required: true },
        { key: 'email', label: '邮箱', required: false },
      ],
      mapping: { name: 'Name', company: 'Company', email: 'Email' },
      rows: [
        { rowIndex: 0, values: { Name: 'Julia Chen', Company: 'Northstar Foods', Email: 'julia.chen@northstarfoods.example' } },
      ],
    });

    expect(model.counts.conflict).toBe(1);
    expect(model.duplicates[0]).toMatchObject({
      matchType: 'email',
      existingName: 'Julia Chen · Northstar Foods',
    });
  });

  it('skips rows with missing required fields and reports quality findings', () => {
    const model = buildImportGovernanceModel({
      type: 'contacts',
      accounts: [],
      fields: [
        { key: 'name', label: '姓名', required: true },
        { key: 'company', label: '公司名称', required: true },
        { key: 'email', label: '邮箱', required: false },
      ],
      mapping: { name: 'Name', company: 'Company', email: 'Email' },
      rows: [
        { rowIndex: 0, values: { Name: '', Company: 'NewCo', Email: 'bad-email' } },
      ],
    });

    expect(model.counts.skip).toBe(1);
    expect(model.findings.map((finding) => finding.label)).toContain('姓名 缺失');
    expect(model.findings.map((finding) => finding.label)).toContain('邮箱格式异常');
  });

  it('supports lead imports and detects possible existing customer/contact matches', () => {
    const model = buildImportGovernanceModel({
      type: 'leads',
      accounts,
      fields: [
        { key: 'companyName', label: '公司名称', required: true },
        { key: 'contactName', label: '联系人', required: true },
        { key: 'email', label: '邮箱', required: false },
        { key: 'need', label: '需求', required: true },
      ],
      mapping: { companyName: 'Company', contactName: 'Name', email: 'Email', need: 'Need' },
      rows: [
        {
          rowIndex: 0,
          values: {
            Company: 'Northstar Foods',
            Name: 'Julia Chen',
            Email: 'julia.chen@northstarfoods.example',
            Need: 'Regional rollout evaluation',
          },
        },
      ],
    });

    expect(model.counts.conflict).toBe(1);
    expect(model.duplicates[0]).toMatchObject({
      matchType: 'email',
      existingName: 'Julia Chen · Northstar Foods',
    });
    expect(model.previewRows[0].displayName).toBe('Northstar Foods');
  });
});

describe('buildMergePlan', () => {
  it('fills empty contact fields without overwriting existing values', () => {
    const plan = buildMergePlan({
      type: 'contacts',
      existingId: 'c1',
      incoming: {
        email: 'julia.chen@northstarfoods.example',
        phone: '+1 555 0101',
        title: 'VP Store Operations',
        role: 'champion',
        notes: 'Prefers concise operational proof.',
        name: 'Different Name',
      },
      existing: {
        email: 'julia.chen@northstarfoods.example',
        phone: '',
        title: null,
        role: 'economic_buyer',
        personal_notes: undefined,
      },
    });

    expect(plan.updates).toEqual({
      phone: '+1 555 0101',
      title: 'VP Store Operations',
      personal_notes: 'Prefers concise operational proof.',
    });
    expect(plan.filled).toEqual(['phone', 'title', 'personal_notes']);
    expect(plan.conflicts).toEqual([
      {
        field: 'role',
        existingValue: 'economic_buyer',
        incomingValue: 'champion',
      },
    ]);
    expect(plan.updates).not.toHaveProperty('name');
  });

  it('keeps existing account values when incoming values conflict', () => {
    const plan = buildMergePlan({
      type: 'accounts',
      existingId: 'a1',
      incoming: {
        name: 'Northstar Foods China',
        industry: 'Retail',
        website: 'https://northstarfoods.example',
        notes: 'Imported CRM note',
      },
      existing: {
        name: 'Northstar Foods',
        industry: 'Food Service',
        website: 'www.northstarfoods.example',
        notes: 'Existing note',
      },
    });

    expect(plan.updates).toEqual({});
    expect(plan.conflicts.map((conflict) => conflict.field)).toEqual(['industry', 'website', 'notes']);
  });

  it('only merges whitelisted account fields', () => {
    const plan = buildMergePlan({
      type: 'accounts',
      existingId: 'a1',
      incoming: {
        owner_id: 'other-user',
        annual_revenue: '1000000',
        industry: 'Retail',
      },
      existing: {
        industry: '',
      },
    });

    expect(plan.updates).toEqual({ industry: 'Retail' });
    expect(plan.updates).not.toHaveProperty('owner_id');
    expect(plan.updates).not.toHaveProperty('annual_revenue');
  });

  it('rejects an empty existing id', () => {
    expect(() => buildMergePlan({
      type: 'contacts',
      existingId: ' ',
      incoming: { email: 'julia@example.com' },
      existing: {},
    })).toThrow('existingId is required');
  });
});
