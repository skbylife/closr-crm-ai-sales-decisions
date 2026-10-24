import { createHash } from 'node:crypto';

import type {
  BuyerState,
  DecodeContextEvidenceRef,
  DecodeContextSnapshot,
  DecodeJudgmentChangedField,
  DecodeJudgmentDiff,
  DecodeOutput,
  RiskLevel,
  SentimentTrend,
  StableDecodeIntent,
  StableDecodeJudgment,
  StableJudgmentEvidenceItem,
} from '@/lib/babel-engine/types';

export const DECODE_STABILITY_PROMPT_VERSION = 'decode_prompt_v1_stability_p0';
export const DECODE_STABILITY_SCHEMA_VERSION = 'stable_decode_judgment_v1';
export const DECODE_CONTEXT_SCHEMA_VERSION = 'decode_context_snapshot_v1';

const VALID_TRENDS: SentimentTrend[] = ['warming', 'cooling', 'stable', 'volatile'];
const VALID_RISKS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

export interface DecodeContextSnapshotInput {
  emailText: string;
  clientName?: string;
  dealStage?: string;
  signalSource?: string;
  analysisGoal?: string;
  signalContext?: string;
  userContext?: string;
  knowledgeBase?: string;
  accountId?: string;
  accountName?: string;
  contactId?: string;
  contactName?: string;
  opportunityId?: string;
  contextMemory?: string;
  cilContext?: string;
  knowledgeContext?: string;
  culturalContext?: string;
  detectedCulture?: string;
  modelTier?: string;
  createdAt?: string;
}

export interface PreviousDecodeForDiff {
  id: string;
  decode: DecodeOutput;
  contextSnapshot?: DecodeContextSnapshot;
  stableJudgment?: StableDecodeJudgment;
}

export interface DecodeStabilityMetadata {
  schemaVersion: 1;
  contextSnapshot?: DecodeContextSnapshot;
  stableJudgment?: StableDecodeJudgment;
  judgmentDiff?: DecodeJudgmentDiff;
  summary: {
    status?: DecodeJudgmentDiff['status'];
    unstable: boolean;
    judgmentChanged: boolean;
    contextChanged: boolean;
    snapshotAvailable: boolean;
    inputFingerprint?: string;
    contextFingerprint?: string;
    changedFields: string[];
  };
}

export interface DecodeStabilitySnapshotView {
  available: boolean;
  statusLabel: string;
  statusTone: 'positive' | 'warning' | 'muted';
  headline: string;
  snapshotRows: Array<{ label: string; value: string }>;
  contextSummaries: Array<{ label: string; value: string }>;
  evidenceSummaries: string[];
  systemRows: Array<{ label: string; value: string }>;
  changeReasons: string[];
}

export type DecodeStabilityTimelineStatus = 'same' | 'changed' | 'unstable' | 'context_changed';

export interface DecodeStabilityCorrectionCta {
  visible: boolean;
  reason?: string;
  buttonLabel: string;
  helperText: string;
  targetType: 'decode';
  targetId: string;
  previousSummary?: string;
}

export interface DecodeStabilityTimelineSourceItem {
  id: string;
  sourceRecordId: string;
  sourceKind: string;
  sourceId: string;
  title: string;
  currentJudgment: string;
  confidence: number | null;
  updatedAt: string;
  decodeStability?: DecodeStabilityMetadata;
}

export interface DecodeStabilityTimelineItem {
  id: string;
  sourceId: string;
  sourceRecordId: string;
  occurredAt: string;
  title: string;
  inputSummary: string;
  status: DecodeStabilityTimelineStatus;
  statusLabel: string;
  confidence: number | null;
  changedFields: string[];
  changedFieldLabels: string[];
  hasSnapshot: boolean;
  currentJudgment: string;
  correctionCta: DecodeStabilityCorrectionCta;
}

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

