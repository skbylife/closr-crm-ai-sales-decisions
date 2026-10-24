import { describe, expect, it } from 'vitest';
import {
  buildJudgmentMemoryEvidenceRecord,
  buildJudgmentMemoryFromDecode,
  buildJudgmentMemoryFromRfpAnalysis,
  buildJudgmentMemoryFromStrategicPlay,
  buildJudgmentMemoryRevisionItem,
  buildJudgmentMemorySourceRecord,
} from '@/lib/judgment/memory';
import { buildJudgmentMemorySourceHref, mergeJudgmentMemorySourcesPreferPersisted, normalizeJudgmentMemorySourceRow, type JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { DecodeOutput, RfpJudgment, RfpRow, StrategicPlay } from '@/lib/babel-engine/types';

describe('judgment memory adapters', () => {
  it('converts RFP analysis into a traceable judgment memory input', () => {
    const rfp = {
      id: 'rfp_1',
      account_id: 'acc_1',
      title: '华东平台续约 RFP',
      due_date: '2026-05-10',
    } as Pick<RfpRow, 'id' | 'account_id' | 'title' | 'due_date'>;
    const judgment: RfpJudgment = {
      decision: 'cautious_bid',
      confidence: 72,
      rationale: '需求匹配，但采购压价和竞对报价仍未透明。',
      uncertainty: '还缺竞对最终报价和 CFO 评分权重。',
      keyRisks: ['采购可能用竞对低价压缩范围'],
      tensions: ['技术优势明确，但商务条件承压'],
      contradictions: [],
      evidenceSignals: [{ label: '技术匹配', source: 'rfp', valence: 'positive', evidence: 'RFP要求与现有方案匹配' }],
      narrativeChange: '叙事应从功能响应转为风险可控和 ROI 证明。',
    };

    const input = buildJudgmentMemoryFromRfpAnalysis({
      rfp,
      analysis: { id: 'analysis_1', created_at: '2026-04-29T20:00:00.000Z' },
      judgment,
      recommendations: ['先准备 CFO 可读的一页 ROI 和压价边界。'],
      weaknesses: ['商务条款承压'],
      winProbability: 58,
    });

    expect(input).toMatchObject({
      sourceKind: 'rfp_analysis',
      sourceId: 'analysis_1',
      accountId: 'acc_1',
      risk: '采购可能用竞对低价压缩范围',
      nextAction: '先准备 CFO 可读的一页 ROI 和压价边界',
      confidence: 0.72,
      uncertainty: '还缺竞对最终报价和 CFO 评分权重。',
      provisional: true,
    });
    expect(input.currentJudgment).toContain('建议谨慎投标');
    expect(input.evidenceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceTable: 'rfp_ai_analyses', sourceRowId: 'analysis_1' }),
      expect.objectContaining({ sourceTable: 'rfps', sourceRowId: 'rfp_1' }),
    ]));
  });

  it('converts judgment memory into an account evidence record shape', () => {
    const input = buildJudgmentMemoryFromRfpAnalysis({
      rfp: { id: 'rfp_1', account_id: 'acc_1', title: 'RFP', due_date: null } as Pick<RfpRow, 'id' | 'account_id' | 'title' | 'due_date'>,
      analysis: { id: 'analysis_1', created_at: '2026-04-29T20:00:00.000Z' },
      judgment: {
        decision: 'need_more_intel',
        confidence: 40,
        rationale: '证据不足。',
        uncertainty: '缺少评分规则。',
        keyRisks: ['评分规则不透明'],
        tensions: [],
        contradictions: [],
        evidenceSignals: [],
      },
      recommendations: [],
      weaknesses: [],
    });

    const record = buildJudgmentMemoryEvidenceRecord(input);

    expect(record).toMatchObject({
      sourceId: 'analysis_1',
      sourceKind: 'source_record',
      sourceTable: 'rfp_ai_analyses',
      sourceRowId: 'analysis_1',
      signal: 'risk',
    });
    expect(record.summary).toContain('当前判断：');
    expect(record.summary).toContain('最大风险：评分规则不透明');
  });

  it('builds decode judgment memory from a saved decode result', () => {
    const decode: DecodeOutput = {
      messages: [{
        speaker: 'them',
        original: '可以推进，但 CFO 要看 ROI。',
        decode: { meaning: '客户愿意推进，但 CFO 是下一关。', emotion: '谨慎积极', urgency: 8, confidence: 0.86 },
      }],
      threadAnalysis: {
        sentimentTrend: 'warming',
        riskLevel: 'medium',
        buyerState: 'evaluating',
        keySignal: '客户愿意推进，但 CFO 需要 ROI 证据。',
      },
      actionItems: [{ title: '48小时内发送 CFO 版 ROI 摘要', priority: 'high', dueInDays: 2, reasoning: '回应下一关口' }],
    };

    const input = buildJudgmentMemoryFromDecode({
      savedDecode: {
        id: 'decode_1',
        accountId: 'acc_1',
        accountName: '测试客户',
        clientName: '李总',
        date: '2026-04-29T20:00:00.000Z',
        decode,
      },
    });

    expect(input).toMatchObject({
      sourceKind: 'decode',
      sourceId: 'decode_1',
      accountId: 'acc_1',
      currentJudgment: '客户愿意推进，但 CFO 需要 ROI 证据',
      nextAction: '48小时内发送 CFO 版 ROI 摘要',
      confidence: 0.86,
      provisional: true,
    });
    expect(input?.evidenceRefs[0]).toMatchObject({
      sourceKind: 'email_decode',
      sourceTable: 'email_decodes',
      sourceRowId: 'decode_1',
    });
  });

  it('builds strategic play judgment memory and source_record metadata', () => {
    const play: Pick<StrategicPlay, 'id' | 'accountId' | 'goalDescription' | 'steps' | 'confidence' | 'assumptions' | 'updatedAt' | 'createdAt'> = {
      id: 'play_1',
      accountId: 'acc_1',
      goalDescription: '先验证 CFO 是否愿意用 ROI 作为下一轮推进标准。',
      confidence: 0.74,
      createdAt: '2026-04-29T20:00:00.000Z',
      updatedAt: '2026-04-29T22:00:00.000Z',
      steps: [{
        index: 1,
        title: '发出 CFO 版 ROI 摘要',
        description: '用一页纸确认 CFO 的决策口径。',
        who: '销售负责人',
        target: 'CFO',
        action: '发送 ROI 摘要并约 15 分钟反馈电话',
        timing: '48小时内',
        purpose: '验证预算与评价标准',
        risk: 'CFO 不回复或转给采购压价',
        fallback: '请业务 sponsor 转发并补充内部场景',
        status: 'pending',
      }],
      assumptions: [
        { id: 'asm_1', text: 'CFO 愿意用 ROI 而不是最低价做判断。', status: 'pending', createdAt: '2026-04-29T20:00:00.000Z' },
        { id: 'asm_2', text: '采购已经锁定竞对低价方案。', status: 'invalidated', createdAt: '2026-04-29T20:00:00.000Z' },
      ],
    };

    const judgmentMemory = buildJudgmentMemoryFromStrategicPlay(play);

    expect(judgmentMemory).toMatchObject({
      sourceKind: 'strategic_play',
      sourceId: 'play_1',
      accountId: 'acc_1',
      risk: '采购已经锁定竞对低价方案',
      nextAction: '发出 CFO 版 ROI 摘要',
      confidence: 0.74,
      uncertainty: '仍有 1 个假设待验证。',
      provisional: true,
      createdAt: '2026-04-29T22:00:00.000Z',
    });
    expect(judgmentMemory.currentJudgment).toContain('先验证 CFO');
    expect(judgmentMemory.evidenceRefs).toEqual([
      { sourceId: 'play_1', sourceKind: 'strategic_play', title: play.goalDescription, sourceTable: 'strategic_plays', sourceRowId: 'play_1' },
    ]);

    const row = buildJudgmentMemorySourceRecord({
      orgId: 'org_1',
      judgmentMemory,
      sourceTable: 'strategic_plays',
      extraMetadata: { opportunityId: 'opp_1', targetContactId: 'contact_1' },
    });

    expect(row).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'strategic_play',
      source_table: 'strategic_plays',
      source_row_id: 'play_1',
      occurred_at: '2026-04-29T22:00:00.000Z',
    });
    expect(row.summary).toContain('当前判断：先验证 CFO');
    expect(row.metadata).toMatchObject({
      sourceKind: 'strategic_play',
      opportunityId: 'opp_1',
      targetContactId: 'contact_1',
      evidenceRefs: [{ sourceId: 'play_1', sourceKind: 'strategic_play', title: play.goalDescription, sourceTable: 'strategic_plays', sourceRowId: 'play_1' }],
      judgmentMemory: { sourceKind: 'strategic_play', sourceId: 'play_1' },
    });
  });

  it('builds a decode source_record row with judgment metadata', () => {
    const decode: DecodeOutput = {
      messages: [{
        speaker: 'them',
        original: '预算可以，但法务还没看合同。',
        decode: { meaning: '客户有预算意愿，但法务可能成为阻碍。', emotion: '谨慎', urgency: 6, confidence: 0.78 },
      }],
      threadAnalysis: {
        sentimentTrend: 'stable',
        riskLevel: 'medium',
        buyerState: 'evaluating',
        keySignal: '预算口径正面，但合同法务风险未解除。',
      },
      actionItems: [{ title: '补一版法务风险清单', priority: 'medium', dueInDays: 3, reasoning: '降低合同阻碍' }],
    };
    const judgmentMemory = buildJudgmentMemoryFromDecode({
      savedDecode: {
        id: 'decode_2',
        accountId: 'acc_1',
        accountName: '测试客户',
        clientName: '王总',
        date: '2026-04-29T21:00:00.000Z',
        decode,
      },
    });

    expect(judgmentMemory).not.toBeNull();

    const row = buildJudgmentMemorySourceRecord({
      orgId: 'org_1',
      judgmentMemory: judgmentMemory!,
      sourceTable: 'email_decodes',
      extraMetadata: { matchedContactId: 'contact_1' },
    });

    expect(row).toMatchObject({
      org_id: 'org_1',
      account_id: 'acc_1',
      source_kind: 'email_decode',
      source_table: 'email_decodes',
      source_row_id: 'decode_2',
      occurred_at: '2026-04-29T21:00:00.000Z',
    });
    expect(row.summary).toContain('当前判断：预算口径正面');
    expect(row.metadata).toMatchObject({
      sourceKind: 'decode',
      matchedContactId: 'contact_1',
      evidenceRefs: [{ sourceId: 'decode_2', sourceKind: 'email_decode', title: '测试客户', sourceTable: 'email_decodes', sourceRowId: 'decode_2' }],
    });
    expect(row.metadata.judgmentMemory).toMatchObject({ sourceKind: 'decode', sourceId: 'decode_2' });
  });

  it('explains why a judgment changed for revision history', () => {
    const previous = buildJudgmentMemoryFromRfpAnalysis({
      rfp: { id: 'rfp_1', account_id: 'acc_1', title: 'RFP', due_date: null } as Pick<RfpRow, 'id' | 'account_id' | 'title' | 'due_date'>,
      analysis: { id: 'analysis_old', created_at: '2026-04-28T20:00:00.000Z' },
      judgment: {
        decision: 'need_more_intel',
        confidence: 42,
        rationale: '评分标准不清楚。',
        uncertainty: '缺少采购评分表。',
        keyRisks: ['缺少评分标准'],
        tensions: [],
        contradictions: [],
        evidenceSignals: [],
      },
    });
    const current = buildJudgmentMemoryFromRfpAnalysis({
      rfp: { id: 'rfp_1', account_id: 'acc_1', title: 'RFP', due_date: null } as Pick<RfpRow, 'id' | 'account_id' | 'title' | 'due_date'>,
      analysis: { id: 'analysis_new', created_at: '2026-04-29T20:00:00.000Z' },
      judgment: {
        decision: 'bid',
        confidence: 81,
        rationale: '已拿到评分表且我方匹配度高。',
        uncertainty: '仍需确认竞对报价。',
        keyRisks: ['竞对可能低价'],
        tensions: [],
        contradictions: [],
        evidenceSignals: [],
      },
    });

    const revision = buildJudgmentMemoryRevisionItem({ previous, current });

    expect(revision.whyChanged).toContain('当前判断由');
    expect(revision.whyChanged).toContain('最大风险由');
    expect(revision.whyChanged).toContain('置信度由 42% 变为 81%');
    expect(revision.evidenceRefs?.[0]?.sourceRowId).toBe('analysis_new');
  });
});

