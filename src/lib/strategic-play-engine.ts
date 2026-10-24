// Strategic Play Engine — AI 路径规划
// 基于关系图谱、联系人画像、文化背景、知识引擎，生成多步路径
// v2: 深度集成 Babel Decode 画像 + 上下文记忆 + 文化引擎 + 知识引擎

import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import type { ModelTier } from '@/lib/babel-engine/gemini';
import type { AIInvocationContext } from '@/lib/ai-invocation-log';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { fetchDecodeHistory, formatContextMemory } from '@/lib/babel-engine/context-memory';
import { detectCulture } from '@/lib/babel-engine/cultural';
import { searchSimilarCases, type DiscType } from '@/lib/babel-engine/vector-store';
import { truncate, estimateTokens, enforceTokenBudget } from '@/lib/llm-token-utils';
import { buildGraphPrompt } from '@/lib/play-prompt-builder';
import { retrieveGroundedKnowledge, type KnowledgeTrace } from '@/lib/knowledge-grounding';
import { normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';
import type { EvidenceTraceRef, FieldEvidenceAttribution, FieldEvidenceCalibration, FieldEvidenceCalibrationClassification, FieldEvidenceClassification } from '@/lib/evidence-provenance';
import type {
  StrategicGoalType,
  PlayStep,
  AlternativePath,
  RelationshipGraph,
  RelationshipNode,
  RelationshipEdge,
  ContactRole,
  DecisionStyle,
  ContactProfileResult,
} from '@/lib/babel-engine/types';

// ─── Build Relationship Graph ───────────────────────────────────────

export async function buildRelationshipGraph(
  accountId: string,
  orgId: string,
): Promise<RelationshipGraph> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ourTeam: [], theirTeam: [], edges: [] };

  // 获取 account 的所有联系人（客户方）
  const { data: contacts } = await admin
    .from('contacts')
    .select('id, name, title, role, decision_style, reports_to, relationship_strength, contact_profile, last_contacted_at')
    .eq('account_id', accountId);

  // 获取组织成员（我方团队）
  const { data: members } = await admin
    .from('org_memberships')
    .select('user_id, display_name, job_title, job_level, role')
    .eq('org_id', orgId);

  const theirTeam: RelationshipNode[] = (contacts ?? []).map((c) => ({
    contactId: c.id,
    name: c.name,
    title: c.title ?? undefined,
    role: (c.role as ContactRole) ?? 'contact',
    decisionStyle: (c.decision_style as DecisionStyle) ?? undefined,
    reportsTo: c.reports_to ?? undefined,
    relationshipStrength: c.relationship_strength ?? 0,
    side: 'their_team' as const,
    // Babel Decode 深度画像
    profile: c.contact_profile as ContactProfileResult | undefined,
  }));

  const ourTeam: RelationshipNode[] = (members ?? []).map((m) => ({
    contactId: m.user_id,
    name: m.display_name ?? m.user_id,
    title: m.job_title ?? undefined,
    role: undefined,
    decisionStyle: undefined,
    reportsTo: undefined,
    relationshipStrength: 0,
    side: 'our_team' as const,
    jobLevel: m.job_level ?? undefined,
  }));

  // edges: 从 email_decodes 推算真实关系
  const edges: RelationshipEdge[] = [];

  // 获取该 account 的所有 decode 记录
  const { data: decodes } = await admin
    .from('email_decodes')
    .select('user_id, matched_contact_id, date')
    .eq('org_id', orgId)
    .not('matched_contact_id', 'is', null);

  // 按 user → contact 聚合
  const interactionMap = new Map<string, { contactId: string; userId: string; count: number; lastDate: string }>();

  for (const d of decodes ?? []) {
    if (!d.matched_contact_id || !d.user_id) continue;
    // 只统计属于当前 account 的联系人
    const isOurContact = (contacts ?? []).some((c) => c.id === d.matched_contact_id);
    if (!isOurContact) continue;

    const key = `${d.user_id}→${d.matched_contact_id}`;
    const existing = interactionMap.get(key);
    if (existing) {
      existing.count++;
      if (d.date > existing.lastDate) existing.lastDate = d.date;
    } else {
      interactionMap.set(key, {
        userId: d.user_id,
        contactId: d.matched_contact_id,
        count: 1,
        lastDate: d.date ?? new Date().toISOString(),
      });
    }
  }

  // 转换为 edges
  for (const [, interaction] of interactionMap) {
    const daysSince = Math.floor(
      (Date.now() - new Date(interaction.lastDate).getTime()) / 86400000
    );
    // 强度 = 交互次数权重 + 时效权重
    const countScore = Math.min(50, interaction.count * 10);
    const recencyScore = daysSince <= 3 ? 50 : daysSince <= 7 ? 40 : daysSince <= 14 ? 25 : daysSince <= 30 ? 15 : 5;
    const strength = Math.min(100, countScore + recencyScore);

    edges.push({
      from: interaction.userId,
      to: interaction.contactId,
      strength,
      lastInteraction: interaction.lastDate,
      interactionCount: interaction.count,
    });
  }

  // 补充：有 last_contacted_at 但没有 decode 记录的联系人（手动添加的联系人）
  for (const contact of contacts ?? []) {
    if (contact.last_contacted_at) {
      const hasEdge = edges.some(e => e.to === contact.id);
      if (!hasEdge && ourTeam.length > 0) {
        const daysSince = Math.floor(
          (Date.now() - new Date(contact.last_contacted_at).getTime()) / 86400000
        );
        edges.push({
          from: ourTeam[0].contactId,
          to: contact.id,
          strength: Math.max(5, 50 - daysSince * 3),
          lastInteraction: contact.last_contacted_at,
          interactionCount: 0,
        });
      }
    }
  }

  return { ourTeam, theirTeam, edges };
}

