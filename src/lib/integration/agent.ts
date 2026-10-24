/**
 * Integration Agent — 状态机驱动的对接助手
 *
 * 状态流: idle → select_service → choose_auth_mode → oauth_flow
 *       → configure_scope → confirm_settings → initial_sync
 *       → report_results → ongoing_monitoring
 */

import { getUserContext } from '@/lib/permissions-server';
import { type OrgRole } from '@/lib/permissions';
import { getAccountDomains } from '@/lib/integration/domain-matcher';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { connectWeCom } from '@/lib/wecom/auth';
import { syncWeComData } from '@/lib/integration/wecom-sync';
import { syncEmails } from '@/lib/integration/email-sync';
import { safeCatch } from '@/lib/error-monitor';
import { getUnsupportedPlatform, getAllConnectors, getSyncObjectType, getConnectorLabel } from './connector-registry';

// ─── Types ──────────────────────────────────────────────────────────

export type AgentState =
  | 'idle'
  | 'check_permission'
  | 'select_service'
  | 'choose_auth_mode'
  | 'oauth_flow'
  | 'configure_scope'
  | 'domain_matching'
  | 'confirm_settings'
  | 'initial_sync'
  | 'report_results'
  | 'ongoing_monitoring'
  | 'wecom_input_corpid'
  | 'wecom_input_secret';

export type ConnectorType = 'outlook' | 'wecom';
export type AuthMode = 'org' | 'personal';

export interface IntegrationSession {
  state: AgentState;
  connectorType?: ConnectorType;
  authMode?: AuthMode;
  orgId: string;
  userId: string;
  connectionId?: string;
  matchedAccounts?: number;
  totalAccounts?: number;
  wecomCorpId?: string;
}

export interface AgentResponse {
  reply: string;
  session: IntegrationSession | null;
  actions?: AgentAction[];
  exitIntegration?: boolean;
}

export interface AgentAction {
  type: 'select_service' | 'select_auth_mode' | 'oauth_redirect' | 'confirm' | 'info';
  label: string;
  value?: string;
  url?: string;
}

// ─── Permission check ───────────────────────────────────────────────

function canUseIntegrationAgent(orgRole: OrgRole): boolean {
  return orgRole === 'owner' || orgRole === 'admin';
}

// ─── State handlers ─────────────────────────────────────────────────

function handleIdle(session: IntegrationSession): AgentResponse {
  return {
    reply:
      '你好！我是对接助手，可以帮你把外部工具连上 Closr，让客户互动数据自动流入。\n\n' +
      '目前可以直接对接：\n' +
      '- 📧 **Outlook 邮箱** — 同步邮件，AI 自动解读客户意图\n' +
      '- 💬 **企业微信** — 同步外部联系人、客户群、沟通记录\n\n' +
      '如果你用的是其他平台（Gmail、Salesforce、HubSpot、钉钉等），直接告诉我，我来提供定制对接方案。',
    session: { ...session, state: 'select_service' },
    actions: [
      { type: 'select_service', label: '📧 Outlook 邮箱', value: 'outlook' },
      { type: 'select_service', label: '💬 企业微信', value: 'wecom' },
      { type: 'select_service', label: '🔧 其他平台', value: 'other' },
    ],
  };
}

