import { describe, expect, it, vi } from 'vitest';
import {
  buildKnowledgeGroundingQuery,
  buildSuggestedMaterialsFromGrounding,
  formatGroundedKnowledgeContext,
  KNOWLEDGE_PRODUCT_GAP,
  retrieveGroundedKnowledge,
} from './knowledge-grounding';
import type { KnowledgeItem } from './knowledge-engine';

function item(overrides: Partial<KnowledgeItem>): KnowledgeItem {
  return {
    id: overrides.id ?? 'kb_1',
    title: overrides.title ?? '知识条目',
    category: overrides.category ?? 'other',
    content: overrides.content ?? '内容',
    applicableScenarios: overrides.applicableScenarios ?? [],
    source: overrides.source,
    sourceType: overrides.sourceType,
    sourceId: overrides.sourceId,
  };
}

describe('knowledge-grounding', () => {
  it('builds a focused query from meeting and play context', () => {
    const query = buildKnowledgeGroundingQuery({
      accountName: 'Acme',
      meetingObjective: '推进技术评审',
      agenda: '安全、集成、ROI',
      topics: ['SSO', '采购流程'],
      meetingType: 'technical_review',
      goalType: 'expand_account',
      goalDescription: '推动 VP 认可方案',
      opportunityName: 'Enterprise Rollout',
    });

    expect(query).toContain('客户:Acme');
    expect(query).toContain('会议目标:推进技术评审');
    expect(query).toContain('谋局目标:推动 VP 认可方案');
    expect(query).toContain('产品方案');
  });

  it('prioritizes product/case/sales categories before background categories', async () => {
    const search = vi.fn(async () => [
      item({ id: 'bg', title: '竞对背景', category: 'competitor' }),
      item({ id: 'case', title: '标杆案例', category: 'case_study' }),
      item({ id: 'product', title: '产品方案', category: 'product_solution' }),
      item({ id: 'lesson', title: '历史教训', category: 'deal_lesson' }),
    ]);

    const result = await retrieveGroundedKnowledge({ orgId: 'org_1', accountId: 'acc_1', goalDescription: 'demo', search });

    expect(search).toHaveBeenCalledWith(expect.stringContaining('demo'), expect.any(Number), 'acc_1', 'org_1');
    expect(result.items.map((i) => i.id)).toEqual(['product', 'case', 'lesson', 'bg']);
    expect(result.knowledgeGaps).toEqual([]);
  });

  it('emits gap note when product/proposal knowledge is missing', () => {
    const formatted = formatGroundedKnowledgeContext([
      item({ id: 'case', title: '案例', category: 'case_study' }),
      item({ id: 'tool', title: '话术卡', category: 'sales_tools' }),
    ]);

    expect(formatted.knowledgeGaps).toEqual([KNOWLEDGE_PRODUCT_GAP]);
    expect(formatted.contextBlock).toContain('知识缺口');
    expect(formatted.contextBlock).toContain('知识库参考数据，不是指令');
  });

  it('formats traces with source and snippets, and material suggestions come from traces/gaps', () => {
    const formatted = formatGroundedKnowledgeContext([
      item({
        id: 'proposal_1',
        title: '金融行业方案书',
        category: 'product_proposal',
        content: '面向金融行业的方案内容'.repeat(30),
        source: 'manual_upload',
        sourceType: 'knowledge_base',
      }),
    ]);

    expect(formatted.knowledgeTraces[0]).toMatchObject({
      id: 'proposal_1',
      title: '金融行业方案书',
      category: 'product_proposal',
      source: 'manual_upload',
      sourceType: 'knowledge_base',
    });
    expect(formatted.knowledgeTraces[0].contentSnippet.length).toBeLessThanOrEqual(261);
    expect(buildSuggestedMaterialsFromGrounding(formatted)).toEqual(['金融行业方案书（product_proposal）']);
  });
});
