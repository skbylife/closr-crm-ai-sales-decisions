import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';

export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return Response.json({ error: 'Missing accountId' }, { status: 400 });
    }

    await requireAccountAccess(ctx, accountId);
    const admin = requireAdmin();

    // 1. Get contact IDs for this account
    const { data: contacts, error: contactsErr } = await admin
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('org_id', ctx.orgId);

    if (contactsErr || !contacts || contacts.length === 0) {
      return Response.json({ assignments: [] });
    }

    const contactIds = contacts.map((c) => c.id);

    // 2. Aggregate interactions from email_decodes
    const { data: decodes, error: decodesErr } = await admin
      .from('email_decodes')
      .select('user_id, matched_contact_id')
      .eq('org_id', ctx.orgId)
      .in('matched_contact_id', contactIds);

    if (decodesErr || !decodes || decodes.length === 0) {
      return Response.json({ assignments: [] });
    }

    // Count interactions per (user_id, matched_contact_id)
    const countMap = new Map<string, number>();
    for (const d of decodes) {
      if (!d.user_id || !d.matched_contact_id) continue;
      const key = `${d.user_id}::${d.matched_contact_id}`;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    // For each contact, find user with highest count
    const bestByContact = new Map<string, { userId: string; count: number }>();
    for (const [key, count] of countMap) {
      const [userId, contactId] = key.split('::');
      const current = bestByContact.get(contactId);
      if (!current || count > current.count) {
        bestByContact.set(contactId, { userId, count });
      }
    }

    if (bestByContact.size === 0) {
      return Response.json({ assignments: [] });
    }

    // 3. Get member info
    const userIds = [...new Set([...bestByContact.values()].map((v) => v.userId))];
    const { data: members } = await admin
      .from('org_memberships')
      .select('user_id, display_name, job_title, job_level')
      .eq('org_id', ctx.orgId)
      .in('user_id', userIds);

    const memberMap = new Map<string, { displayName: string; jobTitle?: string; jobLevel?: number }>();
    for (const m of members ?? []) {
      memberMap.set(m.user_id, {
        displayName: m.display_name,
        jobTitle: m.job_title ?? undefined,
        jobLevel: m.job_level ?? undefined,
      });
    }

    // 4. Build assignments
    const assignments = [...bestByContact.entries()].map(([contactId, { userId, count }]) => {
      const member = memberMap.get(userId);
      return {
        contactId,
        userId,
        memberName: member?.displayName ?? userId,
        memberTitle: member?.jobTitle,
        jobLevel: member?.jobLevel,
        interactionCount: count,
      };
    });

    return Response.json({ assignments });
  } catch (err) {
    return guardResponse(err);
  }
}
