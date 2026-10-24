import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentFeedbackTarget } from './feedback';

export interface DecodeStabilityCorrectionCopy {
  visible?: boolean;
  buttonLabel?: string;
  helperText?: string;
  previousSummary?: string;
}

export interface DecodeJudgmentFeedbackTarget {
  accountId: string;
  targetType: Extract<JudgmentFeedbackTarget, 'decode'>;
  targetId: string;
  previousSummary?: string;
  evidenceRefs: JudgmentEvidenceRef[];
  buttonLabel: string;
  helperText: string;
}

function cleanId(value?: string | null): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function buildDecodeJudgmentEvidenceRefs(params: {
  savedDecodeId?: string | null;
  savedAccountName?: string | null;
}): JudgmentEvidenceRef[] {
  const savedDecodeId = cleanId(params.savedDecodeId);
  if (!savedDecodeId) return [];

  return [{
    sourceId: savedDecodeId,
    sourceKind: 'email_decode',
    title: cleanId(params.savedAccountName) ? `Decode · ${cleanId(params.savedAccountName)}` : 'Decode 判断',
    sourceTable: 'email_decodes',
    sourceRowId: savedDecodeId,
  }];
}

export function buildDecodeJudgmentFeedbackTarget(params: {
  saved: boolean;
  savedAccountId?: string | null;
  savedDecodeId?: string | null;
  savedAccountName?: string | null;
  previousSummary?: string | null;
  stabilityCorrection?: DecodeStabilityCorrectionCopy | null;
}): DecodeJudgmentFeedbackTarget | undefined {
  const accountId = cleanId(params.savedAccountId);
  const targetId = cleanId(params.savedDecodeId);
  if (!params.saved || !accountId || !targetId) return undefined;

  const stabilityCorrection = params.stabilityCorrection?.visible ? params.stabilityCorrection : null;
  const helperText = stabilityCorrection?.helperText
    ? `${stabilityCorrection.helperText} 保存后可在客户页「账户记忆档案」的人工反馈/修订记录中复盘。`
    : '这条反馈会绑定当前保存的解读证据，作为该客户的判断修正依据；最近反馈/修订可在客户页「账户记忆档案」复盘。';

  return {
    accountId,
    targetType: 'decode',
    targetId,
    previousSummary: stabilityCorrection?.previousSummary ?? cleanId(params.previousSummary),
    evidenceRefs: buildDecodeJudgmentEvidenceRefs({
      savedDecodeId: targetId,
      savedAccountName: params.savedAccountName,
    }),
    buttonLabel: stabilityCorrection?.buttonLabel ?? '反馈/修正这个判断',
    helperText,
  };
}
