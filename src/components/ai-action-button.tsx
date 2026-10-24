'use client';

import { useState } from 'react';
import { CheckCircle2, ListPlus } from 'lucide-react';
import { useStore } from '@/lib/store';
import { toast } from '@/lib/toast-store';

interface AIActionButtonProps {
  suggestion: string;
  accountId?: string;
  opportunityId?: string;
  source: 'strategy' | 'intel' | 'meddicc';
}

export function AIActionButton({ suggestion, accountId, opportunityId, source }: AIActionButtonProps) {
  const [created, setCreated] = useState(false);
  const createTaskFromAI = useStore(s => s.createTaskFromAI);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    createTaskFromAI({
      title: suggestion.slice(0, 80),
      description: suggestion,
      accountId,
      opportunityId,
      source,
    });
    setCreated(true);
    toast('任务已创建');
  };

  if (created) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-positive">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已创建任务
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
    >
      <ListPlus className="h-3.5 w-3.5" />
      创建任务
    </button>
  );
}
