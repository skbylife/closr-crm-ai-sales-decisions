// BABEL Engine — Layer 4: Response Strategy
// Takes decoded email output and generates reply strategies with draft emails.

import type { StrategyInput, StrategyOutput, ReplyStrategy } from './types';
import { callAIWithFallback } from './ai-fallback';
import type { ModelTier } from './gemini';
import { BASE_PSYCHOLOGY_FRAMEWORK } from './prompts/base';
import { REPLY_STRATEGY_PROMPT } from './prompts/b2b-sales';

interface GeminiStrategyResponse {
  strategies: Array<{
    name: string;
    goal: string;
    approach: string;
    tone: string;
    urgency: string;
    draft: string;
    success_probability: number;
  }>;
  recommended: number;
  reasoning: string;
}

const DISC_STRATEGY_HINTS: Record<string, string> = {
  D: `此联系人为 D 型（支配型）：
- 邮件要直接、简洁，先说结论再说理由
- 突出 ROI 和竞争优势，不要寒暄铺垫
- 给选项而非单一方案（让他们有掌控感）
- 避免：冗长细节、过度社交、犹豫不决的语气`,
  I: `此联系人为 I 型（影响型）：
- 邮件要热情、有故事感，建立个人连接
- 用成功案例和愿景打动他们
- 加入社交元素（约个咖啡/午餐等）
- 避免：纯数据堆砌、冷冰冰的格式、太长的技术细节`,
  S: `此联系人为 S 型（稳定型）：
- 邮件要温和、有安全感，强调稳定和保障
- 提供明确的下一步（降低决策压力）
- 引用已有客户的成功经验（社会证明）
- 避免：制造紧迫感、突然改变方案、激进的推销语气`,
  C: `此联系人为 C 型（谨慎型）：
- 邮件要有数据支撑、逻辑清晰、条理分明
- 提供详细的技术参数和对比分析
- 给时间思考，不要催促决策
- 避免：模糊承诺、夸大其词、缺少证据的断言`,
};

const DISC_STRATEGY_HINTS_EN: Record<string, string> = {
  D: `This contact is DISC D (Dominant):
- Keep emails direct and concise; lead with the conclusion
- Emphasize ROI and competitive advantage
- Offer options so they retain control
- Avoid long detail, excessive social framing, and hesitant language`,
  I: `This contact is DISC I (Influence):
- Use a warm tone and a clear story
- Use success cases and vision to create energy
- Include light relationship-building when appropriate
- Avoid pure data dumps, cold formatting, and overly long technical detail`,
  S: `This contact is DISC S (Steady):
- Use a calm, low-pressure tone and emphasize reliability
- Provide a clear next step to reduce decision pressure
- Reference proven customer outcomes as social proof
- Avoid artificial urgency, sudden changes, and aggressive selling`,
  C: `This contact is DISC C (Conscientious):
- Use data-backed, logical, well-structured language
- Provide technical detail and comparison points
- Give time to think; do not pressure the decision
- Avoid vague promises, overclaims, and unsupported assertions`,
};

export const STRATEGY_PROMPT_CHAR_BUDGETS = {
  tasks: 1200,
  intel: 1200,
  cil: 5000,
} as const;

function truncatePromptBlock(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const cut = text.lastIndexOf('\n', maxChars);
  const pos = cut > maxChars * 0.5 ? cut : maxChars;
  return `${text.slice(0, pos)}\n…（已截断）`;
}

