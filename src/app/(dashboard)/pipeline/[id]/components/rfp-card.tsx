'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  Edit3,
  Trash2,
  Calendar,
  Clock,
} from 'lucide-react';
import type { RfpStatus } from '@/lib/babel-engine/types';
import { RFP_STATUS_LABELS } from '@/lib/babel-engine/types';
import { RfpCompetitors } from './rfp-competitors';
import type { RfpCompetitor } from './rfp-competitors';
import { RfpMilestones } from './rfp-milestones';
import type { RfpMilestone } from './rfp-milestones';
import { RfpDocuments } from './rfp-documents';
import type { RfpDocument } from './rfp-documents';
import { RfpAiPanel } from './rfp-ai-panel';
import type { RfpAnalysis } from './rfp-ai-panel';

// ─── Types ──────────────────────────────────────────────────────────

export interface RfpData {
  id: string;
  opportunityId: string;
  accountId: string;
  linkedPlayId: string | null;
  title: string;
  issuer: string;
  issuedDate: string;
  dueDate: string;
  status: RfpStatus;
  budget: number | null;
  currency: string;
  requirements: string[];
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  competitors: RfpCompetitor[];
  latestAnalysis: RfpAnalysis | null;
  documents: RfpDocument[];
  milestones: RfpMilestone[];
}

interface RfpCardProps {
  rfp: RfpData;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  defaultExpanded?: boolean;
  highlightedAnalysisId?: string | null;
  highlightedSignalIndex?: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<RfpStatus, string> = {
  identified: 'bg-slate-100 text-slate-600',
  preparing: 'bg-blue-50 text-blue-600',
  submitted: 'bg-accent/10 text-accent',
  shortlisted: 'bg-positive/10 text-positive',
  won: 'bg-positive text-white',
  lost: 'bg-danger/10 text-danger',
  no_bid: 'bg-muted/10 text-muted',
};

const JUDGMENT_BADGES = {
  bid: { label: '投标', className: 'bg-positive/10 text-positive' },
  no_bid: { label: '放弃', className: 'bg-danger/10 text-danger' },
  cautious_bid: { label: '谨慎投标', className: 'bg-warning/10 text-warning' },
  need_more_intel: { label: '先补情报', className: 'bg-accent/10 text-accent' },
} as const;

function daysUntil(dateStr: string): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount == null) return '';
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  return `${symbol}${amount.toLocaleString()}`;
}

// ─── Component ──────────────────────────────────────────────────────

export function RfpCard({
  rfp,
  onEdit,
  onDelete,
  onRefresh,
  defaultExpanded = false,
  highlightedAnalysisId,
  highlightedSignalIndex,
}: RfpCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const daysLeft = daysUntil(rfp.dueDate);
  const isUrgent = daysLeft <= 7 && daysLeft >= 0;
  const isOverdue = daysLeft < 0;
  const isClosed = ['won', 'lost', 'no_bid'].includes(rfp.status);
  const judgment = rfp.latestAnalysis?.judgment;
  const judgmentBadge = judgment ? JUDGMENT_BADGES[judgment.decision] : null;

  const handleRefreshCard = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  return (
    <div className={`rounded-xl border bg-card card-elevated ${isOverdue && !isClosed ? 'border-danger/30' : isUrgent && !isClosed ? 'border-warning/30' : 'border-border'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-5 w-5 text-accent flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{rfp.title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${STATUS_COLORS[rfp.status]}`}>
                {RFP_STATUS_LABELS[rfp.status]}
              </span>
              {rfp.issuer && <span className="text-[12px] text-muted">{rfp.issuer}</span>}
              {rfp.dueDate && !isClosed && (
                <span className={`text-[12px] font-medium ${isOverdue ? 'text-danger' : isUrgent ? 'text-warning' : 'text-secondary'}`}>
                  {isOverdue ? `已逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今天截止' : `${daysLeft} 天后截止`}
                </span>
              )}
              {rfp.competitors.length > 0 && (
                <span className="text-[12px] text-muted">{rfp.competitors.length} 竞对</span>
              )}
              {judgmentBadge && (
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${judgmentBadge.className}`}>
                  判断：{judgmentBadge.label} · {judgment?.confidence}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rfp.budget != null && <span className="text-xs text-secondary">{formatCurrency(rfp.budget, rfp.currency)}</span>}
          {expanded ? <ChevronDown className="h-4 w-4 text-secondary" /> : <ChevronRight className="h-4 w-4 text-secondary" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Timeline */}
          <div className="flex gap-4 text-xs text-secondary">
            {rfp.issuedDate && (
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> 发标: {rfp.issuedDate}</span>
            )}
            {rfp.dueDate && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> 截止: {rfp.dueDate}</span>
            )}
          </div>

          {/* Notes */}
          {rfp.notes && <p className="text-xs text-muted">{rfp.notes}</p>}

          {/* Competitors */}
          <RfpCompetitors rfpId={rfp.id} competitors={rfp.competitors} onUpdate={handleRefreshCard} />

          {/* Milestones */}
          <RfpMilestones rfpId={rfp.id} milestones={rfp.milestones} onUpdate={handleRefreshCard} />

          {/* Documents */}
          <RfpDocuments rfpId={rfp.id} documents={rfp.documents} onUpdate={handleRefreshCard} />

          {/* AI Panel */}
          <RfpAiPanel
            rfpId={rfp.id}
            rfpTitle={rfp.title}
            accountId={rfp.accountId}
            opportunityId={rfp.opportunityId}
            latestAnalysis={rfp.latestAnalysis}
            linkedPlayId={rfp.linkedPlayId}
            highlightedAnalysisId={highlightedAnalysisId}
            highlightedSignalIndex={highlightedSignalIndex}
            onRfpUpdate={handleRefreshCard}
          />

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button onClick={onEdit} className="flex items-center gap-1 text-xs text-secondary hover:text-foreground"><Edit3 className="h-3 w-3" /> 编辑</button>
            <button onClick={onDelete} className="flex items-center gap-1 text-xs text-danger hover:text-danger/80"><Trash2 className="h-3 w-3" /> 删除</button>
          </div>
        </div>
      )}
    </div>
  );
}
