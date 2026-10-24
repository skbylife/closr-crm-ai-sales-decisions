/**
 * Sales Agent 核心逻辑
 *
 * 功能：
 * 1. 接受用户消息 + 对话上下文
 * 2. 调用 LLM（DeepSeek/OpenAI-compatible）+ function calling
 * 3. 防幻觉验证
 * 4. 返回回复 + 待确认操作（前端渲染确认卡片）
 */

import { SALES_AGENT_TOOLS, SEARCH_TOOL_NAMES } from './tools/index';
import { defaultTaskOutcomeJudgmentImpact, TASK_OUTCOME_LABEL, type TaskOutcome } from '@/lib/judgment/task-outcome';
import { validateToolCall, type ToolCallValidation } from './anti-hallucination';
import {
  executeSearchContacts,
  executeSearchAccounts,
  executeSearchOpportunities,
} from './tools/search';
import { executeReadAccountContext } from './tools/read-context';
import {
  DEFAULT_DEEPSEEK_FLASH_MODEL,
  getAiProviderConfig,
  getAiChatCompletionsUrl,
} from '@/lib/ai-provider-config';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  detectJudgmentFeedbackIntent,
  detectWinLossCalibrationIntent,
  formatJudgmentContextAnswer,
  formatJudgmentContextForPrompt,
  isJudgmentContextAsk,
  type AgentJudgmentContext,
} from './judgment-context';

export interface ChatContext {
  opportunityId?: string;
  contactId?: string;
  accountId?: string;
  userId?: string;
  orgId?: string;
  currentPage?: string;
  // 当前客户的联系人列表（含 id，供 agent 按姓名匹配）
  currentAccountContacts?: { id: string; name: string; role?: string; title?: string }[];
  currentOpportunityName?: string;
  currentAccountName?: string;
  stagnationHints?: string[];
  intelActionHints?: string[];
  /** Pre-computed deal health for current opportunity context */
  dealHealth?: DealHealthSummary;
  /** Active tasks for current account/opportunity context */
  tasks?: { id: string; title: string; status: string; priority?: string; dueDate?: string; assignee?: string; accountId?: string | null; opportunityId?: string | null; contactId?: string | null; account_id?: string | null; opportunity_id?: string | null; contact_id?: string | null }[];
  /** Recent intel signals for current account context */
  intelItems?: { content?: string; priority?: string; signalType?: string }[];
  /** Trusted server-loaded Judgment Layer context for current account */
  judgmentContext?: AgentJudgmentContext;
}

type ChatContextTask = NonNullable<ChatContext['tasks']>[number];

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export type SalesAgentBlockerCode =
  | 'no_champion'
  | 'no_decision_maker'
  | 'budget_unknown'
  | 'timeline_unclear'
  | 'stalled_progress'
  | 'single_threaded'
  | 'missing_signal'
  | 'stale_intel'
  | 'unknown';

export type NextActionType =
  | 'schedule_meeting'
  | 'create_task'
  | 'update_stage'
  | 'add_contact'
  | 'send_followup'
  | 'escalate'
  | 'gather_intel'
  | 'general';

export interface NextActionSuggestion {
  actionType: NextActionType;
  targetEntityType?: 'contact' | 'account' | 'opportunity';
  targetEntityId?: string;
  targetEntityName?: string;
  description: string;
  evidence?: string;
  urgency: 'high' | 'medium' | 'low';
  /** Pre-filled chat message the frontend can send to trigger this action via tool calls */
  quickActionText?: string;
  /** Suggested owner (userId or role hint) for task creation */
  owner?: string;
  /** Suggested due date (ISO date string) derived from urgency */
  dueDate?: string;
  /** Position in multi-step action plan (1-based) */
  sequenceIndex?: number;
}

export interface DealHealthSummary {
  level: 'healthy' | 'at_risk' | 'critical';
  stagnationScore: number;
  reasons: string[];
  daysSinceActivity: number;
}

export interface SalesAgentProgression {
  currentJudgment: string;
  mainBlocker: string;
  blockerCode?: SalesAgentBlockerCode;
  nextBestAction: string;
  recommendedTarget: string;
  reason: string;
  riskNote: string;
  nextAction?: NextActionSuggestion;
  /** Multi-step action plan (ordered) when progression is complex */
  actionPlan?: NextActionSuggestion[];
  /** Deal health summary attached to progression output */
  dealHealth?: DealHealthSummary;
}

export interface SalesAgentResponse {
  reply: string;
  mode?: 'chat' | 'progression';
  progression?: SalesAgentProgression;
  pendingActions?: ToolCallValidation[];
  requiresConfirmation: boolean;
}

/**
 * 完整的防幻觉 System Prompt
 * 基于 PRD 第 2.3 节"五层防幻觉机制"
 */
const SALES_AGENT_SYSTEM_PROMPT = `你是 Closr 的 AI 销售助手。你有两个核心能力：

## Agent 边界
- 你只负责销售推进、客户/商机分析、行动建议、以及基于用户原话写入 Closr
- 如果用户是在请求对接外部服务、连接平台、邮箱授权、CRM 接入、企业微信/Outlook/Gmail/Salesforce/HubSpot 等集成，请不要假装自己能处理配置流程
- 遇到这类对接请求时，明确告诉用户：这需要由对接助手处理
- 不要把“工具对接”问题回答成销售建议，也不要生成伪配置步骤

## Progression Mode
- 只有当用户明确在问“下一步怎么推进 / 怎么推这单 / 卡在哪里 / 应该找谁推进 / 怎么提高赢单率 / deal 是否卡住”这类推进问题时，才进入 progression mode
- progression mode 下，你的回答必须覆盖：当前判断、最大阻塞、下一步最优动作、推荐推进对象、理由、风险提示
- 如果用户不是在问推进问题，就保持正常聊天模式，问什么答什么，不要强行套六段式结构

## 1. 回答销售问题（对话模式）
当用户提问时，直接给出有价值的回答：
- 分析客户局势、识别风险、给出行动建议
- 基于上下文数据（客户/商机/联系人/任务）回答
- 问什么答什么，不废话，不在回复开头加"好的/明白/当然"
- 当提到具体实体时，**必须**用 Markdown 链接格式让用户可以点击跳转：
  - 联系人 → [联系人姓名](/contacts/UUID)
  - 商机 → [商机名称](/pipeline/UUID)
  - 客户公司 → [公司名称](/accounts/UUID)
  - 任务 → **任务名称**（任务无详情页，仅加粗）
  示例：建议重点跟进 [刘总](/contacts/abc-123) 在 [平台云基础设施迁移](/pipeline/def-456) 上的进展
- 回复长度根据问题自然决定

## 2. 写入 Closr（工具调用模式）
当用户陈述事实或说要记录某些信息时，提取数据并调用工具写入 Closr：

### 信息提取规则（写入时必须遵守）

### 绝对禁止
1. 禁止在没有用户原话支撑的情况下填写任何字段
2. 禁止使用以下词汇填写字段值："可能"、"应该"、"大概"、"看起来"、"似乎"、"推测"
3. 禁止根据"常识"或"行业惯例"补充用户没说的信息
4. 禁止合并或推断两个不同陈述之间的关系
5. 所有 tool call 的 source_quote 参数必须填写，不可为空字符串

### 必须遵守
1. 每个字段必须附带 source_quote（用户原话的精确引用）
2. 没有原话支撑的字段值必须设为 null，不得填写默认值
3. 用户说的话有歧义时，必须在回复中说明需要澄清的内容，不要猜测
4. 数字（金额、时间、人数）必须完全匹配用户原话，不得换算或推断年份

### 置信度评级
- explicit：用户明确、直接说出的信息（例如"预算是500万"）→ 可直接写入
- implied：用户暗示但未直接说明的信息（例如"差不多Q3"）→ 需要确认
- inferred：只有通过推理才能得出的信息 → 禁止写入，在回复中标注❓

### 字段为空的处理
如果用户没有提到某个字段，该字段的值必须是 null。
不允许因为"这个字段通常应该有值"而填写默认值。

## 搜索工具（自动执行，无需确认）

你有 4 个只读工具，用于在 Closr 中查找和读取数据：
- read_account_context：按客户ID读取服务端客户上下文包（联系人、商机、任务、情报、邮件解读、谋局、活动、证据、开放问题）
- search_contacts：按姓名/邮箱/电话搜索联系人
- search_accounts：按公司名搜索客户（返回关联联系人）
- search_opportunities：按名称搜索商机

### 何时使用搜索
- 用户询问当前客户/某个客户的历史、反馈、全部上下文、判断依据、最近活动、任务、邮件解读、谋局或开放问题 → 必须先调用 read_account_context
- 不要只依赖前端传入的上下文快照；前端上下文只代表当前页面提示，完整读取必须走 read_account_context
- 用户提到某个人名，但上下文中没有对应的 contactId → 先调用 search_contacts
- 用户提到某个公司，但上下文中没有 accountId → 先调用 search_accounts
- 用户提到某个商机名，但上下文中没有 opportunityId → 先调用 search_opportunities
- 搜到结果后，用返回的 id 继续调用写入工具
- 搜不到时，告诉用户"在 Closr 中未找到「XXX」，请确认名称是否正确"

### 搜索规则
- 搜索工具会自动执行，不需要用户确认
- 一次只搜一个关键词，不要批量搜索
- 搜索结果中有多个匹配时，列出让用户选择

## 工具调用规则

1. 一次对话中，只调用有充分用户原话支撑的工具
2. 对于 implied 字段，先在回复中用 ⚠️ 标注，然后仍然调用工具（前端会展示确认卡片）
3. 对于 inferred 字段，在回复中用 ❓ 展示供参考，但不调用工具写入
4. 关键字段（预算/日期/阶段变更）单独展示，需要用户明确确认

## 回复格式

用中文回复。**问什么答什么，不要多说。**

规则：
- 用户陈述一个事实 → 只确认你要记录什么，不要分析背景
- 不要加"好的"、"明白了"等废话开场
- 不要在回复结尾加建议或引导
- 回复长度根据问题自然决定，不要人为填充或压缩

## 绝对禁止向用户暴露的内部信息
- 系统 ID（如 acc_xxx、opp_xxx、con_xxx、UUID 等）→ 用客户名/商机名/联系人姓名代替
- 内部路径（如 /pipeline、/accounts/xxx）→ 用 Markdown 链接包裹，不要裸露路径
- 英文字段名和枚举值（如 health、at_risk、critical、stage、status）→ 翻译成中文自然语言
- 技术术语（stagnation_score、deal_health.level）→ 用业务含义表述
- 你收到的上下文数据仅供你理解用户局势，不要在回复中直接复制这些结构化数据

展示即将执行的操作时：

✅ [字段] [值]（来自：「用户原话」）  
⚠️ [字段] [值]（需要确认：[歧义说明]）  
❓ [字段] [值]（推断，不写入）`;

interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMResponse {
  content: string | null;
  tool_calls?: LLMToolCall[];
  reasoning_content?: string | null;
}

/** 支持 tool 角色的消息类型（用于搜索工具的结果回注） */
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  reasoning_content?: string | null;
}

/**
 * 输出兜底：清理 LLM 回复中可能泄露的内部语义
 * - 移除裸露的系统 ID（acc_xxx, opp_xxx, con_xxx, UUID 等，但保留 Markdown 链接内的）
 * - 移除裸露的内部路径（/pipeline/xxx 等，但保留 Markdown 链接格式的）
 * - 将泄露的英文枚举值替换为中文
 */
function sanitizeReply(text: string): string {
  let result = text;

  // Replace leaked English enum values with Chinese equivalents
  const enumMap: Record<string, string> = {
    'at_risk': '有风险',
    'critical': '严重',
    'healthy': '健康',
    'health': '健康度',
    'stagnation_score': '停滞评分',
    'deal_health': '商机健康度',
    'provisional': '待验证',
    'invalidated': '已被修正',
    'source_records': '证据记录',
    'source_record': '证据记录',
    'confidence': '把握度',
    'engine': '系统',
    'BABEL': '系统',
  };
  for (const [eng, chn] of Object.entries(enumMap)) {
    // Only replace when it appears as a standalone term (not inside a URL or code)
    result = result.replace(new RegExp(`(?<![/\\w])${eng.replace(/_/g, '_')}(?![\\w/])`, 'gi'), chn);
  }

  // Remove bare system IDs (acc_xxx, opp_xxx, con_xxx patterns) not inside markdown links
  // Preserve: [label](/path/id) but remove: acc_huawei_001, opp_xxx_123
  result = result.replace(/(?<!\(\/[^\s)]*)\b(acc|opp|con|org|usr|task)_[a-z0-9_-]{3,}\b/gi, () => {
    // If this ID is part of a markdown link path, keep it (handled by negative lookbehind above)
    return '';
  });

  // Remove bare UUIDs not inside markdown links
  result = result.replace(/(?<!\(\/[^\s)]*)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '');

  // Remove bare internal paths like /pipeline/xxx, /accounts/xxx (not in markdown link format)
  // Markdown link format [text](/path/id) is preserved
  result = result.replace(/(?<!\]\s*\()\/(?:pipeline|accounts|contacts)\/[A-Za-z0-9_-]+/g, '');

  // Clean up artifacts: double spaces, empty parentheses, trailing colons with no content
  result = result.replace(/\(\s*\)/g, '');
  result = result.replace(/  +/g, ' ');
  result = result.replace(/^\s*[-*]\s*$/gm, '');

  return result.trim();
}

function isProgressionAsk(message: string): boolean {
  const lower = message.toLowerCase();
  const progressionPatterns = [
    '下一步怎么推进', '下一步怎么做', '怎么推进', '怎么推', '卡在哪里', '卡住了', '应该找谁', '赢单率', '还有没有戏', 'deal 是否卡住', '怎么 close',
  ];

  return progressionPatterns.some((pattern) => lower.includes(pattern));
}

function judgmentFeedbackKindFromMessage(message: string): string {
  if (/证据|依据|没有.*支撑|缺/.test(message)) return 'missing_evidence';
  if (/过期|旧了|不是现在|已经变/.test(message)) return 'stale';
  if (/推断|脑补|想当然/.test(message)) return 'over_inferred';
  return 'inaccurate';
}

function createPendingAction(params: {
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
  fields: Array<{ field: string; value: string | null; source_quote: string; confidence?: 'explicit' | 'implied'; needs_clarification?: string }>;
}): ToolCallValidation {
  return {
    toolName: params.toolName,
    displayName: params.displayName,
    args: params.args,
    fields: params.fields.map((field) => ({
      field: field.field,
      value: field.value,
      confidence: field.confidence ?? 'explicit',
      source_quote: field.source_quote,
      needs_clarification: field.needs_clarification,
    })),
    requiresConfirmation: true,
    blockedFields: [],
    missingSourceQuotes: [],
  };
}

function buildJudgmentFeedbackPendingAction(message: string, context: ChatContext): ToolCallValidation | null {
  if (!context.accountId) return null;
  const content = message.trim();
  if (!content) return null;
  const args = {
    accountId: context.accountId,
    targetType: 'judgment',
    targetId: `account:${context.accountId}`,
    kind: judgmentFeedbackKindFromMessage(message),
    content,
    previousSummary: context.judgmentContext?.currentJudgment ?? null,
    source_quote: content,
  };
  return createPendingAction({
    toolName: 'record_judgment_feedback',
    displayName: '记录判断修正',
    args,
    fields: [
      { field: '客户', value: context.currentAccountName ?? '当前客户', source_quote: content },
      { field: '修正内容', value: content, source_quote: content },
      { field: '原判断', value: context.judgmentContext?.currentJudgment ?? '当前判断', source_quote: content },
    ],
  });
}

function outcomeLabel(outcome: 'won' | 'lost' | 'stalled'): string {
  if (outcome === 'won') return '赢单';
  if (outcome === 'lost') return '丢单';
  return '停滞';
}

function buildWinLossPendingAction(message: string, context: ChatContext, outcome: 'won' | 'lost' | 'stalled'): ToolCallValidation | null {
  if (!context.accountId) return null;
  const notes = message.trim();
  if (!notes) return null;
  const args = {
    accountId: context.accountId,
    opportunityId: context.opportunityId ?? null,
    outcome,
    notes,
    previousJudgment: context.judgmentContext?.currentJudgment ?? null,
    previousRisk: context.judgmentContext?.keyRisks?.[0] ?? null,
    previousNextAction: context.judgmentContext?.nextActions?.[0] ?? null,
    source_quote: notes,
  };
  return createPendingAction({
    toolName: 'record_win_loss_calibration',
    displayName: '记录成交/丢单复盘',
    args,
    fields: [
      { field: '客户', value: context.currentAccountName ?? '当前客户', source_quote: notes },
      { field: '结果', value: outcomeLabel(outcome), source_quote: notes },
      { field: '原因/复盘', value: notes, source_quote: notes },
      { field: '关联商机', value: context.currentOpportunityName ?? (context.opportunityId ? '当前商机' : '未指定'), source_quote: notes },
    ],
  });
}

function isCreateTaskActionIntent(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  if (!compact) return false;

  const negativeIntentPatterns = [
    /(不要|别|先别|先不要|不用|无需|不必|别再|不要再).{0,12}(创建|新建|建|安排|生成|加|转成|变成|变为|落成).{0,8}任务/,
    /(不要|别|先别|先不要|不用|无需|不必|别再|不要再).{0,12}(安排|提醒).{0,12}(跟进|联系|提醒)?/,
    /(暂时|先).{0,6}(不要|别|不用).{0,12}(建任务|创建任务|安排|提醒)/,
    /不需要.{0,12}(创建任务|建任务|安排|提醒)/,
  ];
  if (negativeIntentPatterns.some((pattern) => pattern.test(compact))) return false;

  const positiveIntentPatterns = [
    /(?:帮我|请|麻烦|给我)?(?:创建|新建|建|安排|生成|加)(?:一个|个)?(?:跟进|调研|联系|提醒)?任务/,
    /(?:把|将).{0,24}(?:下一步|动作|行动|事项|跟进|这一步).{0,12}(?:变成|变为|转成|落成|生成)(?:一个|个)?任务/,
    /(?:安排|创建|新建|建|加)(?:一个|个)?.{0,8}(?:跟进|联系|调研|提醒)/,
    /提醒我.{0,20}(?:跟进|联系|约|确认|核实|推进)/,
    /设(?:个|一个)?提醒.{0,20}(?:跟进|联系|约|确认|核实|推进)?/,
  ];
  return positiveIntentPatterns.some((pattern) => pattern.test(compact));
}

function roleLabel(role?: string | null): string {
  const labels: Record<string, string> = {
    decision_maker: '决策人',
    champion: '内部推动者',
    technical_evaluator: '技术评估人',
    procurement: '采购',
    influencer: '影响者',
    blocker: '阻力方',
  };
  return role ? (labels[role] ?? role) : '';
}

function extractOpportunityNameForContactAsk(message: string, context: ChatContext, history: ChatMessage[]): string | null {
  if (!/(联系人|干系人|相关人|谁)/.test(message) || !/(商机|项目|deal|机会)/i.test(message)) {
    return null;
  }

  if (context.currentOpportunityName) return context.currentOpportunityName;

  const beforeMarker = message.match(/^(.{2,80}?)(?:这个|这条|该)?(?:商机|项目|deal|机会).*?(?:联系人|干系人|相关人|谁)/i)?.[1]?.trim();
  if (beforeMarker) {
    return beforeMarker.replace(/[，,。.!！?？]$/g, '').trim();
  }

  const linkedOpportunityNames = history
    .slice(-6)
    .flatMap((item) => Array.from(item.content.matchAll(/\[([^\]]{2,80})\]\(\/pipeline\/[^)]+\)/g)).map((match) => match[1]));
  return linkedOpportunityNames.at(-1) ?? null;
}

