"use client";

import type { ContactRole } from '@/lib/babel-engine/types';
import { ROLE_LABELS } from '@/lib/constants';
import { ConfidenceMeter } from './confidence-meter';

interface InferredRoleBadgeProps {
  role?: ContactRole;
  roleSource?: string;
  roleConfidence?: number;
}

export function InferredRoleBadge({ role, roleSource, roleConfidence }: InferredRoleBadgeProps) {
  if (!role || role === 'unknown' || role === 'contact') return null;

  const label = ROLE_LABELS[role] ?? role;
  const isAI = roleSource && roleSource !== 'manual';

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-secondary">
      {label}
      {isAI && (
        <span className="rounded bg-accent/15 px-1 py-px text-[10px] font-semibold text-accent">
          AI
        </span>
      )}
      {isAI && roleConfidence != null && (
        <ConfidenceMeter value={roleConfidence} size="sm" showLabel={false} />
      )}
    </span>
  );
}
