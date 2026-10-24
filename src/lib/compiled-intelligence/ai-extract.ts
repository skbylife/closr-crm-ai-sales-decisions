/**
 * CIL Phase 2 — AI Extraction Helper
 *
 * Uses LLM to extract structured evidence, claims, open questions,
 * and identify which knowledge pages are affected by new raw input.
 *
 * All AI output is forced to Chinese per project rules.
 */

import { logAIInvocation, type AIInvocationContext } from '@/lib/ai-invocation-log';
import {
  DEFAULT_DEEPSEEK_FLASH_MODEL,
  getAiChatCompletionsUrl,
  getAiProviderConfig,
} from '@/lib/ai-provider-config';

import type {
  CILEvidenceType,
  CILClaimType,
  CILPageType,
  CILQuestionPriority,
} from '@/lib/babel-engine/types';

// ─── Extraction result types ────────────────────────────────────────

export interface ExtractedEvidence {
  evidenceType: CILEvidenceType;
  quoteText: string;
  summary: string;
  speaker?: string;
  relevanceScore: number;
  linkedPageTypes: CILPageType[];
}

export interface ExtractedClaim {
  claimType: CILClaimType;
  statement: string;
  confidence: number;
  affectedPageTypes: CILPageType[];
  /** Whether this claim supports or contradicts an existing understanding */
  stance: 'supports' | 'contradicts';
}

export interface ExtractedOpenQuestion {
  question: string;
  priority: CILQuestionPriority;
  relatedObjects: string[];
  blockingOutputs: string[];
}

export interface PageUpdateHint {
  pageType: CILPageType;
  reason: string;
  /** Partial JSON patch to merge into existing content_json */
  patch: Record<string, unknown>;
}

export interface ExtractionResult {
  evidence: ExtractedEvidence[];
  claims: ExtractedClaim[];
  openQuestions: ExtractedOpenQuestion[];
  pageUpdates: PageUpdateHint[];
  summary: string;
}

// ─── AI call ────────────────────────────────────────────────────────

async function callCILExtract(
  systemPrompt: string,
  userPrompt: string,
  invocation?: AIInvocationContext,
): Promise<Record<string, unknown> | null> {
  const config = getAiProviderConfig('flash');
  const model = config.model || DEFAULT_DEEPSEEK_FLASH_MODEL;
  const isDeepSeek = model.toLowerCase().startsWith('deepseek-') || /api\.deepseek\.com/i.test(config.baseUrl ?? '');
  if (!config.apiKey || !config.baseUrl) {
    console.error('[cil-extract] No AI API key configured');
    logAIInvocation({
      ...invocation,
      tier: 'flash',
      model,
      provider: 'openai-compatible',
      status: 'error',
      errorMessage: 'No AI API key configured',
      metadata: { ...invocation?.metadata, source: 'compiled_intelligence_extract' },
    });
    return null;
  }

  const startedAt = Date.now();
  try {
  const res = await fetch(
    getAiChatCompletionsUrl(config),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        ...(isDeepSeek ? { thinking: { type: 'disabled' } } : {}),
      }),
    },
  );

  if (!res.ok) {
    await res.text().catch(() => '');
    const errorMessage = `AI API error (${res.status})`;
    console.error('[cil-extract]', errorMessage);
    logAIInvocation({
      ...invocation,
      tier: 'flash',
      model,
      provider: 'openai-compatible',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage,
      metadata: { ...invocation?.metadata, source: 'compiled_intelligence_extract' },
    });
    return null;
  }

  const data = await res.json();
  const usage = data?.usage ?? {};
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logAIInvocation({
      ...invocation,
      tier: 'flash',
      model,
      provider: 'openai-compatible',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage: 'Empty response from AI API',
      metadata: { ...invocation?.metadata, source: 'compiled_intelligence_extract' },
    });
    return null;
  }
  try {
    const parsed = JSON.parse(content);
    logAIInvocation({
      ...invocation,
      tier: 'flash',
      model,
      provider: 'openai-compatible',
      status: 'success',
      durationMs: Date.now() - startedAt,
      promptTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : null,
      completionTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : null,
      totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : null,
      metadata: { ...invocation?.metadata, source: 'compiled_intelligence_extract' },
    });
    return parsed;
  } catch (err) {
    logAIInvocation({
      ...invocation,
      tier: 'flash',
      model,
      provider: 'openai-compatible',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : 'Invalid JSON response',
      metadata: { ...invocation?.metadata, source: 'compiled_intelligence_extract' },
    });
    return null;
  }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[cil-extract] AI call failed:', err);
    logAIInvocation({
      ...invocation,
      tier: 'flash',
      model,
      provider: 'openai-compatible',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage,
      metadata: { ...invocation?.metadata, source: 'compiled_intelligence_extract' },
    });
    return null;
  }
}

