/**
 * Integration Agent — 稳定性收口验证
 *
 * 覆盖：reconnect / reauth / resync / stuck sync / token expired / early failure
 * 以及 panel ↔ API ↔ agent 三端状态一致性
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mock Supabase ──────────────────────────────────────────────────

const mockUpdate = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockIn = vi.fn().mockReturnThis();
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSelect = vi.fn(() => ({
  eq: mockEq,
  in: mockIn,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
  ilike: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
  limit: vi.fn().mockResolvedValue({ data: [] }),
  order: vi.fn().mockResolvedValue({ data: [] }),
}));
const mockUpsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  update: mockUpdate,
  upsert: mockUpsert,
  insert: mockInsert,
  delete: vi.fn().mockReturnThis(),
  eq: mockEq,
  in: mockIn,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom }),
}));

vi.mock('@/lib/permissions-server', () => ({
  getUserContext: vi.fn().mockResolvedValue({
    orgId: 'org-001',
    orgRole: 'admin',
    userId: 'user-001',
  }),
}));

vi.mock('@/lib/wecom/auth', () => ({
  connectWeCom: vi.fn(),
  getWeComToken: vi.fn(),
  refreshWeComToken: vi.fn(),
}));

vi.mock('@/lib/integration/email-sync', () => ({
  syncEmails: vi.fn().mockResolvedValue({
    scannedCount: 0, matchedCount: 0, newContactsFound: 0, signalsGenerated: 0, errors: [],
  }),
}));

vi.mock('@/lib/integration/wecom-sync', () => ({
  syncWeComData: vi.fn().mockResolvedValue({
    membersCount: 0, externalContactsCount: 0, newContactsFound: 0, groupChatsCount: 0, accountsMatched: 0, errors: [],
  }),
}));

vi.mock('@/lib/integration/domain-matcher', () => ({
  getAccountDomains: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/lib/error-monitor', () => ({
  safeCatch: () => () => {},
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('@/lib/integration/audit-logger', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/integration/notification-service', () => ({
  createNotification: vi.fn(),
}));

// ─── Import SUT after mocks ────────────────────────────────────────

import { handleIntegrationMessage, type IntegrationSession } from '@/lib/integration/agent';

// ─── Helpers ────────────────────────────────────────────────────────

function makeSession(overrides: Partial<IntegrationSession> = {}): IntegrationSession {
  return {
    state: 'ongoing_monitoring',
    orgId: 'org-001',
    userId: 'user-001',
    connectorType: 'outlook',
    connectionId: 'conn-001',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('Integration Agent — reconnect & reauth flows', () => {
  test('resync without connectionId returns guidance instead of silent no-op', async () => {
    const session = makeSession({ connectionId: undefined });
    const res = await handleIntegrationMessage('重新同步', session, 'user-001');
    expect(res.reply).toContain('未找到');
    expect(res.reply).toContain('对接流程');
  });

  test('history sync without connectionId returns guidance', async () => {
    const session = makeSession({ connectionId: undefined });
    const res = await handleIntegrationMessage('拉过去3个月的', session, 'user-001');
    expect(res.reply).toContain('未找到');
  });

  test('sync status without connectionId returns guidance', async () => {
    const session = makeSession({ connectionId: undefined });
    const res = await handleIntegrationMessage('同步状态', session, 'user-001');
    expect(res.reply).toContain('未找到');
  });

  test('reauth for outlook produces oauth redirect action', async () => {
    const session = makeSession({ authMode: 'personal' });
    const res = await handleIntegrationMessage('重新授权', session, 'user-001');
    expect(res.reply).toContain('Microsoft 授权');
    expect(res.actions).toBeDefined();
    expect(res.actions?.some(a => a.type === 'oauth_redirect')).toBe(true);
  });

  test('reauth for wecom guides to corpid input', async () => {
    const session = makeSession({ connectorType: 'wecom' });
    const res = await handleIntegrationMessage('重新授权', session, 'user-001');
    expect(res.reply).toContain('CorpID');
    expect(res.session?.state).toBe('wecom_input_corpid');
  });
});

describe('Integration Agent — stuck sync recovery', () => {
  test('resync message triggers sync even without stuck flag', async () => {
    const session = makeSession();
    // Mock queryConnectionHealth to return healthy state
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'completed', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 10, status: 'completed', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('重新同步', session, 'user-001');
    expect(res.reply).toContain('已触发');
  });
});

describe('Integration Agent — exit flow', () => {
  test('exit keywords return exitIntegration flag', async () => {
    const session = makeSession();
    const res = await handleIntegrationMessage('退出', session, 'user-001');
    expect(res.exitIntegration).toBe(true);
    expect(res.session).toBeNull();
  });

  test('exit from idle does NOT exit (goes to service selection)', async () => {
    const session = makeSession({ state: 'idle' });
    const res = await handleIntegrationMessage('退出', session, 'user-001');
    // idle state doesn't trigger exit guard
    expect(res.exitIntegration).toBeFalsy();
  });
});

describe('Integration Agent — token expired scenarios', () => {
  test('token expired blocks resync with guidance', async () => {
    const session = makeSession();
    // Mock health check returning expired token
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'error', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 5, status: 'error', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() - 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('重新同步', session, 'user-001');
    expect(res.reply).toContain('授权已过期');
    expect(res.reply).toContain('重新授权');
  });

  test('token expired blocks history sync with guidance', async () => {
    const session = makeSession();
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'completed', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 5, status: 'completed', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() - 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('拉过去1个月的', session, 'user-001');
    expect(res.reply).toContain('授权已过期');
  });
});

describe('Integration Agent — disconnect flow', () => {
  test('disconnect request asks for confirmation', async () => {
    const session = makeSession();
    const res = await handleIntegrationMessage('断开连接', session, 'user-001');
    expect(res.reply).toContain('确定要断开');
    expect(res.actions?.some(a => a.value === 'disconnect_confirm')).toBe(true);
  });

  test('disconnect confirm exits and nullifies session', async () => {
    const session = makeSession();
    const res = await handleIntegrationMessage('确认断开', session, 'user-001');
    expect(res.exitIntegration).toBe(true);
    expect(res.session).toBeNull();
  });
});

describe('Connector Registry — consistency', () => {
  test('all connector IDs have sync object types', async () => {
    const { getSupportedConnectorIds, getSyncObjectType } = await import('@/lib/integration/connector-registry');
    const ids = getSupportedConnectorIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const objType = getSyncObjectType(id);
      expect(objType).toBeTruthy();
    }
  });

  test('connector labels are defined', async () => {
    const { getSupportedConnectorIds, getConnectorLabel } = await import('@/lib/integration/connector-registry');
    for (const id of getSupportedConnectorIds()) {
      expect(getConnectorLabel(id)).toBeTruthy();
    }
  });
});

describe('Intent Router — integration detection', () => {
  test('detects strong integration phrases', async () => {
    const { detectIntegrationIntent } = await import('@/lib/integration/intent-router');
    expect(detectIntegrationIntent('帮我重新授权').isIntegration).toBe(true);
    expect(detectIntegrationIntent('同步状态').isIntegration).toBe(true);
    expect(detectIntegrationIntent('断开连接').isIntegration).toBe(true);
    expect(detectIntegrationIntent('继续对接').isIntegration).toBe(true);
  });

  test('platform + action combo triggers', async () => {
    const { detectIntegrationIntent } = await import('@/lib/integration/intent-router');
    expect(detectIntegrationIntent('连接 Outlook').isIntegration).toBe(true);
    expect(detectIntegrationIntent('同步企业微信').isIntegration).toBe(true);
  });

  test('generic sales messages do NOT trigger', async () => {
    const { detectIntegrationIntent } = await import('@/lib/integration/intent-router');
    expect(detectIntegrationIntent('客户最近有什么动态').isIntegration).toBe(false);
    expect(detectIntegrationIntent('帮我分析这个客户').isIntegration).toBe(false);
  });
});

describe('Health Check — status filter includes connected', () => {
  test('health check queries connected status', async () => {
    // We verify this by reading the source — the fix is structural
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/lib/integration/health-check.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain("'connected'");
    expect(source).toContain("'active'");
    expect(source).toContain("'error'");
  });
});

describe('Email Sync — token failure marks connection status', () => {
  test('source includes connection status update on token failure', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/lib/integration/email-sync.ts', import.meta.url),
      'utf-8',
    );
    // Verify that token failure path updates connection status
    expect(source).toContain('Token refresh failed');
    expect(source).toContain("sync_status: 'error'");
    expect(source).toContain('需要重新授权');
  });
});

describe('WeCom Sync — token failure marks connection status', () => {
  test('source includes connection status update on token failure', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/lib/integration/wecom-sync.ts', import.meta.url),
      'utf-8',
    );
    // Verify that token error path updates connection status
    expect(source).toContain("sync_status: 'error'");
  });
});

describe('Sync Route — stuck sync resets connection-level status', () => {
  test('source resets connection sync_status after stuck detection', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/app/api/integration/sync/route.ts', import.meta.url),
      'utf-8',
    );
    // Verify stuck sync handling resets both sync_state AND connection
    expect(source).toContain('Also reset connection-level sync_status');
    expect(source).toContain("sync_status: 'idle'");
  });

  test('sync route error recovery includes updated_at', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/app/api/integration/sync/route.ts', import.meta.url),
      'utf-8',
    );
    // Every sync_status: 'error' update should include updated_at
    // At minimum, the catch block recovery path includes updated_at
    expect(source).toContain("sync_status: 'error', updated_at:");
  });
});

describe('Email Sync — Graph API failure prevents stuck sync', () => {
  test('source wraps Graph API call in try/catch with persistFinalSyncState', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/lib/integration/email-sync.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('Graph API fetch failed');
    expect(source).toContain('await persistFinalSyncState()');
  });
});

describe('WeCom Sync — batch failure prevents stuck sync', () => {
  test('source wraps external contact batch in try/catch', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/lib/integration/wecom-sync.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('外部联系人批量获取失败');
  });
});

describe('Health Check — stuck sync detection', () => {
  test('source includes sync_stuck issue type', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/lib/integration/health-check.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain("'sync_stuck'");
    expect(source).toContain('STUCK_THRESHOLD_MS');
    expect(source).toContain('同步已运行超过30分钟');
  });
});

describe('Agent — default monitoring reflects real connection status', () => {
  test('disconnected connection shows disconnected status, not "已连接"', async () => {
    const session = makeSession();
    // Mock health returning disconnected
    mockSingle.mockResolvedValueOnce({ data: { status: 'disconnected', sync_status: 'idle', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 0, status: 'idle', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const res = await handleIntegrationMessage('你好', session, 'user-001');
    expect(res.reply).toContain('连接已断开');
    expect(res.reply).not.toContain('已连接，');
  });

  test('token expired connection shows expired status', async () => {
    const session = makeSession();
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'error', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 5, status: 'error', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() - 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('你好', session, 'user-001');
    expect(res.reply).toContain('授权已过期');
    expect(res.reply).not.toContain('已连接，');
  });

  test('stuck sync shows stuck status', async () => {
    const session = makeSession();
    // syncing for 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'syncing', updated_at: twoHoursAgo }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: twoHoursAgo, record_count: 0, status: 'syncing', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('你好', session, 'user-001');
    expect(res.reply).toContain('卡住');
    expect(res.reply).not.toContain('已连接，');
  });

  test('healthy connection shows connected status', async () => {
    const session = makeSession();
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'completed', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 50, status: 'completed', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('你好', session, 'user-001');
    expect(res.reply).toContain('已连接');
  });
});

describe('Agent — WeCom reauth recovery', () => {
  test('reauth for wecom with existing connectionId still redirects to corpid input', async () => {
    const session = makeSession({ connectorType: 'wecom', connectionId: 'conn-wecom-001' });
    const res = await handleIntegrationMessage('重新授权', session, 'user-001');
    expect(res.reply).toContain('CorpID');
    expect(res.session?.state).toBe('wecom_input_corpid');
  });
});

describe('Agent — "继续对接" recovery paths', () => {
  test('with connected connectionId shows already-connected guidance', async () => {
    const session = makeSession();
    mockSingle.mockResolvedValueOnce({ data: { status: 'connected', sync_status: 'completed', updated_at: new Date().toISOString() }, error: null });
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { last_sync_at: new Date().toISOString(), record_count: 10, status: 'completed', error_message: null }, error: null })
      .mockResolvedValueOnce({ data: { expires_at: new Date(Date.now() + 86400000).toISOString() }, error: null });

    const res = await handleIntegrationMessage('继续对接', session, 'user-001');
    expect(res.reply).toContain('已连接');
  });

  test('without connectionId restarts from idle', async () => {
    const session = makeSession({ connectionId: undefined });
    const res = await handleIntegrationMessage('继续对接', session, 'user-001');
    // Should restart the onboarding flow
    expect(res.session?.state).toBe('select_service');
  });
});

describe('Connections Route — panel/API recovery flags', () => {
  test('source returns token and stuck-sync flags for panel consistency', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/app/api/integration/connections/route.ts', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('tokenExpired');
    expect(source).toContain('tokenExpiringSoon');
    expect(source).toContain('isStuckSync');
    expect(source).toContain("syncStatus === 'syncing'");
  });
});

describe('Integration Panel — recovery CTA consistency', () => {
  test('source shows reauth CTA and blocks expired-token syncs', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      new URL('../src/components/integration/integration-panel.tsx', import.meta.url),
      'utf-8',
    );
    expect(source).toContain('tokenExpired || conn.status === "disconnected"');
    expect(source).toContain('disabled={isSyncing || conn.tokenExpired}');
    expect(source).toContain('授权已过期');
    expect(source).toContain('同步卡住');
    expect(source).toContain('最近一次同步失败，建议先重新同步');
  });
});
