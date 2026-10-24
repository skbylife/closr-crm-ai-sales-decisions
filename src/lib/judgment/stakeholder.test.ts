import { describe, expect, it } from 'vitest';
import { buildStakeholderInterpretations, type StakeholderContactInput, type StakeholderMemoryInput } from './stakeholder';

const NOW = '2026-04-30T20:00:00.000Z';

function contact(overrides: Partial<StakeholderContactInput> = {}): StakeholderContactInput {
  return {
    id: 'c_1',
    name: 'Ada Chen',
    title: 'Director of Operations',
    role: 'champion',
    relationship_strength: 72,
    updated_at: NOW,
    ...overrides,
  };
}

function memory(overrides: Partial<StakeholderMemoryInput> = {}): StakeholderMemoryInput {
  return {
    sourceKind: 'decode',
    sourceId: 'decode_1',
    title: 'Decode · Ada Chen',
    currentJudgment: 'Ada Chen 支持推进并愿意帮忙牵头内部评审。',
    risk: '仍需确认 CFO 是否认可 ROI。',
    nextAction: '请 Ada 补全内部决策地图。',
    confidence: 0.72,
    uncertainty: '',
    provisional: false,
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'Ada 邮件' }],
    updatedAt: NOW,
    ...overrides,
  };
}

describe('buildStakeholderInterpretations', () => {
  it('identifies a champion with supportive stance and close relationship', () => {
    const result = buildStakeholderInterpretations({
      contacts: [contact()],
      judgmentMemories: [memory()],
      updatedAt: NOW,
    });

    expect(result[0]).toMatchObject({
      contactId: 'c_1',
      name: 'Ada Chen',
      role: 'champion',
      stance: 'supportive',
      relationshipDistance: 'close',
    });
    expect(result[0].nextAction).toContain('Ada');
    expect(result[0].evidenceRefs).toHaveLength(1);
  });

  it('identifies a blocker without flattening resistant evidence into generic risk', () => {
    const result = buildStakeholderInterpretations({
      contacts: [contact({ id: 'c_blocker', name: 'Bob Li', title: 'Procurement Lead', role: 'blocker', relationship_strength: 20 })],
      judgmentMemories: [memory({
        sourceId: 'decode_blocker',
        title: 'Decode · Bob Li',
        currentJudgment: 'Bob Li 反对当前报价，采购持续压价。',
        risk: '采购可能阻碍推进。',
        nextAction: '',
      })],
      updatedAt: NOW,
    });

    expect(result[0].role).toBe('blocker');
    expect(result[0].stance).toBe('resistant');
    expect(result[0].relationshipDistance).toBe('distant');
    expect(result[0].nextAction).toContain('反对点');
  });

  it('identifies evaluator, decision maker, and sponsor roles from CRM fields and titles', () => {
    const result = buildStakeholderInterpretations({
      contacts: [
        contact({ id: 'c_eval', name: 'Evan Wang', title: 'IT Security Architect', role: 'technical_evaluator', relationship_strength: 45 }),
        contact({ id: 'c_dm', name: 'Dana Smith', title: 'CFO', role: 'economic_buyer', relationship_strength: 50 }),
        contact({ id: 'c_sponsor', name: 'Sara Park', title: 'Executive Sponsor / COO', role: 'executive_sponsor', relationship_strength: 80 }),
      ],
      updatedAt: NOW,
    });

    expect(result.find((item) => item.contactId === 'c_eval')?.role).toBe('evaluator');
    expect(result.find((item) => item.contactId === 'c_dm')?.role).toBe('decision_maker');
    expect(result.find((item) => item.contactId === 'c_sponsor')?.role).toBe('sponsor');
  });

  it('keeps unknown/provisional when evidence is thin', () => {
    const result = buildStakeholderInterpretations({
      contacts: [contact({ id: 'c_unknown', name: 'Unknown Person', title: '', role: 'contact', relationship_strength: undefined })],
      updatedAt: NOW,
    });

    expect(result[0].role).toBe('unknown');
    expect(result[0].stance).toBe('unknown');
    expect(result[0].provisional).toBe(true);
    expect(result[0].uncertainty).toContain('角色');
  });

  it('preserves contradictory stance as mixed with uncertainty', () => {
    const result = buildStakeholderInterpretations({
      contacts: [contact({ id: 'c_mixed', name: 'Mina Zhao', role: 'champion', relationship_strength: 65 })],
      judgmentMemories: [
        memory({ sourceId: 'positive_1', title: 'Decode · Mina Zhao', currentJudgment: 'Mina Zhao 支持推进 Demo。', risk: '', evidenceRefs: [{ sourceId: 'positive_1', sourceKind: 'email_decode' }] }),
        memory({ sourceKind: 'rfp_analysis', sourceId: 'risk_1', title: 'RFP · Mina Zhao', currentJudgment: 'Mina Zhao 也担心预算冻结。', risk: '预算冻结风险，可能阻碍采购。', evidenceRefs: [{ sourceId: 'risk_1', sourceKind: 'source_record' }] }),
      ],
      updatedAt: NOW,
    });

    expect(result[0].stance).toBe('mixed');
    expect(result[0].uncertainty).toContain('支持与阻碍信号并存');
    expect(result[0].uncertainty).not.toContain('mixed');
    expect(result[0].provisional).toBe(true);
  });

  it('survives dirty data and skips unusable rows', () => {
    const result = buildStakeholderInterpretations({
      contacts: [
        { id: 123, name: null, role: 'not_a_role', relationship_strength: Number.NaN },
        contact({ id: 'clean', name: 'Clean User', role: 'contact' }),
      ],
      judgmentMemories: [
        { sourceKind: 'decode', sourceId: 123, confidence: Number.NaN, evidenceRefs: [{ sourceId: '', sourceKind: 'bad' }] },
      ],
      recentActivities: [{ id: 'dirty_activity', sourceKind: 'bad_kind', title: null, summary: 'Clean User 未回复，关系冷淡', signal: 'risk' }],
      updatedAt: NOW,
    });

    expect(result).toHaveLength(1);
    expect(result[0].contactId).toBe('clean');
    expect(result[0].name).toBe('Clean User');
  });

  it('deduplicates evidence refs', () => {
    const result = buildStakeholderInterpretations({
      contacts: [contact()],
      judgmentMemories: [memory({ evidenceRefs: [
        { sourceId: 'decode_1', sourceKind: 'email_decode', title: 'Ada 邮件' },
        { sourceId: 'decode_1', sourceKind: 'email_decode', title: '重复 Ada 邮件' },
      ] })],
      updatedAt: NOW,
    });

    expect(result[0].evidenceRefs.filter((ref) => ref.sourceId === 'decode_1')).toHaveLength(1);
  });

  it('uses summary people as first-class stakeholder interpretation input', () => {
    const result = buildStakeholderInterpretations({
      summaryPeople: [{
        contactId: 'person_1',
        name: 'Grace Kim',
        title: 'VP Sales',
        influenceLabel: '高管支持者',
        stance: 'supportive',
        summary: 'Grace Kim 是高层 sponsor，但具体预算口径待验证。',
        sourceIds: ['source_1', 'source_1'],
      }],
      updatedAt: NOW,
    });

    expect(result[0].role).toBe('sponsor');
    expect(result[0].stance).toBe('supportive');
    expect(result[0].evidenceRefs).toHaveLength(1);
    expect(result[0].uncertainty).toBeTruthy();
  });
});
