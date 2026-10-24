import type { AccountOpenQuestion } from '@/lib/judgment/open-questions';
import type { JudgmentFeedbackTarget } from '@/lib/judgment/feedback';
import { normalizeProductLocale, type ProductLocale } from '@/lib/locale-contract';

export type JudgmentReviewPrimaryAction = 'confirm_judgment' | 'ask_customer' | 'correct_judgment';
export type JudgmentReviewConfidenceBucket = 'low' | 'medium' | 'high';
export type JudgmentReviewState = 'refreshing' | 'ready' | 'empty';

export interface JudgmentReviewLoopModel {
  state: JudgmentReviewState;
  title: string;
  body: string;
  keyJudgment: string;
  confirmationPrompt: string;
  reasonToCheck: string;
  confidenceBucket: JudgmentReviewConfidenceBucket;
  confidenceLabel: string;
  evidenceLabel: string;
  uncertaintyLabel: string;
  primaryAction: JudgmentReviewPrimaryAction;
  assumption: string;
  askTarget: string;
  askQuestion: string;
  messageDraft: string;
  feedbackTarget: {
    targetType: JudgmentFeedbackTarget;
    targetId: string;
    previousSummary: string;
  };
  telemetry: {
    eventName: 'judgment_review_shown';
    state: JudgmentReviewState;
    confidenceBucket: JudgmentReviewConfidenceBucket;
    hasOpenQuestion: boolean;
    sourceCount: number;
  };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function isGenericReviewText(value: string): boolean {
  return /^(review customer evidence|review supporting evidence|customer evidence)$/i.test(cleanText(value));
}

function specificText(value: unknown, fallback: string): string {
  const text = cleanText(value);
  return text && !isGenericReviewText(text) ? text : fallback;
}

function compactText(value: string, fallback: string, maxLength = 110): string {
  const text = specificText(value, fallback);
  if (text.length <= maxLength) return text;
  const firstSentence = text.split(/[。！？.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length >= 12 && firstSentence.length <= maxLength) {
    return firstSentence;
  }
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

function clampConfidence(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0.62;
  return Math.max(0, Math.min(1, Number(value)));
}

function confidenceBucket(confidence: number): JudgmentReviewConfidenceBucket {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

function confidenceLabel(confidence: number): string {
  return '把握度：' + Math.round(confidence * 100) + '%';
}

function confidenceLabelEn(confidence: number): string {
  return 'Confidence: ' + Math.round(confidence * 100) + '%';
}

function l(locale: ProductLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh;
}

function openQuestionPriority(question?: Pick<AccountOpenQuestion, 'priority'> | null): 'high' | 'medium' | 'low' | null {
  return question?.priority ?? null;
}

export function buildJudgmentReviewLoopModel(params: {
  currentSituation: string;
  accountId: string;
  accountName: string;
  confidence?: number;
  evidenceCount: number;
  topEvidenceLabel?: string;
  primaryQuestion?: Pick<AccountOpenQuestion, 'id' | 'question' | 'whyItMatters' | 'priority'> | null;
  askTarget?: string;
  messageDraft?: string;
  refreshing?: boolean;
  locale?: ProductLocale;
}): JudgmentReviewLoopModel {
  const locale = normalizeProductLocale(params.locale);
  const currentSituation = specificText(params.currentSituation, l(locale, params.accountName + ' 当前还缺少足够客户信号，先补一条真实沟通或会议记录。', params.accountName + ' still needs more customer evidence. Add one real conversation or meeting note first.'));
  const confidence = clampConfidence(params.confidence);
  const bucket = confidenceBucket(confidence);
  const question = params.primaryQuestion;
  const askQuestion = specificText(question?.question, l(locale, '下一步最该验证的客户事实是什么？', 'Which customer fact should be verified next?'));
  const assumption = specificText(question?.whyItMatters, askQuestion);
  const hasHighPriorityQuestion = openQuestionPriority(question) === 'high';
  const hasOpenQuestion = Boolean(question);
  const primaryAction: JudgmentReviewPrimaryAction = bucket === 'low' || hasHighPriorityQuestion
    ? 'ask_customer'
    : bucket === 'high' && !hasOpenQuestion
      ? 'confirm_judgment'
      : 'ask_customer';
  const sourceCount = Math.max(0, params.evidenceCount);
  const state: JudgmentReviewState = params.refreshing ? 'refreshing' : sourceCount > 0 || hasOpenQuestion ? 'ready' : 'empty';
  const keyJudgment = state === 'refreshing'
    ? l(locale, '正在刷新账户判断，先等最新客户信号回来。', 'Refreshing account judgment. Wait for the latest customer evidence first.')
    : state === 'empty'
      ? l(locale, '当前证据不足，还不能形成可靠判断。', 'There is not enough evidence yet for a reliable judgment.')
      : compactText(currentSituation, l(locale, params.accountName + ' 当前最关键判断待确认。', params.accountName + "'s key judgment needs confirmation."), 96);
  const confirmationPrompt = state === 'refreshing'
    ? l(locale, '刷新完成后，再确认判断是否成立。', 'Confirm whether the judgment holds after refresh.')
    : state === 'empty'
      ? l(locale, '先补一条真实客户信号，再判断。', 'Add one real customer evidence item before judging.')
      : hasOpenQuestion
        ? compactText(askQuestion, l(locale, '这条判断是否符合客户真实情况？', 'Does this judgment match the real customer situation?'), 64)
        : l(locale, '这条判断是否符合当前客户真实情况？', 'Does this judgment match the current customer reality?');
  const reasonToCheck = state === 'refreshing'
    ? l(locale, '避免把旧证据或缺证据误当成最终结论。', 'Avoid treating old or missing evidence as the final conclusion.')
    : state === 'empty'
      ? l(locale, '没有一手信号时，系统只能给泛化建议。', 'Without first-hand signals, the system can only provide generic advice.')
      : compactText(assumption, l(locale, '它会影响下一步该找谁、说什么、是否投入资源。', 'It affects who to ask, what to say, and whether to commit resources.'), 72);
  const body = state === 'refreshing'
    ? l(locale, '正在刷新账户判断。先不把“缺证据”当成结论，等最新客户信号回来后再让你确认。', 'Refreshing account judgment. Do not treat missing evidence as a conclusion; confirm after the latest customer evidence returns.')
    : state === 'empty'
      ? l(locale, '我还没有足够证据形成可靠判断。下一步应该先补一条真实客户信号，再决定是否推进谋局。', 'There is not enough evidence for a reliable judgment yet. Add one real customer evidence item before deciding whether to advance a play.')
      : keyJudgment;
  const uncertaintyLabel = state === 'refreshing'
    ? l(locale, '最大缺口：等待最新账户信号刷新', 'Largest gap: waiting for latest account signals')
    : hasOpenQuestion
      ? l(locale, '待确认：', 'To confirm: ') + compactText(askQuestion, l(locale, '这条判断是否符合客户真实情况？', 'Does this judgment match customer reality?'), 56)
      : state === 'empty'
        ? l(locale, '最大缺口：缺少可验证的一手客户信号', 'Largest gap: missing verifiable first-hand customer evidence')
        : l(locale, '最大缺口：等待下一次客户信号更新', 'Largest gap: waiting for the next customer evidence update');
  const evidenceText = specificText(params.topEvidenceLabel, l(locale, String(params.evidenceCount) + ' 条账户证据', String(params.evidenceCount) + ' account evidence items'));

  return {
    state,
    title: state === 'refreshing'
      ? l(locale, '正在刷新账户判断', 'Refreshing account judgment')
      : state === 'empty'
        ? l(locale, '先补证据，再做判断', 'Add evidence before judging')
        : l(locale, '请确认这条关键判断', 'Confirm this key judgment'),
    body,
    keyJudgment,
    confirmationPrompt,
    reasonToCheck,
    confidenceBucket: bucket,
    confidenceLabel: state === 'refreshing' ? l(locale, '把握度：刷新中', 'Confidence: refreshing') : (locale === 'en' ? confidenceLabelEn(confidence) : confidenceLabel(confidence)),
    evidenceLabel: sourceCount > 0
      ? l(locale, '依据：', 'Evidence: ') + compactText(evidenceText, l(locale, String(params.evidenceCount) + ' 条账户证据', String(params.evidenceCount) + ' account evidence items'), 36)
      : state === 'refreshing'
        ? l(locale, '主要依据：正在拉取最新证据', 'Main evidence: fetching latest evidence')
        : l(locale, '主要依据：暂无足够证据', 'Main evidence: not enough evidence yet'),
    uncertaintyLabel,
    primaryAction,
    assumption,
    askTarget: cleanText(params.askTarget) || l(locale, '最接近真实决策或一手信息的人', 'Person closest to the real decision or first-hand information'),
    askQuestion,
    messageDraft: cleanText(params.messageDraft) || l(locale, '想确认一个关键判断：', 'I want to confirm one key judgment: ') + askQuestion,
    feedbackTarget: {
      targetType: 'judgment',
      targetId: 'account-overview-review:' + params.accountId,
      previousSummary: currentSituation,
    },
    telemetry: {
      eventName: 'judgment_review_shown',
      state,
      confidenceBucket: bucket,
      hasOpenQuestion,
      sourceCount,
    },
  };
}