async function answerOpportunityContactsAsk(
  message: string,
  context: ChatContext,
  history: ChatMessage[],
): Promise<SalesAgentResponse | null> {
  if (!context.userId) return null;
  const opportunityName = extractOpportunityNameForContactAsk(message, context, history);
  if (!opportunityName) return null;

  const result = await executeSearchOpportunities({
    query: opportunityName,
    userId: context.userId,
    limit: 3,
  });
  if (!result.success) return null;

  const opportunities = (Array.isArray(result.data) ? result.data : []) as Array<{
    id: string;
    name: string;
    accountName?: string | null;
    contacts?: Array<{ id: string; name: string; title?: string | null; role?: string | null }>;
  }>;

  if (opportunities.length === 0) {
    return {
      reply: `在 Closr 中未找到「${opportunityName}」，请确认商机名称是否正确。`,
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  if (opportunities.length > 1) {
    const lines = opportunities.map((opportunity) => `- [${opportunity.name}](/pipeline/${opportunity.id})${opportunity.accountName ? `（${opportunity.accountName}）` : ''}`);
    return {
      reply: `找到多个匹配商机，请先确认是哪一个：\n${lines.join('\n')}`,
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  const opportunity = opportunities[0];
  const contacts = opportunity.contacts ?? [];
  if (contacts.length === 0) {
    return {
      reply: `[${opportunity.name}](/pipeline/${opportunity.id}) 暂时没有关联联系人。`,
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  const contactLines = contacts.map((contact) => {
    const detail = [contact.title, roleLabel(contact.role)].filter(Boolean).join('，');
    return `- [${contact.name}](/contacts/${contact.id})${detail ? `：${detail}` : ''}`;
  });

  return {
    reply: `[${opportunity.name}](/pipeline/${opportunity.id}) 关联客户是 ${opportunity.accountName ?? '当前客户'}，联系人有：\n${contactLines.join('\n')}`,
    mode: 'chat',
    requiresConfirmation: false,
  };
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function endOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilFriday = day <= 5 ? 5 - day : 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d.toISOString().split('T')[0];
}

function parseTaskDueDate(message: string): { dueDate: string | null; label: string; explicit: boolean } {
  if (/今天|今日/.test(message)) return { dueDate: addDays(0), label: '今天', explicit: true };
  if (/明天|明日/.test(message)) return { dueDate: addDays(1), label: '明天', explicit: true };
  if (/后天/.test(message)) return { dueDate: addDays(2), label: '后天', explicit: true };
  if (/本周内|这周内|本周/.test(message)) return { dueDate: endOfCurrentWeek(), label: '本周内', explicit: true };
  if (/下周/.test(message)) return { dueDate: addDays(7), label: '下周', explicit: true };
  return { dueDate: null, label: '建议明天', explicit: false };
}

function inferTaskPriority(message: string, due: { label: string; explicit: boolean }): 'high' | 'medium' | 'low' {
  if (/紧急|马上|立刻|尽快|今天|今日/.test(message)) return 'high';
  if (/有空|不急|低优先/.test(message)) return 'low';
  if (due.explicit && due.label === '明天') return 'medium';
  return 'medium';
}

function normalizeContactNameForMention(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const withoutTitle = trimmed.replace(/[总经理先生女士老师]$/g, '');
  const surname = withoutTitle.length > 1 ? withoutTitle.slice(0, 1) : withoutTitle;
  return Array.from(new Set([trimmed, withoutTitle, `${withoutTitle}总`, `${surname}总`].filter(Boolean)));
}

function resolveMentionedContact(
  message: string,
  contacts?: { id: string; name: string; role?: string; title?: string }[],
): { id: string; name: string; role?: string; title?: string } | undefined {
  if (!contacts?.length) return undefined;
  return contacts.find((contact) => normalizeContactNameForMention(contact.name).some((name) => message.includes(name)));
}

function buildTaskTitle(message: string, context: ChatContext, contactName?: string): string {
  if (contactName && /跟进|联系|约|沟通/.test(message)) {
    if (/确认|核实|验证/.test(message)) return `跟进${contactName}确认关键信息`;
    return `跟进${contactName}`;
  }

  if (/下一步/.test(message)) {
    const fromJudgment = context.judgmentContext?.nextActions?.[0];
    if (fromJudgment) return fromJudgment.replace(/[。.!！]$/g, '');
  }

  if (/假设/.test(message)) {
    const uncertainty = context.judgmentContext?.uncertainties?.[0];
    if (uncertainty) return `验证：${uncertainty.replace(/[。.!！]$/g, '')}`;
  }

  const quoted = message
    .replace(/^(帮我|请|把|给我|麻烦)?/g, '')
    .replace(/(创建|新建|建个?|安排|加个|生成|转成|变成|变为|落成)?(一个)?(跟进)?任务/g, '')
    .replace(/(提醒我|提醒)/g, '')
    .replace(/(今天|今日|明天|明日|后天|本周内|这周内|本周|下周)/g, '')
    .replace(/[，,。.!！?？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (quoted && quoted.length <= 40) return quoted;
  if (context.judgmentContext?.nextActions?.[0]) return context.judgmentContext.nextActions[0].replace(/[。.!！]$/g, '');
  return contactName ? `跟进${contactName}` : '跟进当前客户下一步动作';
}

function buildCreateTaskPendingAction(message: string, context: ChatContext): ToolCallValidation | null {
  if (!isCreateTaskActionIntent(message)) return null;
  if (!context.accountId && !context.opportunityId) return null;

  const sourceQuote = message.trim();
  const contact = resolveMentionedContact(sourceQuote, context.currentAccountContacts);
  const due = parseTaskDueDate(sourceQuote);
  const priority = inferTaskPriority(sourceQuote, due);
  const title = buildTaskTitle(sourceQuote, context, contact?.name);
  const descriptionParts = [
    `来源：用户确认创建任务（${sourceQuote}）`,
    context.judgmentContext?.currentJudgment ? `当前判断：${context.judgmentContext.currentJudgment}` : null,
    context.currentOpportunityName ? `关联商机：${context.currentOpportunityName}` : null,
  ].filter(Boolean);

  const args = {
    title,
    description: descriptionParts.join('\n'),
    accountId: context.accountId ?? null,
    opportunityId: context.opportunityId ?? null,
    contactId: contact?.id ?? context.contactId ?? null,
    dueDate: due.dueDate,
    suggestedDueDate: due.explicit ? null : due.label,
    priority,
    assignedTo: context.userId ?? null,
    source_quote: sourceQuote,
  };

  const fields: Array<{ field: string; value: string | null; source_quote: string; confidence?: 'explicit' | 'implied'; needs_clarification?: string }> = [
    { field: '任务标题', value: title, source_quote: sourceQuote },
    { field: '任务描述', value: descriptionParts.join('\n'), source_quote: sourceQuote },
    { field: '客户', value: context.currentAccountName ?? (context.accountId ? '当前客户' : null), source_quote: sourceQuote },
  ];

  if (context.opportunityId || context.currentOpportunityName) {
    fields.push({ field: '关联商机', value: context.currentOpportunityName ?? '当前商机', source_quote: sourceQuote });
  }
  if (contact) {
    fields.push({ field: '关联联系人', value: contact.name, source_quote: sourceQuote });
  }
  fields.push(
    due.explicit
      ? { field: '截止日期', value: due.dueDate, source_quote: sourceQuote }
      : { field: '建议截止时间', value: due.label, source_quote: sourceQuote, confidence: 'implied', needs_clarification: '你没有指定日期，确认时不会自动写入截止日期' },
    { field: '优先级', value: priority, source_quote: sourceQuote },
    { field: '负责人', value: context.userId ? '当前用户' : '未指定', source_quote: sourceQuote, confidence: 'implied' },
  );

  return createPendingAction({
    toolName: 'create_task',
    displayName: '创建跟进任务',
    args,
    fields,
  });
}

type NaturalIntakeKind = 'activity' | 'intel' | 'discovery';

interface NaturalIntakeRoute {
  kind: NaturalIntakeKind;
  displayName: string;
  toolName: 'log_activity' | 'add_intel' | 'add_discovery_note';
}

function isQuestionLike(message: string): boolean {
  return /[?？]$/.test(message.trim()) || /(怎么|为什么|是否|是不是|能不能|可不可以|如何|哪些|什么|谁|哪里)/.test(message);
}

function isNaturalIntakeIntent(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  if (!compact || compact.length < 8) return false;
  if (isQuestionLike(compact)) return false;
  if (/(不要|别|无需|不用).{0,8}(记录|写入|记一下|保存)/.test(compact)) return false;
  return /(记录一下|记一下|保存一下|同步一下|更新一下|录入一下|客户反馈|会议纪要|刚开完会|开会说|电话里|通话里|邮件里|客户说|客户提到|客户表示|反馈说|李总说|王总说|张总说|CFO说|采购说)/i.test(compact);
}

function inferActivityType(message: string): 'call' | 'meeting' | 'email' | 'visit' | 'demo' {
  if (/邮件|email/i.test(message)) return 'email';
  if (/电话|通话|call/i.test(message)) return 'call';
  if (/拜访|到访|现场/.test(message)) return 'visit';
  if (/演示|demo/i.test(message)) return 'demo';
  return 'meeting';
}

function inferIntelType(message: string): 'budget' | 'competitor' | 'timeline' | 'stakeholder' | 'risk' | 'opportunity' {
  if (/预算|采购|审批|费用|金额|报价/.test(message)) return 'budget';
  if (/竞品|竞争|对手|替代|友商/.test(message)) return 'competitor';
  if (/时间|日期|下周|本周|月底|季度|延期|推迟|排期|上线/.test(message)) return 'timeline';
  if (/CFO|CEO|CTO|CIO|采购|法务|决策人|Champion|关键人|老板|总/.test(message)) return 'stakeholder';
  if (/风险|卡住|反对|担心|暂停|搁置|不确定|没批|未批|阻塞/.test(message)) return 'risk';
  return 'opportunity';
}

function inferDiscoveryNoteType(message: string): 'pain_point' | 'need' | 'budget' | 'timeline' | 'decision_process' | 'competitor' | 'other' {
  if (/痛点|问题|困难|卡点|挑战/.test(message)) return 'pain_point';
  if (/需求|需要|想要|希望|要求/.test(message)) return 'need';
  if (/预算|采购|审批|费用|金额|报价/.test(message)) return 'budget';
  if (/时间|日期|下周|本周|月底|季度|延期|推迟|排期|上线/.test(message)) return 'timeline';
  if (/决策|流程|采购|法务|审批|CFO|CEO|CTO|CIO/.test(message)) return 'decision_process';
  if (/竞品|竞争|对手|替代|友商/.test(message)) return 'competitor';
  return 'other';
}

function inferIntakePriority(message: string): 'high' | 'medium' | 'low' {
  if (/紧急|马上|立刻|尽快|今天|风险|卡住|反对|没批|暂停|搁置|CFO|CEO|采购|法务/.test(message)) return 'high';
  if (/不急|低优先|有空/.test(message)) return 'low';
  return 'medium';
}

function extractNextSteps(message: string): string | null {
  const match = message.match(/(?:下一步|后续|接下来|下步)(?:是|：|:)?(.{4,80})/);
  return match?.[1]?.trim().replace(/[。.!！?？]$/g, '') ?? null;
}

function shouldAddIntel(message: string): boolean {
  return /(预算|采购|审批|竞品|竞争|对手|时间|延期|推迟|上线|CFO|CEO|CTO|CIO|决策人|Champion|关键人|风险|卡住|反对|暂停|搁置|扩容|机会)/i.test(message);
}

function shouldAddDiscovery(message: string): boolean {
  return /(需求|需要|痛点|问题|困难|决策流程|采购流程|时间线|预算|竞品)/.test(message);
}

function buildNaturalIntakePendingActions(message: string, context: ChatContext): ToolCallValidation[] | null {
  if (!isNaturalIntakeIntent(message)) return null;
  if (!context.accountId && !context.opportunityId) return null;

  const sourceQuote = message.trim();
  const actions: ToolCallValidation[] = [];
  const priority = inferIntakePriority(sourceQuote);
  const routes: NaturalIntakeRoute[] = [
    { kind: 'activity', toolName: 'log_activity', displayName: '记录销售活动' },
  ];

  if (context.accountId && shouldAddIntel(sourceQuote)) {
    routes.push({ kind: 'intel', toolName: 'add_intel', displayName: '添加客户情报' });
  } else if (shouldAddDiscovery(sourceQuote)) {
    routes.push({ kind: 'discovery', toolName: 'add_discovery_note', displayName: '添加发现笔记' });
  }

  if (context.opportunityId && shouldAddDiscovery(sourceQuote) && !routes.some((route) => route.kind === 'discovery')) {
    routes.push({ kind: 'discovery', toolName: 'add_discovery_note', displayName: '添加发现笔记' });
  }

  for (const route of routes.slice(0, 2)) {
    if (route.kind === 'activity') {
      const activityType = inferActivityType(sourceQuote);
      const nextSteps = extractNextSteps(sourceQuote);
      actions.push(createPendingAction({
        toolName: route.toolName,
        displayName: route.displayName,
        args: {
          accountId: context.accountId ?? null,
          opportunityId: context.opportunityId ?? null,
          contactId: context.contactId ?? null,
          activityType,
          summary: sourceQuote,
          nextSteps,
          date: null,
          source_quote: sourceQuote,
        },
        fields: [
          { field: '客户', value: context.currentAccountName ?? (context.accountId ? '当前客户' : null), source_quote: sourceQuote },
          { field: '关联商机', value: context.currentOpportunityName ?? (context.opportunityId ? '当前商机' : null), source_quote: sourceQuote, confidence: 'implied' },
          { field: '活动类型', value: activityType, source_quote: sourceQuote },
          { field: '摘要', value: sourceQuote, source_quote: sourceQuote },
          { field: '下一步', value: nextSteps, source_quote: sourceQuote, confidence: nextSteps ? 'explicit' : 'implied' },
        ],
      }));
    }

    if (route.kind === 'intel' && context.accountId) {
      const intelType = inferIntelType(sourceQuote);
      actions.push(createPendingAction({
        toolName: route.toolName,
        displayName: route.displayName,
        args: {
          accountId: context.accountId,
          content: sourceQuote,
          intelType,
          priority,
          source_quote: sourceQuote,
        },
        fields: [
          { field: '客户', value: context.currentAccountName ?? '当前客户', source_quote: sourceQuote },
          { field: '情报类型', value: intelType, source_quote: sourceQuote, confidence: 'implied' },
          { field: '优先级', value: priority, source_quote: sourceQuote, confidence: 'implied' },
          { field: '内容', value: sourceQuote, source_quote: sourceQuote },
        ],
      }));
    }

    if (route.kind === 'discovery') {
      const noteType = inferDiscoveryNoteType(sourceQuote);
      actions.push(createPendingAction({
        toolName: route.toolName,
        displayName: route.displayName,
        args: {
          accountId: context.accountId ?? null,
          opportunityId: context.opportunityId ?? null,
          content: sourceQuote,
          noteType,
          priority,
          source_quote: sourceQuote,
        },
        fields: [
          { field: '客户', value: context.currentAccountName ?? (context.accountId ? '当前客户' : null), source_quote: sourceQuote },
          { field: '关联商机', value: context.currentOpportunityName ?? (context.opportunityId ? '当前商机' : null), source_quote: sourceQuote, confidence: 'implied' },
          { field: '笔记类型', value: noteType, source_quote: sourceQuote, confidence: 'implied' },
          { field: '优先级', value: priority, source_quote: sourceQuote, confidence: 'implied' },
          { field: '内容', value: sourceQuote, source_quote: sourceQuote },
        ],
      }));
    }
  }

  return actions.length > 0 ? actions : null;
}


function normalizeTaskOutcomeMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

function hasProgressionQuestionLanguage(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  return /(怎么推进|怎么办|下一步|如何处理|该怎么|怎么处理|怎么跟进|如何推进|怎么做)/.test(compact);
}

function hasNegativeOrUncertainTaskOutcomeLanguage(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  return /(不同意|没同意|未同意|不确认|未确认|还没确认|没确认|没完成|未完成|还没完成|没搞定|未搞定|没办完|未办完)/.test(compact)
    || /(可能|大概|好像|似乎|也许|不确定|不知道|是否|是不是).{0,12}(完成|同意|确认|延期|推迟|卡住|受阻|取消|黄了)/.test(compact)
    || /(完成|同意|确认|延期|推迟|卡住|受阻|取消|黄了).{0,8}(吗|么|？|\?)/.test(compact);
}

function detectTaskOutcome(message: string): TaskOutcome | null {
  const compact = message.replace(/\s+/g, '');
  if (!/(任务|跟进|待办|事项|动作)/.test(compact)) return null;
  if (hasProgressionQuestionLanguage(message)) return null;
  if (hasNegativeOrUncertainTaskOutcomeLanguage(message)) return null;
  if (/(不要|别|无需|不用).{0,10}(记录|写入|记)/.test(compact)) return null;
  if (/(完成了|已完成|做完了|搞定了|办完了|客户同意了|客户已同意|客户确认了|客户已确认|同意下周.{0,8}(评审|会议|会)|确认下周.{0,8}(评审|会议|会))/.test(compact)) return 'completed';
  if (/(延期了|推迟了|拖延了|延后了|改到|推到|记录延期|标记延期)/.test(compact)) return 'delayed';
  if (/(卡住了|受阻|阻塞|卡在|没批|未批|采购没批|审批没过|被挡住)/.test(compact)) return 'blocked';
  if (/(取消了|不用做了|作废了|不做了|暂停这个任务|终止了)/.test(compact)) return 'canceled';
  return null;
}

export function detectTaskOutcomeIntent(message: string): { outcome: TaskOutcome; reason: string } | null {
  const text = normalizeTaskOutcomeMessage(message);
  if (!text) return null;
  const outcome = detectTaskOutcome(text);
  if (!outcome) return null;
  const reasonMatch = text.match(/(?:因为|原因是|由于|结果是|客户|李总|采购|审批)(.+)$/);
  const reason = (reasonMatch?.[0] ?? text).trim();
  if (reason.length < 4) return null;
  return { outcome, reason };
}

function normalizeTaskId(task?: ChatContextTask): string | null {
  return typeof task?.id === 'string' && task.id.trim() ? task.id : null;
}

function taskRelation(task: ChatContextTask, camel: 'accountId' | 'opportunityId' | 'contactId', snake: 'account_id' | 'opportunity_id' | 'contact_id'): string | null {
  const value = task[camel] ?? task[snake] ?? null;
  return typeof value === 'string' && value.trim() ? value : null;
}

function taskTitleMatchesMessage(task: ChatContextTask, normalizedMessage: string): boolean {
  const title = task.title?.replace(/\s+/g, '');
  if (!title || !normalizeTaskId(task)) return false;
  if (normalizedMessage.includes(title)) return true;
  return title.length >= 6 && normalizedMessage.includes(title.slice(0, Math.min(title.length, 10)));
}

function resolveTaskForOutcome(message: string, tasks?: ChatContext['tasks']): ChatContextTask | null {
  if (!tasks?.length) return null;
  const onlyTask = tasks.filter((task) => normalizeTaskId(task));
  if (onlyTask.length === 1) return onlyTask[0];

  const normalized = message.replace(/\s+/g, '');
  const titleMatches = onlyTask.filter((task) => taskTitleMatchesMessage(task, normalized));
  return titleMatches.length === 1 ? titleMatches[0] : null;
}

function buildTaskOutcomePendingAction(message: string, context: ChatContext): ToolCallValidation | null {
  const detected = detectTaskOutcomeIntent(message);
  if (!detected) return null;
  const task = resolveTaskForOutcome(message, context.tasks);
  if (!task) return null;
  const taskId = normalizeTaskId(task);
  if (!taskId) return null;

  const sourceQuote = message.trim();
  const accountId = taskRelation(task, 'accountId', 'account_id') ?? context.accountId ?? null;
  if (!accountId) return null;
  const opportunityId = taskRelation(task, 'opportunityId', 'opportunity_id') ?? context.opportunityId ?? null;
  const contactId = taskRelation(task, 'contactId', 'contact_id') ?? context.contactId ?? null;
  const judgmentImpact = defaultTaskOutcomeJudgmentImpact(detected.outcome);
  const outcomeLabel = TASK_OUTCOME_LABEL[detected.outcome] ?? TASK_OUTCOME_LABEL.unknown;

  return createPendingAction({
    toolName: 'record_task_outcome',
    displayName: '记录任务执行反馈',
    args: {
      taskId,
      accountId,
      opportunityId,
      contactId,
      outcome: detected.outcome,
      outcomeNote: detected.reason,
      reason: detected.reason,
      judgmentImpact,
      previousTaskStatus: task.status ?? null,
      newTaskStatus: null,
      source_quote: sourceQuote,
    },
    fields: [
      { field: '任务', value: task.title ?? '当前任务', source_quote: sourceQuote },
      { field: '执行结果', value: outcomeLabel, source_quote: sourceQuote },
      { field: '原因/结果', value: detected.reason, source_quote: sourceQuote },
      { field: '对客户判断的参考', value: judgmentImpact, source_quote: sourceQuote, confidence: 'implied', needs_clarification: '仅作为后续判断参考，不会自动覆盖最终判断' },
    ],
  });
}

function isGlobalPortfolioAsk(message: string): boolean {
  const compact = message.replace(/\s+/g, '');
  const patterns = [
    '今天我应该做什么', '今天该做什么', '今天应该做什么', '今天我要做什么',
    '今天有什么要做', '今天有什么任务', '今日待办', '今日重点',
    '本周重点关注', '重点关注哪些客户', '重点关注什么客户', '哪些客户要重点跟进',
    '哪些交易有风险', '哪些单子有风险', '哪些商机有风险',
    '现在最该推进什么', '现在最该推进哪几个', '现在优先推进什么', '现在先推什么',
    '本周先跟进谁', '今天先跟进谁', '哪些客户最危险', '哪些单子最危险',
    '给我一个全局优先级', '帮我排一下优先级', '全局看', '盘一盘全部商机',
  ];

  return patterns.some((pattern) => compact.includes(pattern.replace(/\s+/g, '')));
}

interface GlobalAskDealSnapshot {
  opportunityId: string;
  opportunityName: string;
  accountId: string | null;
  accountName: string;
  stage: string | null;
  value: number | null;
  expectedCloseDate: string | null;
  updatedAt: string | null;
  championCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  staleDays: number;
  riskScore: number;
  riskReasons: string[];
  priorityReasons: string[];
  latestAdvice?: string;
}

function stageLabel(stage: string | null | undefined): string {
  const stageMap: Record<string, string> = {
    prospecting: '初步接触',
    qualification: '资格确认',
    proposal: '方案推进',
    negotiation: '商务推进',
    procurement: '采购流程',
    poc: '验证阶段',
    closed_won: '已赢单',
    closed_lost: '已丢单',
  };
  if (!stage) return '阶段待确认';
  return stageMap[stage] ?? '推进中';
}

function formatCurrency(value: number | null | undefined): string {
  if (!value || Number.isNaN(value)) return '金额待确认';
  if (value >= 100000000) return `¥${(value / 100000000).toFixed(1)}亿`;
  if (value >= 10000) return `¥${(value / 10000).toFixed(0)}万`;
  return `¥${value.toLocaleString('zh-CN')}`;
}

function formatRelativeDate(dateText: string | null | undefined): string | null {
  if (!dateText) return null;
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) return null;
  const diffDays = Math.ceil((target.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return `已过期${Math.abs(diffDays)}天`;
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  return `${diffDays}天后`;
}

async function buildGlobalPortfolioReply(context: ChatContext, message: string): Promise<string | null> {
  if (!context.userId || !context.orgId) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const today = new Date();
  const todayText = today.toISOString().split('T')[0];
  const compactMessage = message.replace(/\s+/g, '');
  const isTodayAsk = /今天|今日/.test(compactMessage);
  const periodLabel = isTodayAsk ? '今天' : '本周';

  const [oppRes, accountRes, contactRes, taskRes, adviceRes] = await Promise.all([
    admin
      .from('opportunities')
      .select('id, name, account_id, stage, value, expected_close_date, updated_at')
      .eq('org_id', context.orgId)
      .not('stage', 'in', '(closed_won,closed_lost)')
      .limit(50),
    admin
      .from('accounts')
      .select('id, name')
      .eq('org_id', context.orgId)
      .limit(100),
    admin
      .from('contacts')
      .select('id, account_id, role, updated_at')
      .eq('org_id', context.orgId)
      .limit(300),
    admin
      .from('tasks')
      .select('id, title, status, priority, due_date, account_id, opportunity_id')
      .eq('org_id', context.orgId)
      .neq('status', 'done')
      .limit(300),
    admin
      .from('ai_advices')
      .select('id, text, status, account_id, opportunity_id, updated_at, created_at')
      .eq('org_id', context.orgId)
      .in('status', ['pending', 'adopted'])
      .order('updated_at', { ascending: false })
      .limit(100),
  ]);

  if (oppRes.error || !oppRes.data) return null;

  const accounts = new Map((accountRes.data ?? []).map((a) => [a.id, a.name as string]));
  const championCountByAccount = new Map<string, number>();
  for (const contact of contactRes.data ?? []) {
    if (!contact.account_id || contact.role !== 'champion') continue;
    championCountByAccount.set(contact.account_id, (championCountByAccount.get(contact.account_id) ?? 0) + 1);
  }

  type TaskBucket = { open: number; overdue: number; highPriority: number; examples: string[] };
  const emptyBucket = (): TaskBucket => ({ open: 0, overdue: 0, highPriority: 0, examples: [] });
  const tasksByOpp = new Map<string, TaskBucket>();
  const tasksByAccount = new Map<string, TaskBucket>();
  for (const task of taskRes.data ?? []) {
    const oppId = task.opportunity_id as string | null;
    const accId = task.account_id as string | null;
    if (!oppId && !accId) continue;
    const incr = (bucket: TaskBucket) => {
      bucket.open += 1;
      if (task.priority === 'high') bucket.highPriority += 1;
      if (task.due_date && task.due_date < todayText) bucket.overdue += 1;
      if (bucket.examples.length < 2 && (task.priority === 'high' || task.due_date <= todayText)) {
        bucket.examples.push(String(task.title ?? '').trim());
      }
    };
    if (oppId) {
      const bucket = tasksByOpp.get(oppId) ?? emptyBucket();
      incr(bucket);
      tasksByOpp.set(oppId, bucket);
    }
    if (accId) {
      const bucket = tasksByAccount.get(accId) ?? emptyBucket();
      incr(bucket);
      tasksByAccount.set(accId, bucket);
    }
  }

  const adviceByOpp = new Map<string, string>();
  const adviceByAccount = new Map<string, string>();
  for (const advice of adviceRes.data ?? []) {
    const text = String(advice.text ?? '').trim();
    if (!text) continue;
    if (advice.opportunity_id && !adviceByOpp.has(advice.opportunity_id as string)) {
      adviceByOpp.set(advice.opportunity_id as string, text);
    }
    if (advice.account_id && !adviceByAccount.has(advice.account_id as string)) {
      adviceByAccount.set(advice.account_id as string, text);
    }
  }

  const deals: GlobalAskDealSnapshot[] = oppRes.data.map((opp) => {
    const accountId = (opp.account_id as string | null) ?? null;
    const taskBucket = tasksByOpp.get(opp.id) ?? (accountId ? tasksByAccount.get(accountId) : undefined) ?? emptyBucket();
    const staleDays = opp.updated_at
      ? Math.max(0, Math.floor((today.getTime() - new Date(opp.updated_at).getTime()) / 86400000))
      : 999;
    const championCount = accountId ? (championCountByAccount.get(accountId) ?? 0) : 0;
    const riskReasons: string[] = [];
    const priorityReasons: string[] = [];
    let riskScore = 0;

    if (staleDays >= 14) {
      riskScore += 35;
      riskReasons.push(`已${staleDays}天没有实质推进`);
    } else if (staleDays >= 7) {
      riskScore += 18;
      riskReasons.push(`近${staleDays}天推进偏慢`);
    }

    if (championCount === 0) {
      riskScore += 20;
      riskReasons.push('还没有稳固的内部推动者');
    }

    if (taskBucket.overdue > 0) {
      riskScore += 18;
      riskReasons.push(`${taskBucket.overdue}项关键跟进已经拖期`);
    }

    if (taskBucket.open === 0) {
      riskScore += 12;
      riskReasons.push('没有明确的下一步动作');
    } else if (taskBucket.highPriority > 0) {
      priorityReasons.push(`有${taskBucket.highPriority}项高优先级动作待落地`);
    }
    if (taskBucket.examples[0]) {
      priorityReasons.push(`先处理：${taskBucket.examples[0].slice(0, 28)}`);
    }

    const dueLabel = formatRelativeDate(opp.expected_close_date ?? null);
    if (dueLabel && !dueLabel.startsWith('已过期')) {
      const diffDays = Math.ceil((new Date(opp.expected_close_date as string).getTime() - today.getTime()) / 86400000);
      if (diffDays <= 14) {
        riskScore += 10;
        priorityReasons.push(`距离预期成交窗口只剩${dueLabel}`);
      }
    } else if (dueLabel?.startsWith('已过期')) {
      riskScore += 12;
      riskReasons.push(`原定成交窗口${dueLabel}`);
    }

    const latestAdvice = adviceByOpp.get(opp.id) ?? (accountId ? adviceByAccount.get(accountId) : undefined);
    if (latestAdvice) {
      priorityReasons.push(latestAdvice.slice(0, 36));
    }

    if (riskReasons.length === 0) {
      priorityReasons.push(staleDays <= 5 ? '推进节奏还在可控范围内' : '可以趁窗口期继续加速');
    }

    return {
      opportunityId: opp.id,
      opportunityName: opp.name,
      accountId,
      accountName: accountId ? (accounts.get(accountId) ?? '未知客户') : '未知客户',
      stage: opp.stage,
      value: opp.value,
      expectedCloseDate: opp.expected_close_date,
      updatedAt: opp.updated_at,
      championCount,
      openTaskCount: taskBucket.open,
      overdueTaskCount: taskBucket.overdue,
      staleDays,
      riskScore,
      riskReasons,
      priorityReasons,
      latestAdvice,
    };
  });

  if (deals.length === 0) {
    return '我这边还没有拿到可用于排优先级的活跃商机，所以现在给不出可靠名单。先补一批在推进中的客户和跟进行动，我再帮你做本周重点排序。';
  }

  const topRiskDeals = [...deals]
    .sort((a, b) => b.riskScore - a.riskScore || (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3);
  const topPriorityDeals = [...deals]
    .sort((a, b) => {
      const scoreA = a.riskScore + (a.value ? Math.min(20, Math.round(a.value / 500000)) : 0) + (a.openTaskCount > 0 ? 6 : 0);
      const scoreB = b.riskScore + (b.value ? Math.min(20, Math.round(b.value / 500000)) : 0) + (b.openTaskCount > 0 ? 6 : 0);
      return scoreB - scoreA;
    })
    .slice(0, 3);

  const focusDeals = [...new Map([...topPriorityDeals, ...topRiskDeals].map((deal) => [deal.opportunityId, deal])).values()].slice(0, 4);
  const urgentCount = deals.filter((deal) => deal.riskScore >= 30).length;

  const focusLines = focusDeals.map((deal, index) => {
    const accountLink = deal.accountId ? `[${deal.accountName}](/accounts/${deal.accountId})` : `**${deal.accountName}**`;
    const oppLink = `[${deal.opportunityName}](/pipeline/${deal.opportunityId})`;
    const reason = [...deal.riskReasons, ...deal.priorityReasons].filter(Boolean).slice(0, 2).join('；');
    return `${index + 1}. ${accountLink} 的 ${oppLink}（${stageLabel(deal.stage)}，${formatCurrency(deal.value)}），${reason || `建议${periodLabel}重点盯住推进节奏`}。`;
  });

  const riskLines = topRiskDeals.map((deal) => {
    const oppLink = `[${deal.opportunityName}](/pipeline/${deal.opportunityId})`;
    const reasons = deal.riskReasons.slice(0, 2).join('；') || '最近缺少稳定推进信号';
    return `- ${oppLink}：${reasons}。`;
  });

  const priorityLines = topPriorityDeals.map((deal) => {
    const oppLink = `[${deal.opportunityName}](/pipeline/${deal.opportunityId})`;
    const actionHint = deal.priorityReasons[0] ?? deal.riskReasons[0] ?? '建议尽快拉出下一步动作';
    return `- ${oppLink}：${actionHint}。`;
  });

  return [
    `${periodLabel}最该盯的是 ${focusDeals[0] ? `[${focusDeals[0].opportunityName}](/pipeline/${focusDeals[0].opportunityId})` : '手头最高优先商机'} 这条线，另外还有 ${urgentCount} 条商机已经进入需要马上处理的区间。`,
    '',
    `${periodLabel}重点客户/交易名单：`,
    ...focusLines,
    '',
    '当前风险最高的交易：',
    ...riskLines,
    '',
    `${periodLabel}最该推进的动作对象：`,
    ...priorityLines,
  ].join('\n');
}

function inferBlockerCode(text: string): SalesAgentBlockerCode {
  const lower = text.toLowerCase();

  const rules: Array<{ code: SalesAgentBlockerCode; patterns: string[] }> = [
    { code: 'no_champion', patterns: ['champion', '内部推动', '推动者'] },
    { code: 'no_decision_maker', patterns: ['决策层', '决策人', 'decision maker', '拍板'] },
    { code: 'budget_unknown', patterns: ['预算', 'budget', '资金'] },
    { code: 'timeline_unclear', patterns: ['时间线', 'timeline', '时间不清', '周期不清'] },
    { code: 'stalled_progress', patterns: ['停滞', '卡住', '无进展', '没有推进', '进展慢'] },
    { code: 'single_threaded', patterns: ['单线程', '单点联系人', '只有一个联系人'] },
    { code: 'missing_signal', patterns: ['信号', '情报', '信息不足', '缺少依据'] },
    { code: 'stale_intel', patterns: ['过期', '老旧', '已过时', '需要刷新', 'refresh', '情报已过期'] },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => lower.includes(pattern))) {
      return rule.code;
    }
  }

  return 'unknown';
}

function formatLinkedTarget(contact: { id: string; name: string }): string {
  return `[${contact.name}](/contacts/${contact.id})`;
}

function formatLinkedAccount(name: string, accountId?: string): string {
  if (!accountId) return `**${name}**`;
  return `[${name}](/accounts/${accountId})`;
}

function resolveRecommendedTarget(
  rawTarget: string,
  contacts?: { id: string; name: string; role?: string; title?: string }[],
  options?: { accountName?: string; accountId?: string; opportunityName?: string; opportunityId?: string },
): string {
  const normalized = rawTarget.trim();
  if (!normalized) {
    return contacts && contacts.length > 0 ? formatLinkedTarget(contacts[0]) : '当前关键联系人';
  }

  if (contacts && contacts.length > 0) {
    const exact = contacts.find((contact) => normalized.includes(contact.name) || contact.name.includes(normalized));
    if (exact) return formatLinkedTarget(exact);

    const byRole = contacts.find((contact) => {
      const roleText = `${contact.role ?? ''} ${contact.title ?? ''}`.toLowerCase();
      return (normalized.includes('决策') && roleText.includes('决策')) ||
        (normalized.includes('负责人') && roleText.includes('负责人')) ||
        (normalized.includes('业务') && roleText.includes('业务'));
    });
    if (byRole) return formatLinkedTarget(byRole);

    return formatLinkedTarget(contacts[0]);
  }

  if (options?.accountName && normalized.includes(options.accountName)) {
    return formatLinkedAccount(options.accountName, options.accountId);
  }

  if (options?.opportunityName && normalized.includes(options.opportunityName)) {
    return options.opportunityId
      ? `[${options.opportunityName}](/pipeline/${options.opportunityId})`
      : `**${options.opportunityName}**`;
  }

  return normalized;
}

function inferNextActionType(actionText: string, blockerCode: SalesAgentBlockerCode): NextActionType {
  const lower = actionText.toLowerCase();
  if (lower.includes('约') || lower.includes('会议') || lower.includes('meeting') || lower.includes('拜访'))
    return 'schedule_meeting';
  if (lower.includes('创建任务') || lower.includes('跟进任务') || lower.includes('提醒'))
    return 'create_task';
  if (lower.includes('阶段') || lower.includes('推进到') || lower.includes('stage'))
    return 'update_stage';
  if (lower.includes('新增联系人') || lower.includes('找到') || lower.includes('引荐') || lower.includes('介绍'))
    return 'add_contact';
  if (lower.includes('邮件') || lower.includes('发送') || lower.includes('跟进邮件'))
    return 'send_followup';
  if (lower.includes('升级') || lower.includes('escalat') || lower.includes('上报'))
    return 'escalate';
  if (lower.includes('情报') || lower.includes('了解') || lower.includes('调研') || lower.includes('摸底'))
    return 'gather_intel';
  if (blockerCode === 'no_champion' || blockerCode === 'no_decision_maker')
    return 'add_contact';
  if (blockerCode === 'stalled_progress')
    return 'schedule_meeting';
  return 'general';
}

/**
 * Compute a suggested due date based on action urgency.
 * high → 1 day, medium → 3 days, low → 7 days.
 */
function computeDueDate(urgency: 'high' | 'medium' | 'low'): string {
  const daysMap: Record<string, number> = { high: 1, medium: 3, low: 7 };
  const days = daysMap[urgency] ?? 3;
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function deriveNextAction(
  progression: SalesAgentProgression,
  contacts?: { id: string; name: string; role?: string; title?: string }[],
  options?: { accountName?: string; accountId?: string; opportunityName?: string; opportunityId?: string },
  userId?: string,
): NextActionSuggestion {
  const blockerCode = progression.blockerCode ?? 'unknown';
  const actionType = inferNextActionType(progression.nextBestAction, blockerCode);

  // Resolve target entity from recommended target text
  let targetEntityType: NextActionSuggestion['targetEntityType'];
  let targetEntityId: string | undefined;
  let targetEntityName: string | undefined;

  // Try to match against contacts
  const rawTarget = progression.recommendedTarget;
  if (contacts?.length) {
    const matched = contacts.find((c) =>
      rawTarget.includes(c.name) || rawTarget.includes(c.id),
    );
    if (matched) {
      targetEntityType = 'contact';
      targetEntityId = matched.id;
      targetEntityName = matched.name;
    }
  }

  // Fallback to opportunity or account from context
  if (!targetEntityId) {
    if (options?.opportunityId) {
      targetEntityType = 'opportunity';
      targetEntityId = options.opportunityId;
      targetEntityName = options.opportunityName;
    } else if (options?.accountId) {
      targetEntityType = 'account';
      targetEntityId = options.accountId;
      targetEntityName = options.accountName;
    }
  }

  // Determine urgency from blocker severity
  const highUrgencyBlockers: SalesAgentBlockerCode[] = [
    'stalled_progress', 'no_decision_maker', 'budget_unknown',
  ];
  const urgency: NextActionSuggestion['urgency'] = highUrgencyBlockers.includes(blockerCode)
    ? 'high'
    : blockerCode === 'unknown'
      ? 'low'
      : 'medium';

  // Build a pre-filled chat message so the user can one-click execute this suggestion
  const targetLabel = targetEntityName ?? '当前对象';
  const quickActionMap: Partial<Record<NextActionType, string>> = {
    schedule_meeting: `帮我创建一个会议任务：和${targetLabel}沟通 — ${progression.nextBestAction}`,
    create_task: `帮我创建跟进任务：${progression.nextBestAction}`,
    update_stage: `帮我更新商机阶段 — ${progression.nextBestAction}`,
    add_contact: `帮我新增联系人 — ${progression.nextBestAction}`,
    send_followup: `帮我写邮件：${progression.nextBestAction}`,
    escalate: `帮我创建升级任务：${progression.nextBestAction}`,
    gather_intel: `帮我创建调研任务：${progression.nextBestAction}`,
  };
  const quickActionText = quickActionMap[actionType] ?? `帮我执行：${progression.nextBestAction}`;

  return {
    actionType,
    targetEntityType,
    targetEntityId,
    targetEntityName,
    description: progression.nextBestAction,
    evidence: progression.reason,
    urgency,
    quickActionText,
    owner: userId,
    dueDate: computeDueDate(urgency),
    sequenceIndex: 1,
  };
}

/**
 * Build a multi-step action plan from a progression result.
 * The primary nextAction is always step 1; additional steps are derived from
 * the blocker code and context.
 */
function buildActionPlan(
  progression: SalesAgentProgression,
  contacts?: { id: string; name: string; role?: string; title?: string }[],
  options?: { accountName?: string; accountId?: string; opportunityName?: string; opportunityId?: string },
  dealHealth?: DealHealthSummary,
  userId?: string,
): NextActionSuggestion[] {
  const plan: NextActionSuggestion[] = [];

  // Step 1 is always the primary next action
  if (progression.nextAction) {
    plan.push(progression.nextAction);
  }

  const code = progression.blockerCode ?? 'unknown';

  // Step 2: If stalled, add a meeting action
  if (code === 'stalled_progress' && progression.nextAction?.actionType !== 'schedule_meeting') {
    plan.push({
      actionType: 'schedule_meeting',
      description: '安排进度推进会议，打破停滞',
      urgency: 'high',
      targetEntityType: options?.opportunityId ? 'opportunity' : undefined,
      targetEntityId: options?.opportunityId,
      targetEntityName: options?.opportunityName,
      quickActionText: `帮我安排一个推进会议 — ${options?.opportunityName ?? '当前商机'}`,
    });
  }

  // Step 2/3: If no champion, add stakeholder mapping
  if (code === 'no_champion' || code === 'single_threaded') {
    plan.push({
      actionType: 'gather_intel',
      description: '调研客户内部决策链，识别潜在Champion',
      urgency: 'medium',
      targetEntityType: 'account',
      targetEntityId: options?.accountId,
      targetEntityName: options?.accountName,
      quickActionText: `帮我创建调研任务：摸底${options?.accountName ?? '客户'}内部决策链`,
    });
  }

  // Step 2/3: If no decision maker, add escalation
  if (code === 'no_decision_maker' && progression.nextAction?.actionType !== 'escalate') {
    plan.push({
      actionType: 'escalate',
      description: '通过现有联系人引荐决策层',
      urgency: 'high',
      targetEntityType: 'contact',
      targetEntityId: contacts?.[0]?.id,
      targetEntityName: contacts?.[0]?.name,
      quickActionText: `帮我创建任务：通过${contacts?.[0]?.name ?? '当前联系人'}引荐决策层`,
    });
  }

  // If deal health is critical, always add a task to reassess
  if (dealHealth && dealHealth.level === 'critical' && plan.length < 3) {
    plan.push({
      actionType: 'create_task',
      description: `Deal 健康度严重（停滞分${dealHealth.stagnationScore}/100），需主管介入评估`,
      urgency: 'high',
      targetEntityType: 'opportunity',
      targetEntityId: options?.opportunityId,
      targetEntityName: options?.opportunityName,
      quickActionText: `帮我创建任务：主管评估 ${options?.opportunityName ?? '当前商机'} 是否需要干预`,
    });
  }

  // If missing intel signal or stale intel, add gather_intel
  if ((code === 'missing_signal' || code === 'stale_intel') && !plan.some((a) => a.actionType === 'gather_intel')) {
    const isStale = code === 'stale_intel';
    plan.push({
      actionType: 'gather_intel',
      description: isStale ? '情报已过期，需要重新调研验证关键判断' : '补充关键情报：当前推进缺少决策依据',
      urgency: isStale ? 'high' : 'medium',
      targetEntityType: 'account',
      targetEntityId: options?.accountId,
      targetEntityName: options?.accountName,
      quickActionText: isStale
        ? `帮我创建调研任务：验证${options?.accountName ?? '客户'}过期情报`
        : `帮我创建调研任务：补充${options?.accountName ?? '客户'}情报`,
    });
  }

  // Assign sequenceIndex, owner, dueDate to each plan step
  const capped = plan.slice(0, 4);
  for (let i = 0; i < capped.length; i++) {
    capped[i].sequenceIndex = i + 1;
    if (!capped[i].owner && userId) capped[i].owner = userId;
    if (!capped[i].dueDate) capped[i].dueDate = computeDueDate(capped[i].urgency);
  }

  return capped;
}

function extractProgression(
  reply: string,
  contacts?: { id: string; name: string; role?: string; title?: string }[],
  options?: { accountName?: string; accountId?: string; opportunityName?: string; opportunityId?: string },
  dealHealth?: DealHealthSummary,
  userId?: string,
): SalesAgentProgression | undefined {
  const lines = reply.split('\n').map((line) => line.trim()).filter(Boolean);
  const buckets: Partial<SalesAgentProgression> = {};

  for (const line of lines) {
    if (line.startsWith('当前判断：')) buckets.currentJudgment = line.replace('当前判断：', '').trim();
    else if (line.startsWith('最大阻塞：')) buckets.mainBlocker = line.replace('最大阻塞：', '').trim();
    else if (line.startsWith('下一步动作：')) buckets.nextBestAction = line.replace('下一步动作：', '').trim();
    else if (line.startsWith('推荐推进对象：')) buckets.recommendedTarget = line.replace('推荐推进对象：', '').trim();
    else if (line.startsWith('理由：')) buckets.reason = line.replace('理由：', '').trim();
    else if (line.startsWith('风险提示：')) buckets.riskNote = line.replace('风险提示：', '').trim();
  }

  if (
    buckets.currentJudgment &&
    buckets.mainBlocker &&
    buckets.nextBestAction &&
    buckets.recommendedTarget &&
    buckets.reason &&
    buckets.riskNote
  ) {
    const result: SalesAgentProgression = {
      ...(buckets as SalesAgentProgression),
      blockerCode: inferBlockerCode(buckets.mainBlocker),
      recommendedTarget: resolveRecommendedTarget(buckets.recommendedTarget, contacts, options),
      dealHealth,
    };
    result.nextAction = deriveNextAction(result, contacts, options, userId);
    result.actionPlan = buildActionPlan(result, contacts, options, dealHealth, userId);
    return result;
  }

  if (lines.length >= 3) {
    const mainBlocker = buckets.mainBlocker ?? lines[1] ?? '最大阻塞待补充';
    const result: SalesAgentProgression = {
      currentJudgment: buckets.currentJudgment ?? lines[0] ?? '当前判断待补充',
      mainBlocker,
      blockerCode: inferBlockerCode(mainBlocker),
      nextBestAction: buckets.nextBestAction ?? lines[2] ?? '下一步动作待补充',
      recommendedTarget: resolveRecommendedTarget(
        buckets.recommendedTarget ?? '请结合当前关键联系人继续推进',
        contacts,
        options,
      ),
      reason: buckets.reason ?? '当前回答已识别为推进问题，但结构化字段不完整，建议人工确认。',
      riskNote: buckets.riskNote ?? '若不尽快推进，可能继续停留在模糊判断阶段。',
      dealHealth,
    };
    result.nextAction = deriveNextAction(result, contacts, options, userId);
    result.actionPlan = buildActionPlan(result, contacts, options, dealHealth, userId);
    return result;
  }

  return undefined;
}

async function callLLMWithTools(
  messages: LLMMessage[],
  systemPrompt: string
): Promise<LLMResponse> {
  const config = getAiProviderConfig('flash');
  // Sales Agent 用 flash 模型（对话级任务，不需要 pro）
  const model = config.model ?? DEFAULT_DEEPSEEK_FLASH_MODEL;
  const lowerModel = model.toLowerCase();
  const lowerBaseUrl = (config.baseUrl ?? '').toLowerCase();
  const isDeepSeek = lowerModel.startsWith('deepseek-') || lowerBaseUrl.includes('api.deepseek.com');

  if (!config.baseUrl) {
    throw new Error('[sales-agent] AI_BASE_URL 未配置');
  }
  if (!config.apiKey) {
    throw new Error('[sales-agent] AI API key 未配置');
  }

  const requestMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const res = await fetch(getAiChatCompletionsUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: requestMessages,
      tools: SALES_AGENT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.3, // 较低温度，提高提取准确性
      max_tokens: 2000,
      ...(isDeepSeek ? { thinking: { type: 'disabled' } } : {}),
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`[sales-agent] LLM API 错误 (${res.status}): ${JSON.stringify(errData)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content ?? null,
    tool_calls: choice?.message?.tool_calls ?? undefined,
    reasoning_content: choice?.message?.reasoning_content ?? undefined,
  };
}

/**
 * 自动执行搜索工具并返回结果
 */
async function executeSearchTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<string> {
  const argsWithUser = { ...args, userId };

  let result;
  switch (toolName) {
    case 'read_account_context':
      result = await executeReadAccountContext(argsWithUser as Parameters<typeof executeReadAccountContext>[0]);
      break;
    case 'search_contacts':
      result = await executeSearchContacts(argsWithUser as Parameters<typeof executeSearchContacts>[0]);
      break;
    case 'search_accounts':
      result = await executeSearchAccounts(argsWithUser as Parameters<typeof executeSearchAccounts>[0]);
      break;
    case 'search_opportunities':
      result = await executeSearchOpportunities(argsWithUser as Parameters<typeof executeSearchOpportunities>[0]);
      break;
    default:
      return JSON.stringify({ success: false, message: `未知搜索工具：${toolName}` });
  }

  return JSON.stringify(result);
}

/**
 * 运行 Sales Agent
 *
 * @param message 用户消息
 * @param context 上下文（商机ID、联系人ID等）
 * @param history 对话历史
 * @returns SalesAgentResponse
 */
export async function runSalesAgent(
  message: string,
  context: ChatContext,
  history: ChatMessage[]
): Promise<SalesAgentResponse> {
  const shouldUseGlobalPortfolioBrief = !context.accountId && !context.opportunityId && isGlobalPortfolioAsk(message);
  if (shouldUseGlobalPortfolioBrief) {
    try {
      const globalReply = await buildGlobalPortfolioReply(context, message);
      if (globalReply) {
        return {
          reply: sanitizeReply(globalReply),
          mode: 'chat',
          requiresConfirmation: false,
        };
      }
    } catch (err) {
      console.error('[sales-agent] 全局问询汇总失败:', err);
    }
  }

  const winLossOutcome = detectWinLossCalibrationIntent(message);
  if (winLossOutcome) {
    const pending = buildWinLossPendingAction(message, context, winLossOutcome);
    if (!pending) {
      return {
        reply: '我可以把这条记录为成交/丢单复盘，但需要先进入对应客户或商机页面，确保不会写到错误客户。',
        mode: 'chat',
        requiresConfirmation: false,
      };
    }
    return {
      reply: `我可以把这条作为「${outcomeLabel(winLossOutcome)}复盘」记录到当前客户。请先确认下方卡片；确认前不会写入。`,
      mode: 'chat',
      pendingActions: [pending],
      requiresConfirmation: true,
    };
  }

  if (detectJudgmentFeedbackIntent(message)) {
    const pending = buildJudgmentFeedbackPendingAction(message, context);
    if (!pending) {
      return {
        reply: '我可以把这条记录为当前判断修正，但需要先进入对应客户页面，确保不会写到错误客户。',
        mode: 'chat',
        requiresConfirmation: false,
      };
    }
    return {
      reply: '我可以把这条作为「判断修正」记录到当前客户。请先确认下方卡片；确认前不会写入，也不会直接覆盖现有判断。',
      mode: 'chat',
      pendingActions: [pending],
      requiresConfirmation: true,
    };
  }

  const taskOutcomePending = buildTaskOutcomePendingAction(message, context);
  if (taskOutcomePending) {
    return {
      reply: '我可以把这条作为「任务执行反馈」记录到当前客户判断时间线。请先确认下方卡片；确认前不会写入，也不会自动改变最终判断。',
      mode: 'chat',
      pendingActions: [taskOutcomePending],
      requiresConfirmation: true,
    };
  }
  if (detectTaskOutcomeIntent(message) && !taskOutcomePending) {
    return {
      reply: '我可以记录任务执行反馈，但需要先明确对应任务和客户，避免写到错误客户。',
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  const opportunityContactsAnswer = await answerOpportunityContactsAsk(message, context, history);
  if (opportunityContactsAnswer) {
    return opportunityContactsAnswer;
  }

  const createTaskPending = buildCreateTaskPendingAction(message, context);
  if (createTaskPending) {
    return {
      reply: '我已把这一步整理成跟进任务。请先确认下方卡片；确认前不会写入。',
      mode: 'chat',
      pendingActions: [createTaskPending],
      requiresConfirmation: true,
    };
  }
  if (isCreateTaskActionIntent(message) && !createTaskPending) {
    return {
      reply: '我可以帮你创建任务，但需要先进入对应客户或商机页面，确保不会写到错误客户。',
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  const naturalIntakePending = buildNaturalIntakePendingActions(message, context);
  if (naturalIntakePending?.length) {
    const names = naturalIntakePending.map((action) => action.displayName).join('、');
    return {
      reply: `我会把这段信息整理为「${names}」。请先确认下方卡片；确认前不会写入。`,
      mode: 'chat',
      pendingActions: naturalIntakePending,
      requiresConfirmation: true,
    };
  }
  if (isNaturalIntakeIntent(message) && !naturalIntakePending) {
    return {
      reply: '我可以记录这段信息，但需要先进入对应客户或商机页面，确保不会写到错误客户。',
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  // 构建注入上下文信息的 system prompt
  const contactsInfo = context.currentAccountContacts?.length
    ? `\n联系人列表（按姓名查找 id）：\n${context.currentAccountContacts.map(c => `- ${c.name}（id: ${c.id}）${c.title ? `，职位: ${c.title}` : ''}${c.role ? `，角色: ${c.role}` : ''}`).join('\n')}`
    : '';

  const stagnationInfo = context.stagnationHints?.length
    ? `\n停滞/缺失信号提示：\n${context.stagnationHints.map((hint) => `- ${hint}`).join('\n')}`
    : '';

  const intelActionInfo = context.intelActionHints?.length
    ? `\n已有情报结论/动作提示：\n${context.intelActionHints.map((hint) => `- ${hint}`).join('\n')}`
    : '';

  const taskStatusLabel: Record<string, string> = { todo: '待办', in_progress: '进行中', done: '完成', blocked: '受阻' };
  const taskPriorityLabel: Record<string, string> = { high: '高', medium: '中', low: '低' };
  const taskInfo = context.tasks?.length
    ? `\n当前关联任务（${context.tasks.length}项）：\n${context.tasks.slice(0, 8).map((t) => {
        const status = taskStatusLabel[t.status] ?? t.status;
        const pri = t.priority ? `，${taskPriorityLabel[t.priority] ?? t.priority}优先` : '';
        const due = t.dueDate ? `，截止${t.dueDate}` : '';
        return `- ${t.title}（${status}${pri}${due}）`;
      }).join('\n')}`
    : '';

  const intelInfo = context.intelItems?.length
    ? `\n近期情报信号（${context.intelItems.length}条）：\n${context.intelItems.slice(0, 6).map((i) => {
        const signal = i.signalType ? `[${i.signalType}]` : '';
        const pri = i.priority ? `（${i.priority}）` : '';
        return `- ${signal}${pri} ${i.content ?? ''}`;
      }).join('\n')}`
    : '';

  const judgmentInfo = context.judgmentContext
    ? `\n当前客户判断上下文：\n${formatJudgmentContextForPrompt(context.judgmentContext)}`
    : '';

  // Deal health context for LLM — translate enums to Chinese
  const healthLevelLabel: Record<string, string> = { healthy: '健康', at_risk: '有风险', critical: '严重' };
  const dealHealthInfo = context.dealHealth
    ? `\n当前商机健康度: ${healthLevelLabel[context.dealHealth.level] ?? context.dealHealth.level}（停滞评分 ${context.dealHealth.stagnationScore}/100，已${context.dealHealth.daysSinceActivity}天无活动）\n健康度原因：\n${context.dealHealth.reasons.map((r) => `- ${r}`).join('\n')}`
    : '';

  // Map page path to user-facing label (never expose raw paths to LLM)
  const pageLabels: Record<string, string> = {
    '/pipeline': '商机列表',
    '/accounts': '客户列表',
    '/contacts': '联系人列表',
    '/tasks': '任务列表',
    '/dashboard': '仪表盘',
    '/forecast': '预测',
    '/reports': '报表',
  };
  const pageLabel = context.currentPage
    ? pageLabels[context.currentPage] ?? (context.currentPage.startsWith('/accounts/') ? '客户详情' : context.currentPage.startsWith('/pipeline/') ? '商机详情' : context.currentPage.startsWith('/contacts/') ? '联系人详情' : '其他页面')
    : null;

  const contextInfo = [
    // Expose names for LLM comprehension; keep IDs in a separate hidden block for tool use only
    context.currentOpportunityName ? `当前商机：${context.currentOpportunityName}` : null,
    context.currentAccountName ? `当前客户：${context.currentAccountName}` : null,
    pageLabel ? `用户当前所在页面：${pageLabel}` : null,
    contactsInfo || null,
    stagnationInfo || null,
    intelActionInfo || null,
    taskInfo || null,
    intelInfo || null,
    judgmentInfo || null,
    dealHealthInfo || null,
    // Internal IDs block — instruct LLM to use for tool calls only, never output to user
    (context.opportunityId || context.contactId || context.accountId)
      ? `\n[以下 ID 仅供工具调用使用，严禁在回复中输出]\n${[
          context.opportunityId ? `opportunityId=${context.opportunityId}` : null,
          context.contactId ? `contactId=${context.contactId}` : null,
          context.accountId ? `accountId=${context.accountId}` : null,
        ].filter(Boolean).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const judgmentAnswerMode = Boolean(context.judgmentContext && isJudgmentContextAsk(message));
  if (judgmentAnswerMode && context.judgmentContext) {
    return {
      reply: sanitizeReply(formatJudgmentContextAnswer(context.judgmentContext)),
      mode: 'chat',
      requiresConfirmation: false,
    };
  }

  const progressionMode = isProgressionAsk(message);

  // Proactive health warning: when deal is critical, add advisory to prompt even in chat mode
  const proactiveWarning = !progressionMode && context.dealHealth && context.dealHealth.level === 'critical'
    ? `\n\n## 主动提醒\n当前商机健康度为严重（停滞评分 ${context.dealHealth.stagnationScore}/100）。即使用户没有在问推进问题，如果用户的问题与该商机相关，请在回答末尾简短提醒该商机存在风险，建议尽快推进。不要强行插入，只在回答与商机相关时自然带出。`
    : '';

  const judgmentAnswerPrompt = judgmentAnswerMode
    ? `\n\n## 当前回答模式：客户判断问答\n用户正在问当前客户怎么推进、为什么这么判断或最近判断变化。必须严格按下面 4 段输出，段名固定：\n当前判断：...\n关键证据：...\n不确定点：...\n下一步动作：...\n要求：只使用“当前客户判断上下文”和当前客户/商机/任务上下文；不要暴露内部字段名、英文枚举、模型/底座、原始表名；如果证据不足，直接说还缺哪类证据。`
    : '';

  const progressionPrompt = judgmentAnswerMode
    ? judgmentAnswerPrompt
    : progressionMode
      ? `\n\n## 当前回答模式：Progression Mode\n请按下面 6 行格式输出，且每行必须以固定标签开头：\n当前判断：...\n最大阻塞：...\n下一步动作：...\n推荐推进对象：...\n理由：...\n风险提示：...`
      : proactiveWarning;

  const systemPrompt = contextInfo
    ? `${SALES_AGENT_SYSTEM_PROMPT}${progressionPrompt}\n\n## 当前 Closr 上下文\n${contextInfo}\n\n重要：用户当前所在页面只是 UI 位置提示，不是 AI Chat 的能力边界。除非用户明确说“当前页面/这个客户/这条商机”，否则必须按全局销售入口理解问题，可以跨客户、商机、任务、报表回答。不要因为用户在预测/报表/设置等页面，就要求用户进入对应页面。\n\n重要：当用户提到某个联系人姓名时，从上方联系人列表中找到对应的 id，作为 contactId 传给工具。不要让 contactId 为空。`
    : `${SALES_AGENT_SYSTEM_PROMPT}${progressionPrompt}`;

  // 保留最近 6 条历史，节省 token
  const recentHistory = history.slice(-6);
  const llmMessages: LLMMessage[] = [
    ...recentHistory.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  // ─── 搜索工具自动执行循环（最多 3 轮，防止无限循环）──────────────────
  const MAX_SEARCH_ROUNDS = 3;
  let llmResponse: LLMResponse;

  for (let round = 0; round <= MAX_SEARCH_ROUNDS; round++) {
    try {
      llmResponse = await callLLMWithTools(llmMessages, systemPrompt);
    } catch (err) {
      console.error('[sales-agent] LLM 调用失败:', err);
      return {
        reply: '抱歉，AI 服务暂时不可用，请稍后再试。',
        requiresConfirmation: false,
      };
    }

    // 检查是否有搜索工具调用需要自动执行
    const searchCalls = llmResponse.tool_calls?.filter((tc) =>
      SEARCH_TOOL_NAMES.has(tc.function.name)
    ) ?? [];

    if (searchCalls.length === 0) {
      // 无搜索调用，跳出循环继续正常处理
      break;
    }

    // 自动执行搜索工具，将结果注入对话
    // 先把 assistant 的 tool_calls 消息加入
    llmMessages.push({
      role: 'assistant',
      content: llmResponse.content,
      tool_calls: llmResponse.tool_calls,
      ...(llmResponse.reasoning_content ? { reasoning_content: llmResponse.reasoning_content } : {}),
    });

    for (const tc of searchCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        console.warn('[sales-agent] 无法解析搜索工具参数:', tc.function.arguments);
        continue;
      }

      console.log(`[sales-agent] 自动执行搜索: ${tc.function.name}(${JSON.stringify(parsedArgs)})`);
      const searchResult = await executeSearchTool(
        tc.function.name,
        parsedArgs,
        context.userId ?? '',
      );

      // 注入 tool result 消息
      llmMessages.push({
        role: 'tool',
        content: searchResult,
        tool_call_id: tc.id,
      });
    }

    // 如果还有非搜索的 tool calls，也要为它们提供 tool result（空结果），否则 API 会报错
    const nonSearchCalls = llmResponse.tool_calls?.filter(
      (tc) => !SEARCH_TOOL_NAMES.has(tc.function.name)
    ) ?? [];
    for (const tc of nonSearchCalls) {
      llmMessages.push({
        role: 'tool',
        content: JSON.stringify({ success: true, message: '等待用户确认后执行' }),
        tool_call_id: tc.id,
      });
    }

    // 继续下一轮 LLM 调用（带搜索结果）
  }

  // ─── 处理最终 LLM 响应 ───────────────────────────────────────────────

  // 没有 tool calls → 纯对话回复
  if (!llmResponse!.tool_calls || llmResponse!.tool_calls.length === 0) {
    const reply = sanitizeReply(llmResponse!.content ?? '收到，请告诉我更多信息。');
    const progression = progressionMode
      ? extractProgression(reply, context.currentAccountContacts, {
          accountName: context.currentAccountName,
          accountId: context.accountId,
          opportunityName: context.currentOpportunityName,
          opportunityId: context.opportunityId,
        }, context.dealHealth, context.userId)
      : undefined;
    return {
      reply,
      mode: progression ? 'progression' : 'chat',
      progression,
      requiresConfirmation: false,
    };
  }

  // 有 tool calls → 过滤掉搜索工具，只保留写入工具做防幻觉验证。
  // create_task 额外要求用户有明确正向创建任务意图；即使模型误返回 tool call，也不能生成待确认写入。
  const hasExplicitCreateTaskIntent = isCreateTaskActionIntent(message);
  const hasExplicitTaskOutcomeIntent = Boolean(detectTaskOutcomeIntent(message));
  const writeCalls = llmResponse!.tool_calls.filter(
    (tc) => !SEARCH_TOOL_NAMES.has(tc.function.name)
      && (tc.function.name !== 'create_task' || hasExplicitCreateTaskIntent)
      && (tc.function.name !== 'record_task_outcome' || hasExplicitTaskOutcomeIntent)
  );

  const pendingActions: ToolCallValidation[] = [];
  let requiresConfirmation = false;

  for (const tc of writeCalls) {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      console.warn('[sales-agent] 无法解析 tool call arguments:', tc.function.arguments);
      continue;
    }

    const validation = validateToolCall(tc.function.name, parsedArgs);
    pendingActions.push(validation);

    if (validation.requiresConfirmation) {
      requiresConfirmation = true;
    }
  }

  const droppedWriteCalls = llmResponse!.tool_calls.some(
    (tc) => !SEARCH_TOOL_NAMES.has(tc.function.name) && !writeCalls.includes(tc),
  );
  const reply = sanitizeReply(
    llmResponse!.content ??
    (pendingActions.length > 0
      ? `我从你的描述中提取了 ${pendingActions.length} 条操作，请确认后写入 Closr。`
      : droppedWriteCalls
        ? '我先不创建任务。你如果需要写入，请明确说“创建任务”；现在可以先继续聊推进方案。'
        : '好的，我已处理你的请求。'));

  const progression = progressionMode
    ? extractProgression(reply, context.currentAccountContacts, {
        accountName: context.currentAccountName,
        accountId: context.accountId,
        opportunityName: context.currentOpportunityName,
        opportunityId: context.opportunityId,
      }, context.dealHealth, context.userId)
    : undefined;

  return {
    reply,
    mode: progression ? 'progression' : 'chat',
    progression,
    pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
    requiresConfirmation,
  };
}
