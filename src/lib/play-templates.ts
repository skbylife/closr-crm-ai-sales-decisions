import type { StrategicGoalType } from '@/lib/babel-engine/types';

export interface PlayTemplate {
  id: string;
  name: string;
  emoji: string;
  goalType: StrategicGoalType;
  goalDescription: string;
  successCriteria: string;
  assumptions: string[];
  templateContext: string;
  scope: 'opportunity' | 'account';
}

export const PLAY_TEMPLATES: PlayTemplate[] = [
  {
    id: 'exec_relationship',
    name: '打入决策层',
    emoji: '🎯',
    goalType: 'build_executive_relationship',
    goalDescription: '通过现有联系人引荐，与客户高层建立直接沟通渠道',
    successCriteria: '客户高层同意安排一对一会面，时长不低于30分钟',
    assumptions: [
      '现有联系人愿意引荐',
      '高层在此阶段有时间接待',
      '我方解决方案已引起初步兴趣',
    ],
    templateContext: '这是一个建立高层关系的任务。重点策略：通过现有内部教练建立信任背书，利用互惠原则提供有价值的行业洞察作为见面理由，避免直接推销。',
    scope: 'account',
  },
  {
    id: 'block_competitor',
    name: '对抗竞争对手',
    emoji: '🛡️',
    goalType: 'block_competitor',
    goalDescription: '在关键决策节点前，强化我方差异化优势，阻止竞争对手获得评估优势',
    successCriteria: '客户技术评估团队认可我方方案的核心差异化，并在评估标准中纳入我方优势指标',
    assumptions: [
      '竞争对手已进入评估流程',
      '客户尚未做出最终决定',
      '我方有明确的差异化优势',
    ],
    templateContext: '这是竞争防守场景。核心策略：用教学式销售重塑评估标准，让客户用对我方有利的维度衡量所有方案。同时识别并强化竞对薄弱点。',
    scope: 'opportunity',
  },
  {
    id: 'reactivate',
    name: '激活沉睡客户',
    emoji: '🔑',
    goalType: 'reactivate',
    goalDescription: '重新激活已停滞的商机，找到新的触发点重建推进动力',
    successCriteria: '客户主动回复并安排下一步会议，商机重新进入活跃评估阶段',
    assumptions: [
      '停滞原因是优先级变化而非彻底拒绝',
      '仍有内部推动者',
      '业务环境或客户需求发生了变化',
    ],
    templateContext: '沉睡客户重激活场景。策略：不重复之前失败的方式，先通过轻触点（行业报告、案例、新功能）重建存在感，再寻找新的业务触发事件作为重启理由。',
    scope: 'opportunity',
  },
  {
    id: 'org_mapping',
    name: '摸清组织架构',
    emoji: '🏗️',
    goalType: 'org_mapping',
    goalDescription: '通过现有联系人，系统性地识别真实决策链和关键干系人',
    successCriteria: '明确决策者、预算控制人和关键技术评估者的身份及立场',
    assumptions: [
      '现有联系人愿意分享内部信息',
      '决策链比表面看起来更复杂',
      '存在未被识别的关键影响者',
    ],
    templateContext: '情报收集和组织映射场景。核心方法：资格评分框架，重点识别经济决策人和决策流程。通过内部教练策略获取内部信息，避免直接询问敏感问题。',
    scope: 'account',
  },
  {
    id: 'create_urgency',
    name: '制造紧迫感',
    emoji: '⚡',
    goalType: 'create_urgency',
    goalDescription: '在客户决策流程中建立明确的时间节点，推动项目在本季度内落地',
    successCriteria: '客户承诺具体的决策时间节点，并安排了正式的评审会议',
    assumptions: [
      '客户有真实需求但缺乏推动力',
      '存在可利用的业务截止日期或政策节点',
      '预算已到位或有获批渠道',
    ],
    templateContext: '紧迫感建立场景。策略：识别客户自身的业务压力（财年结束、政策合规、竞争压力），将我方方案与客户必须解决的时间敏感问题绑定。避免人为制造虚假紧迫感（客户会识别）。',
    scope: 'opportunity',
  },
];
