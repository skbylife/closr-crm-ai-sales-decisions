import { describe, expect, it } from 'vitest';
import {
  buildEngineJudgmentSnapshot,
  validateEngineSourceRecord,
  type EngineSourceRecord,
} from './schema';

const source: EngineSourceRecord = {
  id: 'src_renewal_001',
  tenantId: 'tenant_demo',
  sourceType: 'email',
  externalSourceId: 'email_123',
  accountId: 'acct_customer_a',
  opportunityId: 'opp_aiops_renewal',
  contactIds: ['contact_procurement'],
  occurredAt: '2026-06-18T12:00:00.000Z',
  author: {
    side: 'customer',
    name: '采购负责人',
    email: 'buyer@example.com',
  },
  content: '今年集团有 5% 年降目标，TCS 报价更低。CFO 需要看到 AIOps 一年回本证明后再进入预算评审。',
  metadata: {
    externalUrl: 'https://crm.example.com/activity/123',
  },
};

describe('Closr Judgment Engine schema', () => {
  it('validates source records at the engine trust boundary', () => {
    const result = validateEngineSourceRecord(source);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tenantId).toBe('tenant_demo');
      expect(result.value.sourceType).toBe('email');
      expect(result.value.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('rejects source records without tenant or content/hash evidence', () => {
    const result = validateEngineSourceRecord({
      ...source,
      tenantId: '',
      content: '',
      contentHash: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('tenantId is required');
      expect(result.errors).toContain('content or contentHash is required');
    }
  });

  it('builds an evidence-backed judgment snapshot without mutating CRM source-of-truth fields', () => {
    const snapshot = buildEngineJudgmentSnapshot({
      tenantId: 'tenant_demo',
      accountId: 'acct_customer_a',
      opportunityId: 'opp_aiops_renewal',
      sources: [source],
    });

    expect(snapshot.schemaVersion).toBe('closr_judgment_engine_v1');
    expect(snapshot.accountId).toBe('acct_customer_a');
    expect(snapshot.opportunityId).toBe('opp_aiops_renewal');
    expect(snapshot.judgmentSummary.primaryRisk).toBe('finance/procurement blocker');
    expect(snapshot.judgmentSummary.momentum).toBe('cooling');
    expect(snapshot.judgments[0].supportEvidenceIds.length).toBeGreaterThan(0);
    expect(snapshot.winGaps[0].linkedJudgmentIds).toContain(snapshot.judgments[0].id);
    expect(snapshot.moves[0].winGapId).toBe(snapshot.winGaps[0].id);
    expect(snapshot.writebackPolicy.mode).toBe('proposal_only');
    expect(snapshot.writebackPolicy.prohibitedFields).toContain('opportunity.stage');
    expect(snapshot.crmFieldUpdates).toEqual([]);
  });

  it('keeps high-impact judgments below high confidence when evidence is missing', () => {
    const snapshot = buildEngineJudgmentSnapshot({
      tenantId: 'tenant_demo',
      accountId: 'acct_customer_a',
      opportunityId: 'opp_aiops_renewal',
      sources: [
        {
          ...source,
          id: 'src_weak_001',
          content: '客户说后续再看看。',
        },
      ],
    });

    expect(snapshot.judgments[0].impact).toBe('high');
    expect(snapshot.judgments[0].confidence).toBeLessThanOrEqual(0.65);
    expect(snapshot.judgments[0].missingEvidence).toContain('direct finance/procurement confirmation');
  });
});
