import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserContext } from '@/lib/permissions';
import type { PallasActionProposal, PallasProposedAction } from './types';
import {
  requireAccountAccess,
  requireAdmin,
  requireOwnership,
} from '@/lib/api-guard';
import {
  PallasActionProposalReuseConflictError,
  assertPallasContextAccess,
  buildPallasActionProposalReuseKey,
  createPallasActionProposal,
  executePallasConfirmedCreateTaskProposal,
  isReusablePallasActionProposalCandidate,
  updatePallasProposalLifecycleStatus,
  updatePallasProposalStatus,
} from './server';

vi.mock('@/lib/api-guard', () => {
  class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  }

  return {
    ApiError,
    requireAccountAccess: vi.fn(async () => undefined),
    requireAdmin: vi.fn(),
    requireContactAccess: vi.fn(async () => undefined),
    requireOpportunityAccess: vi.fn(async () => undefined),
    requireOwnership: vi.fn(),
  };
});

const ctx = {
  userId: 'user_1',
  orgId: 'org_1',
  orgRole: 'member',
  roleLevel: 'member',
  jobLevel: 0,
  teamId: null,
  teamMemberIds: [],
} satisfies UserContext;

function mockAdminRow(row: Record<string, unknown> | null, error: { message: string } | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: row, error })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  vi.mocked(requireAdmin).mockReturnValue({ from: vi.fn(() => query) } as never);
}

function mockProposalStatusUpdate(existingRow: Record<string, unknown>, updatedRow: Record<string, unknown>) {
  const selectQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: existingRow, error: null })),
  };
  selectQuery.select.mockReturnValue(selectQuery);
  selectQuery.eq.mockReturnValue(selectQuery);

  const updateQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: updatedRow, error: null })),
  };
  updateQuery.update.mockReturnValue(updateQuery);
  updateQuery.eq.mockReturnValue(updateQuery);
  updateQuery.select.mockReturnValue(updateQuery);

  vi.mocked(requireAdmin).mockReturnValue({
    from: vi.fn()
      .mockReturnValueOnce(selectQuery)
      .mockReturnValueOnce(updateQuery),
  } as never);
}

function mockCreateProposalInsert(
  insertedRow: Record<string, unknown> | null,
  error: { code?: string; message: string; details?: string } | null = null
) {
  const expireQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(async () => ({ error: null })),
  };
  expireQuery.update.mockReturnValue(expireQuery);
  expireQuery.eq.mockReturnValue(expireQuery);

  const insertQuery = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: insertedRow, error })),
  };
  insertQuery.insert.mockReturnValue(insertQuery);
  insertQuery.select.mockReturnValue(insertQuery);

  let fromCount = 0;
  vi.mocked(requireAdmin).mockReturnValue({
    from: vi.fn((table: string) => {
      if (table !== 'pallas_action_proposals') {
        throw new Error(`unexpected table ${table}`);
      }
      fromCount += 1;
      return fromCount === 1 ? expireQuery : insertQuery;
    }),
  } as never);

  return { expireQuery, insertQuery };
}

function mockProposalLifecycleUpdate(existingRow: Record<string, unknown>, updatedRow: Record<string, unknown>) {
  const selectQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: existingRow, error: null })),
  };
  selectQuery.select.mockReturnValue(selectQuery);
  selectQuery.eq.mockReturnValue(selectQuery);

  const updateQuery = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(async () => ({ data: updatedRow, error: null })),
  };
  updateQuery.update.mockReturnValue(updateQuery);
  updateQuery.eq.mockReturnValue(updateQuery);
  updateQuery.select.mockReturnValue(updateQuery);

  vi.mocked(requireAdmin).mockReturnValue({
    from: vi.fn()
      .mockReturnValueOnce(selectQuery)
      .mockReturnValueOnce(updateQuery),
  } as never);

  return updateQuery;
}

function mockSupabaseQuery(result: {
  data?: Record<string, unknown> | Record<string, unknown>[] | null;
  error?: { message: string } | null;
  terminal?: 'single' | 'maybeSingle';
}) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
    maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

