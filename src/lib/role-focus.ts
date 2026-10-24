export type RoleFocusRole = 'ae' | 'manager' | 'executive';
export type RoleFocusSurface = 'horizon' | 'accounts' | 'account' | 'pipeline' | 'opportunity';

export interface RoleFocusCopy {
  role: RoleFocusRole;
  roleLabel: string;
  title: string;
  decision: string;
  signal: string;
  action: string;
}

const ROLE_LABELS: Record<RoleFocusRole, string> = {
  ae: 'AE',
  manager: '主管',
  executive: '高管',
};

const ROLE_LABELS_EN: Record<RoleFocusRole, string> = {
  ae: 'AE',
  manager: 'Manager',
  executive: 'Executive',
};

export function roleFocusRoleFromJobLevel(jobLevel: number | null | undefined): RoleFocusRole {
  if (typeof jobLevel === 'number' && jobLevel >= 2) return 'executive';
  if (typeof jobLevel === 'number' && jobLevel >= 1) return 'manager';
  return 'ae';
}

const FOCUS_COPY: Record<RoleFocusSurface, Record<RoleFocusRole, Omit<RoleFocusCopy, 'role' | 'roleLabel'>>> = {
  horizon: {
    executive: {
      title: '今天该做哪一个经营判断',
      decision: '先决定哪些客户影响预测、资源或高层介入，哪些只需要观察。',
      signal: '看风险商机、证据缺口、负责人和下一步授权。',
      action: '确认资源优先级，指定 owner，并要求补齐关键证据。',
    },
    manager: {
      title: '今天该校准哪一个团队判断',
      decision: '先判断哪位 AE 需要 coaching，哪一单阶段或证据不可信。',
      signal: '看卡住商机、逾期动作、关键人缺口和 owner。',
      action: '给出一个可验证的 coaching 动作，明确负责人和截止时间。',
    },
    ae: {
      title: '今天先推进哪一个客户局势',
      decision: '先决定今天联系谁、确认什么、把哪条证据补回来。',
      signal: '看我的下一步动作、风险商机、最近客户信号和待办。',
      action: '完成一个客户动作，并把结果回写为证据。',
    },
  },
  accounts: {
    executive: {
      title: '哪些客户需要资源介入',
      decision: '先决定哪些客户值得高层投入、哪些应该降级观察。',
      signal: '看风险客户、关系缺口、负责人和近期有效信号。',
      action: '确认资源优先级，必要时指定 sponsor 或 owner。',
    },
    manager: {
      title: '团队客户卡在哪里',
      decision: '先判断哪些客户需要 coaching、补证据或重新分配负责人。',
      signal: '看团队客户的活跃商机、健康度、紧急情报和最后动作。',
      action: '推动 AE 补齐关键关系和下一步承诺。',
    },
    ae: {
      title: '今天该推进哪个客户',
      decision: '先决定今天联系谁、补什么信息、推进哪一步。',
      signal: '看我的客户、最近信号、活跃商机和待确认关系。',
      action: '打开客户页，完成一个可验证的下一步动作。',
    },
  },
  account: {
    executive: {
      title: '这个客户是否需要高层介入',
      decision: '先判断它是否影响预测、资源投入或战略关系。',
      signal: '看当前局势、最大风险、关键人、证据可信度和 owner。',
      action: '确认是否介入、授权谁推进、要求补哪条证据。',
    },
    manager: {
      title: '这个客户的推进卡点是什么',
      decision: '先判断 AE 的下一步是否正确，关系和证据是否够。',
      signal: '看风险、关键人缺口、未验证问题和最近判断变化。',
      action: '给出 coaching 动作，明确 owner 和截止时间。',
    },
    ae: {
      title: '我今天怎么推进这个客户',
      decision: '先判断该找谁、问什么、拿到什么承诺。',
      signal: '看下一步动作、阻力点、联系人和最近客户回复。',
      action: '执行一条动作，或补一条 Decode/活动证据。',
    },
  },
  pipeline: {
    executive: {
      title: '预测是否可信',
      decision: '先判断哪些大单影响 forecast，哪些需要资源或高层介入。',
      signal: '看金额、阶段停留、风险商机、预计关单和加权金额。',
      action: '调整预测判断，指定关键单的资源介入方式。',
    },
    manager: {
      title: '团队管线哪里失真',
      decision: '先判断哪些商机阶段虚高、动作逾期或 owner 不清。',
      signal: '看阶段停留、健康度、下一步、负责人和 MEDDICC 缺口。',
      action: '推动阶段校准、补证据、清理逾期动作。',
    },
    ae: {
      title: '我的商机下一步是什么',
      decision: '先判断今天要推进哪一单、推进到哪个明确结果。',
      signal: '看我的商机、下一步、预计关单、风险和最近活动。',
      action: '更新下一步动作或推进一个阶段门槛。',
    },
  },
  opportunity: {
    executive: {
      title: '这单是否影响经营预测',
      decision: '先判断赢面是否可信，是否需要 sponsor、价格或资源授权。',
      signal: '看胜率、风险、经济决策人、竞争态势和执行承诺。',
      action: '确认是否介入，并要求团队补齐预测证据。',
    },
    manager: {
      title: '这单要不要校准打法',
      decision: '先判断阶段、MEDDICC 和执行计划是否支撑当前赢面。',
      signal: '看 champion、经济决策人、逾期节点、缺失条件和风险解释。',
      action: '给 AE 一个可验证的 coaching 动作。',
    },
    ae: {
      title: '这单今天怎么推进',
      decision: '先判断下一步要找谁、确认什么、推进哪个阶段门槛。',
      signal: '看最近信号、下一步、MEDDICC 缺口、内部推动者和会议准备。',
      action: '完成一个客户动作，并记录结果证据。',
    },
  },
};

