import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  ApiError,
  requireAccountAccess,
  requireAuth,
  requireContactAccess,
  requireOpportunityAccess,
  requireAdmin,
} from '@/lib/api-guard';
import { dispatchTool } from './dispatch';

vi.mock('@/lib/api-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-guard')>('@/lib/api-guard');
  return {
    ApiError: actual.ApiError,
    requireAuth: vi.fn(),
    requireAccountAccess: vi.fn(),
    requireContactAccess: vi.fn(),
    requireOpportunityAccess: vi.fn(),
    requireAdmin: vi.fn(),
    guardResponse: (err: unknown) => {
      const status = err instanceof actual.ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'error';
      return Response.json({ error: message }, { status });
    },
  };
});

vi.mock('./dispatch', () => ({
  dispatchTool: vi.fn(),
}));

function executeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/agent/execute-tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/agent/execute-tools create_task guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireContactAccess).mockResolvedValue({ id: 'con_1', account_id: 'acc_1', user_id: 'user_1' });
    vi.mocked(requireOpportunityAccess).mockResolvedValue({ id: 'opp_1', account_id: 'acc_1', user_id: 'user_1', assigned_to: null });
    vi.mocked(dispatchTool).mockResolvedValue({ success: true, message: 'created' });
  });

  it('rechecks auth plus account/opportunity/contact scope before dispatching create_task', async () => {
    const action = {
      toolName: 'create_task',
      displayName: '创建跟进任务',
      requiresConfirmation: true,
      fields: [],
      args: {
        title: '跟进李总',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        contactId: 'con_1',
        priority: 'medium',
      },
    };

    const response = await POST(executeRequest({ actions: [action], conversationId: 'conv_1' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }), 'acc_1');
    expect(requireOpportunityAccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }), 'opp_1');
    expect(requireContactAccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_1' }), 'con_1');
    expect(dispatchTool).toHaveBeenCalledWith({
      ...action,
      args: { ...action.args, assignedTo: 'user_1' },
    }, 'conv_1');
    expect(payload.results[0]).toMatchObject({ success: true, toolName: 'create_task' });
  });

  it('rejects create_task when opportunity does not belong to the confirmed account', async () => {
    vi.mocked(requireOpportunityAccess).mockResolvedValueOnce({ id: 'opp_2', account_id: 'acc_other', user_id: 'user_1', assigned_to: null });

    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'create_task',
        displayName: '创建跟进任务',
        requiresConfirmation: true,
        fields: [],
        args: { title: '跟进李总', accountId: 'acc_1', opportunityId: 'opp_2', priority: 'medium' },
      }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dispatchTool).not.toHaveBeenCalled();
    expect(payload.results[0]).toMatchObject({ success: false });
    expect(payload.results[0].message).toContain('商机不属于当前客户');
  });

  it('rejects create_task when contact does not belong to the confirmed account', async () => {
    vi.mocked(requireContactAccess).mockResolvedValueOnce({ id: 'con_other', account_id: 'acc_other', user_id: 'user_1' });

    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'create_task',
        displayName: '创建跟进任务',
        requiresConfirmation: true,
        fields: [],
        args: { title: '跟进李总', accountId: 'acc_1', contactId: 'con_other', priority: 'medium' },
      }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dispatchTool).not.toHaveBeenCalled();
    expect(payload.results[0]).toMatchObject({ success: false });
    expect(payload.results[0].message).toContain('联系人不属于当前客户');
  });

  it('rejects create_task when opportunity and contact belong to different accounts', async () => {
    vi.mocked(requireContactAccess).mockResolvedValueOnce({ id: 'con_2', account_id: 'acc_2', user_id: 'user_1' });
    vi.mocked(requireOpportunityAccess).mockResolvedValueOnce({ id: 'opp_1', account_id: 'acc_1', user_id: 'user_1', assigned_to: null });

    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'create_task',
        displayName: '创建跟进任务',
        requiresConfirmation: true,
        fields: [],
        args: { title: '跟进李总', opportunityId: 'opp_1', contactId: 'con_2', priority: 'medium' },
      }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dispatchTool).not.toHaveBeenCalled();
    expect(payload.results[0]).toMatchObject({ success: false });
    expect(payload.results[0].message).toContain('商机与联系人不属于同一客户');
  });

  it('rewrites forged create_task assignedTo to the current user before dispatch', async () => {
    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'create_task',
        displayName: '创建跟进任务',
        requiresConfirmation: true,
        fields: [{ field: 'assignedTo', value: 'attacker_user', confidence: 'explicit', source_quote: 'x' }],
        args: { title: '跟进李总', accountId: 'acc_1', assignedTo: 'attacker_user', priority: 'medium' },
      }],
    }));

    expect(response.status).toBe(200);
    expect(dispatchTool).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({ assignedTo: 'user_1' }),
        fields: [],
      }),
      'conv_1',
    );
  });
});


