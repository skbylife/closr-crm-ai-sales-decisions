import type { PortfolioJudgmentSignal } from '@/lib/judgment/portfolio-view';
import type { JudgmentInterventionAction, JudgmentInterventionType } from '@/lib/judgment/intervention';

export type PortfolioInterventionRole = 'manager' | 'executive';

export interface PortfolioInterventionActionOption {
  label: string;
  type: JudgmentInterventionType;
  action: JudgmentInterventionAction;
  defaultStatus: 'planned' | 'completed';
}

export function getPortfolioInterventionActionOptions(role: PortfolioInterventionRole, signal: Pick<PortfolioJudgmentSignal, 'kind'>): PortfolioInterventionActionOption[] {
  if (role === 'manager') {
    return [
      { label: '记录核验证据', type: 'manager_intervention', action: 'verify_evidence', defaultStatus: 'completed' },
      { label: '辅导介入', type: 'manager_intervention', action: 'coach_ae', defaultStatus: signal.kind === 'coaching_candidate' ? 'planned' : 'completed' },
    ];
  }

  if (signal.kind === 'manager_verify') {
    return [
      { label: '请求复盘', type: 'manager_intervention', action: 'request_review', defaultStatus: 'planned' },
    ];
  }

  return [
    { label: '记录高层介入', type: 'executive_intervention', action: 'intervene', defaultStatus: 'planned' },
    { label: '指派高层负责人', type: 'executive_intervention', action: 'assign_sponsor', defaultStatus: 'planned' },
  ];
}
