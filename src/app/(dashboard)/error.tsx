'use client';

// Dashboard 全局错误页面 — 捕获子路由运行时错误
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/20 bg-danger/10">
        <AlertTriangle className="h-6 w-6 text-danger" />
      </div>
      <p className="text-lg font-semibold text-foreground">页面出错了</p>
      <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-secondary">
        发生了意外错误，请点击下方按钮重试
      </p>
      {process.env.NODE_ENV === 'development' && error.message && (
        <p className="mt-3 max-w-[400px] rounded-lg border border-border bg-sidebar px-3 py-2 text-xs text-muted">
          {error.message}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover"
      >
        <RefreshCw className="h-4 w-4" />
        重试
      </button>
    </div>
  );
}