function handleSelectService(
  message: string,
  session: IntegrationSession,
): AgentResponse {
  const lower = message.toLowerCase();
  let connector: ConnectorType | undefined;
  if (lower.includes('outlook') || lower.includes('邮箱')) {
    connector = 'outlook';
  } else if (lower.includes('企业微信') || lower.includes('wecom')) {
    connector = 'wecom';
  }

  // 检测其他平台名称，给出定制方案（使用 connector registry）
  if (!connector) {
    const supportedConnectors = getAllConnectors();
    const supportedList = supportedConnectors.map((c) => `${c.icon} **${c.label}**`).join(' 和 ');
    const supportedActions = supportedConnectors.map((c) => ({
      type: 'select_service' as const,
      label: `${c.icon} ${c.label}`,
      value: c.id,
    }));

    // 尝试匹配已知但未支持的平台
    const unsupported = getUnsupportedPlatform(lower);
    if (unsupported) {
      const statusLabel = unsupported.status === 'planned' ? '已列入路线图' : '评估中';
      return {
        reply: `**${unsupported.label}** ${unsupported.roadmapNote}\n\n` +
          `现阶段 Integration Agent 直接支持 ${supportedList}。（${statusLabel}）\n` +
          '我可以先记录为优先对接需求。\n\n或者你也可以先对接已支持的服务：',
        session,
        actions: supportedActions,
      };
    }

    // 如果是"其他平台"按钮或完全未知的平台
    if (lower.includes('其他') || lower.includes('other')) {
      return {
        reply: '请告诉我你想对接什么平台，我来评估可行性并提供方案。\n\n' +
          '常见的比如：Gmail、Salesforce、HubSpot、钉钉、Zoho、飞书、Slack 等。',
        session,
      };
    }

    // 未知平台 — 通用评估回复
    return {
      reply: `收到，你想对接 **${message.trim()}**。\n\n` +
        '我需要了解一下这个平台的 API 能力，评估后给你一个对接方案。\n' +
        '你能告诉我更多信息吗？比如：\n' +
        '- 这是什么类型的工具？（CRM、邮箱、即时通讯、其他）\n' +
        '- 是否有开放 API 或集成文档？\n\n' +
        '或者你也可以先对接已支持的服务：',
      session,
      actions: supportedActions,
    };
  }

  if (connector === 'wecom') {
    return {
      reply:
        '好的，企业微信对接需要以下信息：\n\n' +
        '1️⃣ **企业 ID (CorpID)** — 在企业微信管理后台 → 我的企业 → 企业信息 里\n' +
        '2️⃣ **应用 Secret** — 需要先创建一个自建应用：\n' +
        '   管理后台 → 应用管理 → 自建 → 创建应用 → 获取 Secret\n\n' +
        '⚠️ 还需要配置 **IP 白名单**：\n' +
        '   自建应用 → 企业可信IP → 添加 Closr 服务器 IP\n\n' +
        '请提供你的 **CorpID**：\n\n' +
        '_💡 随时输入"退出"可返回普通对话_',
      session: { ...session, state: 'wecom_input_corpid', connectorType: 'wecom' },
    };
  }

  const label = 'Outlook 邮箱';
  return {
    reply:
      `好的，准备对接 **${label}**。\n\n` +
      '请选择授权方式：\n' +
      '- **组织级授权** — 管理员统一授权，全员邮件自动同步\n' +
      '- **个人授权** — 每位成员独立授权自己的账号\n\n' +
      '推荐组织级授权，管理更方便。',
    session: { ...session, state: 'choose_auth_mode', connectorType: connector },
    actions: [
      { type: 'select_auth_mode', label: '组织级授权', value: 'org' },
      { type: 'select_auth_mode', label: '个人授权', value: 'personal' },
    ],
  };
}

function handleChooseAuthMode(
  message: string,
  session: IntegrationSession,
): AgentResponse {
  const lower = message.toLowerCase();
  let mode: AuthMode | undefined;
  if (lower.includes('组织') || lower.includes('org')) {
    mode = 'org';
  } else if (lower.includes('个人') || lower.includes('personal')) {
    mode = 'personal';
  }

  if (!mode) {
    return {
      reply: '请选择授权方式：**组织级授权** 或 **个人授权**',
      session,
      actions: [
        { type: 'select_auth_mode', label: '组织级授权', value: 'org' },
        { type: 'select_auth_mode', label: '个人授权', value: 'personal' },
      ],
    };
  }

  const modeLabel = mode === 'org' ? '组织级' : '个人';
  const oauthUrl = `/api/integration/oauth/microsoft?mode=${mode}`;

  return {
    reply:
      `已选择 **Outlook** + **${modeLabel}授权**。\n\n` +
      '点击下方按钮完成 Microsoft 授权，授权完成后会自动返回。\n\n' +
      (mode === 'org'
        ? '> 组织级授权需要 Azure AD 管理员权限，授权后全员邮件将自动同步。'
        : '> 个人授权只同步你自己的邮箱，其他成员需各自授权。'),
    session: { ...session, state: 'oauth_flow', authMode: mode },
    actions: [
      {
        type: 'oauth_redirect',
        label: `前往 Microsoft ${modeLabel}授权`,
        value: mode,
        url: oauthUrl,
      },
    ],
  };
}

async function handleOAuthFlow(
  message: string,
  session: IntegrationSession,
): Promise<AgentResponse> {
  const lower = message.toLowerCase();

  // 检查用户是否已完成授权（通过查询 DB）
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: conn } = await supabase
      .from('integration_connections')
      .select('id, status')
      .eq('org_id', session.orgId)
      .eq('connector_id', 'outlook')
      .single();

    if (conn?.status === 'connected') {
      return {
        reply:
          '授权成功！Outlook 已连接。\n\n' +
          '接下来需要配置同步范围 — 选择要监控哪些客户的邮件往来。',
        session: {
          ...session,
          state: 'configure_scope',
          connectionId: conn.id,
        },
      };
    }
  }

  // 用户可能还没点按钮，或者授权失败
  if (lower.includes('完成') || lower.includes('done') || lower.includes('已授权')) {
    return {
      reply:
        '未检测到授权成功。请确认：\n' +
        '1. 已点击上方授权按钮\n' +
        '2. 在 Microsoft 页面完成了授权\n' +
        '3. 页面已重定向回 Closr\n\n' +
        '如需重新授权，请点击下方按钮：',
      session,
      actions: [
        {
          type: 'oauth_redirect',
          label: '重新授权',
          value: session.authMode ?? 'personal',
          url: `/api/integration/oauth/microsoft?mode=${session.authMode ?? 'personal'}`,
        },
      ],
    };
  }

  // 默认提示
  const oauthUrl = `/api/integration/oauth/microsoft?mode=${session.authMode ?? 'personal'}`;
  return {
    reply: '请点击下方按钮完成 Microsoft 授权：',
    session,
    actions: [
      {
        type: 'oauth_redirect',
        label: '前往 Microsoft 授权',
        value: session.authMode ?? 'personal',
        url: oauthUrl,
      },
    ],
  };
}