export function buildStrategyAuxiliaryContext(input: StrategyInput): string {
  const english = input.outputLocale === 'en';
  let taskContext = '';
  if (input.tasks && input.tasks.length > 0) {
    const overdueTasks = input.tasks.filter((t) => t.isOverdue);
    const completedTasks = input.tasks.filter((t) => t.status === 'done');
    const activeTasks = input.tasks.filter((t) => t.status !== 'done');

    taskContext = english
      ? `\n\n=== Related task execution (${input.tasks.length} tasks) ===\nCompleted: ${completedTasks.length} | Active/todo: ${activeTasks.length} | Overdue: ${overdueTasks.length}`
      : `\n\n=== 相关任务执行情况（${input.tasks.length} 个任务）===\n已完成: ${completedTasks.length} 个 | 进行中/待办: ${activeTasks.length} 个 | 逾期: ${overdueTasks.length} 个`;

    if (overdueTasks.length > 0) {
      taskContext += english ? `\n⚠️ Overdue tasks:` : `\n⚠️ 逾期任务：`;
      for (const t of overdueTasks) {
        taskContext += `\n- [${t.priority}] ${t.title}${t.assignedTo ? ` (${t.assignedTo})` : ''}${t.dueDate ? (english ? ` (due: ${t.dueDate})` : `（截止: ${t.dueDate}）`) : ''}`;
      }
    }

    if (activeTasks.length > 0) {
      taskContext += english ? `\nActive tasks:` : `\n当前活跃任务：`;
      for (const t of activeTasks.slice(0, 5)) {
        taskContext += `\n- [${t.priority}/${t.status}] ${t.title}${t.dueDate ? (english ? ` (due: ${t.dueDate})` : `（截止: ${t.dueDate}）`) : ''}`;
      }
    }

    if (completedTasks.length > 0) {
      taskContext += english ? `\nRecently completed tasks:` : `\n最近已完成任务：`;
      for (const t of completedTasks.slice(0, 3)) {
        taskContext += `\n- [${t.priority}/${t.status}] ${t.title}${t.dueDate ? (english ? ` (due: ${t.dueDate})` : `（截止: ${t.dueDate}）`) : ''}`;
      }
    }

    taskContext += english
      ? `\nConsider task execution status in the reply strategy. If many tasks are overdue, recommend clearing urgent items before replying.`
      : `\n请在回复策略中考虑任务执行情况，例如逾期任务多时建议先处理紧急事项再回复。`;
    taskContext = truncatePromptBlock(taskContext, STRATEGY_PROMPT_CHAR_BUDGETS.tasks);
  }

  let intelContext = '';
  if (input.intelItems && input.intelItems.length > 0) {
    intelContext = english ? `\n\n=== Latest intel (${input.intelItems.length}) ===` : `\n\n=== 最新情报（${input.intelItems.length} 条）===`;
    for (const item of input.intelItems) {
      intelContext += `\n- [${item.type}/${item.urgency}] ${item.title}: ${item.summary} (${item.date})`;
    }
    intelContext += english
      ? `\nUse this intel to make the reply strategy more targeted.`
      : `\n请在回复策略中充分考虑以上情报，利用情报中的信息来制定更有针对性的策略。`;
    intelContext = truncatePromptBlock(intelContext, STRATEGY_PROMPT_CHAR_BUDGETS.intel);
  }

  const cilBlock = truncatePromptBlock(input.cilContext || '', STRATEGY_PROMPT_CHAR_BUDGETS.cil);

  return `${taskContext}${intelContext}${cilBlock}`;
}

export function buildStrategyPrompt(input: StrategyInput): { system: string; user: string } {
  const outputLocale = input.outputLocale ?? 'zh';
  const english = outputLocale === 'en';
  const discHint = input.contactDiscType
    ? (english ? DISC_STRATEGY_HINTS_EN : DISC_STRATEGY_HINTS)[input.contactDiscType.toUpperCase()] ?? ''
    : '';
  const discBlock = discHint
    ? english
      ? `\n## DISC Communication Adaptation\n${discHint}\nAll draft replies must follow this DISC communication style.`
      : `\n## DISC 沟通风格适配\n${discHint}\n所有 draft 回复必须严格遵循上述 DISC 沟通风格要求。`
    : '';

  const system = [
    BASE_PSYCHOLOGY_FRAMEWORK,
    REPLY_STRATEGY_PROMPT,
    discBlock,
    `
## Output Schema

Return valid JSON matching this exact structure:
{
  "strategies": [
    {
      "name": "Strategy name (e.g. 'The Consultative Close', 'Strategic Patience')",
      "goal": "What this strategy aims to achieve",
      "approach": "A short bullet-style explanation of what to do",
      "tone": "The tone to use (e.g. confident, empathetic, urgent, collaborative)",
      "urgency": "When to send (e.g. 'Within 2 hours', 'Tomorrow morning', 'Wait 3 days')",
      "draft": "A complete, ready-to-send email reply draft",
      "success_probability": 0.0-1.0
    }
  ],
  "recommended": 0,
  "reasoning": "One sentence explaining why this strategy is recommended"
}

Generate exactly 3 strategies:
1. One conservative/safe approach
2. One balanced/strategic approach
3. One assertive/bold approach

Each draft should be a complete email reply that feels natural and human — not template-like.

## Draft Quality Rules
- Each draft must be a complete email and must not stop halfway.
- Each draft must include greeting, response to the customer's concern, clear next step, and natural closing.
- Do not output only an outline or an unfinished partial draft.
- The 3 drafts should be similar in completeness and length.
- Each draft should be at least 220 Chinese characters or 140 English words unless the original customer email is very short.
- Before output, rewrite any draft that does not read like a ready-to-send complete email.

## Language Rule
- name, goal, approach, tone, urgency, reasoning → use ${english ? 'English' : 'Chinese'}.
- draft → use the same language as the customer's original email.
- JSON keys remain English and must not be translated.`,
  ].join('\n\n');

  const decodedSummary = input.decodedMessage.messages
    .map(
      (m) =>
        `[${m.speaker === 'them' ? 'CLIENT' : 'YOU'}] Original: "${m.original}"\n  Meaning: ${m.decode?.meaning}\n  Emotion: ${m.decode.emotion}\n  Urgency: ${m.decode.urgency}/10`
    )
    .join('\n\n');

  const ta = input?.decodedMessage?.threadAnalysis;
  const threadSummary = `Thread Analysis:
- Sentiment trend: ${ta.sentimentTrend}
- Risk level: ${ta.riskLevel}
- Buyer state: ${ta.buyerState}
- Key signal: ${ta.keySignal}`;

  const contextParts: string[] = [];
  if (input.companyContext?.painPoints?.length) {
    contextParts.push(`Pain points: ${input.companyContext.painPoints.join(', ')}`);
  }
  if (input.competitiveContext?.knownCompetitors?.length) {
    contextParts.push(`Competitors: ${input.competitiveContext.knownCompetitors.join(', ')}`);
  }
  const contextLine = contextParts.length ? `\nContext: ${contextParts.join('. ')}` : '';

  const auxiliaryContext = buildStrategyAuxiliaryContext(input);

  const user = `Based on the following decoded email thread, generate 3 reply strategies:

${decodedSummary}

${threadSummary}
${contextLine}${auxiliaryContext}

Generate strategies that address the client's intent signals and advance the deal.`;

  return { system, user };
}

