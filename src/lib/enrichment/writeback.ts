/**
 * Enrichment Writeback Service
 *
 * Centralized priority-based field writeback for AI-driven contact enrichment.
 * Handles audit logging to contact_enrichment_log table.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { ContactRole } from '@/lib/babel-engine/types';

// ─── Types ──────────────────────────────────────────────────────────

export type WritebackSource = 'manual' | 'agent_tool' | 'decode_infer' | 'intel_agent' | 'tavily';

export interface WritebackParams {
  contactId: string;
  orgId: string;
  source: WritebackSource;
  sourceId?: string;       // decode_id, intel_item_id, etc.
  createdBy?: string;      // user_id who triggered it
  evidence?: string;
}

export interface RoleWritebackParams extends WritebackParams {
  role: ContactRole;
  confidence: number;
}

export interface FieldWritebackParams extends WritebackParams {
  fieldName: string;
  newValue: string;
  confidence?: number;
}

// ─── Priority Logic ─────────────────────────────────────────────────

const SOURCE_PRIORITY: Record<string, number> = {
  manual: 100,
  agent_tool: 80,
  decode_infer: 60,
  intel_agent: 40,
  tavily: 30,
};

export function shouldOverwriteRole(
  currentSource: string | null,
  currentConfidence: number | null,
  newSource: string,
  newConfidence: number,
): boolean {
  if (currentSource === 'manual') return false;
  if (!currentSource) return true;

  const currentPriority = SOURCE_PRIORITY[currentSource] ?? 0;
  const newPriority = SOURCE_PRIORITY[newSource] ?? 0;

  if (newPriority > currentPriority) return true;
  if (newPriority === currentPriority && newConfidence > (currentConfidence ?? 0)) return true;
  return false;
}

// ─── Role Writeback ─────────────────────────────────────────────────

export async function writebackRole(params: RoleWritebackParams): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const { contactId, orgId, role, confidence, source, sourceId, createdBy, evidence } = params;

  // Read current role state (scoped to org)
  const { data: contact } = await admin
    .from('contacts')
    .select('role, role_confidence, role_source')
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single();

  if (!contact) return false;

  const currentRole = contact.role as string | null;
  const currentConfidence = contact.role_confidence as number | null;
  const currentSource = contact.role_source as string | null;

  // Check priority
  if (!shouldOverwriteRole(currentSource, currentConfidence, source, confidence)) {
    return false;
  }

  // Skip if same role with lower/equal confidence
  if (currentRole === role && (currentConfidence ?? 0) >= confidence) {
    return false;
  }

  // Write role
  const { error } = await admin
    .from('contacts')
    .update({
      role,
      role_confidence: confidence,
      role_updated_at: new Date().toISOString(),
      role_source: source,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  if (error) {
    console.error('[writeback] Role write failed:', error.message);
    return false;
  }

  // Audit log
  await logEnrichment(admin, {
    orgId,
    contactId,
    action: 'role_inferred',
    fieldName: 'role',
    oldValue: currentRole ?? null,
    newValue: role,
    confidence,
    source,
    sourceId,
    evidence,
    createdBy,
  });

  console.log(`[writeback] Role updated: ${contactId} → ${role} (${confidence}, ${source})`);
  return true;
}

// ─── Generic Field Writeback ────────────────────────────────────────

// Allowlist of fields that can be written by enrichment
const WRITABLE_FIELDS = new Set(['title', 'linkedin', 'department', 'job_level', 'location']);

export async function writebackField(params: FieldWritebackParams): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const { contactId, orgId, fieldName, newValue, confidence, source, sourceId, createdBy, evidence } = params;

  // Security: only allow known fields
  if (!WRITABLE_FIELDS.has(fieldName)) {
    console.error(`[writeback] Rejected disallowed field: ${fieldName}`);
    return false;
  }

  // Read current value
  const { data: contact } = await admin
    .from('contacts')
    .select(fieldName)
    .eq('id', contactId)
    .eq('org_id', orgId)
    .single();

  if (!contact) return false;

  const oldValue = (contact as unknown as Record<string, unknown>)[fieldName] as string | null;

  // For intel_agent source, only write if field is empty
  if (source === 'intel_agent' && oldValue) {
    return false;
  }

  // Write field
  const updateFields: Record<string, unknown> = {
    [fieldName]: newValue,
    updated_at: new Date().toISOString(),
  };

  // Update enrichment tracking
  updateFields.enrichment_status = 'enriched';
  updateFields.enriched_at = new Date().toISOString();

  const { error } = await admin
    .from('contacts')
    .update(updateFields)
    .eq('id', contactId);

  if (error) {
    console.error(`[writeback] Field write failed (${fieldName}):`, error.message);
    return false;
  }

  // Determine action name
  const actionMap: Record<string, string> = {
    title: 'title_updated',
    linkedin: 'linkedin_found',
    department: 'department_inferred',
    job_level: 'job_level_set',
  };

  await logEnrichment(admin, {
    orgId,
    contactId,
    action: actionMap[fieldName] ?? 'profile_enriched',
    fieldName,
    oldValue,
    newValue,
    confidence: confidence ?? null,
    source,
    sourceId,
    evidence,
    createdBy,
  });

  console.log(`[writeback] ${fieldName} updated: ${contactId} → ${newValue} (${source})`);
  return true;
}

// ─── Audit Log ──────────────────────────────────────────────────────

interface LogParams {
  orgId: string;
  contactId: string;
  action: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  confidence: number | null;
  source: string;
  sourceId?: string;
  evidence?: string;
  createdBy?: string;
}

async function logEnrichment(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  params: LogParams,
): Promise<void> {
  try {
    await admin.from('contact_enrichment_log').insert({
      org_id: params.orgId,
      contact_id: params.contactId,
      action: params.action,
      field_name: params.fieldName,
      old_value: params.oldValue,
      new_value: params.newValue,
      confidence: params.confidence,
      source: params.source,
      source_id: params.sourceId ?? null,
      evidence: params.evidence ?? null,
      created_by: params.createdBy ?? null,
    });
  } catch (err) {
    // Non-critical: don't block enrichment if audit logging fails
    console.error('[writeback] Audit log failed:', err);
  }
}

// ─── MEDDICC Bridge ─────────────────────────────────────────────────

/**
 * When a contact is inferred as champion or economic_buyer,
 * update the relevant MEDDICC fields on associated opportunities.
 */
