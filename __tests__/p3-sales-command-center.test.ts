import { describe, expect, it } from "vitest";
import type { Account, Opportunity, Task } from "@/lib/babel-engine/types";
import {
  buildNarrativeFeed,
  buildTodaysPriorities,
  getFocusAccount,
} from "@/lib/dashboard-command-center";
import { buildEvidenceClaims } from "@/components/dashboard/evidence-traceability-rail";
import type { CILAccountHealthReport } from "@/lib/compiled-intelligence/explain";

// ─── Factories ─────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-1",
    name: "Acme Corp",
    contacts: [],
    createdAt: "2026-04-01T00:00:00Z",
    ...overrides,
  } as Account;
}

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    accountId: "acc-1",
    name: "Platform Deal",
    value: 200000,
    currency: "CNY",
    stage: "negotiation",
    probability: 60,
    expectedCloseDate: "2026-06-01",
    owner: "user-1",
    source: "inbound",
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-05T00:00:00Z",
    meddicc: { overallScore: 55 } as unknown as Opportunity["meddicc"],
    mutualActionPlan: { steps: [] } as unknown as Opportunity["mutualActionPlan"],
    competitorIds: [],
    notes: "",
    ...overrides,
  } as Opportunity;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Follow up with Champion",
    status: "todo",
    priority: "high",
    source: "manual",
    aiGenerated: false,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-03T00:00:00Z",
    ...overrides,
  } as Task;
}