// ─── System prompt ──────────────────────────────────────────────────

const CIL_EXTRACT_SYSTEM_PROMPT = `你是 Closr CRM 的智能知识编译引擎。你的任务是从原始销售资料中抽取结构化的证据、判断和开放问题，并识别哪些账户知识页面需要更新。

## 输出格式 (JSON)

{
  "evidence": [
    {
      "evidenceType": "commitment|objection|budget_signal|procurement_signal|champion_signal|risk_signal|initiative_signal|general",
      "quoteText": "原始文本中的关键引用",
      "summary": "这条证据的一句话总结",
      "speaker": "发言人（如有）",
      "relevanceScore": 0.5-1.0,
      "linkedPageTypes": ["overview","stakeholders","initiatives","risks","timeline","open_questions"]
    }
  ],
  "claims": [
    {
      "claimType": "stakeholder_assessment|risk_hypothesis|initiative_judgment|budget_signal|procurement_signal|general",
      "statement": "基于证据的判断陈述",
      "confidence": 0.3-0.95,
      "stance": "supports|contradicts",
      "affectedPageTypes": ["risks","stakeholders"]
    }
  ],
  "openQuestions": [
    {
      "question": "需要进一步确认的问题",
      "priority": "high|medium|low",
      "relatedObjects": ["相关对象描述"],
      "blockingOutputs": ["forecast","strategy","close_plan"]
    }
  ],
  "pageUpdates": [
    {
      "pageType": "overview|stakeholders|initiatives|risks|timeline|open_questions",
      "reason": "为什么需要更新这个页面",
      "patch": { "对应页面结构的局部更新字段": "值" }
    }
  ],
  "summary": "本次 ingest 的一句话总结"
}

## 规则
1. 区分事实（fact）、判断（claim）和假设（hypothesis）。不要把推测写成事实。
2. 重要判断必须带 confidence 和至少一条 evidence 关联。
3. 如果有不确定的信息，创建 openQuestion，不要假装确定。
8. claim 的 stance 字段：如果新证据支持某个已有判断，用 "supports"；如果新证据与已有判断矛盾或推翻它，用 "contradicts"。默认为 "supports"。
4. evidence 的 linkedPageTypes 只填受影响的页面类型。
5. pageUpdates 只包含真正需要更新的页面，不要无关页面。
6. pageUpdates.patch 是增量补丁，不是全量替换。
7. 如果原始资料信息量很少，允许返回空数组。不要凭空编造。

## 页面类型说明
- overview: 账户总览（业务摘要、当前状态、优先级、温度）
- stakeholders: 利益相关人（角色、立场、影响力）
- initiatives: 业务议题/痛点（议题名、状态、痛点等级）
- risks: 风险与阻塞（采购、预算、竞品、内部政治）
- timeline: 账户时间线（重要事件记录）
- open_questions: 开放问题汇总

所有输出必须为中文。`;

// ─── Public extraction function ─────────────────────────────────────

export interface IngestInput {
  sourceType: 'call_transcript' | 'meeting_note' | 'note' | 'email';
  sourceId: string;
  accountName: string;
  rawText: string;
  /** Optional context (attendees, meeting title, etc.) */
  context?: string;
  invocation?: AIInvocationContext;
}

export async function extractIntelligence(input: IngestInput): Promise<ExtractionResult | null> {
  const userPrompt = buildUserPrompt(input);
  const raw = await callCILExtract(CIL_EXTRACT_SYSTEM_PROMPT, userPrompt, input.invocation);
  if (!raw) return null;
  return parseExtractionResult(raw);
}

function buildUserPrompt(input: IngestInput): string {
  const typeLabel: Record<string, string> = {
    call_transcript: '通话/会议转录',
    meeting_note: '会议纪要',
    note: '销售笔记',
    email: '邮件',
  };
  const parts: string[] = [
    `## 来源类型: ${typeLabel[input.sourceType] || input.sourceType}`,
    `## 客户: ${input.accountName}`,
  ];
  if (input.context) {
    parts.push(`## 上下文\n${input.context}`);
  }
  parts.push(`## 原始内容\n${input.rawText}`);
  return parts.join('\n\n');
}

