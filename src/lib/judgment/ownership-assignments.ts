import { ApiError } from '@/lib/api-guard';

export const JUDGMENT_OWNERSHIP_TYPES = [
  'account_strategy',
  'opportunity_forecast',
  'strategic_play',
  'relationship_coverage',
  'evidence_verification',
  'calibration_review',
] as const;

export const JUDGMENT_OWNERSHIP_SOURCES = [
  'manual',
  'management_queue',
  'strategic_play',
  'decode_signal',
  'rfp_signal',
] as const;

export type JudgmentOwnershipType = typeof JUDGMENT_OWNERSHIP_TYPES[number];
export type JudgmentOwnershipSource = typeof JUDGMENT_OWNERSHIP_SOURCES[number];
export type JudgmentOwnershipStatus = 'active' | 'completed' | 'revoked';

export type JudgmentOwnershipAssignmentRow = {
  id: string;
  org_id: string;
  account_id: string;
  opportunity_id: string | null;
  strategic_play_id: string | null;
  judgment_type: JudgmentOwnershipType;
  assigned_user_id: string;
  assigned_by: string | null;
  status: JudgmentOwnershipStatus;
  source: JudgmentOwnershipSource;
  reason: string | null;
  due_at: string | null;
  completed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type JudgmentOwnershipAssignment = {
  id: string;
  accountId: string;
  opportunityId: string | null;
  strategicPlayId: string | null;
  judgmentType: JudgmentOwnershipType;
  assignedUserId: string;
  assignedBy: string | null;
  status: JudgmentOwnershipStatus;
  source: JudgmentOwnershipSource;
  reason: string | null;
  dueAt: string | null;
  completedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type CreateJudgmentOwnershipAssignmentInput = {
  accountId: string;
  opportunityId?: string | null;
  strategicPlayId?: string | null;
  judgmentType: JudgmentOwnershipType;
  assignedUserId: string;
  source: JudgmentOwnershipSource;
  reason?: string | null;
  dueAt?: string | null;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseOptionalString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isNonEmptyString(value)) throw new ApiError(400, field + ' 必须是非空字符串或 null');
  return value.trim();
}

function parseEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (!isNonEmptyString(value) || !values.includes(value.trim() as T)) {
    throw new ApiError(400, field + ' 无效');
  }
  return value.trim() as T;
}

export function parseCreateJudgmentOwnershipAssignmentInput(value: unknown): CreateJudgmentOwnershipAssignmentInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(400, '请求体无效');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'orgId')) {
    throw new ApiError(400, 'orgId 由登录上下文推导，不能由客户端传入');
  }

  const input = value as Record<string, unknown>;
  if (!isNonEmptyString(input.accountId)) throw new ApiError(400, 'accountId 必须是非空字符串');
  if (!isNonEmptyString(input.assignedUserId)) throw new ApiError(400, 'assignedUserId 必须是非空字符串');

  const dueAt = parseOptionalString(input.dueAt, 'dueAt') ?? null;
  if (dueAt && Number.isNaN(new Date(dueAt).getTime())) {
    throw new ApiError(400, 'dueAt 必须是有效时间');
  }

  return {
    accountId: input.accountId.trim(),
    opportunityId: parseOptionalString(input.opportunityId, 'opportunityId') ?? null,
    strategicPlayId: parseOptionalString(input.strategicPlayId, 'strategicPlayId') ?? null,
    judgmentType: parseEnum(input.judgmentType, JUDGMENT_OWNERSHIP_TYPES, 'judgmentType'),
    assignedUserId: input.assignedUserId.trim(),
    source: input.source === undefined
      ? 'manual'
      : parseEnum(input.source, JUDGMENT_OWNERSHIP_SOURCES, 'source'),
    reason: parseOptionalString(input.reason, 'reason') ?? null,
    dueAt,
  };
}

export function mapJudgmentOwnershipAssignment(row: JudgmentOwnershipAssignmentRow): JudgmentOwnershipAssignment {
  return {
    id: row.id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    strategicPlayId: row.strategic_play_id,
    judgmentType: row.judgment_type,
    assignedUserId: row.assigned_user_id,
    assignedBy: row.assigned_by,
    status: row.status,
    source: row.source,
    reason: row.reason,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
