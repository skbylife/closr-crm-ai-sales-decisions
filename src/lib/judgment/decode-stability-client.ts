import type {
  DecodeContextSnapshot,
  DecodeJudgmentDiff,
  DecodeOutput,
  StableDecodeJudgment,
} from '@/lib/babel-engine/types';
import type {
  DecodeStabilityCorrectionCta,
  DecodeStabilityMetadata,
  DecodeStabilitySnapshotView,
  DecodeStabilityTimelineItem,
  DecodeStabilityTimelineSourceItem,
  DecodeStabilityTimelineStatus,
} from './decode-stability';

export type {
  DecodeStabilityCorrectionCta,
  DecodeStabilityMetadata,
  DecodeStabilitySnapshotView,
  DecodeStabilityTimelineItem,
  DecodeStabilityTimelineSourceItem,
  DecodeStabilityTimelineStatus,
} from './decode-stability';

const DECODE_STABILITY_SCHEMA_VERSION = 'stable_decode_judgment_v1';
const DECODE_CONTEXT_SCHEMA_VERSION = 'decode_context_snapshot_v1';

export const DECODE_JUDGMENT_FIELD_LABELS: Record<string, string> = {
  intent: '真实意图',
  momentum_or_temperature: '推进温度',
  risk: '风险等级',
  confidence: '置信度',
  evidence: '依据',
  uncertainty: '不确定性',
  recommended_next_action: '建议动作',
};