// ─── Generate Strategic Play ────────────────────────────────────────

export interface GeneratePlayInput {
  accountId: string;
  accountName: string;
  orgId: string;
  goalType: StrategicGoalType;
  goalDescription: string;
  targetContactId?: string;
  opportunityId?: string;
  opportunityName?: string;
  successCriteria?: string;
  graph: RelationshipGraph;
  additionalContext?: string;
  // Babel 深度集成
  userId?: string;  // 用于获取上下文记忆
  contactEmails?: Record<string, string>;  // contactId → email, 用于文化检测
  // 竞争对手信息
  competitors?: { name: string; strength: string; knownContacts?: string; notes?: string }[];
  invocation?: AIInvocationContext;
  modelOverride?: string;
  tierOverride?: ModelTier;
  outputLocale?: 'zh' | 'en';
}

export interface RagCase {
  situation: string;
  approach: string;
  similarity?: number;
}

export interface GeneratePlayResult {
  situationJudgment: string;
  strategicObjective: string;
  stakeholderPath: string[];
  evidenceBasis: string[];
  riskCounterEvidence: string[];
  actionPlan: PlayStep[];
  steps: PlayStep[];
  alternativePaths: AlternativePath[];
  confidence: number;
  successCriteria: string;
  ragCases?: RagCase[];
  knowledgeTraces?: KnowledgeTrace[];
  knowledgeGaps?: string[];
  fieldEvidenceAttributions?: FieldEvidenceAttribution[];
}

type RawFieldEvidenceAttribution = Partial<FieldEvidenceAttribution> & { evidenceRefs?: unknown; gaps?: unknown };

type RawPlayStep = Partial<PlayStep> & { expected_outcome?: unknown };

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === 'string' ? item.trim() : '')
      .filter((item) => item.length > 0);
  }
  const text = nonEmptyString(value);
  return text ? [text] : [];
}

function normalizeEvidenceTraceRefs(value: unknown): EvidenceTraceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return { sourceId: item.trim(), sourceType: 'model_ref' } satisfies EvidenceTraceRef;
      }
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const sourceId = nonEmptyString(record.sourceId) ?? nonEmptyString(record.evidenceId);
      if (!sourceId) return null;
      const sourceType = nonEmptyString(record.sourceType) ?? nonEmptyString(record.sourceKind) ?? nonEmptyString(record.sourceTable) ?? 'unknown';
      return {
        ...(nonEmptyString(record.evidenceId) ? { evidenceId: nonEmptyString(record.evidenceId)! } : {}),
        sourceId,
        sourceType,
        ...(nonEmptyString(record.sourceKind) ? { sourceKind: nonEmptyString(record.sourceKind)! as EvidenceTraceRef['sourceKind'] } : {}),
        ...(nonEmptyString(record.sourceTable) ? { sourceTable: nonEmptyString(record.sourceTable)! } : {}),
        ...(nonEmptyString(record.sourceRowId) ? { sourceRowId: nonEmptyString(record.sourceRowId)! } : {}),
        ...(nonEmptyString(record.title) ? { title: nonEmptyString(record.title)! } : {}),
        ...(nonEmptyString(record.excerpt) ? { excerpt: nonEmptyString(record.excerpt)! } : {}),
        ...(nonEmptyString(record.occurredAt) ? { occurredAt: nonEmptyString(record.occurredAt)! } : {}),
        ...(Number.isFinite(Number(record.weight)) ? { weight: Number(record.weight) } : {}),
      } satisfies EvidenceTraceRef;
    })
    .filter((ref): ref is EvidenceTraceRef => ref !== null);
}

function knowledgeTraceToEvidenceRef(trace: KnowledgeTrace): EvidenceTraceRef {
  return {
    evidenceId: trace.id,
    sourceId: trace.id,
    sourceType: trace.sourceType ?? 'knowledge_base',
    sourceTable: trace.sourceType,
    title: trace.title,
    excerpt: trace.contentSnippet,
  };
}

