/**
 * Account-level AI Analysis
 *
 * Gathers all evidence records for an account and calls the LLM to produce
 * a strategic narrative analysis. Results are stored in account_knowledge_pages
 * (page_type='ai_analysis') for fast retrieval on subsequent page loads.
 */

import { ApiError, requireAccountAccess, requireAdmin } from '@/lib/api-guard';
import { logAIInvocation, type AIInvocationContext } from '@/lib/ai-invocation-log';
import {
  DEFAULT_DEEPSEEK_PRO_MODEL,
  getAiChatCompletionsUrl,
  getAiProviderConfig,
} from '@/lib/ai-provider-config';
import { estimateTokens } from '@/lib/llm-token-utils';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction, type OutputLocale } from '@/lib/output-locale';
import type { UserContext } from '@/lib/permissions';
import { loadEvidenceRecordsScoped, loadEvidenceRecordsUnsafeInternal } from './server';
import type { EvidenceRecord } from './index';

interface CILContext {
  claims: Array<{
    id: string;
    claim_type?: string | null;
    statement: string;
    status?: string | null;
    confidence?: number | null;
    updated_at?: string | null;
  }>;
  evidence: Array<{
    id: string;
    evidence_type?: string | null;
    summary?: string | null;
    quote_text?: string | null;
    speaker?: string | null;
    relevance_score?: number | null;
    occurred_at?: string | null;
    created_at?: string | null;
  }>;
  knowledgePages: Array<{
    id: string;
    page_type?: string | null;
    title?: string | null;
    content_json?: Record<string, unknown> | null;
    updated_at?: string | null;
  }>;
}

const PRIMARY_ANALYSIS_STORE = 'account_knowledge_pages';
const FALLBACK_ANALYSIS_STORE = 'ai_insights';
const ANALYSIS_PAGE_TYPE = 'ai_analysis';

function analysisPageType(locale: OutputLocale): string {
  return locale === 'en' ? ANALYSIS_PAGE_TYPE + '_en' : ANALYSIS_PAGE_TYPE;
}

async function assertAnalysisAccountScope(ctx: UserContext | undefined, accountId: string, orgId: string): Promise<void> {
  if (!ctx) return;
  if (ctx.orgId !== orgId) {
    throw new ApiError(403, '组织上下文不匹配，无法加载 AI 分析上下文');
  }
  await requireAccountAccess(ctx, accountId);
}

// ─── Types ──────────────────────────────────────────────────────────

export interface AIAnalysisResult {
  /** One-paragraph strategic narrative */
  narrative: string;
  /** Current momentum assessment */
  momentum: { status: string; label: string; reason: string };
  /** Key risks identified */
  risks: { title: string; severity: string; detail: string }[];
  /** Recommended next actions */
  nextActions: { title: string; reason: string; urgency: string }[];
  /** Stakeholder power map summary */
  stakeholderSummary: string;
  /** Open questions that need resolution */
  openQuestions: string[];
  /** When analysis was generated */
  analyzedAt: string;
  /** Previous analysis snapshot for comparison (only present right after re-analysis) */
  previousAnalysis?: {
    narrative: string;
    momentum: { status: string; label: string; reason: string };
    analyzedAt: string;
  };
}

// ─── AI call ────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `你是 Closr CRM 的资深销售策略分析师。你的任务是根据一个客户账户的全部已知证据和信号，产出一份简洁有力的战略分析。

## 输出格式 (JSON)

{
  "narrative": "一段200字以内的战略叙事，用销售谋局的语言概括当前局势、核心矛盾和关键转折点。不要写成报告体，要像资深销售VP在内部会上讲的话。",
  "momentum": {
    "status": "rising|steady|slowing|stalled|at_risk",
    "label": "势头判断的中文标签，如'势头上升'、'结构性停滞'",
    "reason": "一句话解释为什么做出这个判断"
  },
  "risks": [
    {
      "title": "风险标题",
      "severity": "high|medium|low",
      "detail": "风险的具体表现和可能后果"
    }
  ],
  "nextActions": [
    {
      "title": "建议动作",
      "reason": "为什么现在要做这件事",
      "urgency": "immediate|this_week|this_month"
    }
  ],
  "stakeholderSummary": "一段简短的干系人格局描述：谁在推、谁在拦、谁缺位",
  "openQuestions": ["需要进一步确认的关键问题"]
}

