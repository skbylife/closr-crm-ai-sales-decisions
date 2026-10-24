import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { buildJudgmentMemoryFromRfpAnalysis, type JudgmentMemoryInput } from '@/lib/judgment/memory';
import { persistJudgmentMemorySourceRecord } from '@/lib/judgment/persistence';
import { invalidateAccountCaches } from '@/lib/evidence-memory/server';
import type { RfpRow, RfpCompetitorRow, RfpAnalysisRow, RfpJudgment } from '@/lib/babel-engine/types';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const dynamic = 'force-dynamic';

// AI 分析耗时较长
export const maxDuration = 120;

interface AnalysisResult {
  winProbability: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  competitorAnalysis: string;
  judgment?: RfpJudgment;
}

// POST — AI 分析 RFP
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json() as { rfpId: string; outputLocale?: 'zh' | 'en' };
    const outputLocale = normalizeOutputLocale(body.outputLocale);

    if (!body.rfpId) {
      return Response.json({ error: '缺少 rfpId' }, { status: 400 });
    }

    const admin = requireAdmin();

    // 加载 RFP
    const { data: rfp } = await admin
      .from('rfps')
      .select('*')
      .eq('id', body.rfpId)
      .eq('org_id', ctx.orgId)
      .single();

    if (!rfp) return Response.json({ error: 'RFP 不存在' }, { status: 404 });
    const rfpRow = rfp as RfpRow;
    await requireAccountAccess(ctx, rfpRow.account_id);

    // 并行加载竞对 + 商机 + 客户信息 + KB context
    const [
      { data: competitors },
      { data: opportunity },
      { data: account },
      kbContext,
    ] = await Promise.all([
      admin.from('rfp_competitors').select('*').eq('rfp_id', body.rfpId).eq('org_id', ctx.orgId),
      admin.from('opportunities').select('name, stage, value, expected_close_date, description').eq('id', rfpRow.opportunity_id).eq('org_id', ctx.orgId).single(),
      admin.from('accounts').select('name, industry, size, description, competitors').eq('id', rfpRow.account_id).eq('org_id', ctx.orgId).single(),
      injectKnowledgeContextScoped(
        ctx,
        rfpRow.account_id,
        `${rfpRow.title} ${(rfpRow.requirements ?? []).join(' ')} 投标分析`,
      ),
    ]);
    const comps = (competitors ?? []) as RfpCompetitorRow[];

    // 构建 AI 提示
    const systemPrompt = `你是一位资深的招投标分析专家和销售策略顾问。你的任务是分析 RFP（招标文件）并提供详细的投标策略建议。

你必须返回严格的 JSON 格式：
{
  "winProbability": <0-100 的整数>,
  "strengths": ["我方优势1", "我方优势2", ...],
  "weaknesses": ["我方劣势1", "我方劣势2", ...],
  "recommendations": ["建议1", "建议2", ...],
  "competitorAnalysis": "竞对综合分析段落",
  "judgment": {
    "decision": "bid" | "no_bid" | "cautious_bid" | "need_more_intel",
    "confidence": <0-100 的整数，表示你对该判断本身的把握，不是胜率>,
    "rationale": "一句话解释为什么这是当前最可信判断",
    "uncertainty": "还缺什么关键情报/哪里仍不确定",
    "keyRisks": ["关键风险1", "关键风险2"],
    "tensions": ["相互拉扯的信号，例如：预算匹配但时间线过紧"],
    "contradictions": ["互相矛盾的证据；没有则返回 []"],
    "evidenceSignals": [
      { "label": "证据信号名", "source": "rfp" | "competitor" | "milestone" | "opportunity" | "account" | "knowledge" | "ai_inference", "valence": "positive" | "negative" | "uncertain", "evidence": "来自输入的可追溯依据" }
    ],
    "narrativeChange": "如果采用该判断，销售叙事应如何改变；没有则简短说明维持当前叙事"
  }
}

分析维度：
1. 中标概率评估 — 综合考虑竞对情况、需求匹配度、预算匹配度、时间线
2. 我方优势 — 从技术能力、行业经验、价格竞争力、客户关系等维度
3. 我方劣势 — 客观评估差距和风险
4. 投标建议 — 具体可执行的策略建议（如定价策略、技术方案侧重、关键人攻关）
5. 竞对分析 — 综合评估竞争格局
6. Trusted Judgment Layer — 给出临时但可行动的 Bid/No-Bid 判断、信心、张力、矛盾、证据链和不确定性。不要把判断伪装成机械推导；要明确这是基于当前证据的 provisional judgment。

${outputLocaleInstruction(outputLocale)}`;

    let userPrompt = `## RFP 信息
- 标题: ${rfpRow.title}
- 发标单位: ${rfpRow.issuer}
- 状态: ${rfpRow.status}
- 预算: ${rfpRow.budget ? `${rfpRow.budget} ${rfpRow.currency}` : '未知'}
- 截止日期: ${rfpRow.due_date ?? '未知'}
- 需求: ${(rfpRow.requirements ?? []).join('；') || '暂无详细需求'}
- 备注: ${rfpRow.notes || '无'}`;

    if (opportunity) {
      userPrompt += `\n\n## 关联商机
- 名称: ${opportunity.name}
- 阶段: ${opportunity.stage}
- 金额: ${opportunity.value ?? '未知'}
- 预计关单: ${opportunity.expected_close_date ?? '未知'}
- 描述: ${opportunity.description ?? '无'}`;
    }

    if (account) {
      userPrompt += `\n\n## 客户信息
- 名称: ${account.name}
- 行业: ${account.industry ?? '未知'}
- 规模: ${account.size ?? '未知'}
- 描述: ${account.description ?? '无'}`;
    }

    if (comps.length > 0) {
      userPrompt += '\n\n## 已知竞对';
      for (const c of comps) {
        userPrompt += `\n### ${c.name}`;
        if (c.strengths.length > 0) userPrompt += `\n- 优势: ${c.strengths.join('、')}`;
        if (c.weaknesses.length > 0) userPrompt += `\n- 劣势: ${c.weaknesses.join('、')}`;
        if (c.estimated_price) userPrompt += `\n- 预估报价: ${c.estimated_price}`;
        if (c.win_probability) userPrompt += `\n- 预估中标率: ${c.win_probability}%`;
        if (c.intel_source) userPrompt += `\n- 情报来源: ${c.intel_source}`;
        if (c.notes) userPrompt += `\n- 备注: ${c.notes}`;
      }
    }

    // KB context already loaded in parallel above
    if (kbContext) {
      userPrompt += kbContext;
    }

    userPrompt += '\n\n请对此 RFP 进行全面分析并给出投标策略建议。\n' + outputLocaleInstruction(outputLocale);

    const result = await callAIWithFallback<AnalysisResult>({
      systemPrompt,
      userPrompt,
      tier: 'pro',
      invocation: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        accountId: rfpRow.account_id,
        opportunityId: rfpRow.opportunity_id ?? null,
        route: '/api/rfps/analyze',
        useCase: 'rfp.analyze',
        metadata: {
          rfpId: body.rfpId,
          hasOpportunity: Boolean(rfpRow.opportunity_id),
          competitorCount: comps.length,
          hasKnowledgeContext: Boolean(kbContext),
        },
      },
    }, {
      timeoutMs: 60_000,
      maxAttempts: 1,
      degradedResponse: {
        winProbability: 0,
        strengths: [localizedUnavailableText(outputLocale, { zh: 'AI 分析暂时不可用', en: 'AI analysis is temporarily unavailable' })],
        weaknesses: [localizedUnavailableText(outputLocale, { zh: 'AI 分析暂时不可用', en: 'AI analysis is temporarily unavailable' })],
        recommendations: [localizedUnavailableText(outputLocale, { zh: '请稍后重试 AI 分析', en: 'Retry the AI analysis later' })],
        competitorAnalysis: localizedUnavailableText(outputLocale, { zh: 'AI 分析暂时不可用', en: 'AI analysis is temporarily unavailable' }),
        judgment: {
          decision: 'need_more_intel',
          confidence: 20,
          rationale: localizedUnavailableText(outputLocale, { zh: 'AI 分析暂时不可用，当前不能形成可信投标判断。', en: 'AI analysis is temporarily unavailable, so Closr cannot form a trusted bid judgment yet.' }),
          uncertainty: localizedUnavailableText(outputLocale, { zh: '需要重新运行分析以获取证据链、风险和竞对判断。', en: 'Rerun the analysis to recover evidence, risk, and competitor judgment.' }),
          keyRisks: [localizedUnavailableText(outputLocale, { zh: '缺少可用 AI 分析结果', en: 'No usable AI analysis result' })],
          tensions: [localizedUnavailableText(outputLocale, { zh: '业务需要推进，但判断证据不足', en: 'The sales motion needs to move, but judgment evidence is insufficient' })],
          contradictions: [],
          evidenceSignals: [],
          narrativeChange: localizedUnavailableText(outputLocale, { zh: '暂不改变销售叙事，先补齐情报。', en: 'Do not change the sales narrative yet; fill the intelligence gap first.' }),
        },
      },
    });

    const judgment = normalizeJudgment(result.judgment, result.winProbability, rfpRow, comps);
    const rawOutput = { ...result, judgment };

    // 写入 rfp_ai_analyses 表
    const { data: analysisRow, error: insertError } = await admin
      .from('rfp_ai_analyses')
      .insert({
        org_id: ctx.orgId,
        rfp_id: body.rfpId,
        analysis_type: 'full' as const,
        win_probability: result.winProbability ?? null,
        strengths: result.strengths ?? [],
        weaknesses: result.weaknesses ?? [],
        recommendations: result.recommendations ?? [],
        competitor_analysis: result.competitorAnalysis ?? null,
        raw_output: rawOutput,
        ai_model: 'deepseek-v4-pro',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[rfps/analyze] Insert analysis failed:', insertError);
      // 即使存储失败也返回分析结果
      return Response.json({
        analysis: {
          winProbability: result.winProbability,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          recommendations: result.recommendations,
          competitorAnalysis: result.competitorAnalysis,
          judgment,
        },
      });
    }

    const persistedAnalysis = analysisRow as RfpAnalysisRow;
    const judgmentMemory = buildJudgmentMemoryFromRfpAnalysis({
      rfp: rfpRow,
      analysis: persistedAnalysis,
      judgment,
      recommendations: result.recommendations ?? [],
      weaknesses: result.weaknesses ?? [],
      winProbability: result.winProbability ?? null,
    });
    const enrichedRawOutput = { ...rawOutput, judgmentMemory };

    await persistRfpJudgmentMemory({
      admin,
      orgId: ctx.orgId,
      rfp: rfpRow,
      analysis: persistedAnalysis,
      rawOutput: enrichedRawOutput,
      judgmentMemory,
    });

    // Fire-and-forget deposit to knowledge_base
    const depositContent = [
      `中标概率: ${result.winProbability}%`,
      `优势: ${(result.strengths ?? []).join('、')}`,
      `劣势: ${(result.weaknesses ?? []).join('、')}`,
      `建议: ${(result.recommendations ?? []).join('；')}`,
      `可信判断: ${judgment.decision}（信心 ${judgment.confidence}%）`,
      `当前判断: ${judgmentMemory.currentJudgment}`,
      `最大风险: ${judgmentMemory.risk}`,
      `下一步动作: ${judgmentMemory.nextAction}`,
      `判断依据: ${judgment.rationale}`,
      `不确定性: ${judgment.uncertainty}`,
      `竞对分析: ${result.competitorAnalysis ?? ''}`,
    ].join('\n');

    depositKnowledge({
      orgId: ctx.orgId,
      accountId: rfpRow.account_id,
      title: `RFP分析：${rfpRow.title}`,
      content: depositContent,
      category: 'ai_insight',
      source: 'ai_rfp_analysis',
      sourceType: 'rfp_ai_analyses',
      sourceId: persistedAnalysis.id,
    });

    return Response.json({
      analysis: {
        ...mapAnalysisRow({ ...persistedAnalysis, raw_output: enrichedRawOutput }),
        judgmentMemory,
      },
    });
  } catch (err) {
    console.error('[rfps/analyze] POST error:', err);
    return guardResponse(err);
  }
}

