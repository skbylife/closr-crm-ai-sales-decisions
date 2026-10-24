import { describe, expect, it } from 'vitest';
import { getPortfolioInterventionActionOptions } from './portfolio-intervention-actions';

describe('getPortfolioInterventionActionOptions', () => {
  it('exposes manager write-back actions for manager signals', () => {
    const options = getPortfolioInterventionActionOptions('manager', { kind: 'coaching_candidate' });

    expect(options).toEqual([
      { label: '记录核验证据', type: 'manager_intervention', action: 'verify_evidence', defaultStatus: 'completed' },
      { label: '辅导介入', type: 'manager_intervention', action: 'coach_ae', defaultStatus: 'planned' },
    ]);
  });

  it('exposes executive sponsor actions for executive candidates', () => {
    const options = getPortfolioInterventionActionOptions('executive', { kind: 'executive_intervention' });

    expect(options.map((option) => option.action)).toEqual(['intervene', 'assign_sponsor']);
    expect(options.every((option) => option.type === 'executive_intervention')).toBe(true);
  });

  it('keeps executive non-intervention cards as manager review write-back', () => {
    const options = getPortfolioInterventionActionOptions('executive', { kind: 'manager_verify' });

    expect(options).toEqual([
      { label: '请求复盘', type: 'manager_intervention', action: 'request_review', defaultStatus: 'planned' },
    ]);
  });
});