export async function bridgeRoleToMeddicc(
  contactId: string,
  role: ContactRole,
  orgId: string,
): Promise<void> {
  if (role !== 'champion' && role !== 'economic_buyer') return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  // Find opportunities associated with this contact's account
  const { data: contact } = await admin
    .from('contacts')
    .select('account_id')
    .eq('id', contactId)
    .single();

  if (!contact?.account_id) return;

  const { data: opps } = await admin
    .from('opportunities')
    .select('id, meddicc')
    .eq('account_id', contact.account_id)
    .eq('org_id', orgId)
    .not('stage', 'in', '("closed_won","closed_lost")');

  if (!opps || opps.length === 0) return;

  for (const opp of opps) {
    const meddicc = (opp.meddicc as Record<string, unknown>) ?? {};

    if (role === 'champion') {
      // Update champion strength if not already set high
      const champion = meddicc.champion as Record<string, unknown> | undefined;
      if (!champion || (champion.strength as number ?? 0) < 3) {
        meddicc.champion = {
          ...champion,
          strength: Math.max((champion?.strength as number) ?? 0, 3),
          lastInteraction: new Date().toISOString().split('T')[0],
        };
      }
    } else if (role === 'economic_buyer') {
      const eb = meddicc.economicBuyer as Record<string, unknown> | undefined;
      if (!eb || eb.status !== 'contacted') {
        meddicc.economicBuyer = {
          ...eb,
          status: 'identified',
        };
      }
    }

    await admin
      .from('opportunities')
      .update({ meddicc, updated_at: new Date().toISOString() })
      .eq('id', opp.id);

    // Also upsert opportunity_contacts
    try {
      await admin.from('opportunity_contacts').upsert(
        {
          org_id: orgId,
          opportunity_id: opp.id,
          contact_id: contactId,
          deal_role: role,
          confidence: 0.6,
          source: 'decode_infer',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,opportunity_id,contact_id,deal_role' },
      );
    } catch {
      // Table may not exist yet if migration hasn't run
    }
  }

  console.log(`[writeback] MEDDICC bridge: ${role} → ${opps.length} opportunities`);
}

// ─── CIL Bridge ─────────────────────────────────────────────────────

/**
 * Write role inference as a stakeholder_assessment claim in CIL.
 */
export async function bridgeRoleToCIL(
  contactId: string,
  contactName: string,
  role: ContactRole,
  confidence: number,
  evidence: string,
  orgId: string,
  accountId: string | null,
): Promise<void> {
  if (!accountId) return;

  try {
    const { runCILIngest } = await import('@/lib/compiled-intelligence/ingest');
    await runCILIngest({
      orgId,
      accountId,
      accountName: '', // Will be looked up by ingest
      sourceId: `role-infer-${contactId}-${Date.now()}`,
      sourceType: 'note',
      rawText: `联系人 ${contactName} 被 AI 推断为 ${role}（置信度 ${(confidence * 100).toFixed(0)}%）。依据：${evidence}`,
      context: 'AI 角色推断 → stakeholder_assessment',
      occurredAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[writeback] CIL bridge failed:', err);
  }
}