async function handleConfigureScope(
  session: IntegrationSession,
): Promise<AgentResponse> {
  // 获取可匹配的 Account 域名
  const domainMap = await getAccountDomains(session.orgId);
  const totalAccounts = domainMap.size;

  if (totalAccounts === 0) {
    return {
      reply:
        '当前系统中没有带域名的客户 Account。\n\n' +
        '建议先在客户管理中添加客户网站信息，这样同步的邮件才能自动关联到对应客户。\n\n' +
        '是否跳过域名匹配，先同步所有邮件？',
      session: {
        ...session,
        state: 'confirm_settings',
        matchedAccounts: 0,
        totalAccounts: 0,
      },
      actions: [
        { type: 'confirm', label: '跳过，先同步所有邮件', value: 'skip' },
        { type: 'confirm', label: '稍后再说', value: 'later' },
      ],
    };
  }

  // 列出前 10 个可匹配的域名
  const domains = Array.from(domainMap.keys()).slice(0, 10);
  const domainList = domains.map((d) => `  - ${d}`).join('\n');
  const moreText = totalAccounts > 10 ? `\n  - ...等共 ${totalAccounts} 个客户域名` : '';

  return {
    reply:
      `已检测到 **${totalAccounts}** 个客户有域名信息，可自动匹配邮件：\n\n` +
      `${domainList}${moreText}\n\n` +
      '同步的邮件会自动关联到对应客户。\n' +
      '确认开始同步？',
    session: {
      ...session,
      state: 'confirm_settings',
      matchedAccounts: totalAccounts,
      totalAccounts,
    },
    actions: [
      { type: 'confirm', label: '确认，开始同步', value: 'confirm' },
      { type: 'confirm', label: '稍后再说', value: 'later' },
    ],
  };
}

async function handleConfirmSettings(
  message: string,
  session: IntegrationSession,
): Promise<AgentResponse> {
  const lower = message.toLowerCase();
  const isWecom = session.connectorType === 'wecom';
  const serviceLabel = isWecom ? '企业微信' : 'Outlook 邮箱';

  if (lower.includes('稍后') || lower.includes('later') || lower.includes('取消')) {
    return {
      reply:
        '好的，你可以随时回来继续配置。\n' +
        `${serviceLabel}连接已保留，下次直接输入"继续对接"即可。`,
      session: { ...session, state: 'ongoing_monitoring' },
    };
  }

  const nextSession = { ...session, state: 'initial_sync' as const };

  try {
    if (isWecom) {
      const syncResponse = await handleInitialSync(nextSession);
      return {
        reply:
          '**同步配置确认**\n\n' +
          `- 服务：企业微信\n` +
          `- 同步范围：外部联系人 + 客户群\n\n` +
          '正在启动初始同步...\n' +
          '> 首次同步可能需要几分钟，完成后会通知你。\n\n' +
          syncResponse.reply,
        session: syncResponse.session,
      };
    }

    // Outlook 路径
    const accountInfo = session.matchedAccounts
      ? `${session.matchedAccounts} 个客户域名匹配`
      : '全量同步（无域名过滤）';

    const syncResponse = await handleInitialSync(nextSession);

    return {
      reply:
        '**同步配置确认**\n\n' +
        `- 服务：Outlook 邮箱\n` +
        `- 授权模式：${session.authMode === 'org' ? '组织级' : '个人'}\n` +
        `- 域名匹配：${accountInfo}\n\n` +
        '正在启动初始同步...\n' +
        '> 首次同步可能需要几分钟，完成后会通知你。\n\n' +
        syncResponse.reply,
      session: syncResponse.session,
    };
  } catch (error) {
    console.error('[integration-agent] initial sync bootstrap failed:', error);

    return {
      reply:
        '**同步配置确认**\n\n' +
        `- 服务：${isWecom ? '企业微信' : 'Outlook 邮箱'}\n` +
        (isWecom
          ? '- 同步范围：外部联系人 + 客户群\n\n'
          : `- 授权模式：${session.authMode === 'org' ? '组织级' : '个人'}\n`) +
        '配置已保存。\n' +
        '首次同步暂时没有自动启动，你可以稍后输入“重新同步”或“同步状态”继续处理。',
      session: { ...session, state: 'ongoing_monitoring' },
    };
  }
}

