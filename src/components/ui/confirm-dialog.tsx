'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmStore } from '@/lib/confirm-store';
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react';

const VARIANT_STYLES = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    confirmBtn: 'bg-danger text-white hover:bg-danger/90',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    confirmBtn: 'bg-warning text-white hover:bg-warning/90',
  },
  default: {
    icon: HelpCircle,
    iconBg: 'bg-accent/10',
    iconColor: 'text-accent',
    confirmBtn: 'bg-accent text-white hover:bg-accent/90',
  },
};

export function ConfirmDialog() {
  const { open, title, message, confirmLabel, cancelLabel, variant, close } = useConfirmStore();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(false);
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [open, close]);

  if (!open) return null;

  const style = VARIANT_STYLES[variant];
  const Icon = style.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) close(false); }}
    >
      <div className="w-full max-w-sm animate-in zoom-in-95 fade-in rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex flex-col items-center px-6 pt-6 pb-2 text-center">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${style.iconBg} mb-3`}>
            <Icon className={`h-6 w-6 ${style.iconColor}`} />
          </div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{message}</p>
        </div>
        <div className="flex gap-3 px-6 py-4">
          <button
            onClick={() => close(false)}
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-opacity ${style.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
