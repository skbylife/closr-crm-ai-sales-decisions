import type { JudgmentMemorySourceKind } from './memory';

export type ProvenanceStatus = 'pass' | 'fail';
export type TraceStatus = 'persisted' | 'derived' | 'missing' | 'invalid';

export interface ExpectedJudgmentSource {
  sourceKind: JudgmentMemorySourceKind;
  sourceTable: string;
  sourceRowId: string;
  accountId: string;
}

const JUDGMENT_MEMORY_KINDS = ['decode', 'rfp_analysis', 'strategic_play'] as const satisfies readonly JudgmentMemorySourceKind[];
const JUDGMENT_SOURCE_KIND_TO_SOURCE_RECORD_KIND: Record<JudgmentMemorySourceKind, string> = {
  decode: 'email_decode',
  rfp_analysis: 'source_record',
  strategic_play: 'strategic_play',
};

export interface ProvenanceAccount {
  id: string;
  key: string;
  name: string;
}

export interface ProvenanceSourceRecordRow {
  id: string;
  account_id: string | null;
  org_id?: string | null;
  source_kind?: string | null;
  source_table?: string | null;
  source_row_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ProvenanceAccountScopedRow {
  id: string;
  account_id: string | null;
  org_id?: string | null;
}

export interface ProvenanceRfpRow {
  id: string;
  account_id: string | null;
  org_id?: string | null;
}

export interface ProvenanceRfpAnalysisRow {
  id: string;
  rfp_id: string | null;
  org_id?: string | null;
}

export interface JudgmentProvenanceIssue {
  code:
    | 'source_records_missing'
    | 'judgment_source_missing'
    | 'source_record_org_mismatch'
    | 'source_record_account_mismatch'
    | 'source_kind_mismatch'
    | 'missing_source_pointer'
    | 'judgment_memory_missing'
    | 'judgment_memory_field_missing'
    | 'evidence_refs_missing'
    | 'evidence_ref_invalid'
    | 'judgment_memory_pointer_mismatch'
    | 'evidence_ref_pointer_mismatch'
    | 'source_row_missing'
    | 'source_row_org_mismatch'
    | 'source_row_account_mismatch'
    | 'unsupported_source_table';
  message: string;
  sourceRecordId?: string;
  sourceKind?: JudgmentMemorySourceKind;
  expectedSourceRowId?: string;
  sourceTable?: string | null;
  sourceRowId?: string | null;
}

export interface JudgmentProvenanceTrace {
  sourceKind: JudgmentMemorySourceKind;
  traceStatus: TraceStatus;
  sourceRecordId?: string;
  expectedSourceRowId?: string;
  sourceTable?: string | null;
  sourceRowId?: string | null;
  issues: JudgmentProvenanceIssue[];
}

export interface AccountJudgmentProvenanceResult {
  accountId: string;
  accountKey: string;
  accountName: string;
  status: ProvenanceStatus;
  traceStatus: TraceStatus;
  requiredKinds: JudgmentMemorySourceKind[];
  persistedKinds: JudgmentMemorySourceKind[];
  derivedKinds: JudgmentMemorySourceKind[];
  requiredSources: ExpectedJudgmentSource[];
  traces: JudgmentProvenanceTrace[];
  issues: JudgmentProvenanceIssue[];
}

export interface JudgmentProvenanceVerificationResult {
  status: ProvenanceStatus;
  accounts: AccountJudgmentProvenanceResult[];
  totals: {
    accounts: number;
    passed: number;
    failed: number;
    persisted: number;
    derived: number;
    missing: number;
    invalid: number;
  };
}

export interface VerifyJudgmentProvenanceParams {
  orgId: string | null;
  accounts: ProvenanceAccount[];
  sourceRecords: ProvenanceSourceRecordRow[];
  emailDecodes: ProvenanceAccountScopedRow[];
  strategicPlays: ProvenanceAccountScopedRow[];
  rfps: ProvenanceRfpRow[];
  rfpAnalyses: ProvenanceRfpAnalysisRow[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isJudgmentMemorySourceKind(value: unknown): value is JudgmentMemorySourceKind {
  return typeof value === 'string' && (JUDGMENT_MEMORY_KINDS as readonly string[]).includes(value);
}

function getJudgmentPayload(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  const judgmentMemory = asRecord(metadata?.judgmentMemory);
  if (judgmentMemory) return judgmentMemory;

  if (
    hasText(metadata?.currentJudgment) ||
    hasText(metadata?.risk) ||
    hasText(metadata?.nextAction) ||
    Array.isArray(metadata?.evidenceRefs)
  ) {
    return metadata;
  }

  return null;
}

function getJudgmentSourceKind(row: ProvenanceSourceRecordRow): JudgmentMemorySourceKind | null {
  const metadata = asRecord(row.metadata);
  const payload = getJudgmentPayload(metadata);
  const rawKind = payload?.sourceKind ?? metadata?.sourceKind;
  return isJudgmentMemorySourceKind(rawKind) ? rawKind : null;
}

function validateEvidenceRefs(
  payload: Record<string, unknown>,
  metadata: Record<string, unknown> | null,
  row: ProvenanceSourceRecordRow,
  sourceKind: JudgmentMemorySourceKind,
  orgId: string | null,
  emailDecodesById: Map<string, ProvenanceAccountScopedRow>,
  strategicPlaysById: Map<string, ProvenanceAccountScopedRow>,
  rfpsById: Map<string, ProvenanceRfpRow>,
  rfpAnalysesById: Map<string, ProvenanceRfpAnalysisRow>,
): JudgmentProvenanceIssue[] {
  const evidenceRefs = payload.evidenceRefs ?? metadata?.evidenceRefs;
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    return [{
      code: 'evidence_refs_missing',
      message: 'metadata.judgmentMemory.evidenceRefs 缺失或为空，不能证明判断来源。',
      sourceRecordId: row.id,
      sourceKind,
      sourceTable: row.source_table ?? null,
      sourceRowId: row.source_row_id ?? null,
    }];
  }

  return evidenceRefs.flatMap((entry, index) => {
    const ref = asRecord(entry);
    const refSourceId = asText(ref?.sourceId);
    const refSourceKind = asText(ref?.sourceKind);
    const refSourceTable = asText(ref?.sourceTable);
    const refSourceRowId = asText(ref?.sourceRowId) ?? refSourceId;
    const issueBase = {
      sourceRecordId: row.id,
      sourceKind,
      sourceTable: row.source_table ?? null,
      sourceRowId: row.source_row_id ?? null,
    };

    if (!refSourceId || !refSourceKind) {
      return [{
        ...issueBase,
        code: 'evidence_ref_invalid' as const,
        message: `evidenceRefs[${index}] 缺少 sourceId/sourceKind。`,
      }];
    }

    const issues: JudgmentProvenanceIssue[] = [];
    if (refSourceRowId && refSourceId !== refSourceRowId) {
      issues.push({
        ...issueBase,
        code: 'evidence_ref_pointer_mismatch',
        message: `evidenceRefs[${index}].sourceId=${refSourceId} 与 sourceRowId=${refSourceRowId} 不一致。`,
      });
    }

    if (refSourceTable && refSourceRowId) {
      const refMatch = rowAccountIdForSourceTable({
        sourceTable: refSourceTable,
        sourceRowId: refSourceRowId,
        orgId,
        emailDecodesById,
        strategicPlaysById,
        rfpsById,
        rfpAnalysesById,
      });

      if (refMatch.unsupported || !refMatch.found) {
        issues.push({
          ...issueBase,
          code: refMatch.unsupported ? 'unsupported_source_table' : 'source_row_missing',
          message: refMatch.unsupported
            ? `evidenceRefs[${index}] 暂不支持校验 sourceTable=${refSourceTable}。`
            : `evidenceRefs[${index}] 指向的 ${refSourceTable}.${refSourceRowId} 不存在。`,
        });
      } else {
        if (!orgMatches(refMatch.orgId, orgId)) {
          issues.push({
            ...issueBase,
            code: 'source_row_org_mismatch',
            message: `evidenceRefs[${index}] 来源行 org_id=${refMatch.orgId ?? 'missing'} 与当前 org_id=${orgId ?? 'missing'} 不一致。`,
          });
        }
        if (refMatch.accountId !== row.account_id) {
          issues.push({
            ...issueBase,
            code: 'evidence_ref_pointer_mismatch',
            message: `evidenceRefs[${index}] 来源行 account_id=${refMatch.accountId ?? 'missing'} 与 source_record.account_id=${row.account_id ?? 'missing'} 不一致。`,
          });
        }
      }
    } else if (refSourceId !== row.source_row_id) {
      issues.push({
        ...issueBase,
        code: 'evidence_ref_pointer_mismatch',
        message: `evidenceRefs[${index}].sourceId=${refSourceId} 未提供可校验 sourceTable/sourceRowId，且不等于 source_record.source_row_id=${row.source_row_id ?? 'missing'}。`,
      });
    }

    return issues;
  });
}

function validateJudgmentMemory(
  row: ProvenanceSourceRecordRow,
  sourceKind: JudgmentMemorySourceKind,
  orgId: string | null,
  emailDecodesById: Map<string, ProvenanceAccountScopedRow>,
  strategicPlaysById: Map<string, ProvenanceAccountScopedRow>,
  rfpsById: Map<string, ProvenanceRfpRow>,
  rfpAnalysesById: Map<string, ProvenanceRfpAnalysisRow>,
): JudgmentProvenanceIssue[] {
  const metadata = asRecord(row.metadata);
  const payload = getJudgmentPayload(metadata);
  if (!payload) {
    return [{
      code: 'judgment_memory_missing',
      message: 'source_records.metadata 缺少 judgmentMemory 或等价判断字段。',
      sourceRecordId: row.id,
      sourceKind,
      sourceTable: row.source_table ?? null,
      sourceRowId: row.source_row_id ?? null,
    }];
  }

  const issues: JudgmentProvenanceIssue[] = [];
  for (const field of ['currentJudgment', 'risk', 'nextAction'] as const) {
    if (!hasText(payload[field])) {
      issues.push({
        code: 'judgment_memory_field_missing',
        message: `metadata.judgmentMemory.${field} 缺失。`,
        sourceRecordId: row.id,
        sourceKind,
        sourceTable: row.source_table ?? null,
        sourceRowId: row.source_row_id ?? null,
      });
    }
  }

  const payloadSourceId = asText(payload.sourceId);
  const payloadAccountId = asText(payload.accountId);
  if (payloadSourceId !== row.source_row_id) {
    issues.push({
      code: 'judgment_memory_pointer_mismatch',
      message: `metadata.judgmentMemory.sourceId=${payloadSourceId ?? 'missing'} 与 source_record.source_row_id=${row.source_row_id ?? 'missing'} 不一致。`,
      sourceRecordId: row.id,
      sourceKind,
      sourceTable: row.source_table ?? null,
      sourceRowId: row.source_row_id ?? null,
    });
  }
  if (payloadAccountId !== row.account_id) {
    issues.push({
      code: 'judgment_memory_pointer_mismatch',
      message: `metadata.judgmentMemory.accountId=${payloadAccountId ?? 'missing'} 与 source_record.account_id=${row.account_id ?? 'missing'} 不一致。`,
      sourceRecordId: row.id,
      sourceKind,
      sourceTable: row.source_table ?? null,
      sourceRowId: row.source_row_id ?? null,
    });
  }

  issues.push(...validateEvidenceRefs(payload, metadata, row, sourceKind, orgId, emailDecodesById, strategicPlaysById, rfpsById, rfpAnalysesById));
  return issues;
}

function orgMatches(rowOrgId: string | null | undefined, orgId: string | null): boolean {
  return Boolean(orgId) && rowOrgId === orgId;
}

function rowAccountIdForSourceTable(params: {
  sourceTable: string;
  sourceRowId: string;
  orgId: string | null;
  emailDecodesById: Map<string, ProvenanceAccountScopedRow>;
  strategicPlaysById: Map<string, ProvenanceAccountScopedRow>;
  rfpsById: Map<string, ProvenanceRfpRow>;
  rfpAnalysesById: Map<string, ProvenanceRfpAnalysisRow>;
}): { accountId: string | null; orgId?: string | null; found: boolean; unsupported?: boolean } {
  const { sourceTable, sourceRowId } = params;

  if (sourceTable === 'email_decodes') {
    const row = params.emailDecodesById.get(sourceRowId);
    return row ? { found: true, accountId: row.account_id, orgId: row.org_id } : { found: false, accountId: null };
  }

  if (sourceTable === 'strategic_plays') {
    const row = params.strategicPlaysById.get(sourceRowId);
    return row ? { found: true, accountId: row.account_id, orgId: row.org_id } : { found: false, accountId: null };
  }

  if (sourceTable === 'rfps') {
    const row = params.rfpsById.get(sourceRowId);
    return row ? { found: true, accountId: row.account_id, orgId: row.org_id } : { found: false, accountId: null };
  }

  if (sourceTable === 'rfp_ai_analyses') {
    const analysis = params.rfpAnalysesById.get(sourceRowId);
    if (!analysis) return { found: false, accountId: null };
    const rfp = analysis.rfp_id ? params.rfpsById.get(analysis.rfp_id) : undefined;
    return { found: true, accountId: rfp?.account_id ?? null, orgId: analysis.org_id ?? rfp?.org_id ?? null };
  }

  return { found: false, accountId: null, unsupported: true };
}

function validateSourcePointer(params: {
  accountId: string;
  orgId: string | null;
  row: ProvenanceSourceRecordRow;
  sourceKind: JudgmentMemorySourceKind;
  emailDecodesById: Map<string, ProvenanceAccountScopedRow>;
  strategicPlaysById: Map<string, ProvenanceAccountScopedRow>;
  rfpsById: Map<string, ProvenanceRfpRow>;
  rfpAnalysesById: Map<string, ProvenanceRfpAnalysisRow>;
}): JudgmentProvenanceIssue[] {
  const sourceTable = asText(params.row.source_table);
  const sourceRowId = asText(params.row.source_row_id);
  const issueBase = {
    sourceRecordId: params.row.id,
    sourceKind: params.sourceKind,
    sourceTable: params.row.source_table ?? null,
    sourceRowId: params.row.source_row_id ?? null,
  };

  if (!sourceTable || !sourceRowId) {
    return [{
      ...issueBase,
      code: 'missing_source_pointer',
      message: 'source_records 缺少 source_table/source_row_id。',
    }];
  }

  const match = rowAccountIdForSourceTable({
    sourceTable,
    sourceRowId,
    orgId: params.orgId,
    emailDecodesById: params.emailDecodesById,
    strategicPlaysById: params.strategicPlaysById,
    rfpsById: params.rfpsById,
    rfpAnalysesById: params.rfpAnalysesById,
  });

  if (match.unsupported) {
    return [{
      ...issueBase,
      code: 'unsupported_source_table',
      message: `暂不支持校验 source_table=${sourceTable} 的 account/org scope。`,
    }];
  }

  if (!match.found) {
    return [{
      ...issueBase,
      code: 'source_row_missing',
      message: `找不到 ${sourceTable}.${sourceRowId}，不能只凭 source_row_id 认定来源有效。`,
    }];
  }

  const issues: JudgmentProvenanceIssue[] = [];
  if (!orgMatches(match.orgId, params.orgId)) {
    issues.push({
      ...issueBase,
      code: 'source_row_org_mismatch',
      message: `来源行 org_id=${match.orgId ?? 'missing'} 与当前 org_id=${params.orgId ?? 'missing'} 不一致。`,
    });
  }
  if (match.accountId !== params.accountId) {
    issues.push({
      ...issueBase,
      code: 'source_row_account_mismatch',
      message: `来源行 account_id=${match.accountId ?? 'missing'} 与 account=${params.accountId} 不一致。`,
    });
  }

  return issues;
}

function expectedSourcesForAccount(params: {
  accountId: string;
  emailDecodes: ProvenanceAccountScopedRow[];
  strategicPlays: ProvenanceAccountScopedRow[];
  rfps: ProvenanceRfpRow[];
  rfpAnalyses: ProvenanceRfpAnalysisRow[];
}): ExpectedJudgmentSource[] {
  const sources: ExpectedJudgmentSource[] = [];
  for (const row of params.emailDecodes) {
    if (row.account_id === params.accountId) {
      sources.push({ sourceKind: 'decode', sourceTable: 'email_decodes', sourceRowId: row.id, accountId: params.accountId });
    }
  }
  for (const row of params.strategicPlays) {
    if (row.account_id === params.accountId) {
      sources.push({ sourceKind: 'strategic_play', sourceTable: 'strategic_plays', sourceRowId: row.id, accountId: params.accountId });
    }
  }

  const accountRfpIds = new Set(params.rfps.filter((row) => row.account_id === params.accountId).map((row) => row.id));
  for (const row of params.rfpAnalyses) {
    if (row.rfp_id && accountRfpIds.has(row.rfp_id)) {
      sources.push({ sourceKind: 'rfp_analysis', sourceTable: 'rfp_ai_analyses', sourceRowId: row.id, accountId: params.accountId });
    }
  }

  return sources;
}

function uniqueKinds(sources: ExpectedJudgmentSource[]): JudgmentMemorySourceKind[] {
  return [...new Set(sources.map((source) => source.sourceKind))];
}

function mostSevereTraceStatus(statuses: TraceStatus[]): TraceStatus {
  if (statuses.includes('invalid')) return 'invalid';
  if (statuses.includes('missing')) return 'missing';
  if (statuses.includes('derived')) return 'derived';
  return 'persisted';
}

export function verifyJudgmentProvenance(params: VerifyJudgmentProvenanceParams): JudgmentProvenanceVerificationResult {
  const emailDecodesById = new Map(params.emailDecodes.map((row) => [row.id, row]));
  const strategicPlaysById = new Map(params.strategicPlays.map((row) => [row.id, row]));
  const rfpsById = new Map(params.rfps.map((row) => [row.id, row]));
  const rfpAnalysesById = new Map(params.rfpAnalyses.map((row) => [row.id, row]));

  const accounts = params.accounts.map((account): AccountJudgmentProvenanceResult => {
    const requiredSources = expectedSourcesForAccount({
      accountId: account.id,
      emailDecodes: params.emailDecodes,
      strategicPlays: params.strategicPlays,
      rfps: params.rfps,
      rfpAnalyses: params.rfpAnalyses,
    });
    const requiredKinds = uniqueKinds(requiredSources);
    const accountSourceRecords = params.sourceRecords.filter((row) => row.account_id === account.id);
    const issues: JudgmentProvenanceIssue[] = [];

    if (accountSourceRecords.length === 0) {
      issues.push({
        code: 'source_records_missing',
        message: `account ${account.id} 没有任何 source_records。`,
      });
    }

    const traces = requiredSources.map((expected): JudgmentProvenanceTrace => {
      const { sourceKind } = expected;
      const exactCandidates = accountSourceRecords.filter((row) => (
        getJudgmentSourceKind(row) === sourceKind
        && row.source_table === expected.sourceTable
        && row.source_row_id === expected.sourceRowId
      ));
      // If no exact persisted coverage exists, still inspect same-kind rows for poisoned
      // metadata/source pointers. A row scoped to this account but pointing at a foreign
      // runtime source must fail as invalid rather than being hidden behind derived fallback.
      const candidates = exactCandidates.length > 0
        ? exactCandidates
        : accountSourceRecords.filter((row) => getJudgmentSourceKind(row) === sourceKind);
      const candidateIssues = candidates.map((row) => {
        const rowIssues: JudgmentProvenanceIssue[] = [];
        if (!orgMatches(row.org_id, params.orgId)) {
          rowIssues.push({
            code: 'source_record_org_mismatch',
            message: `source_record org_id=${row.org_id ?? 'missing'} 与当前 org_id=${params.orgId ?? 'missing'} 不一致。`,
            sourceRecordId: row.id,
            sourceKind,
            expectedSourceRowId: expected.sourceRowId,
            sourceTable: row.source_table ?? null,
            sourceRowId: row.source_row_id ?? null,
          });
        }
        if (row.account_id !== account.id) {
          rowIssues.push({
            code: 'source_record_account_mismatch',
            message: `source_record account_id=${row.account_id ?? 'missing'} 与 account=${account.id} 不一致。`,
            sourceRecordId: row.id,
            sourceKind,
            expectedSourceRowId: expected.sourceRowId,
            sourceTable: row.source_table ?? null,
            sourceRowId: row.source_row_id ?? null,
          });
        }
        if (row.source_kind && row.source_kind !== JUDGMENT_SOURCE_KIND_TO_SOURCE_RECORD_KIND[sourceKind]) {
          rowIssues.push({
            code: 'source_kind_mismatch',
            message: `source_record.source_kind=${row.source_kind} 与 judgment sourceKind=${sourceKind} 不匹配。`,
            sourceRecordId: row.id,
            sourceKind,
            expectedSourceRowId: expected.sourceRowId,
            sourceTable: row.source_table ?? null,
            sourceRowId: row.source_row_id ?? null,
          });
        }
        rowIssues.push(...validateJudgmentMemory(row, sourceKind, params.orgId, emailDecodesById, strategicPlaysById, rfpsById, rfpAnalysesById));
        rowIssues.push(...validateSourcePointer({
          accountId: account.id,
          orgId: params.orgId,
          row,
          sourceKind,
          emailDecodesById,
          strategicPlaysById,
          rfpsById,
          rfpAnalysesById,
        }));
        return {
          row,
          issues: rowIssues,
          isExact: row.source_table === expected.sourceTable && row.source_row_id === expected.sourceRowId,
        };
      });
      const validCandidate = candidateIssues.find((candidate) => candidate.isExact && candidate.issues.length === 0);
      if (validCandidate) {
        return {
          sourceKind,
          traceStatus: 'persisted',
          sourceRecordId: validCandidate.row.id,
          expectedSourceRowId: expected.sourceRowId,
          sourceTable: validCandidate.row.source_table ?? null,
          sourceRowId: validCandidate.row.source_row_id ?? null,
          issues: [],
        };
      }

      const invalidIssues = candidateIssues.flatMap((candidate) => candidate.issues);
      if (invalidIssues.length > 0) {
        return {
          sourceKind,
          traceStatus: 'invalid',
          sourceRecordId: candidateIssues[0]?.row.id,
          expectedSourceRowId: expected.sourceRowId,
          sourceTable: candidateIssues[0]?.row.source_table ?? null,
          sourceRowId: candidateIssues[0]?.row.source_row_id ?? null,
          issues: invalidIssues,
        };
      }

      return {
        sourceKind,
        traceStatus: 'derived',
        expectedSourceRowId: expected.sourceRowId,
        sourceTable: expected.sourceTable,
        sourceRowId: expected.sourceRowId,
        issues: [{
          code: 'judgment_source_missing',
          message: `${sourceKind}.${expected.sourceRowId} 只有运行时来源行，缺少逐条覆盖的 persisted source_record；标记为 derived，P0 gate 失败。`,
          sourceKind,
          expectedSourceRowId: expected.sourceRowId,
          sourceTable: expected.sourceTable,
          sourceRowId: expected.sourceRowId,
        }],
      };
    });

    issues.push(...traces.flatMap((trace) => trace.issues));
    const status: ProvenanceStatus = issues.length === 0 && requiredSources.length > 0 ? 'pass' : 'fail';
    const traceStatus = traces.length > 0 ? mostSevereTraceStatus(traces.map((trace) => trace.traceStatus)) : 'missing';

    return {
      accountId: account.id,
      accountKey: account.key,
      accountName: account.name,
      status,
      traceStatus,
      requiredKinds,
      persistedKinds: traces.filter((trace) => trace.traceStatus === 'persisted').map((trace) => trace.sourceKind),
      derivedKinds: traces.filter((trace) => trace.traceStatus === 'derived').map((trace) => trace.sourceKind),
      requiredSources,
      traces,
      issues,
    };
  });

  const totals = {
    accounts: accounts.length,
    passed: accounts.filter((account) => account.status === 'pass').length,
    failed: accounts.filter((account) => account.status === 'fail').length,
    persisted: accounts.reduce((sum, account) => sum + account.traces.filter((trace) => trace.traceStatus === 'persisted').length, 0),
    derived: accounts.reduce((sum, account) => sum + account.traces.filter((trace) => trace.traceStatus === 'derived').length, 0),
    missing: accounts.reduce((sum, account) => sum + account.traces.filter((trace) => trace.traceStatus === 'missing').length, 0),
    invalid: accounts.reduce((sum, account) => sum + account.traces.filter((trace) => trace.traceStatus === 'invalid').length, 0),
  };

  return {
    status: totals.failed === 0 ? 'pass' : 'fail',
    accounts,
    totals,
  };
}
