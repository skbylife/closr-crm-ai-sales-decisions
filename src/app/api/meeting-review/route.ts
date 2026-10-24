import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { getModelConfig } from '@/lib/babel-engine/model-router';
import { isAIRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import { localizedUnavailableText, normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface MeetingReviewRequest {
  meetingNotes: string;
  // account object (preferred) or flat fields for backward compat
  account?: {
    name: string;
    industry?: string;
    dealStage?: string;
    dealValue?: number;
  };
  // flat fallback fields
  accountName?: string;
  accountIndustry?: string;
  dealStage?: string;
  dealValue?: number;
  briefingSnapshot?: {
    winProbability?: number;
    talkingPoints?: { topic: string; angle: string }[];
    questionsToAsk?: { question: string }[];
    actionItems?: { phase: string; action: string }[];
    negotiationStrategy?: {
      overallApproach?: string;
      leveragePoints?: string[];
    };
  };
  attendeeNames?: string[];
  outputLocale?: 'zh' | 'en';
}

function buildSystemPrompt(outputLocale: 'zh' | 'en') {
  return `你是一个资深的 B2B 销售教练，正在帮助销售人员进行会后复盘分析。
你需要基于会议记录和会前准备简报（如有），生成一份结构化的会后复盘报告。

复盘要求：
1. meetingSummary：会议核心结论（2-3 句话）
2. gapAnalysis：预期 vs 实际差异分析，每项包含：
   - dimension：维度（如"客户态度"、"议程进度"、"关键议题"等）
   - expected：预期情况
   - actual：实际情况
   - gap：差距评估（positive / neutral / negative）
   - insight：洞察
3. extractedActionItems：从会议记录提取的行动项，每项包含：
   - action：行动内容
   - owner：负责人（我方/客方/待定）
   - priority：优先级（high / medium / low）
   - dueDate：建议截止日期（如能推断）
4. keyDiscoveries：会议中的关键发现（3-5 条），每条包含：
   - finding：发现内容
   - impact：对交易的影响（positive / negative / neutral）
   - nextStep：建议下一步
5. sentimentShift：客户情绪变化评估
   - before：会前情绪预判
   - after：会后实际情绪
   - direction：变化方向（improved / stable / declined）
   - reason：原因分析
6. updatedWinProbability：更新后的赢单概率（0-100）
7. updatedWinReasoning：概率变化原因
8. followUpPlan：后续跟进计划（3-5 条），每条包含 action 和 timeline
9. lessonsLearned：经验教训（2-3 条）

风格要求：
- 客观、诚实，不回避问题
- 每条建议要可执行
- 如果会前有 Briefing Pack，重点分析预期与实际的差距

保持 JSON keys 和枚举值不变；分析、建议、行动项、经验教训按输出语言生成。

返回 JSON 格式：
{
  "meetingSummary": "...",
  "gapAnalysis": [{"dimension": "...", "expected": "...", "actual": "...", "gap": "positive|neutral|negative", "insight": "..."}],
  "extractedActionItems": [{"action": "...", "owner": "我方|客方|待定", "priority": "high|medium|low", "dueDate": "..."}],
  "keyDiscoveries": [{"finding": "...", "impact": "positive|negative|neutral", "nextStep": "..."}],
  "sentimentShift": {"before": "...", "after": "...", "direction": "improved|stable|declined", "reason": "..."},
  "updatedWinProbability": 70,
  "updatedWinReasoning": "...",
  "followUpPlan": [{"action": "...", "timeline": "..."}],
  "lessonsLearned": ["..."]
}

${outputLocaleInstruction(outputLocale)}`;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as MeetingReviewRequest;
    const outputLocale = normalizeOutputLocale(body.outputLocale);
    if (isAIRateLimited(ctx.userId)) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请求过于频繁，请稍后再试。', en: 'Requests are too frequent. Please try again later.' }),
      }, { status: 429 });
    }

    if (!body.meetingNotes?.trim()) {
      return Response.json({
        error: localizedUnavailableText(outputLocale, { zh: '请输入会议记录。', en: 'Enter meeting notes.' }),
      }, { status: 400 });
    }

    let briefingContext = '';
    if (body.briefingSnapshot) {
      const snap = body.briefingSnapshot;
      briefingContext = `\n\n会前 Briefing Pack 摘要：
赢单概率预判：${snap.winProbability ?? '未知'}%
${snap.talkingPoints?.length ? `计划谈话要点：\n${snap.talkingPoints.map((tp) => `- ${tp.topic}: ${tp.angle}`).join('\n')}` : ''}
${snap.questionsToAsk?.length ? `计划提问：\n${snap.questionsToAsk.map((q) => `- ${q.question}`).join('\n')}` : ''}
${snap.actionItems?.length ? `计划行动项：\n${snap.actionItems.map((a) => `- [${a.phase}] ${a.action}`).join('\n')}` : ''}
${snap.negotiationStrategy?.overallApproach ? `谈判策略：${snap.negotiationStrategy.overallApproach}` : ''}
${snap.negotiationStrategy?.leveragePoints?.length ? `我方筹码：${snap.negotiationStrategy.leveragePoints.join('、')}` : ''}`;
    }

    // Support both nested account object and flat fields
    const accountName = body.account?.name ?? body.accountName ?? '未知客户';
    const accountIndustry = body.account?.industry ?? body.accountIndustry;
    const dealStage = body.account?.dealStage ?? body.dealStage;
    const dealValue = body.account?.dealValue ?? body.dealValue;

    const { tier } = getModelConfig({ task: 'meeting_prep', dealValue });

    const userPrompt = `客户：${accountName}
行业：${accountIndustry ?? '未知'}
交易阶段：${dealStage ?? '未知'}
交易金额：${dealValue ? `$${dealValue.toLocaleString()}` : '未知'}
${body.attendeeNames?.length ? `参会人员：${body.attendeeNames.join('、')}` : ''}
${briefingContext}

会议记录/要点：
${body.meetingNotes}

请基于以上信息生成会后复盘报告。如果有会前 Briefing Pack，重点对比预期与实际的差异。

${outputLocaleInstruction(outputLocale)}`;

    const result = await callAIWithFallback<Record<string, unknown>>({
      systemPrompt: buildSystemPrompt(outputLocale),
      userPrompt,
      tier,
    });

    return Response.json(result);
  } catch (err) {
    logError('meeting-review', err);
    return guardResponse(err);
  }
}
