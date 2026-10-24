import { describe, expect, it } from 'vitest';
import {
  buildStrategyAuxiliaryContext,
  buildStrategyPrompt,
  STRATEGY_PROMPT_CHAR_BUDGETS,
} from '@/lib/babel-engine/strategy';
import type { StrategyInput } from '@/lib/babel-engine/types';

function makeInput(overrides?: Partial<StrategyInput>): StrategyInput {
  return {
    decodedMessage: {
      messages: [
        {
          speaker: 'them',
          original: 'Can you send the revised proposal?',
          decode: {
            meaning: '想继续推进但要更多把握',
            emotion: '谨慎',
            urgency: 7,
            confidence: 0.85,
          },
        },
      ],
      threadAnalysis: {
        sentimentTrend: 'stable',
        riskLevel: 'medium',
        buyerState: 'evaluating',
        keySignal: '仍在采购评估中',
      },
    },
    ...overrides,
  };
}

describe('strategy prompt builder', () => {
  it('按 tasks → intelItems → cilContext 顺序拼接辅助上下文，并保留 DISC 指令', () => {
    const input = makeInput({
      contactDiscType: 'D',
      tasks: [
        {
          title: '补发报价版本',
          status: 'pending',
          priority: 'high',
          dueDate: '2026-04-08',
          isOverdue: true,
          assignedTo: 'Athena',
        },
      ],
      intelItems: [
        {
          title: '预算已锁定',
          summary: '客户本季度预算已经批复。',
          type: 'email_decode',
          date: '2026-04-01',
          urgency: 'high',
        },
      ],
      cilContext: '\n\n=== 编译智能层（CIL）上下文 ===\n### 风险分析（CIL）\n法务周期偏长。',
    });

    const { system, user } = buildStrategyPrompt(input);
    expect(system).toContain('## DISC 沟通风格适配');
    expect(system).toContain('此联系人为 D 型');

    const taskIndex = user.indexOf('=== 相关任务执行情况');
    const intelIndex = user.indexOf('=== 最新情报');
    const cilIndex = user.indexOf('=== 编译智能层（CIL）上下文 ===');

    expect(taskIndex).toBeGreaterThan(-1);
    expect(intelIndex).toBeGreaterThan(taskIndex);
    expect(cilIndex).toBeGreaterThan(intelIndex);
  });

  it('tasks 与 intelItems 超长时会在各自 block 内截断，不打乱顺序', () => {
    const input = makeInput({
      tasks: Array.from({ length: 20 }, (_, i) => ({
        title: `超长任务 ${i} ${'任务描述'.repeat(40)}`,
        status: 'pending',
        priority: 'high',
        dueDate: '2026-04-08',
        isOverdue: i < 10,
        assignedTo: 'Owner',
      })),
      intelItems: Array.from({ length: 20 }, (_, i) => ({
        title: `超长情报 ${i}`,
        summary: '情报内容'.repeat(120),
        type: 'email_decode',
        date: '2026-04-01',
        urgency: 'high',
      })),
      cilContext: '\n\n=== 编译智能层（CIL）上下文 ===\n' + 'CIL 内容'.repeat(2000),
    });

    const auxiliary = buildStrategyAuxiliaryContext(input);
    const taskIndex = auxiliary.indexOf('=== 相关任务执行情况');
    const intelIndex = auxiliary.indexOf('=== 最新情报');
    const cilIndex = auxiliary.indexOf('=== 编译智能层（CIL）上下文 ===');

    expect(taskIndex).toBeGreaterThan(-1);
    expect(intelIndex).toBeGreaterThan(taskIndex);
    expect(cilIndex).toBeGreaterThan(intelIndex);
    expect(auxiliary).toContain('…（已截断）');

    const taskBlock = auxiliary.slice(taskIndex, intelIndex);
    const intelBlock = auxiliary.slice(intelIndex, cilIndex);
    const cilBlock = auxiliary.slice(cilIndex);

    expect(taskBlock.length).toBeLessThanOrEqual(STRATEGY_PROMPT_CHAR_BUDGETS.tasks + 20);
    expect(intelBlock.length).toBeLessThanOrEqual(STRATEGY_PROMPT_CHAR_BUDGETS.intel + 20);
    expect(cilBlock.length).toBeLessThanOrEqual(STRATEGY_PROMPT_CHAR_BUDGETS.cil + 20);
  });
});
