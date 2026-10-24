// BABEL Engine — Layer 2: Psychological Profiling
// Builds and updates psychological profiles from interaction history using AI.

import type { ContactProfileResult, DecodeOutput } from './types';
import { callAIWithFallback } from './ai-fallback';
import { buildProfileSystemPrompt } from './prompts/profile';

// ─── Types ───────────────────────────────────────────────────────────

export interface BuildProfileInput {
  contactId: string;
  contactName: string;
  contactTitle?: string;
  contactRole?: string;
  contactDepartment?: string;
  contactEmail?: string;
  communicationRecords: string;
  relatedIntel?: string[];
  previousProfile?: ContactProfileResult;
  updateMode: 'full' | 'incremental';
  interactionCount: number;
}

// ─── Confidence Formula ──────────────────────────────────────────────

function calculateBaseConfidence(interactionCount: number): number {
  if (interactionCount < 3) return 0.3;
  if (interactionCount < 5) return 0.6;
  if (interactionCount < 10) return 0.75;
  return 0.85;
}

// ─── Core Profile Builder ────────────────────────────────────────────

export async function buildProfile(input: BuildProfileInput): Promise<ContactProfileResult> {
  const isIncremental = input.updateMode === 'incremental' && !!input.previousProfile;

  const contactInfo = [
    `姓名：${input.contactName}`,
    input.contactTitle ? `职位：${input.contactTitle}` : '',
    input.contactRole ? `角色：${input.contactRole}` : '',
    input.contactDepartment ? `部门：${input.contactDepartment}` : '',
    input.contactEmail ? `邮箱：${input.contactEmail}` : '',
  ].filter(Boolean).join('\n');

  const intelSection = input.relatedIntel && input.relatedIntel.length > 0
    ? `\n\n=== 相关情报 ===\n${input.relatedIntel.map((intel, i) => `[情报 ${i + 1}] ${intel}`).join('\n\n').slice(0, 5000)}`
    : '';

  const previousProfileSection = isIncremental
    ? `\n\n=== 上一次画像分析结果 ===\n${JSON.stringify(input.previousProfile, null, 2)}`
    : '';

  const userPrompt = `=== 联系人信息 ===
${contactInfo}

=== 沟通记录（${isIncremental ? '本次新增' : '全部'}） ===
${input.communicationRecords.slice(0, 15000)}${intelSection}${previousProfileSection}

请基于以上${isIncremental ? '新增沟通记录和旧画像' : '沟通记录'}${intelSection ? '及相关情报' : ''}，综合分析并生成该联系人的心理画像。`;

  // Build a safe degraded response from existing profile or empty defaults
  type ProfileWithoutMeta = Omit<ContactProfileResult, 'generatedAt' | 'basedOnCount' | 'basedOnIntelCount'>;
  const degradedResponse: ProfileWithoutMeta = input.previousProfile
    ? {
        decisionStyle: input.previousProfile.decisionStyle,
        riskAppetite: input.previousProfile.riskAppetite,
        communication: input.previousProfile.communication,
        positiveTriggers: input.previousProfile.positiveTriggers,
        negativeTriggers: input.previousProfile.negativeTriggers,
        landmines: input.previousProfile.landmines,
        engagementTips: input.previousProfile.engagementTips,
      }
    : {
        decisionStyle: { type: 'analytical' as const, confidence: 0, evidence: 'AI 服务暂时不可用，无法生成画像。' },
        riskAppetite: 'moderate',
        communication: { responseSpeed: '未知', lengthPreference: '未知', formality: '未知', bestContactTime: '未知' },
        positiveTriggers: [],
        negativeTriggers: [],
        landmines: [],
        engagementTips: ['AI 服务暂时不可用，请稍后重试画像生成。'],
      };

  const raw = await callAIWithFallback<Omit<ContactProfileResult, 'generatedAt' | 'basedOnCount' | 'basedOnIntelCount'>>({
    systemPrompt: buildProfileSystemPrompt(isIncremental),
    userPrompt,
  }, { degradedResponse });

  // Apply confidence formula
  let confidence = calculateBaseConfidence(input.interactionCount);
  if (isIncremental && input.previousProfile) {
    confidence = Math.min(0.95, input.previousProfile.decisionStyle.confidence + 0.1);
  }

  return {
    ...raw,
    decisionStyle: {
      ...raw.decisionStyle,
      confidence,
    },
    generatedAt: new Date().toISOString(),
    basedOnCount: input.interactionCount,
    basedOnIntelCount: input.relatedIntel?.length ?? 0,
  };
}

// ─── Decode → Profile Bridge ─────────────────────────────────────────

/**
 * 从 decode 输出更新联系人画像的便捷入口。
 * 由 profile-updater.ts 调用，将 decode 数据转换为 buildProfile 所需格式。
 */
export async function updateProfileFromDecode(
  contactId: string,
  decodeOutput: DecodeOutput,
  contactInfo: { name: string; title?: string; role?: string; department?: string; email?: string },
  interactionCount: number,
  existingProfile?: ContactProfileResult,
): Promise<ContactProfileResult> {
  // 将 decode 消息格式化为沟通记录文本
  const communicationRecords = decodeOutput.messages
    .map((m) => `[${m.speaker === 'them' ? '对方' : '我方'}] ${m.original}`)
    .join('\n\n');

  return buildProfile({
    contactId,
    contactName: contactInfo.name,
    contactTitle: contactInfo.title,
    contactRole: contactInfo.role,
    contactDepartment: contactInfo.department,
    contactEmail: contactInfo.email,
    communicationRecords,
    updateMode: existingProfile ? 'incremental' : 'full',
    previousProfile: existingProfile,
    interactionCount,
  });
}
