/**
 * 工具 dispatch 层
 *
 * 将大 switch 重构为 handler registry，每个工具一个 handler 函数。
 * source_quote 防幻觉验证作为统一前置校验。
 */

import type { ToolResult } from '@/lib/agent/tools/types';
import type { SalesAgentToolName } from '@/lib/agent/tools/index';
import { executeMeddiccUpdate } from '@/lib/agent/tools/meddicc';
import {
  executeAddContactNote,
  executeCreateContact,
  executeUpdateContactProfile,
  executeUpdateContact,
} from '@/lib/agent/tools/contact';
import { executeCreateTask, executeUpdateTask } from '@/lib/agent/tools/task';
import { executeUpdateDealStage } from '@/lib/agent/tools/deal';
import { executeAddIntel } from '@/lib/agent/tools/intel';
import { executeUpdateAccountInfo, executeUpdateAccount } from '@/lib/agent/tools/account';
import { executeUpdateOpportunity, executeCreateOpportunity } from '@/lib/agent/tools/opportunity';
import { executeAddDiscoveryNote } from '@/lib/agent/tools/discovery';
import { executeLogActivity } from '@/lib/agent/tools/activity';
import {
  executeRecordJudgmentFeedback,
  executeRecordWinLossCalibration,
} from '@/lib/agent/tools/judgment-calibration';
import { executeRecordTaskOutcome } from '@/lib/agent/tools/task-outcome';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmedField {
  field: string;
  value: string | null;
  confidence: 'explicit' | 'implied';
  source_quote: string;
  needsClarification?: string;
  needs_clarification?: string;
}

export interface ConfirmedAction {
  toolName: SalesAgentToolName;
  displayName: string;
  fields: ConfirmedField[];
  requiresConfirmation: boolean;
  /** Original tool call args (passed through from API chat response) */
  args?: Record<string, unknown>;
}

export interface ExecuteToolsRequest {
  actions: ConfirmedAction[];
  conversationId: string;
}

export interface ExecuteToolsResultItem {
  toolName: string;
  displayName: string;
  success: boolean;
  message: string;
  canUndo: boolean;
  undoExpiresAt: string; // ISO 8601
}

// ─── Field value helper ───────────────────────────────────────────────────────

type FieldValFn = (key: string) => string | null;

function makeFieldVal(action: ConfirmedAction): FieldValFn {
  const args = action.args ?? {};
  return (key: string): string | null => {
    const confirmed = action.fields.find(
      (f) => f.field === key || f.field.toLowerCase() === key.toLowerCase(),
    );
    if (confirmed) return confirmed.value ?? null;
    const raw = args[key];
    return raw != null ? String(raw) : null;
  };
}

function firstFieldValue(fv: FieldValFn, args: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = fv(key);
    if (value != null && value !== '') return value;
    const raw = args[key];
    if (raw != null && String(raw) !== '') return String(raw);
  }
  return null;
}

// ─── Source quote validation ──────────────────────────────────────────────────

const TOOLS_REQUIRING_SOURCE_QUOTE: ReadonlySet<SalesAgentToolName> = new Set([
  'update_meddicc',
  'add_contact_note',
  'update_contact_profile',
  'update_contact',
  'update_deal_stage',
  'add_intel',
  'update_account_info',
  'update_account',
  'update_opportunity',
  'create_opportunity',
  'add_discovery_note',
  'log_activity',
  'update_task',
  'record_judgment_feedback',
  'record_win_loss_calibration',
  'record_task_outcome',
] as const);

function validateSourceQuote(action: ConfirmedAction): ToolResult | null {
  if (!TOOLS_REQUIRING_SOURCE_QUOTE.has(action.toolName)) return null;

  const args = action.args ?? {};
  const sqFromArgs = String(args.source_quote ?? '').trim();
  const sqFromFields = action.fields.some(
    (f) => f.source_quote && f.source_quote.trim() !== '',
  );
  const allExplicit = action.fields.length > 0 && action.fields.every(
    (f) => f.confidence === 'explicit',
  );

  if (!sqFromArgs && !sqFromFields && !allExplicit) {
    console.warn(
      `[execute-tools] source_quote 缺失: tool=${action.toolName}, args keys=${Object.keys(args).join(',')}, fields=${action.fields.length}`,
    );
    return {
      success: false,
      message: '写入被拒绝：缺少用户原话引用（source_quote），请在对话中提供来源',
    };
  }

  return null; // validation passed
}

