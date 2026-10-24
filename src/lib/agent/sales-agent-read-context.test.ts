import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSalesAgent, type ChatContext } from './sales-agent';
import { executeReadAccountContext } from './tools/read-context';

vi.mock('./tools/read-context', () => ({
  executeReadAccountContext: vi.fn(),
}));

const baseContext: ChatContext = {
  userId: 'user_1',
  orgId: 'org_1',
  accountId: 'acc_1',
  currentAccountName: '华东平台客户',
};

describe('Sales Agent server-side account read layer', () => {
  beforeEach(() => {
    vi.stubEnv('AI_BASE_URL', 'http://ai.test');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.mocked(executeReadAccountContext).mockResolvedValue({
      success: true,
      message: '已读取「华东平台客户」的服务端上下文',
      data: {
        account: { id: 'acc_1', name: '华东平台客户' },
        tasks: [{ id: 'task_1', title: '确认预算窗口', status: 'todo' }],
        strategicPlays: [{ id: 'play_1', goalDescription: '推动 CFO 确认预算' }],
        sourceRefs: { note: 'server-side scoped' },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('auto-executes read_account_context and uses the server result before answering account context questions', async () => {
    vi.stubEnv('AI_MODEL', 'deepseek-v4-flash');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_read_1',
                type: 'function',
                function: {
                  name: 'read_account_context',
                  arguments: JSON.stringify({ accountId: 'acc_1', sections: ['tasks', 'strategic_plays'] }),
                },
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '当前客户有 1 个待办任务，核心谋局是推动 CFO 确认预算。',
              tool_calls: [],
            },
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSalesAgent('把这个客户所有任务和谋局都读一下', baseContext, []);

    expect(executeReadAccountContext).toHaveBeenCalledWith({
      accountId: 'acc_1',
      sections: ['tasks', 'strategic_plays'],
      userId: 'user_1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
    });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.pendingActions).toBeUndefined();
    expect(result.reply).toContain('待办任务');
  });

  it('disables DeepSeek thinking mode for multi-round tool calls', async () => {
    vi.stubEnv('AI_BASE_URL', 'https://api.deepseek.com');
    vi.stubEnv('AI_MODEL', 'deepseek-v4-flash');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: null,
              reasoning_content: 'deepseek reasoning state',
              tool_calls: [{
                id: 'call_read_1',
                type: 'function',
                function: {
                  name: 'read_account_context',
                  arguments: JSON.stringify({ accountId: 'acc_1', sections: ['opportunities'] }),
                },
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '最需要介入的是 5G 网络智能运维平台。',
              tool_calls: [],
            },
          }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSalesAgent('哪个商机需要我介入的', baseContext, [{
      role: 'assistant',
      content: '[5G网络智能运维平台](/pipeline/opp_cmcc_5g_003)',
    }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        reasoning_content: 'deepseek reasoning state',
        tool_calls: expect.any(Array),
      }),
    ]));
    expect(result.reply).toContain('5G');
  });
});