## 规则
1. 不要写成功能描述或报告模板，要写成真实的销售判断。
2. narrative 要有洞察力：不是"客户有3个联系人"，而是"决策链尚未闭合——采购负责人从未出现在任何深度沟通中"。
3. risks 只列真正影响成交的风险，不要列常识性风险。
4. nextActions 要可执行、具体，不要写"继续跟进"这种空话。
5. 如果证据不足，明确说证据不足，不要编造判断。
6. 所有输出必须为中文。`;

function analysisSystemPrompt(locale: OutputLocale): string {
  if (locale !== 'en') return ANALYSIS_SYSTEM_PROMPT;
  return ANALYSIS_SYSTEM_PROMPT.replace(
    '6. 所有输出必须为中文。',
    [
      '6. All generated narrative, momentum labels, reasons, risk titles/details, next actions, stakeholder summaries, and open questions must be in English.',
      '7. Do not mix Chinese business phrases into the English output. Translate Chinese evidence into concise English analysis unless it is a direct quote.',
      outputLocaleInstruction('en'),
    ].join('\\n'),
  );
}

/** Validate that an AI analysis result meets minimum quality thresholds */
function validateAnalysisResult(result: AIAnalysisResult): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!result.narrative || result.narrative.length < 50) {
    reasons.push(`narrative too short (${result.narrative?.length ?? 0} chars, need 50+)`);
  }
  if (!result.momentum?.status || !result.momentum?.label) {
    reasons.push('momentum missing status or label');
  }
  if (!Array.isArray(result.risks) || result.risks.length === 0) {
    reasons.push('risks array empty');
  }
  if (!Array.isArray(result.nextActions) || result.nextActions.length === 0) {
    reasons.push('nextActions array empty');
  }
  if (!result.stakeholderSummary || result.stakeholderSummary.length < 10) {
    reasons.push(`stakeholderSummary too short (${result.stakeholderSummary?.length ?? 0} chars)`);
  }

  return { valid: reasons.length === 0, reasons };
}

// ─── Streaming types ───────────────────────────────────────────────

export type AnalysisStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'narrative'; text: string }
  | { type: 'complete'; result: AIAnalysisResult }
  | { type: 'error'; message: string };

interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

function normalizeTokenUsage(usage: unknown): TokenUsage {
  const record = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
  const promptTokens = typeof record.prompt_tokens === 'number' ? record.prompt_tokens : null;
  const completionTokens = typeof record.completion_tokens === 'number' ? record.completion_tokens : null;
  const totalTokens = typeof record.total_tokens === 'number' ? record.total_tokens : null;
  return { promptTokens, completionTokens, totalTokens };
}

function hasTokenUsage(usage: TokenUsage): boolean {
  return typeof usage.promptTokens === 'number' || typeof usage.completionTokens === 'number' || typeof usage.totalTokens === 'number';
}

function estimateAnalysisUsage(userPrompt: string, completion: string, locale: OutputLocale): TokenUsage {
  const promptTokens = estimateTokens(`${analysisSystemPrompt(locale)}\n${userPrompt}`);
  const completionTokens = estimateTokens(completion);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

/** Extract the narrative string from partially-streamed JSON */
function extractPartialNarrative(accumulated: string): string | null {
  const marker = '"narrative"';
  const idx = accumulated.indexOf(marker);
  if (idx === -1) return null;

  let i = idx + marker.length;
  while (i < accumulated.length && /[\s:]/.test(accumulated[i])) i++;
  if (i >= accumulated.length || accumulated[i] !== '"') return null;
  i++; // skip opening quote

  let result = '';
  let escaped = false;
  for (; i < accumulated.length; i++) {
    if (escaped) {
      switch (accumulated[i]) {
        case 'n': result += '\n'; break;
        case '"': result += '"'; break;
        case '\\': result += '\\'; break;
        default: result += accumulated[i];
      }
      escaped = false;
      continue;
    }
    if (accumulated[i] === '\\') { escaped = true; continue; }
    if (accumulated[i] === '"') break;
    result += accumulated[i];
  }
  return result || null;
}

/** Stream AI call — yields partial narrative then complete result */
async function* streamAICall(userPrompt: string, locale: OutputLocale, invocation?: AIInvocationContext): AsyncGenerator<AnalysisStreamEvent> {
  const config = getAiProviderConfig('pro');
  const model = config.model || DEFAULT_DEEPSEEK_PRO_MODEL;
  const isDeepSeek = model.toLowerCase().startsWith('deepseek-') || /api\.deepseek\.com/i.test(config.baseUrl ?? '');
  if (!config.apiKey || !config.baseUrl) {
    logAIInvocation({
      ...invocation,
      tier: 'pro',
      model,
      provider: 'openai-compatible',
      status: 'error',
      errorMessage: 'No AI API key configured',
      metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
    });
    yield { type: 'error', message: 'No AI API key configured' };
    return;
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
            { role: 'system', content: analysisSystemPrompt(locale) },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          ...(isDeepSeek ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' } : {}),
          stream: true,
          stream_options: { include_usage: true },
        }),
      },
    );

    if (!res.ok) {
      const errorMessage = `AI API error: ${res.status}`;
      logAIInvocation({
        ...invocation,
        tier: 'pro',
        model,
        provider: 'openai-compatible',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage,
        metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
      });
      yield { type: 'error', message: errorMessage };
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let lastNarrativeLen = 0;
    let usage: TokenUsage = { promptTokens: null, completionTokens: null, totalTokens: null };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const chunkUsage = normalizeTokenUsage(parsed?.usage);
          if (hasTokenUsage(chunkUsage)) usage = chunkUsage;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            const narrative = extractPartialNarrative(accumulated);
            if (narrative && narrative.length > lastNarrativeLen + 4) {
              lastNarrativeLen = narrative.length;
              yield { type: 'narrative', text: narrative };
            }
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    const usageSource = hasTokenUsage(usage) ? 'provider_stream' : 'estimated_stream';
    if (!hasTokenUsage(usage)) usage = estimateAnalysisUsage(userPrompt, accumulated, locale);

    // Parse complete JSON
    const parsed = JSON.parse(accumulated) as Record<string, unknown>;
    const result = parseAnalysisResult(parsed);
    const { valid, reasons } = validateAnalysisResult(result);
    if (!valid) {
      const errorMessage = `Quality gate failed: ${reasons.join('; ')}`;
      logAIInvocation({
        ...invocation,
        tier: 'pro',
        model,
        provider: 'openai-compatible',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage,
        metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
      });
      yield { type: 'error', message: errorMessage };
      return;
    }
    logAIInvocation({
      ...invocation,
      tier: 'pro',
      model,
      provider: 'openai-compatible',
      status: 'success',
      durationMs: Date.now() - startedAt,
      ...usage,
      metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis', usageSource },
    });
    yield { type: 'complete', result };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[ai-analysis] Stream failed:', err);
    logAIInvocation({
      ...invocation,
      tier: 'pro',
      model,
      provider: 'openai-compatible',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage,
      metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
    });
    yield { type: 'error', message: 'AI analysis stream failed' };
  }
}

/** Streaming entry point — yields events as analysis progresses */
export async function* streamAccountAIAnalysis(params: {
  accountId: string;
  accountName: string;
  orgId: string;
  ctx?: UserContext;
  outputLocale?: OutputLocale;
}): AsyncGenerator<AnalysisStreamEvent> {
  const { accountId, accountName, orgId, ctx } = params;
  const outputLocale = normalizeOutputLocale(params.outputLocale);
  await assertAnalysisAccountScope(ctx, accountId, orgId);
  const admin = requireAdmin();

  yield { type: 'status', message: localizedUnavailableText(outputLocale, { zh: '正在加载证据...', en: 'Loading evidence...' }) };

  const [records, claims, evidence, knowledgePages, previousAnalysis] = await Promise.all([
    ctx ? loadEvidenceRecordsScoped(ctx, accountId, orgId) : loadEvidenceRecordsUnsafeInternal(accountId, orgId),
    admin.from('account_claims').select('id, claim_type, statement, status, confidence, updated_at').eq('org_id', orgId).eq('account_id', accountId).order('updated_at', { ascending: false }).limit(24),
    admin.from('account_evidence').select('id, evidence_type, summary, quote_text, speaker, relevance_score, occurred_at, created_at').eq('org_id', orgId).eq('account_id', accountId).order('occurred_at', { ascending: false }).order('created_at', { ascending: false }).limit(24),
    admin.from('account_knowledge_pages').select('id, page_type, title, content_json, updated_at').eq('org_id', orgId).eq('account_id', accountId).order('updated_at', { ascending: false }).limit(12),
    loadAIAnalysis(accountId, orgId, outputLocale),
  ]);

  if (records.length === 0) {
    const empty: AIAnalysisResult = {
      narrative: localizedUnavailableText(outputLocale, {
        zh: `${accountName} 目前缺少足够的互动记录和证据，无法进行有效的 AI 分析。建议先添加情报、邮件解读或活动记录。`,
        en: `${accountName} does not yet have enough interaction history or evidence for a reliable account analysis. Add or review customer evidence before confirming the next move.`,
      }),
      momentum: { status: 'stalled', label: localizedUnavailableText(outputLocale, { zh: '待启动', en: 'Not started' }), reason: localizedUnavailableText(outputLocale, { zh: '暂无证据输入', en: 'No evidence input yet' }) },
      risks: [],
      nextActions: [{ title: localizedUnavailableText(outputLocale, { zh: '添加首条情报或邮件解读', en: 'Add the first intel item or decode' }), reason: localizedUnavailableText(outputLocale, { zh: '系统需要至少有原始互动记录才能启动分析', en: 'Closr needs at least one source interaction before analysis can start' }), urgency: 'immediate' }],
      stakeholderSummary: localizedUnavailableText(outputLocale, { zh: '暂无干系人信息。', en: 'No stakeholder information yet.' }),
      openQuestions: [],
      analyzedAt: new Date().toISOString(),
    };
    await saveAnalysis(accountId, orgId, empty, outputLocale);
    yield { type: 'complete', result: empty };
    return;
  }

  const cil: CILContext = {
    claims: claims.data ?? [],
    evidence: evidence.data ?? [],
    knowledgePages: knowledgePages.data ?? [],
  };

  yield { type: 'status', message: localizedUnavailableText(outputLocale, { zh: `正在分析 ${records.length} 条证据...`, en: `Analyzing ${records.length} evidence records...` }) };

  const prompt = buildAnalysisPrompt(accountName, records, cil);
  let finalResult: AIAnalysisResult | null = null;

  for await (const event of streamAICall(prompt, outputLocale, {
    orgId,
    userId: ctx?.userId,
    accountId,
    route: '/api/accounts/[id]/analyze',
    useCase: 'evidence-memory.ai-analysis',
    metadata: { hasCtx: Boolean(ctx) },
  })) {
    if (event.type === 'complete') {
      finalResult = event.result;
      // Attach previous analysis for comparison
      if (previousAnalysis) {
        finalResult.previousAnalysis = {
          narrative: previousAnalysis.narrative,
          momentum: previousAnalysis.momentum,
          analyzedAt: previousAnalysis.analyzedAt,
        };
      }
      // Save to DB (fire-and-forget)
      void saveAnalysis(accountId, orgId, finalResult, outputLocale);
      void admin.from(PRIMARY_ANALYSIS_STORE).delete()
        .eq('org_id', orgId).eq('account_id', accountId).eq('page_type', 'memory_snapshot')
        .then(() => {});
      yield { type: 'complete', result: finalResult };
    } else {
      yield event;
    }
  }

  if (!finalResult) {
    // Stream failed — fall back to previous analysis
    if (previousAnalysis) {
      yield { type: 'complete', result: previousAnalysis };
    }
  }
}

async function callAIAnalysis(userPrompt: string, locale: OutputLocale, invocation?: AIInvocationContext): Promise<AIAnalysisResult | null> {
  const config = getAiProviderConfig('pro');
  const model = config.model || DEFAULT_DEEPSEEK_PRO_MODEL;
  const isDeepSeek = model.toLowerCase().startsWith('deepseek-') || /api\.deepseek\.com/i.test(config.baseUrl ?? '');
  if (!config.apiKey || !config.baseUrl) {
    console.error('[ai-analysis] No AI API key configured');
    logAIInvocation({
      ...invocation,
      tier: 'pro',
      model,
      provider: 'openai-compatible',
      status: 'error',
      errorMessage: 'No AI API key configured',
      metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
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
            { role: 'system', content: analysisSystemPrompt(locale) },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          ...(isDeepSeek ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' } : {}),
        }),
      },
    );

    if (!res.ok) {
      const errorMessage = `AI API error (${res.status})`;
      console.error('[ai-analysis]', errorMessage);
      logAIInvocation({
        ...invocation,
        tier: 'pro',
        model,
        provider: 'openai-compatible',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage,
        metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
      });
      return null;
    }

    const data = await res.json();
    let usage = normalizeTokenUsage(data?.usage);
    const usageSource = hasTokenUsage(usage) ? 'provider' : 'estimated';
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[ai-analysis] Empty response content from AI');
      logAIInvocation({
        ...invocation,
        tier: 'pro',
        model,
        provider: 'openai-compatible',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage: 'Empty response content from AI',
        metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
      });
      return null;
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const result = parseAnalysisResult(parsed);
    if (!hasTokenUsage(usage)) usage = estimateAnalysisUsage(userPrompt, content, locale);

    // Quality gate: validate before returning
    const { valid, reasons } = validateAnalysisResult(result);
    if (!valid) {
      const errorMessage = `Quality gate failed: ${reasons.join('; ')}`;
      console.warn('[ai-analysis] Quality gate failed:', reasons.join('; '));
      logAIInvocation({
        ...invocation,
        tier: 'pro',
        model,
        provider: 'openai-compatible',
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorMessage,
        metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
      });
      return null;
    }

    logAIInvocation({
      ...invocation,
      tier: 'pro',
      model,
      provider: 'openai-compatible',
      status: 'success',
      durationMs: Date.now() - startedAt,
      ...usage,
      metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis', usageSource },
    });
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[ai-analysis] Failed:', err);
    logAIInvocation({
      ...invocation,
      tier: 'pro',
      model,
      provider: 'openai-compatible',
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorMessage,
      metadata: { ...invocation?.metadata, source: 'evidence_memory_analysis' },
    });
    return null;
  }
}

function parseAnalysisResult(raw: Record<string, unknown>): AIAnalysisResult {
  const momentum = raw.momentum as Record<string, string> | undefined;
  const risks = Array.isArray(raw.risks) ? raw.risks.map((r: Record<string, string>) => ({
    title: String(r.title ?? ''),
    severity: String(r.severity ?? 'medium'),
    detail: String(r.detail ?? ''),
  })) : [];
  const nextActions = Array.isArray(raw.nextActions) ? raw.nextActions.map((a: Record<string, string>) => ({
    title: String(a.title ?? ''),
    reason: String(a.reason ?? ''),
    urgency: String(a.urgency ?? 'this_week'),
  })) : [];
  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions.map(String)
    : [];

  return {
    narrative: String(raw.narrative ?? '证据不足，无法形成有效分析。'),
    momentum: {
      status: String(momentum?.status ?? 'steady'),
      label: String(momentum?.label ?? '待评估'),
      reason: String(momentum?.reason ?? ''),
    },
    risks,
    nextActions,
    stakeholderSummary: String(raw.stakeholderSummary ?? ''),
    openQuestions,
    analyzedAt: new Date().toISOString(),
  };
}

// ─── Build prompt from evidence records ─────────────────────────────

function buildAnalysisPrompt(accountName: string, records: EvidenceRecord[], cil?: CILContext): string {
  const sections: string[] = [`## 客户：${accountName}`, `## 证据记录数量：${records.length}`];

  if (cil) {
    sections.push(`\n## CIL 编译层`);

    if (cil.claims.length > 0) {
      sections.push(`### 当前判断（${cil.claims.length}条）`);
      for (const item of cil.claims.slice(0, 12)) {
        sections.push(`- ${(item.claim_type ?? 'general').toUpperCase()} | ${item.status ?? 'active'} | 置信度 ${Math.round(Number(item.confidence ?? 0) * 100)}%: ${item.statement}`);
      }
    }

    if (cil.evidence.length > 0) {
      sections.push(`### 关键证据（${cil.evidence.length}条）`);
      for (const item of cil.evidence.slice(0, 12)) {
        const quote = item.quote_text ? ` | 引述: ${item.quote_text.slice(0, 120)}` : '';
        sections.push(`- ${item.evidence_type ?? 'evidence'} | ${(item.summary ?? '无摘要').slice(0, 140)}${quote}`);
      }
    }

    if (cil.knowledgePages.length > 0) {
      sections.push(`### 知识页摘要（${cil.knowledgePages.length}条）`);
      for (const item of cil.knowledgePages.slice(0, 8)) {
        const content = item.content_json && typeof item.content_json === 'object' ? item.content_json : {};
        const summary = [content.summary, content.narrative]
          .find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
        sections.push(`- ${item.title ?? item.page_type ?? 'knowledge'}: ${(summary ?? '已沉淀业务知识').slice(0, 160)}`);
      }
    }
  }

  // Group records by source kind for clarity
  const grouped = new Map<string, EvidenceRecord[]>();
  for (const r of records) {
    const kind = r.sourceKind ?? 'unknown';
    if (!grouped.has(kind)) grouped.set(kind, []);
    grouped.get(kind)!.push(r);
  }

  for (const [kind, items] of grouped) {
    const kindLabel = KIND_LABELS[kind] ?? kind;
    sections.push(`\n### ${kindLabel}（${items.length}条）`);
    // Limit to most recent items per kind to stay within context
    const limited = items.slice(0, 10);
    for (const item of limited) {
      const date = item.occurredAt ? new Date(item.occurredAt).toLocaleDateString('zh-CN') : '';
      const contact = item.contactName ? `[${item.contactName}${item.contactTitle ? '·' + item.contactTitle : ''}]` : '';
      sections.push(`- ${date} ${contact} ${item.title}: ${item.summary}`);
    }
    if (items.length > 10) {
      sections.push(`  ...还有 ${items.length - 10} 条更早的记录`);
    }
  }

  return sections.join('\n');
}

