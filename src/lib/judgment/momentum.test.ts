import { describe, expect, it } from 'vitest';
import type { AccountMemorySummary, AccountTimelineItem } from '@/lib/babel-engine/types';
import { buildAccountMomentumSnapshot, type AccountMomentumMemoryInput } from './momentum';

const NOW = '2026-04-30T20:00:00.000Z';

function summary(overrides: Partial<AccountMemorySummary> = {}): AccountMemorySummary {
  return {
    accountId: 'acc_1',
    narrativeSummary: '账户有若干推进信号。',
    momentum: { status: 'steady', label: '平稳', reasoning: '当前信号中性。' },
    people: [],
    tensions: [],
    timelineHighlights: [],
    lastComputedAt: NOW,
    confidence: 0.6,
    sourceCoverage: { kinds: [], totalRecords: 0, freshRecords: 0 },
    ...overrides,
  };
}

function memory(overrides: Partial<AccountMomentumMemoryInput> = {}): AccountMomentumMemoryInput {
  return {
    sourceKind: 'decode',
    sourceId: 'decode_1',
    title: 'Decode · CFO',
    currentJudgment: '客户愿意推进 CFO 评审，并确认下一步 Demo。',
    risk: '仍需确认 ROI 证据是否足够。',
    nextAction: '48小时内发送 CFO 版 ROI 摘要。',
    confidence: 0.72,
    uncertainty: '仍需验证 CFO 是否认可 ROI。',
    provisional: true,
    evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 邮件' }],
    updatedAt: NOW,
    ...overrides,
  };
}

function activity(overrides: Partial<AccountTimelineItem> = {}): AccountTimelineItem {
  return {
    id: 'act_1',
    accountId: 'acc_1',
    sourceId: 'act_1',
    sourceKind: 'activity_log',
    title: '客户确认下一步评审',
    summary: 'Sponsor 回复并承诺推进 Demo。',
    occurredAt: NOW,
    signal: 'positive',
    ...overrides,
  };
}