async function handleInitialSync(
  session: IntegrationSession,
): Promise<AgentResponse> {
  const isWecom = session.connectorType === 'wecom';
  const connectorId = session.connectorType ?? 'outlook';
  const objectType = getSyncObjectType(connectorId);
  const serviceLabel = isWecom ? '企业微信联系人' : 'Outlook 邮件';

  // 在 DB 中标记同步状态
  const supabase = getSupabaseAdmin();
  if (supabase && session.connectionId) {
    // 更新 connection 的 sync_status
    await supabase
      .from('integration_connections')
      .update({
        sync_status: 'syncing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.connectionId);

    // 创建/更新 sync_state 记录
    await supabase
      .from('integration_sync_state')
      .upsert(
        {
          connection_id: session.connectionId,
          object_type: objectType,
          status: 'syncing',
          last_sync_at: new Date().toISOString(),
        },
        { onConflict: 'connection_id,object_type' },
      );

    // 写通知
    await supabase.from('agent_notifications').insert({
      org_id: session.orgId,
      user_id: session.userId,
      type: 'sync_started',
      priority: 'medium',
      title: `${serviceLabel}同步已启动`,
      body: '首次同步正在进行中，完成后会通知你。',
    });

    // fire-and-forget 启动同步
    if (isWecom) {
      syncWeComData(session.connectionId, session.orgId).catch(
        safeCatch('integration-agent', 'wecom-initial-sync', { connectionId: session.connectionId, orgId: session.orgId }),
      );
    } else {
      syncEmails(session.connectionId, session.orgId, { userId: session.userId }).catch(
        safeCatch('integration-agent', 'outlook-initial-sync', { connectionId: session.connectionId, orgId: session.orgId }),
      );
    }
  }

  const description = isWecom
    ? '后台正在拉取外部联系人和客户群数据，完成后会通知你。'
    : '后台正在拉取邮件并进行 AI 解读，完成后会通知你。';

  return {
    reply:
      '同步任务已启动！\n\n' +
      `${description}\n` +
      '你可以继续使用 Closr，同步在后台进行。',
    session: { ...session, state: 'report_results' },
  };
}

async function handleReportResults(session: IntegrationSession): Promise<AgentResponse> {
  const isWecom = session.connectorType === 'wecom';
  const serviceLabel = isWecom ? '企业微信' : 'Outlook';

  // Proactive health check on transition to monitoring
  let healthNote = '';
  if (session.connectionId) {
    const health = await queryConnectionHealth(session.connectionId, session.connectorType ?? 'outlook');
    if (health) {
      if (health.syncStatus === 'completed') {
        healthNote = `\n\n✅ 同步已完成，共 ${health.recordCount} 条记录。`;
      } else if (health.syncStatus === 'error') {
        healthNote = `\n\n❌ 同步出错${health.errorMessage ? `：${health.errorMessage}` : ''}。输入"重新同步"可重试。`;
      }
    }
  }

  return {
    reply:
      `${serviceLabel} 同步正在后台进行中。\n` +
      '完成后你会在通知中心看到同步报告。\n\n' +
      '如需查看同步状态，输入"同步状态"。' +
      healthNote,
    session: { ...session, state: 'ongoing_monitoring' },
  };
}

/**
 * Query real-time connection health from DB.
 * Returns truthful status including stuck sync detection and token expiry.
 */
async function queryConnectionHealth(
  connectionId: string,
  connectorType: ConnectorType,
): Promise<{
  connectionStatus: string | null;
  syncStatus: string | null;
  lastSyncAt: string | null;
  recordCount: number;
  errorMessage: string | null;
  tokenExpiresAt: string | null;
  tokenExpired: boolean;
  tokenExpiringSoon: boolean;
  isStuckSync: boolean;
} | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !connectionId) return null;

  const objectType = getSyncObjectType(connectorType);

  const [connRes, syncRes, tokenRes] = await Promise.all([
    supabase
      .from('integration_connections')
      .select('status, sync_status, last_sync_at, updated_at')
      .eq('id', connectionId)
      .single(),
    supabase
      .from('integration_sync_state')
      .select('last_sync_at, record_count, status, error_message')
      .eq('connection_id', connectionId)
      .eq('object_type', objectType)
      .maybeSingle(),
    supabase
      .from('integration_tokens')
      .select('expires_at')
      .eq('connection_id', connectionId)
      .maybeSingle(),
  ]);

  const conn = connRes.data;
  const syncState = syncRes.data;
  const token = tokenRes.data;

  if (!conn) return null;

  const now = Date.now();
  const expiresAt = token?.expires_at ? new Date(token.expires_at as string).getTime() : null;
  const tokenExpired = expiresAt !== null && expiresAt < now;
  const tokenExpiringSoon = expiresAt !== null && !tokenExpired && expiresAt - now < 3 * 24 * 60 * 60 * 1000;

  // Stuck sync detection: syncing for > 30 minutes
  const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
  const lastSyncAt = (syncState?.last_sync_at as string | undefined) ?? (conn.last_sync_at as string | undefined) ?? null;
  const syncStartedAt = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
  const isSyncing = (syncState?.status as string) === 'syncing' || (conn.sync_status as string) === 'syncing';
  const isStuckSync = isSyncing && syncStartedAt > 0 && (now - syncStartedAt) > STUCK_THRESHOLD_MS;

  return {
    connectionStatus: conn.status as string | null,
    syncStatus: (syncState?.status as string) ?? (conn.sync_status as string) ?? null,
    lastSyncAt,
    recordCount: (syncState?.record_count as number) ?? 0,
    errorMessage: (syncState?.error_message as string) ?? null,
    tokenExpiresAt: (token?.expires_at as string) ?? null,
    tokenExpired,
    tokenExpiringSoon,
    isStuckSync,
  };
}

