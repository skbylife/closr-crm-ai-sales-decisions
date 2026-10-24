import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { getModelConfig } from '@/lib/babel-engine/model-router';
import { isAIRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { loadCILAccountContextScoped } from '@/lib/compiled-intelligence/context';
import { buildCILForAccountStrategy } from '@/lib/compiled-intelligence/prompt-context';
import { buildFreshnessMeta } from '@/lib/ai-freshness';
import { upsertInsight } from '@/lib/ai-event-hub';
import { getAccountMemoryPayload } from '@/lib/evidence-memory/server';
import { buildMemoryProvenance, type EvidenceProvenance } from '@/lib/evidence-provenance';
import { injectKnowledgeContextScoped, depositKnowledge } from '@/lib/knowledge-engine';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';
import type { AccountMemorySummary } from '@/lib/babel-engine/types';

export const maxDuration = 300;

interface AccountContact {
  name: string;
  title: string;
  role: string;
  decisionStyle: string;
  riskAppetite: string;
  communicationNotes: string;
  landmines: string;
  profileSummary?: string;
}

interface IntelItem {
  content: string;
  source: string;
  credibility: string;
  urgency: string;
  analysis?: string;
}

interface DecodeItem {
  emailText: string;
  decode: { threadAnalysis: string };
}

interface TaskSummary {
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  isOverdue: boolean;
  assignedTo?: string;
}

interface PlaySummary {
  goal: string;
  status: string;
  momentum: string;
  confidence: number;
  stepsTotal: number;
  stepsCompleted: number;
  assumptionsTotal: number;
  assumptionsVerified: number;
  assumptionsInvalidated: number;
}

interface AccountStrategyRequestBody {
  accountId?: string;
  forceRefresh?: boolean;
  account: {
    name: string;
    industry: string;
    dealStage: string;
    dealValue: string;
    dealHealth: string;
  };
  contacts: AccountContact[];
  intelItems: IntelItem[];
  decodes: DecodeItem[];
  newsAnalysis?: string;
  financialAnalysis?: string;
  knowledgeBase?: string;
  tasks?: TaskSummary[];
  plays?: PlaySummary[];
  outputLocale?: 'zh' | 'en';
}

interface EnhancedStrategyResponse {
  healthScore: number;
  healthScoreReasoning: string;
  winPath: { step: string; who: string; what: string }[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  competitorStrategy: string[];
  timeline: { week: string; action: string }[];
  keyRisks: { risk: string; mitigation: string }[];
  strategyNarrative: string;
  playRecommendations?: string[];
  /** Evidence Provenance v1: explains which traces/conflicts shaped the AI strategy. */
  provenance?: EvidenceProvenance;
  generatedAt?: string;
  staleAfter?: string;
  stale?: boolean;
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  const sample = outputLocale === 'en'
    ? {
        reasoning: 'Explain the score in 1-2 sentences.',
        week: 'Week 1',
        strategyNarrative: 'A concise senior-sales strategy narrative in English.',
      }
    : {
        reasoning: '1-2 句话解释评分依据',
        week: '第1周',
        strategyNarrative: '综合策略叙述，像资深销售顾问的推进方案',
      };

  return `你是一个顶级的 B2B 大客户销售战略顾问。综合分析客户所有可用数据，给出精准、可执行的赢单战略。

重要：如果提供了任务执行情况，请在策略建议中充分考虑：
- 逾期任务多说明执行力弱，需要在策略中强调落地能力
- 任务完成度高说明推进节奏好，可以在时间线上更积极
- 任务负责人信息帮助你在 winPath 中指定具体执行人

重要：如果提供了谋局（play）数据，请充分考虑现有谋局的目标、进展和假设验证情况。如果发现策略缺口（例如缺少 Champion 发展计划、缺少阻碍者应对方案），请在 playRecommendations 中推荐新的谋局方向。

输出以下分析（JSON 格式）：

1. **healthScore** (1-100)：赢单概率，综合关系、竞争、需求、决策进展
2. **healthScoreReasoning**：1-2 句话解释评分依据
3. **winPath** (3-5 步)：赢单路径图
   - step: 步骤名称
   - who: 找谁做
   - what: 具体做什么、说什么
4. **swot**：针对这个 deal 的 SWOT 分析
   - strengths: 我们的优势（2-3 条）
   - weaknesses: 我们的劣势（2-3 条）
   - opportunities: 机会（2-3 条）
   - threats: 威胁（2-3 条）
5. **competitorStrategy**：竞品应对策略（2-4 条）
6. **timeline** (4-6 周)：时间线建议
   - week: "第1周", "第2周" 等
   - action: 具体行动
7. **keyRisks**：关键风险 + 缓解措施
   - risk: 风险描述
   - mitigation: 缓解措施
8. **strategyNarrative**：综合策略叙述，像资深销售顾问的推进方案
9. **playRecommendations** (可选, 1-3 条)：基于现有谋局覆盖情况，推荐需要新建的谋局方向。如果已有谋局覆盖良好则可为空数组。

保持 JSON keys 和枚举值不变；只本地化分析内容、行动建议、风险描述、timeline 文案和 narrative。

返回 JSON：
{
  "healthScore": 65,
  "healthScoreReasoning": "${sample.reasoning}",
  "winPath": [{"step": "...", "who": "...", "what": "..."}],
  "swot": {"strengths": [], "weaknesses": [], "opportunities": [], "threats": []},
  "competitorStrategy": ["..."],
  "timeline": [{"week": "${sample.week}", "action": "..."}],
  "keyRisks": [{"risk": "...", "mitigation": "..."}],
  "strategyNarrative": "${sample.strategyNarrative}",
  "playRecommendations": ["..."]
}

${outputLocaleInstruction(outputLocale)}`;
}

function buildMemorySnapshotBlock(mem: AccountMemorySummary): string {
  const parts: string[] = [
    `=== 账户记忆快照（置信度 ${Math.round(mem.confidence * 100)}%，来源覆盖 ${mem.sourceCoverage.kinds.length} 类 / ${mem.sourceCoverage.totalRecords} 条，30天内新鲜记录 ${mem.sourceCoverage.freshRecords} 条）===`,
    `整体动量: ${mem.momentum.label}（${mem.momentum.reasoning}）`,
    `叙事摘要: ${mem.narrativeSummary}`,
  ];
  if (mem.people.length > 0) {
    parts.push('关键人物:');
    for (const p of mem.people.slice(0, 5)) {
      parts.push(`  - ${p.name}（${p.title || p.influenceLabel}）立场: ${p.stance} — ${p.summary}`);
    }
  }
  if (mem.tensions.length > 0) {
    parts.push('当前 tension:');
    for (const t of mem.tensions) parts.push(`  - ${t}`);
  }
  if (mem.timelineHighlights.length > 0) {
    parts.push('近期关键事件:');
    for (const e of mem.timelineHighlights.slice(0, 5)) {
      parts.push(`  - [${e.signal}] ${e.title}（${new Date(e.occurredAt).toLocaleDateString('zh-CN')}）`);
    }
  }
  parts.push(`快照生成时间: ${mem.lastComputedAt}`);
  return '\n' + parts.join('\n') + '\n';
}

function buildUserPrompt(body: AccountStrategyRequestBody): string {
  const { account, contacts, intelItems, decodes } = body;

  let prompt = `=== 客户概况 ===
客户名称：${account.name}
行业：${account.industry}
交易阶段：${account.dealStage}
交易金额：${account.dealValue}
交易健康度：${account.dealHealth}

`;

  if (contacts.length > 0) {
    prompt += `=== 关键联系人（${contacts.length} 人）===\n`;
    for (const c of contacts) {
      prompt += `- ${c.name}（${c.title}）
  角色：${c.role}
  决策风格：${c.decisionStyle}
  风险偏好：${c.riskAppetite}
  沟通要点：${c.communicationNotes}
  雷区：${c.landmines}
`;
      if (c.profileSummary) {
        prompt += `  AI画像摘要：${c.profileSummary}\n`;
      }
    }
    prompt += '\n';
  }

  if (intelItems.length > 0) {
    prompt += `=== 情报（${intelItems.length} 条）===\n`;
    for (const intel of intelItems) {
      prompt += `- [${intel.source} | 可信度:${intel.credibility} | 紧急度:${intel.urgency}]
  ${intel.content}`;
      if (intel.analysis) {
        prompt += `\n  分析：${intel.analysis}`;
      }
      prompt += '\n';
    }
    prompt += '\n';
  }

  if (decodes.length > 0) {
    prompt += `=== 邮件解读（${decodes.length} 封）===\n`;
    for (const d of decodes) {
      prompt += `- 邮件摘要：${d.emailText.slice(0, 500)}
  线索分析：${d?.decode?.threadAnalysis}
`;
    }
    prompt += '\n';
  }

  if (body.newsAnalysis) {
    prompt += `=== 新闻分析 ===\n${body.newsAnalysis}\n\n`;
  }

  if (body.financialAnalysis) {
    prompt += `=== 财报分析 ===\n${body.financialAnalysis}\n\n`;
  }

  if (body.knowledgeBase) {
    prompt += `=== 知识库参考资料 ===\n${body.knowledgeBase}\n\n`;
  }

  // Add play (谋局) data
  if (body.plays && body.plays.length > 0) {
    prompt += `=== 谋局情况（${body.plays.length} 个谋局）===\n`;
    for (const p of body.plays) {
      prompt += `- 目标: ${p.goal}
  状态: ${p.status} | 势头: ${p.momentum} | 信心: ${p.confidence}%
  步骤完成: ${p.stepsCompleted}/${p.stepsTotal}
  假设验证: ${p.assumptionsVerified} 已验证 / ${p.assumptionsInvalidated} 已否定 / ${p.assumptionsTotal} 总数
`;
    }
    prompt += '\n';
  }

  // Add task execution status
  if (body.tasks && body.tasks.length > 0) {
    const overdueTasks = body.tasks.filter(t => t.isOverdue);
    const completedTasks = body.tasks.filter(t => t.status === 'done');
    const activeTasks = body.tasks.filter(t => t.status !== 'done');

    prompt += `=== 任务执行情况（${body.tasks.length} 个任务）===
已完成: ${completedTasks.length} 个
进行中/待办: ${activeTasks.length} 个
逾期未完成: ${overdueTasks.length} 个
`;

    if (overdueTasks.length > 0) {
      prompt += `\n逾期任务（风险信号）：\n`;
      for (const t of overdueTasks) {
        prompt += `- [${t.priority}] ${t.title}${t.assignedTo ? ` (${t.assignedTo})` : ''}（截止: ${t.dueDate}）\n`;
      }
    }

    if (activeTasks.length > 0) {
      prompt += `\n当前活跃任务：\n`;
      for (const t of activeTasks.slice(0, 10)) {
        prompt += `- [${t.priority}/${t.status}] ${t.title}${t.dueDate ? `（截止: ${t.dueDate}）` : ''}\n`;
      }
    }
    prompt += '\n';
  }

  prompt += `请基于以上所有信息，输出综合客户战略分析（包括 SWOT、赢单路径图、时间线、竞品策略）。如果有谋局数据，请分析现有谋局覆盖是否充分，并在 playRecommendations 中推荐需要新建的谋局方向。`;

  return prompt;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as AccountStrategyRequestBody;
    const outputLocale = normalizeOutputLocale(body.outputLocale);
    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, {
          zh: '请求过于频繁，请稍后再试。',
          en: 'Requests are too frequent. Please try again later.',
        }),
      }, { status: 429 });
    }

    if (!body.account || !body.account.name || body.account.name.trim().length === 0) {
      return Response.json(
        {
          error: localizedUnavailableText(outputLocale, {
            zh: '请提供客户信息。',
            en: 'Provide account information.',
          }),
        },
        { status: 400 }
      );
    }

    const admin = requireAdmin();

    if (body.accountId) {
      await requireAccountAccess(ctx, body.accountId);
    }

    if (body.accountId && !body.forceRefresh && outputLocale === 'zh') {
      try {
        const { data: cachedInsight, error: cachedError } = await admin
          .from('ai_insights')
          .select('data, updated_at')
          .eq('org_id', ctx.orgId)
          .eq('entity_type', 'account')
          .eq('entity_id', body.accountId)
          .eq('insight_type', 'strategy')
          .maybeSingle();

        if (!cachedError && cachedInsight?.data && cachedInsight.updated_at) {
          const freshness = buildFreshnessMeta(cachedInsight.updated_at);
          if (!freshness.stale) {
            const cachedData = cachedInsight.data as Record<string, unknown>;
            let cachedProvenance = cachedData.provenance as EvidenceProvenance | undefined;
            if (!cachedProvenance) {
              try {
                const memoryPayload = await getAccountMemoryPayload(body.accountId, body.account.name, ctx.orgId, ctx);
                cachedProvenance = buildMemoryProvenance({
                  records: memoryPayload.records,
                  summary: memoryPayload.summary,
                  conflicts: memoryPayload.conflicts,
                  rationale: '缓存策略结果补充 Evidence Provenance v1：trace 来自当前账户记忆快照，用于解释该策略可追踪到哪些证据和冲突。',
                  maxTraces: 10,
                });
              } catch (provenanceErr) {
                console.warn('[account-strategy] cached provenance 构建失败，返回原缓存', provenanceErr);
              }
            }
            return Response.json({
              ...cachedData,
              ...(cachedProvenance ? { provenance: cachedProvenance } : {}),
              ...freshness,
            });
          }
        }
      } catch (cacheErr) {
        console.warn('[account-strategy] insight cache 读取失败，继续实时生成', cacheErr);
      }
    }

    // Load CIL, Memory, and KB context in parallel
    let cilBlock = '';
    let memoryBlock = '';
    let kbContext = '';
    let provenance: EvidenceProvenance | undefined;

    if (body.accountId && ctx.orgId) {
      const [cilResult, memResult, kbResult] = await Promise.all([
        // Phase 3 (CIL)
        loadCILAccountContextScoped({ orgId: ctx.orgId, accountId: body.accountId, limitEvidence: 8, limitClaims: 10, ctx })
          .then(cilData => {
            const block = buildCILForAccountStrategy(cilData) || '';
            if (block) console.log(`[account-strategy] CIL 上下文已注入，account=${body.accountId}`);
            return block;
          })
          .catch(err => { console.warn('[account-strategy] CIL 加载失败，回退到现有逻辑', err); return ''; }),
        // Evidence Memory V1
        getAccountMemoryPayload(body.accountId, body.account.name, ctx.orgId, ctx)
          .then((memoryPayload) => {
            const { summary: memSnapshot, conflicts, records } = memoryPayload;
            provenance = buildMemoryProvenance({
              records,
              summary: memSnapshot,
              conflicts,
              rationale: '客户战略的 trace 来自账户记忆快照中最新且高权重的互动证据，并显式带出 tension / contradiction，避免把 AI 判断伪装成无来源的规则推导。',
              maxTraces: 10,
            });
            if (memSnapshot && memSnapshot.sourceCoverage.totalRecords > 0) {
              console.log(`[account-strategy] Memory snapshot 已注入，account=${body.accountId}, confidence=${memSnapshot.confidence}`);
              return buildMemorySnapshotBlock(memSnapshot);
            }
            return '';
          })
          .catch(err => { console.warn('[account-strategy] Memory snapshot 加载失败，继续使用现有数据', err); return ''; }),
        // KB context (server-side vector search)
        injectKnowledgeContextScoped(
          ctx,
          body.accountId,
          `${body.account.name} ${body.account.industry} 客户战略分析`,
          5,
        ),
      ]);
      cilBlock = cilResult;
      memoryBlock = memResult;
      kbContext = kbResult;
    }

    const userPrompt = buildUserPrompt({
      account: body.account,
      contacts: body.contacts ?? [],
      intelItems: body.intelItems ?? [],
      decodes: body.decodes ?? [],
      newsAnalysis: body.newsAnalysis,
      financialAnalysis: body.financialAnalysis,
      knowledgeBase: body.knowledgeBase,
      tasks: body.tasks,
      plays: body.plays,
    }) + memoryBlock + cilBlock + kbContext + '\n\n' + outputLocaleInstruction(outputLocale);

    const dealValueNum = typeof body.account.dealValue === 'number' ? body.account.dealValue : parseFloat(String(body.account.dealValue ?? '0').replace(/[^0-9.]/g, ''));
    const { tier } = getModelConfig({ task: 'account_strategy', dealValue: dealValueNum });

    const raw = await callAIWithFallback<Record<string, unknown>>({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt,
      tier,
    });

    // DeepSeek sometimes wraps the response in a nested key
    const strategy = (
      raw?.healthScore !== undefined ? raw :
      raw?.strategy ? raw.strategy :
      raw?.result ? raw.result :
      raw?.data ? raw.data :
      raw
    ) as EnhancedStrategyResponse;

    const freshness = buildFreshnessMeta(new Date().toISOString());
    const responsePayload: EnhancedStrategyResponse = {
      ...strategy,
      ...(provenance ? { provenance } : {}),
      ...freshness,
    };

    if (body.accountId) {
      await upsertInsight(ctx.orgId, 'account', body.accountId, 'strategy', responsePayload as unknown as Record<string, unknown>, body.forceRefresh ? 'manual_refresh' : 'daily_cache');

      // Fire-and-forget deposit to knowledge_base
      const depositContent = [
        `健康分数: ${strategy.healthScore}/100`,
        `评分依据: ${strategy.healthScoreReasoning ?? ''}`,
        `SWOT优势: ${(strategy.swot?.strengths ?? []).join('、')}`,
        `SWOT劣势: ${(strategy.swot?.weaknesses ?? []).join('、')}`,
        `关键风险: ${(strategy.keyRisks ?? []).map(r => r.risk).join('、')}`,
        `策略叙述: ${strategy.strategyNarrative ?? ''}`,
      ].join('\n');

      depositKnowledge({
        orgId: ctx.orgId,
        accountId: body.accountId,
        title: `客户战略：${body.account.name}`,
        content: depositContent,
        category: 'ai_insight',
        source: 'ai_strategy',
        sourceType: 'ai_insights',
        sourceId: `${ctx.orgId}_account_${body.accountId}_strategy`,
      });
    }

    console.log('[account-strategy] raw keys:', Object.keys(raw ?? {}), 'healthScore:', strategy?.healthScore);

    return Response.json(responsePayload);
  } catch (err) {
    logError('account-strategy', err);
    return guardResponse(err);
  }
}
