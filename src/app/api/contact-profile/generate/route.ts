import { requireAuth, requireAdmin, requireContactAccess, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { isAIRateLimited } from '@/lib/rate-limit';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';
import type { ContactProfileResult } from '@/lib/babel-engine/types';

export const maxDuration = 300;

interface GenerateProfileRequest {
  contactId: string;
  name: string;
  title?: string;
  role?: string;
  department?: string;
  email?: string;
  linkedin?: string;
  accountName?: string;
  accountIndustry?: string;
  outputLocale?: 'zh' | 'en';
}

function buildColdProfileSystemPrompt(outputLocale: 'zh' | 'en') {
  const evidenceExample = outputLocale === 'en'
    ? 'Inference based on title/role patterns'
    : '基于职位/角色的统计推断';

  return `你是一个 B2B 销售心理画像分析师。
基于联系人的基本信息（职位、角色、部门、行业），生成一个初步的心理画像预测。

重要：这是预测性画像，基于职位和角色的统计规律，不是确定性分析。置信度应较低（0.2-0.4）。

返回 JSON 格式：
{
  "decisionStyle": { "type": "analytical|driver|amiable|expressive", "confidence": 0.2-0.4, "evidence": "${evidenceExample}" },
  "riskAppetite": "aggressive|moderate|cautious",
  "communication": { "responseSpeed": "...", "lengthPreference": "...", "formality": "...", "bestContactTime": "..." },
  "positiveTriggers": ["...", "..."],
  "negativeTriggers": ["...", "..."],
  "landmines": ["...", "..."],
  "engagementTips": ["...", "...", "..."]
}

分析维度：
1. **decisionStyle** — 根据职位级别和部门推断决策风格
2. **riskAppetite** — 根据角色和行业推断风险偏好
3. **communication** — 根据职位级别推断沟通偏好
4. **positiveTriggers** — 3-5 个基于角色的可能兴趣点
5. **negativeTriggers** — 2-4 个基于角色的可能敏感点
6. **landmines** — 2-3 个基于职位的常见禁忌
7. **engagementTips** — 3-5 条基于角色的接触建议

语言风格：直接、可操作。明确标注这是基于职位角色的预测，而非实际沟通数据。

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as GenerateProfileRequest;
    const outputLocale = normalizeOutputLocale(body.outputLocale);
    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: '请求过于频繁，请稍后再试。',
          en: 'Requests are too frequent. Please try again later.',
        }),
      }, { status: 429 });
    }

    if (!body.contactId || !body.name?.trim()) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: '缺少 contactId 或 name',
          en: 'Missing contactId or name',
        }),
      }, { status: 400 });
    }

    // 检查联系人是否在当前 org 且对当前用户可见；AI 画像上下文只能来自已授权资源。
    const contactAccess = await requireContactAccess(ctx, body.contactId);
    const admin = requireAdmin();
    const { data: existing } = await admin
      .from('contacts')
      .select('contact_profile, name, title, role, department, email, linkedin, account_id')
      .eq('id', body.contactId)
      .eq('org_id', ctx.orgId)
      .single();

    if (existing?.contact_profile && outputLocale === 'zh') {
      return Response.json({ profile: existing.contact_profile, cached: true });
    }

    let accountForContext: { name?: string | null; industry?: string | null } | null = null;
    if (contactAccess.account_id) {
      const { data: account } = await admin
        .from('accounts')
        .select('name, industry')
        .eq('id', contactAccess.account_id)
        .eq('org_id', ctx.orgId)
        .single();
      accountForContext = account;
    }

    const contextParts = [
      `姓名：${existing?.name || body.name}`,
      (existing?.title || body.title) && `职位：${existing?.title || body.title}`,
      (existing?.role || body.role) && `角色：${existing?.role || body.role}`,
      (existing?.department || body.department) && `部门：${existing?.department || body.department}`,
      (existing?.email || body.email) && `邮箱：${existing?.email || body.email}`,
      (existing?.linkedin || body.linkedin) && `LinkedIn：${existing?.linkedin || body.linkedin}`,
      accountForContext?.name && `公司：${accountForContext.name}`,
      accountForContext?.industry && `行业：${accountForContext.industry}`,
    ].filter(Boolean).join('\n');

    const userPrompt = `=== 联系人基本信息 ===
${contextParts}

请基于以上基本信息，生成该联系人的初步预测性心理画像。注意：没有实际沟通记录，全部基于职位角色的统计规律推断。`;

    const result = await callAIWithFallback<ContactProfileResult>({
      systemPrompt: buildColdProfileSystemPrompt(outputLocale),
      userPrompt: userPrompt + '\n\n' + outputLocaleInstruction(outputLocale),
    });

    // 补充元数据
    const profile: ContactProfileResult = {
      ...result,
      generatedAt: new Date().toISOString(),
      basedOnCount: 0,
    };

    // 写回数据库
    await admin
      .from('contacts')
      .update({ contact_profile: profile })
      .eq('id', body.contactId)
      .eq('org_id', ctx.orgId);

    return Response.json({ profile, cached: false });
  } catch (err) {
    return guardResponse(err);
  }
}