/**
 * Format connection health into a human-readable status block.
 */
function formatHealthStatus(
  serviceLabel: string,
  health: NonNullable<Awaited<ReturnType<typeof queryConnectionHealth>>>,
): string {
  const statusMap: Record<string, string> = {
    completed: '✅ 已完成',
    syncing: '🔄 同步中',
    partial: '⚠️ 部分完成',
    error: '❌ 出错',
    idle: '⏸️ 空闲',
  };
  const syncLabel = statusMap[health.syncStatus ?? ''] ?? (health.syncStatus ?? '未知');
  const lastSync = health.lastSyncAt
    ? new Date(health.lastSyncAt).toLocaleString('zh-CN')
    : '从未';

  let text = `**${serviceLabel} 连接状态**\n\n` +
    `- 同步：${syncLabel}\n` +
    `- 最后同步：${lastSync}\n` +
    `- 已同步记录：${health.recordCount} 条\n`;

  if (health.errorMessage) {
    text += `- 错误：${health.errorMessage}\n`;
  }

  // Proactive warnings
  const warnings: string[] = [];
  if (health.tokenExpired) {
    warnings.push('⚠️ **授权已过期** — 需要重新授权才能继续同步');
  } else if (health.tokenExpiringSoon) {
    warnings.push('⚠️ 授权即将在3天内过期，建议尽快重新授权');
  }
  if (health.isStuckSync) {
    warnings.push('⚠️ **同步似乎卡住了**（已运行超过30分钟）— 建议输入"重新同步"重试');
  }
  if (health.connectionStatus === 'disconnected') {
    warnings.push('⚠️ 连接已断开，需要重新授权');
  }

  if (warnings.length > 0) {
    text += '\n' + warnings.join('\n') + '\n';
  }

  return text;
}