// ─── Helper ──────────────────────────────────────────────────────────

async function persistRfpJudgmentMemory(params: {
  admin: ReturnType<typeof requireAdmin>;
  orgId: string;
  rfp: RfpRow;
  analysis: RfpAnalysisRow;
  rawOutput: unknown;
  judgmentMemory: JudgmentMemoryInput;
}) {
  const { admin, orgId, rfp, analysis, rawOutput, judgmentMemory } = params;

  const { error: analysisUpdateError } = await admin
    .from('rfp_ai_analyses')
    .update({ raw_output: rawOutput })
    .eq('org_id', orgId)
    .eq('id', analysis.id);

  if (analysisUpdateError) {
    console.warn('[rfps/analyze] judgment memory raw_output update failed:', analysisUpdateError.message);
  }

  try {
    const persistResult = await persistJudgmentMemorySourceRecord({
      admin,
      orgId,
      judgmentMemory,
      sourceTable: 'rfp_ai_analyses',
      expectedAccountId: rfp.account_id,
      extraMetadata: { rfpId: rfp.id },
    });

    if (persistResult.status === 'skipped') {
      console.warn('[rfps/analyze] judgment memory source record skipped:', persistResult.reason);
    }
  } catch (err) {
    console.warn('[rfps/analyze] judgment memory source record skipped:', err);
  }

  invalidateAccountCaches(rfp.account_id, orgId);
}

