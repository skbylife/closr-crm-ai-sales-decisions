import { describe, expect, it } from 'vitest';
import {
  buildJudgmentFeedbackSourceRecord,
  buildRevisedJudgmentPreview,
  normalizeJudgmentFeedbackSourceRow,
  parseJudgmentFeedbackDraft,
  parseJudgmentFeedbackOnly,
  scopeNote,
} from './feedback';

const defaults = {
  id: 'fb_1',
  accountId: 'acc_1',
  orgId: 'org_1',
  createdBy: 'user_1',
  createdAt: '2026-04-30T12:00:00.000Z',
};

function parse(overrides: Record<string, unknown>) {
  return parseJudgmentFeedbackDraft({
    accountId: 'acc_1',
    targetType: 'judgment',
    targetId: 'judgment_1',
    kind: 'inaccurate',
    content: '采购负责人不是 CFO，而是 VP Operations。',
    previousSummary: '当前判断认为 CFO 是关键拍板人。',
    scope: 'account_only',
    ...overrides,
  }, defaults);
}

describe('judgment calibration feedback loop', () => {
  it('creates inaccurate feedback with deterministic revised preview', () => {
    const result = parse({ kind: 'inaccurate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.feedback.kind).toBe('inaccurate');
    expect(result.feedback.feedbackType).toBe('inaccurate');
    expect(result.feedback.scope).toBe('account_only');
    expect(result.feedback.accountId).toBe('acc_1');
    expect(result.revisedPreview.revisedSummary).toContain('人工纠正');
    expect(result.revisedPreview.replacedClaims).toContain('当前判断认为 CFO 是关键拍板人');
    expect(result.revisedPreview.confidenceDelta).toBeLessThan(0);
  });

  it('records accurate feedback as positive calibration', () => {
    const result = parse({
      kind: 'accurate',
      content: 'Champion 和采购负责人都确认了这个判断。',
      usefulness: 'useful',
      actionIntent: 'will_act',
      previousSummary: '当前判断认为 VP Operations 是关键拍板人。',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.revisedPreview.revisedSummary).toContain('准确');
    expect(result.revisedPreview.confidenceDelta).toBeGreaterThan(0);
    expect(result.revisedPreview.provisional).toBe(false);
    expect(result.feedback.usefulness).toBe('useful');
    expect(result.feedback.actionIntent).toBe('will_act');
  });

  it('keeps product validation signals in source record metadata', () => {
    const result = parse({
      kind: 'missing_evidence',
      content: '缺少客户原话，暂时不能执行。',
      usefulness: 'not_useful',
      actionIntent: 'needs_more_evidence',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = buildJudgmentFeedbackSourceRecord({ orgId: 'org_1', feedback: result.feedback, revisedPreview: result.revisedPreview });
    expect(row.metadata.feedback.usefulness).toBe('not_useful');
    expect(row.metadata.feedback.actionIntent).toBe('needs_more_evidence');
  });

  it('turns missing evidence into provisional verification evidence', () => {
    const preview = buildRevisedJudgmentPreview({
      kind: 'missing_evidence',
      targetType: 'open_question',
      previousSummary: '需要确认预算是否冻结。',
      content: '预算冻结没有来源，只是从回复变慢推出来的。',
    });

    expect(preview.revisedSummary).toContain('缺少关键证据');
    expect(preview.whyChanged).toContain('证据链不完整');
    expect(preview.provisional).toBe(true);
  });

  it('marks over-optimistic feedback as a calibration signal', () => {
    const preview = buildRevisedJudgmentPreview({
      kind: 'over_optimistic',
      targetType: 'account_momentum',
      previousSummary: '客户动量明显升温，赢面很高。',
      content: '客户只是礼貌回复，采购和法务都没有进场。',
    });

    expect(preview.revisedSummary).toContain('过度乐观');
    expect(preview.whyChanged).toContain('降低赢面');
    expect(preview.confidenceDelta).toBeLessThan(0);
  });

  it('marks missed risk feedback as a future risk check', () => {
    const preview = buildRevisedJudgmentPreview({
      kind: 'missed_risk',
      targetType: 'judgment',
      previousSummary: '当前判断认为机会可以推进。',
      content: '漏看了法务安全审查，这会拖慢 3 周。',
    });

    expect(preview.revisedSummary).toContain('漏看了关键风险');
    expect(preview.whyChanged).toContain('风险校准信号');
    expect(preview.provisional).toBe(true);
  });

  it('downgrades over-inferred judgment to a hypothesis', () => {
    const preview = buildRevisedJudgmentPreview({
      kind: 'over_inferred',
      targetType: 'account_momentum',
      previousSummary: '账户动量升温。',
      content: '只凭一次快速回复不能判断动量升温。',
    });

    expect(preview.revisedSummary).toContain('过度推断');
    expect(preview.whyChanged).toContain('超出了证据可支持范围');
    expect(preview.confidenceDelta).toBeLessThan(0);
  });

  it('marks stale judgment for evidence refresh', () => {
    const preview = buildRevisedJudgmentPreview({
      kind: 'stale',
      targetType: 'stakeholder',
      previousSummary: 'CFO 仍然阻塞审批。',
      content: 'CFO 上周已经离职，阻塞判断过期。',
    });

    expect(preview.revisedSummary).toContain('过期');
    expect(preview.whyChanged).toContain('重新拉取最新账户证据');
    expect(preview.confidenceDelta).toBeLessThan(0);
  });

  it('keeps candidate global rules scoped and non-polluting by default', () => {
    const result = parse({ scope: 'candidate_global_rule', content: '以后看到同类采购措辞时，要先检查法务审批链。' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.feedback.scope).toBe('candidate_global_rule');
    expect(scopeNote(result.feedback.scope)).toContain('不会自动影响其他客户或团队规则');
  });

  it('rejects dirty data, invalid feedback types, legacy kinds, and account mismatches', () => {
    expect(parse({ content: ' ' }).ok).toBe(false);
    expect(parse({ kind: 'random' }).ok).toBe(false);
    expect(parse({ kind: 'correction' }).ok).toBe(false);
    expect(parse({ accountId: 'other_acc' }).ok).toBe(false);
  });

  it('round-trips scoped feedback through source_records metadata', () => {
    const result = parse({
      kind: 'missing_evidence',
      targetType: 'open_question',
      targetId: 'oq_1',
      evidenceRefs: [{ sourceId: 'decode_1', sourceKind: 'email_decode', title: '邮件解读' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = buildJudgmentFeedbackSourceRecord({ orgId: 'org_1', feedback: result.feedback, revisedPreview: result.revisedPreview });
    expect(row.source_kind).toBe('human_feedback');
    expect(row.metadata.feedback.accountId).toBe('acc_1');
    expect(row.metadata.feedback.createdBy).toBe('user_1');
    expect(row.metadata.feedback.createdAt).toBe('2026-04-30T12:00:00.000Z');
    expect(row.metadata.feedback.feedbackType).toBe('missing_evidence');
    expect(row.metadata.feedback.content).toContain('采购负责人');
    expect(row.metadata.revisionStatus).toBe('ready');

    const normalized = normalizeJudgmentFeedbackSourceRow({
      id: 'sr_1',
      org_id: row.org_id,
      account_id: row.account_id,
      source_row_id: row.source_row_id,
      occurred_at: row.occurred_at,
      metadata: row.metadata,
    });

    expect(normalized?.feedback.targetType).toBe('open_question');
    expect(normalized?.feedback.evidenceRefs[0]?.sourceId).toBe('decode_1');
    expect(normalized?.revisionStatus).toBe('ready');
    expect(normalized?.revisedPreview?.revisedSummary).toBe(result.revisedPreview.revisedSummary);
  });

  it('drops persisted feedback whose metadata crosses account or org scope', () => {
    const result = parse({ kind: 'inaccurate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = buildJudgmentFeedbackSourceRecord({ orgId: 'org_1', feedback: result.feedback, revisedPreview: result.revisedPreview });

    expect(normalizeJudgmentFeedbackSourceRow({
      id: 'sr_cross_account',
      org_id: row.org_id,
      account_id: 'other_acc',
      source_row_id: row.source_row_id,
      occurred_at: row.occurred_at,
      metadata: row.metadata,
    })).toBeNull();

    expect(normalizeJudgmentFeedbackSourceRow({
      id: 'sr_cross_org',
      org_id: 'other_org',
      account_id: row.account_id,
      source_row_id: row.source_row_id,
      occurred_at: row.occurred_at,
      metadata: row.metadata,
    })).toBeNull();
  });

  it('can persist append-only raw feedback even when revised preview is failed', () => {
    const parsed = parseJudgmentFeedbackOnly({
      accountId: 'acc_1',
      targetType: 'judgment',
      targetId: 'judgment_1',
      kind: 'inaccurate',
      content: '原始用户反馈必须保留。',
      scope: 'account_only',
    }, defaults);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const row = buildJudgmentFeedbackSourceRecord({
      orgId: 'org_1',
      feedback: parsed.feedback,
      revisionStatus: 'failed',
      revisionError: 'preview failed',
      previousSummary: '旧判断',
    });

    expect(row.summary).toBe('原始用户反馈必须保留。');
    expect(row.metadata.revisedPreview).toBeUndefined();
    expect(row.metadata.revisionStatus).toBe('failed');
    expect(row.metadata.feedback.content).toBe('原始用户反馈必须保留。');

    const normalized = normalizeJudgmentFeedbackSourceRow({
      id: 'sr_failed',
      org_id: row.org_id,
      account_id: row.account_id,
      source_row_id: row.source_row_id,
      occurred_at: row.occurred_at,
      metadata: row.metadata,
    });
    expect(normalized?.revisionStatus).toBe('failed');
    expect(normalized?.revisionError).toBe('preview failed');
    expect(normalized?.revisedPreview).toBeUndefined();
    expect(normalized?.feedback.createdBy).toBe('user_1');
  });
});