async function handleOngoingMonitoring(
  message: string,
  session: IntegrationSession,
): Promise<AgentResponse> {
  const lower = message.toLowerCase();
  const isWecom = session.connectorType === 'wecom';
  const connectorId = session.connectorType ?? 'outlook';
  const serviceLabel = getConnectorLabel(connectorId);
  const syncDesc = isWecom ? '联系人同步' : '邮件同步';

  // ── "继续对接" — 用户想恢复之前中断的流程 ──────────────────
  if (lower.includes('继续对接')) {
    // Re-check connection status and guide accordingly
    if (session.connectionId) {
      const health = await queryConnectionHealth(session.connectionId, connectorId);
      if (health?.connectionStatus === 'connected') {
        return {
          reply: `${serviceLabel} 已连接，当前状态正常。\n\n你可以输入"同步状态"查看详情，或"重新同步"触发手动同步。`,
          session,
        };
      }
    }
    // No connection or disconnected — restart flow
    return handleIdle({ ...session, state: 'idle' });
  }

  // 断开确认/取消处理（must come before the disconnect prompt check below）
  if (lower.includes('disconnect_confirm') || lower === '确认断开') {
    const supabase = getSupabaseAdmin();
    if (supabase && session.connectionId) {
      await supabase
        .from('integration_connections')
        .update({ status: 'disconnected', sync_status: 'idle', updated_at: new Date().toISOString() })
        .eq('id', session.connectionId);
    }
    return {
      reply: `已断开 ${serviceLabel} 连接。你可以随时重新对接。`,
      session: null,
      exitIntegration: true,
    };
  }
  if (lower.includes('disconnect_cancel') || lower === '取消') {
    return {
      reply: '好的，保持连接不变。',
      session,
    };
  }

  // ── 断开连接 ─────────────────────────────────────────────────
  if (
    (lower.includes('断开') || lower.includes('disconnect') || lower.includes('删除连接')) &&
    session.connectionId
  ) {
    return {
      reply:
        `确定要断开 **${serviceLabel}** 连接吗？\n\n` +
        '断开后：\n' +
        '- 停止自动同步\n' +
        '- 已同步的数据会保留\n' +
        '- 重新连接需要再次授权\n\n' +
        '请确认操作：',
      session,
      actions: [
        { type: 'confirm', label: '确认断开', value: 'disconnect_confirm' },
        { type: 'confirm', label: '取消', value: 'disconnect_cancel' },
      ],
    };
  }

  // ── 重新授权 ─────────────────────────────────────────────────
  if (lower.includes('重新授权') || lower.includes('reauthorize') || lower.includes('续期')) {
    if (isWecom) {
      return {
        reply:
          '企业微信需要重新提供 CorpID 和 Secret 来刷新授权。\n\n请提供你的 **CorpID**：',
        session: { ...session, state: 'wecom_input_corpid' },
      };
    }
    const authMode = session.authMode ?? 'personal';
    const oauthUrl = `/api/integration/oauth/microsoft?mode=${authMode}`;
    return {
      reply:
        `需要重新完成 Microsoft 授权（${authMode === 'org' ? '组织级' : '个人'}模式）。\n\n` +
        '点击下方按钮前往授权：',
      session: { ...session, state: 'oauth_flow' },
      actions: [
        { type: 'oauth_redirect', label: '重新授权 Microsoft', value: authMode, url: oauthUrl },
      ],
    };
  }

  // 解析历史同步请求：'拉过去3个月的' / '同步更多历史邮件' / '同步过去N天/周/月'
  const historyMatch = lower.match(
    /(?:拉|同步|获取)(?:过去|最近)?\s*(\d+)\s*(天|周|月|个月|day|week|month)/,
  );

  if (historyMatch && !isWecom) {
    if (!session.connectionId) {
      return {
        reply: `未找到 ${serviceLabel} 的活跃连接，无法拉取历史邮件。请先完成对接流程。`,
        session,
      };
    }
    const amount = parseInt(historyMatch[1], 10);
    const unit = historyMatch[2];

    let days: number;
    if (unit === '月' || unit === '个月' || unit === 'month') {
      days = amount * 30;
    } else if (unit === '周' || unit === 'week') {
      days = amount * 7;
    } else {
      days = amount;
    }

    // Check token before attempting sync
    const health = await queryConnectionHealth(session.connectionId, session.connectorType ?? 'outlook');
    if (health?.tokenExpired) {
      return {
        reply: '⚠️ 授权已过期，无法拉取历史邮件。请先输入"重新授权"刷新凭证。',
        session,
      };
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Fire-and-forget 历史同步
    syncEmails(session.connectionId, session.orgId, { since }).catch(
      safeCatch('integration-agent', 'email-history-sync', { connectionId: session.connectionId, orgId: session.orgId, since: since.toISOString() }),
    );

    return {
      reply:
        `好的，正在拉取过去 **${amount} ${unit}** 的邮件历史（从 ${since.toLocaleDateString('zh-CN')} 开始）。\n\n` +
        '这可能需要几分钟，完成后会通知你。',
      session,
    };
  }

  // 手动触发同步
  if (
    lower.includes('重新同步') || lower.includes('手动同步') || lower.includes('立即同步')
  ) {
    if (!session.connectionId) {
      return {
        reply: `未找到 ${serviceLabel} 的活跃连接。请先完成对接流程，或输入"继续对接"恢复。`,
        session,
      };
    }
    // Check token before attempting sync
    const health = await queryConnectionHealth(session.connectionId, session.connectorType ?? 'outlook');
    if (health?.tokenExpired) {
      return {
        reply: '⚠️ 授权已过期，无法触发同步。请先输入"重新授权"刷新凭证。',
        session,
      };
    }

    // Reset stuck sync state before retrying
    if (health?.isStuckSync) {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const objectType = getSyncObjectType(session.connectorType ?? 'outlook');
        await supabase
          .from('integration_sync_state')
          .update({ status: 'idle', error_message: '上次同步超时，已重置' })
          .eq('connection_id', session.connectionId)
          .eq('object_type', objectType);
        // Also reset connection-level sync_status for consistency
        await supabase
          .from('integration_connections')
          .update({ sync_status: 'idle', updated_at: new Date().toISOString() })
          .eq('id', session.connectionId);
      }
    }

    if (isWecom) {
      syncWeComData(session.connectionId, session.orgId).catch(
        safeCatch('integration-agent', 'wecom-manual-sync', { connectionId: session.connectionId, orgId: session.orgId }),
      );
    } else {
      syncEmails(session.connectionId, session.orgId).catch(
        safeCatch('integration-agent', 'email-manual-sync', { connectionId: session.connectionId, orgId: session.orgId }),
      );
    }

    return {
      reply: `已触发 ${serviceLabel} ${syncDesc}，后台处理中。`,
      session,
    };
  }

  // 查询同步状态（explicit request or fallback）
  if (lower.includes('同步状态') || lower.includes('状态') || lower.includes('health') || lower.includes('健康')) {
    if (!session.connectionId) {
      return {
        reply: `未找到 ${serviceLabel} 的活跃连接，无法查询状态。请先完成对接流程。`,
        session,
      };
    }
    const health = await queryConnectionHealth(session.connectionId, session.connectorType ?? 'outlook');
    if (health) {
      return {
        reply: formatHealthStatus(serviceLabel, health),
        session,
      };
    }
  }

  // ── 默认：自动查询真实状态并给出上下文提示 ──────────────────
  let statusLine = `${serviceLabel} 已连接，${syncDesc}持续运行中。`;
  let healthSuffix = '';
  if (session.connectionId) {
    const health = await queryConnectionHealth(session.connectionId, session.connectorType ?? 'outlook');
    if (health) {
      // Adjust the opening status line to reflect actual state
      if (health.tokenExpired) {
        statusLine = `${serviceLabel} 授权已过期，${syncDesc}已暂停。`;
        healthSuffix = '\n\n⚠️ **授权已过期。** 请输入"重新授权"恢复同步。';
      } else if (health.connectionStatus === 'disconnected') {
        statusLine = `${serviceLabel} 连接已断开。`;
        healthSuffix = '\n\n⚠️ **连接已断开。** 请输入"重新授权"重新连接。';
      } else if (health.isStuckSync) {
        statusLine = `${serviceLabel} 同步似乎卡住了。`;
        healthSuffix = '\n\n⚠️ **同步已运行超过30分钟。** 请输入"重新同步"重试。';
      } else if (health.syncStatus === 'error') {
        statusLine = `${serviceLabel} 最近一次同步出错。`;
        healthSuffix = `\n\n⚠️ **同步出错${health.errorMessage ? `：${health.errorMessage}` : ''}。** 请输入"重新同步"重试。`;
      } else if (health.tokenExpiringSoon) {
        healthSuffix = '\n\n💡 授权即将过期，建议尽快输入"重新授权"续期。';
      }
    }
  }

  return {
    reply:
      `${statusLine}\n\n` +
      '你可以：\n' +
      '- 输入"同步状态"查看最近同步情况\n' +
      '- 输入"断开连接"停止同步\n' +
      '- 输入"重新同步"手动触发同步\n' +
      '- 输入"重新授权"刷新凭证\n' +
      (!isWecom ? '- 输入"拉过去3个月的"获取历史邮件\n' : '') +
      healthSuffix,
    session,
  };
}

