'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Languages } from 'lucide-react';
import { useLocale, type Locale } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';

const OPTIONS: Array<{
  locale: Locale;
  title: string;
  subtitle: string;
  sample: string;
}> = [
  {
    locale: 'zh',
    title: '中文',
    subtitle: '使用中文界面和默认中文 AI 分析',
    sample: '适合中文销售团队和本土客户场景',
  },
  {
    locale: 'en',
    title: 'English',
    subtitle: 'Use English UI and default English AI analysis',
    sample: 'Best for global teams and English CRM workflows',
  },
];

export function LanguageChoiceModal() {
  const { locale, setLocale } = useLocale();
  const { user } = useAuth();
  const languageSelectedAt = useStore((s) => s.userSettings.languageSelectedAt);
  const setUserSettings = useStore((s) => s.setUserSettings);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setOpen(false);
      return;
    }

    if (languageSelectedAt) {
      setOpen(false);
      return;
    }

    try {
      const fallbackKey = `closr-language-selected:${user.id}`;
      setOpen(localStorage.getItem(fallbackKey) !== 'true');
    } catch {
      setOpen(true);
    }
  }, [languageSelectedAt, user]);

  useEffect(() => {
    if (!open) return;

    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      active?.focus();
    };
  }, [open]);

  const chooseLocale = (nextLocale: Locale) => {
    const selectedAt = new Date().toISOString();
    setLocale(nextLocale);
    setUserSettings({ languageSelectedAt: selectedAt });
    try {
      if (user) localStorage.setItem(`closr-language-selected:${user.id}`, 'true');
    } catch {
      // Supabase-backed setting is authoritative; localStorage is only a same-browser fallback.
    }
    setOpen(false);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-choice-title"
        tabIndex={-1}
        className="w-full max-w-[520px] rounded-2xl border border-border bg-card"
        style={{ boxShadow: 'var(--shadow-floating)' }}
      >
        <div className="border-b border-border-subtle px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Languages className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-muted">Closr language</p>
              <h2 id="language-choice-title" className="mt-1 text-lg font-semibold text-foreground">
                选择你的工作语言 / Choose your language
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                这个选择会影响界面文案、金额默认币种和 AI 分析输出。之后可以在设置里修改。
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {OPTIONS.map((option) => {
            const selected = locale === option.locale;
            return (
              <button
                key={option.locale}
                type="button"
                onClick={() => chooseLocale(option.locale)}
                className={`group flex min-h-[156px] flex-col justify-between rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  selected
                    ? 'border-accent bg-accent/5 text-foreground'
                    : 'border-border bg-background hover:border-accent/50 hover:bg-sidebar'
                }`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-base font-semibold">{option.title}</span>
                    <span className="mt-2 block text-sm leading-5 text-secondary">{option.subtitle}</span>
                  </span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      selected ? 'border-accent bg-accent text-white' : 'border-border text-transparent group-hover:border-accent/50'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </span>
                <span className="mt-5 block rounded-lg bg-card px-3 py-2 text-xs leading-5 text-muted">
                  {option.sample}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
