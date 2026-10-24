import type { Account, Contact } from '@/lib/babel-engine/types';
import type { RoleBasedJudgmentView } from '@/lib/judgment/role-view';

export type AccountCommandViewCardTone = 'accent' | 'warning' | 'positive' | 'muted';

export interface AccountCommandViewCard {
  label: string;
  value: string;
  meta?: string;
  tone: AccountCommandViewCardTone;
  feedbackTargetId: 'key_judgment' | 'key_risk' | 'next_action' | 'relationship_coverage';
}

export interface AccountRelationshipCoverageState {
  score: number;
  label: string;
  gaps: string[];
}

export interface AccountCommandViewQueueItem {
  id: string;
  label: string;
  text: string;
  reason?: string;
  tone: AccountCommandViewCardTone;
  feedbackTargetId: string;
}

export interface AccountCommandViewModel {
  eyebrow: string;
  title: string;
  subtitle: string;
  cards: AccountCommandViewCard[];
  decisionQueue: AccountCommandViewQueueItem[];
  evidenceSummary: string;
  uncertaintySummary: string;
  visibilitySummary: string;
  latestFeedbackSummary?: string;
  isRefreshing: boolean;
}

const KEY_CONTACT_ROLES = new Set<Contact['role']>([
  'champion',
  'coach',
  'decision_maker',
  'economic_buyer',
  'executive_sponsor',
  'procurement',
]);

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function uniqueQueueItems(items: AccountCommandViewQueueItem[]): AccountCommandViewQueueItem[] {
  const seen = new Set<string>();
  const result: AccountCommandViewQueueItem[] = [];
  for (const item of items) {
    const key = cleanText(item.text).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.slice(0, 5);
}

export function getAccountRelationshipCoverageState(account: Pick<Account, 'contacts'>): AccountRelationshipCoverageState {
  const contacts = account.contacts ?? [];
  const roles = new Set(contacts.map((contact) => contact.role).filter(Boolean));
  const hasChampion = roles.has('champion') || roles.has('coach');
  const hasDecisionAccess = roles.has('decision_maker') || roles.has('economic_buyer') || roles.has('executive_sponsor');
  const hasProcurement = roles.has('procurement') || roles.has('legal') || roles.has('finance');
  const recentlyTouched = contacts.some((contact) => Boolean(contact.lastContactedAt));
  const keyContactCount = contacts.filter((contact) => contact.role && KEY_CONTACT_ROLES.has(contact.role)).length;

  const score = Math.min(
    100,
    contacts.length * 10
      + keyContactCount * 8
      + (hasChampion ? 22 : 0)
      + (hasDecisionAccess ? 24 : 0)
      + (hasProcurement ? 12 : 0)
      + (recentlyTouched ? 14 : 0),
  );

  const gaps: string[] = [];
  if (!hasChampion) gaps.push('Champion 未确认');
  if (!hasDecisionAccess) gaps.push('决策/预算路径未覆盖');
  if (!hasProcurement) gaps.push('采购或流程角色未覆盖');
  if (!recentlyTouched) gaps.push('缺少近期触达记录');

  return {
    score,
    label: score >= 80 ? '覆盖充分' : score >= 55 ? '需要补强' : '覆盖薄弱',
    gaps: gaps.slice(0, 2),
  };
}

export function buildAccountCommandViewModel(params: {
  account: Pick<Account, 'contacts'>;
  roleView: RoleBasedJudgmentView | null;
  fallbackJudgment: string;
  fallbackRisk: string;
  fallbackNextAction: string;
  ownerName: string;
  evidenceCount: number;
  openQuestionCount: number;
  activeOpportunityCount: number;
  nextTaskTitle?: string;
  latestFeedbackSummary?: string;
  loading: boolean;
}): AccountCommandViewModel {
  const currentRead = params.roleView?.focusItems.find((item) => item.id.includes('current-read'))?.text;
  const warningFocus = params.roleView?.focusItems.find((item) => item.tone === 'warning')?.text;
  const relationshipCoverage = getAccountRelationshipCoverageState(params.account);
  const currentJudgment = firstNonEmpty(
    params.fallbackJudgment,
    currentRead,
    params.roleView?.primaryFocus.text,
    '当前还没有稳定客户判断，先补一条客户沟通或会议记录。',
  );
  const riskText = firstNonEmpty(
    warningFocus,
    params.fallbackRisk,
    relationshipCoverage.gaps[0],
    '暂未发现明显矛盾；仍需用下一次客户反馈确认判断没有过期。',
  );
  const nextAction = firstNonEmpty(
    params.roleView?.suggestedActions[0]?.text,
    params.fallbackNextAction,
    params.nextTaskTitle,
    '记录一次客户反馈或 Decode 结果，先让系统形成可验证判断。',
  );

  const cards: AccountCommandViewCard[] = [
    { label: '关键判断', value: currentJudgment, tone: 'accent', feedbackTargetId: 'key_judgment' },
    { label: '关键风险', value: riskText, tone: params.openQuestionCount > 0 ? 'warning' : 'muted', feedbackTargetId: 'key_risk' },
    { label: '下一步动作', value: nextAction, meta: params.nextTaskTitle ? `最近任务：${params.nextTaskTitle}` : undefined, tone: 'positive', feedbackTargetId: 'next_action' },
    {
      label: '关系覆盖',
      value: `${relationshipCoverage.score} · ${relationshipCoverage.label}`,
      meta: relationshipCoverage.gaps.length > 0 ? relationshipCoverage.gaps.join(' / ') : '关键角色已覆盖',
      tone: relationshipCoverage.score >= 80 ? 'positive' : relationshipCoverage.score >= 55 ? 'warning' : 'muted',
      feedbackTargetId: 'relationship_coverage',
    },
  ];
  const decisionQueue = uniqueQueueItems([
    ...(params.roleView?.focusItems ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      text: item.text,
      tone: item.tone,
      feedbackTargetId: `focus:${item.id}`,
    })),
    ...(params.roleView?.suggestedActions ?? []).map((item) => ({
      id: item.id,
      label: '建议动作',
      text: item.text,
      reason: item.reason,
      tone: 'positive' as const,
      feedbackTargetId: `action:${item.id}`,
    })),
  ]);

  return {
    eyebrow: params.roleView?.header.eyebrow ?? 'Account Command View',
    title: params.roleView?.header.title ?? '客户首屏决策视图',
    subtitle: params.roleView?.header.subtitle ?? '把判断、风险、关系覆盖、下一步和证据状态压到一个可行动首屏。',
    isRefreshing: params.loading,
    cards,
    decisionQueue,
    evidenceSummary: `证据痕迹：${Math.max(0, params.evidenceCount)} 条`,
    uncertaintySummary: params.openQuestionCount > 0
      ? `待验证问题：${params.openQuestionCount} 个`
      : '待验证问题：暂无高优先级缺口',
    visibilitySummary: `当前视角：${params.roleView?.roleLabel ?? '账户'} · 负责人 ${params.ownerName} · ${params.activeOpportunityCount} 个活跃商机纳入判断`,
    latestFeedbackSummary: cleanText(params.latestFeedbackSummary).slice(0, 140) || undefined,
  };
}
