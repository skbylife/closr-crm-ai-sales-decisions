export type JudgmentTraceContext = 'account' | 'pipeline' | 'tasks' | 'plays';

export interface JudgmentTraceNarrativeModel {
  context: JudgmentTraceContext;
  title: string;
  subtitle: string;
  currentJudgment: string;
  evidenceTrace: string;
  uncertainty: string;
  nextCalibrationAction: string;
  evidenceLabels: string[];
  cta?: {
    label: string;
    href: string;
  };
}

function countLabel(count: number, unit: string): string {
  return `${Math.max(0, count)} ${unit}`;
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const text = cleanText(label);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result.slice(0, 4);
}

const SHARED_SUBTITLE = '把零散信号整理成可验证的销售判断：现在怎么看、依据是什么、哪里不确定、下一步怎么校准。';

export function buildAccountTraceNarrative(params: {
  currentJudgment?: string | null;
  evidenceSourceCount: number;
  evidenceLabels?: string[] | null;
  conflictCount: number;
  openQuestionCount: number;
  activeOpportunityCount: number;
  activeTaskCount: number;
  nextAction?: string | null;
  accountId?: string;
}): JudgmentTraceNarrativeModel {
  const currentJudgment = cleanText(params.currentJudgment)
    || (params.activeOpportunityCount > 0
      ? `当前有 ${countLabel(params.activeOpportunityCount, '个活跃商机')}，需要把机会状态和客户互动放在一起判断。`
      : '当前还没有稳定客户判断，先补一条客户沟通或会议记录。');

  const evidenceTrace = params.evidenceSourceCount > 0
    ? `已沉淀 ${countLabel(params.evidenceSourceCount, '条判断痕迹')}，来源包括 ${uniqueLabels(params.evidenceLabels ?? []).join('、') || '客户动态、任务或谋局记录'}。`
    : '还缺少可追踪来源；现在看到的是空白判断，不是客户真的没有风险。';

  const uncertaintyParts = [];
  if (params.conflictCount > 0) uncertaintyParts.push(`${countLabel(params.conflictCount, '个矛盾信号')}`);
  if (params.openQuestionCount > 0) uncertaintyParts.push(`${countLabel(params.openQuestionCount, '个待验证问题')}`);
  const uncertainty = uncertaintyParts.length > 0
    ? `${uncertaintyParts.join('、')}还没有被校准，先不要把这单当成确定结论。`
    : '暂未发现明显矛盾；仍需用下一次客户反馈确认判断没有过期。';

  return {
    context: 'account',
    title: '可信判断层',
    subtitle: SHARED_SUBTITLE,
    currentJudgment,
    evidenceTrace,
    uncertainty,
    nextCalibrationAction: cleanText(params.nextAction) || `优先推进 ${params.activeTaskCount > 0 ? countLabel(params.activeTaskCount, '个未完成任务') : '下一次客户触达'}，并把结果回写到客户判断。`,
    evidenceLabels: uniqueLabels(params.evidenceLabels ?? []),
    cta: params.accountId ? { label: '查看判断工作台', href: `/accounts/${encodeURIComponent(params.accountId)}?tab=overview` } : undefined,
  };
}

export function buildPipelineTraceNarrative(params: {
  activeDealCount: number;
  atRiskDealCount: number;
  overdueTaskCount: number;
  uncoveredDealCount: number;
  playCoveredDealCount: number;
}): JudgmentTraceNarrativeModel {
  const hasDeals = params.activeDealCount > 0;
  return {
    context: 'pipeline',
    title: '管线判断层',
    subtitle: SHARED_SUBTITLE,
    currentJudgment: hasDeals
      ? `当前管线有 ${countLabel(params.activeDealCount, '个活跃商机')}；真正要盯的是哪些判断正在变弱，而不只是金额。`
      : '当前没有活跃商机；先建立客户机会，再沉淀判断痕迹。',
    evidenceTrace: `已看到 ${countLabel(params.playCoveredDealCount, '个商机')}有关联谋局，${countLabel(params.atRiskDealCount, '个商机')}显示推进风险。`,
    uncertainty: params.uncoveredDealCount > 0
      ? `${countLabel(params.uncoveredDealCount, '个商机')}缺少谋局覆盖，胜率可能只是表层概率。`
      : '活跃商机都有谋局覆盖；下一步要验证这些谋局是否真的推动客户变化。',
    nextCalibrationAction: params.overdueTaskCount > 0
      ? `先处理 ${countLabel(params.overdueTaskCount, '个逾期任务')}，用执行结果校准商机健康度。`
      : '选一个本月最重要商机，补充最近客户反馈来校准健康度。',
    evidenceLabels: ['商机阶段', '谋局覆盖', '任务执行'],
  };
}