function normalizeResponse(raw: GeminiStrategyResponse): StrategyOutput {
  const strategies: ReplyStrategy[] = (raw.strategies ?? []).map((s) => ({
    name: s.name ?? 'Untitled Strategy',
    goal: s.goal ?? '',
    approach: s.approach ?? '',
    tone: s.tone ?? '',
    urgency: s.urgency ?? '',
    draft: s.draft ?? '',
    successProbability: Math.max(0, Math.min(1, s.success_probability ?? 0.5)),
  }));

  return {
    strategies,
    recommended: Math.max(0, Math.min(strategies.length - 1, raw.recommended ?? 0)),
    reasoning: raw.reasoning ?? '',
  };
}

const DEGRADED_STRATEGY: GeminiStrategyResponse = {
  strategies: [
    {
      name: '跟进确认',
      goal: 'AI 暂时不可用，建议先发一封简短跟进邮件',
      approach: '保持联系，确认对方收到了上一封邮件，询问是否有任何问题或顾虑',
      tone: '友好、专业',
      urgency: '1-2 个工作日内',
      draft: '您好，\n\n感谢您的来信。想确认您是否收到了我们之前的邮件，并了解是否有任何问题需要我们解答。\n\n期待您的回复。\n\n此致',
      success_probability: 0.6,
    },
  ],
  recommended: 0,
  reasoning: 'AI 服务暂时不可用，提供基础跟进建议。',
};

const DEGRADED_STRATEGY_EN: GeminiStrategyResponse = {
  strategies: [
    {
      name: 'Follow-up confirmation',
      goal: 'AI is temporarily unavailable; send a short follow-up email first',
      approach: 'Keep the relationship warm, confirm the customer received the last message, and ask whether any questions or concerns remain',
      tone: 'Friendly and professional',
      urgency: 'Within 1-2 business days',
      draft: 'Hi,\n\nThank you for your note. I wanted to confirm that you received our previous email and check whether there are any questions we can help clarify.\n\nLooking forward to your reply.\n\nBest,',
      success_probability: 0.6,
    },
  ],
  recommended: 0,
  reasoning: 'AI is temporarily unavailable, so a basic follow-up strategy is provided.',
};

export async function generateStrategy(
  input: StrategyInput,
  options?: { tier?: ModelTier },
): Promise<StrategyOutput> {
  const { system, user } = buildStrategyPrompt(input);
  const raw = await callAIWithFallback<GeminiStrategyResponse>(
    {
      systemPrompt: system,
      userPrompt: user,
      tier: options?.tier,
    },
    { degradedResponse: input.outputLocale === 'en' ? DEGRADED_STRATEGY_EN : DEGRADED_STRATEGY },
  );
  return normalizeResponse(raw);
}
