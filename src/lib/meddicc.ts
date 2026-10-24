import type {
  MeddiccAssessment,
  Contact,
  Opportunity,
  OpportunityStage,
  MilestoneCategory,
  MilestoneOwner,
  MilestoneStatus,
} from '@/lib/babel-engine/types';

// ─── Helpers ─────────────────────────────────────────────────────────

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatCurrency(value: number, currency: string) {
  if (currency === 'CNY') return `$${value.toLocaleString()}`;
  if (currency === 'EUR') return `€${value.toLocaleString()}`;
  return `$${value.toLocaleString()}`;
}

export function daysBetween(a: string, b: string) {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeStatus(value: unknown, map: Record<string, string>, fallback: string): string {
  return typeof value === 'string' ? (map[value] ?? value) : fallback;
}

export function normalizeMeddiccAssessment(raw: unknown, contacts: Contact[] = []): MeddiccAssessment {
  const source = asRecord(raw);
  const metrics = asRecord(source.metrics);
  const economicBuyer = asRecord(source.economicBuyer);
  const decisionCriteriaSource = asArray<Record<string, unknown>>(source.decisionCriteria).length > 0
    ? asArray<Record<string, unknown>>(source.decisionCriteria)
    : asArray<Record<string, unknown>>(asRecord(source.decisionCriteria).items);
  const decisionProcessSource = asArray<Record<string, unknown>>(source.decisionProcess).length > 0
    ? asArray<Record<string, unknown>>(source.decisionProcess)
    : asArray<Record<string, unknown>>(asRecord(source.decisionProcess).steps);
  const identifiedPainSource = asArray<Record<string, unknown>>(source.identifiedPain).length > 0
    ? asArray<Record<string, unknown>>(source.identifiedPain)
    : asArray<Record<string, unknown>>(asRecord(source.pain).items);
  const champion = asRecord(source.champion);
  const competitionSource = asArray<Record<string, unknown>>(source.competition);

  const normalized: MeddiccAssessment = {
    metrics: {
      notes: typeof metrics.notes === 'string' ? metrics.notes : '',
      status: normalizeStatus(metrics.status, {}, 'unconfirmed') as MeddiccAssessment['metrics']['status'],
      evidence: typeof metrics.evidence === 'string' ? metrics.evidence : '',
    },
    economicBuyer: {
      status: normalizeStatus(economicBuyer.status, { contacted: 'engaged', unidentified: 'unknown' }, 'unknown') as MeddiccAssessment['economicBuyer']['status'],
      accessLevel: typeof economicBuyer.accessLevel === 'string' ? economicBuyer.accessLevel : '',
    },
    decisionCriteria: decisionCriteriaSource.map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `dc-${index}`,
      criterion: typeof item.criterion === 'string' ? item.criterion : '',
      ourFit: normalizeStatus(item.ourFit ?? item.fit, { meets: 'strong' }, 'partial') as 'strong' | 'partial' | 'weak',
      notes: typeof item.notes === 'string' ? item.notes : '',
    })).filter((item) => item.criterion),
    decisionProcess: decisionProcessSource.map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `dp-${index}`,
      step: typeof item.step === 'string' ? item.step : typeof item.name === 'string' ? item.name : '',
      status: normalizeStatus(item.status ?? ((item.completed === true) ? 'completed' : 'pending'), {}, 'pending') as 'completed' | 'in_progress' | 'pending',
      owner: typeof item.owner === 'string' ? item.owner : '',
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : '',
    })).filter((item) => item.step),
    identifiedPain: identifiedPainSource.map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `pain-${index}`,
      pain: typeof item.pain === 'string' ? item.pain : typeof item.description === 'string' ? item.description : '',
      quantified: item.quantified === true || item.quantified === 'quantified',
      impactValue: typeof item.impactValue === 'string' ? item.impactValue : '',
      notes: typeof item.notes === 'string' ? item.notes : '',
    })).filter((item) => item.pain),
    champion: {
      strength: typeof champion.strength === 'number' ? champion.strength : 0,
      lastEngagement: typeof champion.lastEngagement === 'string' ? champion.lastEngagement : typeof champion.lastInteraction === 'string' ? champion.lastInteraction : '',
      notes: typeof champion.notes === 'string' ? champion.notes : '',
    },
    competition: competitionSource.map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `comp-${index}`,
      name: typeof item.name === 'string' ? item.name : '',
      strengths: typeof item.strengths === 'string' ? item.strengths : '',
      ourAdvantage: typeof item.ourAdvantage === 'string' ? item.ourAdvantage : '',
      threatLevel: normalizeStatus(item.threatLevel, {}, 'medium') as 'high' | 'medium' | 'low',
    })).filter((item) => item.name),
    overallScore: 0,
  };

  normalized.overallScore = (() => {
    let score = 0;
    if (normalized.metrics.status === 'confirmed') score += 15;
    else if (normalized.metrics.status === 'partial') score += 8;
    if (normalized.economicBuyer.status === 'engaged') score += 15;
    else if (normalized.economicBuyer.status === 'identified') score += 8;
    if (normalized.decisionCriteria.length > 0) {
      const strong = normalized.decisionCriteria.filter((d) => d.ourFit === 'strong').length;
      const partial = normalized.decisionCriteria.filter((d) => d.ourFit === 'partial').length;
      score += Math.min(15, Math.round(((strong + partial * 0.5) / normalized.decisionCriteria.length) * 15));
    }
    if (normalized.decisionProcess.length > 0) {
      const completed = normalized.decisionProcess.filter((d) => d.status === 'completed').length;
      score += Math.round((completed / normalized.decisionProcess.length) * 10);
    }
    if (normalized.identifiedPain.length > 0) {
      const quantified = normalized.identifiedPain.filter((p) => p.quantified).length;
      score += Math.min(10, normalized.identifiedPain.length * 3) + Math.round((quantified / normalized.identifiedPain.length) * 5);
    }
    const champions = contacts.filter((c) => c.role === 'champion');
    if (champions.length > 0) {
      score += Math.min(5, champions.length * 3) + Math.min(5, normalized.champion.strength);
      if (normalized.champion.lastEngagement) {
        const days = daysBetween(normalized.champion.lastEngagement, new Date().toISOString().split('T')[0]);
        if (days <= 7) score += 5;
        else if (days <= 14) score += 3;
        else if (days <= 30) score += 1;
      }
    }
    if (normalized.competition.length > 0) {
      const withCounter = normalized.competition.filter((c) => c.ourAdvantage.trim().length > 0).length;
      score += Math.min(10, normalized.competition.length * 3);
      score += Math.min(5, Math.round((withCounter / normalized.competition.length) * 5));
    }
    const storedScore = typeof source.overallScore === 'number' ? source.overallScore : 0;
    return Math.min(100, Math.max(storedScore, score));
  })();

  return normalized;
}

