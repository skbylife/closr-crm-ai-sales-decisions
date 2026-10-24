import { describe, expect, it } from 'vitest';
import { runSalesAgent } from './sales-agent';
import {
  detectJudgmentFeedbackIntent,
  detectWinLossCalibrationIntent,
  formatJudgmentContextAnswer,
  isJudgmentContextAsk,
  summarizeJudgmentContext,
} from './judgment-context';
import type { JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { JudgmentTimelineItem } from '@/lib/judgment/timeline';

const memory = (overrides: Partial<JudgmentMemorySourceItem> = {}): JudgmentMemorySourceItem => ({
  id: 'decode:dec_1',
  sourceRecordId: 'sr_1',
  sourceKind: 'decode',
  sourceId: 'dec_1',
  sourceTable: 'email_decodes',
  sourceRowId: 'dec_1',
  title: '最近客户邮件',
  currentJudgment: '客户仍有采购意向，但推进节奏转慢。',
  risk: '预算审批和决策人态度尚未确认。',
  nextAction: '约业务负责人确认预算窗口和决策流程。',
  confidence: 0.72,
  uncertainty: '尚不清楚 CFO 是否支持。',
  provisional: true,
  evidenceRefs: [{ sourceId: 'dec_1', sourceKind: 'email_decode', title: '客户邮件提到预算排期' }],
  updatedAt: '2026-05-01T10:00:00.000Z',
  traceStatus: 'persisted',
  ...overrides,
});

describe('agent judgment context', () => {
  it('summarizes current judgment, evidence, risks, uncertainty, and next actions without internal jargon', () => {
    const summary = summarizeJudgmentContext({
      accountId: 'acc_1',
      judgmentMemories: [memory()],
      judgmentTimeline: [{
        id: 'feedback:fb_1',
        accountId: 'acc_1',
        kind: 'feedback',
        title: '用户反馈',
        summary: '真实情况是预算已批，但法务还没过。',
        signal: '预算已批',
        occurredAt: '2026-05-02T10:00:00.000Z',
        traceStatus: 'persisted',
      } satisfies JudgmentTimelineItem],
    });

    expect(summary?.currentJudgment).toContain('采购意向');
    expect(summary?.keyRisks[0]).toContain('预算审批');
    expect(summary?.keyEvidence.join('\n')).toContain('客户邮件提到预算排期');
    expect(summary?.recentChanges.join('\n')).toContain('用户修正');
    expect(summary?.uncertainties[0]).toContain('CFO');
    expect(summary?.nextActions[0]).toContain('确认预算窗口');
    expect(JSON.stringify(summary)).not.toMatch(/provisional|source_records|confidence|BABEL/i);
  });

  it('detects judgment Q&A and P1 calibration intents', () => {
    expect(isJudgmentContextAsk('这个客户现在怎么推进？')).toBe(true);
    expect(isJudgmentContextAsk('为什么系统这么判断？')).toBe(true);
    expect(isJudgmentContextAsk('最近判断有什么变化？')).toBe(true);
    expect(detectJudgmentFeedbackIntent('这个判断不对，真实情况是预算已经批了')).toBe(true);
    expect(detectWinLossCalibrationIntent('这个单丢了，原因是价格太高')).toBe('lost');
  });

  it('formats judgment questions with the required four sections and no progression/internal jargon', async () => {
    const judgmentContext = summarizeJudgmentContext({
      accountId: 'acc_1',
      judgmentMemories: [memory({
        currentJudgment: '客户仍有采购意向，但推进节奏转慢。provisional confidence engine BABEL',
      })],
    });

    expect(judgmentContext).toBeTruthy();
    const result = await runSalesAgent('这个客户现在怎么推进？为什么系统这么判断？', {
      userId: 'user_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      currentAccountName: '测试客户',
      judgmentContext: judgmentContext ?? undefined,
    }, []);

    expect(result.requiresConfirmation).toBe(false);
    expect(result.pendingActions).toBeUndefined();
    expect(result.mode).toBe('chat');
    expect(result.reply).toMatch(/^当前判断\n/m);
    expect(result.reply).toMatch(/^关键证据\n/m);
    expect(result.reply).toMatch(/^不确定点\n/m);
    expect(result.reply).toMatch(/^下一步动作\n/m);
    expect(result.reply).not.toMatch(/最大阻塞|推荐推进对象|风险提示/);
    expect(result.reply).not.toMatch(/provisional|invalidated|source_records|confidence|engine|BABEL|底座/i);
  });

  it('direct judgment formatter uses the same deterministic four-section contract', () => {
    const judgmentContext = summarizeJudgmentContext({ accountId: 'acc_1', judgmentMemories: [memory()] });
    expect(judgmentContext).toBeTruthy();
    const reply = formatJudgmentContextAnswer(judgmentContext!);

    expect(reply.split('\n\n').map((section) => section.split('\n')[0])).toEqual([
      '当前判断',
      '关键证据',
      '不确定点',
      '下一步动作',
    ]);
  });

  it('P1 feedback intent returns a confirmation action and does not claim it was written', async () => {
    const result = await runSalesAgent('这个判断不对，真实情况是预算已经批了', {
      userId: 'user_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      currentAccountName: '测试客户',
      judgmentContext: summarizeJudgmentContext({ accountId: 'acc_1', judgmentMemories: [memory()] }) ?? undefined,
    }, []);

    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingActions?.[0]?.toolName).toBe('record_judgment_feedback');
    expect(result.reply).toContain('确认前不会写入');
    expect(result.reply).not.toContain('已记录');
  });

  it('P1 win/loss intent returns a confirmation action and does not silently write', async () => {
    const result = await runSalesAgent('这个单赢了，原因是 Champion 帮我们推进了采购', {
      userId: 'user_1',
      orgId: 'org_1',
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      currentAccountName: '测试客户',
      currentOpportunityName: '测试商机',
      judgmentContext: summarizeJudgmentContext({ accountId: 'acc_1', judgmentMemories: [memory()] }) ?? undefined,
    }, []);

    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingActions?.[0]?.toolName).toBe('record_win_loss_calibration');
    expect(result.pendingActions?.[0]?.args.outcome).toBe('won');
    expect(result.reply).toContain('确认前不会写入');
    expect(result.reply).not.toContain('已记录');
  });
});

describe('summarizeJudgmentContext task outcomes', () => {
  it('uses task_outcome as key evidence and uncertainty signal', () => {
    const taskOutcome: JudgmentTimelineItem = {
      id: 'task_outcome:sr_task_outcome_1',
      accountId: 'acc_1',
      kind: 'task_outcome',
      sourceKind: 'task_outcome',
      sourceId: 'sr_task_outcome_1',
      sourceTable: 'source_records',
      sourceRowId: 'sr_task_outcome_1',
      title: '任务执行反馈 · 受阻',
      summary: '受阻：采购没批。',
      signal: '采购没批，任务卡住了。',
      risk: '采购审批是当前推进阻力。',
      nextAction: '暴露采购阻力，需要重新判断推进路径',
      occurredAt: '2026-05-01T13:00:00.000Z',
      traceStatus: 'persisted',
    };

    const context = summarizeJudgmentContext({ accountId: 'acc_1', judgmentTimeline: [taskOutcome] });

    expect(context).not.toBeNull();
    expect(context?.keyEvidence.join('\n')).toContain('任务执行反馈：采购没批，任务卡住了。');
    expect(context?.uncertainties).toContain('采购审批是当前推进阻力。');
    expect(context?.recentChanges.join('\n')).toContain('任务反馈：受阻：采购没批。');
    expect(context?.evidenceStatus).toContain('1 条任务执行反馈');
  });
});
