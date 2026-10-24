import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { applyAIRateLimit } from '@/lib/rate-limit';

export const maxDuration = 120;

type HelpCandidate = {
  title?: string;
  category?: string;
  description?: string;
  href?: string;
};

type HelpAssistantRequest = {
  query?: string;
  candidates?: HelpCandidate[];
};

type HelpAssistantResponse = {
  answerTitle: string;
  answerBody: string;
  steps: Array<{ title: string; detail: string; href: string }>;
};

const HELP_ASSISTANT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answerTitle', 'answerBody', 'steps'],
  properties: {
    answerTitle: { type: 'string' },
    answerBody: { type: 'string' },
    steps: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'href'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          href: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = [
  '你是 Closr 帮助中心里的 AI 帮助助手。',
  '',
  '你的任务不是介绍产品功能，而是站在用户当前问题的角度，直接回答问题，并给出清晰可执行步骤。',
  '',
  '回答规则：',
  '1. 必须用中文。',
  '2. 必须像一个清醒的产品顾问：先回答用户真正想解决什么，再给出一步一步怎么做。',
  '3. 只能基于给定候选帮助内容回答，不能编造不存在的页面或功能。',
  '4. 不要说“作为 AI”。不要输出 Markdown。',
  '5. answerBody 控制在 80-140 个中文字符。',
  '6. steps 必须是 2-5 个可执行步骤，每一步说清楚用户要点哪里、看什么、做什么。',
  '7. 每个 step 的 href 必须使用候选里的 href；如果某一步不需要跳转，也使用最相关候选的 href。',
].join('\n');

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeCandidates(candidates: unknown): Required<HelpCandidate>[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, 8).map((candidate) => ({
    title: cleanText((candidate as HelpCandidate).title, 80),
    category: cleanText((candidate as HelpCandidate).category, 60),
    description: cleanText((candidate as HelpCandidate).description, 240),
    href: cleanText((candidate as HelpCandidate).href, 120),
  })).filter((candidate) => candidate.title && candidate.description && candidate.href);
}

function buildDegradedResponse(candidates: Required<HelpCandidate>[]): HelpAssistantResponse {
  const first = candidates[0];
  return {
    answerTitle: first ? '建议先看「' + first.title + '」' : '先换一种具体问题问我',
    answerBody: first
      ? '我会先从「' + first.title + '」开始看，因为它最接近你现在的问题。看完后，再按推荐路径进入相关模块继续处理。'
      : '我暂时没有找到足够准确的帮助内容。可以直接问“客户邮件说明什么”“这单为什么危险”“ROI 怎么给客户讲”。',
    steps: candidates.slice(0, 3).map((candidate, index) => ({
      title: index === 0 ? '先打开' + candidate.title : '再看' + candidate.title,
      detail: candidate.description,
      href: candidate.href,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);

    const body = (await request.json()) as HelpAssistantRequest;
    const query = cleanText(body.query, 300);
    const candidates = normalizeCandidates(body.candidates);

    if (!query) {
      return Response.json({ error: '请输入你想解决的问题。' }, { status: 400 });
    }

    if (candidates.length === 0) {
      return Response.json({ error: '没有找到可供 AI 判断的帮助内容。' }, { status: 400 });
    }

    const userPrompt = [
      '用户问题：' + query,
      '',
      '候选帮助内容（只能从这些内容中推荐）：',
      ...candidates.map((candidate, index) => [
        String(index + 1) + '. ' + candidate.title,
        '分类：' + candidate.category,
        '说明：' + candidate.description,
        '链接：' + candidate.href,
      ].join('\n')),
    ].join('\n\n');

    const result = await callAIWithFallback<HelpAssistantResponse>({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      tier: 'flash',
      temperature: 0.2,
      jsonSchema: HELP_ASSISTANT_SCHEMA,
      invocation: {
        route: '/api/help/assistant',
        useCase: 'help.assistant.answer',
        userId: ctx.userId,
        orgId: ctx.orgId,
        metadata: { candidateCount: candidates.length },
      },
    }, {
      timeoutMs: 45_000,
      maxAttempts: 1,
      degradedResponse: buildDegradedResponse(candidates),
    });

    return Response.json({
      ...result,
      model: process.env.AI_MODEL ?? process.env.AI_PRO_MODEL ?? 'configured-llm',
    });
  } catch (err) {
    return guardResponse(err);
  }
}