export function getMeddiccScore(m: unknown, contacts: Contact[] = []): number {
  return normalizeMeddiccAssessment(m, contacts).overallScore;
}

export function computeMeddiccScore(m: MeddiccAssessment, contacts: Contact[]): number {
  return getMeddiccScore(m, contacts);
}

export function getDimensionScore(m: MeddiccAssessment, dim: string, contacts: Contact[] = []): { score: number; max: number } {
  switch (dim) {
    case 'metrics': return { score: m.metrics?.status === 'confirmed' ? 15 : m.metrics?.status === 'partial' ? 8 : 0, max: 15 };
    case 'economicBuyer': return { score: m.economicBuyer?.status === 'engaged' ? 15 : m.economicBuyer?.status === 'identified' ? 8 : 0, max: 15 };
    case 'decisionCriteria': {
      if ((m.decisionCriteria ?? []).length === 0) return { score: 0, max: 15 };
      const s = (m.decisionCriteria ?? []).filter((d) => d.ourFit === 'strong').length;
      const p = (m.decisionCriteria ?? []).filter((d) => d.ourFit === 'partial').length;
      return { score: Math.min(15, Math.round(((s * 1.0 + p * 0.5) / (m.decisionCriteria ?? []).length) * 15)), max: 15 };
    }
    case 'decisionProcess': {
      if ((m.decisionProcess ?? []).length === 0) return { score: 0, max: 10 };
      const c = (m.decisionProcess ?? []).filter((d) => d.status === 'completed').length;
      return { score: Math.round((c / (m.decisionProcess ?? []).length) * 10), max: 10 };
    }
    case 'identifiedPain': {
      if ((m.identifiedPain ?? []).length === 0) return { score: 0, max: 15 };
      const q = (m.identifiedPain ?? []).filter((p) => p.quantified).length;
      const base = Math.min(10, (m.identifiedPain ?? []).length * 3);
      const bonus = Math.round((q / (m.identifiedPain ?? []).length) * 5);
      return { score: base + bonus, max: 15 };
    }
    case 'champion': {
      let s = 0;
      const champions = contacts.filter((c) => c.role === 'champion');
      if (champions.length > 0) {
        s += Math.min(5, champions.length * 3);
        s += Math.min(5, m.champion?.strength);
        if (m.champion?.lastEngagement) {
          const d = daysBetween(m.champion?.lastEngagement, new Date().toISOString().split('T')[0]);
          if (d <= 7) s += 5; else if (d <= 14) s += 3; else if (d <= 30) s += 1;
        }
      }
      return { score: Math.min(15, s), max: 15 };
    }
    case 'competition': {
      if ((m.competition ?? []).length === 0) return { score: 0, max: 15 };
      const w = (m.competition ?? []).filter((c) => (c.ourAdvantage ?? "").trim().length > 0).length;
      return { score: Math.min(15, (m.competition ?? []).length * 3 + Math.round((w / (m.competition ?? []).length) * 5)), max: 15 };
    }
    default: return { score: 0, max: 0 };
  }
}

