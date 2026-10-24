"use client";

import { Sparkles } from 'lucide-react';
import type { Contact, ContactProfileResult } from '@/lib/babel-engine/types';
import { DISCTypeBadge } from './disc-type-badge';
import { InferredRoleBadge } from './inferred-role-badge';

const JOB_LEVEL_LABELS: Record<number, string> = {
  0: '销售代表 (AE)',
  1: '总监 (Director)',
  2: '高管 (Executive)',
};

interface AIInferenceSummaryProps {
  contact: Contact;
  contactProfile?: ContactProfileResult;
}

export function AIInferenceSummaryCard({ contact, contactProfile }: AIInferenceSummaryProps) {
  const hasRole = contact.role && contact.role !== 'unknown' && contact.role !== 'contact' && contact.roleSource && contact.roleSource !== 'manual';
  const hasDISC = contactProfile?.discType;
  const hasJobLevel = contact.jobLevel != null;

  if (!hasRole && !hasDISC && !hasJobLevel) return null;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-accent" />
        AI 推断
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Role */}
        {hasRole && (
          <div>
            <p className="text-[11px] font-medium text-secondary mb-1">组织角色</p>
            <div className="flex items-center gap-2">
              <InferredRoleBadge
                role={contact.role}
                roleSource={contact.roleSource}
                roleConfidence={contact.roleConfidence}
              />
            </div>
            {contactProfile?.inferredRoleEvidence && (
              <p className="mt-1 text-[11px] text-muted line-clamp-2">
                {contactProfile.inferredRoleEvidence}
              </p>
            )}
          </div>
        )}

        {/* DISC */}
        {hasDISC && (
          <div>
            <p className="text-[11px] font-medium text-secondary mb-1">DISC 人格</p>
            <DISCTypeBadge
              discType={contactProfile?.discType}
              confidence={contactProfile?.discConfidence}
              approach={contactProfile?.discApproach}
              evidence={contactProfile?.discEvidence}
            />
          </div>
        )}

        {/* Job Level */}
        {hasJobLevel && (
          <div>
            <p className="text-[11px] font-medium text-secondary mb-1">职级</p>
            <span className="text-xs text-foreground">
              {JOB_LEVEL_LABELS[contact.jobLevel!] ?? `L${contact.jobLevel}`}
            </span>
          </div>
        )}

        {/* Enrichment Status */}
        {contact.enrichedAt && (
          <div>
            <p className="text-[11px] font-medium text-secondary mb-1">最近丰富</p>
            <span className="text-[11px] text-muted">
              {new Date(contact.enrichedAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
