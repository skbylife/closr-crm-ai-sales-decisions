'use client';

import type { Task } from '@/lib/babel-engine/types';
import { useLocale } from '@/lib/i18n';

interface NextActionBadgeProps {
  task: Task | null;
}

export function NextActionBadge({ task }: NextActionBadgeProps) {
  const { t } = useLocale();

  if (!task) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-amber-700/20 bg-amber-700 px-2.5 py-1.5 text-xs text-white shadow-sm">
        <span>⚠️</span>
        <span className="font-medium text-white">{t('pipeline.nextAction.none')}</span>
      </div>
    );
  }

  const isOverdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm ${
        isOverdue
          ? 'border-red-900/20 bg-red-700 text-white'
          : 'border-blue-900/20 bg-blue-700 text-white'
      }`}
    >
      <span>📋</span>
      <span className="truncate font-medium text-white">{task.title}</span>
      {task.dueDate && (
        <span className="ml-auto flex-shrink-0 text-white/85">
          {task.dueDate.slice(0, 10)}
        </span>
      )}
    </div>
  );
}
