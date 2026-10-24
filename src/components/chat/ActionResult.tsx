'use client';

import { useState, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionResultItem {
  toolName: string;
  displayName: string;
  success: boolean;
  message: string;
  canUndo: boolean;
  undoExpiresAt: Date;
  onUndo: () => void;
}

interface ActionResultProps {
  results: ActionResultItem[];
}

// ─── Single result row ────────────────────────────────────────────────────────

function ResultRow({ item }: { item: ActionResultItem }) {
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Countdown timer for undo window
  useEffect(() => {
    if (!item.canUndo || undone) return;

    const update = () => {
      const now = Date.now();
      const expiry = item.undoExpiresAt.getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft('');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [item.canUndo, item.undoExpiresAt, undone]);

  const handleUndo = async () => {
    if (undoing || undone) return;
    setUndoing(true);
    try {
      await item.onUndo();
      setUndone(true);
    } finally {
      setUndoing(false);
    }
  };

  const canStillUndo = item.canUndo && !undone && timeLeft !== '';

  return (
    <div className={`flex items-start gap-3 rounded-lg p-2.5 ${
      undone
        ? 'bg-gray-50 dark:bg-gray-900/20 opacity-60'
        : item.success
          ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
          : 'bg-red-50/40 dark:bg-red-900/10'
    }`}>
      {/* Icon */}
      <span className="shrink-0 text-base leading-none mt-0.5">
        {undone ? '↩️' : item.success ? '✅' : '❌'}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground">{item.displayName}</span>
          {undone && (
            <span className="text-[10px] rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 text-gray-500 dark:text-gray-400">
              已撤销
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.message}</p>
      </div>

      {/* Undo button */}
      {canStillUndo && (
        <button
          onClick={handleUndo}
          disabled={undoing}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {undoing ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          ) : (
            '↩'
          )}
          <span>撤销</span>
          <span className="text-muted-foreground tabular-nums">{timeLeft}</span>
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActionResult({ results }: ActionResultProps) {
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden mt-2">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-sidebar px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-xs font-bold shrink-0">
          AI
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">执行完成</p>
          <p className="text-[11px] text-muted-foreground">
            {successCount > 0 && `✅ ${successCount} 个成功`}
            {failCount > 0 && ` ❌ ${failCount} 个失败`}
          </p>
        </div>
      </div>

      {/* Results */}
      <div className="space-y-2 p-4">
        {results.map((item, i) => (
          <ResultRow key={i} item={item} />
        ))}
      </div>
    </div>
  );
}
