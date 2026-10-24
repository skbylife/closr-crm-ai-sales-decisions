/**
 * Integration 意图检测 — 判断用户消息是否与对接/连接相关
 *
 * 原则：避免仅凭“同步/连接/授权”这类泛词误伤普通销售对话。
 */

const PLATFORM_KEYWORDS = [
  'outlook', 'gmail', '企业微信', 'wecom', 'hubspot', 'salesforce', 'crm', '邮箱', '钉钉', 'zoho', '飞书', 'slack',
];

const STRONG_INTEGRATION_PHRASES = [
  '邮箱对接', 'crm对接', '对接助手', '重新授权', '断开连接', '连上 outlook', '连上 企业微信',
  '继续对接', '同步状态', '重新同步', '手动同步', '立即同步',
];

const ACTION_KEYWORDS = ['连接', '对接', '接入', '同步', '授权', '连上', 'integrate', 'connect', 'sync'];

export function detectIntegrationIntent(message: string): {
  isIntegration: boolean;
  intent?: string;
} {
  const lower = message.toLowerCase().trim();

  const strongMatch = STRONG_INTEGRATION_PHRASES.find((k) => lower.includes(k));
  if (strongMatch) {
    return { isIntegration: true, intent: strongMatch };
  }

  const platformMatch = PLATFORM_KEYWORDS.find((k) => lower.includes(k.toLowerCase()));
  const actionMatch = ACTION_KEYWORDS.find((k) => lower.includes(k));

  if (platformMatch && actionMatch) {
    return { isIntegration: true, intent: `${actionMatch}:${platformMatch}` };
  }

  return { isIntegration: false };
}
