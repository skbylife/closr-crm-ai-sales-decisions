import type { UserRoleLevel, OrgRole } from "@/lib/babel-engine/types";

// NOTE: This is a PRESENTATION-ONLY layer controlling module ordering and visibility.
// It is NOT a security boundary. Real authorization is enforced server-side by
// applyPermissionFilter() and useRoleFilteredData() which scope data by jobLevel.

/**
 * DashboardRole extends UserRoleLevel with finer-grained presentation roles.
 * - ae-lead: Senior AE or team lead (jobLevel 0 but orgRole admin/manager)
 * - owner: Organization owner — sees executive layout + admin-only modules
 */
export type DashboardRole = UserRoleLevel | 'ae-lead' | 'owner';

/** Map orgRole + jobLevel to the presentation-layer DashboardRole */
export function resolveDashboardRole(orgRole: OrgRole, jobLevel: number): DashboardRole {
  if (orgRole === 'owner') return 'owner';
  if (jobLevel >= 2) return 'executive';
  if (jobLevel >= 1) return 'director';
  if (orgRole === 'admin' || orgRole === 'manager') return 'ae-lead';
  return 'ae';
}

/** Unique key for every dashboard module */
export type DashboardModuleKey =
  // Existing
  | "hero"
  | "horizon-decision-homepage"
  | "getting-started"
  | "todays-priorities"
  | "key-account-focus"
  | "today-situation-scaffold"
  | "portfolio-signals"
  | "summary-stats"
  | "overdue-banner"
  | "ai-command-center"
  | "play-signals"
  | "unified-portfolio-insights"
  | "narrative-feed-grid"
  | "stat-cards"
  | "target-progress"
  | "analytics-collapsible"
  | "team-view"
  | "notifications"
  // New modules
  | "false-activity-detector"
  | "executive-intervention-panel"
  | "risk-heatmap"
  | "manager-intervention-panel"
  | "stuck-deal-summary";

export interface ModuleConfig {
  key: DashboardModuleKey;
  /** Display priority -- lower number = higher on page. Gaps allowed for easy insertion. */
  priority: number;
  /** Whether the module is rendered at all for this role */
  visible: boolean;
  /** If the module supports collapsing, its default state. null = not collapsible. */
  defaultExpanded: boolean | null;
  /** Optional props forwarded to the module component */
  props?: Record<string, unknown>;
}

export type RoleLayoutMap = Record<DashboardRole, ModuleConfig[]>;