function isFieldEvidenceClassification(value: unknown): value is FieldEvidenceClassification {
  return value === 'fact' || value === 'inference' || value === 'gap' || value === 'mixed';
}

function isFieldEvidenceCalibrationClassification(value: unknown): value is FieldEvidenceCalibrationClassification {
  return value === 'fact' || value === 'inference' || value === 'gap' || value === 'mixed' || value === 'observed' || value === 'verified' || value === 'blocked' || value === 'invalidated';
}

function normalizeFieldEvidenceCalibrations(value: unknown): FieldEvidenceCalibration[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const id = nonEmptyString(record.id);
      const rawSourceRef = typeof record.sourceRef === 'object' && record.sourceRef !== null && !Array.isArray(record.sourceRef) ? record.sourceRef : null;
      const sourceRef = rawSourceRef ? normalizeEvidenceTraceRefs([rawSourceRef])[0] : null;
      const executionStatus = nonEmptyString(record.executionStatus) as FieldEvidenceCalibration['executionStatus'] | null;
      const outcomeAssessment = nonEmptyString(record.outcomeAssessment) as FieldEvidenceCalibration['outcomeAssessment'] | null;
      const previousClassification = isFieldEvidenceCalibrationClassification(record.previousClassification) ? record.previousClassification : null;
      const calibratedClassification = isFieldEvidenceCalibrationClassification(record.calibratedClassification) ? record.calibratedClassification : null;
      const occurredAt = nonEmptyString(record.occurredAt);
      if (!id || !sourceRef || !executionStatus || !outcomeAssessment || !previousClassification || !calibratedClassification || !occurredAt) return null;
      const note = nonEmptyString(record.note);
      const createdBy = nonEmptyString(record.createdBy);
      return {
        id,
        sourceRef,
        executionStatus,
        outcomeAssessment,
        previousClassification,
        calibratedClassification,
        ...(note ? { note } : {}),
        occurredAt,
        ...(createdBy ? { createdBy } : {}),
      } satisfies FieldEvidenceCalibration;
    })
    .filter((item): item is FieldEvidenceCalibration => item !== null);
}

function normalizeFieldEvidenceAttributions(value: unknown): FieldEvidenceAttribution[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
      const record = item as RawFieldEvidenceAttribution & { calibrations?: unknown };
      const field = nonEmptyString(record.field);
      if (!field) return null;
      const evidenceRefs = normalizeEvidenceTraceRefs(record.evidenceRefs);
      const gaps = normalizeStringList(record.gaps);
      const rawClassification = isFieldEvidenceClassification(record.classification) ? record.classification : undefined;
      const classification: FieldEvidenceClassification = rawClassification ?? (gaps.length > 0 && evidenceRefs.length > 0 ? 'mixed' : gaps.length > 0 ? 'gap' : evidenceRefs.length > 0 ? 'inference' : 'gap');
      const rationale = nonEmptyString(record.rationale);
      const calibrations = normalizeFieldEvidenceCalibrations(record.calibrations);
      return {
        field,
        classification,
        evidenceRefs,
        gaps,
        ...(rationale ? { rationale } : {}),
        ...(calibrations.length > 0 ? { calibrations } : {}),
      } satisfies FieldEvidenceAttribution;
    })
    .filter((item): item is FieldEvidenceAttribution => item !== null);
}

function fallbackFieldEvidenceAttributions(params: {
  evidenceBasis: string[];
  riskCounterEvidence: string[];
  steps: PlayStep[];
  knowledgeTraces: KnowledgeTrace[];
  knowledgeGaps: string[];
}): FieldEvidenceAttribution[] {
  const refs = params.knowledgeTraces.map(knowledgeTraceToEvidenceRef);
  const baseGaps = params.knowledgeGaps.length > 0 ? params.knowledgeGaps : (refs.length === 0 ? ['缺少可追踪的 source_records / knowledge trace；该字段只能作为待验证判断。'] : []);
  const inferClassification = (field: string): FieldEvidenceClassification => {
    if (refs.length === 0) return 'gap';
    if (baseGaps.length > 0) return 'mixed';
    return field === 'evidenceBasis' ? 'fact' : 'inference';
  };
  const make = (field: string, rationale: string): FieldEvidenceAttribution => ({
    field,
    classification: inferClassification(field),
    evidenceRefs: refs,
    gaps: baseGaps,
    rationale,
  });

  const attributions: FieldEvidenceAttribution[] = [
    make('situationJudgment', '保守归因：局势判断是基于知识线索、证据依据与风险反证形成的综合推断。'),
    make('strategicObjective', '保守归因：战略目标来自用户目标与当前可追踪上下文，不把它声明为事实。'),
    make('stakeholderPath', '保守归因：关键人路径通常是关系图谱推断；缺少直接证据时标为 gap/mixed。'),
    make('evidenceBasis', params.evidenceBasis.length > 0 ? '保守归因：证据依据字段引用已生成的 evidenceBasis 与知识线索。' : '保守归因：未生成明确 evidenceBasis。'),
    make('riskCounterEvidence', params.riskCounterEvidence.length > 0 ? '保守归因：风险/反证字段引用已生成的 riskCounterEvidence 与知识缺口。' : '保守归因：未生成明确风险反证。'),
    make('successCriteria', '保守归因：成功标准是推进验收口径，属于判断性设计而非事实。'),
  ];

  params.steps.forEach((step, index) => {
    attributions.push(make(`steps[${index}].expectedOutcome`, step.expectedOutcome ? '保守归因：expectedOutcome 是对该步骤可验证产出的推断，执行后必须回填真实结果。' : '保守归因：该步骤缺少 expectedOutcome。'));
    attributions.push(make(`steps[${index}].risk`, '保守归因：步骤风险基于当前缺口和反证推断，需执行中验证。'));
    attributions.push(make(`steps[${index}].fallback`, '保守归因：备选方案是风险应对设计，不代表已有事实。'));
  });

  return attributions;
}