// ─── WeCom state handlers ───────────────────────────────────────────

function handleWeComInputCorpId(
  message: string,
  session: IntegrationSession,
): AgentResponse {
  const corpId = message.trim();

  // 基本格式校验：企业微信 CorpID 以 ww 开头
  if (!corpId || corpId.length < 6) {
    return {
      reply: 'CorpID 格式不正确，请重新输入。\n企业微信 CorpID 通常以 `ww` 开头，如 `ww1234567890abcdef`。',
      session,
    };
  }

  return {
    reply:
      `收到，CorpID: \`${corpId}\`\n\n` +
      '现在请提供应用的 **Secret**：\n' +
      '> 在企业微信管理后台 → 应用管理 → 你的自建应用 → Secret',
    session: { ...session, state: 'wecom_input_secret', wecomCorpId: corpId },
  };
}

async function handleWeComInputSecret(
  message: string,
  session: IntegrationSession,
): Promise<AgentResponse> {
  const corpSecret = message.trim();

  if (!corpSecret || corpSecret.length < 10) {
    return {
      reply: 'Secret 格式不正确，请重新输入。\n应用 Secret 是一串较长的字符串。',
      session,
    };
  }

  const corpId = session.wecomCorpId;
  if (!corpId) {
    return {
      reply: '缺少 CorpID 信息，请重新开始对接流程。',
      session: { ...session, state: 'idle' },
    };
  }

  // 直接验证连接（不经过中间状态）
  return handleWeComConnect(corpSecret, session);
}

/**
 * 处理 wecom_input_secret 状态：收到 secret 后立即验证连接
 */