describe('/api/agent/execute-tools record_task_outcome guards', () => {
  const taskRows: Record<string, unknown>[] = [];

  function makeAdmin() {
    return {
      from(table: string) {
        if (table !== 'tasks') throw new Error(`unexpected table ${table}`);
        const filters: Array<[string, unknown]> = [];
        const query = {
          select() { return query; },
          eq(key: string, value: unknown) { filters.push([key, value]); return query; },
          async maybeSingle() {
            const row = taskRows.find((candidate) => filters.every(([key, value]) => candidate[key] === value));
            return { data: row ?? null, error: null };
          },
        };
        return query;
      },
    } as unknown as ReturnType<typeof requireAdmin>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    taskRows.length = 0;
    taskRows.push({
      id: 'task_1',
      title: '跟进李总确认评审时间',
      status: 'todo',
      org_id: 'org_1',
      account_id: 'acc_1',
      opportunity_id: 'opp_1',
      contact_id: 'con_1',
    });
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user_1',
      orgId: 'org_1',
      orgRole: 'admin',
      roleLevel: 'admin',
      jobLevel: 2,
      teamId: null,
      teamMemberIds: [],
    });
    vi.mocked(requireAdmin).mockReturnValue(makeAdmin());
    vi.mocked(requireAccountAccess).mockResolvedValue(undefined);
    vi.mocked(requireContactAccess).mockResolvedValue({ id: 'con_1', account_id: 'acc_1', user_id: 'user_1' });
    vi.mocked(requireOpportunityAccess).mockResolvedValue({ id: 'opp_1', account_id: 'acc_1', user_id: 'user_1', assigned_to: null });
    vi.mocked(dispatchTool).mockResolvedValue({ success: true, message: 'recorded' });
  });

  it('rechecks auth, task org/account scope, and enriches record_task_outcome before dispatch', async () => {
    const action = {
      toolName: 'record_task_outcome',
      displayName: '记录任务执行反馈',
      requiresConfirmation: true,
      fields: [],
      args: {
        taskId: 'task_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        contactId: 'con_1',
        outcome: 'completed',
        outcomeNote: '因为李总同意下周评审',
        reason: '因为李总同意下周评审',
        source_quote: '刚才那个跟进任务完成了，因为李总同意下周评审',
      },
    };

    const response = await POST(executeRequest({ actions: [action], conversationId: 'conv_1' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(requireAdmin).toHaveBeenCalled();
    expect(requireAccountAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'acc_1');
    expect(requireOpportunityAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'opp_1');
    expect(requireContactAccess).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org_1' }), 'con_1');
    expect(dispatchTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'record_task_outcome',
      args: expect.objectContaining({
        taskId: 'task_1',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        contactId: 'con_1',
        previousTaskStatus: 'todo',
      }),
    }), 'conv_1');
    expect(payload.results[0]).toMatchObject({ success: true, toolName: 'record_task_outcome' });
  });

  it('rejects record_task_outcome when task org does not match current org', async () => {
    taskRows[0].org_id = 'org_other';

    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'record_task_outcome',
        displayName: '记录任务执行反馈',
        requiresConfirmation: true,
        fields: [],
        args: { taskId: 'task_1', accountId: 'acc_1', outcome: 'completed', outcomeNote: '完成', reason: '完成', source_quote: '任务完成了，因为客户同意评审' },
      }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dispatchTool).not.toHaveBeenCalled();
    expect(payload.results[0].success).toBe(false);
    expect(payload.results[0].message).toContain('任务不存在或不属于当前组织');
  });

  it('rejects record_task_outcome when account/opportunity/contact payload does not match task row', async () => {
    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'record_task_outcome',
        displayName: '记录任务执行反馈',
        requiresConfirmation: true,
        fields: [],
        args: {
          taskId: 'task_1',
          accountId: 'acc_other',
          opportunityId: 'opp_1',
          contactId: 'con_1',
          outcome: 'blocked',
          outcomeNote: '因为采购没批',
          reason: '因为采购没批',
          source_quote: '这个任务卡住了，因为采购没批',
        },
      }],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dispatchTool).not.toHaveBeenCalled();
    expect(payload.results[0].success).toBe(false);
    expect(payload.results[0].message).toContain('任务与确认卡客户不一致');
  });

  it('rejects unauthenticated record_task_outcome requests', async () => {
    vi.mocked(requireAuth).mockRejectedValueOnce(new ApiError(401, '请先登录'));

    const response = await POST(executeRequest({
      conversationId: 'conv_1',
      actions: [{
        toolName: 'record_task_outcome',
        displayName: '记录任务执行反馈',
        requiresConfirmation: true,
        fields: [],
        args: { taskId: 'task_1', outcome: 'completed', outcomeNote: '完成', reason: '完成', source_quote: '任务完成了，因为客户同意评审' },
      }],
    }));

    expect(response.status).toBe(401);
    expect(dispatchTool).not.toHaveBeenCalled();
  });
});