export function checkStageRequirements(opp: Opportunity, targetStage: OpportunityStage, contacts: Contact[]): string[] {
  const warnings: string[] = [];
  const m = opp.meddicc;
  const score = computeMeddiccScore(m, contacts);

  switch (targetStage) {
    case 'discovery':
      if (contacts.length === 0) warnings.push('At least 1 contact required');
      break;
    case 'solution_presented':
      if (m.metrics?.status === 'unconfirmed') warnings.push('Metrics must be at least partially confirmed');
      if ((m.identifiedPain ?? []).length === 0) warnings.push('At least 1 pain point required');
      if (!contacts.some((c) => c.role === 'champion')) warnings.push('At least 1 Champion required');
      break;
    case 'proposal_sent':
      if ((m.decisionCriteria ?? []).length === 0) warnings.push('At least 1 decision criterion required');
      if (!opp.value) warnings.push('Deal value is required');
      break;
    case 'negotiation':
      if (m.economicBuyer?.status === 'unknown') warnings.push('Economic Buyer must be at least identified');
      if ((m.decisionProcess ?? []).length === 0) warnings.push('At least 1 decision process step required');
      break;
    case 'contract_review':
      if (score < 40) warnings.push(`MEDDICC score ${score}, requires >= 40`);
      if (opp.mutualActionPlan?.milestones?.length < 3) warnings.push(`MAP has only ${opp.mutualActionPlan?.milestones?.length} milestones, requires >= 3`);
      break;
    case 'closed_won':
      if (score < 60) warnings.push(`MEDDICC score ${score}, requires >= 60`);
      if (opp.mutualActionPlan.milestones.some((ms) => ms.status === 'blocked')) warnings.push('MAP has blocked milestones');
      break;
    case 'closed_lost':
      if (!opp.lostReason) warnings.push('Loss reason is required');
      break;
  }
  return warnings;
}

// ─── Constants ───────────────────────────────────────────────────────

export const MILESTONE_CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  discovery: '发现', technical: '技术', procurement: '采购', legal: '法务',
  security: '安全', implementation: '实施', signature: '签约', other: '其他',
};

export const MILESTONE_CATEGORY_ICONS: Record<MilestoneCategory, string> = {
  discovery: '🔍', technical: '🔧', procurement: '📋', legal: '⚖️',
  security: '🔒', implementation: '🏗️', signature: '✍️', other: '📦',
};

export const MILESTONE_OWNER_LABELS: Record<MilestoneOwner, string> = {
  buyer: '🏢 买方', seller: '🤝 卖方', both: '🔄 双方',
};

export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  completed: 'var(--positive)', in_progress: '#3B82F6', pending: 'var(--border)',
  blocked: 'var(--accent-red)', at_risk: 'var(--accent-amber)',
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  completed: '✅ 已完成', in_progress: '🔄 进行中', pending: '⏳ 待处理', blocked: '🚫 受阻', at_risk: '⚠️ 有风险',
};

export const MEDDICC_COLORS: Record<string, string> = {
  metrics: '#3B82F6',
  economicBuyer: '#8B5CF6',
  decisionCriteria: '#EC4899',
  decisionProcess: '#F59E0B',
  identifiedPain: '#EF4444',
  champion: '#10B981',
  competition: '#6366F1',
};

export const MEDDICC_LABELS: Record<string, string> = {
  metrics: 'M 指标',
  economicBuyer: 'E 经济买家',
  decisionCriteria: 'D 决策标准',
  decisionProcess: 'D 决策流程',
  identifiedPain: 'I 痛点',
  champion: 'C 推动者',
  competition: 'C 竞争',
};

// ─── MEDDICC Guided Questions ────────────────────────────────────────