const proposalRow = {
  id: 'proposal_1',
  org_id: 'org_1',
  user_id: 'user_1',
  artifact_id: null,
  conversation_id: 'conv_1',
  entity_type: 'account',
  entity_id: 'acc_1',
  account_id: 'acc_1',
  contact_id: null,
  opportunity_id: null,
  strategic_play_id: null,
  status: 'awaiting_confirmation',
  risk_level: 'low',
  actions: [],
  source_refs: [],
  created_at: '2026-05-17T05:00:00.000Z',
  confirmed_at: null,
  confirmed_by: null,
  result_summary: null,
};

const futureExpiresAt = '2999-05-18T05:00:00.000Z';

describe('assertPallasContextAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves strategic play access through the owning account when context only has play id', async () => {
    mockAdminRow({ id: 'play_1', account_id: 'acc_1', opportunity_id: null });

    await assertPallasContextAccess(ctx, { entityType: 'strategic_play', entityId: 'play_1' });

    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
  });

  it('rejects mismatched strategic play account context', async () => {
    mockAdminRow({ id: 'play_1', account_id: 'acc_1', opportunity_id: null });

    await expect(assertPallasContextAccess(ctx, {
      entityType: 'strategic_play',
      entityId: 'play_1',
      accountId: 'acc_2',
    })).rejects.toMatchObject({ status: 400 });
  });

  it('falls back to task ownership when task has no account/contact/opportunity link', async () => {
    mockAdminRow({
      id: 'task_1',
      account_id: null,
      contact_id: null,
      opportunity_id: null,
      user_id: 'owner_1',
      assigned_to: null,
    });

    await assertPallasContextAccess(ctx, { entityType: 'task', entityId: 'task_1' });

    expect(requireOwnership).toHaveBeenCalledWith(ctx, 'owner_1');
  });

  it('checks proposal context access before status updates', async () => {
    mockProposalStatusUpdate(proposalRow, {
      ...proposalRow,
      status: 'confirmed',
      confirmed_at: '2026-05-17T05:10:00.000Z',
      confirmed_by: 'user_1',
    });

    const proposal = await updatePallasProposalStatus({
      ctx,
      proposalId: 'proposal_1',
      status: 'confirmed',
    });

    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
    expect(proposal.status).toBe('confirmed');
  });

  it('guards resource access before creating persisted awaiting_confirmation proposals', async () => {
    const { expireQuery, insertQuery } = mockCreateProposalInsert({
      ...proposalRow,
      status: 'awaiting_confirmation',
      expires_at: '2026-05-18T05:00:00.000Z',
      reuse_key: 'reuse_key_1',
    });

    const proposal = await createPallasActionProposal({
      ctx,
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      actions: [{
        toolName: 'create_task',
        displayName: '创建任务',
        requiresConfirmation: true,
        fields: [{
          field: 'title',
          value: '准备技术评审材料',
          confidence: 'explicit',
          source_quote: '谋局步骤 1',
        }],
      }],
      expiresAt: '2026-05-18T05:00:00.000Z',
      reuseKey: 'reuse_key_1',
    });

    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
    expect(expireQuery.update).toHaveBeenCalledWith({
      status: 'expired',
      result_summary: expect.stringContaining('超过确认有效期'),
    });
    expect(expireQuery.eq).toHaveBeenCalledWith('org_id', 'org_1');
    expect(expireQuery.eq).toHaveBeenCalledWith('reuse_key', 'reuse_key_1');
    expect(expireQuery.eq).toHaveBeenCalledWith('status', 'awaiting_confirmation');
    expect(expireQuery.lte).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: 'org_1',
      user_id: 'user_1',
      status: 'awaiting_confirmation',
      expires_at: '2026-05-18T05:00:00.000Z',
      reuse_key: 'reuse_key_1',
    }));
    expect(proposal.status).toBe('awaiting_confirmation');
    expect(proposal.expiresAt).toBe('2026-05-18T05:00:00.000Z');
    expect(proposal.reuseKey).toBe('reuse_key_1');
  });

  it('uses a valid timestamp cutoff when auto-expiring stale awaiting proposals before insert', async () => {
    const { expireQuery } = mockCreateProposalInsert({
      ...proposalRow,
      status: 'awaiting_confirmation',
      expires_at: '2026-05-18T05:00:00.000Z',
      reuse_key: 'reuse_key_1',
    });

    await createPallasActionProposal({
      ctx,
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      actions: [{
        toolName: 'create_task',
        displayName: '创建任务',
        requiresConfirmation: true,
        fields: [{
          field: 'title',
          value: '准备技术评审材料',
          confidence: 'explicit',
          source_quote: '谋局步骤 1',
        }],
      }],
      expiresAt: '2026-05-18T05:00:00.000Z',
      reuseKey: 'reuse_key_1',
    });

    const cutoff = (expireQuery.lte.mock.calls[0] as unknown[] | undefined)?.[1];
    expect(typeof cutoff).toBe('string');
    if (typeof cutoff !== 'string') throw new Error('expected cutoff to be a string');
    expect(Number.isNaN(new Date(cutoff).getTime())).toBe(false);
  });

  it('surfaces DB-level reuse-key conflicts as a typed error', async () => {
    mockCreateProposalInsert(null, {
      code: '23505',
      message: 'duplicate key value violates unique constraint "pallas_action_proposals_active_reuse_key_uidx"',
    });

    await expect(createPallasActionProposal({
      ctx,
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      actions: [{
        toolName: 'create_task',
        displayName: '创建任务',
        requiresConfirmation: true,
        fields: [{
          field: 'title',
          value: '准备技术评审材料',
          confidence: 'explicit',
          source_quote: '谋局步骤 1',
        }],
      }],
      reuseKey: 'reuse_key_1',
      expiresAt: '2026-05-18T05:00:00.000Z',
    })).rejects.toBeInstanceOf(PallasActionProposalReuseConflictError);
  });

  it('confirms awaiting proposals without executing tools or creating tasks', async () => {
    const updateQuery = mockProposalLifecycleUpdate({
      ...proposalRow,
      expires_at: futureExpiresAt,
    }, {
      ...proposalRow,
      status: 'confirmed',
      expires_at: futureExpiresAt,
      confirmed_at: '2026-05-17T05:10:00.000Z',
      confirmed_by: 'user_1',
      result_summary: '用户确认此 Pallas 提案，仅记录确认意图。未创建任务，未调用工具，未执行外部动作。',
    });

    const proposal = await updatePallasProposalLifecycleStatus({
      ctx,
      proposalId: 'proposal_1',
      status: 'confirmed',
      resultSummary: '用户确认此 Pallas 提案，仅记录确认意图。未创建任务，未调用工具，未执行外部动作。',
    });

    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'confirmed',
      result_summary: expect.stringContaining('未创建任务，未调用工具'),
      confirmed_by: 'user_1',
    }));
    expect(proposal.status).toBe('confirmed');
    expect(proposal.confirmedBy).toBe('user_1');
  });

  it('blocks confirming stale awaiting proposals', async () => {
    mockProposalLifecycleUpdate({
      ...proposalRow,
      expires_at: '2026-05-16T05:00:00.000Z',
    }, {
      ...proposalRow,
      status: 'confirmed',
    });

    await expect(updatePallasProposalLifecycleStatus({
      ctx,
      proposalId: 'proposal_1',
      status: 'confirmed',
      resultSummary: '用户确认此 Pallas 提案，仅记录确认意图。未创建任务，未调用工具，未执行外部动作。',
    })).rejects.toMatchObject({ status: 409 });
  });

  it('allows reject or expire lifecycle updates while awaiting confirmation', async () => {
    const updateQuery = mockProposalLifecycleUpdate(proposalRow, {
      ...proposalRow,
      status: 'expired',
      result_summary: '此 Pallas 提案已标记过期。未创建任务，未调用工具。',
    });

    const proposal = await updatePallasProposalLifecycleStatus({
      ctx,
      proposalId: 'proposal_1',
      status: 'expired',
      resultSummary: '此 Pallas 提案已标记过期。未创建任务，未调用工具。',
    });

    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
    expect(updateQuery.update).toHaveBeenCalledWith({
      status: 'expired',
      result_summary: '此 Pallas 提案已标记过期。未创建任务，未调用工具。',
    });
    expect(proposal.status).toBe('expired');
  });

  it('blocks lifecycle updates after a proposal leaves awaiting_confirmation', async () => {
    mockProposalLifecycleUpdate({
      ...proposalRow,
      status: 'rejected',
    }, {
      ...proposalRow,
      status: 'expired',
    });

    await expect(updatePallasProposalLifecycleStatus({
      ctx,
      proposalId: 'proposal_1',
      status: 'expired',
      resultSummary: '此 Pallas 提案已标记过期。未创建任务，未调用工具。',
    })).rejects.toMatchObject({ status: 409 });
  });
});