function mapAnalysisRow(row: RfpAnalysisRow) {
  return {
    id: row.id,
    rfpId: row.rfp_id,
    analysisType: row.analysis_type,
    winProbability: row.win_probability,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    recommendations: row.recommendations,
    competitorAnalysis: row.competitor_analysis,
    judgment: extractJudgment(row.raw_output),
    judgmentMemory: extractJudgmentMemory(row.raw_output),
    aiModel: row.ai_model,
    createdAt: row.created_at,
  };
}

function extractJudgment(rawOutput: unknown): RfpJudgment | null {
  if (!rawOutput || typeof rawOutput !== 'object' || !('judgment' in rawOutput)) return null;
  const judgment = (rawOutput as { judgment?: unknown }).judgment;
  if (!judgment || typeof judgment !== 'object') return null;
  return judgment as RfpJudgment;
}

function extractJudgmentMemory(rawOutput: unknown): JudgmentMemoryInput | null {
  if (!rawOutput || typeof rawOutput !== 'object' || !('judgmentMemory' in rawOutput)) return null;
  const judgmentMemory = (rawOutput as { judgmentMemory?: unknown }).judgmentMemory;
  if (!judgmentMemory || typeof judgmentMemory !== 'object') return null;
  return judgmentMemory as JudgmentMemoryInput;
}

