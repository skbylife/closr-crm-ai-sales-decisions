// BABEL Engine — Profile Updater
// Bridge layer: decode → profile update pipeline.
// Designed to be called fire-and-forget after decode completes.

import type { ContactProfileResult, DecodeOutput, AttitudeTrendPoint, SentimentTrend } from './types';
import { buildProfile } from './profile';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { embedText } from './vector-store';
import { logWarn } from '@/lib/error-monitor';

/**
 * 从 decode 结果触发联系人画像更新。
 * Fire-and-forget：不阻塞 decode 响应。
 */
export async function triggerProfileUpdate(
  contactId: string,
  decodeOutput: DecodeOutput,
  userId: string,
  orgId?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('[profile-updater] Supabase admin client not available');
    return;
  }

  // 1. 读取联系人信息和现有画像
  let contactQuery = supabase
    .from('contacts')
    .select('id, name, title, role, department, email, contact_profile, org_id, account_id, attitude_trend')
    .eq('id', contactId);
  if (orgId) {
    contactQuery = contactQuery.eq('org_id', orgId);
  }
  const { data: contact, error: contactError } = await contactQuery.single();

  if (contactError || !contact) {
    console.error('[profile-updater] Failed to fetch contact:', contactError?.message);
    return;
  }

  // 2. 读取该联系人关联的 decode 历史
  let historyQuery = supabase
    .from('email_decodes')
    .select('email_text, client_name, decode, date')
    .eq('matched_contact_id', contactId)
    .eq('user_id', userId);
  if (orgId) {
    historyQuery = historyQuery.eq('org_id', orgId);
  }
  const { data: decodeHistory, error: historyError } = await historyQuery
    .order('date', { ascending: true })
    .limit(20);

  if (historyError) {
    console.error('[profile-updater] Failed to fetch decode history:', historyError.message);
  }

  // 3. 将 decode 历史格式化为沟通记录文本
  const historyRecords = (decodeHistory ?? [])
    .map((d: { date?: string; client_name?: string; decode?: unknown }) => {
      const decode = d.decode as { messages?: { speaker: string; original: string }[] } | null;
      if (!decode?.messages) return '';
      const header = `--- ${d.date ?? '未知日期'}${d.client_name ? ` (${d.client_name})` : ''} ---`;
      const messages = decode.messages
        .map((m) => `[${m.speaker === 'them' ? '对方' : '我方'}] ${m.original}`)
        .join('\n');
      return `${header}\n${messages}`;
    })
    .filter(Boolean)
    .join('\n\n');

  // 加上当前这次 decode 的内容
  const currentRecords = decodeOutput.messages
    .map((m) => `[${m.speaker === 'them' ? '对方' : '我方'}] ${m.original}`)
    .join('\n');

  const allRecords = historyRecords
    ? `${historyRecords}\n\n--- 最新沟通 ---\n${currentRecords}`
    : currentRecords;

  // 4. 计算交互次数
  const interactionCount = (decodeHistory?.length ?? 0) + 1;

  // 5. 获取现有画像
  const existingProfile = contact.contact_profile as ContactProfileResult | null;

  // 6. 调用 AI 生成/更新画像
  const updatedProfile = await buildProfile({
    contactId,
    contactName: contact.name,
    contactTitle: contact.title ?? undefined,
    contactRole: contact.role ?? undefined,
    contactDepartment: contact.department ?? undefined,
    contactEmail: contact.email ?? undefined,
    communicationRecords: allRecords,
    updateMode: existingProfile ? 'incremental' : 'full',
    previousProfile: existingProfile ?? undefined,
    interactionCount,
  });

  // 7. 计算所有更新字段，合并为一次写入
  const contactOrgId = (contact as Record<string, unknown>).org_id as string | undefined;
  const now = new Date().toISOString();
  const strength = calculateRelationshipStrength(interactionCount, now);

  // 计算态度趋势
  let updatedTrend: AttitudeTrendPoint[] | undefined;
  const sentimentTrend = decodeOutput.threadAnalysis?.sentimentTrend;
  if (sentimentTrend) {
    const SENTIMENT_SCORE: Record<SentimentTrend, number> = {
      warming: 75,
      stable: 50,
      cooling: 25,
      volatile: 40,
    };
    const SENTIMENT_LABEL: Record<SentimentTrend, string> = {
      warming: '态度升温',
      stable: '态度稳定',
      cooling: '态度冷淡',
      volatile: '态度波动',
    };

    const existingTrend = ((contact as Record<string, unknown>).attitude_trend as AttitudeTrendPoint[] | null) ?? [];
    const lastScore = existingTrend.length > 0 ? existingTrend[existingTrend.length - 1].score : 50;
    const targetScore = SENTIMENT_SCORE[sentimentTrend];
    const newScore = Math.round(lastScore * 0.4 + targetScore * 0.6);

    const newPoint: AttitudeTrendPoint = {
      date: now.split('T')[0],
      score: Math.max(0, Math.min(100, newScore)),
      label: SENTIMENT_LABEL[sentimentTrend],
    };

    updatedTrend = [...existingTrend, newPoint].slice(-20);
    console.log(`[profile-updater] Attitude trend: ${sentimentTrend} → score ${newScore}`);
  }

  // 合并为一次 UPDATE（contact_profile + attitude_trend + relationship_strength）
  let updateQuery = supabase
    .from('contacts')
    .update({
      contact_profile: updatedProfile,
      relationship_strength: strength,
      last_contacted_at: now,
      ...(updatedTrend ? { attitude_trend: updatedTrend } : {}),
    })
    .eq('id', contactId);
  if (orgId) {
    updateQuery = updateQuery.eq('org_id', orgId);
  }
  const { error: updateError } = await updateQuery;

  if (updateError) {
    console.error('[profile-updater] Failed to update contact profile:', updateError.message);
    return;
  }

  console.log(`[profile-updater] Profile updated for contact ${contactId} (${contact.name}), interactions: ${interactionCount}, DISC: ${updatedProfile.discType ?? 'N/A'}, role: ${updatedProfile.inferredRole ?? 'N/A'}`);

  // 7.1 自动回写 AI 推断的组织角色 (via writeback service)
  if (
    updatedProfile.inferredRole &&
    updatedProfile.inferredRole !== 'unknown' &&
    updatedProfile.inferredRole !== 'contact' &&
    (updatedProfile.inferredRoleConfidence ?? 0) >= 0.5 &&
    contactOrgId
  ) {
    try {
      const { writebackRole, bridgeRoleToMeddicc, bridgeRoleToCIL } = await import('@/lib/enrichment/writeback');
      const written = await writebackRole({
        contactId,
        orgId: contactOrgId,
        role: updatedProfile.inferredRole,
        confidence: updatedProfile.inferredRoleConfidence ?? 0.5,
        source: 'decode_infer',
        createdBy: userId,
        evidence: updatedProfile.inferredRoleEvidence ?? undefined,
      });

      if (written) {
        // Bridge to MEDDICC + CIL (fire-and-forget)
        const accountId = (contact as Record<string, unknown>).account_id as string | null;
        void bridgeRoleToMeddicc(contactId, updatedProfile.inferredRole, contactOrgId).catch((err) =>
          console.error('[profile-updater] MEDDICC bridge failed:', err)
        );
        void bridgeRoleToCIL(
          contactId,
          contact.name,
          updatedProfile.inferredRole,
          updatedProfile.inferredRoleConfidence ?? 0.5,
          updatedProfile.inferredRoleEvidence ?? '',
          contactOrgId,
          accountId,
        ).catch((err) =>
          console.error('[profile-updater] CIL bridge failed:', err)
        );
      }
    } catch (err) {
      console.error('[profile-updater] Role writeback failed:', err);
    }
  }

  // 7.5 同步 contact_profiles_v2 表（含 embedding 向量化）
  try {
    const profileSummaryParts: string[] = [
      contact.name,
      contact.title ?? '',
      contact.department ?? '',
      updatedProfile.decisionStyle ? `Decision: ${updatedProfile.decisionStyle.type}` : '',
      updatedProfile.riskAppetite ? `Risk: ${updatedProfile.riskAppetite}` : '',
      updatedProfile.communication?.formality ? `Style: ${updatedProfile.communication.formality}` : '',
      ...(updatedProfile.positiveTriggers ?? []),
      ...(updatedProfile.engagementTips ?? []),
    ].filter(Boolean);

    const profileText = profileSummaryParts.join('. ');
    const embedding = await embedText(profileText);

    await supabase
      .from('contact_profiles_v2')
      .upsert(
        {
          user_id: userId,
          contact_id: contactId,
          name: contact.name,
          headline: contact.title ?? null,
          current_company: contact.department ?? null,
          notes: JSON.stringify(updatedProfile),
          embedding: `[${embedding.join(',')}]`,
          updated_at: now,
        },
        { onConflict: 'user_id,contact_id', ignoreDuplicates: false },
      );

    console.log(`[profile-updater] Embedding saved to contact_profiles_v2 for ${contact.name}`);
  } catch (embErr) {
    console.error('[profile-updater] Embedding sync failed (non-critical):', embErr);
  }

  // AI Event Pipeline: 画像更新事件
  if (contactOrgId) {
    const { emitEvent } = await import('@/lib/ai-event-hub');
    void emitEvent({
      orgId: contactOrgId,
      userId,
      eventType: 'contact.profile_updated',
      entityType: 'contact',
      entityId: contactId,
      payload: { contactName: contact.name },
    }).catch((err) => {
      logWarn('profile-updater', '画像更新事件发送失败', { action: 'emit-event', contactId, error: err instanceof Error ? err.message : String(err) });
    });
  }
}

/**
 * 计算关系强度 0-100
 * 因素：交互次数（频率越高越强）+ 最近联系时间（越近越强）
 */
function calculateRelationshipStrength(
  interactionCount: number,
  lastContactedAt: string,
): number {
  // 基础分：交互次数，每次 +8，上限 60
  const interactionScore = Math.min(60, interactionCount * 8);

  // 时效分：最近联系越近越高，上限 40
  const daysSince = Math.floor(
    (Date.now() - new Date(lastContactedAt).getTime()) / 86400000
  );
  let recencyScore: number;
  if (daysSince <= 1) recencyScore = 40;
  else if (daysSince <= 3) recencyScore = 35;
  else if (daysSince <= 7) recencyScore = 28;
  else if (daysSince <= 14) recencyScore = 20;
  else if (daysSince <= 30) recencyScore = 10;
  else recencyScore = 5;

  return Math.min(100, interactionScore + recencyScore);
}