const FOCUS_COPY_EN: typeof FOCUS_COPY = {
  horizon: {
    executive: {
      title: 'Which business judgment matters today',
      decision: 'Decide which accounts affect forecast, resources, or executive involvement.',
      signal: 'Review risky opportunities, evidence gaps, owners, and authorization needs.',
      action: 'Confirm resource priority, assign an owner, and require missing evidence.',
    },
    manager: {
      title: 'Which team judgment needs calibration today',
      decision: 'Identify which AE needs coaching and which deal stage or evidence is unreliable.',
      signal: 'Review stuck deals, overdue actions, relationship gaps, and owners.',
      action: 'Give one verifiable coaching action with owner and deadline.',
    },
    ae: {
      title: 'Which account should move first today',
      decision: 'Decide who to contact, what to confirm, and which evidence to recover.',
      signal: 'Review next actions, risky deals, recent customer updates, and tasks.',
      action: 'Complete one customer action and write the result back as evidence.',
    },
  },
  accounts: {
    executive: {
      title: 'Which accounts need resource involvement',
      decision: 'Decide which accounts deserve executive focus and which should be monitored.',
      signal: 'Review risk accounts, relationship gaps, owners, and recent valid signals.',
      action: 'Confirm resource priority and assign a sponsor or owner if needed.',
    },
    manager: {
      title: 'Where are team accounts stuck',
      decision: 'Identify accounts that need coaching, evidence, or owner reassignment.',
      signal: 'Review active deals, health, urgent intelligence, and last action.',
      action: 'Push the AE to close key relationship and next-step gaps.',
    },
    ae: {
      title: 'Which account should I advance today',
      decision: 'Decide who to contact, what to learn, and which step to advance.',
      signal: 'Review my accounts, recent signals, active deals, and unconfirmed relationships.',
      action: 'Open the account and complete one verifiable next action.',
    },
  },
  account: {
    executive: {
      title: 'Does this account need executive involvement',
      decision: 'Judge whether it affects forecast, resources, or strategic relationship.',
      signal: 'Review situation, biggest risk, key people, evidence confidence, and owner.',
      action: 'Confirm involvement, authorize ownership, and require missing evidence.',
    },
    manager: {
      title: 'Where is this account stuck',
      decision: 'Judge whether the AE next step, relationship, and evidence are strong enough.',
      signal: 'Review risks, key-person gaps, open questions, and recent judgment changes.',
      action: 'Give a coaching action with owner and deadline.',
    },
    ae: {
      title: 'How do I move this account today',
      decision: 'Judge who to ask, what to ask, and what commitment to secure.',
      signal: 'Review next action, blockers, contacts, and latest customer response.',
      action: 'Execute one action or add one Decode/activity evidence item.',
    },
  },
  pipeline: {
    executive: {
      title: 'Is the forecast credible',
      decision: 'Judge which large deals affect forecast and require resources or executives.',
      signal: 'Review amount, stage aging, risk deals, expected close, and weighted value.',
      action: 'Adjust forecast judgment and assign resource involvement for key deals.',
    },
    manager: {
      title: 'Where is the team pipeline distorted',
      decision: 'Find inflated stages, overdue actions, and unclear ownership.',
      signal: 'Review stage aging, health, next step, owner, and MEDDICC gaps.',
      action: 'Push stage calibration, evidence completion, and overdue cleanup.',
    },
    ae: {
      title: 'What is my next opportunity move',
      decision: 'Pick the deal to move today and the concrete result to reach.',
      signal: 'Review my deals, next step, expected close, risks, and recent activity.',
      action: 'Update next action or pass one stage gate.',
    },
  },
  opportunity: {
    executive: {
      title: 'Does this deal affect forecast',
      decision: 'Judge whether the win case is credible and whether sponsor, pricing, or resources need approval.',
      signal: 'Review probability, risk, economic buyer, competition, and execution commitments.',
      action: 'Confirm involvement and require the team to complete forecast evidence.',
    },
    manager: {
      title: 'Should this deal motion be recalibrated',
      decision: 'Judge whether stage, MEDDICC, and execution plan support the current win case.',
      signal: 'Review champion, economic buyer, overdue milestones, missing conditions, and risk explanation.',
      action: 'Give the AE one verifiable coaching action.',
    },
    ae: {
      title: 'How should this deal move today',
      decision: 'Judge who to contact next, what to confirm, and which stage gate to advance.',
      signal: 'Review recent signals, next step, MEDDICC gaps, champion, and meeting prep.',
      action: 'Complete one customer action and record the evidence.',
    },
  },
};

export function getRoleFocusCopy(surface: RoleFocusSurface, jobLevel: number | null | undefined, locale: 'zh' | 'en' = 'zh'): RoleFocusCopy {
  const role = roleFocusRoleFromJobLevel(jobLevel);
  const copy = locale === 'en' ? FOCUS_COPY_EN : FOCUS_COPY;
  const labels = locale === 'en' ? ROLE_LABELS_EN : ROLE_LABELS;
  return {
    role,
    roleLabel: labels[role],
    ...copy[surface][role],
  };
}
