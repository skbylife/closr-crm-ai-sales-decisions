"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  MessageSquare,
  RefreshCw,
  Unlink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Plug,
} from "lucide-react";
import { appConfirm } from '@/lib/confirm-store';
import {
  isConnectorSupported,
  getConnectorLabel,
  type ConnectorId,
} from "@/lib/integration/connector-registry";

// ─── Types ──────────────────────────────────────────────────────────

interface ConnectionInfo {
  id: string;
  connectorId: string;
  status: string;
  syncStatus: string;
  lastSyncAt: string | null;
  connectedAt: string | null;
  recordCount: number;
  errorMessage: string | null;
  syncObjectType: string | null;
  syncStateStatus: string | null;
  tokenExpiresAt: string | null;
  tokenExpired: boolean;
  tokenExpiringSoon: boolean;
  isStuckSync?: boolean;
}

// ─── Constants (icon/style mapping — labels come from connector-registry) ──

const CONNECTOR_STYLE: Record<
  string,
  { icon: typeof Mail; colorClass: string; bgClass: string }
> = {
  outlook: {
    icon: Mail,
    colorClass: "text-blue-600",
    bgClass: "bg-blue-50 dark:bg-blue-900/20",
  },
  wecom: {
    icon: MessageSquare,
    colorClass: "text-emerald-600",
    bgClass: "bg-emerald-50 dark:bg-emerald-900/20",
  },
};

function getConnectorConfig(connectorId: string) {
  const style = CONNECTOR_STYLE[connectorId] ?? {
    icon: Plug,
    colorClass: "text-muted",
    bgClass: "bg-gray-50 dark:bg-gray-900/20",
  };
  const label = isConnectorSupported(connectorId)
    ? getConnectorLabel(connectorId as ConnectorId)
    : connectorId;
  return { label, ...style };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  connected: {
    label: "已连接",
    icon: CheckCircle2,
    className: "text-positive",
  },
  active: {
    label: "已连接",
    icon: CheckCircle2,
    className: "text-positive",
  },
  disconnected: {
    label: "已断开",
    icon: XCircle,
    className: "text-muted",
  },
  error: {
    label: "异常",
    icon: AlertTriangle,
    className: "text-danger",
  },
};

const SYNC_STATUS_LABEL: Record<string, string> = {
  completed: "已完成",
  syncing: "同步中...",
  partial: "部分完成",
  error: "同步出错",
  idle: "空闲",
};

// ─── Component ──────────────────────────────────────────────────────

interface IntegrationPanelProps {
  orgId: string;
}

