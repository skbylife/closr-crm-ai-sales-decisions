'use client';

import {
  Ban,
  Clock3,
  FileClock,
  LockKeyhole,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';
import { buildPallasConfirmationDetailContract, type PallasConfirmationBoundaryKind } from '@/lib/pallas/confirmation-detail';
import type { PallasActionProposal, PallasProposalField } from '@/lib/pallas/types';

type PallasConfirmationDetailPanelProps = {
  proposal: PallasActionProposal;
  onConfirm?: () => void;
  onReject?: () => void;
  onExpire?: () => void;
  onExecute?: () => void;
  isUpdatingStatus?: boolean;
  statusAction?: 'confirmed' | 'rejected' | 'expired' | null;
  statusError?: string | null;
  statusMessage?: string | null;
  isExecuting?: boolean;
  executionError?: string | null;
  executionMessage?: string | null;
};

const BOUNDARY_ICONS: Record<PallasConfirmationBoundaryKind, typeof ShieldCheck> = {
  permission: LockKeyhole,
  expiration: Clock3,
  rejection: Ban,
  execution: PlayCircle,
  audit: FileClock,
};

function fieldValue(value: string | null) {
  return value && value.trim() ? value : '（未设置）';
}

function confidenceLabel(field: PallasProposalField) {
  if (field.confidence === 'explicit') return '原文';
  return '待确认';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

export function PallasConfirmationDetailPanel({
  proposal,
  onConfirm,
  onReject,
  onExpire,
  onExecute,
  isUpdatingStatus = false,
  statusAction = null,
  statusError = null,
  statusMessage = null,
  isExecuting = false,
  executionError = null,
  executionMessage = null,
}: PallasConfirmationDetailPanelProps) {
  const contract = buildPallasConfirmationDetailContract(proposal);

  return (
    <section className="rounded-xl border border-accent/20 bg-accent/[0.035]">
      <header className="border-b border-accent/10 px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              <ShieldCheck className="h-4 w-4" />
              Confirmation Detail
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              {contract.mode === 'persisted' ? '确认详情合同（持久化提案）' : '确认详情合同（本地预览）'}
            </h4>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
              这里展示持久化确认详情和生命周期操作；确认只记录意图，创建任务必须再走独立执行动作，不会调用 execute-tools。
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 text-[11px] font-medium">
            <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-accent">
              {contract.statusLabel}
            </span>
            <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-warning">
              {contract.riskLabel}
            </span>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-secondary">
              {contract.mode === 'persisted' ? '生命周期详情' : '只读预览'}
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-xs text-secondary md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2">
            <p className="font-medium text-muted">Proposal</p>
            <p className="mt-1 truncate font-mono text-foreground">{contract.proposalId}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2">
            <p className="font-medium text-muted">生成时间</p>
            <p className="mt-1 text-foreground">{formatDateTime(contract.createdAt)}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2">
            <p className="font-medium text-muted">建议有效期</p>
            <p className={`mt-1 ${contract.isStale ? 'text-warning' : 'text-foreground'}`}>
              {formatDateTime(contract.expiresAt)}
            </p>
          </div>
        </div>

        <p className="mt-3 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs leading-relaxed text-secondary">
          {contract.statusDescription}
        </p>
        {proposal.resultSummary && (
          <p className="mt-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs leading-relaxed text-secondary">
            生命周期记录：{proposal.resultSummary}
          </p>
        )}
      </header>

      <div className="space-y-4 px-4 py-4">
        <div className="space-y-2">
          {proposal.actions.map((action, actionIndex) => (
            <article key={`${action.toolName}-${actionIndex}`} className="rounded-lg border border-border bg-card px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{action.displayName}</p>
                <span className="rounded-full border border-accent/25 bg-accent/5 px-2 py-0.5 text-[11px] font-medium text-accent">
                  {action.toolName}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {action.fields.map((field) => (
                  <div key={field.field} className="min-w-0 rounded-md bg-background/70 px-2.5 py-2 text-xs">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-secondary">{field.field}</span>
                      <span className="shrink-0 text-[11px] text-muted">{confidenceLabel(field)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-foreground">{fieldValue(field.value)}</p>
                    {field.source_quote && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                        来源：{field.source_quote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {contract.boundaries.map((boundary) => {
            const Icon = BOUNDARY_ICONS[boundary.kind];
            return (
              <div key={boundary.kind} className="rounded-lg border border-border bg-background/70 p-3 text-xs leading-relaxed">
                <div className="mb-1 flex items-center gap-2 font-semibold text-foreground">
                  <Icon className="h-3.5 w-3.5 text-accent" />
                  {boundary.title}
                </div>
                <p className="text-secondary">{boundary.description}</p>
              </div>
            );
          })}
        </div>

        {(statusError || statusMessage || executionError || executionMessage) && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${statusError || executionError ? 'border-danger/25 bg-danger/5 text-danger' : 'border-positive/25 bg-positive/5 text-positive'}`}
          >
            {statusError ?? executionError ?? statusMessage ?? executionMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {contract.controls.map((control) => {
            const isLifecycleAction = control.name === 'confirm' || control.name === 'reject' || control.name === 'expire';
            const clickHandler = control.name === 'confirm'
              ? onConfirm
              : control.name === 'reject'
                ? onReject
                : control.name === 'expire'
                  ? onExpire
                  : onExecute;
            const isBusy = isUpdatingStatus && (
              (control.name === 'confirm' && statusAction === 'confirmed') ||
              (control.name === 'reject' && statusAction === 'rejected') ||
              (control.name === 'expire' && statusAction === 'expired')
            ) || (control.name === 'execute' && isExecuting);
            const canClick = control.enabled && Boolean(clickHandler) && !isUpdatingStatus && !isExecuting;
            const enabledClass = control.name === 'confirm'
              ? 'border-accent/25 bg-accent/10 text-accent hover:bg-accent/15'
              : control.name === 'reject'
                ? 'border-danger/25 bg-danger/5 text-danger hover:bg-danger/10'
                : control.name === 'expire'
                  ? 'border-warning/25 bg-warning/5 text-warning hover:bg-warning/10'
                  : 'border-positive/25 bg-positive/5 text-positive hover:bg-positive/10';
            return (
              <button
                key={control.name}
                type="button"
                disabled={!canClick}
                onClick={canClick ? clickHandler : undefined}
                title={control.reason}
                className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isLifecycleAction && control.enabled ? enabledClass : 'border-border bg-background text-muted'}`}
              >
                {isBusy ? '处理中...' : control.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
