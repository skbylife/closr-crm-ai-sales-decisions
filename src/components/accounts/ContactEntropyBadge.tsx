"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { calculateEntropy, extractInteractions } from "@/lib/relationship-entropy";
import type { Contact } from "@/lib/babel-engine/types";

/** 关系熵值环形指示器 */
export function ContactEntropyBadge({ contact, accountId }: { contact: Contact; accountId: string }) {
  const emailDecodes = useStore((s) => s.emailDecodes);
  const tasks = useStore((s) => s.tasks);

  const result = useMemo(() => {
    const interactions = extractInteractions(
      contact.email || "", contact.name || "",
      emailDecodes.filter(d => d.accountId === accountId).map(d => ({ emailText: d.emailText, date: d.date })),
      tasks.filter(t => t.accountId === accountId),
    );
    return calculateEntropy(contact, interactions);
  }, [contact, accountId, emailDecodes, tasks]);

  const { entropy, urgency, suggestion } = result;
  const color = urgency === 'critical' ? '#EF4444' : urgency === 'high' ? '#F59E0B' : urgency === 'medium' ? '#3B82F6' : '#22C55E';
  const circumference = 2 * Math.PI * 12;
  const dashOffset = circumference * (1 - entropy / 100);

  return (
    <div className="group relative inline-flex items-center">
      {/* 环形进度 */}
      <svg width="28" height="28" className="flex-shrink-0 -rotate-90">
        <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-border" />
        <circle cx="14" cy="14" r="12" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
          className="transition-all duration-400" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold" style={{ color }}>
        {entropy}
      </span>
      {/* Hover 详情 */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-border bg-card p-3 shadow-xl
        opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-semibold" style={{ color }}>
            认知模型: {entropy}% {entropy > 50 ? '过时' : '有效'}
          </span>
          {result.daysToStale > 0 && (
            <span className="text-[12px] text-muted">({result.daysToStale} 天后变危险)</span>
          )}
        </div>
        <p className="text-xs text-secondary leading-relaxed">{suggestion}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[12px] text-muted">
          <span>趋势: {result.trend === 'increasing' ? '📈 恶化' : result.trend === 'decreasing' ? '📉 改善' : '➡️ 稳定'}</span>
          {result.lastInteraction && (
            <span>上次: {new Date(result.lastInteraction).toLocaleDateString('zh-CN')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
