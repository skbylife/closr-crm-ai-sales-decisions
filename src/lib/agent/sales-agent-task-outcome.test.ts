import { describe, expect, it } from 'vitest';
import { detectTaskOutcomeIntent, runSalesAgent, type ChatContext } from './sales-agent';

const context: ChatContext = {
  accountId: 'acc_1',
  currentAccountName: 'Acme',
  tasks: [
    {
      id: 'task_1',
      title: '跟进李总确认评审时间',
      status: 'todo',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      contactId: 'con_1',
      priority: 'high',
    },
  ],
  judgmentContext: {
    accountId: 'acc_1',
    currentJudgment: '客户有推进机会，但采购路径待确认。',
    keyRisks: ['采购审批路径不清晰。'],
    keyEvidence: ['上次任务要求确认评审时间。'],
    recentChanges: [],
    evidenceStatus: '1 条可追溯证据',
    uncertainties: ['采购是否支持仍未知。'],
    nextActions: ['跟进李总确认下周评审。'],
    sourceSummary: '主要参考：任务和邮件记录',
  },
};

describe('Sales Agent task outcome pending action', () => {
  it('returns record_task_outcome pending confirmation for explicit task outcome', async () => {
    const result = await runSalesAgent('刚才那个跟进任务完成了，因为李总同意下周评审', context, []);

    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingActions?.[0]).toMatchObject({
      toolName: 'record_task_outcome',
      displayName: '记录任务执行反馈',
      args: expect.objectContaining({
        taskId: 'task_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        contactId: 'con_1',
        outcome: 'completed',
        reason: '因为李总同意下周评审',
      }),
    });
    expect(result.reply).toContain('确认前不会写入');
  });

  it('does not detect ordinary progression asks or uncertain/negative statements as task outcomes', async () => {
    const progression = await runSalesAgent('这个客户现在怎么推进？', context, []);
    const noReplyProgression = await runSalesAgent('这个客户怎么推进？任务还没回复', context, []);
    const disagreed = await runSalesAgent('这个跟进任务客户不同意下周评审', context, []);
    const unconfirmed = await runSalesAgent('这个跟进任务还没确认下周评审', context, []);

    expect(progression.requiresConfirmation).toBe(false);
    expect(progression.pendingActions).toBeUndefined();
    expect(progression.reply).toMatch(/^当前判断/);
    expect(noReplyProgression.requiresConfirmation).toBe(false);
    expect(noReplyProgression.pendingActions).toBeUndefined();
    expect(disagreed.pendingActions).toBeUndefined();
    expect(unconfirmed.pendingActions).toBeUndefined();
    expect(detectTaskOutcomeIntent('这个任务可能完成了，因为李总好像同意了')).toBeNull();
    expect(detectTaskOutcomeIntent('先不要记录这个任务完成')).toBeNull();
    expect(detectTaskOutcomeIntent('这个跟进任务客户不同意下周评审')).toBeNull();
    expect(detectTaskOutcomeIntent('这个跟进任务还没确认下周评审')).toBeNull();
  });

  it('detects delayed only when delay is explicitly stated', async () => {
    expect(detectTaskOutcomeIntent('这个任务客户没回复')).toBeNull();

    const result = await runSalesAgent('任务延期了，因为客户没回复', context, []);

    expect(result.pendingActions?.[0]).toMatchObject({
      toolName: 'record_task_outcome',
      args: expect.objectContaining({
        taskId: 'task_1',
        outcome: 'delayed',
        reason: '因为客户没回复',
      }),
    });
  });

  it('requires an explicit task title when multiple tasks exist', async () => {
    const multiTaskContext: ChatContext = {
      ...context,
      tasks: [
        context.tasks![0],
        {
          id: 'task_2',
          title: '联系采购确认预算审批',
          status: 'todo',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          contactId: 'con_2',
          priority: 'high',
        },
      ],
    };

    const ambiguous = await runSalesAgent('跟进任务延期了，因为客户没回复', multiTaskContext, []);
    const titled = await runSalesAgent('跟进李总确认评审时间延期了，因为客户没回复', multiTaskContext, []);

    expect(ambiguous.requiresConfirmation).toBe(false);
    expect(ambiguous.pendingActions).toBeUndefined();
    expect(ambiguous.reply).toContain('明确对应任务');
    expect(titled.pendingActions?.[0]).toMatchObject({
      toolName: 'record_task_outcome',
      args: expect.objectContaining({ taskId: 'task_1', outcome: 'delayed' }),
    });
  });
});
