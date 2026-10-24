import type { CulturalDecodeOutput, DecodeOutput, RiskLevel, StableDecodeIntent } from './types';

export type SocialIntentLevel = 'low' | 'medium' | 'high';

export interface SocialIntentSummary {
  /** 用户可见：对方/我方这段话真正想推进什么 */
  intent: string;
  /** 用户可见：这段话听起来可能带来的语气风险 */
  toneRisk: {
    level: SocialIntentLevel;
    label: string;
    explanation: string;
  };
  /** 用户可见：双方当前沟通距离 */
  relationshipDistance: {
    level: SocialIntentLevel;
    label: string;
    explanation: string;
  };
  /** 用户可见：这段话对对方施加的推进压力 */
  pressure: {
    level: SocialIntentLevel;
    label: string;
    explanation: string;
  };
  /** 用户可见：话外之意/潜台词 */
  subtext: string;
  /** 用户可见：下一步如何调语气 */
  suggestedAdjustment: string;
  signals: string[];
}

const HIGH_PRESSURE_RE = /\b(asap|urgent|immediately|deadline|final|must|need by|no later than)\b|尽快|马上|立刻|必须|务必|最后期限|截止|今天之内|本周内|请立即|强烈要求/i;
const MEDIUM_PRESSURE_RE = /希望|请|麻烦|期待|建议|follow up|next step|timeline|推进|确认|安排|同步|反馈/i;

const EMAIL_TYPE_LABELS: Record<string, string> = {
  cold_outreach: '首次接触',
  follow_up: '跟进',
  meeting_invite: '会议邀请',
  proposal_send: '方案发送',
  quote_follow_up: '报价跟进',
  holiday_greeting: '节日问候',
  reactivation: '重新激活',
  custom: '自定义',
};
const SOFTENER_RE = /方便|是否可以|如果可以|不急|供参考|感谢|谢谢|appreciate|when convenient|no rush|if possible|could you|would you/i;
const DISTANT_ROLE_RE = /ceo|cfo|coo|cto|vp|svp|evp|chief|president|founder|董事长|总裁|副总|总监|负责人|采购|法务|财务/i;
const CLOSE_RE = /老朋友|上次聊|如我们讨论|as discussed|great speaking|thanks again|感谢上次|继续/i;

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : fallback;
}

function clampSignals(signals: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const signal of signals.map((item) => cleanText(item)).filter(Boolean)) {
    if (seen.has(signal)) continue;
    seen.add(signal);
    result.push(signal);
    if (result.length >= 4) break;
  }
  return result;
}

function pressureFromText(text: string): SocialIntentSummary['pressure'] {
  const high = HIGH_PRESSURE_RE.test(text);
  const medium = MEDIUM_PRESSURE_RE.test(text);
  const softened = SOFTENER_RE.test(text);

  if (high && !softened) {
    return {
      level: 'high',
      label: '推进压力偏高',
      explanation: '措辞里有明显催促或截止时间信号，容易让对方感到被逼迫。',
    };
  }
  if (high || medium) {
    return {
      level: 'medium',
      label: '有明确推进压力',
      explanation: softened ? '有推进诉求，但带了缓冲语，压力可控。' : '有明确下一步要求，对方会感到需要回应。',
    };
  }
  return {
    level: 'low',
    label: '推进压力较低',
    explanation: '表达偏信息同步或关系维护，对方不一定会立刻行动。',
  };
}

function toneRiskFromRiskAndPressure(risk: RiskLevel | undefined, pressure: SocialIntentSummary['pressure'], text: string): SocialIntentSummary['toneRisk'] {
  if (risk === 'critical' || (risk === 'high' && pressure.level !== 'low')) {
    return {
      level: 'high',
      label: '语气风险高',
      explanation: '业务风险和施压感同时存在，建议先降温、补上下文，再要求对方行动。',
    };
  }
  if (pressure.level === 'high') {
    return {
      level: 'high',
      label: '可能显得强硬',
      explanation: '这段话的行动要求较硬，若关系不够近，容易被解读成催促。',
    };
  }
  if (risk === 'high' || risk === 'medium' || /\?|？/.test(text)) {
    return {
      level: 'medium',
      label: '需要留意语气',
      explanation: '对方可能在试探、保留或等待更多安全感，回复时不要只给结论。',
    };
  }
  return {
    level: 'low',
    label: '语气风险较低',
    explanation: '目前表达没有明显冒犯或过度施压信号，保持清晰即可。',
  };
}

function relationshipDistance(params: { text: string; relationship?: string; contactTitle?: string; contactRole?: string }): SocialIntentSummary['relationshipDistance'] {
  const relationship = cleanText(params.relationship).toLowerCase();
  const roleText = `${params.contactTitle ?? ''} ${params.contactRole ?? ''}`;
  if (/close|warm|熟|老客户|champion|朋友/.test(relationship) || CLOSE_RE.test(params.text)) {
    return { level: 'low', label: '关系距离较近', explanation: '上下文里有连续互动或熟悉感，可以更直接，但仍要保留专业边界。' };
  }
  if (/new|cold|first|陌生|首次/.test(relationship) || DISTANT_ROLE_RE.test(roleText)) {
    return { level: 'high', label: '关系距离较远', explanation: '对方身份或阶段更正式，建议先给背景和选择权，少用命令式推进。' };
  }
  return { level: 'medium', label: '关系距离中等', explanation: '已有基本业务上下文，但信任还需要靠证据和节奏继续建立。' };
}

