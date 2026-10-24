"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { Contact, ContactRole } from "@/lib/babel-engine/types";
import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";

/* ── Props ─────────────────────────────────────────────── */
interface TeamAssignment {
  contactId: string;
  memberName: string;
  memberTitle?: string;
  jobLevel?: number;
  interactionCount?: number;
}

interface OrgMapProps {
  accountId: string;
  contacts?: Contact[];
  onAddContact?: (role?: ContactRole) => void;
  teamAssignments?: TeamAssignment[];
}

/* ── Config ────────────────────────────────────────────── */
const ROLE_CONFIG: Record<
  ContactRole,
  { label: string; style: string; dotColor: string; avatarBg: string }
> = {
  decision_maker: {
    label: "决策者",
    style: "bg-danger/10 text-danger border-danger/20",
    dotColor: "bg-red-500",
    avatarBg: "bg-red-100 text-red-700",
  },
  economic_buyer: {
    label: "预算控制",
    style: "bg-danger/10 text-danger border-danger/20",
    dotColor: "bg-red-400",
    avatarBg: "bg-red-100 text-red-700",
  },
  executive_sponsor: {
    label: "高管支持",
    style: "bg-purple-500/10 text-purple-700 border-purple-500/20",
    dotColor: "bg-purple-500",
    avatarBg: "bg-purple-100 text-purple-700",
  },
  champion: {
    label: "推动者",
    style: "bg-positive/10 text-positive border-positive/20",
    dotColor: "bg-green-500",
    avatarBg: "bg-green-100 text-green-700",
  },
  coach: {
    label: "教练",
    style: "bg-positive/10 text-positive border-positive/20",
    dotColor: "bg-green-400",
    avatarBg: "bg-green-100 text-green-700",
  },
  technical_evaluator: {
    label: "技术评估",
    style: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    dotColor: "bg-blue-500",
    avatarBg: "bg-blue-100 text-blue-700",
  },
  influencer: {
    label: "影响者",
    style: "bg-purple-500/10 text-purple-700 border-purple-500/20",
    dotColor: "bg-purple-500",
    avatarBg: "bg-purple-100 text-purple-700",
  },
  external_advisor: {
    label: "外部顾问",
    style: "bg-violet-500/10 text-violet-700 border-violet-500/20",
    dotColor: "bg-violet-500",
    avatarBg: "bg-violet-100 text-violet-700",
  },
  consultant: {
    label: "咨询顾问",
    style: "bg-violet-500/10 text-violet-700 border-violet-500/20",
    dotColor: "bg-violet-400",
    avatarBg: "bg-violet-100 text-violet-700",
  },
  channel_influencer: {
    label: "渠道影响者",
    style: "bg-violet-500/10 text-violet-700 border-violet-500/20",
    dotColor: "bg-violet-300",
    avatarBg: "bg-violet-100 text-violet-700",
  },
  project_manager: {
    label: "项目经理",
    style: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    dotColor: "bg-blue-400",
    avatarBg: "bg-blue-100 text-blue-700",
  },
  it_admin: {
    label: "IT 管理",
    style: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20",
    dotColor: "bg-cyan-500",
    avatarBg: "bg-cyan-100 text-cyan-700",
  },
  procurement: {
    label: "采购",
    style: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    dotColor: "bg-amber-500",
    avatarBg: "bg-amber-100 text-amber-700",
  },
  legal: {
    label: "法务",
    style: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    dotColor: "bg-amber-400",
    avatarBg: "bg-amber-100 text-amber-700",
  },
  finance: {
    label: "财务",
    style: "bg-amber-500/10 text-amber-700 border-amber-500/20",
    dotColor: "bg-amber-300",
    avatarBg: "bg-amber-100 text-amber-700",
  },
  operations: {
    label: "运营",
    style: "bg-card text-muted border-border",
    dotColor: "bg-slate-400",
    avatarBg: "bg-slate-100 text-slate-600",
  },
  blocker: {
    label: "阻碍者",
    style: "bg-warning/10 text-warning border-warning/20",
    dotColor: "bg-yellow-500",
    avatarBg: "bg-yellow-100 text-yellow-700",
  },
  gate_keeper: {
    label: "守门人",
    style: "bg-card text-muted border-border",
    dotColor: "bg-slate-400",
    avatarBg: "bg-slate-100 text-slate-600",
  },
  committee_member: {
    label: "评审委员",
    style: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
    dotColor: "bg-indigo-400",
    avatarBg: "bg-indigo-100 text-indigo-700",
  },
  end_user: {
    label: "终端用户",
    style: "bg-card text-muted border-border",
    dotColor: "bg-gray-400",
    avatarBg: "bg-gray-100 text-gray-600",
  },
  contact: {
    label: "联系人",
    style: "bg-card text-muted border-border",
    dotColor: "bg-gray-400",
    avatarBg: "bg-gray-100 text-gray-600",
  },
  unknown: {
    label: "未知",
    style: "bg-card text-muted border-border",
    dotColor: "bg-gray-400",
    avatarBg: "bg-gray-100 text-gray-600",
  },
};

