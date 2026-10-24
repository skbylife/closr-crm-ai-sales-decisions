/**
 * Integration Email → Account 归属推断
 *
 * 低风险桥接层：当 integration_emails 缺少 account_id 时，通过
 * sender 域名、subject/summary 中的 account name、connection scope
 * 等信号推断所属 account，不改 schema。
 */

export interface IntegrationEmail {
  id: string;
  subject?: string | null;
  summary?: string | null;
  sender?: string | null;
  received_at?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  connection_id?: string | null;
}

export interface AccountHint {
  id: string;
  name: string;
  /** Explicitly recorded contact email domains. */
  website?: string | null;
  domain?: string | null;
  knownDomains?: string[];
}

export interface ConnectionHint {
  id: string;
  config?: { label?: string; [key: string]: unknown } | null;
}

export interface AttributionResult {
  emailId: string;
  accountId: string | null;
  matchMethod: 'direct' | 'sender_domain' | 'subject_match' | 'summary_match' | 'connection_label' | 'none';
  confidence: number; // 0-1
}

/** 从 "李总 <example-45009d85ab@example.invalid>" 中提取域名 */
function extractSenderDomain(sender: string | null | undefined): string | null {
  if (!sender) return null;
  const match = sender.match(/@([a-zA-Z0-9.-]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Normalize recorded account websites/domains; never infer a company from a fixed name map. */
function normalizeDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch { return null; }
}

/**
 * 推断单封 integration email 所属的 account
 */
export function inferEmailAccount(
  email: IntegrationEmail,
  accounts: AccountHint[],
  connections?: ConnectionHint[],
): AttributionResult {
  const base: Omit<AttributionResult, 'accountId' | 'matchMethod' | 'confidence'> = {
    emailId: email.id,
  };

  // 1. Direct: account_id 已存在
  if (email.account_id) {
    return { ...base, accountId: email.account_id, matchMethod: 'direct', confidence: 1.0 };
  }

  // 2. Sender domain matching
  const domain = extractSenderDomain(email.sender);
  if (domain) {
    const normalizedSender = normalizeDomain(domain);
    const matches = accounts.filter((account) =>
      [account.website, account.domain, ...(account.knownDomains ?? [])]
        .some((value) => Boolean(normalizedSender) && normalizeDomain(value) === normalizedSender),
    );
    // Shared domains cannot establish account identity on their own.
    if (matches.length === 1) {
      return { ...base, accountId: matches[0].id, matchMethod: 'sender_domain', confidence: 0.85 };
    }
  }

  // 3. Subject matching — account name appears in subject
  if (email.subject) {
    const subjectLower = email.subject.toLowerCase();
    const subjectMatch = accounts.find((a) => Boolean(a.name.trim()) && subjectLower.includes(a.name.trim().toLowerCase()));
    if (subjectMatch) {
      return { ...base, accountId: subjectMatch.id, matchMethod: 'subject_match', confidence: 0.75 };
    }
  }

  // 4. Summary matching — account name appears in summary
  if (email.summary) {
    const summaryLower = email.summary.toLowerCase();
    const summaryMatch = accounts.find((a) => Boolean(a.name.trim()) && summaryLower.includes(a.name.trim().toLowerCase()));
    if (summaryMatch) {
      return { ...base, accountId: summaryMatch.id, matchMethod: 'summary_match', confidence: 0.7 };
    }
  }

  // 5. Connection label matching — connection config.label mentions account
  if (email.connection_id && connections) {
    const conn = connections.find((c) => c.id === email.connection_id);
    if (conn?.config?.label) {
      const label = String(conn.config.label).toLowerCase();
      const connMatch = accounts.find((a) =>
        Boolean(a.name.trim()) && label.includes(a.name.trim().toLowerCase()),
      );
      if (connMatch) {
        return { ...base, accountId: connMatch.id, matchMethod: 'connection_label', confidence: 0.6 };
      }
    }
  }

  return { ...base, accountId: null, matchMethod: 'none', confidence: 0 };
}

/**
 * 批量推断 + 按 account 分组
 */
export function attributeEmailsToAccounts(
  emails: IntegrationEmail[],
  accounts: AccountHint[],
  connections?: ConnectionHint[],
): Map<string, { email: IntegrationEmail; attribution: AttributionResult }[]> {
  const grouped = new Map<string, { email: IntegrationEmail; attribution: AttributionResult }[]>();

  for (const email of emails) {
    const attribution = inferEmailAccount(email, accounts, connections);
    if (attribution.accountId) {
      const list = grouped.get(attribution.accountId) ?? [];
      list.push({ email, attribution });
      grouped.set(attribution.accountId, list);
    }
  }

  return grouped;
}