export const ROLE_LAYOUTS: RoleLayoutMap = {
  // -- AE: Tactical Cockpit ------------------------------------------------
  ae: [
    { key: "hero",                       priority: 10,  visible: true,  defaultExpanded: null },
    { key: "horizon-decision-homepage",  priority: 11,  visible: true,  defaultExpanded: null },
    { key: "getting-started",            priority: 20,  visible: true,  defaultExpanded: null },
    { key: "todays-priorities",          priority: 30,  visible: true,  defaultExpanded: null },
    { key: "key-account-focus",          priority: 31,  visible: true,  defaultExpanded: null },
    { key: "today-situation-scaffold",   priority: 40,  visible: true,  defaultExpanded: null },
    { key: "portfolio-signals",          priority: 50,  visible: true,  defaultExpanded: null },
    { key: "ai-command-center",          priority: 12,  visible: true,  defaultExpanded: null, props: { displayMode: 'full' } },
    { key: "play-signals",              priority: 70,  visible: true,  defaultExpanded: null },
    { key: "overdue-banner",            priority: 75,  visible: true,  defaultExpanded: null },
    { key: "narrative-feed-grid",       priority: 80,  visible: true,  defaultExpanded: null },
    { key: "stat-cards",               priority: 90,  visible: false, defaultExpanded: null },
    { key: "target-progress",          priority: 100, visible: true,  defaultExpanded: null },
    { key: "summary-stats",            priority: 110, visible: false,  defaultExpanded: false },
    { key: "unified-portfolio-insights",priority: 120, visible: false, defaultExpanded: false },
    { key: "analytics-collapsible",     priority: 200, visible: true,  defaultExpanded: false },
    { key: "notifications",            priority: 999, visible: true,  defaultExpanded: null },
    // Hidden for AE
    { key: "team-view",                priority: 300, visible: false, defaultExpanded: null },
    { key: "false-activity-detector",  priority: 300, visible: false, defaultExpanded: null },
    { key: "executive-intervention-panel", priority: 300, visible: false, defaultExpanded: null },
    { key: "risk-heatmap",            priority: 300, visible: false, defaultExpanded: null },
    { key: "manager-intervention-panel", priority: 300, visible: false, defaultExpanded: null },
    { key: "stuck-deal-summary",       priority: 300, visible: false, defaultExpanded: null },
  ],

  // -- Director/Manager: Coaching & Correction Console ---------------------
  director: [
    { key: "hero",                       priority: 10,  visible: true,  defaultExpanded: null },
    { key: "horizon-decision-homepage",  priority: 11,  visible: true,  defaultExpanded: null },
    { key: "getting-started",            priority: 15,  visible: true,  defaultExpanded: null },
    { key: "manager-intervention-panel", priority: 20,  visible: false,  defaultExpanded: null },
    { key: "stuck-deal-summary",        priority: 25,  visible: true,  defaultExpanded: null },
    { key: "today-situation-scaffold",   priority: 30,  visible: true,  defaultExpanded: null },
    { key: "ai-command-center",          priority: 12,  visible: true,  defaultExpanded: null, props: { displayMode: 'full' } },
    { key: "unified-portfolio-insights", priority: 50,  visible: false,  defaultExpanded: null },
    { key: "summary-stats",             priority: 60,  visible: false,  defaultExpanded: null },
    { key: "overdue-banner",            priority: 65,  visible: true,  defaultExpanded: null },
    { key: "play-signals",              priority: 70,  visible: true,  defaultExpanded: null },
    { key: "todays-priorities",          priority: 80,  visible: true,  defaultExpanded: null },
    { key: "key-account-focus",          priority: 81,  visible: true,  defaultExpanded: null },
    { key: "portfolio-signals",          priority: 85,  visible: true,  defaultExpanded: null },
    { key: "stat-cards",                priority: 90,  visible: false, defaultExpanded: null },
    { key: "target-progress",           priority: 100, visible: true,  defaultExpanded: null },
    { key: "narrative-feed-grid",       priority: 110, visible: true,  defaultExpanded: false },
    { key: "analytics-collapsible",     priority: 200, visible: true,  defaultExpanded: false },
    { key: "team-view",                 priority: 210, visible: true,  defaultExpanded: false },
    { key: "notifications",            priority: 999, visible: true,  defaultExpanded: null },
    // Hidden for Director
    { key: "false-activity-detector",       priority: 300, visible: false, defaultExpanded: null },
    { key: "executive-intervention-panel",  priority: 300, visible: false, defaultExpanded: null },
    { key: "risk-heatmap",                  priority: 300, visible: false, defaultExpanded: null },
  ],

  // -- Executive (VP/CRO): Resource Allocation Console ---------------------
  executive: [
    { key: "hero",                       priority: 10,  visible: true,  defaultExpanded: null },
    { key: "horizon-decision-homepage",  priority: 11,  visible: true,  defaultExpanded: null },
    { key: "getting-started",            priority: 15,  visible: true,  defaultExpanded: null },
    { key: "summary-stats",             priority: 20,  visible: false,  defaultExpanded: null },
    { key: "false-activity-detector",    priority: 30,  visible: false,  defaultExpanded: null },
    { key: "executive-intervention-panel", priority: 40, visible: false, defaultExpanded: null },
    { key: "risk-heatmap",              priority: 50,  visible: false,  defaultExpanded: null },
    { key: "ai-command-center",          priority: 12,  visible: true,  defaultExpanded: null, props: { displayMode: 'summary' } },
    { key: "overdue-banner",            priority: 65,  visible: true,  defaultExpanded: null },
    { key: "unified-portfolio-insights", priority: 70,  visible: false,  defaultExpanded: null },
    { key: "manager-intervention-panel", priority: 75,  visible: false,  defaultExpanded: null },
    { key: "today-situation-scaffold",   priority: 80,  visible: true,  defaultExpanded: false },
    { key: "play-signals",              priority: 90,  visible: true,  defaultExpanded: false },
    { key: "todays-priorities",          priority: 95,  visible: true,  defaultExpanded: false },
    { key: "key-account-focus",          priority: 96,  visible: true,  defaultExpanded: false },
    { key: "portfolio-signals",          priority: 100, visible: true,  defaultExpanded: false },
    { key: "narrative-feed-grid",       priority: 110, visible: true,  defaultExpanded: false },
    { key: "stat-cards",               priority: 120, visible: false, defaultExpanded: null },
    { key: "target-progress",          priority: 130, visible: true,  defaultExpanded: null },
    { key: "analytics-collapsible",     priority: 200, visible: true,  defaultExpanded: false },
    { key: "team-view",                 priority: 210, visible: true,  defaultExpanded: null },
    { key: "notifications",            priority: 999, visible: true,  defaultExpanded: null },
  ],

  // -- AE Lead: AE layout + team-view + stuck-deal-summary ---------------
  "ae-lead": [
    { key: "hero",                       priority: 10,  visible: true,  defaultExpanded: null },
    { key: "horizon-decision-homepage",  priority: 11,  visible: true,  defaultExpanded: null },
    { key: "getting-started",            priority: 20,  visible: true,  defaultExpanded: null },
    { key: "todays-priorities",          priority: 30,  visible: true,  defaultExpanded: null },
    { key: "key-account-focus",          priority: 31,  visible: true,  defaultExpanded: null },
    { key: "today-situation-scaffold",   priority: 40,  visible: true,  defaultExpanded: null },
    { key: "portfolio-signals",          priority: 50,  visible: true,  defaultExpanded: null },
    { key: "ai-command-center",          priority: 12,  visible: true,  defaultExpanded: null, props: { displayMode: 'full' } },
    { key: "stuck-deal-summary",        priority: 65,  visible: true,  defaultExpanded: null },
    { key: "play-signals",              priority: 70,  visible: true,  defaultExpanded: null },
    { key: "overdue-banner",            priority: 75,  visible: true,  defaultExpanded: null },
    { key: "narrative-feed-grid",       priority: 80,  visible: true,  defaultExpanded: null },
    { key: "stat-cards",               priority: 90,  visible: false, defaultExpanded: null },
    { key: "target-progress",          priority: 100, visible: true,  defaultExpanded: null },
    { key: "summary-stats",            priority: 110, visible: false,  defaultExpanded: false },
    { key: "unified-portfolio-insights",priority: 120, visible: false, defaultExpanded: false },
    { key: "analytics-collapsible",     priority: 200, visible: true,  defaultExpanded: false },
    { key: "team-view",                 priority: 210, visible: true,  defaultExpanded: false },
    { key: "notifications",            priority: 999, visible: true,  defaultExpanded: null },
    // Hidden for AE Lead
    { key: "false-activity-detector",  priority: 300, visible: false, defaultExpanded: null },
    { key: "executive-intervention-panel", priority: 300, visible: false, defaultExpanded: null },
    { key: "risk-heatmap",            priority: 300, visible: false, defaultExpanded: null },
    { key: "manager-intervention-panel", priority: 300, visible: false, defaultExpanded: null },
  ],

  // -- Owner: Full executive layout (identical to executive) ──────────
  owner: [
    { key: "hero",                       priority: 10,  visible: true,  defaultExpanded: null },
    { key: "horizon-decision-homepage",  priority: 11,  visible: true,  defaultExpanded: null },
    { key: "getting-started",            priority: 15,  visible: true,  defaultExpanded: null },
    { key: "summary-stats",             priority: 20,  visible: false,  defaultExpanded: null },
    { key: "false-activity-detector",    priority: 30,  visible: false,  defaultExpanded: null },
    { key: "executive-intervention-panel", priority: 40, visible: false, defaultExpanded: null },
    { key: "risk-heatmap",              priority: 50,  visible: false,  defaultExpanded: null },
    { key: "ai-command-center",          priority: 12,  visible: true,  defaultExpanded: null, props: { displayMode: 'summary' } },
    { key: "overdue-banner",            priority: 65,  visible: true,  defaultExpanded: null },
    { key: "unified-portfolio-insights", priority: 70,  visible: false,  defaultExpanded: null },
    { key: "manager-intervention-panel", priority: 75,  visible: false,  defaultExpanded: null },
    { key: "stuck-deal-summary",        priority: 78,  visible: true,  defaultExpanded: null },
    { key: "today-situation-scaffold",   priority: 80,  visible: true,  defaultExpanded: null },
    { key: "play-signals",              priority: 90,  visible: true,  defaultExpanded: false },
    { key: "todays-priorities",          priority: 95,  visible: true,  defaultExpanded: false },
    { key: "key-account-focus",          priority: 96,  visible: true,  defaultExpanded: false },
    { key: "portfolio-signals",          priority: 100, visible: true,  defaultExpanded: false },
    { key: "narrative-feed-grid",       priority: 110, visible: true,  defaultExpanded: false },
    { key: "stat-cards",               priority: 120, visible: false, defaultExpanded: null },
    { key: "target-progress",          priority: 130, visible: true,  defaultExpanded: null },
    { key: "analytics-collapsible",     priority: 200, visible: true,  defaultExpanded: false },
    { key: "team-view",                 priority: 210, visible: true,  defaultExpanded: null },
    { key: "notifications",            priority: 999, visible: true,  defaultExpanded: null },
  ],
};

