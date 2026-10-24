/**
 * 关系熵（Relationship Entropy）— 用信息衰减模型衡量关系健康度
 * entropy 0 = 完全了解，100 = 完全未知
 */
import type { Contact } from '@/lib/babel-engine/types';

export interface Interaction {
  type: 'email' | 'meeting' | 'call' | 'task';
  date: string;
  depth: number;
}

export interface EntropyResult {
  entropy: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  daysToStale: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  lastInteraction: string | null;
  suggestion: string;
  baselineCadence: number;
  deviationRatio: number;
}

const ROLE_DECAY: Record<string, number> = {
  decision_maker: 1.8, champion: 1.5, blocker: 1.6, influencer: 1.2,
  technical_evaluator: 1.0, user: 0.8, contact: 1.0,
};

const INTERACTION_REDUCTION: Record<string, number> = {
  email: 8, meeting: 20, call: 12, task: 5,
};

/**
 * Compute the median interval (in days) between consecutive interactions.
 * Used as the per-contact "normal cadence" baseline.
 * Returns a value clamped between 3 and 90 days; defaults to 14 if < 2 interactions.
 */
export function computeBaselineCadence(interactions: Interaction[]): number {
  if (interactions.length < 2) return 14;
  const sorted = [...interactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return 14;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
  return Math.max(3, Math.min(90, Math.round(median)));
}

// ---------------------------------------------------------------------------
// Topic patterns for contextual suggestion extraction
// ---------------------------------------------------------------------------
const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string; followUp: string }> = [
  { pattern: /换工作|离职|跳槽/,   topic: '职业变动', followUp: '问问后续' },
  { pattern: /项目|上线|发布/,     topic: '项目进展', followUp: '上次提到的项目进展如何了？' },
  { pattern: /生病|身体|休息/,     topic: '身体状况', followUp: '关心下恢复情况' },
  { pattern: /旅行|出差|度假/,     topic: '出行',     followUp: '上次提到的出行怎么样？' },
  { pattern: /孩子|家人|婚礼/,     topic: '家庭',     followUp: '问问家里的事情怎么样了' },
  { pattern: /融资|投资|上市/,     topic: '融资进展', followUp: '上次提到的融资进展如何？' },
  { pattern: /困难|挑战|压力/,     topic: '挑战',     followUp: '看看能否帮忙' },
];

/**
 * Generate a contextual suggestion based on recent email content.
 * Scans the most recent 3 emails for topic keywords, then falls back to
 * entropy-level–based generic suggestions.
 */
export function generateContextualSuggestion(
  contact: Contact,
  _interactions: Interaction[],
  recentEmails: Array<{ emailText: string; date: string }>,
  entropy: number,
  baselineCadence: number,
): string {
  const name = contact.name?.split(' ')[0] || '联系人';

  // Scan the most recent 3 emails for topic matches
  const emailsToScan = recentEmails.slice(0, 3);
  for (const email of emailsToScan) {
    const text = email.emailText || '';
    for (const tp of TOPIC_PATTERNS) {
      if (tp.pattern.test(text)) {
        return `「${name} 上次提到${tp.topic}，${tp.followUp}」`;
      }
    }
  }

  // No topic found — fall back to entropy-level suggestions
  if (entropy >= 80) {
    const deviation = baselineCadence > 0 ? Math.round(baselineCadence * 10) / 10 : 0;
    return `⚠️ ${name} 已偏离正常联系节奏（正常 ${deviation} 天一次），建议立即安排沟通`;
  }
  if (entropy >= 60) {
    return `${name} 比平时联系频率慢了，建议发条消息重新连接`;
  }
  if (entropy >= 40) {
    return `${name} 关系健康，可以安排一次深度沟通了解近况`;
  }
  return `与 ${name} 关系良好，保持当前频率即可`;
}