const KIND_LABELS: Record<string, string> = {
  intel_item: '情报信号',
  email_decode: '邮件解读',
  integration_email: '邮件往来',
  meeting_prep: '会议纪要',
  activity_log: '活动记录',
  strategic_play: '谋局建议',
  source_record: '来源记录',
  account_evidence: '编译证据',
  account_claim: '编译判断',
  knowledge_page: '知识页',
};

// ─── Main entry point ───────────────────────────────────────────────

export async function runAccountAIAnalysis(params: {
  accountId: string;
  accountName: string;
  orgId: string;
  ctx?: UserContext;
  outputLocale?: OutputLocale;
}): Promise<AIAnalysisResult | null> {
  const { accountId, accountName, orgId, ctx } = params;
  const outputLocale = normalizeOutputLocale(params.outputLocale);
  await assertAnalysisAccountScope(ctx, accountId, orgId);

  // 1. Load all evidence records + compiled CIL context + previous analysis in parallel
  const admin = requireAdmin();

  const [records, claims, evidence, knowledgePages, previousAnalysis] = await Promise.all([
    ctx ? loadEvidenceRecordsScoped(ctx, accountId, orgId) : loadEvidenceRecordsUnsafeInternal(accountId, orgId),
    admin
      .from('account_claims')
      .select('id, claim_type, statement, status, confidence, updated_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(24),
    admin
      .from('account_evidence')
      .select('id, evidence_type, summary, quote_text, speaker, relevance_score, occurred_at, created_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(24),
    admin
      .from('account_knowledge_pages')
      .select('id, page_type, title, content_json, updated_at')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(12),
    loadAIAnalysis(accountId, orgId, outputLocale),
  ]);

  const cil: CILContext = {
    claims: claims.data ?? [],
    evidence: evidence.data ?? [],
    knowledgePages: knowledgePages.data ?? [],
  };

  if (records.length === 0) {
    // Return a minimal result instead of null
    const empty: AIAnalysisResult = {
      narrative: localizedUnavailableText(outputLocale, {
        zh: `${accountName} 目前缺少足够的互动记录和证据，无法进行有效的 AI 分析。建议先添加情报、邮件解读或活动记录。`,
        en: `${accountName} does not yet have enough interaction history or evidence for a reliable account analysis. Add or review customer evidence before confirming the next move.`,
      }),
      momentum: { status: 'stalled', label: localizedUnavailableText(outputLocale, { zh: '待启动', en: 'Not started' }), reason: localizedUnavailableText(outputLocale, { zh: '暂无证据输入', en: 'No evidence input yet' }) },
      risks: [],
      nextActions: [{ title: localizedUnavailableText(outputLocale, { zh: '添加首条情报或邮件解读', en: 'Add the first intel item or decode' }), reason: localizedUnavailableText(outputLocale, { zh: '系统需要至少有原始互动记录才能启动分析', en: 'Closr needs at least one source interaction before analysis can start' }), urgency: 'immediate' }],
      stakeholderSummary: localizedUnavailableText(outputLocale, { zh: '暂无干系人信息。', en: 'No stakeholder information yet.' }),
      openQuestions: [],
      analyzedAt: new Date().toISOString(),
    };
    await saveAnalysis(accountId, orgId, empty, outputLocale);
    return empty;
  }

  // 2. Build prompt and call AI (previous analysis already loaded in parallel above)
  const prompt = buildAnalysisPrompt(accountName, records, cil);
  const result = await callAIAnalysis(prompt, outputLocale, {
    orgId,
    userId: ctx?.userId,
    accountId,
    route: '/api/accounts/[id]/analyze',
    useCase: 'evidence-memory.ai-analysis',
    metadata: { hasCtx: Boolean(ctx), mode: 'non_stream' },
  });

  if (!result) {
    // AI failed or quality gate rejected — preserve last good analysis
    console.warn('[ai-analysis] AI call failed or quality rejected, preserving previous result');
    return previousAnalysis;
  }

  // Attach previous for comparison
  if (previousAnalysis) {
    result.previousAnalysis = {
      narrative: previousAnalysis.narrative,
      momentum: previousAnalysis.momentum,
      analyzedAt: previousAnalysis.analyzedAt,
    };
  }

  // 4. Save to DB
  await saveAnalysis(accountId, orgId, result, outputLocale);

  // 4. Invalidate memory snapshot cache so next load merges new analysis
  try {
    const admin = requireAdmin();
    await admin
      .from(PRIMARY_ANALYSIS_STORE)
      .delete()
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .eq('page_type', 'memory_snapshot');
  } catch {}

  return result;
}

/** Load cached AI analysis from DB */
export async function loadAIAnalysis(accountId: string, orgId: string, locale: OutputLocale = 'zh'): Promise<AIAnalysisResult | null> {
  const admin = requireAdmin();
  const pageType = analysisPageType(normalizeOutputLocale(locale));

  try {
    const { data, error } = await admin
      .from(PRIMARY_ANALYSIS_STORE)
      .select('content_json')
      .eq('org_id', orgId)
      .eq('account_id', accountId)
      .eq('page_type', pageType)
      .maybeSingle();

    if (!error && data?.content_json) {
      return data.content_json as unknown as AIAnalysisResult;
    }

    if (error && !isMissingRelationError(error)) {
      console.warn('[ai-analysis] Primary load failed:', error);
    }
  } catch (err) {
    console.warn('[ai-analysis] Primary load threw:', err);
  }

  try {
    const { data, error } = await admin
      .from(FALLBACK_ANALYSIS_STORE)
      .select('data')
      .eq('org_id', orgId)
      .eq('entity_type', 'account')
      .eq('entity_id', accountId)
      .eq('insight_type', pageType)
      .maybeSingle();

    if (error) {
      console.warn('[ai-analysis] Fallback load failed:', error);
      return null;
    }

    return (data?.data as AIAnalysisResult | null) ?? null;
  } catch (err) {
    console.warn('[ai-analysis] Fallback load threw:', err);
    return null;
  }
}

async function saveAnalysis(accountId: string, orgId: string, result: AIAnalysisResult, locale: OutputLocale = 'zh'): Promise<void> {
  const admin = requireAdmin();
  const outputLocale = normalizeOutputLocale(locale);
  const pageType = analysisPageType(outputLocale);

  try {
    const { error } = await admin
      .from(PRIMARY_ANALYSIS_STORE)
      .upsert({
        org_id: orgId,
        account_id: accountId,
        page_type: pageType,
        title: localizedUnavailableText(outputLocale, { zh: 'AI 战略分析', en: 'AI account analysis' }),
        content_json: result,
        version: 1,
        updated_by: 'ai',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,account_id,page_type' });

    if (!error) {
      return;
    }

    if (!isMissingRelationError(error)) {
      console.warn('[ai-analysis] Primary save failed:', error);
    }
  } catch (err) {
    console.warn('[ai-analysis] Primary save threw:', err);
  }

  try {
    const { error } = await admin
      .from(FALLBACK_ANALYSIS_STORE)
      .upsert({
        org_id: orgId,
        entity_type: 'account',
        entity_id: accountId,
        insight_type: pageType,
        data: result,
        version: 1,
        last_trigger: pageType,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,entity_type,entity_id,insight_type' });

    if (error) {
      console.warn('[ai-analysis] Fallback save failed:', error);
    }
  } catch (err) {
    console.warn('[ai-analysis] Fallback save threw:', err);
  }
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '42P01' || error?.message?.includes('relation') === true;
}