export const MEDDICC_GUIDES: Record<string, {
  label: string;
  description: string;
  questions: string[];
  example: string;
}> = {
  metrics: {
    label: '量化指标 (Metrics)',
    description: '客户的痛点能被量化吗？用数字说话。',
    questions: [
      '客户当前的痛点造成了多少财务损失？（年度金额）',
      '使用我们的方案后，预计能节省多少成本或增加多少收入？',
      'ROI 回本周期是多久？客户认可这个数字吗？',
    ],
    example: '客户每年因价格标签错误造成$200M损失，我方方案可减少95%错误，预计18个月回本。已获运营VP确认。',
  },
  economicBuyer: {
    label: '经济买家 (Economic Buyer)',
    description: '谁是真正拍板付钱的人？不是对接人，是签支票的人。',
    questions: [
      '谁有权批准这笔预算？你能直接接触到他/她吗？',
      '经济买家最关心什么？（成本削减/收入增长/风险控制）',
      '经济买家对竞品的态度是什么？',
    ],
    example: 'CFO John Rainey 是最终审批人，关注18个月ROI目标。已通过Champion安排了一次15分钟汇报。',
  },
  decisionCriteria: {
    label: '决策标准 (Decision Criteria)',
    description: '客户用什么标准来评估方案？你能影响这些标准吗？',
    questions: [
      '客户的正式评估标准有哪些？（技术/商务/合规）',
      '这些标准中哪些对我方有利？哪些不利？',
      '你有机会影响或增加对我方有利的评估标准吗？',
    ],
    example: 'RFP要求：99.9%可用性、与现有WMS兼容、ROI<18个月、本地技术支持。前3项我方优势，第4项需要加强。',
  },
  decisionProcess: {
    label: '决策流程 (Decision Process)',
    description: '从评估到签约的完整路径是什么？每一步谁参与？',
    questions: [
      '决策流程有几个阶段？每个阶段的审批人是谁？',
      '是否有正式的采购委员会或评审会？时间节点？',
      '有没有可能被延迟或搁置的风险？什么因素会导致？',
    ],
    example: '流程：技术评估(IT)→商务谈判(采购)→CEO审批。预计3个月。风险：年底预算冻结可能延迟。',
  },
  identifiedPain: {
    label: '痛点识别 (Identified Pain)',
    description: '客户的真实痛点是什么？区分表面症状和根本原因。',
    questions: [
      '客户自己描述的最大痛点是什么？',
      '这个痛点背后的根本原因是什么？不解决会怎样？',
      '痛点是否已经被量化？对谁的影响最大？',
    ],
    example: '表面痛点：价格变更太慢(72小时)。根本原因：手工流程+系统碎片化。不解决后果：促销执行率仅78%，年损失$80M。',
  },
  champion: {
    label: '内部推动者 (Champion)',
    description: '谁在客户内部帮你推动？测试方法：他/她愿意为你承担风险吗？',
    questions: [
      '谁是你在客户内部的核心支持者？他/她的职级够吗？',
      'Champion 有没有主动为你安排内部会议或推荐？',
      'Champion 的动机是什么？（升职/绩效/真心认可方案）',
    ],
    example: 'Sarah Johnson (VP运营) 是Champion。她主动安排了C-suite演示，动机：成功部署ESL是她今年KPI。强度评分：4/5。',
  },
  competition: {
    label: '竞争态势 (Competition)',
    description: '竞品是谁？不只是产品对比，更是方案和关系的对比。',
    questions: [
      '客户在评估哪些竞品？他们和竞品的关系如何？',
      '竞品的优势是什么？我方如何差异化应对？',
      '客户有没有"什么都不做"的选项？这个选项的吸引力有多大？',
    ],
    example: '主要竞品SES-imagotag，品牌认知度高但AI能力弱。我方差异化：BABEL引擎实时优化。"不做"选项：客户意识到每年$200M损失不可持续。',
  },
};

// ─── MEDDICC Strengthen Suggestions ─────────────────────────────────

export const MEDDICC_STRENGTHEN: Record<string, string[]> = {
  metrics: [
    '要求客户财务团队参与一次ROI工坊，量化当前痛点的财务影响',
    '准备行业基准数据对比报告，用同行数字说服客户',
  ],
  economicBuyer: [
    '通过Champion安排与经济买家的15分钟汇报',
    '准备一页纸的Executive Summary，突出ROI和战略价值',
  ],
  decisionCriteria: [
    '请Champion分享内部评估表或RFP评分标准',
    '主动提议协助起草技术评估标准（影响标准制定）',
  ],
  decisionProcess: [
    '请Champion画出内部审批流程图，标注每个节点的审批人和时间',
    '确认是否有"隐藏"的审批环节（如安全审查、法务审核）',
  ],
  identifiedPain: [
    '追问"不做会怎样"——量化不行动的代价',
    '与终端用户面谈，发现管理层看不到的一线痛点',
  ],
  champion: [
    '安排一次私下午餐或咖啡会，了解Champion的个人目标和KPI',
    '测试Champion强度：请TA帮忙安排一次内部高层会议',
  ],
  competition: [
    '制作竞品对比矩阵，但只突出我方差异化优势维度',
    '了解客户之前与竞品的合作历史和不满之处',
  ],
};
