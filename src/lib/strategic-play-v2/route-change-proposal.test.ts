import { describe, expect, it } from 'vitest';

import { buildRouteChangeProposal } from './route-change-proposal';

describe('buildRouteChangeProposal', () => {
  it('builds a human-confirmed route proposal from a signal without confirming judgments silently', () => {
    const proposal = buildRouteChangeProposal({
      play: {
        id: 'play_1',
        goalDescription: '推进 CFO 背书',
        strategicObjective: '先确认 CFO 评估标准',
        steps: [
          { id: 'move-a', title: '让 champion 引荐 CFO', status: 'planned' },
        ],
        playVersions: [{ version: 2 }],
      },
      signal: {
        signalStatement: 'CFO 要求先看风险责任边界',
        affectedJudgment: '原路线假设 champion 可以直接推动 CFO 背书',
        evidence: '邮件明确提到 CFO 需要风险责任边界',
        question: 'CFO 是否把风险责任边界作为进入评审的前置条件？',
        nextMove: '先补一页风险责任边界，再请 champion 转发 CFO',
        needsReplan: true,
        triggerKind: 'decode_signal',
        now: '2026-06-06T20:00:00.000Z',
        sourceRef: { sourceId: 'sr_1', sourceType: 'email_decode', sourceTable: 'source_records' },
      },
    });

    expect(proposal).toMatchObject({
      status: 'proposed',
      requiresHumanConfirmation: true,
      triggerKind: 'decode_signal',
      changedMoveIds: ['move-a'],
      proposedMoveDelta: {
        currentMoveTitle: '让 champion 引荐 CFO',
        proposedNextMove: '先补一页风险责任边界，再请 champion 转发 CFO',
        successTest: '确认：CFO 是否把风险责任边界作为进入评审的前置条件？',
      },
      proposedVersion: {
        version: 3,
        triggerKind: 'decode_signal',
        diffSummary: '新信号「CFO 要求先看风险责任边界」影响「原路线假设 champion 可以直接推动 CFO 背书」，建议把当前步骤从「让 champion 引荐 CFO」校准为「先补一页风险责任边界，再请 champion 转发 CFO」。',
      },
    });
  });
});