// ─── Parse & validate AI output ─────────────────────────────────────

const VALID_EVIDENCE_TYPES = new Set([
  'commitment', 'objection', 'budget_signal', 'procurement_signal',
  'champion_signal', 'risk_signal', 'initiative_signal', 'general',
]);
const VALID_CLAIM_TYPES = new Set([
  'stakeholder_assessment', 'risk_hypothesis', 'initiative_judgment',
  'budget_signal', 'procurement_signal', 'general',
]);
const VALID_PAGE_TYPES = new Set([
  'overview', 'stakeholders', 'initiatives', 'risks', 'timeline', 'open_questions',
]);
const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);

function parseExtractionResult(raw: Record<string, unknown>): ExtractionResult {
  const evidence = Array.isArray(raw.evidence)
    ? (raw.evidence as Record<string, unknown>[])
        .map(parseEvidence)
        .filter((e): e is ExtractedEvidence => e !== null)
    : [];

  const claims = Array.isArray(raw.claims)
    ? (raw.claims as Record<string, unknown>[])
        .map(parseClaim)
        .filter((c): c is ExtractedClaim => c !== null)
    : [];

  const openQuestions = Array.isArray(raw.openQuestions)
    ? (raw.openQuestions as Record<string, unknown>[])
        .map(parseQuestion)
        .filter((q): q is ExtractedOpenQuestion => q !== null)
    : [];

  const pageUpdates = Array.isArray(raw.pageUpdates)
    ? (raw.pageUpdates as Record<string, unknown>[])
        .map(parsePageUpdate)
        .filter((p): p is PageUpdateHint => p !== null)
    : [];

  return {
    evidence,
    claims,
    openQuestions,
    pageUpdates,
    summary: typeof raw.summary === 'string' ? raw.summary : '已处理新资料',
  };
}

function parseEvidence(r: Record<string, unknown>): ExtractedEvidence | null {
  const et = String(r.evidenceType ?? 'general');
  if (!VALID_EVIDENCE_TYPES.has(et)) return null;
  if (!r.quoteText && !r.summary) return null;

  return {
    evidenceType: et as CILEvidenceType,
    quoteText: String(r.quoteText ?? ''),
    summary: String(r.summary ?? ''),
    speaker: r.speaker ? String(r.speaker) : undefined,
    relevanceScore: clamp(Number(r.relevanceScore ?? 0.5), 0, 1),
    linkedPageTypes: filterPageTypes(r.linkedPageTypes),
  };
}

function parseClaim(r: Record<string, unknown>): ExtractedClaim | null {
  const ct = String(r.claimType ?? 'general');
  if (!VALID_CLAIM_TYPES.has(ct)) return null;
  if (!r.statement) return null;

  return {
    claimType: ct as CILClaimType,
    statement: String(r.statement),
    confidence: clamp(Number(r.confidence ?? 0.5), 0, 1),
    affectedPageTypes: filterPageTypes(r.affectedPageTypes),
    stance: r.stance === 'contradicts' ? 'contradicts' : 'supports',
  };
}

function parseQuestion(r: Record<string, unknown>): ExtractedOpenQuestion | null {
  if (!r.question) return null;
  const p = String(r.priority ?? 'medium');

  return {
    question: String(r.question),
    priority: (VALID_PRIORITIES.has(p) ? p : 'medium') as CILQuestionPriority,
    relatedObjects: Array.isArray(r.relatedObjects) ? r.relatedObjects.map(String) : [],
    blockingOutputs: Array.isArray(r.blockingOutputs) ? r.blockingOutputs.map(String) : [],
  };
}

function parsePageUpdate(r: Record<string, unknown>): PageUpdateHint | null {
  const pt = String(r.pageType ?? '');
  if (!VALID_PAGE_TYPES.has(pt)) return null;

  return {
    pageType: pt as CILPageType,
    reason: String(r.reason ?? ''),
    patch: (r.patch && typeof r.patch === 'object' && !Array.isArray(r.patch))
      ? r.patch as Record<string, unknown>
      : {},
  };
}

function filterPageTypes(val: unknown): CILPageType[] {
  if (!Array.isArray(val)) return [];
  return val.map(String).filter((v) => VALID_PAGE_TYPES.has(v)) as CILPageType[];
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
