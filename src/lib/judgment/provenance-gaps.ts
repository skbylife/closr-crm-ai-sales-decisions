import type {
  AccountJudgmentProvenanceResult,
  JudgmentProvenanceTrace,
  JudgmentProvenanceVerificationResult,
  TraceStatus,
} from './provenance-verifier';

const TRACE_STATUS_LABELS: Record<TraceStatus, string> = {
  persisted: 'Persisted',
  derived: 'Derived',
  missing: 'Missing',
  invalid: 'Invalid',
};

const TRACE_SEVERITY: Record<TraceStatus, number> = {
  invalid: 0,
  missing: 1,
  derived: 2,
  persisted: 3,
};

export interface ProvenanceGapTraceItem {
  id: string;
  sourceKind: JudgmentProvenanceTrace['sourceKind'];
  traceStatus: TraceStatus;
  sourceRecordId?: string;
  sourceTable?: string | null;
  sourceRowId?: string | null;
  expectedSourceRowId?: string;
  issueCodes: string[];
  issueCount: number;
  drilldownHref: string;
}

export interface ProvenanceGapAccount {
  accountId: string;
  accountName: string;
  accountKey: string;
  status: AccountJudgmentProvenanceResult['status'];
  traceStatus: TraceStatus;
  counts: Record<TraceStatus, number>;
  requiredKinds: AccountJudgmentProvenanceResult['requiredKinds'];
  gapKinds: AccountJudgmentProvenanceResult['requiredKinds'];
  issueCount: number;
  drilldownHref: string;
  traces: ProvenanceGapTraceItem[];
}

export interface ProvenanceTraceStatusSummaryItem {
  status: TraceStatus;
  label: string;
  traceCount: number;
  accountCount: number;
}

export interface ProvenanceGapWorkbench {
  status: JudgmentProvenanceVerificationResult['status'];
  counts: JudgmentProvenanceVerificationResult['totals'] & {
    gaps: number;
    accountTraceStatus: Record<TraceStatus, number>;
  };
  traceStatusSummary: ProvenanceTraceStatusSummaryItem[];
  topGapAccounts: ProvenanceGapAccount[];
  generatedAt: string;
}

function accountHref(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=knowledge`;
}

function traceHref(accountId: string, trace: JudgmentProvenanceTrace): string {
  const encodedAccountId = encodeURIComponent(accountId);
  const sourceRowId = trace.sourceRowId ?? trace.expectedSourceRowId;
  const encodedSourceRowId = sourceRowId ? encodeURIComponent(sourceRowId) : '';
  const sourceRecordId = trace.sourceRecordId ? encodeURIComponent(trace.sourceRecordId) : '';

  if (trace.sourceKind === 'decode' && encodedSourceRowId) {
    return `/accounts/${encodedAccountId}?tab=activity&targetKind=email_decode&targetId=${encodedSourceRowId}`;
  }

  if (trace.sourceKind === 'strategic_play' && encodedSourceRowId) {
    return `/accounts/${encodedAccountId}?tab=plays&playId=${encodedSourceRowId}`;
  }

  if (sourceRecordId) {
    return `/accounts/${encodedAccountId}?tab=knowledge&targetKind=source_record&targetId=${sourceRecordId}`;
  }

  if (encodedSourceRowId) {
    return `/accounts/${encodedAccountId}?tab=knowledge&targetKind=${encodeURIComponent(trace.sourceTable ?? 'source_record')}&targetId=${encodedSourceRowId}`;
  }

  return accountHref(accountId);
}

function countTraces(traces: JudgmentProvenanceTrace[]): Record<TraceStatus, number> {
  return {
    persisted: traces.filter((trace) => trace.traceStatus === 'persisted').length,
    derived: traces.filter((trace) => trace.traceStatus === 'derived').length,
    missing: traces.filter((trace) => trace.traceStatus === 'missing').length,
    invalid: traces.filter((trace) => trace.traceStatus === 'invalid').length,
  };
}

function gapKindsForAccount(account: AccountJudgmentProvenanceResult) {
  return [...new Set(account.traces
    .filter((trace) => trace.traceStatus !== 'persisted')
    .map((trace) => trace.sourceKind))];
}

function buildGapAccount(account: AccountJudgmentProvenanceResult): ProvenanceGapAccount {
  const counts = countTraces(account.traces);
  const traces = account.traces
    .filter((trace) => trace.traceStatus !== 'persisted')
    .sort((a, b) => TRACE_SEVERITY[a.traceStatus] - TRACE_SEVERITY[b.traceStatus])
    .map((trace) => ({
      id: `${account.accountId}:${trace.sourceKind}:${trace.expectedSourceRowId ?? trace.sourceRowId ?? trace.sourceRecordId ?? trace.traceStatus}`,
      sourceKind: trace.sourceKind,
      traceStatus: trace.traceStatus,
      ...(trace.sourceRecordId ? { sourceRecordId: trace.sourceRecordId } : {}),
      sourceTable: trace.sourceTable ?? null,
      sourceRowId: trace.sourceRowId ?? null,
      ...(trace.expectedSourceRowId ? { expectedSourceRowId: trace.expectedSourceRowId } : {}),
      issueCodes: [...new Set(trace.issues.map((issue) => issue.code))],
      issueCount: trace.issues.length,
      drilldownHref: traceHref(account.accountId, trace),
    }));

  return {
    accountId: account.accountId,
    accountName: account.accountName,
    accountKey: account.accountKey,
    status: account.status,
    traceStatus: account.traceStatus,
    counts,
    requiredKinds: account.requiredKinds,
    gapKinds: gapKindsForAccount(account),
    issueCount: account.issues.length,
    drilldownHref: accountHref(account.accountId),
    traces,
  };
}

export function buildProvenanceGapWorkbench(
  verification: JudgmentProvenanceVerificationResult,
  params: { topLimit?: number; generatedAt?: string } = {},
): ProvenanceGapWorkbench {
  const accountTraceStatus = verification.accounts.reduce<Record<TraceStatus, number>>((acc, account) => {
    acc[account.traceStatus] += 1;
    return acc;
  }, { persisted: 0, derived: 0, missing: 0, invalid: 0 });

  const traceStatusSummary = (['persisted', 'derived', 'missing', 'invalid'] as const).map((status) => ({
    status,
    label: TRACE_STATUS_LABELS[status],
    traceCount: verification.totals[status],
    accountCount: accountTraceStatus[status],
  }));

  const topLimit = Math.max(1, Math.min(Math.floor(params.topLimit ?? 6), 20));
  const topGapAccounts = verification.accounts
    .filter((account) => account.status === 'fail' || account.traceStatus !== 'persisted')
    .map((account) => buildGapAccount(account))
    .sort((a, b) => {
      const severityDelta = TRACE_SEVERITY[a.traceStatus] - TRACE_SEVERITY[b.traceStatus];
      if (severityDelta !== 0) return severityDelta;
      const gapDelta = (b.counts.invalid + b.counts.missing + b.counts.derived) - (a.counts.invalid + a.counts.missing + a.counts.derived);
      if (gapDelta !== 0) return gapDelta;
      return b.issueCount - a.issueCount;
    })
    .slice(0, topLimit);

  return {
    status: verification.status,
    counts: {
      ...verification.totals,
      gaps: verification.totals.derived + verification.totals.missing + verification.totals.invalid + accountTraceStatus.missing,
      accountTraceStatus,
    },
    traceStatusSummary,
    topGapAccounts,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  };
}