describe('buildAccountMomentumSnapshot', () => {
  it('detects heating from positive account momentum and recent activity', () => {
    const snapshot = buildAccountMomentumSnapshot({
      accountId: 'acc_1',
      summary: summary({ momentum: { status: 'rising', label: '动量上升', reasoning: 'CFO 评审被推进。' } }),
      judgmentMemories: [memory({ uncertainty: '', risk: '暂无高强度风险。', provisional: false })],
      recentActivities: [activity()],
      updatedAt: NOW,
    });

    expect(snapshot.status).toBe('heating');
    expect(snapshot.currentJudgment).toContain('客户愿意推进');
    expect(snapshot.nextAction).toContain('发送 CFO');
    expect(snapshot.evidenceRefs[0]).toMatchObject({ sourceId: 'decode_1', sourceKind: 'email_decode' });
    expect(snapshot.confidence).toBeGreaterThan(0.6);
  });

  it('detects cooling without forcing it into risk rising', () => {
    const snapshot = buildAccountMomentumSnapshot({
      summary: summary({ momentum: { status: 'slowing', label: '互动降温', reasoning: '回复频率下降。' } }),
      judgmentMemories: [memory({ currentJudgment: '客户回复频率下降，下一步评审延后。', risk: '推进节奏转弱。', uncertainty: '', nextAction: '用低摩擦触达确认是否仍愿意推进。' })],
      updatedAt: NOW,
    });

    expect(snapshot.status).toBe('cooling');
    expect(snapshot.currentJudgment).toContain('下降');
  });

  it('detects stalled and treats pending/stalled as tension, not contradiction', () => {
    const snapshot = buildAccountMomentumSnapshot({
      summary: summary({ momentum: { status: 'stalled', label: '推进停滞', reasoning: '关键假设待验证。' } }),
      judgmentMemories: [memory({
        currentJudgment: '账户推进停滞，关键假设 pending。',
        risk: 'Sponsor 未回复，CFO 假设待验证。',
        uncertainty: '仍有 2 个假设待验证。',
        nextAction: '补一轮验证动作，确认卡点。',
      })],
      updatedAt: NOW,
    });

    expect(snapshot.status).toBe('stalled');
    expect(`${snapshot.whyChanged} ${snapshot.biggestTension}`).not.toMatch(/contradiction|矛盾/);
    expect(snapshot.provisional).toBe(true);
  });

  it('detects risk_rising from risk-heavy memories and timeline', () => {
    const snapshot = buildAccountMomentumSnapshot({
      summary: summary({ momentum: { status: 'at_risk', label: '风险上升', reasoning: '采购压价和竞对进入。' } }),
      judgmentMemories: [memory({ currentJudgment: '采购开始压价，竞对进入。', risk: '预算冻结风险上升。', nextAction: '逐个确认关键顾虑。' })],
      recentActivities: [activity({ id: 'risk_1', sourceId: 'risk_1', title: '采购冻结预算', summary: '采购表示预算可能冻结。', signal: 'risk' })],
      updatedAt: NOW,
    });

    expect(snapshot.status).toBe('risk_rising');
    expect(snapshot.biggestTension).toContain('预算');
  });

  it('detects mixed when positive momentum and risk/tension coexist', () => {
    const snapshot = buildAccountMomentumSnapshot({
      summary: summary({
        momentum: { status: 'rising', label: '动量上升', reasoning: '业务方愿意推进。' },
        tensions: ['业务 sponsor 支持，但采购预算和竞对风险仍未确认。'],
      }),
      judgmentMemories: [
        memory({ currentJudgment: 'Sponsor 愿意推进 Demo。', risk: '采购预算不确定。', uncertainty: '仍需确认采购是否支持。' }),
        memory({ sourceId: 'rfp_1', sourceKind: 'rfp_analysis', currentJudgment: 'RFP 技术匹配。', risk: '竞对报价未透明。', nextAction: '补竞对报价信息。' }),
      ],
      recentActivities: [activity(), activity({ id: 'risk_2', sourceId: 'risk_2', title: '采购压价', summary: '采购表达压价顾虑。', signal: 'risk' })],
      updatedAt: NOW,
    });

    expect(snapshot.status).toBe('mixed');
    expect(snapshot.biggestTension).toContain('采购预算');
    expect(snapshot.provisional).toBe(true);
  });

  it('returns unknown on empty input', () => {
    const snapshot = buildAccountMomentumSnapshot({ updatedAt: NOW });

    expect(snapshot.status).toBe('unknown');
    expect(snapshot.confidence).toBeLessThan(0.5);
    expect(snapshot.evidenceRefs).toEqual([]);
    expect(snapshot.provisional).toBe(true);
  });

  it('survives dirty data and still emits a stable fallback snapshot', () => {
    const snapshot = buildAccountMomentumSnapshot({
      summary: null,
      judgmentMemories: [
        { sourceKind: 'decode', sourceId: 123, confidence: Number.NaN, evidenceRefs: [{ sourceId: '', sourceKind: 'bad' }] },
        { sourceKind: 'strategic_play', sourceId: 'play_1', currentJudgment: null, risk: 'pending 假设待验证', nextAction: '继续验证', updatedAt: 'bad-date' },
      ],
      recentActivities: [{ id: 'dirty', sourceKind: 'bad-kind', title: null, summary: '客户无回应', signal: 'risk' }],
      updatedAt: NOW,
    });

    expect(['stalled', 'risk_rising', 'mixed']).toContain(snapshot.status);
    expect(snapshot.currentJudgment).toBeTruthy();
    expect(snapshot.updatedAt).toBe(NOW);
  });

  it('deduplicates evidenceRefs and keeps whyChanged/provisional fields', () => {
    const snapshot = buildAccountMomentumSnapshot({
      summary: summary({ momentum: { status: 'rising', label: '动量上升', reasoning: '新证据增强。' } }),
      momentumShift: {
        id: 'shift_1',
        accountId: 'acc_1',
        previous: 'stalled',
        previousLabel: '停滞',
        previousSummary: '客户未回复。',
        current: 'rising',
        currentLabel: '上升',
        currentSummary: 'CFO 回复。',
        changed: true,
        summary: '动量由停滞转为上升。',
        whyChanged: 'CFO 回复并确认 ROI 评审。',
        evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 邮件' }],
        occurredAt: NOW,
      },
      judgmentMemories: [memory({ evidenceRefs: [
        { sourceId: 'decode_1', sourceKind: 'email_decode', title: 'CFO 邮件' },
        { sourceId: 'decode_1', sourceKind: 'email_decode', title: '重复证据' },
      ] })],
      updatedAt: NOW,
    });

    expect(snapshot.whyChanged).toContain('CFO 回复');
    expect(snapshot.provisional).toBe(true);
    expect(snapshot.evidenceRefs.filter((ref) => ref.sourceId === 'decode_1')).toHaveLength(1);
  });
});
