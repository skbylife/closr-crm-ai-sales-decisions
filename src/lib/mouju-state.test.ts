import { describe, expect, it } from "vitest";
import type { Opportunity, StrategicPlay } from "@/lib/babel-engine/types";
import { buildMoujuStateForTarget } from "./mouju-state";

function play(overrides: Partial<StrategicPlay> = {}): StrategicPlay {
  return {
    id: "play_1",
    orgId: "org_1",
    accountId: "acc_1",
    opportunityId: "opp_1",
    goalType: "custom",
    goalDescription: "拿到采购路径确认",
    steps: [],
    alternativePaths: [],
    confidence: 70,
    status: "active",
    momentum: "progressing",
    assumptions: [],
    learnings: [],
    daysSinceProgress: 1,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...overrides,
  } as StrategicPlay;
}

function opportunity(overrides: {
  id: string;
  value: number;
  stage: Opportunity["stage"];
  meddicc: { overallScore: number };
}): Pick<Opportunity, "id" | "value" | "stage" | "meddicc"> {
  return overrides as unknown as Pick<Opportunity, "id" | "value" | "stage" | "meddicc">;
}

describe("mouju state", () => {
  it("marks high-value low-evidence deals without a play as executive intervention", () => {
    const state = buildMoujuStateForTarget({
      plays: [],
      accountId: "acc_1",
      opportunity: opportunity({ id: "opp_1", value: 2_000_000, stage: "negotiation", meddicc: { overallScore: 34 } }),
      accountName: "重点客户",
    });

    expect(state.status).toBe("needs_executive_intervention");
    expect(state.nextAction).toContain("创建谋局");
    expect(state.evidence).toContain("活跃谋局 0");
  });

  it("marks blocked or invalidated plays as needing calibration", () => {
    const state = buildMoujuStateForTarget({
      plays: [play({
        confidence: 62,
        momentum: "active",
        assumptions: [{ id: "a1", text: "采购愿意本月评审", status: "invalidated", createdAt: "2026-05-01T00:00:00.000Z" }],
      })],
      accountId: "acc_1",
      opportunity: opportunity({ id: "opp_1", value: 200_000, stage: "discovery", meddicc: { overallScore: 60 } }),
    });

    expect(state.status).toBe("needs_calibration");
    expect(state.risk).toContain("假设需要校准");
  });

  it("keeps fresh progressing plays in progress", () => {
    const state = buildMoujuStateForTarget({
      plays: [play({ confidence: 82, momentum: "progressing", daysSinceProgress: 2 })],
      accountId: "acc_1",
      opportunity: opportunity({ id: "opp_1", value: 200_000, stage: "proposal_sent", meddicc: { overallScore: 70 } }),
    });

    expect(state.status).toBe("in_progress");
    expect(state.label).toBe("推进中");
    expect(state.confidence).toBeCloseTo(0.82);
  });
});
