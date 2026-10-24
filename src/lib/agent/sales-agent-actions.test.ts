import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSalesAgent, type ChatContext } from './sales-agent';

const baseContext: ChatContext = {
  userId: 'user_1',
  orgId: 'org_1',
  accountId: 'acc_1',
  opportunityId: 'opp_1',
  currentAccountName: '华南银行',
  currentOpportunityName: '数据平台扩容',
  currentAccountContacts: [{ id: 'con_lee', name: '李总', title: '业务负责人' }],
  judgmentContext: {
    accountId: 'acc_1',
    currentJudgment: '客户仍有推进意向，但需要确认预算窗口。',
    keyRisks: ['预算审批未确认'],
    keyEvidence: ['最近邮件要求补充安全材料'],
    recentChanges: [],
    evidenceStatus: '已有证据',
    uncertainties: ['CFO 是否支持尚未确认'],
    nextActions: ['约李总确认预算窗口和决策流程'],
    sourceSummary: '客户邮件',
  },
};

describe('Sales Agent confirmed task action intent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T16:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function mockLLMResponse(message: Record<string, unknown>) {
    vi.stubEnv('AI_BASE_URL', 'http://ai.test');
    vi.stubEnv('AI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message }] }),
    }));
  }

  it('returns a pending create_task action only when the user explicitly asks to turn next step into a task', async () => {
    const result = await runSalesAgent('把下一步动作变成任务，明天跟进李总', baseContext, []);

    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingActions).toHaveLength(1);
    const action = result.pendingActions?.[0];
    expect(action?.toolName).toBe('create_task');
    expect(action?.displayName).toBe('创建跟进任务');
    expect(action?.args).toMatchObject({
      title: '跟进李总',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      contactId: 'con_lee',
      dueDate: '2026-05-03',
      priority: 'medium',
      assignedTo: 'user_1',
    });
    expect(action?.requiresConfirmation).toBe(true);
    expect(result.reply).toContain('确认前不会写入');
  });

  it('keeps an unspecified due date as a suggestion instead of writing a date', async () => {
    const result = await runSalesAgent('把下一步动作变成任务', baseContext, []);

    const action = result.pendingActions?.[0];
    expect(action?.args.dueDate).toBeNull();
    expect(action?.args.suggestedDueDate).toBe('建议明天');
    expect(action?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: '建议截止时间', value: '建议明天', confidence: 'implied' }),
    ]));
  });

  it('does not create pending actions for a progression-only question', async () => {
    mockLLMResponse({ content: '当前判断：客户可推进\n下一步动作：先确认预算窗口', tool_calls: [] });

    const result = await runSalesAgent('这个客户怎么推进？', baseContext, []);

    expect(result.pendingActions).toBeUndefined();
    expect(result.requiresConfirmation).toBe(false);
  });

  it('does not create pending actions for negative task intent', async () => {
    mockLLMResponse({ content: '好的，我先只给建议，不创建任务。', tool_calls: [] });

    const result1 = await runSalesAgent('不要创建任务，先分析一下', baseContext, []);
    const result2 = await runSalesAgent('先别建任务，告诉我怎么推进', baseContext, []);

    expect(result1.pendingActions).toBeUndefined();
    expect(result1.requiresConfirmation).toBe(false);
    expect(result2.pendingActions).toBeUndefined();
    expect(result2.requiresConfirmation).toBe(false);
  });

  it('drops model-returned create_task tool calls when the user did not clearly ask to create a task', async () => {
    mockLLMResponse({
      content: null,
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: {
          name: 'create_task',
          arguments: JSON.stringify({ title: '跟进李总', accountId: 'acc_1', priority: 'medium' }),
        },
      }],
    });

    const result = await runSalesAgent('这个客户怎么推进？', baseContext, []);

    expect(result.pendingActions).toBeUndefined();
    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toContain('先不创建任务');
  });
});