const ROLE_LABELS_EN: Partial<Record<ContactRole, string>> = {
  decision_maker: "Decision Maker",
  economic_buyer: "Economic Buyer",
  executive_sponsor: "Executive Sponsor",
  champion: "Champion",
  coach: "Coach",
  technical_evaluator: "Technical Evaluator",
  influencer: "Influencer",
  external_advisor: "External Advisor",
  consultant: "Consultant",
  channel_influencer: "Channel Influencer",
  project_manager: "Project Manager",
  it_admin: "IT Admin",
  procurement: "Procurement",
  legal: "Legal",
  finance: "Finance",
  operations: "Operations",
  end_user: "End User",
  blocker: "Blocker",
  contact: "Contact",
  unknown: "Unknown",
};

function roleLabel(role: ContactRole, en: boolean): string {
  return en ? ROLE_LABELS_EN[role] ?? ROLE_CONFIG[role].label : ROLE_CONFIG[role].label;
}

const TITLE_HIERARCHY: [RegExp, number][] = [
  [/\b(CEO|CTO|CFO|COO|CMO|CIO|CISO|CPO|Chief)\b/i, 1],
  [/\b(SVP|Senior Vice President)\b/i, 2],
  [/\b(VP|Vice President|副总裁|副总)\b/i, 3],
  [/\b(Director|Head of|总监)\b/i, 4],
  [/\b(Senior Manager|Sr\.?\s*Manager|高级经理)\b/i, 5],
  [/\b(Manager|Mgr|经理)\b/i, 6],
  [/\b(Lead|Principal|Staff|主管)\b/i, 7],
  [/\b(Senior|Sr\.?|资深)\b/i, 8],
  [/\b(Analyst|Engineer|Specialist|Coordinator|Associate)\b/i, 9],
];

function inferLevel(title?: string): number {
  if (!title) return 10;
  for (const [re, level] of TITLE_HIERARCHY) {
    if (re.test(title)) return level;
  }
  return 10;
}

const BUYING_COMMITTEE_ROLES: ContactRole[] = [
  "decision_maker",
  "champion",
  "technical_evaluator",
  "influencer",
  "end_user",
];

const REQUIRED_ROLES: ContactRole[] = ["decision_maker", "champion", "technical_evaluator"];

/* ── Tree building ─────────────────────────────────────── */
interface TreeNode {
  contact: Contact;
  children: TreeNode[];
}

