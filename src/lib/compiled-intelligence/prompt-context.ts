/**
 * CIL Prompt Context — converts CILAccountContext into injectable prompt text blocks.
 *
 * Phase 3 helper: lightweight, safe extraction from knowledge pages / claims / evidence / open questions.
 * Returns empty string when data is missing — never breaks callers.
 */

import type { CILAccountContext } from './context';
import type { AccountKnowledgePage, CILPageType } from '@/lib/babel-engine/types';

// ─── Page extraction helpers ────────────────────────────────────────

function findPage(pages: AccountKnowledgePage[], type: CILPageType): AccountKnowledgePage | undefined {
  return pages.find((p) => p.pageType === type);
}

function pageMarkdown(page: AccountKnowledgePage | undefined): string {
  if (!page) return '';
  // Prefer pre-rendered markdown; fall back to JSON dump
  if (page.contentMd) return page.contentMd.trim();
  if (page.contentJson && Object.keys(page.contentJson).length > 0) {
    try {
      return JSON.stringify(page.contentJson, null, 2);
    } catch {
      return '';
    }
  }
  return '';
}

// ─── Length control ─────────────────────────────────────────────────

/** Centralized char budgets — keeps CIL context from squeezing out the main prompt. */
export const CIL_PROMPT_CHAR_BUDGETS = {
  decode: 3000,
  strategy: 5000,
} as const;

/**
 * Truncate text to `max` characters. Cuts at last newline before the limit
 * to avoid breaking mid-line, then appends a marker.
 */
function truncateBlock(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max);
  const pos = cut > max * 0.5 ? cut : max;
  return text.slice(0, pos) + '\n…（已截断）';
}

// ─── Public API ─────────────────────────────────────────────────────

export interface CILPromptBlocks {
  /** Combined text ready to inject into a prompt (empty string if nothing useful) */
  combined: string;
  /** Individual sections for fine-grained control */
  overview: string;
  claims: string;
  openQuestions: string;
  recentEvidence: string;
  risks: string;
  stakeholders: string;
  initiatives: string;
  timeline: string;
}

/**
 * Build prompt-injectable text from a CILAccountContext.
 *
 * @param ctx           The loaded CIL context (may be null — returns empty blocks)
 * @param opts.sections Which sections to include (default: core set for Decode)
 */