// ─── Tool handler type & registry ─────────────────────────────────────────────

type ToolHandler = (
  fv: FieldValFn,
  args: Record<string, unknown>,
  conversationId: string,
) => Promise<ToolResult>;

const TOOL_HANDLERS: Partial<Record<SalesAgentToolName, ToolHandler>> = {
  update_meddicc: async (fv, args, cid) => {
    const opportunityId = fv('opportunityId') ?? String(args.opportunityId ?? '');
    const field = fv('field') ?? String(args.field ?? '');
    const value = fv('value') ?? String(args.value ?? '');
    const source_quote = fv('source_quote') ?? String(args.source_quote ?? '');
    const confidence =
      (fv('confidence') as 'explicit' | 'implied') ?? 'implied';

    if (!opportunityId || !field || !value) {
      return { success: false, message: '缺少必要参数：opportunityId、field 或 value' };
    }

    return executeMeddiccUpdate({
      opportunityId,
      field: field as Parameters<typeof executeMeddiccUpdate>[0]['field'],
      value,
      confidence,
      source_quote,
      conversation_id: cid,
    });
  },

  add_contact_note: async (fv, args, cid) => {
    const contactId = fv('contactId') ?? String(args.contactId ?? '');
    const note = fv('note') ?? String(args.note ?? '');
    const noteType =
      (fv('noteType') as 'meeting' | 'call' | 'email' | 'observation') ?? 'observation';
    const source_quote = fv('source_quote') ?? String(args.source_quote ?? '');

    if (!contactId || !note) {
      return { success: false, message: '缺少必要参数：contactId 或 note' };
    }

    return executeAddContactNote({
      contactId,
      note,
      noteType,
      source_quote,
      conversation_id: cid,
    });
  },

  create_task: async (fv, args, cid) => {
    const title = firstFieldValue(fv, args, ['title', '任务标题']) ?? '';
    const rawPriority = firstFieldValue(fv, args, ['priority', '优先级']);
    const priority = rawPriority === 'high' || rawPriority === 'medium' || rawPriority === 'low'
      ? rawPriority
      : 'medium';
    const dueDate = firstFieldValue(fv, args, ['dueDate', '截止日期']) ?? null;
    const accountId = firstFieldValue(fv, args, ['accountId']) ?? null;
    const opportunityId = firstFieldValue(fv, args, ['opportunityId']) ?? null;
    const contactId = firstFieldValue(fv, args, ['contactId']) ?? null;
    const description = firstFieldValue(fv, args, ['description', '任务描述']) ?? undefined;
    const assignedTo = firstFieldValue(fv, args, ['assignedTo']) ?? null;

    if (!title) {
      return { success: false, message: '缺少必要参数：任务标题' };
    }

    return executeCreateTask({
      title,
      dueDate,
      accountId,
      opportunityId,
      contactId,
      priority,
      description,
      assignedTo,
      conversation_id: cid,
    });
  },

  update_deal_stage: async (fv, args, cid) => {
    const opportunityId = fv('opportunityId') ?? String(args.opportunityId ?? '');
    const newStage = fv('newStage') ?? String(args.newStage ?? '');
    const reason = fv('reason') ?? String(args.reason ?? '');
    const source_quote = fv('source_quote') ?? String(args.source_quote ?? '');

    if (!opportunityId || !newStage) {
      return { success: false, message: '缺少必要参数：opportunityId 或 newStage' };
    }

    return executeUpdateDealStage({
      opportunityId,
      newStage,
      reason,
      source_quote,
      conversation_id: cid,
    });
  },

  add_intel: async (fv, args, cid) => {
    const accountId = fv('accountId') ?? String(args.accountId ?? '');
    const content = fv('content') ?? String(args.content ?? '');
    const intelType =
      (fv('intelType') as 'budget' | 'competitor' | 'timeline' | 'stakeholder' | 'risk' | 'opportunity') ?? 'opportunity';
    const priority =
      (fv('priority') as 'high' | 'medium' | 'low') ?? 'medium';
    const source_quote = fv('source_quote') ?? String(args.source_quote ?? '');

    if (!accountId || !content) {
      return { success: false, message: '缺少必要参数：accountId 或 content' };
    }

    return executeAddIntel({
      accountId,
      content,
      intelType,
      priority,
      source_quote,
      conversation_id: cid,
    });
  },

  update_contact_profile: async (fv, args, cid) => {
    const contactId = fv('contactId') ?? String(args.contactId ?? '');
    const role = (fv('role') as 'decision_maker' | 'influencer' | 'champion' | 'blocker' | 'end_user' | 'coach' | 'economic_buyer' | null) ?? null;
    const discType =
      (fv('discType') as 'D' | 'I' | 'S' | 'C' | null) ?? null;
    const communicationStyle = fv('communicationStyle') ?? null;
    const attitude = (fv('attitude') as 'positive' | 'neutral' | 'negative' | 'unknown' | null) ?? null;
    const influenceLevel = (fv('influenceLevel') as 'high' | 'medium' | 'low' | null) ?? null;
    const engagement = (fv('engagement') as 'active' | 'passive' | 'inactive' | null) ?? null;
    const notes = fv('notes') ?? null;
    const source_quote = fv('source_quote') ?? String(args.source_quote ?? '');

    if (!contactId) {
      return { success: false, message: '缺少必要参数：contactId' };
    }

    return executeUpdateContactProfile({
      contactId,
      role,
      discType,
      communicationStyle,
      attitude,
      influenceLevel,
      engagement,
      notes,
      source_quote,
      conversation_id: cid,
    });
  },

  create_contact: async (fv, args, cid) => {
    const name = fv('name') ?? String(args.name ?? '');
    const title = fv('title') ?? (args.title ? String(args.title) : null);
    const company = fv('company') ?? (args.company ? String(args.company) : null);
    const email = fv('email') ?? (args.email ? String(args.email) : null);
    const phone = fv('phone') ?? (args.phone ? String(args.phone) : null);
    const accountId = fv('accountId') ?? (args.accountId ? String(args.accountId) : null);

    if (!name) {
      return { success: false, message: '缺少必要参数：name' };
    }

    return executeCreateContact({
      name,
      title,
      company,
      email,
      phone,
      accountId,
      conversation_id: cid,
    });
  },

  update_account_info: async (fv, args, cid) => {
    const accountId = fv('accountId') ?? String(args.accountId ?? '');
    const field =
      (fv('field') as 'industry' | 'size' | 'annual_revenue' | 'key_initiatives' | 'budget_cycle') ??
      'industry';
    const value = fv('value') ?? String(args.value ?? '');
    const source_quote = fv('source_quote') ?? String(args.source_quote ?? '');

    if (!accountId || !value) {
      return { success: false, message: '缺少必要参数：accountId 或 value' };
    }

    return executeUpdateAccountInfo({
      accountId,
      field,
      value,
      source_quote,
      conversation_id: cid,
    });
  },

  update_opportunity: async (fv, args, cid) => {
    const opportunityId = fv('opportunityId') ?? String(args.opportunityId ?? '');
    if (!opportunityId) {
      return { success: false, message: '缺少必要参数：opportunityId' };
    }
    return executeUpdateOpportunity({
      opportunityId,
      name: fv('name') ?? (args.name ? String(args.name) : undefined),
      value: args.value != null ? Number(args.value) : undefined,
      currency: fv('currency') ?? (args.currency ? String(args.currency) : undefined),
      stage: fv('stage') ?? (args.stage ? String(args.stage) : undefined),
      closeDate: fv('closeDate') ?? (args.closeDate ? String(args.closeDate) : undefined),
      winProbability: args.winProbability != null ? Number(args.winProbability) : undefined,
      health: (fv('health') as 'healthy' | 'at_risk' | 'critical' | null) ?? undefined,
      notes: fv('notes') ?? (args.notes ? String(args.notes) : undefined),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  update_contact: async (fv, args, cid) => {
    const contactId = fv('contactId') ?? String(args.contactId ?? '');
    if (!contactId) {
      return { success: false, message: '缺少必要参数：contactId' };
    }
    return executeUpdateContact({
      contactId,
      name: fv('name') ?? (args.name ? String(args.name) : undefined),
      title: fv('title') ?? (args.title ? String(args.title) : undefined),
      email: fv('email') ?? (args.email ? String(args.email) : undefined),
      phone: fv('phone') ?? (args.phone ? String(args.phone) : undefined),
      wechat: fv('wechat') ?? (args.wechat ? String(args.wechat) : undefined),
      linkedin: fv('linkedin') ?? (args.linkedin ? String(args.linkedin) : undefined),
      department: fv('department') ?? (args.department ? String(args.department) : undefined),
      seniority: (fv('seniority') as 'c_level' | 'vp' | 'director' | 'manager' | 'senior' | 'mid' | 'junior' | null) ?? undefined,
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  add_discovery_note: async (fv, args, cid) => {
    const content = fv('content') ?? String(args.content ?? '');
    const noteType = (fv('noteType') as 'pain_point' | 'need' | 'budget' | 'timeline' | 'decision_process' | 'competitor' | 'other') ?? 'other';
    const priority = (fv('priority') as 'high' | 'medium' | 'low') ?? 'medium';

    if (!content) {
      return { success: false, message: '缺少必要参数：content' };
    }

    return executeAddDiscoveryNote({
      opportunityId: fv('opportunityId') ?? (args.opportunityId ? String(args.opportunityId) : null),
      accountId: fv('accountId') ?? (args.accountId ? String(args.accountId) : null),
      content,
      noteType,
      priority,
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  log_activity: async (fv, args, cid) => {
    const activityType = (fv('activityType') as 'call' | 'meeting' | 'email' | 'visit' | 'demo') ?? 'meeting';
    const summary = fv('summary') ?? String(args.summary ?? '');

    if (!summary) {
      return { success: false, message: '缺少必要参数：summary' };
    }

    return executeLogActivity({
      accountId: fv('accountId') ?? (args.accountId ? String(args.accountId) : null),
      contactId: fv('contactId') ?? (args.contactId ? String(args.contactId) : null),
      opportunityId: fv('opportunityId') ?? (args.opportunityId ? String(args.opportunityId) : null),
      activityType,
      summary,
      nextSteps: fv('nextSteps') ?? (args.nextSteps ? String(args.nextSteps) : null),
      date: fv('date') ?? (args.date ? String(args.date) : null),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  update_account: async (fv, args, cid) => {
    const accountId = fv('accountId') ?? String(args.accountId ?? '');
    if (!accountId) {
      return { success: false, message: '缺少必要参数：accountId' };
    }
    return executeUpdateAccount({
      accountId,
      notes: fv('notes') ?? (args.notes ? String(args.notes) : undefined),
      dealStage: fv('dealStage') ?? (args.dealStage ? String(args.dealStage) : undefined),
      dealHealth: (fv('dealHealth') as 'healthy' | 'at_risk' | 'critical' | null) ?? undefined,
      dealValue: args.dealValue != null ? Number(args.dealValue) : undefined,
      strategy: (args.strategy as Record<string, unknown>) ?? undefined,
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  create_opportunity: async (fv, args, cid) => {
    const name = fv('name') ?? String(args.name ?? '');
    if (!name) {
      return { success: false, message: '缺少必要参数：name' };
    }
    return executeCreateOpportunity({
      name,
      accountId: fv('accountId') ?? (args.accountId ? String(args.accountId) : null),
      value: args.value != null ? Number(args.value) : undefined,
      currency: fv('currency') ?? (args.currency ? String(args.currency) : undefined),
      stage: fv('stage') ?? (args.stage ? String(args.stage) : undefined),
      closeDate: fv('closeDate') ?? (args.closeDate ? String(args.closeDate) : undefined),
      description: fv('description') ?? (args.description ? String(args.description) : undefined),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  update_task: async (fv, args, cid) => {
    const taskId = fv('taskId') ?? String(args.taskId ?? '');
    if (!taskId) {
      return { success: false, message: '缺少必要参数：taskId' };
    }
    return executeUpdateTask({
      taskId,
      status: (fv('status') as 'pending' | 'in_progress' | 'completed' | 'cancelled' | null) ?? undefined,
      dueDate: fv('dueDate') ?? (args.dueDate ? String(args.dueDate) : undefined),
      notes: fv('notes') ?? (args.notes ? String(args.notes) : undefined),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  record_judgment_feedback: async (fv, args, cid) => {
    const accountId = fv('accountId') ?? String(args.accountId ?? '');
    const content = fv('content') ?? String(args.content ?? '');
    if (!accountId || !content) {
      return { success: false, message: '缺少必要参数：accountId 或 content' };
    }
    return executeRecordJudgmentFeedback({
      accountId,
      targetType: fv('targetType') ?? (args.targetType ? String(args.targetType) : 'judgment'),
      targetId: fv('targetId') ?? (args.targetId ? String(args.targetId) : `account:${accountId}`),
      kind: fv('kind') ?? (args.kind ? String(args.kind) : 'inaccurate'),
      content,
      previousSummary: fv('previousSummary') ?? (args.previousSummary ? String(args.previousSummary) : undefined),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  record_win_loss_calibration: async (fv, args, cid) => {
    const accountId = fv('accountId') ?? String(args.accountId ?? '');
    const outcome = fv('outcome') ?? String(args.outcome ?? '');
    const notes = fv('notes') ?? String(args.notes ?? '');
    if (!accountId || !outcome || !notes) {
      return { success: false, message: '缺少必要参数：accountId、outcome 或 notes' };
    }
    return executeRecordWinLossCalibration({
      accountId,
      opportunityId: fv('opportunityId') ?? (args.opportunityId ? String(args.opportunityId) : null),
      outcome: outcome as Parameters<typeof executeRecordWinLossCalibration>[0]['outcome'],
      notes,
      previousJudgment: fv('previousJudgment') ?? (args.previousJudgment ? String(args.previousJudgment) : undefined),
      previousRisk: fv('previousRisk') ?? (args.previousRisk ? String(args.previousRisk) : undefined),
      previousNextAction: fv('previousNextAction') ?? (args.previousNextAction ? String(args.previousNextAction) : undefined),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? ''),
      conversation_id: cid,
    });
  },

  record_task_outcome: async (fv, args, cid) => {
    const taskId = fv('taskId') ?? String(args.taskId ?? '');
    const outcome = fv('outcome') ?? String(args.outcome ?? 'unknown');
    const outcomeNote = fv('outcomeNote') ?? fv('reason') ?? String(args.outcomeNote ?? args.reason ?? '');
    if (!taskId || !outcome || !outcomeNote) {
      return { success: false, message: '缺少必要参数：任务、结果或原因' };
    }
    return executeRecordTaskOutcome({
      taskId,
      accountId: fv('accountId') ?? (args.accountId ? String(args.accountId) : null),
      opportunityId: fv('opportunityId') ?? (args.opportunityId ? String(args.opportunityId) : null),
      contactId: fv('contactId') ?? (args.contactId ? String(args.contactId) : null),
      outcome: outcome as Parameters<typeof executeRecordTaskOutcome>[0]['outcome'],
      outcomeNote,
      reason: fv('reason') ?? (args.reason ? String(args.reason) : outcomeNote),
      judgmentImpact: fv('judgmentImpact') ?? (args.judgmentImpact ? String(args.judgmentImpact) : undefined),
      previousTaskStatus: fv('previousTaskStatus') ?? (args.previousTaskStatus ? String(args.previousTaskStatus) : undefined),
      newTaskStatus: fv('newTaskStatus') ?? (args.newTaskStatus ? String(args.newTaskStatus) : undefined),
      source_quote: fv('source_quote') ?? String(args.source_quote ?? outcomeNote),
      conversation_id: cid,
    });
  },
};

// ─── Main dispatch function ───────────────────────────────────────────────────

export async function dispatchTool(
  action: ConfirmedAction,
  conversationId: string,
): Promise<ToolResult> {
  // source_quote 服务端防幻觉验证
  const sqError = validateSourceQuote(action);
  if (sqError) return sqError;

  // 搜索工具不走确认流程
  if (
    action.toolName === 'search_contacts' ||
    action.toolName === 'search_accounts' ||
    action.toolName === 'search_opportunities'
  ) {
    return {
      success: false,
      message: '搜索工具为只读自动执行，不需要通过确认流程',
    };
  }

  const handler = TOOL_HANDLERS[action.toolName];
  if (!handler) {
    return {
      success: false,
      message: `未知工具：${action.toolName as string}`,
    };
  }

  const fieldVal = makeFieldVal(action);
  return handler(fieldVal, action.args ?? {}, conversationId);
}