function fallbackStakeholderPath(graph: RelationshipGraph, targetContactId?: string): string[] {
  const ordered = [...graph.theirTeam]
    .sort((a, b) => {
      if (targetContactId && a.contactId === targetContactId) return -1;
      if (targetContactId && b.contactId === targetContactId) return 1;
      return (b.relationshipStrength ?? 0) - (a.relationshipStrength ?? 0);
    })
    .slice(0, 4)
    .map((node) => `${node.name}${node.title ? `（${node.title}）` : ''}${node.role ? `/${node.role}` : ''}`);

  return ordered.length > 0 ? ordered : ['待识别关键决策者与内部支持者路径'];
}

function normalizePlayStep(step: RawPlayStep, index: number): PlayStep {
  const title = nonEmptyString(step.title) ?? `行动 ${index + 1}`;
  const purpose = nonEmptyString(step.purpose) ?? nonEmptyString(step.description) ?? title;
  const expectedOutcome = nonEmptyString(step.expectedOutcome)
    ?? nonEmptyString(step.expected_outcome)
    ?? nonEmptyString(step.successSignal)
    ?? `形成可验证进展：${purpose}`;

  return {
    ...step,
    index: index + 1,
    title,
    description: nonEmptyString(step.description) ?? title,
    who: nonEmptyString(step.who) ?? '我方负责人',
    target: nonEmptyString(step.target) ?? '待确认关键人',
    action: nonEmptyString(step.action) ?? title,
    timing: nonEmptyString(step.timing) ?? (index === 0 ? '本周' : `第 ${index + 1} 步`),
    purpose,
    rationale: nonEmptyString(step.rationale) ?? '基于 MEDDIC 关键角色推进与证据校准原则。',
    expectedOutcome,
    risk: nonEmptyString(step.risk) ?? '关键人不响应或证据不足。',
    fallback: nonEmptyString(step.fallback) ?? '通过现有联系人补充情报后调整路径。',
    status: 'planned' as const,
  };
}

function normalizePlaySteps(value: unknown): PlayStep[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((step, i) => normalizePlayStep((step ?? {}) as RawPlayStep, i));
}