const createTaskAction = {
  toolName: 'create_task',
  displayName: '创建任务：准备技术评审材料',
  requiresConfirmation: true,
  args: {
    title: '准备技术评审材料',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    strategicPlayId: 'play_1',
    strategicPlayStepIndex: 1,
  },
  fields: [{
    field: 'title',
    value: '准备技术评审材料',
    confidence: 'explicit',
    source_quote: '谋局步骤 1：准备技术评审材料',
  }],
} satisfies PallasProposedAction;

const strategicPlayContext = {
  entityType: 'strategic_play',
  entityId: 'play_1',
  accountId: 'acc_1',
  opportunityId: 'opp_1',
  strategicPlayId: 'play_1',
} as const;

const strategicPlayReuseKey = buildPallasActionProposalReuseKey({
  conversationId: 'pallas-strategic-play-action-board:play_1',
  context: strategicPlayContext,
  actions: [createTaskAction],
});

function reusableProposal(overrides: Partial<PallasActionProposal> = {}): PallasActionProposal {
  return {
    id: 'proposal_1',
    orgId: 'org_1',
    userId: 'user_1',
    artifactId: null,
    conversationId: 'pallas-strategic-play-action-board:play_1',
    reuseKey: strategicPlayReuseKey,
    context: strategicPlayContext,
    status: 'awaiting_confirmation',
    riskLevel: 'low',
    actions: [createTaskAction],
    sourceRefs: [],
    createdAt: '2026-05-17T05:00:00.000Z',
    expiresAt: '2026-05-18T05:00:00.000Z',
    ...overrides,
  };
}