async function handleWeComConnect(
  corpSecret: string,
  session: IntegrationSession,
): Promise<AgentResponse> {
  const corpId = session.wecomCorpId!;

  const result = await connectWeCom(
    session.orgId,
    session.userId,
    corpId,
    corpSecret,
  );

  if (!result.success) {
    return {
      reply:
        `❌ 连接失败: ${result.error}\n\n` +
        '请检查：\n' +
        '1. CorpID 和 Secret 是否正确\n' +
        '2. IP 白名单是否已配置\n' +
        '3. 应用是否有「通讯录」和「客户联系」权限\n\n' +
        '要重新输入 CorpID 吗？',
      session: { ...session, state: 'wecom_input_corpid', wecomCorpId: undefined },
    };
  }

  // 获取 connectionId
  const supabase = getSupabaseAdmin();
  let connectionId: string | undefined;
  if (supabase) {
    const { data: conn } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('org_id', session.orgId)
      .eq('connector_id', 'wecom')
      .single();
    connectionId = conn?.id as string | undefined;
  }

  const memberInfo = result.memberCount
    ? `检测到 **${result.memberCount}** 个企业成员`
    : '成员信息获取中';
  const deptInfo = result.departmentCount
    ? `**${result.departmentCount}** 个部门`
    : '';
  const summary = [memberInfo, deptInfo].filter(Boolean).join('，');

  return {
    reply:
      '✅ **连接成功！**\n\n' +
      `${summary}。\n\n` +
      '接下来我会同步你的外部联系人（客户）数据。\n' +
      '这可能需要几分钟，取决于联系人数量。\n\n' +
      '确认开始同步？',
    session: {
      ...session,
      state: 'confirm_settings',
      connectionId,
      connectorType: 'wecom',
    },
    actions: [
      { type: 'confirm', label: '开始同步', value: 'confirm' },
      { type: 'confirm', label: '稍后再说', value: 'later' },
    ],
  };
}

// ─── Main handler ───────────────────────────────────────────────────

export async function handleIntegrationMessage(
  message: string,
  session: IntegrationSession | null,
  userId: string,
): Promise<AgentResponse> {
  // 1. 获取权限上下文
  const userCtx = await getUserContext(userId);
  if (!userCtx) {
    return {
      reply: '无法获取用户权限信息，请稍后再试。',
      session: session ?? { state: 'idle', orgId: '', userId },
    };
  }

  // 2. 权限检查
  if (!canUseIntegrationAgent(userCtx.orgRole)) {
    return {
      reply:
        '对接功能仅限 **管理员** 或 **组织拥有者** 使用。\n' +
        '请联系你的管理员开通对接服务。',
      session: session ?? { state: 'idle', orgId: userCtx.orgId, userId },
    };
  }

  // 3. 初始化 session
  const currentSession: IntegrationSession = session ?? {
    state: 'idle',
    orgId: userCtx.orgId,
    userId,
  };

  // 4. 退出检测 — 用户想离开对接话题
  const exitKeywords = ['退出', '取消', '返回', '算了', '不用了', '回到', 'cancel', 'exit', 'quit', '不对接了'];
  const wantsExit = exitKeywords.some(k => message.toLowerCase().includes(k));
  if (wantsExit && currentSession.state !== 'idle') {
    return {
      reply: '好的，已退出对接流程。你可以随时回来继续。\n\n有什么其他问题我可以帮你？',
      session: null,
      exitIntegration: true,
    };
  }

  // 5. 状态机路由
  switch (currentSession.state) {
    case 'idle':
    case 'check_permission': {
      // 如果用户首次消息就包含了平台名称，直接跳到服务选择处理
      const lower = message.toLowerCase();
      const mentionsPlatform =
        lower.includes('outlook') || lower.includes('邮箱') ||
        lower.includes('企业微信') || lower.includes('wecom') ||
        lower.includes('gmail') || lower.includes('salesforce') ||
        lower.includes('hubspot') || lower.includes('钉钉') ||
        lower.includes('zoho') || lower.includes('飞书') || lower.includes('slack');
      if (mentionsPlatform) {
        return handleSelectService(message, { ...currentSession, state: 'select_service' });
      }
      return handleIdle(currentSession);
    }

    case 'select_service':
      return handleSelectService(message, currentSession);

    case 'choose_auth_mode':
      return handleChooseAuthMode(message, currentSession);

    case 'oauth_flow':
      return handleOAuthFlow(message, currentSession);

    case 'configure_scope':
    case 'domain_matching':
      return handleConfigureScope(currentSession);

    case 'confirm_settings':
      return handleConfirmSettings(message, currentSession);

    case 'initial_sync':
      return handleInitialSync(currentSession);

    case 'report_results':
      return handleReportResults(currentSession) as Promise<AgentResponse>;

    case 'ongoing_monitoring':
      return handleOngoingMonitoring(message, currentSession);

    case 'wecom_input_corpid':
      return handleWeComInputCorpId(message, currentSession);

    case 'wecom_input_secret':
      return handleWeComInputSecret(message, currentSession);

    default:
      return handleIdle(currentSession);
  }
}