function normalizeGeneratedPlayResult(params: {
  raw: Partial<GeneratePlayResult> | null | undefined;
  input: GeneratePlayInput;
  knowledgeTraces: KnowledgeTrace[];
  knowledgeGaps: string[];
  ragCases: RagCase[];
}): GeneratePlayResult {
  const { raw, input, knowledgeTraces, knowledgeGaps, ragCases } = params;
  const rawWithActionPlan = raw as (Partial<GeneratePlayResult> & { actionPlan?: unknown }) | null | undefined;
  const stepsFromSteps = normalizePlaySteps(rawWithActionPlan?.steps);
  const stepsFromActionPlan = normalizePlaySteps(rawWithActionPlan?.actionPlan);
  const steps = stepsFromSteps.length > 0 ? stepsFromSteps : stepsFromActionPlan;

  const normalizedSteps = steps.length > 0 ? steps : [normalizePlayStep({
    title: '补齐关键决策链证据',
    description: `围绕「${input.goalDescription}」确认真实决策人、预算约束和推进障碍。`,
    who: '我方负责人',
    target: input.targetContactId ? '目标联系人' : '现有联系人/潜在 Champion',
    action: '通过一次低摩擦沟通收集决策链、采购标准和下一步承诺',
    timing: '本周',
    purpose: '把谋局从假设推进到有证据支撑的推进路径',
    expectedOutcome: '获得关键人路径、采购标准或明确的下一步会议承诺',
    risk: '联系人不给出真实决策链或只提供表面信息',
    fallback: '转向已有高信任联系人，先验证谁能提供内部地图',
  }, 0)];

  const alternativePaths = Array.isArray(raw?.alternativePaths)
    ? raw.alternativePaths.slice(0, 1).map((path) => ({
      ...path,
      name: nonEmptyString(path.name) ?? '备选路径',
      confidence: Number.isFinite(Number(path.confidence)) ? Number(path.confidence) : 40,
      steps: normalizePlaySteps(path.steps),
      reason: nonEmptyString(path.reason) ?? '主路径受阻时使用。',
    }))
    : [];

  const evidenceFallback = [
    '客户关系图谱、目标描述与账户上下文',
    ...knowledgeTraces.slice(0, 3).map((trace) => `${trace.title}${trace.contentSnippet ? `：${trace.contentSnippet}` : ''}`),
  ].filter(Boolean);

  const stakeholderPath = normalizeStringList(raw?.stakeholderPath);
  const evidenceBasis = normalizeStringList(raw?.evidenceBasis);
  const riskCounterEvidence = normalizeStringList(raw?.riskCounterEvidence);

  const normalizedEvidenceBasis = evidenceBasis.length > 0 ? evidenceBasis : evidenceFallback;
  const normalizedRiskCounterEvidence = riskCounterEvidence.length > 0
    ? riskCounterEvidence
    : (knowledgeGaps.length > 0 ? knowledgeGaps : ['暂无明确反证；执行中需持续验证预算、权力结构和竞对影响。']);
  const fieldEvidenceAttributions = normalizeFieldEvidenceAttributions((raw as { fieldEvidenceAttributions?: unknown } | null | undefined)?.fieldEvidenceAttributions);

  return {
    situationJudgment: nonEmptyString(raw?.situationJudgment) ?? `当前局势：围绕「${input.goalDescription}」仍需用关键人路径、业务痛点和采购证据校准推进顺序。`,
    strategicObjective: nonEmptyString(raw?.strategicObjective) ?? input.goalDescription,
    stakeholderPath: stakeholderPath.length > 0 ? stakeholderPath : fallbackStakeholderPath(input.graph, input.targetContactId),
    evidenceBasis: normalizedEvidenceBasis,
    riskCounterEvidence: normalizedRiskCounterEvidence,
    actionPlan: normalizedSteps,
    steps: normalizedSteps,
    alternativePaths,
    confidence: Number.isFinite(Number(raw?.confidence)) ? Number(raw?.confidence) : 0,
    successCriteria: nonEmptyString(raw?.successCriteria) ?? nonEmptyString(input.successCriteria) ?? `达成「${input.goalDescription}」并获得可验证的客户承诺或下一步业务结果。`,
    ragCases,
    knowledgeTraces,
    knowledgeGaps,
    fieldEvidenceAttributions: fieldEvidenceAttributions.length > 0 ? fieldEvidenceAttributions : fallbackFieldEvidenceAttributions({
      evidenceBasis: normalizedEvidenceBasis,
      riskCounterEvidence: normalizedRiskCounterEvidence,
      steps: normalizedSteps,
      knowledgeTraces,
      knowledgeGaps,
    }),
  };
}

