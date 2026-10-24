import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockUnauthorizedResponse = vi.fn(() => new Response('unauthorized', { status: 401 }));
const mockRequireAdmin = vi.fn();
const mockRequireRole = vi.fn();
const mockGetUserContext = vi.fn();

vi.mock('@/lib/api-auth', () => ({
  getAuthUser: mockGetAuthUser,
  unauthorizedResponse: mockUnauthorizedResponse,
}));

vi.mock('@/lib/api-guard', () => ({
  requireAdmin: mockRequireAdmin,
  requireRole: mockRequireRole,
}));

vi.mock('@/lib/permissions-server', () => ({
  getUserContext: mockGetUserContext,
}));

function resolved(data: unknown) {
  return Promise.resolve({ data, error: null });
}

function makeAdmin() {
  return {
    from(table: string) {
      switch (table) {
        case 'accounts':
          return {
            select: () => ({
              eq: () => resolved([
                {
                  id: 'acc_eastchina_platform_001',
                  name: '华东某头部互联网平台',
                  industry: 'ICT',
                  deal_stage: 'negotiation',
                  deal_health: 'at_risk',
                  notes: '主演示账户',
                  opportunity_ids: ['opp_platform_cloud_001', 'opp_platform_test_002'],
                  last_activity: '2026-04-03',
                  user_id: 'user-1',
                  org_id: 'org-1',
                },
                {
                  id: 'acc_chinamobile_002',
                  name: '某全国性通信运营商集团',
                  industry: 'Telecom',
                  deal_stage: 'solution_presented',
                  deal_health: 'healthy',
                  notes: '次主演示账户',
                  opportunity_ids: ['opp_cmcc_5g_003'],
                  last_activity: '2026-04-02',
                  user_id: 'user-1',
                  org_id: 'org-1',
                },
                {
                  id: 'acc_national_bank_003',
                  name: '某全国性股份制银行',
                  industry: 'Finance',
                  deal_stage: 'proposal_sent',
                  deal_health: 'healthy',
                  notes: '次主演示账户',
                  opportunity_ids: ['opp_bank_app_005'],
                  last_activity: '2026-04-01',
                  user_id: 'user-1',
                  org_id: 'org-1',
                },
              ]),
            }),
          };
        case 'opportunities':
          return {
            select: () => ({
              eq: () => resolved([
                {
                  id: 'opp_platform_cloud_001',
                  account_id: 'acc_eastchina_platform_001',
                  name: '平台基础设施智能运维升级',
                  stage: 'negotiation',
                  user_id: 'user-1',
                  org_id: 'org-1',
                  meddicc: {
                    metrics: { status: 'confirmed' },
                    economicBuyer: { status: 'identified' },
                    decisionCriteria: [{ criterion: 'ROI' }],
                    decisionProcess: [{ step: '法务审核' }],
                    identifiedPain: [{ pain: '成本高' }],
                    champion: { strength: 4 },
                    competition: [{ name: 'TCS' }],
                    overallScore: 78,
                  },
                },
                {
                  id: 'opp_platform_test_002',
                  account_id: 'acc_eastchina_platform_001',
                  name: '核心业务测试服务续约',
                  stage: 'proposal_sent',
                  user_id: 'user-1',
                  org_id: 'org-1',
                  meddicc: {
                    metrics: { status: 'partial' },
                    economicBuyer: { status: 'identified' },
                    decisionCriteria: [{ criterion: '价格' }],
                    decisionProcess: [{ step: '采购' }],
                    identifiedPain: [{ pain: '测试成本' }],
                    champion: { strength: 3 },
                    competition: [{ name: 'TCS' }],
                    overallScore: 60,
                  },
                },
                {
                  id: 'opp_cmcc_5g_003',
                  account_id: 'acc_chinamobile_002',
                  name: '某全国性通信运营商 5G 平台',
                  stage: 'solution_presented',
                  user_id: 'user-1',
                  org_id: 'org-1',
                  meddicc: {
                    metrics: { status: 'confirmed' },
                    economicBuyer: { status: 'identified' },
                    decisionCriteria: [{ criterion: '稳定性' }],
                    decisionProcess: [{ step: '技术评审' }],
                    identifiedPain: [{ pain: '交付速度' }],
                    champion: { strength: 4 },
                    competition: [{ name: '友商A' }],
                    overallScore: 75,
                  },
                },
                {
                  id: 'opp_bank_app_005',
                  account_id: 'acc_national_bank_003',
                  name: '该银行 App 增长项目',
                  stage: 'proposal_sent',
                  user_id: 'user-1',
                  org_id: 'org-1',
                  meddicc: {
                    metrics: { status: 'confirmed' },
                    economicBuyer: { status: 'identified' },
                    decisionCriteria: [{ criterion: '安全性' }],
                    decisionProcess: [{ step: '内审' }],
                    identifiedPain: [{ pain: '转化率' }],
                    champion: { strength: 4 },
                    competition: [{ name: '友商B' }],
                    overallScore: 73,
                  },
                },
              ]),
            }),
          };
        case 'contacts':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'ct_huawei_1', account_id: 'acc_eastchina_platform_001', name: '李总', role: 'procurement', contact_profile: {}, reports_to: null, user_id: 'user-1', org_id: 'org-1' },
                { id: 'ct_huawei_2', account_id: 'acc_eastchina_platform_001', name: '陈涛', role: 'technical_evaluator', contact_profile: {}, reports_to: null, user_id: 'user-1', org_id: 'org-1' },
                { id: 'ct_cmcc_1', account_id: 'acc_chinamobile_002', name: '张总', role: 'champion', contact_profile: {}, reports_to: null, user_id: 'user-1', org_id: 'org-1' },
                { id: 'ct_cmb_1', account_id: 'acc_national_bank_003', name: '李总', role: 'economic_buyer', contact_profile: {}, reports_to: null, user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'strategic_plays':
          return {
            select: () => ({
              eq: () => resolved([
                {
                  id: 'play_hw_1',
                  account_id: 'acc_eastchina_platform_001',
                  opportunity_id: 'opp_platform_cloud_001',
                  target_contact_id: 'ct_huawei_1',
                  status: 'active',
                  goal_description: '推动法务过会，处理客户痛点、我方方案fit与证据链',
                  confidence: 82,
                  org_id: 'org-1',
                  user_id: 'user-1',
                  situation_judgment: '关系局：CTO与采购都需要被覆盖；需求局：降本、SLA、ROI。',
                  strategic_objective: '用 AIOps value hypothesis 证明方案fit并推动评审。',
                  stakeholder_path: [{ role: 'Champion', contactId: 'ct_huawei_1' }],
                  evidence_basis: [{ source: 'decode', note: 'Evidence Trace 已沉淀客户信号' }],
                  risk_counter_evidence: [{ risk: 'TCS 折扣压价' }],
                  knowledge_traces: [{ sourceRecordId: 'sr_decode_hw_1' }],
                  knowledge_gaps: [{ gap: 'CTO 决策标准仍需确认' }],
                  evidence_provenance: { sourceRecords: ['sr_decode_hw_1'] },
                  learnings: [{ note: '校正：法务补件不是拒绝，而是推进条件' }],
                  review: { calibration: '判断 → 证据 → 行动 → 复盘' },
                  assumptions: [
                    {
                      id: 'sigloop_decode_hw_1',
                      text: '待验证：法务补件完成后，采购是否会回到三年框架谈判？',
                      status: 'pending',
                      impact: '来源 decode:decode_hw_1 已提示可能影响「推动法务过会」。下一步：向李总确认补件责任人与过会日期。',
                    },
                  ],
                  steps: [
                    {
                      status: 'done',
                      who: 'AE + 法务',
                      target: '李总 / 客户法务',
                      expectedOutcome: '客户确认补件清单、责任人和过会日期',
                      assumptionBeingTested: '法务补件是推进条件，而不是采购拒绝信号。',
                    },
                    {
                      status: 'blocked',
                      who: '解决方案负责人',
                      target: '何总 / 技术评审',
                      expectedOutcome: 'CTO 办公室认可 AIOps 互补定位',
                      risk: '如果技术评审仍认为我方替代自研平台，续约会回到压价。',
                    },
                  ],
                },
                { id: 'play_hw_2', account_id: 'acc_eastchina_platform_001', opportunity_id: 'opp_platform_test_002', target_contact_id: 'ct_huawei_2', status: 'completed', goal_description: '应对 TCS', confidence: 70, org_id: 'org-1', user_id: 'user-1', steps: [{ status: 'completed' }] },
                {
                  id: 'play_cmcc_1',
                  account_id: 'acc_chinamobile_002',
                  opportunity_id: 'opp_cmcc_5g_003',
                  target_contact_id: 'ct_cmcc_1',
                  status: 'active',
                  goal_description: '巩固 champion，围绕客户痛点、OSS/BSS 方案fit与RFP证据链推进',
                  confidence: 76,
                  org_id: 'org-1',
                  user_id: 'user-1',
                  situation_judgment: '关系局：champion 支撑但采购链未完全透明；需求局：MTTR与跨省复制。',
                  strategic_objective: '以 OSS/BSS 集成和省级试点 value hypothesis 赢下 RFP。',
                  stakeholder_path: [{ role: 'Champion', contactId: 'ct_cmcc_1' }],
                  evidence_basis: [{ source: 'rfp_analysis', note: 'RFP Evidence Trace' }],
                  risk_counter_evidence: [{ risk: '集团采购链不透明' }],
                  knowledge_traces: [{ sourceRecordId: 'sr_rfp_cmcc_1' }],
                  knowledge_gaps: [{ gap: '经济买家仍需识别' }],
                  evidence_provenance: { sourceRecords: ['sr_rfp_cmcc_1'] },
                  learnings: [{ note: '校正：集团项目应先走省级试点' }],
                  review: { calibration: '判断 → 证据 → 行动 → 复盘' },
                  assumptions: [
                    {
                      id: 'sigloop_rfp_cmcc_1',
                      text: '待验证：集团采购中心真实经济买家和评分权重是否会否定省级试点路径？',
                      status: 'pending',
                      impact: '来源 rfp_analysis:rfp_analysis_cmcc_1 已提示可能影响「省级试点先行」。下一步：由张总补齐集团采购中心评分权重和经济买家。',
                    },
                  ],
                  steps: [
                    {
                      status: 'pending',
                      who: '张总 + 售前架构师',
                      target: '省公司试点负责人 / 集团采购中心',
                      expectedOutcome: '客户接受两省试点范围和集团复制路径',
                      assumptionBeingTested: '客户愿意接受省级试点后复制，而不是一次性集团全量上线。',
                    },
                  ],
                },
                {
                  id: 'play_cmb_1',
                  account_id: 'acc_national_bank_003',
                  opportunity_id: 'opp_bank_app_005',
                  target_contact_id: 'ct_cmb_1',
                  status: 'active',
                  goal_description: '推动 ROI 认可，处理安全合规客户痛点与方案fit',
                  confidence: 75,
                  org_id: 'org-1',
                  user_id: 'user-1',
                  situation_judgment: '关系局：安全审查暂停不等于丢单；需求局：合规与体验并重。',
                  strategic_objective: '用安全 POC 和转化率 value hypothesis 推动预算获批。',
                  stakeholder_path: [{ role: 'Economic buyer', contactId: 'ct_cmb_1' }],
                  evidence_basis: [{ source: 'decode', note: 'Decode Evidence Trace' }],
                  risk_counter_evidence: [{ risk: '安全审查拉长周期' }],
                  knowledge_traces: [{ sourceRecordId: 'sr_decode_cmb_1' }],
                  knowledge_gaps: [{ gap: '内审最终标准待确认' }],
                  evidence_provenance: { sourceRecords: ['sr_decode_cmb_1'] },
                  learnings: [{ note: '校正：14 天沉默是安全审查暂停' }],
                  review: { calibration: '沉默误判已校正为安全审查暂停' },
                  assumptions: [
                    {
                      id: 'sigloop_decode_cmb_1',
                      text: '待验证：安全审查通过后，刘总是否会把项目重新拉回 POC 推进？',
                      status: 'pending',
                      impact: '来源 decode:decode_cmb_1 已提示可能影响「沉默是安全审查暂停」。下一步：让孙宁确认 POC 资源、验收标准和安全限定条件。',
                    },
                  ],
                  steps: [
                    {
                      status: 'pending',
                      who: 'AE + 孙宁',
                      target: '刘总 / 安全审查负责人',
                      expectedOutcome: '客户确认 POC 资源、验收标准和重启窗口',
                      assumptionBeingTested: '安全审查通过后，关系风险会回到 POC 推进路径。',
                    },
                  ],
                },
              ]),
            }),
          };
        case 'ai_insights':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'ins_1', entity_type: 'account', entity_id: 'acc_eastchina_platform_001', insight_type: 'action', org_id: 'org-1' },
                { id: 'ins_2', entity_type: 'opportunity', entity_id: 'opp_platform_cloud_001', insight_type: 'health', org_id: 'org-1' },
                { id: 'ins_3', entity_type: 'account', entity_id: 'acc_national_bank_003', insight_type: 'impact', org_id: 'org-1' },
              ]),
            }),
          };
        case 'intel_items':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'intel_hw_1', account_id: 'acc_eastchina_platform_001', opportunity_id: 'opp_platform_cloud_001', related_contact_ids: ['ct_huawei_1'], user_id: 'user-1', org_id: 'org-1' },
                { id: 'intel_cmcc_1', account_id: 'acc_chinamobile_002', opportunity_id: 'opp_cmcc_5g_003', related_contact_ids: ['ct_cmcc_1'], user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'email_decodes':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'decode_hw_1', account_id: 'acc_eastchina_platform_001', opportunity_id: 'opp_platform_cloud_001', matched_contact_id: 'ct_huawei_1', user_id: 'user-1', org_id: 'org-1' },
                { id: 'decode_cmcc_1', account_id: 'acc_chinamobile_002', opportunity_id: 'opp_cmcc_5g_003', matched_contact_id: 'ct_cmcc_1', user_id: 'user-1', org_id: 'org-1' },
                { id: 'decode_cmb_1', account_id: 'acc_national_bank_003', opportunity_id: 'opp_bank_app_005', matched_contact_id: 'ct_cmb_1', user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'meeting_preps':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'meeting_hw_1', account_id: 'acc_eastchina_platform_001', user_id: 'user-1', org_id: 'org-1' },
                { id: 'meeting_cmb_1', account_id: 'acc_national_bank_003', user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'activity_logs':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'act_hw_1', account_id: 'acc_eastchina_platform_001', contact_id: 'ct_huawei_1', user_id: 'user-1', org_id: 'org-1' },
                { id: 'act_hw_2', account_id: 'acc_eastchina_platform_001', contact_id: 'ct_huawei_2', user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'tasks':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'task_hw_1', account_id: 'acc_eastchina_platform_001', opportunity_id: 'opp_platform_cloud_001', user_id: 'user-1', org_id: 'org-1' },
                { id: 'task_cmcc_1', account_id: 'acc_chinamobile_002', opportunity_id: 'opp_cmcc_5g_003', user_id: 'user-1', org_id: 'org-1' },
                { id: 'task_cmb_1', account_id: 'acc_national_bank_003', opportunity_id: 'opp_bank_app_005', user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'discovery_notes':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'dn_hw_1', opportunity_id: 'opp_platform_cloud_001', user_id: 'user-1', org_id: 'org-1' },
                { id: 'dn_cmcc_1', opportunity_id: 'opp_cmcc_5g_003', user_id: 'user-1', org_id: 'org-1' },
                { id: 'dn_cmb_1', opportunity_id: 'opp_bank_app_005', user_id: 'user-1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'ai_advices':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'advice_hw_1', account_id: 'acc_eastchina_platform_001', opportunity_id: 'opp_platform_cloud_001', org_id: 'org-1' },
                { id: 'advice_cmcc_1', account_id: 'acc_chinamobile_002', opportunity_id: 'opp_cmcc_5g_003', org_id: 'org-1' },
                { id: 'advice_cmb_1', account_id: 'acc_national_bank_003', opportunity_id: 'opp_bank_app_005', org_id: 'org-1' },
              ]),
            }),
          };
        case 'ai_forecasts':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'fc_hw_1', opportunity_id: 'opp_platform_cloud_001', org_id: 'org-1' },
              ]),
            }),
          };
        case 'integration_connections':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'conn_1', connector_id: 'outlook', status: 'active', org_id: 'org-1', config: { label: 'Huawei mailbox' } },
              ]),
            }),
          };
        case 'integration_emails':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'mail_hw_1', account_id: 'acc_eastchina_platform_001', contact_id: 'ct_huawei_1', org_id: 'org-1', subject: 'Huawei 法务补件', summary: '华东某头部互联网平台法务仍在补件', sender: 'wangjianguo@platform.example.com', connection_id: 'conn_1' },
              ]),
            }),
          };
        case 'rfps':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'rfp_cmcc_1', account_id: 'acc_chinamobile_002', opportunity_id: 'opp_cmcc_5g_003', linked_play_id: 'play_cmcc_1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'rfp_ai_analyses':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'rfp_analysis_cmcc_1', rfp_id: 'rfp_cmcc_1', org_id: 'org-1' },
              ]),
            }),
          };
        case 'source_records':
          return {
            select: () => ({
              eq: () => resolved([
                {
                  id: 'sr_decode_hw_1',
                  account_id: 'acc_eastchina_platform_001',
                  source_kind: 'email_decode',
                  source_table: 'email_decodes',
                  source_row_id: 'decode_hw_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'decode',
                    judgmentMemory: {
                      sourceKind: 'decode',
                      sourceId: 'decode_hw_1',
                      accountId: 'acc_eastchina_platform_001',
                      currentJudgment: '法务补件仍是主线推进约束。',
                      risk: '采购可能继续用法务补件拖延决策。',
                      nextAction: '发送法务补件清单并确认责任人。',
                      evidenceRefs: [{ sourceId: 'decode_hw_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_hw_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'decode_hw_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_hw_1' }],
                  },
                },
                {
                  id: 'sr_play_hw_1',
                  account_id: 'acc_eastchina_platform_001',
                  source_kind: 'strategic_play',
                  source_table: 'strategic_plays',
                  source_row_id: 'play_hw_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'strategic_play',
                    judgmentMemory: {
                      sourceKind: 'strategic_play',
                      sourceId: 'play_hw_1',
                      accountId: 'acc_eastchina_platform_001',
                      currentJudgment: '应先推动法务过会。',
                      risk: '过会前客户不会给出采购承诺。',
                      nextAction: '推动法务过会。',
                      evidenceRefs: [{ sourceId: 'play_hw_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_hw_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'play_hw_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_hw_1' }],
                  },
                },
                {
                  id: 'sr_play_hw_2',
                  account_id: 'acc_eastchina_platform_001',
                  source_kind: 'strategic_play',
                  source_table: 'strategic_plays',
                  source_row_id: 'play_hw_2',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'strategic_play',
                    judgmentMemory: {
                      sourceKind: 'strategic_play',
                      sourceId: 'play_hw_2',
                      accountId: 'acc_eastchina_platform_001',
                      currentJudgment: '应继续应对 TCS 竞争位势。',
                      risk: '竞对可能用续约折扣压价。',
                      nextAction: '强化差异化测试服务价值。',
                      evidenceRefs: [{ sourceId: 'play_hw_2', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_hw_2' }],
                    },
                    evidenceRefs: [{ sourceId: 'play_hw_2', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_hw_2' }],
                  },
                },
                {
                  id: 'sr_decode_cmcc_1',
                  account_id: 'acc_chinamobile_002',
                  source_kind: 'email_decode',
                  source_table: 'email_decodes',
                  source_row_id: 'decode_cmcc_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'decode',
                    judgmentMemory: {
                      sourceKind: 'decode',
                      sourceId: 'decode_cmcc_1',
                      accountId: 'acc_chinamobile_002',
                      currentJudgment: '5G 平台推进仍有 champion 支撑。',
                      risk: '技术评审可能拉长周期。',
                      nextAction: '巩固 champion 并确认技术评审节点。',
                      evidenceRefs: [{ sourceId: 'decode_cmcc_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_cmcc_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'decode_cmcc_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_cmcc_1' }],
                  },
                },
                {
                  id: 'sr_play_cmcc_1',
                  account_id: 'acc_chinamobile_002',
                  source_kind: 'strategic_play',
                  source_table: 'strategic_plays',
                  source_row_id: 'play_cmcc_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'strategic_play',
                    judgmentMemory: {
                      sourceKind: 'strategic_play',
                      sourceId: 'play_cmcc_1',
                      accountId: 'acc_chinamobile_002',
                      currentJudgment: '当前重点是巩固 champion。',
                      risk: 'champion 影响力需要继续验证。',
                      nextAction: '巩固 champion。',
                      evidenceRefs: [{ sourceId: 'play_cmcc_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_cmcc_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'play_cmcc_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_cmcc_1' }],
                  },
                },
                {
                  id: 'sr_rfp_cmcc_1',
                  account_id: 'acc_chinamobile_002',
                  source_kind: 'source_record',
                  source_table: 'rfp_ai_analyses',
                  source_row_id: 'rfp_analysis_cmcc_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'rfp_analysis',
                    judgmentMemory: {
                      sourceKind: 'rfp_analysis',
                      sourceId: 'rfp_analysis_cmcc_1',
                      accountId: 'acc_chinamobile_002',
                      currentJudgment: 'RFP 应转向省级试点先行。',
                      risk: '集团采购链不透明。',
                      nextAction: '确认两省试点范围。',
                      evidenceRefs: [{ sourceId: 'rfp_analysis_cmcc_1', sourceKind: 'rfp_analysis', sourceTable: 'rfp_ai_analyses', sourceRowId: 'rfp_analysis_cmcc_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'rfp_analysis_cmcc_1', sourceKind: 'rfp_analysis', sourceTable: 'rfp_ai_analyses', sourceRowId: 'rfp_analysis_cmcc_1' }],
                  },
                },
                {
                  id: 'sr_decode_cmb_1',
                  account_id: 'acc_national_bank_003',
                  source_kind: 'email_decode',
                  source_table: 'email_decodes',
                  source_row_id: 'decode_cmb_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'decode',
                    judgmentMemory: {
                      sourceKind: 'decode',
                      sourceId: 'decode_cmb_1',
                      accountId: 'acc_national_bank_003',
                      currentJudgment: '14 天沉默是安全审查暂停。',
                      risk: '误判为丢单会导致错误催促。',
                      nextAction: '等待安全审查窗口并准备 POC。',
                      evidenceRefs: [{ sourceId: 'decode_cmb_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_cmb_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'decode_cmb_1', sourceKind: 'email_decode', sourceTable: 'email_decodes', sourceRowId: 'decode_cmb_1' }],
                  },
                },
                {
                  id: 'sr_feedback_cmb_1',
                  account_id: 'acc_national_bank_003',
                  source_kind: 'human_feedback',
                  source_table: 'judgment_feedback',
                  source_row_id: 'feedback_cmb_1',
                  org_id: 'org-1',
                  metadata: { calibration: '沉默误判校正为安全审查暂停' },
                },
                {
                  id: 'sr_execution_hw_1',
                  account_id: 'acc_eastchina_platform_001',
                  source_kind: 'play_execution_event',
                  source_table: 'strategic_plays',
                  source_row_id: 'play_hw_1',
                  org_id: 'org-1',
                  metadata: { playExecutionEvent: { playId: 'play_hw_1', status: 'done' } },
                },
                {
                  id: 'sr_execution_hw_2',
                  account_id: 'acc_eastchina_platform_001',
                  source_kind: 'play_execution_event',
                  source_table: 'strategic_plays',
                  source_row_id: 'play_hw_1',
                  org_id: 'org-1',
                  metadata: { playExecutionEvent: { playId: 'play_hw_1', status: 'blocked' } },
                },
                {
                  id: 'sr_play_cmb_1',
                  account_id: 'acc_national_bank_003',
                  source_kind: 'strategic_play',
                  source_table: 'strategic_plays',
                  source_row_id: 'play_cmb_1',
                  org_id: 'org-1',
                  metadata: {
                    sourceKind: 'strategic_play',
                    judgmentMemory: {
                      sourceKind: 'strategic_play',
                      sourceId: 'play_cmb_1',
                      accountId: 'acc_national_bank_003',
                      currentJudgment: '应推动 ROI 认可。',
                      risk: '内审可能优先压安全风险。',
                      nextAction: '推动 ROI 认可。',
                      evidenceRefs: [{ sourceId: 'play_cmb_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_cmb_1' }],
                    },
                    evidenceRefs: [{ sourceId: 'play_cmb_1', sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: 'play_cmb_1' }],
                  },
                },
              ]),
            }),
          };
        case 'knowledge_update_log':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'kul_hw_1', account_id: 'acc_eastchina_platform_001' },
              ]),
            }),
          };
        case 'account_open_questions':
          return {
            select: () => ({
              eq: () => resolved([
                { id: 'oq_hw_1', account_id: 'acc_eastchina_platform_001', status: 'open', question: 'CTO 的最终决策标准是什么？' },
              ]),
            }),
          };
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue({ id: 'user-1', email: 'example-c39293aa15@example.invalid' });
  mockGetUserContext.mockResolvedValue({
    userId: 'user-1',
    orgId: 'org-1',
    orgRole: 'member',
    roleLevel: 'member',
    jobLevel: 0,
    teamId: null,
    teamMemberIds: ['user-1'],
  });
  mockRequireRole.mockImplementation((ctx: { orgRole: string }) => {
    if (ctx.orgRole !== 'owner' && ctx.orgRole !== 'admin') throw new Error('forbidden');
  });
  mockRequireAdmin.mockReturnValue(makeAdmin());
});

describe('verify-demo P1 strengthening', () => {
  it('返回 smoke checklist，并覆盖华东某头部互联网平台主链路与 demo surface 资产', async () => {
    const route = await import('@/app/api/verify-demo/route');
    const response = await route.GET();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.summary.ready).toBe(true);
    expect(payload.demoAssets.demoReadinessChecklist.length).toBeGreaterThanOrEqual(6);

    const smokeItem = payload.demoAssets.demoReadinessChecklist.find((item: string) => item.includes('Scenario A'));
    expect(smokeItem).toBeTruthy();

    const huaweiEvidenceCheck = payload.checks.find((check: { key: string }) => check.key === 'evidence-huawei-path');
    expect(huaweiEvidenceCheck.status).toBe('pass');
    expect(huaweiEvidenceCheck.detail).toContain('integrationEmails=1');

    const huaweiSurface = payload.checks.find((check: { key: string }) => check.key === 'demo-surface-renewal');
    expect(huaweiSurface.status).toBe('pass');
    expect(huaweiSurface.detail).toContain('tasks=1');
    expect(huaweiSurface.detail).toContain('discoveryNotes=1');
    expect(huaweiSurface.detail).toContain('aiAdvices=1');
    expect(huaweiSurface.detail).toContain('aiForecasts=1');

    const provenanceGate = payload.checks.find((check: { key: string }) => check.key === 'judgment-provenance-p0');
    expect(provenanceGate.status).toBe('pass');
    expect(provenanceGate.detail).toContain('derived=0');
    expect(provenanceGate.detail).toContain('invalid=0');
  });

  it('未登录时拒绝访问 verify-demo 摘要', async () => {
    mockGetAuthUser.mockResolvedValueOnce(null);
    const route = await import('@/app/api/verify-demo/route');

    const response = await route.GET();

    expect(response.status).toBe(401);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

  it('非 demo 且非管理员账号不能读取 org 级 demo 验收摘要', async () => {
    mockGetAuthUser.mockResolvedValueOnce({ id: 'user-2', email: 'ae@example.com' });
    mockGetUserContext.mockResolvedValueOnce({
      userId: 'user-2',
      orgId: 'org-1',
      orgRole: 'member',
      roleLevel: 'member',
      jobLevel: 0,
      teamId: null,
      teamMemberIds: ['user-2'],
    });
    const route = await import('@/app/api/verify-demo/route');

    const response = await route.GET();
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain('仅 demo 账号或管理员');
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

});
