import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { requireAccountAccess, requireAdmin, requireAuth } from '@/lib/api-guard';
import { loadAgentJudgmentContext } from '@/lib/agent/judgment-context';
import { runSalesAgent } from '@/lib/agent/sales-agent';

vi.mock('@/lib/api-guard', () => ({
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAccountAccess: vi.fn(),
  requireOpportunityAccess: vi.fn(),
  guardResponse: (err: unknown) => {
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 500;
    const message = err instanceof Error ? err.message : 'error';
    return Response.json({ error: message }, { status });
  },
}));

vi.mock('@/lib/integration/intent-router', () => ({
  detectIntegrationIntent: vi.fn(() => ({ isIntegration: false })),
}));

vi.mock('@/lib/integration/agent', () => ({
  handleIntegrationMessage: vi.fn(),
}));

vi.mock('@/lib/agent/sales-agent', () => ({
  runSalesAgent: vi.fn(),
}));

vi.mock('@/lib/agent/judgment-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agent/judgment-context')>('@/lib/agent/judgment-context');
  return {
    ...actual,
    loadAgentJudgmentContext: vi.fn(),
  };
});

function chatRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/chat judgment context guard', () => {
  beforeEach(() => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAdmin).mockReturnValue({} as ReturnType<typeof requireAdmin>);
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(loadAgentJudgmentContext).mockResolvedValue({
      accountId: 'acc_1',
      currentJudgment: '客户仍有采购意向，但推进节奏变慢。',
      keyRisks: ['预算审批和决策人态度尚未确认。'],
      keyEvidence: ['客户邮件提到预算排期。'],
      recentChanges: ['2026-05-01 邮件解读：客户要求补充安全材料。'],
      evidenceStatus: '1 条可追溯证据；1 条已沉淀判断',
      uncertainties: ['尚不清楚 CFO 是否支持。'],
      nextActions: ['约业务负责人确认预算窗口和决策流程。'],
      sourceSummary: '主要参考：邮件解读',
    });
    vi.mocked(runSalesAgent).mockResolvedValue({
      reply: '当前判断：客户有机会推进\n最大阻塞：预算没确认\n下一步动作：找采购\n推荐推进对象：刘总\n理由：有需求\n风险提示：可能停滞',
      mode: 'progression',
      progression: {
        currentJudgment: '客户有机会推进',
        mainBlocker: '预算没确认',
        nextBestAction: '找采购',
        recommendedTarget: '刘总',
        reason: '有需求',
        riskNote: '可能停滞',
      },
      requiresConfirmation: false,
    });
  });

  it('rewrites an old progression result into the deterministic four-section judgment answer', async () => {
    const response = await POST(chatRequest({
      message: '这个客户现在怎么推进？为什么系统这么判断？',
      context: {
        currentPage: '/accounts/acc_1?tab=overview',
        accountId: 'acc_1',
      },
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe('chat');
    expect(payload.progression).toBeUndefined();
    expect(payload.requiresConfirmation).toBe(false);
    expect(payload.pendingActions).toBeUndefined();
    expect(payload.reply).toMatch(/^当前判断\n/m);
    expect(payload.reply).toMatch(/^关键证据\n/m);
    expect(payload.reply).toMatch(/^不确定点\n/m);
    expect(payload.reply).toMatch(/^下一步动作\n/m);
    expect(payload.reply).not.toMatch(/最大阻塞|推荐推进对象|风险提示/);
    expect(runSalesAgent).toHaveBeenCalledWith(
      '这个客户现在怎么推进？为什么系统这么判断？',
      expect.objectContaining({ accountId: 'acc_1', judgmentContext: expect.any(Object) }),
      [],
    );
  });
});