function buildTree(contacts: Contact[]): TreeNode[] {
  const contactsById = new Map(contacts.map((c) => [c.id, c]));
  const hasExplicitReporting = contacts.some(
    (c) => c.reportsTo && contactsById.has(c.reportsTo),
  );

  if (hasExplicitReporting) {
    const nodeMap = new Map<string, TreeNode>();
    for (const c of contacts) {
      nodeMap.set(c.id, { contact: c, children: [] });
    }
    const roots: TreeNode[] = [];
    for (const c of contacts) {
      const node = nodeMap.get(c.id)!;
      if (c.reportsTo && nodeMap.has(c.reportsTo)) {
        nodeMap.get(c.reportsTo)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    roots.sort((a, b) => inferLevel(a.contact.title) - inferLevel(b.contact.title));
    return roots;
  }

  const levelMap = new Map<number, Contact[]>();
  for (const c of contacts) {
    const level = inferLevel(c.title);
    const list = levelMap.get(level) ?? [];
    list.push(c);
    levelMap.set(level, list);
  }
  const sortedLevels = Array.from(levelMap.entries()).sort((a, b) => a[0] - b[0]);

  let prevNodes: TreeNode[] = [];
  let roots: TreeNode[] = [];
  for (const [, levelContacts] of sortedLevels) {
    const currentNodes = levelContacts.map((c) => ({
      contact: c,
      children: [] as TreeNode[],
    }));
    if (prevNodes.length === 0) {
      roots = currentNodes;
    } else {
      currentNodes.forEach((node, i) => {
        prevNodes[i % prevNodes.length].children.push(node);
      });
    }
    prevNodes = currentNodes;
  }
  return roots;
}

function flattenToLevels(roots: TreeNode[]): Contact[][] {
  const levels: Contact[][] = [];
  let queue = [...roots];
  while (queue.length > 0) {
    levels.push(queue.map((n) => n.contact));
    const next: TreeNode[] = [];
    for (const n of queue) next.push(...n.children);
    queue = next;
  }
  return levels;
}

/* ── Interaction status ────────────────────────────────── */
const STATUS_COLORS = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
  gray: "bg-gray-300",
} as const;

const STATUS_LABELS: Record<keyof typeof STATUS_COLORS, string> = {
  green: "7天内互动",
  yellow: "7-14天前互动",
  red: "超过14天未互动",
  gray: "暂无互动",
};

function getInteractionStatus(contact: Contact): keyof typeof STATUS_COLORS {
  const ts = (contact as unknown as Record<string, unknown>).lastInteractionAt;
  if (!ts || typeof ts !== "string") return "gray";
  const days = (Date.now() - new Date(ts).getTime()) / 86_400_000;
  if (days <= 7) return "green";
  if (days <= 14) return "yellow";
  return "red";
}

/* ── Layout constants ──────────────────────────────────── */
const NODE_W = 140;
const NODE_GAP = 16;
const CONNECTOR_H = 28;

/* ── Display item type ─────────────────────────────────── */
type DisplayItem =
  | { kind: "contact"; contact: Contact }
  | { kind: "missing"; role: ContactRole };

/* ── Coverage Panel ────────────────────────────────────── */
function CoveragePanel({
  roleGroups,
  onAddContact,
  en = false,
}: {
  roleGroups: Map<ContactRole, Contact[]>;
  onAddContact?: (role?: ContactRole) => void;
  en?: boolean;
}) {
  const covered = BUYING_COMMITTEE_ROLES.filter((r) => roleGroups.has(r));
  const missing = BUYING_COMMITTEE_ROLES.filter((r) => !roleGroups.has(r));
  const pct = Math.round((covered.length / BUYING_COMMITTEE_ROLES.length) * 100);
  const champCount = roleGroups.get("champion")?.length ?? 0;

  return (
    <div className="rounded-xl border border-border bg-sidebar p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {en ? "Buying Committee Coverage" : "采购委员会覆盖率"}
        </h4>
        <span
          className={`font-mono text-sm font-semibold ${
            pct >= 100 ? "text-positive" : pct >= 60 ? "text-warning" : "text-danger"
          }`}
        >
          {covered.length}/{BUYING_COMMITTEE_ROLES.length} · {pct}%
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 flex-1 rounded-full bg-border">
          <div
            className={`h-2 rounded-full transition-all duration-400 ${
              pct >= 100 ? "bg-positive" : pct >= 60 ? "bg-warning" : "bg-danger"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-mono font-semibold ${pct >= 100 ? "text-positive" : pct >= 60 ? "text-warning" : "text-danger"}`}>{pct}%</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {covered.map((r) => {
          const info = ROLE_CONFIG[r];
          const count = roleGroups.get(r)!.length;
          return (
            <span
              key={r}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${info.style}`}
            >
              <span>✅</span> {roleLabel(r, en)}({count})
            </span>
          );
        })}
        {missing.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onAddContact?.(r)}
            className="inline-flex items-center gap-1 rounded-full border border-danger/20 bg-danger/5 px-2 py-0.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors cursor-pointer"
          >
            <span>❌</span> {roleLabel(r, en)}
          </button>
        ))}
      </div>
      {champCount === 1 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-warning/10 px-3 py-1.5 text-xs text-warning font-medium">
          <span>⚠️</span> {en ? "Single-thread risk: only 1 champion" : "单线程风险：仅有 1 位推动者"}
        </div>
      )}
    </div>
  );
}

/* ── Node Card (140px) ─────────────────────────────────── */
function NodeCard({ contact, assignment, en = false }: { contact: Contact; assignment?: TeamAssignment; en?: boolean }) {
  const role = contact.role ?? "unknown";
  const info = ROLE_CONFIG[role];
  const status = getInteractionStatus(contact);
  const strength = contact.relationship_strength;

  return (
    <div
      className="relative flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-2.5 shadow-sm flex-shrink-0"
      style={{ width: NODE_W }}
    >
      <div
        className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${STATUS_COLORS[status]}`}
        title={STATUS_LABELS[status]}
      />
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${info.avatarBg}`}
      >
        {contact.name.charAt(0)}
      </div>
      <p className="text-[15px] font-semibold text-foreground truncate w-full text-center leading-tight">
        {contact.name}
      </p>
      <p className="text-xs text-muted truncate w-full text-center leading-tight">
        {visibleBusinessText(contact.title) || "—"}
      </p>
      <span
        className={`inline-flex items-center rounded-full border px-1.5 py-px text-xs font-medium ${info.style}`}
      >
        {roleLabel(role, en)}
      </span>
      {/* Relationship Strength Bar */}
      {strength != null && (
        <div className="group relative w-full cursor-default">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-gray-100">
              <div
                className={`h-1.5 rounded-full transition-all ${getStrengthColor(strength)}`}
                style={{ width: `${strength}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold tabular-nums ${getStrengthTextColor(strength)}`}>{strength}</span>
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
            <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs text-white whitespace-nowrap shadow-lg">
              <p className="font-semibold">{en ? "Relationship strength: " : "关系强度："}{strength}/100</p>
              <p className="opacity-80 mt-0.5">{en ? "Based on interaction frequency, trust, and influence" : getStrengthLabel(strength) + " — 基于互动频率、信任度和影响力"}</p>
            </div>
          </div>
        </div>
      )}
      {/* Team Assignment */}
      {assignment && (
        <div className="flex items-center gap-1 mt-1 w-full truncate">
          <Users className="h-3 w-3 flex-shrink-0 text-muted" />
          <span className="text-[11px] text-muted truncate">
            {assignment.memberName}{assignment.memberTitle ? `（${visibleBusinessText(assignment.memberTitle)}）` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Missing Role Card ─────────────────────────────────── */
function MissingCard({
  role,
  onAdd,
  en = false,
}: {
  role: ContactRole;
  onAdd?: (role?: ContactRole) => void;
  en?: boolean;
}) {
  const info = ROLE_CONFIG[role];
  return (
    <div
      className="relative flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-background/50 px-2 py-2.5 flex-shrink-0"
      style={{ width: NODE_W }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/10 text-base text-muted">
        <span>❓</span>
      </div>
      <p className="text-[14px] font-medium text-muted text-center leading-tight">
        {en ? "Missing " + roleLabel(role, en) : "缺少" + info.label}
      </p>
      <span
        className={`inline-flex items-center rounded-full border px-1.5 py-px text-xs font-medium ${info.style} opacity-50`}
      >
        {roleLabel(role, en)}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={() => onAdd(role)}
          className="mt-0.5 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
        >
          {en ? "+ Add" : "+ 添加"}
        </button>
      )}
    </div>
  );
}

/* ── Level Connector (CSS lines) ───────────────────────── */
function LevelConnector({
  topCount,
  bottomCount,
  containerWidth,
}: {
  topCount: number;
  bottomCount: number;
  containerWidth: number;
}) {
  if (topCount <= 1 && bottomCount <= 1) {
    return (
      <div className="flex justify-center" style={{ width: containerWidth }}>
        <div className="bg-border" style={{ width: 1, height: CONNECTOR_H }} />
      </div>
    );
  }

  const centerOf = (count: number, i: number) => {
    const rowW = count * (NODE_W + NODE_GAP) - NODE_GAP;
    const offset = (containerWidth - rowW) / 2;
    return offset + i * (NODE_W + NODE_GAP) + NODE_W / 2;
  };

  const topCenters = Array.from({ length: topCount }, (_, i) => centerOf(topCount, i));
  const botCenters = Array.from({ length: bottomCount }, (_, i) =>
    centerOf(bottomCount, i),
  );
  const allX = [...topCenters, ...botCenters];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const mid = CONNECTOR_H / 2;

  return (
    <div className="flex justify-center" style={{ width: containerWidth }}>
      <div
        className="relative flex-shrink-0"
        style={{ width: containerWidth, height: CONNECTOR_H }}
      >
        {maxX - minX > 0 && (
          <div
            className="absolute bg-border"
            style={{ top: mid, left: minX, width: maxX - minX, height: 1 }}
          />
        )}
        {topCenters.map((x, i) => (
          <div
            key={`t${i}`}
            className="absolute bg-border"
            style={{ left: x, top: 0, width: 1, height: mid + 1 }}
          />
        ))}
        {botCenters.map((x, i) => (
          <div
            key={`b${i}`}
            className="absolute bg-border"
            style={{ left: x, top: mid, width: 1, height: mid }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Influence / Support Matrix ────────────────────────── */
function InfluenceMatrix({ contacts }: { contacts: Contact[] }) {
  const { locale } = useLocale();
  const en = locale === "en";
  function getInfluence(c: Contact): "high" | "low" {
    return inferLevel(c.title) <= 4 ? "high" : "low";
  }
  function getSupport(c: Contact): "high" | "low" {
    if (c.role === "champion" || c.role === "decision_maker") return "high";
    if (c.role === "blocker") return "low";
    return "high";
  }

  const quadrants = {
    hh: contacts.filter((c) => getInfluence(c) === "high" && getSupport(c) === "high"),
    hl: contacts.filter((c) => getInfluence(c) === "high" && getSupport(c) === "low"),
    lh: contacts.filter((c) => getInfluence(c) === "low" && getSupport(c) === "high"),
    ll: contacts.filter((c) => getInfluence(c) === "low" && getSupport(c) === "low"),
  };

  const QUADRANT_META: Record<string, { title: string; titleEn: string; bg: string }> = {
    hh: { title: "重点维护", titleEn: "Maintain", bg: "bg-positive/5" },
    hl: { title: "重点攻关", titleEn: "Prioritize", bg: "bg-warning/5" },
    lh: { title: "保持联络", titleEn: "Keep warm", bg: "bg-blue-50" },
    ll: { title: "关注动态", titleEn: "Monitor", bg: "bg-card" },
  };

  const renderDots = (list: Contact[]) =>
    list.length === 0 ? (
      <span className="text-xs text-muted italic">—</span>
    ) : (
      <div className="flex flex-wrap gap-2 items-start">
        {list.map((c) => {
          const role = c.role ?? "unknown";
          return (
            <div key={c.id} className="group relative">
              <div
                className={`h-4 w-4 rounded-full ${ROLE_CONFIG[role].dotColor} ring-2 ring-white cursor-default transition-transform group-hover:scale-125`}
              />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
                <div className="rounded-md bg-foreground px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg">
                  <p className="font-semibold">{c.name}</p>
                  <p className="opacity-70">{c.title ?? "—"}</p>
                  <p className="opacity-70">{roleLabel(role, en)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );

  const renderQuadrant = (
    key: string,
    list: Contact[],
    rounded: string,
    borderExtra: string,
  ) => {
    const meta = QUADRANT_META[key]!;
    return (
      <div
        className={`${rounded} border ${borderExtra} border-border ${meta.bg} p-3 min-h-[80px]`}
      >
        <p className="text-xs font-bold text-muted mb-2">{en ? meta.titleEn : meta.title}</p>
        {renderDots(list)}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-sidebar p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {en ? "Influence / Support Matrix" : "影响力 / 支持度矩阵"}
      </h4>
      <div className="grid grid-cols-[auto_1fr_1fr] grid-rows-[auto_1fr_1fr] gap-0">
        <div />
        <div className="text-center text-xs font-semibold text-positive pb-2">
          {en ? "High support" : "高支持度"}
        </div>
        <div className="text-center text-xs font-semibold text-danger pb-2">
          {en ? "Low support" : "低支持度"}
        </div>

        <div className="flex items-center pr-3">
          <span className="text-xs font-semibold text-foreground whitespace-nowrap [writing-mode:vertical-rl]">
            {en ? "High influence" : "高影响力"}
          </span>
        </div>
        {renderQuadrant("hh", quadrants.hh, "rounded-tl-lg", "")}
        {renderQuadrant("hl", quadrants.hl, "rounded-tr-lg", "border-l-0")}

        <div className="flex items-center pr-3">
          <span className="text-xs font-semibold text-muted whitespace-nowrap [writing-mode:vertical-rl]">
            {en ? "Low influence" : "低影响力"}
          </span>
        </div>
        {renderQuadrant("lh", quadrants.lh, "rounded-bl-lg", "border-t-0")}
        {renderQuadrant(
          "ll",
          quadrants.ll,
          "rounded-br-lg",
          "border-l-0 border-t-0",
        )}
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */

/* ── Recursive Tree Renderer ────────────────────────────── */
/* ── Relationship Strength helpers ──────────────────────── */
function getStrengthColor(strength: number): string {
  if (strength >= 70) return "bg-green-500";
  if (strength >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function getStrengthLabel(strength: number, en = false): string {
  if (strength >= 70) return en ? "Strong relationship" : "强关系";
  if (strength >= 40) return en ? "Moderate relationship" : "一般";
  return en ? "Weak relationship" : "弱关系";
}

function getStrengthTextColor(strength: number): string {
  if (strength >= 70) return "text-green-600";
  if (strength >= 40) return "text-amber-600";
  return "text-red-500";
}

function TreeNodeRenderer({ node, isLast, depth, assignmentMap, en = false }: { node: TreeNode; isLast: boolean; depth: number; assignmentMap?: Map<string, TeamAssignment>; en?: boolean }) {
  const contact = node.contact;
  const status = getInteractionStatus(contact);
  const roleConfig = ROLE_CONFIG[contact.role ?? "unknown"];
  const strength = contact.relationship_strength;
  
  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div className="relative flex flex-col items-center rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm" style={{ width: NODE_W }}>
        {/* Status dot */}
        <div className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white ${STATUS_COLORS[status]}`} title={STATUS_LABELS[status]} />
        {/* Avatar */}
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${roleConfig.dotColor === 'bg-red-500' ? 'bg-red-100 text-red-700' : roleConfig.dotColor === 'bg-green-500' ? 'bg-green-100 text-green-700' : roleConfig.dotColor === 'bg-blue-500' ? 'bg-blue-100 text-blue-700' : roleConfig.dotColor === 'bg-purple-500' ? 'bg-purple-100 text-purple-700' : roleConfig.dotColor === 'bg-yellow-500' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
          {contact.name.charAt(0)}
        </div>
        <p className="mt-1 text-xs font-semibold text-foreground text-center truncate w-full">{contact.name}</p>
        <p className="text-xs text-muted text-center truncate w-full">{visibleBusinessText(contact.title, en ? "en" : "zh") || (en ? "Not set" : "未设置")}</p>
        <span className={`mt-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${roleConfig.style}`}>{roleLabel(contact.role ?? "unknown", en)}</span>
        {/* Relationship Strength Bar */}
        {strength != null && (
          <div className="group relative mt-1.5 w-full cursor-default">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                <div
                  className={`h-1.5 rounded-full transition-all ${getStrengthColor(strength)}`}
                  style={{ width: `${strength}%` }}
                />
              </div>
              <span className={`text-[10px] font-semibold tabular-nums ${getStrengthTextColor(strength)}`}>{strength}</span>
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
              <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs text-white whitespace-nowrap shadow-lg">
                <p className="font-semibold">{en ? "Relationship strength: " : "关系强度："}{strength}/100</p>
                <p className="opacity-80 mt-0.5">{en ? `${getStrengthLabel(strength, true)} — based on interaction frequency, trust, and influence` : getStrengthLabel(strength) + " — 基于互动频率、信任度和影响力"}</p>
              </div>
            </div>
          </div>
        )}
        {/* Team Assignment */}
        {assignmentMap?.get(contact.id) && (
          <div className="flex items-center gap-1 mt-1.5 w-full truncate">
            <Users className="h-3 w-3 flex-shrink-0 text-muted" />
            <span className="text-[11px] text-muted truncate">
              {assignmentMap.get(contact.id)!.memberName}{assignmentMap.get(contact.id)!.memberTitle ? `（${assignmentMap.get(contact.id)!.memberTitle}）` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <>
          {/* Vertical line from parent to children connector */}
          <div className="w-px bg-border" style={{ height: CONNECTOR_H / 2 }} />
          {/* Horizontal connector line */}
          {node.children.length > 1 && (
            <div className="relative w-full flex justify-center">
              <div className="absolute top-0 bg-border" style={{ height: 1, left: `${100 / (node.children.length * 2)}%`, right: `${100 / (node.children.length * 2)}%` }} />
            </div>
          )}
          {/* Children row */}
          <div className="flex gap-4 justify-center">
            {node.children.map((child, i) => (
              <div key={child.contact.id} className="flex flex-col items-center">
                {/* Vertical line from connector to child */}
                <div className="w-px bg-border" style={{ height: CONNECTOR_H / 2 }} />
                <TreeNodeRenderer node={child} isLast={i === node.children.length - 1} depth={depth + 1} assignmentMap={assignmentMap} en={en} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Missing Role Card ──────────────────────────────────── */
function MissingRoleCard({ role, onAdd, en = false }: { role: ContactRole; onAdd?: (role?: ContactRole) => void; en?: boolean }) {
  const roleConfig = ROLE_CONFIG[role];
  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-border/60 bg-sidebar/50 px-3 py-2.5" style={{ width: NODE_W }}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400 text-lg">❓</div>
      <p className="mt-1 text-xs font-medium text-muted text-center">{en ? "Missing " + roleLabel(role, en) : "缺少" + roleConfig.label}</p>
      {onAdd && (
        <button onClick={() => onAdd(role)} className="mt-1.5 text-xs font-medium text-accent hover:underline">{en ? "+ Add" : "+ 添加"}</button>
      )}
    </div>
  );
}

export function OrgMap({ accountId, contacts, onAddContact, teamAssignments: teamAssignmentsProp }: OrgMapProps) {
  const { locale } = useLocale();
  const en = locale === "en";
  const [fetchedAssignments, setFetchedAssignments] = useState<TeamAssignment[]>([]);

  useEffect(() => {
    if (teamAssignmentsProp || !accountId) return;
    fetch(`/api/team-assignments?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d) => { if (d.assignments) setFetchedAssignments(d.assignments); })
      .catch(() => {});
  }, [accountId, teamAssignmentsProp]);

  const assignments = teamAssignmentsProp ?? fetchedAssignments;
  const assignmentMap = new Map<string, TeamAssignment>();
  for (const a of assignments) assignmentMap.set(a.contactId, a);

  if (!contacts || contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm font-medium text-foreground">{en ? "No contact data yet" : "暂无联系人数据"}</p>
        <p className="mt-1 text-xs text-muted">
          {en ? "Add contacts to generate the org map automatically" : "添加联系人后将自动生成组织架构图"}
        </p>
        {onAddContact && (
          <button
            type="button"
            onClick={() => onAddContact()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
          >
            {en ? "Add contact" : "添加联系人"}
          </button>
        )}
      </div>
    );
  }

  // Role grouping
  const roleGroups = new Map<ContactRole, Contact[]>();
  for (const c of contacts) {
    const role = c.role ?? "unknown";
    if (!roleGroups.has(role)) roleGroups.set(role, []);
    roleGroups.get(role)!.push(c);
  }

  const missingRoles = REQUIRED_ROLES.filter((r) => !roleGroups.has(r));

  // Build tree → flatten to levels
  const tree = buildTree(contacts);
  const levels = flattenToLevels(tree);

  // Build display levels with missing role cards injected at appropriate tiers
  const displayLevels: DisplayItem[][] = levels.map((level) =>
    level.map((c) => ({ kind: "contact" as const, contact: c })),
  );

  const missingTargets: Partial<Record<ContactRole, number>> = {
    decision_maker: 0,
    champion: Math.min(1, displayLevels.length - 1),
    technical_evaluator: Math.min(2, displayLevels.length - 1),
  };
  for (const role of missingRoles) {
    const targetIdx = missingTargets[role] ?? 0;
    if (displayLevels[targetIdx]) {
      displayLevels[targetIdx].push({ kind: "missing", role });
    }
  }

  // Tree container width — based on widest level
  const maxInLevel = Math.max(...displayLevels.map((l) => l.length));
  const treeW = maxInLevel * (NODE_W + NODE_GAP) - NODE_GAP;

  return (
    <div className="space-y-6">
      {/* A. Coverage Panel */}
      <CoveragePanel roleGroups={roleGroups} onAddContact={onAddContact} en={en} />

      {/* B + C. Tree Chart */}
      <div className="rounded-xl border border-border bg-card p-6 overflow-x-auto">
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
          {en ? "Org Chart" : "组织架构"}
        </h4>
        <div className="flex flex-col items-center min-w-fit py-4">
          {/* Render tree recursively */}
          <div className="flex gap-6 justify-center">
            {tree.map((root, i) => (
              <TreeNodeRenderer key={root.contact.id} node={root} isLast={i === tree.length - 1} depth={0} assignmentMap={assignmentMap} en={en} />
            ))}
          </div>
          {/* Missing roles */}
          {missingRoles.length > 0 && (
            <div className="mt-6 pt-4 border-t border-dashed border-border/50 w-full">
              <p className="text-xs font-semibold text-muted mb-3 text-center">{en ? "Missing key roles" : "缺失的关键角色"}</p>
              <div className="flex gap-3 justify-center flex-wrap">
                {missingRoles.map((role) => (
                  <MissingRoleCard key={role} role={role} onAdd={onAddContact} en={en} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* D. Relationship Strength Legend */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {en ? "Relationship Strength Guide" : "关系强度说明"}
        </h4>
        <p className="text-xs text-muted mb-3">
          {en ? "Relationship strength (0-100) measures the quality of our relationship with each contact, combining interaction frequency, trust depth, and influence. Higher scores mean tighter access, smoother communication, and stronger decision impact." : "关系强度（0-100）衡量我们与该联系人的关系质量，综合互动频率、信任深度和影响力水平。数值越高，代表关系越紧密，沟通越顺畅，对决策的影响力越强。"}
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-8 rounded-full bg-green-500" />
            <span className="text-xs text-muted">{en ? "70-100 Strong" : "70-100 强关系"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-8 rounded-full bg-amber-400" />
            <span className="text-xs text-muted">{en ? "40-69 Moderate" : "40-69 一般"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-8 rounded-full bg-red-400" />
            <span className="text-xs text-muted">{en ? "0-39 Weak (needs work)" : "0-39 弱关系（需加强）"}</span>
          </div>
        </div>
      </div>

      {/* E. Influence / Support Matrix */}
      <InfluenceMatrix contacts={contacts} />
    </div>
  );
}
