'use client';

import { useToastStore } from '@/lib/toast-store';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

const TOAST_STYLES = {
  success: { icon: CheckCircle2, bg: 'bg-positive/10 border-positive/30', text: 'text-positive' },
  error: { icon: XCircle, bg: 'bg-danger/10 border-danger/30', text: 'text-danger' },
  warning: { icon: AlertTriangle, bg: 'bg-warning/10 border-warning/30', text: 'text-warning' },
};

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  const removeToast = useToastStore(s => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => {
        const style = TOAST_STYLES[t.type];
        const Icon = style.icon;
        return (
          <div key={t.id} className={`flex items-center gap-2 rounded-lg border ${style.bg} px-4 py-3 shadow-lg animate-in slide-in-from-right`}>
            <Icon className={`h-4 w-4 ${style.text}`} />
            <span className="text-sm text-foreground">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="ml-2 text-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
