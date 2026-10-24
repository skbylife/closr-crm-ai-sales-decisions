import { describe, expect, it } from 'vitest';
import {
  buildAccountTraceNarrative,
  buildPipelineTraceNarrative,
  buildTasksTraceNarrative,
} from './trace-narrative';

describe('judgment trace narrative', () => {
  it('turns account memory into the four visible judgment layers', () => {
    const model = buildAccountTraceNarrative({
      currentJudgment: '客户预算仍在，但审批人发生变化。',
      evidenceSourceCount: 4,
      evidenceLabels: ['沟通解读', '任务反馈', '沟通解读'],
      conflictCount: 1,
      openQuestionCount: 2,
      activeOpportunityCount: 1,
      activeTaskCount: 3,
      nextAction: '先确认新审批人的关注点。',
      accountId: 'acc_1',
    });

    expect(model.title).toBe('可信判断层');
    expect(model.currentJudgment).toContain('审批人发生变化');
    expect(model.evidenceTrace).toContain('4 条判断痕迹');
    expect(model.uncertainty).toContain('1 个矛盾信号');
    expect(model.uncertainty).toContain('2 个待验证问题');
    expect(model.nextCalibrationAction).toBe('先确认新审批人的关注点。');
    expect(model.evidenceLabels).toEqual(['沟通解读', '任务反馈']);
    expect(`${model.title}${model.subtitle}`).not.toMatch(/CRM|dashboard|report/i);
  });

  it('keeps pipeline copy focused on judgment instead of surface probability', () => {
    const model = buildPipelineTraceNarrative({
      activeDealCount: 8,
      atRiskDealCount: 3,
      overdueTaskCount: 2,
      uncoveredDealCount: 4,
      playCoveredDealCount: 4,
    });

    expect(model.currentJudgment).toContain('判断正在变弱');
    expect(model.evidenceTrace).toContain('4 个商机');
    expect(model.uncertainty).toContain('胜率可能只是表层概率');
    expect(model.nextCalibrationAction).toContain('用执行结果校准商机健康度');
  });

  it('connects task execution back to judgment calibration', () => {
    const model = buildTasksTraceNarrative({
      totalTaskCount: 12,
      activeTaskCount: 7,
      overdueTaskCount: 1,
      blockedTaskCount: 2,
      inProgressTaskCount: 3,
      playLinkedTaskCount: 5,
    });

    expect(model.currentJudgment).toContain('未完成任务');
    expect(model.evidenceTrace).toContain('5 项');
    expect(model.uncertainty).toContain('3 项逾期/阻塞任务');
    expect(model.nextCalibrationAction).toContain('写回客户判断');
  });
});

it('does not inject a customer narrative based only on a legacy account identifier', () => {
  const input = { evidenceSourceCount: 0, conflictCount: 0, openQuestionCount: 0, activeOpportunityCount: 0, activeTaskCount: 0 };
  const ordinary = buildAccountTraceNarrative({ ...input, accountId: 'ordinary' });
  const legacy = buildAccountTraceNarrative({ ...input, accountId: 'acc_eastchina_platform_001' });
  expect(legacy.currentJudgment).toBe(ordinary.currentJudgment);
  expect(legacy.uncertainty).toBe(ordinary.uncertainty);
  expect(legacy.nextCalibrationAction).toBe(ordinary.nextCalibrationAction);
});
