// Forward Address Utilities
// Generates and parses user-specific email forwarding addresses.
//
// Format: user-{shortId}@forward.example.invalid
// shortId = first 8 chars of user_id (UUID)
//
// Currently uses AgentMail as actual backend, but UI displays the future format.

const FORWARD_DOMAIN = process.env.NEXT_PUBLIC_FORWARD_DOMAIN || 'forward.example.invalid';
const AGENTMAIL_INBOX = process.env.AGENTMAIL_INBOX ?? 'example-164c28f39e@example.invalid';

/**
 * Generate a user-specific forwarding address for display.
 * @param userId - authenticated user UUID
 * @returns Display address like example-f40d81e6c0@example.invalid
 */
export function generateForwardAddress(userId: string): string {
  const shortId = userId.replace(/-/g, '').slice(0, 8);
  return `user-${shortId}@${FORWARD_DOMAIN}`;
}

/**
 * Extract user short ID from a forward address.
 * @param address - e.g. example-f40d81e6c0@example.invalid
 * @returns The shortId portion, or null if not a valid forward address
 */
export function parseForwardAddress(address: string): string | null {
  const match = address.match(/^user-([a-z0-9]{8})@/i);
  return match ? match[1] : null;
}

/**
 * Get the actual inbox address for receiving emails (AgentMail).
 * In the future this will route per-user, but for now all users share one inbox.
 */
export function getActualInboxAddress(): string {
  return AGENTMAIL_INBOX;
}

/**
 * Parse forwarded email content to extract the original sender.
 * Handles common forwarding formats from Gmail, Outlook, etc.
 */
export function extractOriginalSender(
  text: string,
  fromHeader: string
): { email: string; name: string } | null {
  // Patterns for forwarded message markers
  const patterns = [
    // Gmail: "---------- Forwarded message ----------\nFrom: Name <email>"
    /---------- Forwarded message ----------[\s\S]*?From:\s*(?:(.+?)\s*<)?([^\s<>]+@[^\s<>]+)>?/i,
    // Outlook: "From: Name <email>" or "发件人: Name <email>"
    /(?:^|\n)(?:From|发件人|De|Von|差出人):\s*(?:(.+?)\s*<)?([^\s<>]+@[^\s<>]+)>?/im,
    // Generic "Original Message" pattern
    /(?:Original Message|原始邮件)[\s\S]*?From:\s*(?:(.+?)\s*<)?([^\s<>]+@[^\s<>]+)>?/i,
    // "---- Forwarded" variations
    /----\s*(?:Forwarded|转发)[\s\S]*?From:\s*(?:(.+?)\s*<)?([^\s<>]+@[^\s<>]+)>?/i,
    // Chinese format: "发件人：xxx <email>"
    /发件人[：:]\s*(?:(.+?)\s*<)?([^\s<>]+@[^\s<>]+)>?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1]?.trim() || '';
      const email = match[2]?.trim();
      if (email) {
        return { email, name };
      }
    }
  }

  return null;
}