describe('judgment memory source rows', () => {
  it('normalizes source_records metadata into account UI source items', () => {
    const item = normalizeJudgmentMemorySourceRow({
      id: 'source_record_1',
      source_table: 'rfp_ai_analyses',
      source_row_id: 'analysis_1',
      title: 'RFP判断 · 华东平台',
      occurred_at: '2026-04-29T20:00:00.000Z',
      created_at: '2026-04-29T20:01:00.000Z',
      metadata: {
        judgmentMemory: {
          sourceKind: 'rfp_analysis',
          sourceId: 'analysis_1',
          title: 'RFP判断 · 华东平台',
          currentJudgment: '建议谨慎投标：技术匹配但商务承压。',
          risk: '采购可能用竞对低价压缩范围',
          nextAction: '先准备 CFO 可读的一页 ROI。',
          confidence: 72,
          uncertainty: '还缺竞对最终报价。',
          provisional: true,
          createdAt: '2026-04-29T20:00:00.000Z',
          evidenceRefs: [{ sourceId: 'analysis_1', sourceKind: 'source_record', title: 'RFP分析', sourceRowId: 'analysis_1' }],
        },
      },
    });

    expect(item).toMatchObject({
      sourceRecordId: 'source_record_1',
      sourceKind: 'rfp_analysis',
      sourceId: 'analysis_1',
      currentJudgment: '建议谨慎投标：技术匹配但商务承压。',
      risk: '采购可能用竞对低价压缩范围',
      nextAction: '先准备 CFO 可读的一页 ROI。',
      confidence: 0.72,
      provisional: true,
      updatedAt: '2026-04-29T20:00:00.000Z',
      traceStatus: 'persisted',
      traceNote: '该判断记忆来自已持久化的 source_records。',
    });
    expect(item?.evidenceRefs[0]).toMatchObject({ sourceKind: 'source_record', sourceRowId: 'analysis_1' });
    expect(item ? buildJudgmentMemorySourceHref(item, 'acc_1') : null).toBe('/accounts/acc_1?tab=knowledge&targetKind=source_record&targetId=source_record_1');
  });

  it('prefers persisted judgment memory over derived fallback with the same source id', () => {
    const derived: JudgmentMemorySourceItem = {
      id: 'decode:decode_1',
      sourceRecordId: 'derived:decode:decode_1',
      sourceKind: 'decode',
      sourceId: 'decode_1',
      sourceTable: 'email_decodes',
      sourceRowId: 'decode_1',
      title: 'Derived Decode',
      currentJudgment: 'derived 判断',
      risk: 'derived 风险',
      nextAction: 'derived 下一步',
      confidence: 0.5,
      provisional: true,
      evidenceRefs: [],
      updatedAt: '2026-04-30T20:00:00.000Z',
      traceStatus: 'derived',
    };
    const persisted: JudgmentMemorySourceItem = {
      ...derived,
      sourceRecordId: 'source_record_1',
      title: 'Persisted Decode',
      currentJudgment: 'persisted 判断',
      updatedAt: '2026-04-29T20:00:00.000Z',
      traceStatus: 'persisted',
    };
    const otherDerived: JudgmentMemorySourceItem = {
      ...derived,
      id: 'strategic_play:play_1',
      sourceRecordId: 'derived:strategic_play:play_1',
      sourceKind: 'strategic_play',
      sourceId: 'play_1',
      title: 'Derived Play',
      updatedAt: '2026-04-30T21:00:00.000Z',
    };

    const merged = mergeJudgmentMemorySourcesPreferPersisted({ persisted: [persisted], derived: [derived, otherDerived] });

    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.id === 'decode:decode_1')).toMatchObject({
      sourceRecordId: 'source_record_1',
      currentJudgment: 'persisted 判断',
      traceStatus: 'persisted',
    });
    expect(merged.find((item) => item.id === 'strategic_play:play_1')).toMatchObject({ traceStatus: 'derived' });
  });

  it('ignores source records that do not contain complete judgment memory', () => {
    expect(normalizeJudgmentMemorySourceRow({
      id: 'source_record_2',
      title: '普通来源记录',
      metadata: { sourceKind: 'decode' },
    })).toBeNull();
  });
});
