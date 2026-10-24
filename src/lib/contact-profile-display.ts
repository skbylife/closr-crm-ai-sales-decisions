export const PROFILE_DECISION_STYLE_LABELS: Record<string, string> = {
  analytical: '分析型',
  driver: '驱动型',
  amiable: '亲和型',
  expressive: '表现型',
};

export const PROFILE_RISK_LABELS: Record<string, string> = {
  aggressive: '进取型',
  moderate: '稳健型',
  cautious: '谨慎型',
};

export const PROFILE_LENGTH_LABELS: Record<string, string> = {
  short: '短消息 / 一页纸',
  medium: '中等长度',
  long: '详细说明',
};

export const PROFILE_FORMALITY_LABELS: Record<string, string> = {
  formal: '正式',
  semi_formal: '半正式',
  informal: '轻松',
  casual: '轻松',
};

export function profileDisplayValue(value: unknown, labels: Record<string, string>): string {
  if (typeof value !== 'string') return '待确认';
  const trimmed = value.trim();
  if (!trimmed) return '待确认';
  return labels[trimmed] ?? trimmed;
}

export function localizeProfileFreeText(value: string): string {
  return value
    .replace(/\bbackup\b/gi, '备选')
    .replace(/\bshort\b/gi, '短消息')
    .replace(/\bmedium\b/gi, '中等长度')
    .replace(/\blong\b/gi, '详细说明')
    .replace(/\bsemi_formal\b/gi, '半正式')
    .replace(/\bformal\b/gi, '正式')
    .replace(/\binformal\b/gi, '轻松')
    .replace(/\bcasual\b/gi, '轻松')
    .replace(/\bdriver\b/gi, '驱动型')
    .replace(/\banalytical\b/gi, '分析型')
    .replace(/\bamiable\b/gi, '亲和型')
    .replace(/\bexpressive\b/gi, '表现型')
    .replace(/\baggressive\b/gi, '进取型')
    .replace(/\bmoderate\b/gi, '稳健型')
    .replace(/\bcautious\b/gi, '谨慎型');
}
