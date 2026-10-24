'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Heuristic: text is Chinese-dominant if ≥30% of non-whitespace chars are CJK.
 */
function isChineseDominant(text: string): boolean {
  const stripped = text.replace(/\s/g, '');
  if (!stripped.length) return true;
  const cjk = stripped.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  return (cjk?.length ?? 0) / stripped.length >= 0.3;
}

/**
 * Quick Chinese meta-summary for English-dominant text.
 * Maps common recommendation/evidence patterns to Chinese labels.
 */
function deriveChineseMeta(text: string): string {
  const t = text.toLowerCase();

  // Evidence excerpt patterns
  if (t.includes('email') || t.includes('mail')) return '来自邮件沟通的证据摘要';
  if (t.includes('meeting') || t.includes('call')) return '来自会议/通话的证据摘要';
  if (t.includes('budget') || t.includes('pricing') || t.includes('cost')) return '涉及预算/定价的讨论要点';
  if (t.includes('timeline') || t.includes('deadline') || t.includes('schedule')) return '涉及时间节点的讨论要点';
  if (t.includes('competitor') || t.includes('alternative')) return '涉及竞争对手/替代方案的讨论';
  if (t.includes('risk') || t.includes('concern') || t.includes('issue')) return '涉及风险/顾虑的讨论要点';
  if (t.includes('decision') || t.includes('approve') || t.includes('sign')) return '涉及决策/审批的讨论要点';
  if (t.includes('champion') || t.includes('sponsor') || t.includes('stakeholder')) return '涉及关键干系人的信息';
  if (t.includes('demo') || t.includes('poc') || t.includes('pilot')) return '涉及演示/POC的讨论要点';
  if (t.includes('contract') || t.includes('agreement') || t.includes('legal')) return '涉及合同/法务的讨论要点';
  if (t.includes('pain') || t.includes('challenge') || t.includes('problem')) return '涉及客户痛点的讨论要点';
  if (t.includes('next step') || t.includes('action') || t.includes('follow')) return '涉及后续行动的讨论要点';
  if (t.includes('recommend') || t.includes('suggest') || t.includes('advise')) return 'AI 建议摘要（原文为英文）';

  return '英文原文摘要（点击展开查看原文）';
}

interface ChineseFirstTextProps {
  text: string;
  className?: string;
  /** Label for collapsed state toggle, defaults to "查看原文" */
  expandLabel?: string;
}

/**
 * Renders text Chinese-first:
 * - If already Chinese-dominant → render as-is.
 * - If English-dominant → show a Chinese meta-summary with collapsible original.
 */
export function ChineseFirstText({ text, className, expandLabel = '查看原文' }: ChineseFirstTextProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  if (!text?.trim()) return null;

  if (isChineseDominant(text)) {
    return <span className={className}>{text}</span>;
  }

  const meta = deriveChineseMeta(text);

  return (
    <span className={className}>
      <span>{meta}</span>
      <button
        type="button"
        onClick={() => setShowOriginal((v) => !v)}
        className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:text-accent-hover"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${showOriginal ? 'rotate-180' : ''}`} />
        {showOriginal ? '收起' : expandLabel}
      </button>
      {showOriginal && (
        <span className="mt-1 block rounded bg-muted/10 px-2 py-1 text-[11px] text-muted italic">{text}</span>
      )}
    </span>
  );
}
