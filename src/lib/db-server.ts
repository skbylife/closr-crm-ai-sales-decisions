// Server-side DB helpers for org operations
// These use the admin client (service role key) and are only called from API routes / server actions.

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { Organization, OrgRole, OrgSettings } from '@/lib/babel-engine/types';

export function buildOrganizationSlug(name: string, suffix: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/g, '');
  const safeSuffix = suffix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
  return [base || 'org', safeSuffix || Date.now().toString(36)].join('-');
}

export async function dbCreateOrganization(name: string, userId: string, domain?: string): Promise<Organization | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    // Use a unique non-empty slug. Chinese names sanitize to an empty ASCII base,
    // and plain name-only slugs can collide for common org names like "Acme".
    const slug = buildOrganizationSlug(name, randomUUID().slice(0, 8));
    const settings = domain ? { domain } : {};
    const { data: org, error } = await admin
      .from('organizations')
      .insert({ name, slug, settings })
      .select()
      .single();
    if (error) throw error;
    const { error: memErr } = await admin
      .from('org_memberships')
      .insert({ user_id: userId, org_id: org.id, role: 'owner' });
    if (memErr) {
      await admin.from('organizations').delete().eq('id', org.id);
      throw memErr;
    }
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logoUrl: org.logo_url ?? undefined,
      settings: (org.settings as OrgSettings) ?? {},
      createdAt: org.created_at,
      updatedAt: org.updated_at,
    };
  } catch (e) {
    console.error('[db-server] createOrganization failed:', e);
    return null;
  }
}

export async function dbAcceptInvitation(token: string, userId: string): Promise<{ orgId: string; role: OrgRole } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data: inv, error: findErr } = await admin
      .from('org_invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();
    if (findErr || !inv) return null;
    if (new Date(inv.expires_at) < new Date()) return null;
    const { error: memErr } = await admin
      .from('org_memberships')
      .insert({ user_id: userId, org_id: inv.org_id, role: inv.role, invited_by: inv.invited_by });
    if (memErr) throw memErr;
    await admin
      .from('org_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', inv.id);
    return { orgId: inv.org_id, role: inv.role as OrgRole };
  } catch (e) {
    console.error('[db-server] acceptInvitation failed:', e);
    return null;
  }
}

export async function dbMigrateUserDataToOrg(userId: string, orgId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const tables = ['accounts', 'contacts', 'opportunities', 'intel_items', 'email_decodes', 'composed_emails', 'meeting_preps', 'discovery_notes', 'knowledge_items', 'user_settings', 'tasks'];
  try {
    for (const table of tables) {
      await admin
        .from(table)
        .update({ org_id: orgId })
        .eq('user_id', userId)
        .is('org_id', null);
    }
  } catch (e) {
    console.error('[db-server] migrateUserDataToOrg failed:', e);
  }
}

export async function dbGetInvitationByToken(token: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from('org_invitations')
      .select('*, organizations(name)')
      .eq('token', token)
      .is('accepted_at', null)
      .single();
    if (error || !data) return null;
    if (new Date(data.expires_at) < new Date()) return null;
    return {
      email: data.email as string,
      role: data.role as string,
      orgName: ((data.organizations as Record<string, unknown>)?.name as string) ?? '',
    };
  } catch {
    return null;
  }
}

export async function dbLogActivity(params: {
  userId: string;
  orgId: string | null;
  userDisplayName?: string;
  actionType: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  accountId?: string;
  accountName?: string;
  contactId?: string;
  contactName?: string;
  opportunityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from('activity_logs').insert({
      user_id: params.userId,
      org_id: params.orgId,
      user_display_name: params.userDisplayName ?? null,
      action_type: params.actionType,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      entity_name: params.entityName ?? null,
      account_id: params.accountId ?? null,
      account_name: params.accountName ?? null,
      contact_id: params.contactId ?? null,
      contact_name: params.contactName ?? null,
      opportunity_id: params.opportunityId ?? null,
      summary: params.summary,
      metadata: params.metadata ?? {},
    });
  } catch (e) {
    console.error('[db] logActivity failed:', e);
  }
}

