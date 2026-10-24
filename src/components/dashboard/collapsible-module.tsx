'use client';

import { ChevronDown } from 'lucide-react';
import { useStore } from '@/lib/store';

interface CollapsibleModuleProps {
  moduleKey: string;
  title: string;
  defaultExpanded: boolean;
  children: React.ReactNode;
}

export function CollapsibleModule({ moduleKey, title, defaultExpanded, children }: CollapsibleModuleProps) {
  const stored = useStore((s) => s.dashboardCollapseState[moduleKey]);
  const setModuleExpanded = useStore((s) => s.setModuleExpanded);
  const expanded = stored ?? defaultExpanded;

  return (
    <div>
      <button
        onClick={() => setModuleExpanded(moduleKey, !expanded)}
        className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 text-left transition-colors hover:bg-stripe"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}
