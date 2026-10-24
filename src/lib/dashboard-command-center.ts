import type { Account, Opportunity, Task } from "@/lib/babel-engine/types";

export interface CommandCenterPriority {
  id: string;
  title: string;
  detail: string;
  tone: "critical" | "warning" | "focus";
}

export interface NarrativeItem {
  id: string;
  title: string;
  detail: string;
  meta: string;
  tone: "critical" | "warning" | "signal";
}

export function getFocusAccount(accounts: Account[], opportunities: Opportunity[]): Account | null {
  const score = (account: Account) => {
    const linkedOpps = opportunities.filter((opp) => opp.accountId === account.id);
    const openValue = linkedOpps
      .filter((opp) => opp.stage !== "closed_won" && opp.stage !== "closed_lost")
      .reduce((sum, opp) => sum + opp.value, 0);

    const riskWeight =
      account.dealHealth === "critical"
        ? 300
        : account.dealHealth === "at_risk"
          ? 180
          : 20;

    return openValue + riskWeight;
  };

  return [...accounts].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function buildTodaysPriorities(args: {
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
}): CommandCenterPriority[] {
  const { accounts, opportunities, tasks } = args;
  const priorities: CommandCenterPriority[] = [];

  const riskOpps = opportunities.filter(
    (opp) =>
      opp.stage !== "closed_won" &&
      opp.stage !== "closed_lost" &&
      (opp.meddicc?.overallScore ?? 0) < 50,
  );

  if (riskOpps.length > 0) {
    const topRisk = [...riskOpps].sort((a, b) => a.value - b.value ? b.value - a.value : (a.meddicc?.overallScore ?? 0) - (b.meddicc?.overallScore ?? 0))[0];
    const account = accounts.find((item) => item.id === topRisk.accountId);
    priorities.push({
      id: `risk-${topRisk.id}`,
      title: "先稳住高风险大单",
      detail: `${account?.name ?? "关键账户"} · ${topRisk.name} 的 MEDDICC 健康度偏低，优先补齐 champion / budget / risk proof。`,
      tone: "critical",
    });
  }

  const overdueTasks = tasks.filter((task) => {
    if (task.status === "done" || !task.dueDate) return false;
    return new Date(task.dueDate) < new Date();
  });

  if (overdueTasks.length > 0) {
    priorities.push({
      id: "overdue-tasks",
      title: "清理逾期推进动作",
      detail: `当前有 ${overdueTasks.length} 个逾期任务，先恢复节奏再扩大推进范围。`,
      tone: "warning",
    });
  }

  const focusAccount = getFocusAccount(accounts, opportunities);
  if (focusAccount) {
    priorities.push({
      id: `focus-account-${focusAccount.id}`,
      title: "升级重点账户线程",
      detail: `${focusAccount.name} 是当前最值得集中关注的账户，建议同步推进业务、技术与采购叙事。`,
      tone: "focus",
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      id: "baseline-priority",
      title: "建立今日赢单节奏",
      detail: "暂无显著风险信号，优先挑出 1 个高价值账户，围绕证据、推进人和下一步动作形成闭环。",
      tone: "focus",
    });
  }

  return priorities.slice(0, 3);
}

export function buildNarrativeFeed(args: {
  accounts: Account[];
  opportunities: Opportunity[];
  tasks: Task[];
}): NarrativeItem[] {
  const { accounts, opportunities, tasks } = args;
  const feed: NarrativeItem[] = [];
  const focusAccount = getFocusAccount(accounts, opportunities);

  if (focusAccount) {
    const linkedOpps = opportunities.filter((opp) => opp.accountId === focusAccount.id);
    const openValue = linkedOpps
      .filter((opp) => opp.stage !== "closed_won" && opp.stage !== "closed_lost")
      .reduce((sum, opp) => sum + opp.value, 0);

    feed.push({
      id: `focus-account-${focusAccount.id}`,
      title: `${focusAccount.name} 成为当前重点`,
      detail: `账户风险 ${focusAccount.dealHealth ?? "unknown"}，当前开放管道价值 ${Math.round(openValue / 1000)}k。建议把沟通、证据和下一步动作围绕这一个局集中。`,
      meta: "Focus account",
      tone: focusAccount.dealHealth === "critical" ? "critical" : "warning",
    });
  }

  const urgentTask = [...tasks]
    .filter((task) => task.status !== "done")
    .sort((a, b) => new Date(a.dueDate ?? a.updatedAt).getTime() - new Date(b.dueDate ?? b.updatedAt).getTime())[0];

  if (urgentTask) {
    feed.push({
      id: `task-${urgentTask.id}`,
      title: "最早到期动作正在逼近",
      detail: `${urgentTask.title}${urgentTask.accountId ? " · 与账户推进直接相关" : ""}`,
      meta: urgentTask.priority.toUpperCase(),
      tone: urgentTask.priority === "urgent" || urgentTask.priority === "high" ? "critical" : "signal",
    });
  }

  const strongestOpp = [...opportunities]
    .filter((opp) => opp.stage !== "closed_won" && opp.stage !== "closed_lost")
    .sort((a, b) => b.value - a.value)[0];

  if (strongestOpp) {
    const account = accounts.find((item) => item.id === strongestOpp.accountId);
    feed.push({
      id: `opp-${strongestOpp.id}`,
      title: "最大机会值得单独盯盘",
      detail: `${strongestOpp.name} · ${account?.name ?? "未知账户"}，价值 ${Math.round(strongestOpp.value / 1000)}k。不要让高价值机会和日常噪音混在一起。`,
      meta: "Momentum",
      tone: "signal",
    });
  }

  return feed.slice(0, 4);
}
