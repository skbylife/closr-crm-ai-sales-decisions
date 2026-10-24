// LLM Token Utilities — 跨模块复用的 token 估算与截断工具
// 从 strategic-play-engine.ts 提取，所有 LLM 调用点均可使用

/** Truncate string to maxLen characters, append ellipsis if truncated */
export function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '…';
}

/** Estimate token count for mixed CJK/Latin text (CJK ≈ 1.5 tokens/char) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.5);
}

/** Hard cap: trim text to fit within a token budget */
export function enforceTokenBudget(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens / 1.5);
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n[…内容已截断以控制 token 预算]';
}
