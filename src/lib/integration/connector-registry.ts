/**
 * Connector Registry — 统一连接器元数据与能力定义
 *
 * 收口所有 connector 的 metadata / capability / status shape，
 * 消除 agent.ts、integration-panel.tsx、sync/route.ts 中的分散 if/else。
 */

// ─── Connector Metadata ─────────────────────────────────────────────

export type ConnectorId = 'outlook' | 'wecom';

export type ConnectorStatus = 'supported' | 'planned' | 'evaluating';

export interface ConnectorCapability {
  sync: boolean;
  oauth: boolean;
  webhook: boolean;
  historicalSync: boolean;
}

export interface ConnectorMetadata {
  id: ConnectorId;
  label: string;
  labelEn: string;
  icon: string;
  category: 'email' | 'messaging' | 'crm';
  status: ConnectorStatus;
  authModes: ('org' | 'personal')[];
  syncObjectType: string;
  capabilities: ConnectorCapability;
}

// ─── Registry ────────────────────────────────────────────────────────

const CONNECTOR_REGISTRY: Record<ConnectorId, ConnectorMetadata> = {
  outlook: {
    id: 'outlook',
    label: 'Outlook 邮箱',
    labelEn: 'Outlook',
    icon: '📧',
    category: 'email',
    status: 'supported',
    authModes: ['org', 'personal'],
    syncObjectType: 'email',
    capabilities: {
      sync: true,
      oauth: true,
      webhook: true,
      historicalSync: true,
    },
  },
  wecom: {
    id: 'wecom',
    label: '企业微信',
    labelEn: 'WeCom',
    icon: '💬',
    category: 'messaging',
    status: 'supported',
    authModes: ['org'],
    syncObjectType: 'wecom_contact',
    capabilities: {
      sync: true,
      oauth: false,
      webhook: false,
      historicalSync: false,
    },
  },
};

// ─── Known Unsupported Platforms ─────────────────────────────────────

export interface UnsupportedPlatform {
  id: string;
  label: string;
  status: ConnectorStatus;
  roadmapNote: string;
}

const UNSUPPORTED_PLATFORMS: UnsupportedPlatform[] = [
  { id: 'gmail', label: 'Gmail', status: 'planned', roadmapNote: 'Gmail 当前还未上线，已列入对接路线图。' },
  { id: 'salesforce', label: 'Salesforce', status: 'planned', roadmapNote: 'Salesforce 当前还未上线，已列入对接路线图。' },
  { id: 'hubspot', label: 'HubSpot', status: 'planned', roadmapNote: 'HubSpot 当前还未上线，已列入对接路线图。' },
  { id: '钉钉', label: '钉钉', status: 'evaluating', roadmapNote: '钉钉当前在评估中。' },
  { id: 'zoho', label: 'Zoho CRM', status: 'evaluating', roadmapNote: 'Zoho CRM 当前还未上线，已列入候选需求。' },
  { id: '飞书', label: '飞书', status: 'evaluating', roadmapNote: '飞书当前在评估中。' },
  { id: 'slack', label: 'Slack', status: 'evaluating', roadmapNote: 'Slack 当前在评估中。' },
];

// ─── Public API ──────────────────────────────────────────────────────

export function getConnector(id: ConnectorId): ConnectorMetadata {
  return CONNECTOR_REGISTRY[id];
}

export function getAllConnectors(): ConnectorMetadata[] {
  return Object.values(CONNECTOR_REGISTRY);
}

export function getSupportedConnectorIds(): ConnectorId[] {
  return Object.keys(CONNECTOR_REGISTRY) as ConnectorId[];
}

export function isConnectorSupported(id: string): id is ConnectorId {
  return id in CONNECTOR_REGISTRY;
}

export function getUnsupportedPlatform(query: string): UnsupportedPlatform | undefined {
  const lower = query.toLowerCase();
  return UNSUPPORTED_PLATFORMS.find((p) => lower.includes(p.id.toLowerCase()));
}

export function getSyncObjectType(connectorId: ConnectorId): string {
  return CONNECTOR_REGISTRY[connectorId].syncObjectType;
}

export function getConnectorLabel(connectorId: ConnectorId): string {
  return CONNECTOR_REGISTRY[connectorId].label;
}
