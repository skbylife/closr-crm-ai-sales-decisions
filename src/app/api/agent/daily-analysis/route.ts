export const maxDuration = 300;

/**
 * /api/agent/daily-analysis
 *
 * 每日自动分析所有活跃 opportunity，生成行动建议写入 ai_advices。
 * GET:  阿里云节点/部署层调度器调用（Authorization: Bearer CRON_SECRET）
 * POST: 用户手动触发（需要 admin 权限）
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { requireAuth, requireAdmin, requireRole, guardResponse } from '@/lib/api-guard';
import { callGemini } from '@/lib/babel-engine/gemini';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// ── Types ─────────────────────────────────────────────────────────────

interface Opportunity {
  id: string;
  name: string;
  user_id: string;
  org_id: string | null;
  stage: string | null;
  value: number | null;
  currency: string | null;
  probability: number | null;
  expected_close_date: string | null;
  meddicc: Record<string, unknown> | null;
  notes: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AnalysisResult {
  risk_score: number;          // 1-10
  top_actions: string[];       // 1-2 条行动建议
  adjusted_probability: number; // 0-100
  summary: string;             // 一句话摘要
}

// ── Helpers ───────────────────────────────────────────────────────────

function getTodayDate(): string {
  // UTC+8 日期
  const now = new Date();
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return cst.toISOString().split('T')[0];
}

function buildPrompt(opp: Opportunity): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一位资深销售策略顾问。根据提供的商机信息，给出精准的风险评估和行动建议。
输出 JSON 格式：
{
  "risk_score": <1-10整数，10为最高风险>,
  "top_actions": ["行动建议1", "行动建议2"],
  "adjusted_probability": <0-100整数，AI预估成单概率>,
  "summary": "一句话摘要"
}
要求：
- 基于当前阶段、MEDDICC 完成度、预计关单日期等综合判断
- 行动建议要具体可执行，不要泛泛而谈
- 如果信息不足，在 summary 中指出缺少什么关键信息`;

  const meddiccStr = opp.meddicc ? JSON.stringify(opp.meddicc) : '未填写';
  const userPrompt = `商机信息：
- 名称：${opp.name}
- 阶段：${opp.stage ?? '未知'}
- 金额：${opp.value ?? '未知'} ${opp.currency ?? 'USD'}
- 销售预估概率：${opp.probability ?? '未填'}%
- 预计关单日期：${opp.expected_close_date ?? '未设置'}
- MEDDICC：${meddiccStr}
- 备注：${opp.notes ?? '无'}
- 创建时间：${opp.created_at}
- 最后更新：${opp.updated_at}

请给出分析。`;

  return { systemPrompt, userPrompt };
}

// ── Shared analysis logic ─────────────────────────────────────────────

async function runAnalysis(): Promise<NextResponse> {
  const admin = requireAdmin();
  const today = getTodayDate();

  const { data: opportunities, error: fetchErr } = await admin
    .from('opportunities')
    .select('id, name, user_id, org_id, stage, value, currency, probability, expected_close_date, meddicc, notes, account_id, created_at, updated_at')
    .not('stage', 'in', '("closed_won","closed_lost")')
    .limit(500);

  if (fetchErr) {
    console.error('[daily-analysis] Fetch opportunities error:', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!opportunities || opportunities.length === 0) {
    return NextResponse.json({ success: true, analyzed: 0, skipped: 0, message: '没有活跃商机' });
  }

  // 查询今天已分析的商机，跳过不重复调 AI
  const todayIds = (opportunities as Opportunity[]).map(o => `daily_${o.id}_${today}`);
  const { data: existing } = await admin
    .from('ai_advices')
    .select('id')
    .in('id', todayIds);
  const doneSet = new Set((existing ?? []).map((r: { id: string }) => r.id));

  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  for (const opp of opportunities as Opportunity[]) {
    const adviceId = `daily_${opp.id}_${today}`;

    // 今天已分析过，跳过
    if (doneSet.has(adviceId)) {
      skipped++;
      continue;
    }

    try {
      const { systemPrompt, userPrompt } = buildPrompt(opp);
      const result = await callGemini<AnalysisResult>({
        systemPrompt,
        userPrompt,
        tier: 'flash',
        temperature: 0.3,
      });

      const text = [
        `⚡ 风险评分：${result.risk_score}/10`,
        `📊 AI预估成单概率：${result.adjusted_probability}%`,
        '',
        `📋 行动建议：`,
        ...result.top_actions.map((a, i) => `${i + 1}. ${a}`),
        '',
        `💡 ${result.summary}`,
      ].join('\n');

      await admin.from('ai_advices').upsert(
        {
          id: adviceId,
          user_id: opp.user_id,
          org_id: opp.org_id,
          text,
          source: 'daily_analysis',
          status: 'pending',
          opportunity_id: opp.id,
          account_id: opp.account_id,
          generated_at: today,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      analyzed++;
    } catch (err) {
      console.error(`[daily-analysis] Failed for opportunity ${opp.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    date: today,
    total: opportunities.length,
    analyzed,
    skipped,
    failed,
  });
}

// ── GET: 定时任务触发 ─────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  const expectedHeader = cronSecret ? `Bearer ${cronSecret}` : '';
  if (!authHeader || !cronSecret || !safeEqual(authHeader, expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runAnalysis();
}

// ── POST: 用户手动触发（fire-and-forget，立即返回）─────────────────

export async function POST(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, 'admin');
    // 后台异步执行，不阻塞响应
    runAnalysis().catch((err) =>
      console.error('[daily-analysis] Background run failed:', err)
    );
    return NextResponse.json({ success: true, message: '分析已在后台启动' });
  } catch (err) {
    return guardResponse(err) as NextResponse;
  }
}
