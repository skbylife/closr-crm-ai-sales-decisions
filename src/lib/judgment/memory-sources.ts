import type { EvidenceSourceKind, JudgmentEvidenceRef } from '@/lib/babel-engine/types';
import type { JudgmentMemorySourceKind } from './memory';
import { normalizeDecodeStabilityMetadata, type DecodeStabilityMetadata } from './decode-stability-client';

export interface JudgmentMemorySourceItem {
  id: string;
  sourceRecordId: string;
  sourceKind: JudgmentMemorySourceKind;
  sourceId: string;
  sourceTable?: string;
  sourceRowId?: string;
  title: string;
  currentJudgment: string;
  risk: string;
  nextAction: string;
  confidence: number | null;
  uncertainty?: string;
  provisional: boolean;
  evidenceRefs: JudgmentEvidenceRef[];
  updatedAt: string;
  traceStatus?: 'persisted' | 'derived';
  traceNote?: string;
  decodeStability?: DecodeStabilityMetadata;
}

export interface JudgmentMemorySourceRecordLike {
  id: string;
  source_table?: string | null;
  source_row_id?: string | null;
  title?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const JUDGMENT_MEMORY_SOURCE_LABELS: Record<JudgmentMemorySourceKind, string> = {
  decode: 'Decode 解读',
  rfp_analysis: 'RFP 判断',
  strategic_play: 'Strategic Play 谋局',
};

const MEMORY_SOURCE_KINDS = new Set<JudgmentMemorySourceKind>(['decode', 'rfp_analysis', 'strategic_play']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function normalizeEvidenceRefs(value: unknown): JudgmentEvidenceRef[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const sourceId = asText(record?.sourceId);
    const sourceKind = asText(record?.sourceKind) as EvidenceSourceKind | null;
    if (!sourceId || !sourceKind) return [];

    return [{
      sourceId,
      sourceKind,
      title: asText(record?.title) ?? undefined,
      sourceTable: asText(record?.sourceTable) ?? undefined,
      sourceRowId: asText(record?.sourceRowId) ?? undefined,
    } satisfies JudgmentEvidenceRef];
  });
}

export function normalizeJudgmentMemorySourceRow(row: JudgmentMemorySourceRecordLike): JudgmentMemorySourceItem | null {
  const metadata = asRecord(row.metadata);
  const memory = asRecord(metadata?.judgmentMemory);
  if (!memory) return null;
  const sourceKind = asText(memory.sourceKind) as JudgmentMemorySourceKind | null;
  if (!sourceKind || !MEMORY_SOURCE_KINDS.has(sourceKind)) return null;

  const sourceId = asText(memory.sourceId) ?? row.source_row_id ?? null;
  const currentJudgment = asText(memory.currentJudgment);
  const risk = asText(memory.risk);
  const nextAction = asText(memory.nextAction);
  if (!sourceId || !currentJudgment || !risk || !nextAction) return null;

  const evidenceRefs = normalizeEvidenceRefs(memory.evidenceRefs ?? metadata?.evidenceRefs);

  return {
    id: `${sourceKind}:${sourceId}`,
    sourceRecordId: row.id,
    sourceKind,
    sourceId,
    sourceTable: row.source_table ?? undefined,
    sourceRowId: row.source_row_id ?? undefined,
    title: asText(memory.title) ?? row.title ?? JUDGMENT_MEMORY_SOURCE_LABELS[sourceKind],
    currentJudgment,
    risk,
    nextAction,
    confidence: normalizeConfidence(memory.confidence),
    uncertainty: asText(memory.uncertainty) ?? undefined,
    provisional: memory.provisional === true,
    evidenceRefs,
    updatedAt: asText(memory.createdAt) ?? row.occurred_at ?? row.created_at ?? new Date(0).toISOString(),
    traceStatus: 'persisted',
    traceNote: '该判断记忆来自已持久化的 source_records。',
    decodeStability: normalizeDecodeStabilityMetadata(metadata?.decodeStability) ?? undefined,
  };
}

export function mergeJudgmentMemorySourcesPreferPersisted(params: {
  persisted: JudgmentMemorySourceItem[];
  derived: JudgmentMemorySourceItem[];
  limit?: number;
}): JudgmentMemorySourceItem[] {
  const byId = new Map<string, JudgmentMemorySourceItem>();
  for (const item of [...params.derived, ...params.persisted]) {
    byId.set(item.id, item);
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, params.limit ?? 12);
}

export function buildJudgmentMemorySourceHref(item: JudgmentMemorySourceItem, accountId: string): string | undefined {
  const encodedAccountId = encodeURIComponent(accountId);
  const encodedSourceId = encodeURIComponent(item.sourceId);
  if (item.sourceKind === 'decode') {
    return `/accounts/${encodedAccountId}?tab=activity&targetKind=email_decode&targetId=${encodedSourceId}`;
  }
  if (item.sourceKind === 'strategic_play') {
    return `/accounts/${encodedAccountId}?tab=plays&playId=${encodedSourceId}`;
  }
  const targetId = item.sourceRecordId || item.sourceRowId || item.sourceId;
  return `/accounts/${encodedAccountId}?tab=knowledge&targetKind=source_record&targetId=${encodeURIComponent(targetId)}`;
}