function stableIntentLabel(intent: StableDecodeIntent): string {
  switch (intent) {
    case 'active_interest': return '对方在释放兴趣，希望继续看价值是否成立。';
    case 'evaluation': return '对方在评估方案，重点是降低决策不确定性。';
    case 'delay_or_stall': return '对方在拖慢节奏，可能需要更多内部确认。';
    case 'disengagement': return '对方热度下降，当前目标是重新验证真实意愿。';
    case 'ready_to_buy': return '对方接近采购行动，重点是扫清流程和风险。';
    default: return '对方真实意图仍不完全明确，需要用下一步问题验证。';
  }
}

export function buildDecodeSocialIntentSummary(params: {
  decode: DecodeOutput;
  inputText?: string;
  culturalContext?: CulturalDecodeOutput | null;
  relationship?: string;
}): SocialIntentSummary {
  const text = cleanText(params.inputText) || params.decode.messages.map((message) => message.original).join('\n');
  const pressure = pressureFromText(text);
  const toneRisk = toneRiskFromRiskAndPressure(params.decode.threadAnalysis?.riskLevel, pressure, text);
  const distance = relationshipDistance({ text, relationship: params.relationship });
  const keySignal = cleanText(params.decode.threadAnalysis?.keySignal);
  const actualMeaning = cleanText(params.culturalContext?.actualMeaning);
  const intent = actualMeaning || (params.decode.stableJudgment ? stableIntentLabel(params.decode.stableJudgment.intent) : keySignal) || '这段沟通的真实意图还不够明确，需要继续验证。';
  const subtext = actualMeaning || keySignal || '话外之意暂不明确；建议不要只按字面回复，先确认对方现在最关心的阻碍。';
  const suggestedAdjustment = toneRisk.level === 'high'
    ? '先承认对方处境，再给一个低压力选择题；不要一上来催截止时间。'
    : pressure.level === 'low'
      ? '可以补一个明确但轻量的下一步，否则对方可能不会行动。'
      : '保留当前推进方向，但把要求写成可选择、可确认的下一步。';

  return {
    intent,
    toneRisk,
    relationshipDistance: distance,
    pressure,
    subtext,
    suggestedAdjustment,
    signals: clampSignals([
      keySignal,
      params.decode.threadAnalysis?.buyerState ? `客户状态：${params.decode.threadAnalysis.buyerState}` : '',
      params.decode.threadAnalysis?.sentimentTrend ? `情绪温度：${params.decode.threadAnalysis.sentimentTrend}` : '',
      params.culturalContext?.culturalContext ?? '',
    ]),
  };
}

export function buildComposeSocialIntentSummary(params: {
  body: string;
  emailGoal?: string;
  emailType?: string;
  sendingAdvice?: string;
  contactTitle?: string;
  contactRole?: string;
  contactProfile?: string;
}): SocialIntentSummary {
  const text = cleanText(params.body);
  const pressure = pressureFromText(`${text}\n${params.emailGoal ?? ''}`);
  const toneRisk = toneRiskFromRiskAndPressure(undefined, pressure, text);
  const distance = relationshipDistance({
    text,
    relationship: params.emailType === 'cold_outreach' ? '首次接触' : undefined,
    contactTitle: params.contactTitle,
    contactRole: params.contactRole,
  });
  const intent = cleanText(params.emailGoal)
    ? `这封信的主要意图是：${cleanText(params.emailGoal)}。`
    : '这封信的主要意图是推进一次清晰、低摩擦的下一步。';
  const subtext = pressure.level === 'high'
    ? '对方可能读到“我需要你尽快表态”，如果关系不够近会有压迫感。'
    : pressure.level === 'medium'
      ? '对方会读到明确推进意图：你希望他确认、安排或给出反馈。'
      : '对方更可能读到关系维护或信息同步，行动触发不够强。';
  const suggestedAdjustment = toneRisk.level === 'high'
    ? '把硬性要求改成两个可选时间/路径，并补一句“如果现在不方便，也可以告诉我更合适的窗口”。'
    : pressure.level === 'low'
      ? '补一个清楚的轻量行动请求，例如“如果方向可以，我发两段可选时间”。'
      : '当前强度可用；建议保留一句给对方退路的话，降低被催促感。';

  return {
    intent,
    toneRisk,
    relationshipDistance: distance,
    pressure,
    subtext,
    suggestedAdjustment,
    signals: clampSignals([
      params.sendingAdvice ?? '',
      params.emailType ? `邮件类型：${EMAIL_TYPE_LABELS[params.emailType] ?? '自定义'}` : '',
    ]),
  };
}

export function buildCulturalSocialIntentSummary(params: {
  text: string;
  cultural: CulturalDecodeOutput;
  relationship?: string;
}): SocialIntentSummary {
  const pressure = pressureFromText(params.text);
  return {
    intent: cleanText(params.cultural.actualMeaning, '这段话的真实意图需要结合关系阶段继续确认。'),
    toneRisk: toneRiskFromRiskAndPressure(undefined, pressure, params.text),
    relationshipDistance: relationshipDistance({ text: params.text, relationship: params.relationship }),
    pressure,
    subtext: cleanText(params.cultural.actualMeaning, '字面意思之外，可能存在礼貌保留或试探空间。'),
    suggestedAdjustment: cleanText(params.cultural.counterStrategy, '回复时先承接对方语境，再给出低压力的下一步。'),
    signals: clampSignals([params.cultural.culturalContext, params.cultural.crossCulturalNote ?? '']),
  };
}
