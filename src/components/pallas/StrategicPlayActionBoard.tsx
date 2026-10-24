'use client';

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ListChecks,
  Loader2,
  UserRound,
} from 'lucide-react';
import type { PallasActionProposal } from '@/lib/pallas/types';
import type { PallasStrategicPlayActionBoardData, PallasStrategicPlayActionItem } from '@/lib/pallas/strategic-play-action-board';
import { PallasConfirmationDetailPanel } from './PallasConfirmationDetailPanel';

type StrategicPlayActionBoardProps = {
  data: PallasStrategicPlayActionBoardData;
  proposalCount?: number;
  proposal?: PallasActionProposal | null;
  proposalError?: string | null;
  onCreateProposal?: () => void;
  isCreatingProposal?: boolean;
  onConfirmProposal?: () => void;
  onRejectProposal?: () => void;
  onExpireProposal?: () => void;
  onExecuteProposal?: () => void;
  isUpdatingProposalStatus?: boolean;
  proposalStatusAction?: 'confirmed' | 'rejected' | 'expired' | null;
  proposalStatusError?: string | null;
  proposalStatusMessage?: string | null;
  isExecutingProposal?: boolean;
  proposalExecutionError?: string | null;
  proposalExecutionMessage?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  planned: '待推进',
  pending: '待推进',
  in_progress: '进行中',
  blocked: '受阻',
  done: '已完成',
  completed: '已完成',
  invalidated: '已失效',
  skipped: '已跳过',
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function statusTone(status: string) {
  if (status === 'blocked') return 'border-danger/25 bg-danger/5 text-danger';
  if (status === 'done' || status === 'completed') return 'border-positive/25 bg-positive/5 text-positive';
  if (status === 'in_progress') return 'border-accent/25 bg-accent/5 text-accent';
  return 'border-border bg-background text-secondary';
}

function priorityTone(priority: PallasStrategicPlayActionItem['priority']) {
  if (priority === 'high') return 'text-danger';
  if (priority === 'low') return 'text-muted';
  return 'text-warning';
}

function ActionItem({ item }: { item: PallasStrategicPlayActionItem }) {
  const completed = item.status === 'done' || item.status === 'completed';

  return (
    <li className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_180px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
            {item.stepIndex}
          </span>
          <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">{item.title}</h4>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(item.status)}`}>
            {statusLabel(item.status)}
          </span>
        </div>

        {item.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-secondary">{item.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
          {item.owner && (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {item.owner}
            </span>
          )}
          {item.dueDate && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {item.dueDate}
            </span>
          )}
          {item.timing && (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {item.timing}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 font-medium ${priorityTone(item.priority)}`}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {item.priority}
          </span>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3 text-xs leading-relaxed text-secondary">
        <p className="font-medium text-foreground">{completed ? '已闭环' : '执行判断'}</p>
        {item.expectedOutcome && <p>预期：{item.expectedOutcome}</p>}
        {item.risk && <p>风险：{item.risk}</p>}
        {item.fallback && <p>备选：{item.fallback}</p>}
      </div>
    </li>
  );
}

export function StrategicPlayActionBoard({
  data,
  proposalCount,
  proposal,
  proposalError,
  onCreateProposal,
  isCreatingProposal = false,
  onConfirmProposal,
  onRejectProposal,
  onExpireProposal,
  onExecuteProposal,
  isUpdatingProposalStatus = false,
  proposalStatusAction = null,
  proposalStatusError = null,
  proposalStatusMessage = null,
  isExecutingProposal = false,
  proposalExecutionError = null,
  proposalExecutionMessage = null,
}: StrategicPlayActionBoardProps) {
  const pendingCount = proposalCount ?? data.items.filter((item) => !['done', 'completed', 'invalidated', 'cancelled', 'canceled', 'skipped'].includes(item.status)).length;
  const hasReusableProposal = proposal?.status === 'awaiting_confirmation';

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border bg-background/60 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            <ListChecks className="h-4 w-4" />
            Pallas 行动板
          </div>
          <h3 className="truncate text-base font-semibold text-foreground">{data.goalDescription}</h3>
          <p className="mt-1 text-sm text-muted">
            {data.items.length} 个步骤 · {pendingCount} 个可生成待确认草稿
          </p>
        </div>

        {onCreateProposal && (
          <button
            type="button"
            onClick={onCreateProposal}
            disabled={pendingCount === 0 || isCreatingProposal}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isCreatingProposal ? '检查中...' : hasReusableProposal ? '复用待确认草稿' : '生成待确认草稿'}
            {isCreatingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : pendingCount === 0 ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </header>

      {(proposal || proposalError) && (
        <div className="border-b border-border bg-background/40 px-4 py-4">
          {proposalError && (
            <div className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
              {proposalError}
            </div>
          )}

          {proposal && (
            <PallasConfirmationDetailPanel
              proposal={proposal}
              onConfirm={onConfirmProposal}
              onReject={onRejectProposal}
              onExpire={onExpireProposal}
              onExecute={onExecuteProposal}
              isUpdatingStatus={isUpdatingProposalStatus}
              statusAction={proposalStatusAction}
              statusError={proposalStatusError}
              statusMessage={proposalStatusMessage}
              isExecuting={isExecutingProposal}
              executionError={proposalExecutionError}
              executionMessage={proposalExecutionMessage}
            />
          )}
        </div>
      )}

      {data.items.length > 0 ? (
        <ol>
          {data.items.map((item) => (
            <ActionItem key={`${item.stepIndex}-${item.title}`} item={item} />
          ))}
        </ol>
      ) : (
        <div className="px-4 py-8 text-sm text-muted">这个谋局还没有可展示的步骤。</div>
      )}
    </section>
  );
}
