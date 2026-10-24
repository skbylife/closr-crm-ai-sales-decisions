import { describe, expect, it } from 'vitest';
import type { Judgment } from '@/lib/babel-engine/types';
import { buildJudgmentActionPanelModel } from './action-panel';
import type { JudgmentMemorySourceItem } from './memory-sources';
import type { JudgmentTimelineItem } from './timeline';

const accountId = 'acc_1';

function judgment(overrides: Partial<Judgment> = {}): Judgment {
  return {
    id: 'judgment_1',
    accountId,
    kind: 'momentum',
    title: '推进判断',
    summary: '客户仍愿意推进，但采购节奏开始放慢。',
    value: 'mixed',
    confidence: 0.71,
    status: 'active',
    evidenceRefs: [{ sourceId: 'email_1', sourceKind: 'email_decode', title: '采购邮件' }],
    updatedAt: '2026-05-02T12:00:00.000Z',
    ...overrides,
  };
}

function memory(overrides: Partial<JudgmentMemorySourceItem> = {}): JudgmentMemorySourceItem {
  return {
    id: 'decode:email_1',
    sourceRecordId: 'sr_1',
    sourceKind: 'decode',
    sourceId: 'email_1',
    sourceTable: 'email_decodes',
    sourceRowId: 'email_1',
    title: 'CFO 回复预算确认',
    currentJudgment: 'CFO 已进入预算讨论，机会仍有推进窗口。',
    risk: '采购法务还没有确认，可能拖慢签约。',
    nextAction: '请 champion 在下一封邮件里确认法务时间线。',
    confidence: 0.74,
    provisional: false,
    evidenceRefs: [{ sourceId: 'email_1', sourceKind: 'email_decode', title: 'CFO 邮件' }],
    updatedAt: '2026-05-02T13:00:00.000Z',
    traceStatus: 'persisted',
    ...overrides,
  };
}

function timeline(overrides: Partial<JudgmentTimelineItem> = {}): JudgmentTimelineItem {
  return {
    id: 'feedback:fb_1',
    accountId,
    kind: 'feedback',
    title: '用户反馈 · 综合判断 · 不准确',
    summary: '用户指出采购风险被低估，需要重新校准。',
    occurredAt: '2026-05-02T14:00:00.000Z',
    traceStatus: 'persisted',
    ...overrides,
  };
}

describe('buildJudgmentActionPanelModel', () => {
  it('builds action-oriented copy from judgment memory and timeline without exposing internal labels', () => {
    const model = buildJudgmentActionPanelModel({
      judgments: [judgment({ kind: 'deal_risk', summary: '法务和采购还没有给出明确时间线。' })],
      judgmentMemories: [memory()],
      judgmentTimeline: [timeline()],
      feedbackRevisionRecords: [],
      winLossCalibrations: [],
    });

    expect(model.empty).toBe(false);
    expect(model.currentJudgment).toBe('CFO 已进入预算讨论，机会仍有推进窗口。');
    expect(model.keyRisk).toBe('法务和采购还没有给出明确时间线。');
    expect(model.nextAction).toBe('请 champion 在下一封邮件里确认法务时间线。');
    expect(model.recentChanges[0]).toMatchObject({ label: '人工修正', tone: 'warning' });
    expect(model.evidence.sourceLabels).toContain('Decode 解读');
    expect(`${model.recentChanges[0].label} ${model.evidence.label} ${model.evidence.description}`).not.toMatch(/provisional|invalidated|confidence|source_records|source_record|revision/i);
  });

  it('returns a friendly empty state when no judgment data exists', () => {
    const model = buildJudgmentActionPanelModel({
      judgments: [],
      judgmentMemories: [],
      judgmentTimeline: [],
      feedbackRevisionRecords: [],
      winLossCalibrations: [],
    });

    expect(model.empty).toBe(true);
    expect(model.currentJudgment).toContain('还没有形成稳定判断');
    expect(model.keyRisk).toContain('暂无明确高优先级风险');
    expect(model.nextAction).toContain('记录最近一次客户互动');
    expect(model.evidence).toMatchObject({ label: '证据不足', tone: 'thin', sourceCount: 0 });
  });

  it('summarizes calibration records and maps win/loss changes to user-facing wording', () => {
    const model = buildJudgmentActionPanelModel({
      judgments: [judgment()],
      judgmentMemories: [memory({ evidenceRefs: [
        { sourceId: 'email_1', sourceKind: 'email_decode', title: 'CFO 邮件' },
        { sourceId: 'activity_1', sourceKind: 'activity_log', title: '会议纪要' },
        { sourceId: 'play_1', sourceKind: 'strategic_play', title: '推进计划' },
      ] })],
      judgmentTimeline: [timeline({ id: 'win_loss_calibration:cal_1', kind: 'win_loss_calibration', summary: '丢单校准：下次必须提前验证采购路径。' })],
      feedbackRevisionRecords: [{
        feedback: {
          id: 'fb_1',
          accountId,
          targetType: 'judgment',
          targetId: 'judgment-action-panel',
          kind: 'missed_risk',
          feedbackType: 'missed_risk',
          content: '漏看法务安全审查风险',
          scope: 'account_only',
          status: 'active',
          evidenceRefs: [],
          createdAt: '2026-05-02T15:00:00.000Z',
        },
        revisedPreview: {
          previousSummary: '旧判断',
          userCorrection: '漏看法务安全审查风险',
          revisedSummary: '采购路径需要先验证。',
          whyChanged: '用户补充了校准信息。',
          confidenceDelta: -0.1,
          preservedClaims: [],
          replacedClaims: [],
          provisional: true,
        },
        revisionStatus: 'ready',
      }],
      winLossCalibrations: [{
        id: 'cal_1',
        accountId,
        outcome: 'lost',
        outcomeAt: '2026-05-02T10:00:00.000Z',
        notes: '输给竞对。',
        lessons: ['下次必须提前验证采购路径。'],
        validatedSignals: ['采购没有确认时间线最终造成延期'],
        disprovenSignals: ['Champion 口头积极不等于内部已达成共识'],
        evidenceRefs: [],
        createdAt: '2026-05-02T10:05:00.000Z',
      }],
    });

    expect(model.recentChanges[0]).toMatchObject({ label: '成交复盘', tone: 'positive' });
    expect(model.calibration).toMatchObject({ feedbackCount: 1, winLossCount: 1, latestFeedback: '采购路径需要先验证。', latestWinLoss: '下次必须提前验证采购路径。' });
    expect(model.calibration.feedbackCategoryLabels).toContain('漏看风险');
    expect(model.calibration.latestValidatedSignals).toContain('采购没有确认时间线最终造成延期');
    expect(model.calibration.latestDisprovenSignals).toContain('Champion 口头积极不等于内部已达成共识');
    expect(model.calibration.loopSummary).toContain('回写到账户判断记忆');
    expect(model.evidence.tone).toBe('strong');
    expect(model.evidence.sourceCount).toBe(3);
  });

  it('deduplicates source_record wrappers and their underlying evidence rows', () => {
    const model = buildJudgmentActionPanelModel({
      judgments: [judgment()],
      judgmentMemories: [memory()],
      judgmentTimeline: [],
      feedbackRevisionRecords: [],
      winLossCalibrations: [],
    });

    expect(model.evidence.sourceCount).toBe(1);
    expect(model.evidence.description).toContain('已关联 1 条来源');
  });
});
