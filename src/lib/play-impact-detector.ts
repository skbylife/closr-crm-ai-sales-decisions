import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { callAIWithFallback } from "@/lib/babel-engine/ai-fallback";

interface ImpactAnalysis {
  impacted: boolean;
  impact_level: "none" | "low" | "medium" | "high";
  signals: string[];
  affected_assumptions: string[];
  reasoning: string;
}

/**
 * 用 LLM（flash tier）分析解读内容是否影响谋局假设
 * 替代原来的硬编码关键词匹配，覆盖更多场景
 */
async function analyzeImpactWithAI(
  decodeText: string,
  assumptions: string[],
  goalDescription: string,
): Promise<ImpactAnalysis> {
  const fallback: ImpactAnalysis = {
    impacted: false,
    impact_level: "none",
    signals: [],
    affected_assumptions: [],
    reasoning: "AI 分析不可用，跳过影响检测",
  };

  return callAIWithFallback<ImpactAnalysis>(
    {
      systemPrompt: `你是一个销售情报分析专家。你的任务是判断新的客户沟通解读内容是否影响了当前谋局（strategic play）的关键假设。

分析维度：
1. 预算/资金变化（冻结、削减、重新分配）
2. 竞争态势变化（新竞品入场、客户评估其他方案）
3. 时间线变化（延期、加速、暂停）
4. 关键人变动（决策者离职、新领导上任、权力转移）
5. 需求变化（需求弱化、需求升级、需求转向）
6. 组织变化（重组、并购、战略调整）
7. 情感/态度变化（从积极转消极、信任度下降）

返回 JSON：
{
  "impacted": boolean,
  "impact_level": "none" | "low" | "medium" | "high",
  "signals": ["检测到的信号标签"],
  "affected_assumptions": ["受影响的假设原文"],
  "reasoning": "一句话说明判断依据"
}

只有当解读内容明确暗示或直接表明某个假设可能不成立时，才判定为 impacted。不要过度解读。`,
      userPrompt: `## 谋局目标
${goalDescription}

## 待验证假设
${assumptions.map((a, i) => `${i + 1}. ${a}`).join("\n")}

## 最新解读内容
${decodeText}

请分析以上解读内容是否影响任何待验证假设。`,
      tier: "flash",
    },
    { degradedResponse: fallback, timeoutMs: 15_000 },
  );
}

/**
 * 检测 decode 结果是否影响当前活跃谋局的假设
 * 在 decode 完成后异步调用，不阻塞主流程
 */
export async function detectPlayImpact(params: {
  orgId: string;
  contactId: string;
  decodeText: string;
}): Promise<void> {
  const { orgId, contactId, decodeText } = params;
  if (!orgId || !contactId || !decodeText) return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  try {
    // 找出联系人所属 account
    const { data: contact } = await admin
      .from("contacts")
      .select("account_id")
      .eq("id", contactId)
      .single();

    if (!contact?.account_id) return;

    // 找出该 account 的活跃谋局
    const { data: plays } = await admin
      .from("strategic_plays")
      .select("id, assumptions, goal_description, goal_type, user_id")
      .eq("org_id", orgId)
      .eq("account_id", contact.account_id)
      .in("status", ["active", "in_progress"]);

    if (!plays || plays.length === 0) return;

    for (const play of plays) {
      const assumptions = (play.assumptions as { id: string; text: string; status: string }[]) ?? [];
      const pendingAssumptions = assumptions.filter((a) => a.status === "pending");
      if (pendingAssumptions.length === 0) continue;

      const goalDescription = (play as Record<string, unknown>).goal_description as string ?? "未命名谋局";

      // 用 LLM 分析影响
      const analysis = await analyzeImpactWithAI(
        decodeText,
        pendingAssumptions.map((a) => a.text),
        goalDescription,
      );

      if (!analysis.impacted || analysis.impact_level === "none") continue;

      const suggestedAction = analysis.impact_level === "high" ? "replan" : "verify_assumption";
      const affectedAssumptions = analysis.affected_assumptions.length > 0
        ? analysis.affected_assumptions
        : analysis.signals; // fallback to signals if no specific assumptions matched

      // 写入 ai_insights
      await admin.from("ai_insights").upsert(
        {
          org_id: orgId,
          entity_type: "strategic_play",
          entity_id: play.id,
          insight_type: "play_impact_alert",
          data: {
            impacted: true,
            impact_level: analysis.impact_level,
            reason: analysis.reasoning,
            signals: analysis.signals,
            affectedAssumptions,
            suggestedAction,
            needs_replan: analysis.impact_level === "high",
            timestamp: new Date().toISOString(),
            dismissed: false,
          },
        },
        { onConflict: "org_id,entity_type,entity_id,insight_type" },
      );

      // 写入 agent_notifications 通知谋局负责人
      const playUserId = (play as Record<string, unknown>).user_id as string | null;
      const assumptionSummary = affectedAssumptions[0]
        + (affectedAssumptions.length > 1 ? ` 等 ${affectedAssumptions.length} 条` : "");

      await admin.from("agent_notifications").insert({
        org_id: orgId,
        user_id: playUserId ?? null,
        type: "play_assumption_alert",
        priority: suggestedAction === "replan" ? "high" : "medium",
        title: `谋局预警：${goalDescription}`,
        body: `解读发现「${analysis.signals.join("、")}」，可能影响假设：${assumptionSummary}`,
        actions: [{
          id: "view_play",
          label: analysis.impact_level === "high" ? "更新谋局" : "查看谋局",
          style: "primary",
          action: {
            type: "link",
            playId: play.id,
            accountId: contact.account_id,
            affectedAssumptions,
            signals: analysis.signals,
            suggestedAction,
            needs_replan: analysis.impact_level === "high",
          },
        }],
        read: false,
      });
    }
  } catch (err) {
    console.error("[play-impact-detector] Detection failed:", err);
  }
}
