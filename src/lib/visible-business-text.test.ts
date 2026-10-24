import { describe, expect, it } from 'vitest';
import { VISIBLE_BUSINESS_TEXT_FORBIDDEN_TERMS, visibleBusinessText } from './visible-business-text';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('visibleBusinessText', () => {
  it('localizes the account page AI narrative main path', () => {
    const result = visibleBusinessText(
      'Judgment Core says forecast risk is rising across the portfolio: this pattern depends on Champion access, Economic buyer validation, and MEDDICC confidence.',
    );

    expect(result).toBe(
      '判断核心 says 预测判断 risk is rising across the 客户组合: this 模式 depends on 内部推动者 access, 经济决策人 validation, 和资格评分置信度.',
    );
    expect(result).not.toMatch(/Judgment Core|forecast|portfolio|pattern|Champion|Economic buyer|MEDDICC|confidence/i);
  });

  it('covers open questions and right-sidebar action/detail copy', () => {
    const result = visibleBusinessText(
      'Open questions: Manager asks AE to run deal review, confirm source trace with Coach, and close the learning loop before next forecasting call.',
    );

    expect(result).toContain('待验证问题');
    expect(result).toContain('经理 asks 销售');
    expect(result).toContain('机会复盘');
    expect(result).toContain('来源追踪');
    expect(result).toContain('内部教练');
    expect(result).toContain('学习闭环');
    expect(result).toContain('预测判断 call');
    expect(result).not.toMatch(/open questions|Manager|AE|deal review|source trace|Coach|learning loop|forecasting/i);
  });

  it('does not replace terminology inside larger English words', () => {
    const input = 'ideal customer profile / MVP story / homeowner sponsor / overforecast risk / antipattern review';

    expect(visibleBusinessText(input)).toBe(
      'ideal customer profile / MVP story / homeowner 高层负责人 / overforecast risk / antipattern review',
    );
  });

  it('maps technical strategic-play labels to Chinese business copy', () => {
    expect(visibleBusinessText('RFP analysis: win_probability 0.64, cautious_bid, POC MTTR and ROI fit')).toBe(
      '采购需求分析: 赢单概率 0.64, 谨慎投标, 试点验证平均修复时间和 投资回报匹配度',
    );
  });

  it('preserves accepted B2B terms in English mode', () => {
    const result = visibleBusinessText(
      'Champion access, ROI, RFP analysis, Pipeline risk, POC MTTR, Forecast confidence, and MEDDICC fit.',
      'en',
    );

    expect(result).toBe(
      'Champion access, ROI, RFP analysis, Pipeline risk, POC MTTR, Forecast confidence, and MEDDICC fit.',
    );
    expect(result).not.toMatch(/内部推动者|投资回报|采购需求|商机管线|试点验证|平均修复时间|预测判断|资格评分|匹配度/);
  });

  it('cleans internal enum leaks in English mode without translating business terms to Chinese', () => {
    expect(visibleBusinessText('win_probability 0.64, cautious_bid, source_records ready', 'en')).toBe(
      'win probability 0.64, cautious bid, source records ready',
    );
    expect(visibleBusinessText('Pipeline 总额 / Champion 缺失 / 运行时推导', 'en')).toBe(
      'Pipeline total / Missing champion / Runtime inference',
    );
  });

  it('cleans mixed Chinese-English strategic play attribution fallback in English mode', () => {
    const result = visibleBusinessText(
      '保守归因：局势判断是基于账户证据、知识线索and风险反证形成的综合推断。',
      'en',
    );

    expect(result).toBe('Conservative attribution: the situation judgment is a synthesis of account evidence, knowledge signals, and counter-evidence.');
    expect(result).not.toMatch(/[一-鿿]/);
  });

  it('cleans persisted Chinese business terms from English mode play copy', () => {
    const result = visibleBusinessText(
      'Win 技术负责人 approval for the 智能运维 renewal expansion path / 支持当前判断 / 客户沟通信号 / 关键假设 / 下一步打法 / 服务水平 / 投资回报 / 高管 / 解读信号 / 步骤？',
      'en',
    );

    expect(result).toBe(
      'Win CTO approval for the AIOps renewal expansion path / Supports current judgment / Decoded interaction / Key assumption / Next move / SLA / ROI / executive / decoded signal / step？',
    );
    expect(result).not.toMatch(/[一-鿿]/);
  });

  it('repairs cramped English play signal text fragments', () => {
    const result = visibleBusinessText(
      'Review customer evidenceReview customer evidence / Review customer evidenceKey assumption / Next move: Draft one-page ROIexecutive summary',
      'en',
    );

    expect(result).toBe('Review customer evidence. Review customer evidence / Review customer evidence. Key assumption / Next move: Draft one-page ROI executive summary');
  });

  it('cleans persisted Chinese terms in English mode play step details', () => {
    const result = visibleBusinessText(
      'Use Emily Carter to map the technical review 议程 / Evidence basis: 时机： Week 1 / 若失败，优先复核: Emily may not know 技术负责人-level 议程 details / requires a technical white paper to secure an 议程名额.',
      'en',
    );

    expect(result).toBe(
      'Use Emily Carter to map the technical review agenda / Evidence basis: Timing： Week 1 / If this fails, review first: Emily may not know CTO-level agenda details / requires a technical white paper to secure an agenda slot.',
    );
    expect(result).not.toMatch(/[一-鿿]/);
  });

  it('cleans persisted Chinese account overview risk and next-move copy in English mode', () => {
    const input = [
      'Play假设未经验证',
      '两个核心扩展路径（AIOps 续约扩容、自动化测试延伸至性能测试）均依赖未经客户确认的假设，若 Emily Carter 或 Oliver Grant 无法提供真实痛点数据，方案将脱离实际需求',
      '决策链参与不完整',
      '采购方（Olivia Bennett、Sarah Coleman）and技术评审（Mark Jensen）仅出现在邮件收件列表中，未见其表达立场或提出要求，存在流程性沉默风险',
      '与 Emily Carter 共同制定技术评审agenda并锁定会议时间',
      'Emily 是连接架构层与销售的关键桥梁，必须通过她将 AIOps 扩展议题转化为可评估的技术讨论',
    ].join(' / ');

    const result = visibleBusinessText(input, 'en');

    expect(result).toContain('Play assumptions are not validated');
    expect(result).toContain('Decision chain participation is incomplete');
    expect(result).toContain('technical review agenda with Emily Carter');
    expect(result).not.toMatch(/[一-鿿]/);
  });

  it('does not turn English demo seed overview copy into punctuation fragments', () => {
    const result = visibleBusinessText(
      'Play假设not validated / Play (、 AIOps ) and， Emily Carter CTO agenda, / VP、 Procurement、 CTO Role, all‘’，、 POC / Emily Carter technical reviewagenda CTO',
      'en',
    );

    expect(result).toContain('Play assumptions are not validated');
    expect(result).toContain('Both AIOps renewal expansion');
    expect(result).toContain('VP, procurement, and CTO roles');
    expect(result).toContain('technical review agenda');
    expect(result).not.toMatch(/[一-鿿、，‘’]/);
    expect(result).not.toMatch(/reviewagenda|Play \(/);
  });

  it('cleans persisted play attribution fallback with mixed Play wording in English mode', () => {
    const result = visibleBusinessText('该Play暂无持久化证据归因说明。', 'en');

    expect(result).toBe('This play does not yet have a persisted evidence-attribution note.');
    expect(result).not.toMatch(/[一-鿿]/);
  });

  it('locks the full blocker terminology list against regressions', () => {
    const requiredTerms = [
      'Judgment Core',
      'source trace',
      'learning loop',
      'open questions',
      'open question',
      'win probability',
      'win_probability',
      'cautious_bid',
      'forecasting',
      'forecast',
      'portfolio',
      'pattern',
      'patterns',
      'Economic buyer',
      'Champion',
      'Coach',
      'Manager',
      'Executive',
      'AE',
      'AEs',
      'MEDDPICC',
      'MEDDICC',
      'source_records',
      'source_record',
      'source record',
      'confidence',
      'provisional',
      'revision',
      'sponsor',
      'owner',
      'deal review',
      'deal',
      'Horizon',
      'TCS',
      'CTO',
      'CIO',
      'CISO',
      'CFO',
      'CEO',
      'VP',
      'ROI',
      'AIOps',
      'OSS/BSS',
      'POC',
      'MTTR',
      'Pipeline 总额',
      'runtime source',
      'Champion 缺失',
      '来源缺口工作台',
      '隐性判断来源状态',
      '运行时推导',
    ];

    expect(VISIBLE_BUSINESS_TEXT_FORBIDDEN_TERMS).toEqual(expect.arrayContaining(requiredTerms));

    const result = visibleBusinessText(requiredTerms.join(' / '));

    for (const term of VISIBLE_BUSINESS_TEXT_FORBIDDEN_TERMS) {
      expect(result, `leaked forbidden term: ${term}`).not.toMatch(new RegExp(escapeRegExp(term), 'i'));
    }
    expect(result).not.toMatch(/\b(AE|AEs|TCS|CTO|CIO|CISO|CFO|CEO|VP|ROI|AIOps|POC|MTTR)\b/);
    expect(result).toContain('判断核心');
    expect(result).toContain('客户组合');
    expect(result).toContain('模式');
    expect(result).toContain('经济决策人');
    expect(result).toContain('内部推动者');
    expect(result).toContain('资格评分');
    expect(result).toContain('商机总额');
    expect(result).toContain('明确依据');
    expect(result).toContain('缺少内部推动者');
    expect(result).toContain('判断依据健康度');
    expect(result).toContain('组合判断可信度');
    expect(result).toContain('线索推断');
  });
});