export function buildCILPromptBlocks(
  ctx: CILAccountContext | null | undefined,
  opts?: {
    sections?: Array<'overview' | 'claims' | 'openQuestions' | 'recentEvidence' | 'risks' | 'stakeholders' | 'initiatives' | 'timeline'>;
    /** Max characters for the combined output. Sections are truncated to fit. */
    maxChars?: number;
  },
): CILPromptBlocks {
  const empty: CILPromptBlocks = { combined: '', overview: '', claims: '', openQuestions: '', recentEvidence: '', risks: '', stakeholders: '', initiatives: '', timeline: '' };
  if (!ctx) return empty;

  const sections = opts?.sections ?? ['overview', 'claims', 'openQuestions', 'recentEvidence'];

  const blocks: CILPromptBlocks = { ...empty };

  // Overview page
  if (sections.includes('overview')) {
    const md = pageMarkdown(findPage(ctx.knowledgePages, 'overview'));
    if (md) blocks.overview = `### 账户概览（CIL）\n${md}`;
  }

  // Claims (active only, top 10)
  if (sections.includes('claims')) {
    const active = ctx.claims.filter((c) => c.status === 'active').slice(0, 10);
    if (active.length > 0) {
      const lines = active.map((c) => `- [置信度 ${Math.round(c.confidence * 100)}%] ${c.statement}`);
      blocks.claims = `### 当前判断（Claims）\n${lines.join('\n')}`;
    }
  }

  // Open questions (open only, top 8)
  if (sections.includes('openQuestions')) {
    const open = ctx.openQuestions.filter((q) => q.status === 'open').slice(0, 8);
    if (open.length > 0) {
      const lines = open.map((q) => `- [${q.priority}] ${q.question}`);
      blocks.openQuestions = `### 待解答问题（Open Questions）\n${lines.join('\n')}`;
    }
  }

  // Recent evidence (top 8)
  if (sections.includes('recentEvidence')) {
    const recent = ctx.evidence.slice(0, 8);
    if (recent.length > 0) {
      const lines = recent.map((e) => {
        const text = e.summary || e.quoteText || '';
        const date = e.occurredAt ? ` (${e.occurredAt.slice(0, 10)})` : '';
        return `- [${e.evidenceType}]${date} ${text.slice(0, 120)}`;
      });
      blocks.recentEvidence = `### 近期证据\n${lines.join('\n')}`;
    }
  }

  // Risks page
  if (sections.includes('risks')) {
    const md = pageMarkdown(findPage(ctx.knowledgePages, 'risks'));
    if (md) blocks.risks = `### 风险分析（CIL）\n${md}`;
  }

  // Stakeholders page
  if (sections.includes('stakeholders')) {
    const md = pageMarkdown(findPage(ctx.knowledgePages, 'stakeholders'));
    if (md) blocks.stakeholders = `### 干系人地图（CIL）\n${md}`;
  }

  // Initiatives page
  if (sections.includes('initiatives')) {
    const md = pageMarkdown(findPage(ctx.knowledgePages, 'initiatives'));
    if (md) blocks.initiatives = `### 客户战略举措（CIL）\n${md}`;
  }

  // Timeline page
  if (sections.includes('timeline')) {
    const md = pageMarkdown(findPage(ctx.knowledgePages, 'timeline'));
    if (md) blocks.timeline = `### 账户时间线（CIL）\n${md}`;
  }

  // Combine non-empty sections
  const parts = [blocks.overview, blocks.claims, blocks.openQuestions, blocks.recentEvidence, blocks.risks, blocks.stakeholders, blocks.initiatives, blocks.timeline].filter(Boolean);
  if (parts.length > 0) {
    let combined = `\n\n=== 编译智能层（CIL）上下文 ===\n${parts.join('\n\n')}`;
    if (opts?.maxChars) {
      combined = truncateBlock(combined, opts.maxChars);
    }
    blocks.combined = combined;
  }

  return blocks;
}

/**
 * Convenience: build CIL context for Decode (overview + claims + open questions + recent evidence).
 */
export function buildCILForDecode(ctx: CILAccountContext | null | undefined): string {
  return buildCILPromptBlocks(ctx, {
    sections: ['overview', 'claims', 'openQuestions', 'recentEvidence'],
    maxChars: CIL_PROMPT_CHAR_BUDGETS.decode,
  }).combined;
}

/**
 * Convenience: build CIL context for Strategy (all sections including risks / stakeholders / initiatives).
 */
export function buildCILForStrategy(ctx: CILAccountContext | null | undefined): string {
  return buildCILPromptBlocks(ctx, {
    sections: ['overview', 'claims', 'openQuestions', 'recentEvidence', 'risks', 'stakeholders', 'initiatives'],
    maxChars: CIL_PROMPT_CHAR_BUDGETS.strategy,
  }).combined;
}

/**
 * Account Strategy wants the same core worldview as Strategy, plus recent timeline continuity.
 */
export function buildCILForAccountStrategy(ctx: CILAccountContext | null | undefined): string {
  return buildCILPromptBlocks(ctx, {
    sections: ['overview', 'claims', 'openQuestions', 'recentEvidence', 'risks', 'stakeholders', 'initiatives', 'timeline'],
    maxChars: CIL_PROMPT_CHAR_BUDGETS.strategy,
  }).combined;
}

/**
 * Forecast focuses on deal-risk / validation signals, not full narrative breadth.
 */
export function buildCILForForecast(ctx: CILAccountContext | null | undefined): string {
  return buildCILPromptBlocks(ctx, {
    sections: ['overview', 'claims', 'openQuestions', 'recentEvidence', 'risks', 'stakeholders', 'timeline'],
    maxChars: 4200,
  }).combined;
}
