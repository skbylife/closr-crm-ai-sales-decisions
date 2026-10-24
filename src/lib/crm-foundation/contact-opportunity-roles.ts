import type { ContactRole } from '@/lib/babel-engine/types';
import type {
  OpportunityRoleCoverageStatus,
  OpportunityRoleInfluence,
  OpportunityRoleStance,
  PersistedOpportunityRoleInput,
} from './opportunity-workbench';

export const CONTACT_OPPORTUNITY_ROLE_TYPES = [
  'decision_maker',
  'economic_buyer',
  'champion',
  'technical_evaluator',
  'influencer',
  'external_advisor',
  'consultant',
  'channel_influencer',
  'blocker',
  'end_user',
  'procurement',
  'legal',
  'project_manager',
  'executive_sponsor',
  'gate_keeper',
  'coach',
  'committee_member',
  'it_admin',
  'operations',
  'finance',
  'contact',
  'unknown',
] as const satisfies ContactRole[];

const INFLUENCE_VALUES = ['high', 'medium', 'low', 'unknown'] as const;
const STANCE_VALUES = ['supportive', 'neutral', 'risk', 'unknown'] as const;
const COVERAGE_VALUES = ['covered', 'needs_touch', 'missing'] as const;

export interface ContactOpportunityRoleRow {
  id: string;
  org_id: string;
  contact_id: string;
  opportunity_id: string;
  role_type: ContactRole;
  influence_level: OpportunityRoleInfluence;
  stance: OpportunityRoleStance;
  engagement_status: OpportunityRoleCoverageStatus;
  last_engaged_at: string | null;
  relationship_owner_id: string | null;
  source_evidence_ids: string[];
  confidence: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { name?: string | null; title?: string | null } | null;
}

export interface ContactOpportunityRoleInput {
  contactId: string;
  opportunityId: string;
  roleType?: ContactRole;
  influence?: OpportunityRoleInfluence;
  stance?: OpportunityRoleStance;
  coverageStatus?: OpportunityRoleCoverageStatus;
  lastEngagedAt?: string | null;
  relationshipOwnerId?: string | null;
  sourceEvidenceIds?: string[];
  confidence?: number;
  notes?: string | null;
}

export interface ContactOpportunityRolePatch {
  roleType?: ContactRole;
  influence?: OpportunityRoleInfluence;
  stance?: OpportunityRoleStance;
  coverageStatus?: OpportunityRoleCoverageStatus;
  lastEngagedAt?: string | null;
  relationshipOwnerId?: string | null;
  sourceEvidenceIds?: string[];
  confidence?: number;
  notes?: string | null;
}

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function normalizeConfidence(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0.5;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) throw new Error('confidence 必须是 0 到 1 之间的数字');
  return Math.min(Math.max(numberValue, 0), 1);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

export function buildContactOpportunityRoleInsert(
  input: ContactOpportunityRoleInput,
  context: { orgId: string; userId: string },
): Record<string, unknown> {
  const contactId = normalizeString(input.contactId);
  const opportunityId = normalizeString(input.opportunityId);
  if (!contactId) throw new Error('缺少联系人 ID');
  if (!opportunityId) throw new Error('缺少商机 ID');

  const roleType = input.roleType ?? 'unknown';
  const influence = input.influence ?? 'unknown';
  const stance = input.stance ?? 'unknown';
  const coverageStatus = input.coverageStatus ?? 'missing';
  if (!includes(CONTACT_OPPORTUNITY_ROLE_TYPES, roleType)) throw new Error('角色类型无效');
  if (!includes(INFLUENCE_VALUES, influence)) throw new Error('影响力无效');
  if (!includes(STANCE_VALUES, stance)) throw new Error('立场无效');
  if (!includes(COVERAGE_VALUES, coverageStatus)) throw new Error('覆盖状态无效');

  return {
    org_id: context.orgId,
    contact_id: contactId,
    opportunity_id: opportunityId,
    role_type: roleType,
    influence_level: influence,
    stance,
    engagement_status: coverageStatus,
    last_engaged_at: input.lastEngagedAt ?? null,
    relationship_owner_id: input.relationshipOwnerId ?? null,
    source_evidence_ids: normalizeStringArray(input.sourceEvidenceIds),
    confidence: normalizeConfidence(input.confidence),
    notes: normalizeString(input.notes),
    created_by: context.userId,
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  };
}

export function buildContactOpportunityRoleUpdate(
  patch: ContactOpportunityRolePatch,
  context: { userId: string },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    updated_by: context.userId,
    updated_at: new Date().toISOString(),
  };
  if (patch.roleType !== undefined) {
    if (!includes(CONTACT_OPPORTUNITY_ROLE_TYPES, patch.roleType)) throw new Error('角色类型无效');
    row.role_type = patch.roleType;
  }
  if (patch.influence !== undefined) {
    if (!includes(INFLUENCE_VALUES, patch.influence)) throw new Error('影响力无效');
    row.influence_level = patch.influence;
  }
  if (patch.stance !== undefined) {
    if (!includes(STANCE_VALUES, patch.stance)) throw new Error('立场无效');
    row.stance = patch.stance;
  }
  if (patch.coverageStatus !== undefined) {
    if (!includes(COVERAGE_VALUES, patch.coverageStatus)) throw new Error('覆盖状态无效');
    row.engagement_status = patch.coverageStatus;
  }
  if (patch.lastEngagedAt !== undefined) row.last_engaged_at = patch.lastEngagedAt;
  if (patch.relationshipOwnerId !== undefined) row.relationship_owner_id = patch.relationshipOwnerId;
  if (patch.sourceEvidenceIds !== undefined) row.source_evidence_ids = normalizeStringArray(patch.sourceEvidenceIds);
  if (patch.confidence !== undefined) row.confidence = normalizeConfidence(patch.confidence);
  if (patch.notes !== undefined) row.notes = normalizeString(patch.notes);
  return row;
}

export function rowToPersistedOpportunityRole(row: ContactOpportunityRoleRow): PersistedOpportunityRoleInput {
  return {
    contactId: row.contact_id,
    contactName: row.contacts?.name ?? undefined,
    title: row.contacts?.title ?? undefined,
    roleType: row.role_type,
    influence: row.influence_level,
    stance: row.stance,
    coverageStatus: row.engagement_status,
    lastEngagedAt: row.last_engaged_at ?? undefined,
    confidence: row.confidence,
    notes: row.notes ?? undefined,
  };
}
