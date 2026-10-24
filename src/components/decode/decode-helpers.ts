// ─── Decode Helper Functions & Constants ─────────────────────────────
// Extracted from decode/page.tsx — pure utility functions + constants

import type { Account } from "@/lib/babel-engine/types";

// ─── Source Types ────────────────────────────────────────────────────

export type DecodeSource = "email" | "meeting" | "call" | "chat" | "intel" | "other";
export type DecodeGoal = "auto" | "attitude" | "risk" | "reply" | "deal_update" | "next_action";

export const DECODE_SOURCES: {
  value: DecodeSource;
  label: string;
  icon: string;
  placeholderZh: string;
  placeholderEn: string;
}[] = [
  {
    value: "email",
    label: "decode.source.email",
    icon: "\u{1F4E7}",
    placeholderZh: "在此粘贴邮件内容...\n\n示例：\"王总说方案认可，但需等Q2预算审批，竞品报价低15%...\"",
    placeholderEn: "Paste email content here...\n\nExample: \"The client approved the proposal but needs Q2 budget approval...\"",
  },
  {
    value: "meeting",
    label: "decode.source.meeting",
    icon: "\u{1F4CB}",
    placeholderZh: "粘贴会议纪要、转录片段或会后摘要...\n\n建议包含：客户原话、承诺事项、异议、下一步时间点。",
    placeholderEn: "Paste meeting notes, transcript excerpts, or a post-meeting summary...\n\nInclude client quotes, commitments, objections, and next dates when possible.",
  },
  {
    value: "call",
    label: "decode.source.call",
    icon: "\u{1F4DE}",
    placeholderZh: "在此粘贴通话记录或通话摘要...\n\n示例：\"客户电话中提到预算紧张，但对我们的技术方案很感兴趣...\"",
    placeholderEn: "Paste call transcript or summary...\n\nExample: \"Client mentioned tight budget on the call but showed interest in our tech...\"",
  },
  {
    value: "chat",
    label: "decode.source.chat",
    icon: "\u{1F4AC}",
    placeholderZh: "在此粘贴聊天记录（微信/Slack/Teams）...\n\n示例：\"对方在微信上说这周不太方便，下周再约...\"",
    placeholderEn: "Paste chat messages (WeChat/Slack/Teams)...\n\nExample: \"They said on WeChat they're not available this week...\"",
  },
  {
    value: "intel",
    label: "decode.source.intel",
    icon: "\u{1F4A1}",
    placeholderZh: "粘贴客户情报、渠道反馈、竞品消息或现场观察...\n\n示例：\"渠道说客户正在比较两家低价方案，采购希望月底前定供应商。\"",
    placeholderEn: "Paste customer intel, partner feedback, competitor news, or field observations...\n\nExample: \"A partner said procurement is comparing two lower-priced options and wants to decide by month-end.\"",
  },
  {
    value: "other",
    label: "decode.source.other",
    icon: "\u{1F4DD}",
    placeholderZh: "在此粘贴其他沟通内容...\n\n支持：社交媒体消息、短信、传真、备忘录等",
    placeholderEn: "Paste other communication content...\n\nSupports: social media messages, SMS, fax, memos, etc.",
  },
];

export const DECODE_GOALS: {
  value: DecodeGoal;
  labelZh: string;
  labelEn: string;
}[] = [
  { value: "auto", labelZh: "自动判断", labelEn: "Let Closr decide" },
  { value: "attitude", labelZh: "判断态度", labelEn: "Read attitude" },
  { value: "risk", labelZh: "找风险", labelEn: "Find risks" },
  { value: "reply", labelZh: "生成回复", labelEn: "Plan reply" },
  { value: "deal_update", labelZh: "更新商机判断", labelEn: "Update deal view" },
  { value: "next_action", labelZh: "下一步行动", labelEn: "Next action" },
];

export const DECODE_SOURCE_LABELS: Record<DecodeSource, { zh: string; en: string }> = {
  email: { zh: "邮件", en: "Email" },
  meeting: { zh: "会议", en: "Meeting" },
  call: { zh: "通话", en: "Call" },
  chat: { zh: "IM 聊天", en: "IM chat" },
  intel: { zh: "客户情报", en: "Customer intel" },
  other: { zh: "其他", en: "Other" },
};

