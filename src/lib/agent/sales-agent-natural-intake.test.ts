import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSalesAgent, type ChatContext } from './sales-agent';

const baseContext: ChatContext = {
  userId: 'user_1',
  orgId: 'org_1',
  accountId: 'acc_1',
  opportunityId: 'opp_1',
  currentAccountName: '华东平台客户',
  currentOpportunityName: '续约扩容项目',
};

describe('Sales Agent natural intake router', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-22T22:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('turns a meeting note with budget signal into activity and intel confirmation cards', async () => {
    const result = await runSalesAgent(
      '记录一下今天会议：客户说预算审批卡在 CFO，下周给反馈，下一步约采购确认流程',
      baseContext,
      [],
    );

    expect(result.requiresConfirmation).toBe(true);
    expect(result.reply).toContain('记录销售活动');
    expect(result.reply).toContain('添加客户情报');
    expect(result.pendingActions).toHaveLength(2);
    expect(result.pendingActions?.[0]).toMatchObject({
      toolName: 'log_activity',
      displayName: '记录销售活动',
      args: expect.objectContaining({
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        activityType: 'meeting',
        nextSteps: '约采购确认流程',
        source_quote: '记录一下今天会议：客户说预算审批卡在 CFO，下周给反馈，下一步约采购确认流程',
      }),
    });
    expect(result.pendingActions?.[1]).toMatchObject({
      toolName: 'add_intel',
      displayName: '添加客户情报',
      args: expect.objectContaining({
        accountId: 'acc_1',
        intelType: 'budget',
        priority: 'high',
      }),
    });
  });

  it('asks for account or opportunity context before recording natural intake', async () => {
    const result = await runSalesAgent(
      '客户反馈说预算已经批了，下周开始采购流程',
      { userId: 'user_1', orgId: 'org_1' },
      [],
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.pendingActions).toBeUndefined();
    expect(result.reply).toContain('需要先进入对应客户或商机页面');
  });

  it('keeps explicit task creation routed to create_task instead of natural intake', async () => {
    const result = await runSalesAgent(
      '帮我创建任务：明天跟进客户反馈预算审批结果',
      baseContext,
      [],
    );

    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions?.[0]?.toolName).toBe('create_task');
  });
});
