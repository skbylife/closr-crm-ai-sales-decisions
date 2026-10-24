import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { buildProfileSystemPrompt } from '@/lib/babel-engine/prompts/profile';
import { isAIRateLimited } from '@/lib/rate-limit';
import { inferDISC, type LinkedInProfile } from '@/lib/babel-engine/disc';

export const maxDuration = 300;

interface ContactProfileRequest {
  contact: {
    name: string;
    title?: string;
    role?: string;
    department?: string;
    email?: string;
  };
  communicationRecords: string;
  relatedIntel?: string[];
  /** LinkedIn 档案数据（可选），用于 DISC 静态推断 */
  linkedInProfile?: LinkedInProfile;
  /** 上一次的画像分析结果，用于增量学习 */
  previousProfile?: ContactProfileResponse;
}

interface ContactProfileResponse {
  decisionStyle: {
    type: string;
    confidence: number;
    evidence: string;
  };
  riskAppetite: string;
  communication: {
    responseSpeed: string;
    lengthPreference: string;
    formality: string;
    bestContactTime: string;
  };
  positiveTriggers: string[];
  negativeTriggers: string[];
  landmines: string[];
  engagementTips: string[];
  // DISC 人格推断字段
  discType?: string;
  discConfidence?: number;
  discEvidence?: string[];
  discApproach?: string;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (isAIRateLimited(ctx.userId)) {
      return Response.json({ error: '请求过于频繁，请稍后再试。' }, { status: 429 });
    }
    const body = (await request.json()) as ContactProfileRequest;

    if (!body.contact?.name || body.contact.name.trim().length === 0) {
      return Response.json({ error: '请提供联系人信息。' }, { status: 400 });
    }

    if (!body.communicationRecords || body.communicationRecords.trim().length < 30) {
      return Response.json({ error: '请粘贴至少 30 字的沟通记录。' }, { status: 400 });
    }

    const contactInfo = [
      `姓名：${body.contact.name}`,
      body.contact.title ? `职位：${body.contact.title}` : '',
      body.contact.role ? `角色：${body.contact.role}` : '',
      body.contact.department ? `部门：${body.contact.department}` : '',
      body.contact.email ? `邮箱：${body.contact.email}` : '',
    ].filter(Boolean).join('\n');

    const intelSection = body.relatedIntel && body.relatedIntel.length > 0
      ? `\n\n=== 相关情报 ===\n${body.relatedIntel.map((intel, i) => `[情报 ${i + 1}] ${intel}`).join('\n\n').slice(0, 5000)}`
      : '';

    // 如果有旧画像，附上供增量学习
    const previousProfileSection = body.previousProfile
      ? `\n\n=== 上一次画像分析结果 ===\n${JSON.stringify(body.previousProfile, null, 2)}`
      : '';

    const userPrompt = `=== 联系人信息 ===
${contactInfo}

=== 沟通记录（本次新增） ===
${body.communicationRecords.slice(0, 15000)}${intelSection}${previousProfileSection}

请基于以上${body.previousProfile ? '新增沟通记录和旧画像' : '沟通记录'}${intelSection ? '及相关情报' : ''}，综合分析并生成该联系人的心理画像。`;

    const result = await callAIWithFallback<ContactProfileResponse>({
      systemPrompt: buildProfileSystemPrompt(!!body.previousProfile),
      userPrompt,
    });

    // 如果请求中包含 LinkedIn 档案，叠加静态 DISC 推断结果
    if (body.linkedInProfile) {
      const discResult = inferDISC(body.linkedInProfile);
      // 若 AI 未返回 DISC 字段，或静态推断置信度更高，则用静态结果补充
      if (!result.discType || discResult.confidence > (result.discConfidence ?? 0)) {
        result.discType = discResult.primary;
        result.discConfidence = discResult.confidence;
        result.discEvidence = discResult.evidence;
        result.discApproach = discResult.approachStrategy;
      }
    }

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