export const DECODE_GOAL_LABELS: Record<DecodeGoal, { zh: string; en: string }> = {
  auto: { zh: "自动判断", en: "Let Closr decide" },
  attitude: { zh: "判断客户态度", en: "Read client attitude" },
  risk: { zh: "寻找风险信号", en: "Find risk signals" },
  reply: { zh: "生成回复策略", en: "Plan a reply" },
  deal_update: { zh: "更新商机判断", en: "Update deal judgment" },
  next_action: { zh: "明确下一步行动", en: "Clarify next action" },
};

export { DEAL_STAGE_OPTIONS as DEAL_STAGES, RISK_LABELS, SENTIMENT_LABELS } from "@/lib/constants";

export const PLACEHOLDER_EMAIL_DEFAULT = `在此粘贴邮件、电话记录或会议纪要...

支持：客户邮件、电话记录、会议纪要、聊天记录等

示例："王总说方案认可，但需等Q2预算审批，竞品报价低15%..."`;

// ─── Helper Functions ────────────────────────────────────────────────

export function urgencyColor(urgency: number): string {
  if (urgency >= 8) return "text-danger";
  if (urgency >= 5) return "text-warning";
  return "text-positive";
}

export function urgencyBarGradient(urgency: number): string {
  if (urgency >= 8) return "from-danger to-danger";
  if (urgency >= 5) return "from-warning to-warning";
  return "from-positive to-positive";
}

export function emotionEmoji(emotion: string): string {
  const lower = emotion.toLowerCase();
  if (lower.includes("frustrat") || lower.includes("annoy")) return "\u{1F624}";
  if (lower.includes("excit") || lower.includes("enthus")) return "\u{1F525}";
  if (lower.includes("anxious") || lower.includes("anxiet") || lower.includes("nervous")) return "\u{1F630}";
  if (lower.includes("disappoint")) return "\u{1F61E}";
  if (lower.includes("confiden") || lower.includes("assertive")) return "\u{1F4AA}";
  if (lower.includes("hesit") || lower.includes("uncertain")) return "\u{1F914}";
  if (lower.includes("warm") || lower.includes("friendly") || lower.includes("genuine")) return "\u{1F60A}";
  if (lower.includes("cold") || lower.includes("distan") || lower.includes("formal")) return "\u{1F9CA}";
  if (lower.includes("relief") || lower.includes("reassur")) return "\u{1F60C}";
  if (lower.includes("urgen") || lower.includes("press")) return "\u{23F0}";
  if (lower.includes("polite") || lower.includes("mask")) return "\u{1F3AD}";
  if (lower.includes("interest") || lower.includes("curious")) return "\u{1F440}";
  return "\u{1F4AD}";
}

export function autoMatchAccount(emailText: string, accounts: Account[]) {
  const text = emailText.toLowerCase();

  // Phase 1: Match by email address (most reliable)
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  const foundEmails = text.match(emailRegex) ?? [];
  for (const foundEmail of foundEmails) {
    for (const acc of accounts) {
      for (const c of acc.contacts) {
        if (c.email && c.email.toLowerCase() === foundEmail) {
          return { accountId: acc.id, accountName: acc.name, contactId: c.id, contactName: c.name };
        }
      }
    }
    // Match by email domain → account (e.g. @chinamobile.com → 中国移动)
    const domain = foundEmail.split('@')[1];
    if (domain) {
      for (const acc of accounts) {
        const hasContactWithDomain = acc.contacts.some(c => c.email && c.email.toLowerCase().includes(domain));
        if (hasContactWithDomain) {
          // Found account by domain, now try to match specific contact by name in text
          for (const c of acc.contacts) {
            if (c.name && c.name.length >= 2 && text.includes(c.name.toLowerCase())) {
              return { accountId: acc.id, accountName: acc.name, contactId: c.id, contactName: c.name };
            }
          }
          return { accountId: acc.id, accountName: acc.name };
        }
      }
    }
  }

  // Phase 2: Match by account name in text
  for (const acc of accounts) {
    if (acc.name && text.includes(acc.name.toLowerCase())) {
      for (const c of acc.contacts) {
        if (c.name && text.includes(c.name.toLowerCase())) {
          return { accountId: acc.id, accountName: acc.name, contactId: c.id, contactName: c.name };
        }
      }
      return { accountId: acc.id, accountName: acc.name };
    }
  }

  // Phase 3: Match by contact name alone
  for (const acc of accounts) {
    for (const c of acc.contacts) {
      if (c.name && c.name.length >= 2 && text.includes(c.name.toLowerCase())) {
        return { accountId: acc.id, accountName: acc.name, contactId: c.id, contactName: c.name };
      }
    }
  }

  return null;
}