function makeCILReport(overrides: Partial<CILAccountHealthReport> = {}): CILAccountHealthReport {
  return {
    accountId: "acc-1",
    healthScore: 35,
    claimDistribution: { active: 3, stale: 2, archived: 1, total: 6 },
    evidenceCoverage: { total: 10, linked: 6, orphaned: 4 },
    knowledgeFreshness: { freshPages: 2, stalePages: 1, missingPageTypes: ["risks"] },
    lintFindings: [
      { checkType: "stale_claims", severity: "critical", targetType: "claim", title: "Claim 已过期超过 30 天", description: "需要重新验证", suggestedAction: "重新验证此 claim" },
      { checkType: "orphan_evidence", severity: "warning", targetType: "evidence", title: "2 条 evidence 未关联", description: "需要关联到 claim", suggestedAction: "关联到相关 claim" },
    ],
    refreshTargets: [],
    summary: "健康分 35/100",
    ...overrides,
  } as CILAccountHealthReport;
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("P3 Sales Command Center — getFocusAccount", () => {
  it("returns null for empty accounts", () => {
    expect(getFocusAccount([], [])).toBeNull();
  });

  it("ranks critical accounts higher than healthy ones", () => {
    const accounts = [
      makeAccount({ id: "a1", name: "Healthy Inc", dealHealth: "healthy" }),
      makeAccount({ id: "a2", name: "Crisis Corp", dealHealth: "critical" }),
    ];
    const opps = [
      makeOpportunity({ id: "o1", accountId: "a1", value: 100 }),
      makeOpportunity({ id: "o2", accountId: "a2", value: 90 }),
    ];

    const result = getFocusAccount(accounts, opps);
    expect(result?.id).toBe("a2");
  });

  it("prefers higher open value when health is the same", () => {
    const accounts = [
      makeAccount({ id: "a1", name: "Small Co" }),
      makeAccount({ id: "a2", name: "Big Co" }),
    ];
    const opps = [
      makeOpportunity({ id: "o1", accountId: "a1", value: 50000 }),
      makeOpportunity({ id: "o2", accountId: "a2", value: 500000 }),
    ];

    const result = getFocusAccount(accounts, opps);
    expect(result?.id).toBe("a2");
  });
});

describe("P3 Sales Command Center — buildTodaysPriorities", () => {
  it("returns a baseline priority when nothing is urgent", () => {
    const priorities = buildTodaysPriorities({
      accounts: [makeAccount()],
      opportunities: [makeOpportunity({ meddicc: { overallScore: 80 } as unknown as Opportunity["meddicc"] })],
      tasks: [],
    });

    expect(priorities.length).toBeGreaterThanOrEqual(1);
    // Should have a current focus account
    expect(priorities.some((p) => p.tone === "focus")).toBe(true);
  });

  it("flags risk deals with low MEDDICC score", () => {
    const priorities = buildTodaysPriorities({
      accounts: [makeAccount()],
      opportunities: [
        makeOpportunity({ meddicc: { overallScore: 25 } as unknown as Opportunity["meddicc"] }),
      ],
      tasks: [],
    });

    expect(priorities.some((p) => p.tone === "critical")).toBe(true);
  });

  it("flags overdue tasks", () => {
    const priorities = buildTodaysPriorities({
      accounts: [makeAccount()],
      opportunities: [],
      tasks: [makeTask({ dueDate: "2026-04-01T00:00:00Z" })],
    });

    expect(priorities.some((p) => p.title.includes("逾期"))).toBe(true);
  });

  it("limits output to 3 priorities max", () => {
    const priorities = buildTodaysPriorities({
      accounts: [makeAccount({ dealHealth: "critical" })],
      opportunities: [
        makeOpportunity({ meddicc: { overallScore: 10 } as unknown as Opportunity["meddicc"] }),
      ],
      tasks: [
        makeTask({ id: "t1", dueDate: "2026-04-01T00:00:00Z" }),
        makeTask({ id: "t2", dueDate: "2026-04-02T00:00:00Z" }),
      ],
    });

    expect(priorities.length).toBeLessThanOrEqual(3);
  });
});

describe("P3 Sales Command Center — buildEvidenceClaims", () => {
  it("builds deal/account/task evidence claims for the dashboard rail", () => {
    const claims = buildEvidenceClaims({
      riskDeals: [makeOpportunity({ meddicc: { overallScore: 22 } as unknown as Opportunity["meddicc"] })],
      riskAccounts: [{ id: "acc-1", name: "Acme Corp", dealHealth: "critical" }],
      overdueTaskCount: 2,
    });

    expect(claims.length).toBeGreaterThanOrEqual(3);
    expect(claims[0]?.evidence.length).toBeGreaterThan(0);
  });

  it("returns an empty array when no homepage risks exist", () => {
    expect(
      buildEvidenceClaims({
        riskDeals: [],
        riskAccounts: [],
        overdueTaskCount: 0,
      })
    ).toEqual([]);
  });

  it("includes sourceType and timestamp on every claim", () => {
    const claims = buildEvidenceClaims({
      riskDeals: [makeOpportunity({ meddicc: { overallScore: 22 } as unknown as Opportunity["meddicc"] })],
      riskAccounts: [{ id: "acc-1", name: "Acme Corp", dealHealth: "critical" }],
      overdueTaskCount: 1,
    });

    for (const claim of claims) {
      expect(claim.sourceType).toBeDefined();
      expect(["cil_lint", "meddicc_rule", "account_health", "task_rule"]).toContain(claim.sourceType);
      expect(claim.timestamp).toBeDefined();
      expect(new Date(claim.timestamp).getTime()).not.toBeNaN();
    }
  });

  it("integrates CIL reports and prioritizes CIL-derived claims", () => {
    const cilReports: Record<string, CILAccountHealthReport | null> = {
      "acc-1": makeCILReport(),
    };

    const claims = buildEvidenceClaims({
      riskDeals: [makeOpportunity({ meddicc: { overallScore: 22 } as unknown as Opportunity["meddicc"] })],
      riskAccounts: [{ id: "acc-1", name: "Acme Corp", dealHealth: "critical" }],
      overdueTaskCount: 1,
      cilReports,
    });

    // CIL claim should come first
    expect(claims[0]?.sourceType).toBe("cil_lint");
    expect(claims[0]?.id).toBe("cil-acc-1");
    expect(claims[0]?.evidence).toContain("CIL 健康分：35/100");
  });

  it("deduplicates: skips rule-derived account claim when CIL claim exists", () => {
    const cilReports: Record<string, CILAccountHealthReport | null> = {
      "acc-1": makeCILReport(),
    };

    const claims = buildEvidenceClaims({
      riskDeals: [],
      riskAccounts: [{ id: "acc-1", name: "Acme Corp", dealHealth: "critical" }],
      overdueTaskCount: 0,
      cilReports,
    });

    // Should have CIL claim but NOT a separate account-health rule claim for same account
    const cilClaims = claims.filter((c) => c.id === "cil-acc-1");
    const ruleClaims = claims.filter((c) => c.id === "account-acc-1");
    expect(cilClaims.length).toBe(1);
    expect(ruleClaims.length).toBe(0);
  });

  it("falls back to rule-derived claims when cilReports is undefined", () => {
    const claims = buildEvidenceClaims({
      riskDeals: [makeOpportunity({ meddicc: { overallScore: 22 } as unknown as Opportunity["meddicc"] })],
      riskAccounts: [{ id: "acc-1", name: "Acme Corp", dealHealth: "critical" }],
      overdueTaskCount: 1,
    });

    // No CIL claims, all rule-derived
    expect(claims.every((c) => c.sourceType !== "cil_lint")).toBe(true);
    expect(claims.length).toBeGreaterThanOrEqual(3);
  });
});

describe("P3 Sales Command Center — buildNarrativeFeed", () => {
  it("creates narrative items from accounts, opps, and tasks", () => {
    const feed = buildNarrativeFeed({
      accounts: [makeAccount({ dealHealth: "at_risk" })],
      opportunities: [makeOpportunity({ value: 300000 })],
      tasks: [makeTask({ priority: "high" })],
    });

    expect(feed.length).toBeGreaterThanOrEqual(1);
    expect(feed.length).toBeLessThanOrEqual(4);
  });

  it("includes focus-account narrative for critical accounts", () => {
    const feed = buildNarrativeFeed({
      accounts: [makeAccount({ dealHealth: "critical" })],
      opportunities: [makeOpportunity()],
      tasks: [],
    });

    expect(feed.some((item) => item.title.includes("当前重点"))).toBe(true);
  });

  it("includes strongest opportunity narrative", () => {
    const feed = buildNarrativeFeed({
      accounts: [makeAccount()],
      opportunities: [makeOpportunity({ name: "Mega Deal", value: 1000000 })],
      tasks: [],
    });

    expect(feed.some((item) => item.title.includes("最大机会"))).toBe(true);
  });

  it("returns empty array when no data", () => {
    const feed = buildNarrativeFeed({
      accounts: [],
      opportunities: [],
      tasks: [],
    });

    expect(feed).toHaveLength(0);
  });
});
