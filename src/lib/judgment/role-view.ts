import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentActionPanelModel } from '@/lib/judgment/action-panel';
import type { DecodeStabilityTimelineItem } from '@/lib/judgment/decode-stability';
import type { AccountMomentumSnapshot } from '@/lib/judgment/momentum';
import type { JudgmentMemorySourceItem } from '@/lib/judgment/memory-sources';
import type { AccountOpenQuestion } from '@/lib/judgment/open-questions';
import type { JudgmentTimelineItem } from '@/lib/judgment/timeline';

export type RoleViewRole = 'ae' | 'manager' | 'executive';
export type RoleViewTone = 'accent' | 'warning' | 'positive' | 'muted';

export interface RoleViewCoreRefs {
  judgmentMemoryIds: string[];
  accountMomentumRef?: 'accountMomentum';
  openQuestionIds: string[];
  judgmentTimelineIds: string[];
  decodeStabilityTimelineIds: string[];
  sourceIds: string[];
  sourceRefs: JudgmentEvidenceRef[];
}

export interface RoleViewFocusItem {
  id: string;
  label: string;
  text: string;
  tone: RoleViewTone;
  coreRef?: string;
}

export interface RoleViewSuggestedAction {
  id: string;
  text: string;
  reason: string;
  coreRef?: string;
}

export interface RoleBasedJudgmentView {
  schemaVersion: 1;
  generatedFrom: 'judgment_core';
  role: RoleViewRole;
  roleLabel: string;
  header: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  emphasis: {
    currentJudgmentLabel: string;
    keyRiskLabel: string;
    nextActionLabel: string;
  };
  primaryFocus: {
    label: string;
    text: string;
    tone: RoleViewTone;
  };
  focusItems: RoleViewFocusItem[];
  suggestedActions: RoleViewSuggestedAction[];
  coreRefs: RoleViewCoreRefs;
}

export interface BuildRoleViewParams {
  role: RoleViewRole;
  judgmentMemories?: JudgmentMemorySourceItem[] | null;
  actionPanel?: Pick<JudgmentActionPanelModel, 'currentJudgment' | 'keyRisk' | 'nextAction' | 'evidence' | 'recentChanges'> | null;
  accountMomentum?: AccountMomentumSnapshot | null;
  openQuestions?: AccountOpenQuestion[] | null;
  judgmentTimeline?: JudgmentTimelineItem[] | null;
  decodeStabilityTimeline?: DecodeStabilityTimelineItem[] | null;
}

type BuildRoleViewCoreParams = Omit<BuildRoleViewParams, 'role'>;

const ROLE_LABELS: Record<RoleViewRole, string> = {
  ae: 'AE',
  manager: 'Manager',
  executive: 'Executive',
};

const FALLBACK_JUDGMENT = '还没有形成稳定判断；先补一条客户互动，避免凭感觉推进。';
const FALLBACK_RISK = '当前风险证据还薄，优先确认预算、采购路径和关键人态度。';
const FALLBACK_ACTION = '记录最新客户互动，或用 Decode 解析一封关键邮件。';

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

