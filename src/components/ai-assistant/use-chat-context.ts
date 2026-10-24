'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveJobLevel } from '@/hooks/use-effective-job-level';
import { getAccountWorkspace, getAccountWorkspaceSummary } from '@/lib/accounts/account-workspace';

/**
 * buildContext hook — 构建 AI 助手上下文
 * 从 ChatBubble 提取，减少组件体积
 */
/** Current account context info for display in chat UI */
export interface AccountContextInfo {
  accountId: string;
  accountName: string;
  industry?: string;
  opportunityCount: number;
}

export function useChatContext() {
  const pathname = usePathname();
  const accounts = useStore((s) => s.accounts);
  const opportunities = useStore((s) => s.opportunities);
  const intelItems = useStore((s) => s.intelItems);
  const tasks = useStore((s) => s.tasks);
  const emailDecodes = useStore((s) => s.emailDecodes);
  const { orgName, orgRole, orgMembers, jobTitle } = useAuth();
  const jobLevel = useEffectiveJobLevel();

  const contacts = accounts.flatMap((a) => a.contacts ?? []);

  // Derive current account context from URL for display
  const accountContext: AccountContextInfo | null = (() => {
    const match = pathname.match(/\/accounts\/([^/]+)/);
    if (!match) return null;
    const workspace = getAccountWorkspace({
      accountId: match[1],
      accounts,
      opportunities,
      intelItems,
      emailDecodes,
      tasks,
    });
    if (!workspace) return null;
    const summary = getAccountWorkspaceSummary(workspace);
    return {
      accountId: summary.accountId,
      accountName: summary.accountName,
      industry: summary.industry,
      opportunityCount: summary.opportunityCount,
    };
  })();

  const truncate = useCallback((str: string, max = 500) => {
    if (str.length <= max) return str;
    return str.slice(0, max) + '…';
  }, []);

  const truncateJson = useCallback(
    (obj: unknown, max = 500) => truncate(JSON.stringify(obj), max),
    [truncate],
  );

  const buildContext = useCallback(async () => {
    const ctx: Record<string, unknown> = { currentPage: pathname };

    // ── 全局摘要（所有页面都注入） ──────────────────────────────
    const now = new Date();
    const overdueTasks = tasks.filter(
      (t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now,
    );
    const recentIntel = intelItems.slice(0, 5);
    const activePipelineValue = opportunities
      .filter((o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost')
      .reduce((s, o) => s + (o.value ?? 0), 0);

    const topOpportunities = opportunities
      .filter((o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost')
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 5)
      .map((o) => ({
        name: o.name,
        account: accounts.find((a) => a.id === o.accountId)?.name,
        stage: o.stage,
        value: o.value,
        closeDate: o.expectedCloseDate,
      }));

    ctx.globalSummary = {
      totalAccounts: accounts.length,
      totalContacts: contacts.length,
      activePipelineValue,
      overdueTasks: overdueTasks.length,
      recentIntelCount: recentIntel.length,
      recentIntel: truncateJson(
        recentIntel.map((i) => ({ account: i.accountName, title: i.title })),
      ),
      topOpportunities,
      userRole: orgRole ?? '未知',
      jobTitle: jobTitle ?? '未知',
      orgName: orgName ?? '未设置',
    };

    // ── 全局邮件解读摘要（最近 5 条，非客户页面时不传详情）───────
    if (pathname.startsWith('/decode') || pathname.startsWith('/accounts/')) {
      ctx.recentEmailDecodes = emailDecodes.slice(0, 5).map((d) => ({
        id: d.id,
        accountName: d.accountName,
        clientName: d.clientName,
        date: d.date,
        summary: d.decode?.threadAnalysis?.keySignal?.slice(0, 100),
      }));
    }

    // ── 全局任务摘要（只传 urgent/overdue，不传全量）──────────────
    const urgentAndOverdue = tasks.filter(
      (t) => t.status !== 'done' && (
        t.priority === 'high' ||
        (t.dueDate && new Date(t.dueDate) < new Date())
      )
    ).slice(0, 10);
    ctx.allTasks = urgentAndOverdue.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      assignee: t.assignedTo,
    }));

    // ── 页面专属上下文 ─────────────────────────────────────────
    const accountMatch = pathname.match(/\/accounts\/([^/]+)/);
    const pipelineMatch = pathname.match(/\/pipeline\/([^/]+)/);

    if (accountMatch) {
      ctx.accountId = accountMatch[1];
      const workspace = getAccountWorkspace({
        accountId: accountMatch[1],
        accounts,
        opportunities,
        intelItems,
        emailDecodes,
        tasks,
      });
      if (workspace) {
        ctx.tasks = workspace.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          assignee: t.assignedTo,
        }));
        ctx.intelItems = workspace.intelItems.slice(0, 10).map((i) => ({
          content: i.content?.slice(0, 150),
          priority: i.urgency,
          signalType: i.source,
        }));
        ctx.currentAccount = {
          name: workspace.account.name,
          industry: workspace.account.industry,
          contacts: workspace.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            title: c.title,
            email: c.email,
            phone: c.phone ?? c.mobilePhone,
            linkedin: c.linkedin,
            department: c.department,
            personalNotes: c.personalNotes,
          })),
          strategy: workspace.account.strategy
            ? { summary: truncate(workspace.account.strategy.strategyNarrative ?? '', 300) }
            : undefined,
        };
        ctx.accountOpportunities = workspace.opportunities.map((o) => ({
          name: o.name,
          stage: o.stage,
          value: o.value,
          probability: o.probability,
          expectedCloseDate: o.expectedCloseDate,
          owner: o.owner,
          meddiccScore: o.meddicc?.overallScore,
        }));
        ctx.accountIntel = truncateJson(
          workspace.intelItems
            .slice(0, 5)
            .map((i) => ({ source: i.source, content: i.content?.slice(0, 150), urgency: i.urgency })),
        );
        ctx.accountEmailDecodes = workspace.emailDecodes
          .slice(0, 10)
          .map((d) => ({
            id: d.id,
            clientName: d.clientName,
            date: d.date,
            summary: d.decode?.threadAnalysis?.keySignal?.slice(0, 200),
          }));
      }
    } else if (pipelineMatch) {
      ctx.opportunityId = pipelineMatch[1];
      const opp = opportunities.find((o) => o.id === pipelineMatch[1]);
      if (opp) {
        ctx.accountId = opp.accountId;
        ctx.currentOpportunity = {
          name: opp.name,
          stage: opp.stage,
          value: opp.value,
          probability: opp.probability,
          meddicc: opp.meddicc
            ? {
                overallScore: opp.meddicc.overallScore,
                metrics: { status: opp.meddicc.metrics?.status, notes: opp.meddicc.metrics?.notes },
                economicBuyer: { status: opp.meddicc.economicBuyer?.status, accessLevel: opp.meddicc.economicBuyer?.accessLevel },
                decisionCriteria: opp.meddicc.decisionCriteria,
                decisionProcess: opp.meddicc.decisionProcess,
                identifiedPain: opp.meddicc.identifiedPain,
                champion: opp.meddicc.champion,
                competition: opp.meddicc.competition,
              }
            : undefined,
          expectedCloseDate: opp.expectedCloseDate,
          notes: truncate(opp.notes ?? '', 300),
        };
        const account = accounts.find((a) => a.id === opp.accountId);
        if (account) {
          ctx.accountName = account.name;
          ctx.accountEmailDecodes = emailDecodes
            .filter((d) => d.accountId === account.id || d.matchedAccountId === account.id)
            .slice(0, 10)
            .map((d) => ({
              id: d.id,
              clientName: d.clientName,
              date: d.date,
              summary: d.decode?.threadAnalysis?.keySignal?.slice(0, 200),
            }));
          const pipelineTasks = tasks
            .filter((t) => t.accountId === account.id || t.opportunityId === opp.id)
            .map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              assignee: t.assignedTo,
            }));
          ctx.relatedTasks = pipelineTasks;
          ctx.tasks = pipelineTasks;
          ctx.intelItems = intelItems
            .filter((i) => i.accountId === account.id)
            .slice(0, 10)
            .map((i) => ({
              content: i.content?.slice(0, 150),
              priority: i.urgency,
              signalType: i.source,
            }));
        }
      }
    } else if (pathname.startsWith('/tasks')) {
      const todo = tasks.filter((t) => t.status === 'todo').length;
      const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
      const done = tasks.filter((t) => t.status === 'done').length;
      const overdue = overdueTasks.length;
      const urgentTasks = tasks
        .filter((t) => t.status !== 'done' && t.priority === 'urgent')
        .slice(0, 5)
        .map((t) => ({ title: t.title, dueDate: t.dueDate, status: t.status }));

      ctx.taskStats = { todo, inProgress, done, overdue, total: tasks.length };
      ctx.urgentTasks = truncateJson(urgentTasks);
      ctx.overdueTasks = truncateJson(
        overdueTasks.slice(0, 5).map((t) => ({
          title: t.title,
          dueDate: t.dueDate,
          priority: t.priority,
        })),
      );
    } else if (pathname.startsWith('/decode')) {
      ctx.recentDecodes = truncateJson(
        emailDecodes.slice(0, 5).map((d) => ({
          account: d.accountName ?? d.clientName,
          date: d.date,
          buyerState: d.decode?.threadAnalysis?.buyerState,
          riskLevel: d.decode?.threadAnalysis?.riskLevel,
          keySignal: d.decode?.threadAnalysis?.keySignal?.slice(0, 80),
        })),
      );
      ctx.decodeCount = emailDecodes.length;
    } else if (pathname.startsWith('/settings')) {
      ctx.currentConfig = {
        orgName: orgName ?? '未设置',
        userRole: orgRole ?? '未知',
        jobTitle,
        memberCount: orgMembers.length,
      };
    } else if (pathname.startsWith('/organization')) {
      ctx.orgInfo = {
        orgName: orgName ?? '未设置',
        memberCount: orgMembers.length,
        members: truncateJson(
          orgMembers.slice(0, 10).map((m) => ({
            name: m.displayName ?? m.email,
            role: m.role,
            jobTitle: m.jobTitle,
          })),
        ),
      };
    } else {
      ctx.summary = {
        totalAccounts: accounts.length,
        totalOpportunities: opportunities.length,
        totalContacts: contacts.length,
        pipelineValue: opportunities.reduce((s, o) => s + (o.value ?? 0), 0),
        stages: Object.fromEntries(
          opportunities.reduce((m, o) => {
            m.set(o.stage, (m.get(o.stage) ?? 0) + 1);
            return m;
          }, new Map<string, number>()),
        ),
        accounts: truncateJson(
          accounts.map((a) => ({
            name: a.name,
            industry: a.industry,
            contacts: (a.contacts ?? []).length,
            dealHealth: a.dealHealth,
          })),
        ),
        opportunities: truncateJson(
          opportunities.map((o) => ({
            name: o.name,
            accountName: accounts.find((a) => a.id === o.accountId)?.name,
            stage: o.stage,
            value: o.value,
            probability: o.probability,
            meddiccScore: o.meddicc?.overallScore,
            expectedCloseDate: o.expectedCloseDate,
          })),
        ),
        recentIntel: truncateJson(
          intelItems.slice(0, 5).map((i) => ({
            account: i.accountName,
            title: i.title,
            content: i.content?.slice(0, 100),
          })),
        ),
      };
    }

    // ── 谋局数据注入 ──────────────────────────────────────────────
    try {
      const playsRes = await fetch('/api/strategic-play');
      if (playsRes.ok) {
        const playsData = await playsRes.json();
        const allPlays = playsData.plays ?? [];
        if (allPlays.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapPlay = (p: any) => ({
            id: p.id,
            accountName: p.account_name ?? p.accountName,
            goalType: p.goal_type ?? p.goalType,
            goalDescription: (p.goal_description ?? p.goalDescription ?? '').slice(0, 100),
            status: p.status,
            momentum: p.momentum,
            confidence: p.confidence,
            steps: Array.isArray(p.steps)
              ? (p.steps as Array<Record<string, unknown>>).slice(0, 5).map((s) => ({
                  index: s.index,
                  title: (s.title as string)?.slice(0, 50),
                  status: s.status,
                  actualResult: (s.actualResult as string)?.slice(0, 50),
                }))
              : [],
            assumptions: Array.isArray(p.assumptions)
              ? (p.assumptions as Array<Record<string, unknown>>).slice(0, 5).map((a) => ({
                  text: (a.text as string)?.slice(0, 50),
                  status: a.status,
                }))
              : [],
            learnings: Array.isArray(p.learnings)
              ? (p.learnings as Array<Record<string, unknown>>).slice(0, 3).map((l) => ({
                  learning: (l.learning as string)?.slice(0, 50),
                }))
              : [],
          });

          ctx.strategicPlays = allPlays.slice(0, 5).map(mapPlay);

          const acctMatch = pathname.match(/\/accounts\/([^/]+)/);
          if (acctMatch) {
            const accountId = acctMatch[1];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const accountPlays = allPlays.filter((p: any) =>
              (p.account_id ?? p.accountId) === accountId,
            );
            if (accountPlays.length > 0) {
              ctx.currentAccountPlays = accountPlays.slice(0, 5).map(mapPlay);
            }
          }
        }
      }
    } catch {
      // Non-critical, skip plays
    }

    // ── 职级权限标记 ──────────────────────────────────────────────
    ctx.userJobLevel = jobLevel;
    ctx.roleConstraint = jobLevel >= 2
      ? '用户是高管/总监，可以看全部数据，提供战略级分析'
      : jobLevel === 1
        ? '用户是销售主管，只能看团队数据，提供团队管理建议'
        : '用户是销售代表(AE)，只能看自己负责的数据，提供个人行动建议。不要透露其他同事的客户或商机信息';

    return ctx;
  }, [pathname, accounts, opportunities, intelItems, contacts.length, tasks, emailDecodes, orgName, orgRole, orgMembers, jobTitle, jobLevel, truncate, truncateJson]);

  return { buildContext, accountContext };
}