const TIMELINE_STATUS_LABELS: Record<DecodeStabilityTimelineStatus, string> = {
  same: '判断一致',
  changed: '首次记录',
  unstable: '同一背景下有变化',
  context_changed: '背景变化后重判',
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max = 160): string {
  const normalized = compactWhitespace(value);
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isContextSnapshot(value: unknown): value is DecodeContextSnapshot {
  const record = asRecord(value);
  return Boolean(
    record
      && record.schema_version === DECODE_CONTEXT_SCHEMA_VERSION
      && typeof record.fingerprint === 'string'
      && typeof record.input_fingerprint === 'string'
      && typeof record.context_fingerprint === 'string',
  );
}

function isStableJudgment(value: unknown): value is StableDecodeJudgment {
  const record = asRecord(value);
  return Boolean(
    record
      && record.schema_version === DECODE_STABILITY_SCHEMA_VERSION
      && typeof record.intent === 'string'
      && typeof record.momentum_or_temperature === 'string'
      && typeof record.risk === 'string'
      && typeof record.confidence === 'number',
  );
}

function isJudgmentDiff(value: unknown): value is DecodeJudgmentDiff {
  const record = asRecord(value);
  return Boolean(
    record
      && typeof record.status === 'string'
      && typeof record.context_changed === 'boolean'
      && typeof record.judgment_changed === 'boolean'
      && typeof record.unstable === 'boolean'
      && Array.isArray(record.changed_fields),
  );
}

export function buildDecodeStabilityMetadata(output: Pick<DecodeOutput, 'contextSnapshot' | 'stableJudgment' | 'judgmentDiff'>): DecodeStabilityMetadata | null {
  const contextSnapshot = isContextSnapshot(output.contextSnapshot) ? output.contextSnapshot : undefined;
  const stableJudgment = isStableJudgment(output.stableJudgment) ? output.stableJudgment : undefined;
  const judgmentDiff = isJudgmentDiff(output.judgmentDiff) ? output.judgmentDiff : undefined;

  if (!contextSnapshot && !stableJudgment && !judgmentDiff) return null;

  return {
    schemaVersion: 1,
    contextSnapshot,
    stableJudgment,
    judgmentDiff,
    summary: {
      status: judgmentDiff?.status,
      unstable: judgmentDiff?.unstable ?? false,
      judgmentChanged: judgmentDiff?.judgment_changed ?? false,
      contextChanged: judgmentDiff?.context_changed ?? false,
      snapshotAvailable: Boolean(contextSnapshot),
      inputFingerprint: contextSnapshot?.input_fingerprint,
      contextFingerprint: contextSnapshot?.context_fingerprint,
      changedFields: judgmentDiff?.changed_fields.map((field) => field.field) ?? [],
    },
  };
}

export function normalizeDecodeStabilityMetadata(value: unknown): DecodeStabilityMetadata | null {
  const record = asRecord(value);
  const summary = asRecord(record?.summary);
  if (!record || record.schemaVersion !== 1 || !summary) return null;

  const contextSnapshot = isContextSnapshot(record.contextSnapshot) ? record.contextSnapshot : undefined;
  const stableJudgment = isStableJudgment(record.stableJudgment) ? record.stableJudgment : undefined;
  const judgmentDiff = isJudgmentDiff(record.judgmentDiff) ? record.judgmentDiff : undefined;
  if (!contextSnapshot && !stableJudgment && !judgmentDiff) return null;

  return {
    schemaVersion: 1,
    contextSnapshot,
    stableJudgment,
    judgmentDiff,
    summary: {
      status: typeof summary.status === 'string' ? summary.status as DecodeJudgmentDiff['status'] : judgmentDiff?.status,
      unstable: typeof summary.unstable === 'boolean' ? summary.unstable : judgmentDiff?.unstable ?? false,
      judgmentChanged: typeof summary.judgmentChanged === 'boolean' ? summary.judgmentChanged : judgmentDiff?.judgment_changed ?? false,
      contextChanged: typeof summary.contextChanged === 'boolean' ? summary.contextChanged : judgmentDiff?.context_changed ?? false,
      snapshotAvailable: typeof summary.snapshotAvailable === 'boolean' ? summary.snapshotAvailable : Boolean(contextSnapshot),
      inputFingerprint: typeof summary.inputFingerprint === 'string' ? summary.inputFingerprint : contextSnapshot?.input_fingerprint,
      contextFingerprint: typeof summary.contextFingerprint === 'string' ? summary.contextFingerprint : contextSnapshot?.context_fingerprint,
      changedFields: Array.isArray(summary.changedFields)
        ? summary.changedFields.filter((field): field is string => typeof field === 'string')
        : judgmentDiff?.changed_fields.map((field) => field.field) ?? [],
    },
  };
}

function formatSnapshotContext(snapshot: DecodeContextSnapshot): Array<{ label: string; value: string }> {
  const request = snapshot.request_context;
  return [
    snapshot.account_context ? { label: '客户', value: snapshot.account_context.name || snapshot.account_context.id || '已关联客户' } : null,
    snapshot.contact_context ? { label: '联系人', value: snapshot.contact_context.name || snapshot.contact_context.id || '已关联联系人' } : null,
    snapshot.deal_context ? { label: '商机', value: snapshot.deal_context.stage || snapshot.deal_context.id || '已关联商机' } : null,
    request.clientName || request.dealStage || request.signalSource || request.analysisGoal
      ? {
        label: '请求背景',
        value: [
          request.clientName ? `客户名：${request.clientName}` : null,
          request.dealStage ? `阶段：${request.dealStage}` : null,
          request.signalSource ? `来源：${request.signalSource}` : null,
          request.analysisGoal ? `目标：${request.analysisGoal}` : null,
        ].filter(Boolean).join('；'),
      }
      : null,
    {
      label: '补充上下文',
      value: [
        request.hasContextMemory ? '历史沟通' : null,
        request.hasCilContext ? '客户情报' : null,
        request.hasKnowledgeBase ? '知识库' : null,
        request.hasUserContext ? '手动背景' : null,
        request.detectedCulture ? `文化背景：${request.detectedCulture}` : null,
      ].filter(Boolean).join('；') || '未使用额外上下文',
    },
  ].filter((item): item is { label: string; value: string } => Boolean(item?.value));
}

function formatValue(value: string | number | string[]): string {
  if (Array.isArray(value)) return value.slice(0, 2).join('；') || '空';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  return value || '空';
}

export function buildDecodeStabilitySnapshotView(output: Pick<DecodeOutput, 'contextSnapshot' | 'stableJudgment' | 'judgmentDiff'>): DecodeStabilitySnapshotView {
  const stableJudgment = output.stableJudgment;
  const snapshot = output.contextSnapshot;
  const diff = output.judgmentDiff;

  const statusLabel = !diff
    ? '未对比'
    : diff.status === 'same_judgment'
      ? '判断一致'
      : diff.status === 'changed_context'
        ? '依据已变化'
        : diff.status === 'unstable_same_context'
          ? '需要复核'
          : '首次记录';
  const statusTone: DecodeStabilitySnapshotView['statusTone'] = diff?.unstable ? 'warning' : diff?.status === 'same_judgment' ? 'positive' : 'muted';

  if (!stableJudgment && !snapshot && !diff) {
    return {
      available: false,
      statusLabel,
      statusTone: 'muted',
      headline: '这条解读暂时没有可复盘的判断快照。',
      snapshotRows: [],
      contextSummaries: [],
      evidenceSummaries: [],
      systemRows: [],
      changeReasons: [],
    };
  }

  const changeReasons = [
    diff?.explanation,
    diff?.context_changed ? '本次使用的客户、联系人、商机或知识库依据与上次不同。' : null,
    ...(diff?.changed_fields.slice(0, 5).map((field) => {
      const label = DECODE_JUDGMENT_FIELD_LABELS[field.field] ?? field.field;
      return `${label}：上次「${formatValue(field.previous)}」→ 本次「${formatValue(field.current)}」`;
    }) ?? []),
  ].filter((item): item is string => Boolean(item));

  return {
    available: true,
    statusLabel,
    statusTone,
    headline: diff?.explanation ?? '已保存本次判断依据；后续重复解读会用它做对比。',
    snapshotRows: snapshot ? [
      { label: '输入指纹', value: snapshot.input_fingerprint },
      { label: '上下文版本', value: snapshot.context_fingerprint },
      { label: '快照版本', value: snapshot.fingerprint },
    ] : [],
    contextSummaries: snapshot ? formatSnapshotContext(snapshot) : [],
    evidenceSummaries: [
      ...(stableJudgment?.evidence.map((item) => item.summary) ?? []),
      ...(snapshot?.relevant_evidence.map((item) => item.summary) ?? []),
    ].filter(Boolean).slice(0, 6),
    systemRows: snapshot ? [
      { label: '提示版本', value: snapshot.prompt.prompt_version },
      { label: '判断结构', value: stableJudgment?.schema_version ?? snapshot.prompt.schema_version },
      { label: '上下文结构', value: snapshot.schema_version },
      { label: '模型层级', value: snapshot.prompt.model_tier },
    ] : stableJudgment ? [
      { label: '判断结构', value: stableJudgment.schema_version },
    ] : [],
    changeReasons,
  };
}

function timelineStatusFromMetadata(metadata: DecodeStabilityMetadata): DecodeStabilityTimelineStatus {
  const status = metadata.judgmentDiff?.status ?? metadata.summary.status;
  if (metadata.judgmentDiff?.unstable || metadata.summary.unstable || status === 'unstable_same_context') return 'unstable';
  if (status === 'same_judgment') return 'same';
  if (status === 'changed_context' || metadata.summary.contextChanged) return 'context_changed';
  return 'changed';
}

function changedFieldLabels(fields: string[]): string[] {
  return fields.map((field) => DECODE_JUDGMENT_FIELD_LABELS[field] ?? field);
}

export function buildDecodeStabilityCorrectionCta(params: {
  saved: boolean;
  targetId: string;
  metadata?: DecodeStabilityMetadata | null;
  confidence?: number | null;
  currentJudgment?: string;
}): DecodeStabilityCorrectionCta {
  if (!params.saved) {
    return {
      visible: false,
      buttonLabel: '补充背景',
      helperText: '保存到客户后，才能把修正沉淀为账户判断校准依据。',
      targetType: 'decode',
      targetId: params.targetId,
      previousSummary: params.currentJudgment,
    };
  }

  const confidence = typeof params.confidence === 'number' && Number.isFinite(params.confidence)
    ? Math.max(0, Math.min(1, params.confidence))
    : params.metadata?.stableJudgment?.confidence;
  const unstable = params.metadata?.judgmentDiff?.status === 'unstable_same_context'
    || params.metadata?.judgmentDiff?.unstable === true
    || params.metadata?.summary.unstable === true;
  const lowConfidence = typeof confidence === 'number' && confidence < 0.65;
  const reason = unstable
    ? '同一背景下判断发生变化，建议人工确认正确方向。'
    : lowConfidence
      ? '当前置信度偏低，建议补充关键背景或修正判断。'
      : undefined;

  return {
    visible: Boolean(reason),
    reason,
    buttonLabel: unstable ? '修正判断' : '补充背景',
    helperText: '你的修正会保存为当前客户的判断校准依据，帮助后续解读更稳。',
    targetType: 'decode',
    targetId: params.targetId,
    previousSummary: params.currentJudgment,
  };
}

export function buildDecodeStabilityTimeline(params: {
  items: DecodeStabilityTimelineSourceItem[];
  limit?: number;
}): DecodeStabilityTimelineItem[] {
  const limit = Math.max(1, Math.min(params.limit ?? 8, 20));

  return params.items
    .filter((item) => item.sourceKind === 'decode' && Boolean(item.decodeStability))
    .map((item) => {
      const metadata = item.decodeStability as DecodeStabilityMetadata;
      const status = timelineStatusFromMetadata(metadata);
      const changedFields = metadata.summary.changedFields.length > 0
        ? metadata.summary.changedFields
        : metadata.judgmentDiff?.changed_fields.map((field) => field.field) ?? [];
      const confidence = typeof metadata.stableJudgment?.confidence === 'number'
        ? metadata.stableJudgment.confidence
        : item.confidence;
      const inputSummary = metadata.contextSnapshot?.input_summary || item.currentJudgment || item.title;

      return {
        id: `decode_stability:${item.sourceId}`,
        sourceId: item.sourceId,
        sourceRecordId: item.sourceRecordId,
        occurredAt: item.updatedAt,
        title: item.title,
        inputSummary: truncate(inputSummary, 120),
        status,
        statusLabel: TIMELINE_STATUS_LABELS[status],
        confidence,
        changedFields,
        changedFieldLabels: changedFieldLabels(changedFields),
        hasSnapshot: metadata.summary.snapshotAvailable || Boolean(metadata.contextSnapshot),
        currentJudgment: item.currentJudgment,
        correctionCta: buildDecodeStabilityCorrectionCta({
          saved: true,
          targetId: item.sourceId,
          metadata,
          confidence,
          currentJudgment: item.currentJudgment,
        }),
      } satisfies DecodeStabilityTimelineItem;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}