function roleSafeKey(value: string): string {
  return value.toLowerCase().replace(/[\s·・.。,_:：/\\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

function evidenceKey(ref: JudgmentEvidenceRef): string {
  return `${ref.sourceKind}:${ref.sourceTable ?? ''}:${ref.sourceRowId ?? ref.sourceId}`;
}

function collectCoreRefs(params: BuildRoleViewCoreParams): RoleViewCoreRefs {
  const judgmentMemories = params.judgmentMemories ?? [];
  const openQuestions = params.openQuestions ?? [];
  const judgmentTimeline = params.judgmentTimeline ?? [];
  const decodeStabilityTimeline = params.decodeStabilityTimeline ?? [];

  const sourceIds: string[] = [];
  const seenSourceIds = new Set<string>();
  const pushSourceId = (sourceId?: string) => {
    const cleaned = cleanText(sourceId);
    if (!cleaned || seenSourceIds.has(cleaned)) return;
    seenSourceIds.add(cleaned);
    sourceIds.push(cleaned);
  };
  const sourceRefs: JudgmentEvidenceRef[] = [];
  const seenSourceRefs = new Set<string>();
  const pushRefs = (refs?: JudgmentEvidenceRef[]) => {
    for (const ref of refs ?? []) {
      if (!ref.sourceId) continue;
      pushSourceId(ref.sourceId);
      const key = evidenceKey(ref);
      if (seenSourceRefs.has(key)) continue;
      seenSourceRefs.add(key);
      sourceRefs.push(ref);
    }
  };

  pushRefs(params.accountMomentum?.evidenceRefs);
  for (const item of judgmentMemories) {
    pushSourceId(item.sourceId);
    pushRefs(item.evidenceRefs);
  }
  for (const item of openQuestions) pushRefs(item.evidenceRefs);
  for (const item of judgmentTimeline) {
    pushSourceId(item.sourceId);
    pushRefs(item.evidenceRefs);
  }
  for (const item of decodeStabilityTimeline) pushSourceId(item.sourceId);

  return {
    judgmentMemoryIds: judgmentMemories.map((item) => item.id),
    accountMomentumRef: params.accountMomentum ? 'accountMomentum' : undefined,
    openQuestionIds: openQuestions.map((item) => item.id),
    judgmentTimelineIds: judgmentTimeline.map((item) => item.id),
    decodeStabilityTimelineIds: decodeStabilityTimeline.map((item) => item.id),
    sourceIds,
    sourceRefs,
  };
}

function topQuestion(openQuestions: AccountOpenQuestion[]): AccountOpenQuestion | undefined {
  const priorityRank: Record<AccountOpenQuestion['priority'], number> = { high: 3, medium: 2, low: 1 };
  return [...openQuestions].sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])[0];
}

function unstableDecode(decodeStabilityTimeline: DecodeStabilityTimelineItem[]): DecodeStabilityTimelineItem | undefined {
  return decodeStabilityTimeline.find((item) => item.status === 'unstable' || item.status === 'context_changed');
}

function latestTimeline(judgmentTimeline: JudgmentTimelineItem[]): JudgmentTimelineItem | undefined {
  return judgmentTimeline[0];
}

function makeFocusItem(params: { id: string; label: string; text?: string; tone?: RoleViewTone; coreRef?: string }): RoleViewFocusItem | null {
  const text = cleanText(params.text);
  if (!text) return null;
  return {
    id: params.id,
    label: params.label,
    text,
    tone: params.tone ?? 'accent',
    coreRef: params.coreRef,
  };
}

function buildAeView(params: BuildRoleViewCoreParams & { coreRefs: RoleViewCoreRefs }): RoleBasedJudgmentView {
  const openQuestions = params.openQuestions ?? [];
  const question = topQuestion(openQuestions);
  const decodeChange = unstableDecode(params.decodeStabilityTimeline ?? []);
  const keyRisk = firstNonEmpty(params.actionPanel?.keyRisk, params.accountMomentum?.biggestTension, params.judgmentMemories?.[0]?.risk, FALLBACK_RISK);
  const nextAction = firstNonEmpty(params.actionPanel?.nextAction, params.accountMomentum?.nextAction, params.judgmentMemories?.[0]?.nextAction, question?.nextVerificationAction, FALLBACK_ACTION);
  const focusItems = [
    makeFocusItem({ id: 'ae-next-action', label: '今天先推进', text: nextAction, tone: 'positive', coreRef: params.accountMomentum ? 'accountMomentum' : params.judgmentMemories?.[0]?.id }),
    makeFocusItem({ id: 'ae-open-question', label: question?.whoToAsk?.name ? `找 ${question.whoToAsk.name} 确认` : '先补关键问题', text: firstNonEmpty(question?.question, question?.nextVerificationAction), tone: question?.priority === 'high' ? 'warning' : 'accent', coreRef: question?.id }),
    makeFocusItem({ id: 'ae-risk', label: '推进前别忽略', text: keyRisk, tone: 'warning', coreRef: params.judgmentMemories?.[0]?.id }),
    makeFocusItem({ id: 'ae-decode-change', label: 'Decode 变化', text: decodeChange ? `${decodeChange.statusLabel}：${decodeChange.currentJudgment}` : '', tone: 'warning', coreRef: decodeChange?.id }),
  ].filter((item): item is RoleViewFocusItem => Boolean(item)).slice(0, 4);

  return {
    schemaVersion: 1,
    generatedFrom: 'judgment_core',
    role: 'ae',
    roleLabel: ROLE_LABELS.ae,
    header: {
      eyebrow: 'AE 判断投影',
      title: '今天该推进哪一步、找谁确认、怎么降风险',
      subtitle: '同一套 Judgment Core，只把首屏压成一线可执行语言。',
    },
    emphasis: {
      currentJudgmentLabel: '我现在该相信什么',
      keyRiskLabel: '我今天要拆的风险',
      nextActionLabel: '我的下一步动作',
    },
    primaryFocus: { label: '推进焦点', text: nextAction, tone: 'positive' },
    focusItems,
    suggestedActions: [
      { id: 'ae-send-confirmation', text: nextAction, reason: '把判断转成客户或 champion 能回应的具体动作。', coreRef: params.accountMomentum ? 'accountMomentum' : undefined },
      { id: 'ae-answer-question', text: question?.nextVerificationAction ?? '补一条客户回复或会议纪要来验证当前判断。', reason: question?.whyItMatters ?? '当前判断还需要更近的证据。', coreRef: question?.id },
    ],
    coreRefs: params.coreRefs,
  };
}

function buildManagerView(params: BuildRoleViewCoreParams & { coreRefs: RoleViewCoreRefs }): RoleBasedJudgmentView {
  const openQuestions = params.openQuestions ?? [];
  const question = topQuestion(openQuestions);
  const latest = latestTimeline(params.judgmentTimeline ?? []);
  const currentJudgment = firstNonEmpty(params.actionPanel?.currentJudgment, params.accountMomentum?.currentJudgment, params.judgmentMemories?.[0]?.currentJudgment, FALLBACK_JUDGMENT);
  const keyRisk = firstNonEmpty(params.actionPanel?.keyRisk, params.accountMomentum?.biggestTension, question?.whyItMatters, params.judgmentMemories?.[0]?.risk, FALLBACK_RISK);
  const nextAction = firstNonEmpty(question?.nextVerificationAction, params.actionPanel?.nextAction, params.accountMomentum?.nextAction, FALLBACK_ACTION);
  const focusItems = [
    makeFocusItem({ id: 'manager-coaching-risk', label: '需要辅导的卡点', text: keyRisk, tone: 'warning', coreRef: question?.id ?? params.judgmentMemories?.[0]?.id }),
    makeFocusItem({ id: 'manager-next-coaching', label: '建议 coaching 动作', text: nextAction, tone: 'accent', coreRef: question?.id }),
    makeFocusItem({ id: 'manager-current-read', label: '团队当前判断', text: currentJudgment, tone: 'muted', coreRef: params.accountMomentum ? 'accountMomentum' : undefined }),
    makeFocusItem({ id: 'manager-recent-change', label: '最近变化', text: latest ? `${latest.title}：${latest.summary}` : '', tone: latest?.kind === 'feedback' ? 'warning' : 'accent', coreRef: latest?.id }),
  ].filter((item): item is RoleViewFocusItem => Boolean(item)).slice(0, 4);

  return {
    schemaVersion: 1,
    generatedFrom: 'judgment_core',
    role: 'manager',
    roleLabel: ROLE_LABELS.manager,
    header: {
      eyebrow: 'Manager 判断投影',
      title: '团队卡在哪里、哪条判断需要你介入校准',
      subtitle: '同一套 Judgment Core，只突出团队辅导、证据薄弱处和风险升级点。',
    },
    emphasis: {
      currentJudgmentLabel: '团队当前判断',
      keyRiskLabel: '需要我帮 AE 拆的卡点',
      nextActionLabel: '建议的 coaching 动作',
    },
    primaryFocus: { label: '辅导焦点', text: keyRisk, tone: 'warning' },
    focusItems,
    suggestedActions: [
      { id: 'manager-review-risk', text: `和 AE 复盘：${keyRisk}`, reason: '先确认判断是不是被旧证据或单一来源带偏。', coreRef: question?.id },
      { id: 'manager-coach-next-step', text: nextAction, reason: '把卡点拆成可验证动作，避免团队只讨论感觉。', coreRef: question?.id },
    ],
    coreRefs: params.coreRefs,
  };
}

function buildExecutiveView(params: BuildRoleViewCoreParams & { coreRefs: RoleViewCoreRefs }): RoleBasedJudgmentView {
  const latest = latestTimeline(params.judgmentTimeline ?? []);
  const currentJudgment = firstNonEmpty(params.actionPanel?.currentJudgment, params.accountMomentum?.currentJudgment, params.judgmentMemories?.[0]?.currentJudgment, FALLBACK_JUDGMENT);
  const keyRisk = firstNonEmpty(params.actionPanel?.keyRisk, params.accountMomentum?.biggestTension, params.openQuestions?.[0]?.whyItMatters, FALLBACK_RISK);
  const nextAction = firstNonEmpty(params.actionPanel?.nextAction, params.accountMomentum?.nextAction, params.openQuestions?.[0]?.nextVerificationAction, FALLBACK_ACTION);
  const evidenceLabel = firstNonEmpty(params.actionPanel?.evidence.label, params.accountMomentum?.confidence ? `置信度 ${Math.round(params.accountMomentum.confidence * 100)}%` : '');
  const focusItems = [
    makeFocusItem({ id: 'executive-forecast-risk', label: '预测风险', text: keyRisk, tone: 'warning', coreRef: params.accountMomentum ? 'accountMomentum' : undefined }),
    makeFocusItem({ id: 'executive-resource-action', label: '资源/赞助动作', text: nextAction, tone: 'positive', coreRef: params.openQuestions?.[0]?.id }),
    makeFocusItem({ id: 'executive-current-read', label: '经营层判断', text: currentJudgment, tone: 'muted', coreRef: params.accountMomentum ? 'accountMomentum' : undefined }),
    makeFocusItem({ id: 'executive-change', label: '最近影响判断的变化', text: latest ? `${latest.title}：${latest.summary}` : '', tone: latest?.kind === 'win_loss_calibration' ? 'positive' : 'accent', coreRef: latest?.id }),
  ].filter((item): item is RoleViewFocusItem => Boolean(item)).slice(0, 4);

  return {
    schemaVersion: 1,
    generatedFrom: 'judgment_core',
    role: 'executive',
    roleLabel: ROLE_LABELS.executive,
    header: {
      eyebrow: 'Executive 判断投影',
      title: '哪些客户判断会影响预测、资源和高层介入',
      subtitle: '同一套 Judgment Core，只保留经营风险、预测可信度和资源动作。',
    },
    emphasis: {
      currentJudgmentLabel: '经营层判断',
      keyRiskLabel: '预测风险',
      nextActionLabel: '资源/赞助动作',
    },
    primaryFocus: { label: evidenceLabel || '经营焦点', text: keyRisk, tone: 'warning' },
    focusItems,
    suggestedActions: [
      { id: 'executive-sponsor-check', text: `判断是否需要 executive sponsor 介入：${keyRisk}`, reason: '如果风险影响预测，就不应只留在 AE 层处理。', coreRef: params.accountMomentum ? 'accountMomentum' : undefined },
      { id: 'executive-resource-next', text: nextAction, reason: '把下一步动作对齐到资源、赞助或预测承诺。', coreRef: params.openQuestions?.[0]?.id },
    ],
    coreRefs: params.coreRefs,
  };
}

export function buildRoleViewsForCore(params: BuildRoleViewCoreParams): Record<RoleViewRole, RoleBasedJudgmentView> {
  const coreRefs = collectCoreRefs(params);
  const coreParams = { ...params, coreRefs };
  return {
    ae: buildAeView(coreParams),
    manager: buildManagerView(coreParams),
    executive: buildExecutiveView(coreParams),
  };
}

export function buildRoleView(params: BuildRoleViewParams): RoleBasedJudgmentView {
  return buildRoleViewsForCore(params)[params.role];
}

export function roleViewRoleFromJobLevel(jobLevel: number | null | undefined): RoleViewRole {
  if (typeof jobLevel === 'number' && jobLevel >= 2) return 'executive';
  if (typeof jobLevel === 'number' && jobLevel >= 1) return 'manager';
  return 'ae';
}

export function parseRoleViewRole(value: unknown): RoleViewRole | null {
  const role = cleanText(value).toLowerCase();
  if (role === 'ae' || role === 'manager' || role === 'executive') return role;
  return null;
}

export function roleViewCacheKey(role: RoleViewRole): string {
  return `role-view:${roleSafeKey(role)}`;
}