export function buildTasksTraceNarrative(params: {
  totalTaskCount: number;
  activeTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  inProgressTaskCount: number;
  playLinkedTaskCount: number;
}): JudgmentTraceNarrativeModel {
  const riskCount = params.overdueTaskCount + params.blockedTaskCount;
  return {
    context: 'tasks',
    title: '任务校准层',
    subtitle: SHARED_SUBTITLE,
    currentJudgment: params.activeTaskCount > 0
      ? `${countLabel(params.activeTaskCount, '个未完成任务')}正在决定客户判断会被验证还是失效。`
      : '当前没有未完成任务；需要确认关键客户判断是否已有下一步动作承接。',
    evidenceTrace: `任务看板记录了 ${countLabel(params.totalTaskCount, '项任务')}，其中 ${countLabel(params.playLinkedTaskCount, '项')}能连回谋局或客户推进。`,
    uncertainty: riskCount > 0
      ? `${countLabel(riskCount, '项逾期/阻塞任务')}会让系统判断变旧，需要人工确认真实原因。`
      : `${countLabel(params.inProgressTaskCount, '项任务')}正在执行；还需要用完成结果证明判断是否正确。`,
    nextCalibrationAction: riskCount > 0
      ? '先处理最早逾期或被阻塞的任务，并把完成/受阻原因写回客户判断。'
      : '完成一个关键任务后，记录它对客户风险、动量或下一步动作的影响。',
    evidenceLabels: ['任务状态', '截止日期', '谋局关联'],
  };
}

export function buildPlaysTraceNarrative(params: {
  activePlayCount: number;
  blockedOrStalledCount: number;
  relationshipConflictCount: number;
  uncoveredAccountCount: number;
  locale?: 'zh' | 'en';
}): JudgmentTraceNarrativeModel {
  if (params.locale === 'en') {
    return {
      context: 'plays',
      title: 'Play Judgment Notes',
      subtitle: 'This explains why the current plays matter, where the evidence comes from, and what still needs validation. It is collapsed by default to keep the board readable.',
      currentJudgment: params.activePlayCount > 0
        ? `${countLabel(params.activePlayCount, 'active plays')} are turning account-change hypotheses into executable validation paths.`
        : 'There are no active plays yet. Start with the most important account and create a verifiable advancement hypothesis.',
      evidenceTrace: `Closr has recorded play momentum and step relationships; ${countLabel(params.blockedOrStalledCount, 'plays')} are blocked or stalled and need a real-cause review.`,
      uncertainty: params.relationshipConflictCount > 0
        ? `${countLabel(params.relationshipConflictCount, 'play relationship conflicts')} need dependency review before activity is mistaken for progress.`
        : params.uncoveredAccountCount > 0
          ? `${countLabel(params.uncoveredAccountCount, 'accounts')} still have no active play, so key judgment may remain in people’s heads instead of being tracked.`
          : 'No play relationship conflict is visible yet. Next, validate whether each key step changes the customer situation instead of just completing an action.',
      nextCalibrationAction: params.blockedOrStalledCount > 0
        ? 'Review blocked plays first: which assumption was wrong, what evidence is missing, and who should calibrate the next step.'
        : 'Pick one high-value play and write the next action result back into Closr so real feedback can calibrate account judgment.',
      evidenceLabels: ['Play momentum', 'Step execution', 'Relationship conflicts'],
    };
  }
  return {
    context: 'plays',
    title: '谋局判断说明',
    subtitle: '这块说明当前谋局为什么值得推进、依据来自哪里、还缺什么验证；默认收起，避免干扰看板主体。',
    currentJudgment: params.activePlayCount > 0
      ? `${countLabel(params.activePlayCount, '个活跃谋局')}正在把“客户可能会怎么变”拆成可执行的验证路线。`
      : '当前暂无活跃谋局；先为最重要客户建立一条可验证的推进假设。',
    evidenceTrace: `系统已记录谋局动量和步骤执行关系；其中 ${countLabel(params.blockedOrStalledCount, '个谋局')}出现受阻或停滞，需要复盘真实原因。`,
    uncertainty: params.relationshipConflictCount > 0
      ? `${countLabel(params.relationshipConflictCount, '个谋局关系冲突')}需要先看清依赖和反向影响，否则容易把动作误判成进展。`
      : params.uncoveredAccountCount > 0
        ? `${countLabel(params.uncoveredAccountCount, '个客户')}还没有活跃谋局，关键判断可能仍停留在人的脑中，没有被系统追踪。`
        : '暂未发现谋局关系冲突；下一步要验证每个关键步骤是否真的改变客户局势，而不是只完成了动作。',
    nextCalibrationAction: params.blockedOrStalledCount > 0
      ? '优先复盘受阻谋局：哪条假设错了、缺哪条证据、下一步由谁去校准。'
      : '选择一个高价值谋局，把下一步行动结果写回系统，用真实反馈校准客户判断。',
    evidenceLabels: ['谋局动量', '步骤执行', '关系冲突'],
  };
}