export async function generateStrategicPlay(
  input: GeneratePlayInput
): Promise<GeneratePlayResult> {
  const { graph, goalType, goalDescription, accountName, targetContactId, userId } = input;
  const outputLocale = normalizeOutputLocale(input.outputLocale);

  // 构建关系图谱描述（现在包含 Babel Decode 深度画像）
  const graphDescription = buildGraphPrompt(graph, targetContactId);

  // 获取上下文记忆：关键联系人的历史互动
  let contextMemoryBlock = '';
  if (userId && targetContactId) {
    try {
      const history = await fetchDecodeHistory(targetContactId, userId, 5);
      contextMemoryBlock = formatContextMemory(history);
    } catch (err) {
      console.warn('[strategic-play-engine] Failed to fetch context memory:', err);
    }
  }

  // 查询最近情报
  let intelBlock = '';
  try {
    const adminForIntel = getSupabaseAdmin();
    if (adminForIntel && input.orgId) {
      const intelQuery = adminForIntel
        .from('intel_items')
        .select('title, summary, type, date, urgency')
        .eq('org_id', input.orgId)
        .eq('account_id', input.accountId)
        .order('created_at', { ascending: false })
        .limit(5);
      const { data: intelItems } = await intelQuery;
      if (intelItems && intelItems.length > 0) {
        // 截断 intel：最多 5 条，每条 summary 截断到 200 字
        intelBlock = '\n\n## 最新情报\n' + intelItems.slice(0, 5).map((item: Record<string, unknown>) =>
          `- [${item.type}] ${item.title}${item.summary ? `：${truncate(String(item.summary), 200)}` : ''}（${item.date ?? '未知日期'}，紧急度：${item.urgency ?? 'medium'}）`
        ).join('\n');
      }
    }
  } catch (err) {
    console.warn('[strategic-play-engine] Failed to fetch intel items:', err);
  }

  // 文化检测：基于联系人邮箱域名
  let culturalContext = '';
  if (input.contactEmails) {
    const cultures = new Set<string>();
    for (const [, email] of Object.entries(input.contactEmails)) {
      const culture = detectCulture(email, '');
      if (culture && culture !== 'american_business') {
        cultures.add(culture);
      }
    }
    if (cultures.size > 0) {
      culturalContext = `\n检测到客户方文化背景：${[...cultures].join('、')}。请在每步策略中充分考虑文化差异对沟通方式、决策流程、面子观念、时间观念的影响。`;
    }
  }

  const systemPrompt = `你是一位融合了谈判学、商学、心理学、博弈论知识的顶级 B2B 销售策略顾问。

你不仅基于数据分析做判断，还会引用经典理论和方法论来支撑你的每一步建议。

## 你的知识武库

### 谈判学
- 哈佛谈判术（Getting to Yes）：利益导向 vs 立场导向，BATNA/ZOPA 分析
- Chris Voss（Never Split the Difference）：镜像法、标注法、校准问题、黑天鹅信息
- 锚定效应、让步策略、多议题价值创造

### 销售方法论
- MEDDIC/MEDDPICC：决策流程、关键角色、痛点量化、冠军培养
- Challenger Sale：教学式销售，重塑客户认知
- SPIN Selling：情境→问题→暗示→需求回报
- Miller Heiman Strategic Selling：买方角色（Economic Buyer, User Buyer, Technical Buyer, Coach）
- Solution Selling：痛点挖掘与方案匹配

### 心理学
- Cialdini 六大影响力原则：互惠、承诺一致、社会证明、权威、喜好、稀缺
- 认知偏差：锚定、框架效应、损失厌恶、确认偏差、沉没成本、禀赋效应
- DISC 行为风格 → 沟通策略适配
- 信任建立阶段模型、决策疲劳与时机选择

### 博弈论
- 多轮博弈的 tit-for-tat 策略
- 信号博弈：通过行为传递可信信号
- 承诺装置：让对方相信你的承诺
- 信息不对称策略：该透露什么、该保留什么
- 多方博弈：stakeholder 利益冲突与联盟构建

### 东方智慧
- 经典策略方法：势、虚实、间谍（情报）、不靠强推也能让客户自然认可、知己知彼
- 关系社会的面子经济学、人情债务、中间人策略

## 任务

基于客户关系图谱和联系人深度画像，规划一条从当前位置到目标的多步路径。

## 规则

0. **人名规则**：如果目标描述中提到了具体人名（如"通过Anson安排会面"），步骤中的 who 字段必须使用该人名，不要替换为"我方团队成员"或其他泛称。用户提到的名字是关键信息。
1. 每一步必须有明确的执行人、目标人物、具体行动、时间安排
2. 根据每个联系人的 DISC 性格类型和深度画像，精确调整沟通策略
3. 如果有文化背景信息，加入文化注意事项
4. 给出主路径 + 最多 1 条备选路径（减少 token 消耗加速响应）
5. 评估每条路径的成功概率
6. 每步都有风险评估和备选方案
7. ${outputLocaleInstruction(outputLocale)}
8. 步骤数量最多 4 步（精简高效）。只追求最优解——用最少的步骤、最短的路径达成目标
9. 如果某一步的结果可能产生分支，在该步的 fallback 中明确写出分支路径
10. **每一步必须标注理论依据（rationale）：引用具体的谈判学/心理学/博弈论/销售方法论原则，解释为什么这样做比其他方式更有效**
11. 如果有历史互动记忆，分析趋势变化（升温/降温/停滞），据此调整策略激进度
12. **平级对接原则**：当某步骤需要接触客户方特定职级人员时（如总监/VP/CXO），在该步的 who 字段中注明"建议由我方[对应职级]人员参与"（如"建议由我方总监级/C-Suite人员参与"）。不要指定具体姓名，由用户自己决定派谁。仅当联系强度数据显示我方某人已有对接关系时，可在括号内补充"（现有联系人: [姓名]）"。
13. **竞争防守原则**：如果有竞争对手信息，在相关步骤中加入竞争防守动作。在适当步骤的描述里加一句竞争相关建议（无需单独字段，直接融入 description 或 rationale）。

返回 JSON（严格格式，必须包含 Strategic Play Schema v1 字段；不要输出 markdown）：
{
  "situationJudgment": "局势判断：当前权力结构、采购阶段、关键阻力和可利用势能",
  "strategicObjective": "战略目标：比 goalDescription 更可执行、可验证的目标",
  "stakeholderPath": ["关键人路径：例如 Champion → Technical Buyer → Economic Buyer"],
  "evidenceBasis": ["证据依据：来自关系图谱、历史互动、情报、知识库或用户补充的事实"],
  "riskCounterEvidence": ["反证/风险证据：可能推翻当前判断的信号、证据缺口、竞对影响"],
  "actionPlan": [
    {
      "index": 1,
      "title": "步骤标题",
      "description": "详细描述",
      "who": "执行人（如果目标描述中提到了具体人名如'通过xxx'，必须使用该人名，不要替换为其他名称）",
      "target": "目标联系人（使用客户方团队中的实际姓名）",
      "action": "具体行动",
      "timing": "本周/下周/第N周",
      "purpose": "目的",
      "rationale": "理论依据 — 引用具体原则/方法论，解释为什么这样做（如：Cialdini 互惠原则 + Miller Heiman Coach 策略）",
      "expectedOutcome": "该步骤完成后必须产生的可验证结果/客户承诺/新增证据",
      "risk": "风险",
      "fallback": "备选方案",
      "prerequisite": "前提条件（可选）",
      "culturalNote": "文化注意（可选）"
    }
  ],
  "steps": [...与 actionPlan 相同的步骤对象数组，用于兼容旧客户端],
  "alternativePaths": [
    {
      "name": "路径名称",
      "confidence": 40,
      "steps": [...同上格式，每步也必须有 expectedOutcome],
      "reason": "为什么是备选"
    }
  ],
  "successCriteria": "成功标准：可观察、可验收，不只是完成动作",
  "confidence": 65,
  "fieldEvidenceAttributions": [
    {
      "field": "situationJudgment",
      "classification": "fact | inference | gap | mixed",
      "evidenceRefs": [{ "sourceId": "证据/知识/来源ID", "sourceType": "source_record | knowledge_items | intel_item | model_ref", "title": "来源标题", "excerpt": "可选摘录" }],
      "gaps": ["该字段仍缺少哪些关键证据"],
      "rationale": "为什么这个字段是事实/推断/缺证据/混合"
    },
    { "field": "steps[0].expectedOutcome", "classification": "inference", "evidenceRefs": [], "gaps": ["如缺证据必须写明"], "rationale": "每个步骤 expectedOutcome/risk/fallback 都要至少覆盖 expectedOutcome；能覆盖 risk/fallback 更好" }
  ]
}`;

  // Knowledge-grounded context：优先产品/方案、案例、销售材料，并显式返回 trace/gap。
  let knowledgeContext = '';
  let knowledgeTraces: KnowledgeTrace[] = [];
  let knowledgeGaps: string[] = [];
  try {
    const groundedKnowledge = await retrieveGroundedKnowledge({
      orgId: input.orgId,
      accountId: input.accountId,
      accountName,
      goalType,
      goalDescription,
      opportunityName: input.opportunityName ?? input.opportunityId,
      additionalContext: input.additionalContext,
      limit: 8,
    });
    knowledgeContext = groundedKnowledge.contextBlock;
    knowledgeTraces = groundedKnowledge.knowledgeTraces;
    knowledgeGaps = groundedKnowledge.knowledgeGaps;
  } catch (err) {
    console.warn('[strategic-play-engine] Knowledge grounding failed:', err);
  }

  // 策略案例 RAG：根据目标人物 DISC + 情境搜索历史成功案例
  let ragCasesContext = '';
  const retrievedRagCases: RagCase[] = [];
  try {
    // 提取目标人物的 DISC 类型（优先取 targetContactId 对应人物）
    const targetNode = input.targetContactId
      ? graph.theirTeam.find((n) => n.contactId === input.targetContactId)
      : graph.theirTeam[0];

    // 从 contact profile 或 decisionStyle 推断 DISC 类型
    let discType: DiscType | undefined;
    if (targetNode?.profile?.decisionStyle?.type) {
      const ds = targetNode.profile.decisionStyle.type;
      // DecisionStyle → DISC 映射
      const styleToDisc: Record<string, DiscType> = {
        driver: 'D',
        expressive: 'I',
        amiable: 'S',
        analytical: 'C',
      };
      discType = styleToDisc[ds] as DiscType | undefined;
    }

    const searchQuery = [
      goalDescription,
      targetNode?.title ?? '',
      discType ? `DISC ${discType}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const similarCases = await searchSimilarCases(searchQuery, discType, 3);

    if (similarCases.length > 0) {
      // 截断 RAG 案例：最多 3 条，每条截断到 300 字
      const cappedCases = similarCases.slice(0, 3);
      ragCasesContext = `\n\n## 参考成功案例（相似情境下验证有效的策略）\n${cappedCases
        .map(
          (c) =>
            `- 情境：${truncate(c.situation, 300)}\n  策略：${truncate(c.approach, 300)}${c.why_it_worked ? `\n  原因：${truncate(c.why_it_worked, 300)}` : ''}`
        )
        .join('\n')}`;

      // 记录 RAG 案例供返回值使用
      for (const c of cappedCases) {
        retrievedRagCases.push({
          situation: c.situation,
          approach: c.approach,
        });
      }
    }
  } catch (err) {
    console.warn('[strategic-play-engine] Strategy case RAG search failed:', err);
  }

  // 缺失关键角色检测
  const presentRoles = new Set(graph.theirTeam.map(n => n.role).filter(Boolean));
  const criticalRoles: string[] = [];
  if (!presentRoles.has('decision_maker')) criticalRoles.push('决策者（Decision Maker）');
  if (!presentRoles.has('economic_buyer')) criticalRoles.push('预算控制人（Economic Buyer）');
  const missingRolesPrompt = criticalRoles.length > 0
    ? `\n⚠️ 关键角色缺失警告：当前联系人列表中缺少以下关键角色：${criticalRoles.join('、')}。请在谋局路径的前期步骤中，主动加入"情报收集步骤"——通过现有联系人（如技术评估者、推动者等）探明谁是真正的决策者/预算控制人，再制定后续接触路径。不要假设这些角色已知。`
    : '';

  const competitorsBlock = (input.competitors ?? []).length > 0
    ? `\n竞争对手情报：\n${input.competitors!.map(c =>
        `- ${c.name}（威胁等级：${c.strength}）${c.knownContacts ? `，已知联系人：${c.knownContacts}` : ''}${c.notes ? `，备注：${c.notes}` : ''}`
      ).join('\n')}\n请在谋局步骤中加入竞争防守动作，区分我方差异化，识别并利用竞对薄弱点。`
    : '';

  let userPrompt = `客户：${accountName}
目标类型：${goalType}
目标描述：${goalDescription}
${input.successCriteria ? `成功标准：${input.successCriteria}\n` : ''}
关系图谱（含联系人深度画像）：
${graphDescription}
${culturalContext}
${contextMemoryBlock ? `\n${contextMemoryBlock}` : ''}
${missingRolesPrompt}
${competitorsBlock}
${input.additionalContext ? `\n补充信息：${input.additionalContext}` : ''}
${knowledgeContext}${ragCasesContext}${intelBlock}
请规划从当前位置到达目标的企业销售推进计划。必须给出局势判断、战略目标、关键人路径、证据依据、反证/风险证据、行动计划和成功标准；每一步都要标注理论依据和 expectedOutcome。
同时输出 fieldEvidenceAttributions：对 situationJudgment、strategicObjective、stakeholderPath、evidenceBasis、riskCounterEvidence、successCriteria，以及每个步骤的 expectedOutcome（尽量也包括 risk/fallback）标注 fact / inference / gap / mixed。不要为了显得透明而伪造证据；没有可追踪证据就标 gap，并在 gaps 写清楚缺什么。
如果 Grounded Knowledge Context 有知识缺口，请在 riskCounterEvidence、步骤 rationale、fallback 或 fieldEvidenceAttributions.gaps 中明确说明哪些方案依据不足，不要假装已有产品/方案材料。`;

  // Token 预算检查：userPrompt 上限 8000 tokens
  const MAX_USER_PROMPT_TOKENS = 8000;
  if (estimateTokens(userPrompt) > MAX_USER_PROMPT_TOKENS) {
    console.warn(`[strategic-play-engine] userPrompt estimated ${estimateTokens(userPrompt)} tokens, truncating to ${MAX_USER_PROMPT_TOKENS}`);
    userPrompt = enforceTokenBudget(userPrompt, MAX_USER_PROMPT_TOKENS);
  }

  try {
    const result = await callAIWithFallback<GeneratePlayResult>({
      systemPrompt,
      userPrompt,
      tier: input.tierOverride ?? 'pro',  // 谋局主路径用 Pro 模型；影子评估可覆盖模型
      model: input.modelOverride,
      invocation: input.invocation,
    }, { timeoutMs: 120_000, maxAttempts: 1 });

    return normalizeGeneratedPlayResult({
      raw: result,
      input,
      knowledgeTraces,
      knowledgeGaps,
      ragCases: retrievedRagCases,
    });
  } catch (err) {
    console.error('[strategic-play-engine] Generation failed:', err);
    return normalizeGeneratedPlayResult({
      raw: null,
      input,
      knowledgeTraces,
      knowledgeGaps,
      ragCases: retrievedRagCases,
    });
  }
}

// Token utilities & prompt builder extracted to:
// - @/lib/llm-token-utils (truncate, estimateTokens, enforceTokenBudget)
// - @/lib/play-prompt-builder (buildGraphPrompt)
