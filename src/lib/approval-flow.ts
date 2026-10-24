// Approval Flow — 审批流规则
// 定义什么操作需要审批，谁可以审批

export type ApprovalType = 'discount' | 'large_deal' | 'stage_skip';

export interface ApprovalRule {
  type: ApprovalType;
  label: string;
  condition: (context: Record<string, unknown>) => boolean;
  requiredRole: 'manager' | 'admin' | 'owner';
}

export const APPROVAL_RULES: ApprovalRule[] = [
  {
    type: 'discount',
    label: '折扣审批',
    condition: (ctx) => {
      const discount = ctx.discount as number | undefined;
      return !!discount && discount > 15;
    },
    requiredRole: 'manager',
  },
  {
    type: 'large_deal',
    label: '大单审批',
    condition: (ctx) => {
      const value = ctx.dealValue as number | undefined;
      return !!value && value > 500000;
    },
    requiredRole: 'admin',
  },
  {
    type: 'stage_skip',
    label: '跨阶段推进审批',
    condition: (ctx) => {
      const skip = ctx.stageSkip as number | undefined;
      return !!skip && skip > 1;
    },
    requiredRole: 'manager',
  },
];

export function checkApprovalRequired(
  type: ApprovalType,
  context: Record<string, unknown>,
): { required: boolean; rule?: ApprovalRule } {
  const rule = APPROVAL_RULES.find(r => r.type === type);
  if (!rule) return { required: false };
  return { required: rule.condition(context), rule };
}