describe('isReusablePallasActionProposalCandidate', () => {
  const reuseParams = {
    ctx,
    conversationId: 'pallas-strategic-play-action-board:play_1',
    context: strategicPlayContext,
    actions: [createTaskAction],
    reuseKey: strategicPlayReuseKey,
    now: new Date('2026-05-17T06:00:00.000Z'),
  } satisfies Omit<Parameters<typeof isReusablePallasActionProposalCandidate>[0], 'proposal'>;

  it('reuses an unexpired awaiting_confirmation proposal for the same org account play step and tool', () => {
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal(),
    })).toBe(true);
  });

  it('allows new proposals after rejected or expired candidates', () => {
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal({ status: 'rejected' }),
    })).toBe(false);
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal({ status: 'expired' }),
    })).toBe(false);
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal({ expiresAt: '2026-05-17T05:59:59.000Z' }),
    })).toBe(false);
  });

  it('does not reuse across org account or play boundaries', () => {
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal({ orgId: 'org_2' }),
    })).toBe(false);
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal({
        context: {
          entityType: 'strategic_play',
          entityId: 'play_1',
          accountId: 'acc_2',
          opportunityId: 'opp_1',
          strategicPlayId: 'play_1',
        },
      }),
    })).toBe(false);
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      proposal: reusableProposal({
        conversationId: 'pallas-strategic-play-action-board:play_2',
        context: {
          entityType: 'strategic_play',
          entityId: 'play_2',
          accountId: 'acc_1',
          opportunityId: 'opp_1',
          strategicPlayId: 'play_2',
        },
      }),
    })).toBe(false);
  });

  it('does not reuse when the create_task step differs', () => {
    const differentStepAction = {
      ...createTaskAction,
      args: {
        ...createTaskAction.args,
        strategicPlayStepIndex: 2,
      },
    };

    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      actions: [differentStepAction],
      reuseKey: buildPallasActionProposalReuseKey({
        conversationId: 'pallas-strategic-play-action-board:play_1',
        context: strategicPlayContext,
        actions: [differentStepAction],
      }),
      proposal: reusableProposal({
        actions: [{
          ...createTaskAction,
          args: {
            ...createTaskAction.args,
            strategicPlayStepIndex: 2,
          },
        }],
      }),
    })).toBe(false);
  });

  it('does not reuse when both sides have different stable reuse keys', () => {
    expect(isReusablePallasActionProposalCandidate({
      ...reuseParams,
      reuseKey: 'pallas-action-proposal:v1:different',
      proposal: reusableProposal(),
    })).toBe(false);
  });
});