function normalizeForFingerprint(value: string | undefined): string {
  return compactWhitespace(value ?? '').toLowerCase();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
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

export function stableHash(value: unknown): string {
  const input = stableStringify(value);
  const digest = createHash('sha256').update(input, 'utf8').digest('hex');
  return `fp_${digest.slice(0, 32)}`;
}

export function buildInputFingerprint(emailText: string): string {
  return stableHash({ text: normalizeForFingerprint(emailText) });
}

function normalizeTrend(value: unknown): SentimentTrend {
  return VALID_TRENDS.includes(value as SentimentTrend) ? (value as SentimentTrend) : 'stable';
}

function normalizeRisk(value: unknown): RiskLevel {
  return VALID_RISKS.includes(value as RiskLevel) ? (value as RiskLevel) : 'low';
}

function intentFromBuyerState(state: BuyerState | undefined): StableDecodeIntent {
  if (state === 'ready_to_buy') return 'ready_to_buy';
  if (state === 'engaged') return 'active_interest';
  if (state === 'evaluating') return 'evaluation';
  if (state === 'stalling' || state === 'evaluator_to_ghost') return 'delay_or_stall';
  if (state === 'ghosting') return 'disengagement';
  return 'unclear';
}

function averageConfidence(output: DecodeOutput): number {
  const confidences = output.messages
    .map((message) => message.decode?.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (confidences.length === 0) return 0.5;
  const avg = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return Math.max(0, Math.min(1, Number(avg.toFixed(2))));
}

function addEvidence(items: StableJudgmentEvidenceItem[], item: StableJudgmentEvidenceItem | null) {
  if (!item?.summary) return;
  if (items.some((existing) => existing.id === item.id || existing.summary === item.summary)) return;
  items.push({ ...item, summary: truncate(item.summary, 120) });
}

export function buildStableDecodeJudgment(output: DecodeOutput): StableDecodeJudgment {
  const analysis = output.threadAnalysis;
  const confidence = averageConfidence(output);
  const evidence: StableJudgmentEvidenceItem[] = [];

  output.messages.slice(0, 3).forEach((message, index) => {
    addEvidence(evidence, {
      id: `input_message_${index + 1}`,
      source: 'input',
      summary: message.original || message.decode?.meaning || '',
    });
  });
  addEvidence(evidence, {
    id: 'analysis_key_signal',
    source: 'analysis',
    summary: analysis?.keySignal ?? '',
  });
  addEvidence(evidence, {
    id: 'lead_action',
    source: 'action',
    summary: output.actionItems?.[0]?.reasoning || output.actionItems?.[0]?.title || '',
  });

  const uncertainty: string[] = [];
  if (confidence < 0.65) uncertainty.push('当前证据不足，置信度偏低。');
  if (!analysis?.keySignal) uncertainty.push('缺少明确关键信号。');
  if ((analysis?.riskLevel === 'high' || analysis?.riskLevel === 'critical') && confidence < 0.75) {
    uncertainty.push('风险判断较高，但仍需要更多上下文确认。');
  }

  return {
    schema_version: DECODE_STABILITY_SCHEMA_VERSION,
    intent: intentFromBuyerState(analysis?.buyerState),
    momentum_or_temperature: normalizeTrend(analysis?.sentimentTrend),
    risk: normalizeRisk(analysis?.riskLevel),
    confidence,
    evidence,
    uncertainty,
    recommended_next_action: truncate(output.actionItems?.[0]?.title || analysis?.keySignal || '补充上下文后再判断', 120),
  };
}

function buildContextEvidence(input: DecodeContextSnapshotInput): DecodeContextEvidenceRef[] {
  const refs: DecodeContextEvidenceRef[] = [
    { id: 'input_text', kind: 'input', summary: truncate(input.emailText, 180) },
    { id: 'prompt_schema', kind: 'prompt', summary: `${DECODE_STABILITY_PROMPT_VERSION} / ${DECODE_STABILITY_SCHEMA_VERSION}` },
  ];
  if (input.accountId || input.accountName) {
    refs.push({ id: input.accountId ? `account_${input.accountId}` : 'account_name', kind: 'account', summary: input.accountName || input.accountId || '' });
  }
  if (input.contactId || input.contactName) {
    refs.push({ id: input.contactId ? `contact_${input.contactId}` : 'contact_name', kind: 'contact', summary: input.contactName || input.contactId || '' });
  }
  if (input.opportunityId || input.dealStage) {
    refs.push({ id: input.opportunityId ? `opportunity_${input.opportunityId}` : 'deal_stage', kind: 'opportunity', summary: input.dealStage || input.opportunityId || '' });
  }
  if (input.contextMemory) refs.push({ id: 'context_memory', kind: 'memory', summary: truncate(input.contextMemory, 180) });
  if (input.cilContext || input.knowledgeContext || input.knowledgeBase) {
    refs.push({ id: 'knowledge_context', kind: 'knowledge', summary: truncate(input.cilContext || input.knowledgeContext || input.knowledgeBase || '', 180) });
  }
  return refs.filter((ref) => Boolean(ref.summary));
}

export function buildDecodeContextSnapshot(input: DecodeContextSnapshotInput): DecodeContextSnapshot {
  const input_fingerprint = buildInputFingerprint(input.emailText);
  const contextBasis = {
    accountId: input.accountId ?? null,
    accountName: normalizeForFingerprint(input.accountName),
    contactId: input.contactId ?? null,
    contactName: normalizeForFingerprint(input.contactName),
    opportunityId: input.opportunityId ?? null,
    clientName: normalizeForFingerprint(input.clientName),
    dealStage: normalizeForFingerprint(input.dealStage),
    signalSource: input.signalSource ?? null,
    analysisGoal: input.analysisGoal ?? null,
    signalContext: normalizeForFingerprint(input.signalContext),
    userContext: normalizeForFingerprint(input.userContext),
    knowledgeBase: normalizeForFingerprint(input.knowledgeBase),
    contextMemory: normalizeForFingerprint(input.contextMemory),
    cilContext: normalizeForFingerprint(input.cilContext),
    knowledgeContext: normalizeForFingerprint(input.knowledgeContext),
    culturalContext: normalizeForFingerprint(input.culturalContext),
    detectedCulture: input.detectedCulture ?? null,
    promptVersion: DECODE_STABILITY_PROMPT_VERSION,
    schemaVersion: DECODE_STABILITY_SCHEMA_VERSION,
    modelTier: input.modelTier ?? 'flash',
  };
  const context_fingerprint = stableHash(contextBasis);

  return {
    schema_version: DECODE_CONTEXT_SCHEMA_VERSION,
    fingerprint: stableHash({ input_fingerprint, context_fingerprint }),
    input_fingerprint,
    context_fingerprint,
    input_summary: truncate(input.emailText, 180),
    account_context: input.accountId || input.accountName ? { id: input.accountId, name: input.accountName } : undefined,
    contact_context: input.contactId || input.contactName ? { id: input.contactId, name: input.contactName } : undefined,
    deal_context: input.opportunityId || input.dealStage ? { id: input.opportunityId, stage: input.dealStage } : undefined,
    request_context: {
      clientName: input.clientName,
      dealStage: input.dealStage,
      signalSource: input.signalSource,
      analysisGoal: input.analysisGoal,
      signalContext: input.signalContext,
      hasUserContext: Boolean(input.userContext),
      hasKnowledgeBase: Boolean(input.knowledgeBase),
      hasCilContext: Boolean(input.cilContext || input.knowledgeContext),
      hasContextMemory: Boolean(input.contextMemory),
      detectedCulture: input.detectedCulture,
    },
    relevant_evidence: buildContextEvidence(input),
    prompt: {
      route: '/api/decode',
      prompt_version: DECODE_STABILITY_PROMPT_VERSION,
      schema_version: DECODE_STABILITY_SCHEMA_VERSION,
      model_tier: input.modelTier ?? 'flash',
    },
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

function compareStringArray(previous: string[], current: string[]): boolean {
  return previous.join('\n') === current.join('\n');
}

function evidenceComparable(evidence: StableJudgmentEvidenceItem[]): string[] {
  return evidence.map((item) => `${item.id}:${item.summary}`);
}

export function diffStableDecodeJudgment(params: {
  current: StableDecodeJudgment;
  currentContext: DecodeContextSnapshot;
  previous?: PreviousDecodeForDiff | null;
}): DecodeJudgmentDiff {
  const previous = params.previous;
  if (!previous) {
    return {
      status: 'no_previous',
      context_changed: false,
      judgment_changed: false,
      unstable: false,
      changed_fields: [],
      confidence_delta: 0,
      explanation: '这是当前输入和上下文下的第一版判断；后续重复解读会自动对比差异。',
    };
  }

  const previousJudgment = previous.stableJudgment ?? buildStableDecodeJudgment(previous.decode);
  const previousContext = previous.contextSnapshot;
  const contextChanged = previousContext
    ? previousContext.context_fingerprint !== params.currentContext.context_fingerprint
    : true;

  const changed_fields: DecodeJudgmentChangedField[] = [];
  const addChangedField = (field: keyof StableDecodeJudgment, previousValue: string | number | string[], currentValue: string | number | string[]) => {
    changed_fields.push({ field, previous: previousValue, current: currentValue });
  };

  if (previousJudgment.intent !== params.current.intent) addChangedField('intent', previousJudgment.intent, params.current.intent);
  if (previousJudgment.momentum_or_temperature !== params.current.momentum_or_temperature) {
    addChangedField('momentum_or_temperature', previousJudgment.momentum_or_temperature, params.current.momentum_or_temperature);
  }
  if (previousJudgment.risk !== params.current.risk) addChangedField('risk', previousJudgment.risk, params.current.risk);
  const confidenceDelta = Number((params.current.confidence - previousJudgment.confidence).toFixed(2));
  if (Math.abs(confidenceDelta) >= 0.1) addChangedField('confidence', previousJudgment.confidence, params.current.confidence);
  if (!compareStringArray(previousJudgment.uncertainty, params.current.uncertainty)) {
    addChangedField('uncertainty', previousJudgment.uncertainty, params.current.uncertainty);
  }
  if (previousJudgment.recommended_next_action !== params.current.recommended_next_action) {
    addChangedField('recommended_next_action', previousJudgment.recommended_next_action, params.current.recommended_next_action);
  }
  if (!compareStringArray(evidenceComparable(previousJudgment.evidence), evidenceComparable(params.current.evidence))) {
    addChangedField('evidence', evidenceComparable(previousJudgment.evidence), evidenceComparable(params.current.evidence));
  }

  const judgmentChanged = changed_fields.length > 0;
  const unstable = judgmentChanged && !contextChanged;
  const status = !judgmentChanged
    ? 'same_judgment'
    : contextChanged
      ? 'changed_context'
      : 'unstable_same_context';

  const explanation = status === 'same_judgment'
    ? '与上一次同内容解读的关键判断一致。'
    : status === 'changed_context'
      ? '本次判断与上次不同，主要因为客户、联系人、商机、知识库或提示版本等上下文发生了变化。'
      : '同一上下文下关键判断发生变化，系统已标记为不稳定；建议优先查看证据与不确定性后再行动。';

  return {
    status,
    previous_decode_id: previous.id,
    context_changed: contextChanged,
    judgment_changed: judgmentChanged,
    unstable,
    changed_fields,
    confidence_delta: confidenceDelta,
    explanation,
  };
}

export function attachStabilityLayer(params: {
  output: DecodeOutput;
  contextSnapshot: DecodeContextSnapshot;
  previous?: PreviousDecodeForDiff | null;
}): DecodeOutput {
  const stableJudgment = buildStableDecodeJudgment(params.output);
  const judgmentDiff = diffStableDecodeJudgment({
    current: stableJudgment,
    currentContext: params.contextSnapshot,
    previous: params.previous,
  });
  return {
    ...params.output,
    stableJudgment,
    contextSnapshot: params.contextSnapshot,
    judgmentDiff,
  };
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
