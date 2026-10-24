// Engine AI Adapter — LLM-powered signal analysis, judgment, and move generation.
//
// Each function in this module:
//   1. Attempts an LLM call with structured JSON output
//   2. Falls back to the rule-based engine when AI is unavailable/disabled
//   3. Is independently testable with mock AI responses
//
// Reuses the existing Closr AI infrastructure: callAIWithFallback, getAiProviderConfig.

import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import type { ModelTier } from '@/lib/babel-engine/gemini';
import type { AIInvocationContext } from '@/lib/ai-invocation-log';

// ── Config ────────────────────────────────────────────────

export interface EngineAiOptions {
  /** Model tier: 'flash' (default) or 'pro' */
  tier?: ModelTier;
  /** Override model name */
  model?: string;
  /** AI timeout in ms (default 60s) */
  timeoutMs?: number;
  /** Observability metadata */
  invocation?: AIInvocationContext;
}

function isAiEnabled(): boolean {
  return process.env.AI_PROVIDER !== 'disabled' && process.env.AI_PROVIDER !== 'none';
}

// ── Types ─────────────────────────────────────────────────

export interface AiDecodeOutput {
  primaryRisk: string;
  riskDescription: string;
  patterns: string[];
  signalStrength: 'strong' | 'weak';
  evidenceSummaries: Array<{
    sourceId: string;
    type: 'support' | 'counter' | 'context';
    quote: string;
    summary: string;
    qualityScore: number;
  }>;
  missingEvidence: string[];
}

export interface AiJudgmentOutput {
  dimension: string;
  answer: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  missingEvidence: string[];
  rationale: string;
  currentState: string;
  desiredState: string;
}

export interface AiMoveOutput {
  intent: string;
  targetPerson: string;
  ask: string;
  expectedJudgmentDelta: string;
  successTest: string;
  failureTest: string;
  approvalRequired: boolean;
}

// ── Prompt Templates ──────────────────────────────────────

const DECODE_SYSTEM_PROMPT = `你是 Closr Judgment Engine 的信号分析专家。

分析以下销售信号（邮件/会议记录/RFP/CRM 备注），输出结构化结果：

1. primaryRisk: 识别主要风险类别（如 "finance/procurement blocker"、"security/compliance blocker"、"rfp/tender process blocker" 或其他具体风险）
2. riskDescription: 用一句话描述当前风险
3. patterns: 检测到的信号模式标签（如 ["finance", "procurement", "competitor"]）
4. signalStrength: strong（有明确证据）/ weak（仅有模糊信号）
5. evidenceSummaries: 从每条信号中提取的支持/反证/上下文证据
6. missingEvidence: 当前缺什么关键证据才能确认判断

规则：
- 证据 quote 必须来自原文，不要编造
- qualityScore 0.0-1.0，根据证据直接程度打分
- 如果没有强信号，signalStrength 设为 weak，patterns 为空数组
- 中文输出`;

const JUDGMENT_SYSTEM_PROMPT = `你是 Closr Judgment Engine 的判断分析专家。

基于以下信号证据和信号画像，输出结构化销售判断：

1. dimension: 判断维度（finance / security / rfp / commercial / relationship / process / competition / evidence / progression）
2. answer: 用一句话说明当前是什么情况
3. confidence: 0.0-1.0，基于证据质量打分
4. impact: low / medium / high / critical
5. missingEvidence: 还缺什么关键信息
6. rationale: 判断依据，引用具体证据
7. currentState: 当前状态描述
8. desiredState: 期望达成状态

规则：
- confidence 必须与 evidenceQuality 匹配
- 不要在没有直接证据时给出高置信度
- 中文输出`;

const MOVE_SYSTEM_PROMPT = `你是 Closr Judgment Engine 的谋局分析师。

基于判断和赢单缺口，输出下一步动作建议：

1. intent: 动作目的（如 "validate financial blocker"、"clear security review blocker"）
2. targetPerson: 应该找谁推动这一步
3. ask: 具体的沟通请求
4. expectedJudgmentDelta: 这个动作完成后预期判断如何变化
5. successTest: 怎么判断这个动作成功了
6. failureTest: 怎么判断这个动作没效果
7. approvalRequired: true（默认需要审批）

规则：
- 动作建议要可执行、具体
- targetPerson 要基于上下文合理推断
- 中文输出`;

// ── JSON Schemas for structured output ────────────────────

const DECODE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    primaryRisk: { type: 'string' },
    riskDescription: { type: 'string' },
    patterns: { type: 'array', items: { type: 'string' } },
    signalStrength: { type: 'string', enum: ['strong', 'weak'] },
    evidenceSummaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          type: { type: 'string', enum: ['support', 'counter', 'context'] },
          quote: { type: 'string' },
          summary: { type: 'string' },
          qualityScore: { type: 'number' },
        },
        required: ['sourceId', 'type', 'quote', 'summary', 'qualityScore'],
      },
    },
    missingEvidence: { type: 'array', items: { type: 'string' } },
  },
  required: ['primaryRisk', 'riskDescription', 'patterns', 'signalStrength', 'evidenceSummaries', 'missingEvidence'],
};

const JUDGMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string', enum: ['finance', 'security', 'rfp', 'commercial', 'relationship', 'process', 'competition', 'evidence', 'progression'] },
    answer: { type: 'string' },
    confidence: { type: 'number' },
    impact: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    missingEvidence: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
    currentState: { type: 'string' },
    desiredState: { type: 'string' },
  },
  required: ['dimension', 'answer', 'confidence', 'impact', 'missingEvidence', 'rationale', 'currentState', 'desiredState'],
};

const MOVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    targetPerson: { type: 'string' },
    ask: { type: 'string' },
    expectedJudgmentDelta: { type: 'string' },
    successTest: { type: 'string' },
    failureTest: { type: 'string' },
    approvalRequired: { type: 'boolean' },
  },
  required: ['intent', 'targetPerson', 'ask', 'expectedJudgmentDelta', 'successTest', 'failureTest', 'approvalRequired'],
};

// ── Build user prompt helpers ─────────────────────────────

function buildDecodePrompt(sources: Array<{ id: string; sourceType: string; content?: string; author?: { side?: string; name?: string } }>): string {
  const items = sources
    .map((s, i) => {
      const author = s.author ? `[${s.author.side ?? 'unknown'} ${s.author.name ?? ''}]` : '';
      return `--- 信号 ${i + 1} (${s.sourceType}) ${author} ---\n${s.content ?? '(无内容)'}`;
    })
    .join('\n\n');
  return `分析以下销售信号，输出结构化风险判断：\n\n${items}`;
}

function buildJudgmentPrompt(evidenceCount: number, primaryRisk: string, patterns: string[], signalStrength: string, sourceSummaries: Array<{ sourceId: string; summary: string; qualityScore: number }>): string {
  const srcInfo = sourceSummaries.map((s) => `- ${s.sourceId}: ${s.summary} (quality: ${s.qualityScore})`).join('\n');
  return `信号画像：
- 主要风险: ${primaryRisk}
- 检测模式: ${patterns.join(', ')}
- 信号强度: ${signalStrength}
- 证据条目: ${evidenceCount}

证据摘要：
${srcInfo}

基于以上信息，输出结构化销售判断。`;
}

function buildMovePrompt(judgmentAnswer: string, judgmentDimension: string, missingEvidence: string[], currentState: string, desiredState: string, playGoal?: string): string {
  const goalSection = playGoal
    ? `\n谋局目标：\n${playGoal}\n\n请围绕这个目标来设计动作建议的优先级和内容。`
    : '';
  return `判断结果：
- 维度: ${judgmentDimension}
- 判断: ${judgmentAnswer}
- 缺失证据: ${missingEvidence.join(', ')}

赢单缺口：
- 当前状态: ${currentState}
- 期望状态: ${desiredState}${goalSection}

基于以上信息，输出下一步动作建议。`;
}

// ── AI Decode ─────────────────────────────────────────────

export async function aiDecodeSources(
  sources: Array<{ id: string; sourceType: string; content?: string; author?: { side?: string; name?: string } }>,
  options: EngineAiOptions = {},
): Promise<AiDecodeOutput | null> {
  if (!isAiEnabled()) return null;

  try {
    const result = await callAIWithFallback<AiDecodeOutput>(
      {
        systemPrompt: DECODE_SYSTEM_PROMPT,
        userPrompt: buildDecodePrompt(sources),
        tier: options.tier ?? 'flash',
        model: options.model,
        jsonSchema: DECODE_JSON_SCHEMA,
        invocation: options.invocation,
      },
      { timeoutMs: options.timeoutMs },
    );
    return result;
  } catch {
    return null;
  }
}

// ── AI Judgment ───────────────────────────────────────────

export async function aiBuildJudgment(
  params: {
    primaryRisk: string;
    patterns: string[];
    signalStrength: string;
    evidenceSummaries: Array<{ sourceId: string; summary: string; qualityScore: number }>;
  },
  options: EngineAiOptions = {},
): Promise<AiJudgmentOutput | null> {
  if (!isAiEnabled()) return null;

  try {
    const result = await callAIWithFallback<AiJudgmentOutput>(
      {
        systemPrompt: JUDGMENT_SYSTEM_PROMPT,
        userPrompt: buildJudgmentPrompt(
          params.evidenceSummaries.length,
          params.primaryRisk,
          params.patterns,
          params.signalStrength,
          params.evidenceSummaries,
        ),
        tier: options.tier ?? 'pro',
        model: options.model,
        jsonSchema: JUDGMENT_JSON_SCHEMA,
        invocation: options.invocation,
      },
      { timeoutMs: options.timeoutMs },
    );
    return result;
  } catch {
    return null;
  }
}

// ── AI Move ───────────────────────────────────────────────

export async function aiGenerateMove(
  params: {
    judgmentAnswer: string;
    judgmentDimension: string;
    missingEvidence: string[];
    currentState: string;
    desiredState: string;
    playGoal?: string;
  },
  options: EngineAiOptions = {},
): Promise<AiMoveOutput | null> {
  if (!isAiEnabled()) return null;

  try {
    const result = await callAIWithFallback<AiMoveOutput>(
      {
        systemPrompt: MOVE_SYSTEM_PROMPT,
        userPrompt: buildMovePrompt(
          params.judgmentAnswer,
          params.judgmentDimension,
          params.missingEvidence,
          params.currentState,
          params.desiredState,
          params.playGoal,
        ),
        tier: options.tier ?? 'pro',
        model: options.model,
        jsonSchema: MOVE_JSON_SCHEMA,
        invocation: options.invocation,
      },
      { timeoutMs: options.timeoutMs },
    );
    return result;
  } catch {
    return null;
  }
}