function normalizeJudgment(
  judgment: RfpJudgment | undefined,
  winProbability: number | undefined,
  rfp: RfpRow,
  competitors: RfpCompetitorRow[],
): RfpJudgment {
  const probability = Number.isFinite(winProbability) ? Number(winProbability) : 0;
  const validDecision = judgment?.decision && ['bid', 'no_bid', 'cautious_bid', 'need_more_intel'].includes(judgment.decision)
    ? judgment.decision
    : probability >= 70 ? 'bid' : probability >= 45 ? 'cautious_bid' : probability >= 25 ? 'need_more_intel' : 'no_bid';

  const dueDate = rfp.due_date ? new Date(rfp.due_date) : null;
  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400000) : null;
  const deadlineSignal = daysLeft == null
    ? '截止日期未知'
    : daysLeft < 0
      ? `已逾期 ${Math.abs(daysLeft)} 天`
      : `${daysLeft} 天后截止`;

  return {
    decision: validDecision,
    confidence: clampPercent(judgment?.confidence ?? (probability >= 70 || probability <= 30 ? 65 : 45)),
    rationale: nonEmpty(judgment?.rationale) ?? `基于当前胜率 ${probability}%、${competitors.length} 个已知竞对和 ${deadlineSignal}，形成临时投标判断。`,
    uncertainty: nonEmpty(judgment?.uncertainty) ?? '仍需验证真实评分规则、关键决策人倾向、竞对报价和客户预算弹性。',
    keyRisks: ensureList(judgment?.keyRisks, ['评分规则/预算/竞对报价仍未完全透明']),
    tensions: ensureList(judgment?.tensions, [`胜率预测 ${probability}% 与实际采购政治/竞对动作之间仍存在解释空间`]),
    contradictions: ensureList(judgment?.contradictions, []),
    evidenceSignals: Array.isArray(judgment?.evidenceSignals) && judgment.evidenceSignals.length > 0
      ? judgment.evidenceSignals.slice(0, 8)
      : [
          { label: '胜率预测', source: 'ai_inference', valence: probability >= 60 ? 'positive' : probability >= 35 ? 'uncertain' : 'negative', evidence: `AI 当前估算胜率 ${probability}%` },
          { label: '竞对数量', source: 'competitor', valence: competitors.length > 0 ? 'uncertain' : 'positive', evidence: `已记录 ${competitors.length} 个竞对` },
          { label: '时间窗口', source: 'rfp', valence: daysLeft != null && daysLeft <= 7 ? 'negative' : 'uncertain', evidence: deadlineSignal },
        ],
    narrativeChange: nonEmpty(judgment?.narrativeChange) ?? '将叙事从单纯功能响应升级为围绕风险可控、证据可追溯和采购成功的可信判断。',
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function ensureList(value: string[] | undefined, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim().length > 0) : fallback;
}