describe('buildPallasActionProposalReuseKey', () => {
  it('builds a stable key for the same conversation context and create_task step', () => {
    const reorderedAction = {
      ...createTaskAction,
      args: {
        strategicPlayStepIndex: 1,
        strategicPlayId: 'play_1',
        opportunityId: 'opp_1',
        accountId: 'acc_1',
        title: '准备技术评审材料',
      },
    };

    expect(buildPallasActionProposalReuseKey({
      conversationId: 'pallas-strategic-play-action-board:play_1',
      context: strategicPlayContext,
      actions: [reorderedAction],
    })).toBe(strategicPlayReuseKey);
  });

  it('changes the key across conversation account play step and action boundaries', () => {
    const changedStepAction = {
      ...createTaskAction,
      args: {
        ...createTaskAction.args,
        strategicPlayStepIndex: 2,
      },
    };

    expect(buildPallasActionProposalReuseKey({
      conversationId: 'pallas-strategic-play-action-board:play_2',
      context: strategicPlayContext,
      actions: [createTaskAction],
    })).not.toBe(strategicPlayReuseKey);
    expect(buildPallasActionProposalReuseKey({
      conversationId: 'pallas-strategic-play-action-board:play_1',
      context: { ...strategicPlayContext, accountId: 'acc_2' },
      actions: [createTaskAction],
    })).not.toBe(strategicPlayReuseKey);
    expect(buildPallasActionProposalReuseKey({
      conversationId: 'pallas-strategic-play-action-board:play_1',
      context: { ...strategicPlayContext, entityId: 'play_2', strategicPlayId: 'play_2' },
      actions: [createTaskAction],
    })).not.toBe(strategicPlayReuseKey);
    expect(buildPallasActionProposalReuseKey({
      conversationId: 'pallas-strategic-play-action-board:play_1',
      context: strategicPlayContext,
      actions: [changedStepAction],
    })).not.toBe(strategicPlayReuseKey);
  });
});

describe('executePallasConfirmedCreateTaskProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one Closr internal task from a confirmed create_task proposal and records tool/proposal status', async () => {
    const confirmedProposalRow = {
      ...proposalRow,
      status: 'confirmed',
      actions: [{
        ...createTaskAction,
        args: {
          title: '准备技术评审材料',
          accountId: 'acc_1',
          priority: 'medium',
          dueDate: '2026-05-20',
          description: '把 AIOps ROI 与现有运维成本放在同一页',
        },
      }],
      expires_at: '2099-05-18T05:00:00.000Z',
    };
    const runningProposalRow = {
      ...confirmedProposalRow,
      status: 'executing',
      result_summary: 'Pallas 正在创建 Closr 内部任务。未调用外部工具，未触发第三方连接器。',
    };
    const taskRow = {
      id: 'pallas_task_proposal_1',
      title: '准备技术评审材料',
      status: 'todo',
      priority: 'medium',
      due_date: '2026-05-20',
      account_id: 'acc_1',
      opportunity_id: null,
      contact_id: null,
    };
    const runRow = {
      id: 'run_1',
      proposal_id: 'proposal_1',
      tool_name: 'create_task',
      status: 'running',
      input: {},
      result: null,
      error_message: null,
      started_at: '2026-05-17T05:10:00.000Z',
      finished_at: null,
      created_at: '2026-05-17T05:10:00.000Z',
    };
    const finishedRunRow = {
      ...runRow,
      status: 'succeeded',
      result: { taskId: 'pallas_task_proposal_1', title: '准备技术评审材料' },
      finished_at: '2026-05-17T05:11:00.000Z',
    };
    const finishedProposalRow = {
      ...confirmedProposalRow,
      status: 'succeeded',
      result_summary: '已创建 Closr 内部任务：准备技术评审材料。未调用外部工具，未触发第三方连接器。',
    };

    const selectProposal = mockSupabaseQuery({ data: confirmedProposalRow });
    const claimProposal = mockSupabaseQuery({ data: runningProposalRow });
    const insertRun = mockSupabaseQuery({ data: runRow });
    const findExistingTask = mockSupabaseQuery({ data: null });
    const insertTask = mockSupabaseQuery({ data: taskRow });
    const finishRun = mockSupabaseQuery({ data: finishedRunRow });
    const finishProposal = mockSupabaseQuery({ data: finishedProposalRow });
    const queries = [
      selectProposal,
      claimProposal,
      insertRun,
      findExistingTask,
      insertTask,
      finishRun,
      finishProposal,
    ];
    vi.mocked(requireAdmin).mockReturnValue({
      from: vi.fn(() => {
        const query = queries.shift();
        if (!query) throw new Error('unexpected query');
        return query;
      }),
    } as never);

    const result = await executePallasConfirmedCreateTaskProposal({
      ctx,
      proposalId: 'proposal_1',
    });

    expect(result.proposal.status).toBe('succeeded');
    expect(result.task).toMatchObject({ id: 'pallas_task_proposal_1', title: '准备技术评审材料' });
    expect(result.toolRun?.status).toBe('succeeded');
    expect(result.reused).toBe(false);
    expect(claimProposal.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'executing',
      result_summary: expect.stringContaining('未调用外部工具'),
    }));
    expect(insertTask.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'pallas_task_proposal_1',
      org_id: 'org_1',
      user_id: 'user_1',
      assigned_to: 'user_1',
      account_id: 'acc_1',
      title: '准备技术评审材料',
      source_id: 'pallas_proposal:proposal_1',
      ai_generated: true,
    }));
    expect(finishProposal.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded',
      result_summary: expect.stringContaining('未调用外部工具'),
    }));
    expect(requireAccountAccess).toHaveBeenCalledWith(ctx, 'acc_1');
  });

  it('does not create a second task when the proposal already succeeded', async () => {
    const succeededProposalRow = {
      ...proposalRow,
      status: 'succeeded',
      actions: [createTaskAction],
      result_summary: '已创建 Closr 内部任务：准备技术评审材料。未调用外部工具，未触发第三方连接器。',
    };
    const taskRow = {
      id: 'pallas_task_proposal_1',
      title: '准备技术评审材料',
      status: 'todo',
      priority: 'medium',
      due_date: null,
      account_id: 'acc_1',
      opportunity_id: null,
      contact_id: null,
    };
    const finishedRunRow = {
      id: 'run_1',
      proposal_id: 'proposal_1',
      tool_name: 'create_task',
      status: 'succeeded',
      input: {},
      result: { taskId: 'pallas_task_proposal_1' },
      error_message: null,
      started_at: '2026-05-17T05:10:00.000Z',
      finished_at: '2026-05-17T05:11:00.000Z',
      created_at: '2026-05-17T05:10:00.000Z',
    };
    const selectProposal = mockSupabaseQuery({ data: succeededProposalRow });
    const findTask = mockSupabaseQuery({ data: taskRow });
    const findRun = mockSupabaseQuery({ data: finishedRunRow });
    const queries = [selectProposal, findTask, findRun];
    const from = vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error('unexpected query');
      return query;
    });
    vi.mocked(requireAdmin).mockReturnValue({ from } as never);

    const result = await executePallasConfirmedCreateTaskProposal({
      ctx,
      proposalId: 'proposal_1',
    });

    expect(result.reused).toBe(true);
    expect(result.task.id).toBe('pallas_task_proposal_1');
    expect(findTask.insert).not.toHaveBeenCalled();
  });
});