export default function IntegrationPanel({ orgId }: IntegrationPanelProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/integration/connections?orgId=${orgId}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = (await res.json()) as { connections: ConnectionInfo[] };
      setConnections(data.connections);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Auto-refresh while any connection is actively syncing
  useEffect(() => {
    const hasSyncing = connections.some((c) => c.syncStatus === 'syncing');
    if (!hasSyncing) return;
    const interval = setInterval(() => { fetchConnections(); }, 5000);
    return () => clearInterval(interval);
  }, [connections, fetchConnections]);

  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync(connectionId: string) {
    setSyncingId(connectionId);
    setSyncError(null);
    try {
      const res = await fetch("/api/integration/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, orgId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = (body as { error?: string } | null)?.error;
        if (msg) setSyncError(msg);
      }
      // 刷新状态
      await fetchConnections();
      // 延迟刷新：同步是 fire-and-forget，首次 fetch 可能还是 syncing
      setTimeout(() => { fetchConnections(); }, 3000);
      setTimeout(() => { fetchConnections(); }, 10000);
    } catch {
      setSyncError("同步请求失败，请检查网络");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDisconnect(connectionId: string) {
    if (!await appConfirm({ message: "确定要断开此连接吗？断开后需要重新授权。", variant: 'warning' })) return;
    setDisconnectingId(connectionId);
    try {
      await fetch("/api/integration/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, orgId }),
      });
      await fetchConnections();
    } catch {
      // 静默
    } finally {
      setDisconnectingId(null);
    }
  }

  function getReauthorizeText(connectorId: string): string {
    const label = isConnectorSupported(connectorId)
      ? getConnectorLabel(connectorId as ConnectorId)
      : connectorId;
    return `帮我重新授权 ${label}`;
  }

  function formatTime(ts: string | null): string {
    if (!ts) return "从未";
    return new Date(ts).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getRecoveryHint(conn: ConnectionInfo): string | null {
    if (conn.tokenExpired) return "授权已过期，请先重新授权再继续同步";
    if (conn.isStuckSync) return "同步疑似卡住超过 30 分钟，可直接重新同步恢复";
    if (conn.tokenExpiringSoon) return "授权即将过期，建议尽快重新授权";
    if (conn.status === "disconnected") return "连接已断开，需要重新授权后恢复同步";
    if (conn.syncStatus === "error" || conn.syncStateStatus === "error") return "最近一次同步失败，建议先重新同步";
    return null;
  }

  // ─── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card card-elevated p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plug className="h-4 w-4 text-muted" />
          集成管理
        </h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card card-elevated p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plug className="h-4 w-4 text-muted" />
          集成管理
        </h2>
        <div className="rounded-lg border border-danger/20 bg-danger/5 p-4">
          <p className="text-sm text-danger flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
          <button
            onClick={() => { setLoading(true); setError(null); fetchConnections(); }}
            className="mt-2 text-xs text-secondary hover:text-foreground"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Plug className="h-4 w-4 text-muted" />
        集成管理
      </h2>

      {syncError && (
        <div className="mb-3 rounded-lg border border-danger/20 bg-danger/5 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-danger">{syncError}</p>
            <button onClick={() => setSyncError(null)} className="mt-1 text-xs text-muted hover:text-foreground">关闭</button>
          </div>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Plug className="mx-auto h-8 w-8 text-muted/40" />
          <p className="mt-3 text-sm text-secondary">还没有对接任何工具</p>
          <p className="mt-1 text-xs text-muted">
            打开 AI 助手，说「帮我连接 Outlook」或「对接企业微信」即可开始
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const config = getConnectorConfig(conn.connectorId);
            const statusConfig = STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.disconnected;
            const Icon = config.icon;
            const StatusIcon = statusConfig.icon;
            const isSyncing = syncingId === conn.id || conn.syncStatus === "syncing";
            const isDisconnecting = disconnectingId === conn.id;
            const recoveryHint = getRecoveryHint(conn);

            return (
              <div
                key={conn.id}
                className="flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-sidebar/50"
              >
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.bgClass}`}
                >
                  <Icon className={`h-5 w-5 ${config.colorClass}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {config.label}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-xs ${statusConfig.className}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {statusConfig.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      最后同步: {formatTime(conn.lastSyncAt)}
                    </span>
                    <span>
                      {conn.recordCount} 条记录
                    </span>
                    {conn.syncStatus && conn.syncStatus !== "idle" && (
                      <span className="text-xs text-secondary">
                        {SYNC_STATUS_LABEL[conn.syncStatus] ?? conn.syncStatus}
                      </span>
                    )}
                    {conn.isStuckSync && (
                      <span className="text-xs text-warning">同步卡住</span>
                    )}
                    {conn.tokenExpiringSoon && !conn.tokenExpired && (
                      <span className="text-xs text-warning">授权即将过期</span>
                    )}
                    {conn.tokenExpired && (
                      <span className="text-xs text-danger">授权已过期</span>
                    )}
                  </div>
                  {recoveryHint && (
                    <p className="mt-1 text-xs text-warning truncate">{recoveryHint}</p>
                  )}
                  {conn.errorMessage && (
                    <p className="mt-1 text-xs text-danger truncate">
                      {conn.errorMessage}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {(conn.tokenExpired || conn.status === "disconnected") && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent("closr-chat-prefill", {
                        detail: { text: getReauthorizeText(conn.connectorId) },
                      }))}
                      className="flex items-center gap-1.5 rounded-lg border border-warning/20 px-3 py-2 text-xs font-medium text-warning transition-colors hover:bg-warning/5"
                      title="重新授权"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      重新授权
                    </button>
                  )}
                  {conn.status === "connected" && (
                    <button
                      onClick={() => handleSync(conn.id)}
                      disabled={isSyncing || conn.tokenExpired}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-sidebar disabled:opacity-50"
                      title={conn.tokenExpired ? "请先重新授权" : "立即同步"}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {conn.tokenExpired ? "需重授权" : conn.isStuckSync || conn.syncStatus === "error" ? "重新同步" : "同步"}
                    </button>
                  )}
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    disabled={isDisconnecting}
                    className="flex items-center gap-1.5 rounded-lg border border-danger/20 px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/5 disabled:opacity-50"
                    title="断开连接"
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    断开
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
