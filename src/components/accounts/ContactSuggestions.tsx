"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Lightbulb, AlertTriangle, ArrowRight, Mail, User2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { calculateEntropy, extractInteractions } from "@/lib/relationship-entropy";
import type { Contact } from "@/lib/babel-engine/types";

/** 主动推理式联系建议 */
export function ContactSuggestions({ contacts, accountId, dealStage }: {
  contacts: Contact[];
  accountId: string;
  dealStage?: string;
}) {
  const emailDecodes = useStore((s) => s.emailDecodes);
  const tasks = useStore((s) => s.tasks);
  const { locale } = useLocale();
  const en = locale === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);

  const suggestions = useMemo(() => {
    return contacts.map(c => {
      const interactions = extractInteractions(
        c.email || "", c.name || "",
        emailDecodes.filter(d => d.accountId === accountId).map(d => ({ emailText: d.emailText, date: d.date })),
        tasks.filter(t => t.accountId === accountId),
      );
      const result = calculateEntropy(c, interactions, dealStage);
      return { contact: c, ...result };
    }).filter(s => s.entropy >= 35) // 只显示需要关注的
      .sort((a, b) => b.entropy - a.entropy)
      .slice(0, 3);
  }, [contacts, accountId, dealStage, emailDecodes, tasks]);

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4 mb-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-accent mb-3">
        <Lightbulb className="h-3.5 w-3.5" />
        {t('AI 主动推理建议', 'AI Proactive Suggestions')}
      </h4>
      <div className="space-y-2">
        {suggestions.map(s => (
          <div key={s.contact.id} className="flex items-start gap-2.5 rounded-lg bg-card border border-border p-2.5">
            {s.urgency === 'critical' ? (
              <AlertTriangle className="h-4 w-4 text-danger flex-shrink-0 mt-0.5" />
            ) : (
              <ArrowRight className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground leading-relaxed">{s.suggestion}</p>
              <div className="mt-1.5 flex items-center gap-3 text-[12px] text-muted">
                <span style={{
                  color: s.urgency === 'critical' ? '#EF4444' : s.urgency === 'high' ? '#F59E0B' : '#3B82F6'
                }}>
                  {t('熵值', 'Entropy')}: {s.entropy}%
                </span>
                <span>{s.trend === 'increasing' ? t('📈 恶化中', '📈 Worsening') : s.trend === 'decreasing' ? t('📉 改善中', '📉 Improving') : t('➡️ 稳定', '➡️ Stable')}</span>
                {s.daysToStale > 0 && <span>{en ? `Risk in ${s.daysToStale} days` : `${s.daysToStale} 天后变危险`}</span>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Link href={`/compose?contactId=${s.contact.id}&accountId=${accountId}`} className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent/20 transition-colors">
                  <Mail className="h-3 w-3" /> {t('撰写邮件', 'Draft email')}
                </Link>
                <Link href={`/contacts/${s.contact.id}`} className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2.5 py-1 text-[12px] font-medium text-blue-600 hover:bg-blue-500/20 transition-colors">
                  <User2 className="h-3 w-3" /> {t('查看画像', 'View profile')}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