/**
 * Module-level permission guard: minimum jobLevel required to render.
 * This is a CLIENT-SIDE safety net — real data authorization is server-side.
 * Modules not listed here are available to all roles (minJobLevel = 0).
 */
export const MODULE_MIN_JOB_LEVEL: Partial<Record<DashboardModuleKey, number>> = {
  "team-view": 1,                     // Director+
  "manager-intervention-panel": 1,    // Director+
  "stuck-deal-summary": 1,            // Director+
  "false-activity-detector": 2,       // Executive+
  "executive-intervention-panel": 2,  // Executive+
  "risk-heatmap": 2,                  // Executive+
};

/** Check if a module is allowed for the given jobLevel */
export function isModuleAllowed(key: DashboardModuleKey, jobLevel: number): boolean {
  const minLevel = MODULE_MIN_JOB_LEVEL[key];
  if (minLevel === undefined) return true;
  return jobLevel >= minLevel;
}

/** Human-readable labels for module keys */
export const MODULE_LABELS: Record<DashboardModuleKey, string> = {
  "hero": "顶部横幅",
  "horizon-decision-homepage": "Horizon 决策首页",
  "getting-started": "新手引导",
  "todays-priorities": "今日优先",
  "key-account-focus": "重点客户局势",
  "today-situation-scaffold": "今日局势",
  "portfolio-signals": "组合信号",
  "summary-stats": "汇总统计",
  "overdue-banner": "逾期提醒",
  "ai-command-center": "AI 指挥中心",
  "play-signals": "打法信号",
  "unified-portfolio-insights": "组合洞察",
  "narrative-feed-grid": "叙事信息流",
  "stat-cards": "数据卡片",
  "target-progress": "目标进度",
  "analytics-collapsible": "分析面板",
  "team-view": "团队视图",
  "notifications": "通知",
  "false-activity-detector": "假性活跃检测",
  "executive-intervention-panel": "高层介入面板",
  "risk-heatmap": "风险热力图",
  "manager-intervention-panel": "经理介入面板",
  "stuck-deal-summary": "卡点摘要",
};

/** Get sorted, visible modules for a role */
export function getVisibleModules(role: DashboardRole): ModuleConfig[] {
  return (ROLE_LAYOUTS[role] ?? ROLE_LAYOUTS.ae)
    .filter((m) => m.visible)
    .sort((a, b) => a.priority - b.priority);
}