export function calculateEntropy(
  contact: Contact,
  interactions: Interaction[],
  dealStage?: string,
  recentEmails?: Array<{ emailText: string; date: string }>,
): EntropyResult {
  const now = Date.now();
  const sorted = [...interactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastInteraction = sorted[0]?.date || null;
  let entropy = 0;

  const baseline = computeBaselineCadence(sorted);
  let deviationRatio = 0;

  if (!lastInteraction) {
    entropy = 85;
    deviationRatio = 6;
  } else {
    const daysSince = (now - new Date(lastInteraction).getTime()) / 86400000;
    const roleMult = ROLE_DECAY[contact.role || 'contact'] || 1.0;
    deviationRatio = daysSince / baseline;
    // deviation < 1 = within normal, 1-2 = slightly overdue, 2+ = significantly overdue
    entropy = Math.min(100, deviationRatio * 30 * roleMult);
    for (const i of sorted.slice(0, 10)) {
      const daysAgo = (now - new Date(i.date).getTime()) / 86400000;
      const base = INTERACTION_REDUCTION[i.type] || 5;
      const depthBonus = 1 + i.depth * 0.5;
      const timeFactor = Math.max(0, 1 - daysAgo / 60);
      entropy -= base * depthBonus * timeFactor;
    }
  }
  entropy = Math.max(0, Math.min(100, entropy));
  if (dealStage && ['negotiation', 'proposal', 'closing'].includes(dealStage)) {
    entropy = Math.min(100, entropy * 1.2);
  }

  let trend: EntropyResult['trend'] = 'stable';
  if (sorted.length >= 2) {
    const recent = sorted.filter(i => (now - new Date(i.date).getTime()) / 86400000 <= 14).length;
    const older = sorted.filter(i => { const d = (now - new Date(i.date).getTime()) / 86400000; return d > 14 && d <= 28; }).length;
    if (recent > older) trend = 'decreasing';
    else if (recent < older) trend = 'increasing';
  } else if (entropy > 50) trend = 'increasing';

  const dailyInc = (30 * (ROLE_DECAY[contact.role || 'contact'] || 1.0)) / baseline;
  const daysToStale = entropy >= 70 ? 0 : Math.ceil((70 - entropy) / dailyInc);

  let urgency: EntropyResult['urgency'] = 'low';
  if (entropy >= 80) urgency = 'critical';
  else if (entropy >= 60) urgency = 'high';
  else if (entropy >= 40) urgency = 'medium';

  const name = contact.name?.split(' ')[0] || '联系人';
  const daysSince = lastInteraction ? Math.floor((now - new Date(lastInteraction).getTime()) / 86400000) : 999;

  let suggestion: string;

  if (recentEmails && recentEmails.length > 0) {
    // Use contextual suggestion when recent emails are available
    suggestion = generateContextualSuggestion(contact, interactions, recentEmails, entropy, baseline);
  } else {
    // Legacy hardcoded suggestions (backward compatible)
    const roleLabels: Record<string, string> = { decision_maker: '决策者', champion: '内部支持者', blocker: '阻碍者', influencer: '影响者' };
    const rl = roleLabels[contact.role || ''] || '';
    suggestion = `与 ${name} 关系良好，保持当前频率即可。`;
    if (!lastInteraction) suggestion = `${name}${rl ? '是' + rl + '，' : ''}从未联系过。建议发介绍邮件建立关系。`;
    else if (entropy >= 80) suggestion = `⚠️ ${name}${rl ? '（' + rl + '）' : ''} 已 ${daysSince} 天没互动，认知模型严重过时。建议立即安排电话或会议。`;
    else if (entropy >= 60) suggestion = `${name}${rl ? '（' + rl + '）' : ''} ${daysSince} 天未联系，关系正在冷却。建议发跟进邮件或分享行业资讯。`;
    else if (entropy >= 40) suggestion = `${name} 关系健康但可更紧密。建议安排视频会议深入了解需求变化。`;
  }

  return { entropy: Math.round(entropy), trend, daysToStale, urgency, lastInteraction, suggestion, baselineCadence: baseline, deviationRatio: Math.round(deviationRatio * 10) / 10 };
}

export function extractInteractions(
  contactEmail: string, contactName: string,
  emailDecodes: Array<{ emailText: string; date: string }>,
  tasks: Array<{ title: string; status: string; assignedTo?: string; updatedAt?: string; createdAt: string }>,
): Interaction[] {
  const interactions: Interaction[] = [];
  for (const d of emailDecodes) {
    const t = d.emailText || '';
    if (t.toLowerCase().includes(contactEmail.toLowerCase()) || t.toLowerCase().includes(contactName.toLowerCase())) {
      interactions.push({ type: 'email', date: d.date, depth: Math.min(1, t.length / 2000) });
    }
  }
  for (const task of tasks) {
    if (task.status === 'done' && (task.title.toLowerCase().includes(contactName.toLowerCase()))) {
      interactions.push({ type: 'task', date: task.updatedAt || task.createdAt, depth: 0.3 });
    }
  }
  return interactions;
}
