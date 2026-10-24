// Stage Gate Rules — 阶段推进条件检查
// 每个阶段定义必须满足的条件，不满足则警告/阻止

import type { Opportunity, Contact } from '@/lib/babel-engine/types';

export interface GateCheckResult {
  canProceed: boolean;
  warnings: string[];
  blockers: string[];
}

interface GateRule {
  check: (opp: Opportunity, contacts: Contact[]) => { pass: boolean; message: string };
  severity: 'blocker' | 'warning';
}

const STAGE_GATES: Record<string, GateRule[]> = {
  discovery: [
    {
      check: (_opp, contacts) => ({
        pass: contacts.length >= 1,
        message: '需要至少 1 个联系人',
      }),
      severity: 'blocker',
    },
  ],
  solution_presented: [
    {
      check: (_opp, contacts) => ({
        pass: contacts.some(c => c.role === 'champion'),
        message: '需要至少 1 个 Champion',
      }),
      severity: 'warning',
    },
    {
      check: (opp) => ({
        pass: (opp.meddicc?.identifiedPain?.length ?? 0) > 0,
        message: 'MEDDICC: 至少识别 1 个痛点',
      }),
      severity: 'warning',
    },
  ],
  proposal_sent: [
    {
      check: (opp) => ({
        pass: (opp.value ?? 0) > 0,
        message: '交易金额必须填写',
      }),
      severity: 'blocker',
    },
    {
      check: (opp) => ({
        pass: (opp.meddicc?.decisionCriteria?.length ?? 0) > 0,
        message: 'MEDDICC: 至少 1 条决策标准',
      }),
      severity: 'warning',
    },
  ],
  negotiation: [
    {
      check: (_opp, contacts) => ({
        pass: contacts.some(c => c.role === 'decision_maker'),
        message: '需要识别 Economic Buyer / 决策者',
      }),
      severity: 'blocker',
    },
    {
      check: (opp) => ({
        pass: (opp.meddicc?.overallScore ?? 0) >= 30,
        message: 'MEDDICC 评分需要 ≥ 30',
      }),
      severity: 'warning',
    },
  ],
  contract_review: [
    {
      check: (opp) => ({
        pass: (opp.meddicc?.overallScore ?? 0) >= 50,
        message: 'MEDDICC 评分需要 ≥ 50',
      }),
      severity: 'warning',
    },
    {
      check: (opp) => ({
        pass: (opp.mutualActionPlan?.milestones?.length ?? 0) >= 3,
        message: 'MAP 需要至少 3 个里程碑',
      }),
      severity: 'warning',
    },
  ],
  closed_won: [
    {
      check: (opp) => ({
        pass: (opp.meddicc?.overallScore ?? 0) >= 60,
        message: 'MEDDICC 评分需要 ≥ 60',
      }),
      severity: 'warning',
    },
  ],
  closed_lost: [
    {
      check: (opp) => ({
        pass: !!opp.lostReason && opp.lostReason.trim().length > 0,
        message: '丢单原因必须填写',
      }),
      severity: 'blocker',
    },
  ],
};

export function checkStageGate(
  targetStage: string,
  opportunity: Opportunity,
  contacts: Contact[],
): GateCheckResult {
  const rules = STAGE_GATES[targetStage] ?? [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  for (const rule of rules) {
    const result = rule.check(opportunity, contacts);
    if (!result.pass) {
      if (rule.severity === 'blocker') {
        blockers.push(result.message);
      } else {
        warnings.push(result.message);
      }
    }
  }

  return {
    canProceed: blockers.length === 0,
    warnings,
    blockers,
  };
}
