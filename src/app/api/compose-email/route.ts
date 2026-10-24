import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { isAIRateLimited } from '@/lib/rate-limit';
import { buildComposeSocialIntentSummary, type SocialIntentSummary } from '@/lib/babel-engine/social-intent';

export const maxDuration = 300;

interface ComposeEmailRequest {
  contactName: string;
  contactTitle?: string;
  contactRole?: string;
  emailType: string;
  emailGoal: string;
  additionalContext?: string;
  contactProfile?: string;
  dealInfo?: string;
  recentIntel?: string;
  recentDecodes?: string;
  productInfo?: string;
  senderRole?: string;
  senderName?: string;
}

interface ComposeEmailResponse {
  subject: string;
  body: string;
  sendingAdvice: string;
  suggestedCc?: string[];
  socialIntent?: SocialIntentSummary;
}

const EMAIL_TYPE_PROMPTS: Record<string, string> = {
  cold_outreach: '首次接触邮件：简洁介绍自己和公司，引起兴趣，建立初步联系。不要过于推销。',
  follow_up: '跟进邮件：基于之前的互动继续推进，提供新的价值点。',
  meeting_invite: '会议邀请：提出明确的会议目的、时间建议，让对方容易说"是"。',
  proposal_send: '方案发送：附上方案的要点摘要，突出与客户痛点的匹配，引导下一步行动。',
  quote_follow_up: '报价跟进：了解报价反馈，主动解答可能的疑虑，推进决策。',
  holiday_greeting: '节日问候：真诚的节日祝福，不要商业化，但可以自然地提及后续合作。',
  reactivation: '重新激活：针对长时间未联系的客户，重新建立联系，提供新的价值或变化。',
  custom: '根据用户描述的目标自由撰写邮件。',
};

const STYLE_PROMPTS: Record<string, string> = {
  analytical: '语气：数据驱动、逻辑清晰。多用数字和事实支撑，结构化呈现信息。',
  driver: '语气：简洁直接、聚焦结果。开门见山，不要铺垫太多，突出关键价值。',
  amiable: '语气：温暖友好、关系导向。先关心人再谈事，语气亲切但不失专业。',
  expressive: '语气：热情有活力、愿景导向。用生动的描述和故事，激发想象力。',
};

const SYSTEM_PROMPT = `你是一位顶级的 B2B 销售邮件撰写专家。你需要根据提供的上下文信息撰写一封精准、有效的商务邮件。

关键原则：
1. 邮件要自然真实，不要像模板
2. 邮件长度适中，不要太长（一般 150-300 字）
3. 有明确的下一步行动请求
4. 避开联系人的地雷词和敏感话题
5. 自动判断邮件语言：如果联系人是中文名字，写中文邮件；如果是英文名字，写英文邮件
6. 发送建议要具体可操作
7. 邮件主题必须像真实邮件标题：短、具体、名词化；不要写成正文第一句话；不要以收件人姓名开头；不要使用“我们在……供您参考”这种长句

主题示例：
- 金融数据安全合规白皮书
- 合规认证进展同步
- 数据安全方案技术对齐
- 下周技术闭门沟通建议

返回 JSON 格式：
{
  "subject": "邮件主题（8-18字，短标题风格，不要称呼收件人）",
  "body": "邮件正文（包含称呼和结尾署名占位）",
  "sendingAdvice": "发送建议（最佳发送时间、注意事项、2-3条建议）",
  "suggestedCc": ["建议抄送的人名（基于组织架构和角色关系推断，如直接上级、相关推动者等）"]
}`;

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (isAIRateLimited(ctx.userId)) {
      return Response.json({ error: '请求过于频繁，请稍后再试。' }, { status: 429 });
    }
    const body = (await request.json()) as ComposeEmailRequest;

    if (!body.contactName || !body.emailType || !body.emailGoal) {
      return Response.json({ error: '请提供收件人、邮件类型和邮件目标。' }, { status: 400 });
    }

    const typePrompt = EMAIL_TYPE_PROMPTS[body.emailType] || EMAIL_TYPE_PROMPTS.custom;
    const stylePrompt = body.contactProfile?.includes('分析型') ? STYLE_PROMPTS.analytical
      : body.contactProfile?.includes('驱动型') ? STYLE_PROMPTS.driver
      : body.contactProfile?.includes('亲和型') ? STYLE_PROMPTS.amiable
      : body.contactProfile?.includes('表现型') ? STYLE_PROMPTS.expressive
      : body.contactProfile?.includes('analytical') ? STYLE_PROMPTS.analytical
      : body.contactProfile?.includes('driver') ? STYLE_PROMPTS.driver
      : body.contactProfile?.includes('amiable') ? STYLE_PROMPTS.amiable
      : body.contactProfile?.includes('expressive') ? STYLE_PROMPTS.expressive
      : '';

    const sections = [
      `=== 收件人信息 ===`,
      `姓名：${body.contactName}`,
      body.contactTitle ? `职位：${body.contactTitle}` : '',
      body.contactRole ? `角色：${body.contactRole}` : '',
      '',
      `=== 邮件要求 ===`,
      `类型：${typePrompt}`,
      `目标：${body.emailGoal}`,
      stylePrompt ? `\n风格要求：${stylePrompt}` : '',
      body.additionalContext ? `\n补充上下文：${body.additionalContext}` : '',
      body.senderName ? `\n发件人：${body.senderName}${body.senderRole ? ` (${body.senderRole})` : ''}` : '',
      body.contactProfile ? `\n=== 联系人画像 ===\n${body.contactProfile.slice(0, 2000)}` : '',
      body.dealInfo ? `\n=== 交易信息 ===\n${body.dealInfo.slice(0, 1000)}` : '',
      body.recentIntel ? `\n=== 最近情报 ===\n${body.recentIntel.slice(0, 2000)}` : '',
      body.recentDecodes ? `\n=== 最近邮件解读 ===\n${body.recentDecodes.slice(0, 2000)}` : '',
      body.productInfo ? `\n=== 产品信息 ===\n${body.productInfo.slice(0, 2000)}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAIWithFallback<ComposeEmailResponse>({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: sections,
    });

    const socialIntent = buildComposeSocialIntentSummary({
      body: result.body ?? '',
      emailGoal: body.emailGoal,
      emailType: body.emailType,
      sendingAdvice: result.sendingAdvice,
      contactTitle: body.contactTitle,
      contactRole: body.contactRole,
      contactProfile: body.contactProfile,
    });

    return Response.json({ ...result, socialIntent });
  } catch (err) {
    return guardResponse(err);
  }
}
