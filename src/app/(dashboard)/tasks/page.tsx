"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { SpotlightTour } from "@/components/onboarding/SpotlightTour";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import {
  Plus,
  Zap,
  Calendar,
  X,
  Loader2,
  Ban,
  CheckSquare,
  Clock,
  CheckCircle2,
  Trash2,
  Paperclip,
  Upload,
  User,
  ExternalLink,
  Save,
  AlertTriangle,
  Tag,
  GripVertical,
  Search,
  ChevronDown,
  ChevronRight,
  Bot,
  LayoutGrid,
  Swords,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useSelection } from "@/hooks/use-selection";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import type { TaskStatus, TaskPriority, Task, TaskSource, TaskAttachment } from "@/lib/babel-engine/types";
import { formatFileSize } from "@/lib/format-utils";

// ─── Constants ──────────────────────────────────────────────────────

const COLUMNS: { status: TaskStatus; labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { status: "todo", labelKey: "tasks.todo", icon: CheckSquare },
  { status: "in_progress", labelKey: "tasks.inProgress", icon: Clock },
  { status: "blocked", labelKey: "tasks.blocked", icon: Ban },
  { status: "done", labelKey: "tasks.done", icon: CheckCircle2 },
];

const PRIORITY_CONFIG: Record<TaskPriority, { bg: string; text: string; dot: string; label: string }> = {
  low: { bg: "bg-green-600", text: "text-white", dot: "bg-white", label: "低" },
  medium: { bg: "bg-amber-500", text: "text-white", dot: "bg-white", label: "中" },
  high: { bg: "bg-red-500", text: "text-white", dot: "bg-white", label: "高" },
  urgent: { bg: "bg-red-700", text: "text-white", dot: "bg-white", label: "紧急" },
};

const PRIORITY_LABELS_EN: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const COLUMN_ACCENT: Record<TaskStatus, { header: string; border: string; count: string }> = {
  todo: { header: "text-foreground font-bold", border: "border-slate-400 dark:border-slate-500", count: "bg-slate-600 text-white" },
  in_progress: { header: "text-foreground font-bold", border: "border-blue-500 dark:border-blue-600", count: "bg-blue-700 text-white" },
  done: { header: "text-foreground font-bold", border: "border-green-500 dark:border-green-600", count: "bg-green-700 text-white" },
  blocked: { header: "text-danger font-bold", border: "border-red-500 dark:border-red-600", count: "bg-red-600 text-white" },
};

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const SOURCE_LABELS: Record<TaskSource, { zh: string; color: string }> = {
  manual: { zh: "手动", color: "bg-gray-500 text-white" },
  decode: { zh: "解读", color: "bg-purple-600 text-white" },
  intel: { zh: "情报", color: "bg-blue-600 text-white" },
  meddicc: { zh: "MEDDICC", color: "bg-green-600 text-white" },
  strategic_play: { zh: "谋局", color: "bg-orange-500 text-white" },
  system: { zh: "系统", color: "bg-teal-600 text-white" },
};

const LABEL_COLORS = [
  "bg-indigo-600/15 text-indigo-400 dark:text-indigo-300",
  "bg-pink-600/15 text-pink-400 dark:text-pink-300",
  "bg-cyan-600/15 text-cyan-400 dark:text-cyan-300",
  "bg-orange-600/15 text-orange-400 dark:text-orange-300",
  "bg-emerald-600/15 text-emerald-400 dark:text-emerald-300",
  "bg-violet-600/15 text-violet-400 dark:text-violet-300",
];

function getLabelColor(label: string): string {
  const idx = label.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % LABEL_COLORS.length;
  return LABEL_COLORS[idx];
}

// ─── File Upload Constants ──────────────────────────────────────────

const ACCEPTED_FILE_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ─── Assignee Avatar ────────────────────────────────────────────────

function AssigneeAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initial = name.trim().charAt(0).toUpperCase();
  const sizeClasses = size === "sm" ? "h-6 w-6 text-[13px]" : "h-8 w-8 text-sm";
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-indigo-500"];
  const colorIdx = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return (
    <div className={`${sizeClasses} ${colors[colorIdx]} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ring-2 ring-white dark:ring-gray-800`} title={name}>
      {initial}
    </div>
  );
}

// ─── Assignee Picker (组织成员下拉选择) ──────────────────────────────

function AssigneePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLocale();
  const { orgMembers } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return orgMembers;
    const q = search.toLowerCase();
    return orgMembers.filter((m) =>
      (m.displayName?.toLowerCase().includes(q)) || (m.email?.toLowerCase().includes(q))
    );
  }, [orgMembers, search]);

  // value is now a userId — resolve to display name
  const resolvedName = useMemo(() => {
    if (!value) return "";
    const m = orgMembers.find((m) => m.userId === value);
    return m?.displayName || m?.email || value;
  }, [value, orgMembers]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="form-input flex items-center gap-2 text-left w-full cursor-pointer"
      >
        {value ? (
          <span className="flex items-center gap-2 flex-1 min-w-0">
            <AssigneeAvatar name={resolvedName} size="sm" />
            <span className="truncate text-sm">{resolvedName}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 flex-1 min-w-0 text-muted">
            <User className="h-4 w-4" />
            <span className="text-sm">未分配</span>
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl max-h-60 overflow-hidden">
          {/* 搜索框 */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("tasks.searchMember")}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-44">
            {/* 未分配选项（始终显示在第一位） */}
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar transition-colors ${
                !value ? "bg-accent/10" : ""
              }`}
            >
              <User className="h-6 w-6 text-muted rounded-full bg-sidebar flex items-center justify-center flex-shrink-0 p-1" />
              <span className="text-muted">未分配</span>
            </button>
            {/* 组织成员列表 */}
            {filtered.map((m) => {
              const label = m.displayName || m.email || m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => { onChange(m.userId); setOpen(false); setSearch(""); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-sidebar transition-colors ${
                    value === m.userId ? "bg-accent/10" : ""
                  }`}
                >
                  <AssigneeAvatar name={m.displayName || m.email || "?"} size="sm" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="truncate font-medium text-foreground">{m.displayName || m.email}</div>
                    {m.displayName && m.email && (
                      <div className="truncate text-xs text-muted">{m.email}</div>
                    )}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm text-muted text-center">无匹配成员</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Label Tag Input ────────────────────────────────────────────────

function LabelInput({ labels, onChange }: { labels: string[]; onChange: (labels: string[]) => void }) {
  const { t } = useLocale();
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      const val = input.trim();
      if (!labels.includes(val)) {
        onChange([...labels, val]);
      }
      setInput("");
    }
    if (e.key === "Backspace" && !input && labels.length > 0) {
      onChange(labels.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent/30 focus-within:border-accent transition-colors">
      {labels.map((label) => (
        <span key={label} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${getLabelColor(label)}`}>
          {label}
          <button type="button" onClick={() => onChange(labels.filter((l) => l !== label))} className="hover:opacity-70">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={labels.length === 0 ? t("tasks.labelsPlaceholder") : ""}
        className="flex-1 min-w-[100px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
      />
    </div>
  );
}


// ─── Task Card (Jira-style) ─────────────────────────────────────────

function TaskCard({ task, onClick, isSelected, onToggleSelect, aiHighlight }: {
  task: Task;
  onClick: (task: Task) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  aiHighlight?: boolean;
}) {
  const { locale } = useLocale();
  const en = locale === "en";
  const { accounts } = useRoleFilteredData();
  const { orgMembers } = useAuth();
  const account = task.accountId ? accounts.find((a) => a.id === task.accountId) : undefined;
  const prio = PRIORITY_CONFIG[task.priority];

  // eslint-disable-next-line react-hooks/purity -- Date comparison needed for overdue detection
  const nowMs = Date.now();
  const isOverdue = task.status !== 'done' && task.dueDate && new Date(task.dueDate) < new Date();
  const isDueSoon = task.status !== 'done' && task.dueDate && !isOverdue && new Date(task.dueDate) <= new Date(nowMs + 2 * 86400000);
  const needsAttention = aiHighlight || isOverdue || task.priority === "urgent";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        (e.currentTarget as HTMLElement).classList.add("opacity-40", "scale-95");
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("opacity-40", "scale-95");
      }}
      onClick={() => onClick(task)}
      className={`group rounded-lg border p-3 transition-shadow hover:shadow-lg cursor-grab active:cursor-grabbing select-none ${
        needsAttention
          ? "border-red-400 bg-red-50/50 dark:bg-red-900/10 shadow-[0_0_0_1px_rgba(239,68,68,0.15)]"
          : "border-border bg-card hover:border-accent/40"
      }`}
    >
      {/* Checkbox + Labels row */}
      <div className="flex items-center gap-2 mb-1">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-border accent-accent cursor-pointer flex-shrink-0"
          />
        )}
      </div>
      {/* Labels row */}
      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map((label) => (
            <span key={label} className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${getLabelColor(label)}`}>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted/60 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {task.aiGenerated && <Zap className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
            <h4 className="text-sm font-medium text-foreground leading-snug line-clamp-2">{task.title}</h4>
          </div>
        </div>
      </div>

      {/* Description preview */}
      {task.description && (
        <p className="mt-1.5 text-xs text-muted line-clamp-2 pl-6">{task.description}</p>
      )}

      {/* Meta row */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Priority badge */}
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-semibold ${prio.bg} ${prio.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${prio.dot}`} />
            {en ? PRIORITY_LABELS_EN[task.priority] : prio.label}
          </span>

          {/* Account badge */}
          {account && (
            <Link
              href={`/accounts/${account.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center rounded-md bg-accent/10 px-1.5 py-0.5 text-[13px] font-medium text-accent hover:bg-accent/20 transition-colors"
            >
              {account.name}
            </Link>
          )}

          {/* Due date */}
          {task.dueDate && (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium ${
              isOverdue ? "bg-red-600 text-white" : isDueSoon ? "bg-orange-500 text-white" : "bg-sidebar text-secondary"
            }`}>
              <Calendar className="h-3 w-3" />
              {task.dueDate}
            </span>
          )}

          {/* Attachment indicator */}
          {task.attachments && task.attachments.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-muted text-[13px]">
              <Paperclip className="h-3 w-3" />
              {task.attachments.length}
            </span>
          )}
        </div>

        {/* 负责人头像 + 名字 */}
        {task.assignedTo && (() => {
          const m = orgMembers.find((m) => m.userId === task.assignedTo);
          const name = m?.displayName || m?.email || task.assignedTo;
          return (
            <span className="flex items-center gap-1.5 min-w-0">
              <AssigneeAvatar name={name} />
              <span className="text-[13px] text-secondary truncate max-w-[80px]">{name}</span>
            </span>
          );
        })()}
      </div>

      {/* AI attention hint */}
      {needsAttention && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-700 px-2.5 py-1.5 text-[13px] text-white">
          <Bot className="h-3 w-3 flex-shrink-0 mt-0.5" />
          <span>
            {isOverdue ? (en ? "Overdue. Handle now or adjust the due date." : "已逾期，建议立即处理或调整截止日期") : task.priority === "urgent" ? (en ? "Urgent task. Recommended for today." : "紧急任务，建议今日内完成") : (en ? "AI marked this task for attention" : "AI 标记为需要关注")}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── New Task Modal ─────────────────────────────────────────────────

function NewTaskModal({ open, onClose, defaultStatus }: { open: boolean; onClose: () => void; defaultStatus?: TaskStatus }) {
  const { t } = useLocale();
  const { accounts, opportunities } = useRoleFilteredData();
  const addTask = useStore((s) => s.addTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [accountId, setAccountId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labels, setLabels] = useState<string[]>([]);

  const filteredOpportunities = useMemo(() => {
    if (!accountId) return [];
    return opportunities.filter((o) => o.accountId === accountId);
  }, [accountId, opportunities]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset dependent select when parent changes
    setOpportunityId("");
  }, [accountId]);

  function handleCreate() {
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      description: description.trim() || undefined,
      status: defaultStatus || "todo",
      priority,
      accountId: accountId || undefined,
      opportunityId: opportunityId || undefined,
      assignedTo: assignee.trim() || undefined,
      dueDate: dueDate || undefined,
      labels: labels.length > 0 ? labels : undefined,
      source: "manual",
      aiGenerated: false,
    });
    setTitle(""); setDescription(""); setPriority("medium"); setAccountId(""); setOpportunityId(""); setAssignee(""); setDueDate(""); setLabels([]);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-lg font-bold text-foreground">{t("tasks.newTask")}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sidebar hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {/* Title */}
          <div>
            <label className="form-label">{t("tasks.taskTitle")} <span className="text-danger">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("tasks.taskTitlePlaceholder")} className="form-input" autoFocus />
          </div>

          {/* Description */}
          <div>
            <label className="form-label">{t("tasks.taskDescription")}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("tasks.taskDescriptionPlaceholder")} className="form-input min-h-[80px] resize-none" rows={3} />
          </div>

          {/* 优先级 + 负责人 — 移动端单列 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("tasks.filterPriority")}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="form-select">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{t(`tasks.priority.${p}` as TranslationKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("tasks.assignee")}</label>
              <AssigneePicker value={assignee} onChange={setAssignee} />
            </div>
          </div>

          {/* 客户 + 机会 — 移动端单列 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("tasks.account")}</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="form-select">
                <option value="">{t("tasks.selectAccount")}</option>
                {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("tasks.opportunity")}</label>
              <select value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} className="form-select" disabled={!accountId}>
                <option value="">{t("tasks.selectOpportunity")}</option>
                {filteredOpportunities.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="form-label">{t("tasks.dueDate")}</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="form-input" />
          </div>

          {/* Labels */}
          <div>
            <label className="form-label">{t("tasks.labels")}</label>
            <LabelInput labels={labels} onChange={setLabels} />
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:bg-sidebar">
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("tasks.create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Column ──────────────────────────────────────────────────

function KanbanColumn({ col, tasks, onDrop, onCardClick, onAddTask, isSelected, onToggleSelect }: {
  col: typeof COLUMNS[number];
  tasks: Task[];
  onDrop: (taskId: string, status: TaskStatus) => void;
  onCardClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  isSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const { t } = useLocale();
  const [dragOver, setDragOver] = useState(false);
  const accent = COLUMN_ACCENT[col.status];
  const Icon = col.icon;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onDrop(taskId, col.status);
  }, [col.status, onDrop]);

  return (
    <div
      className={`flex flex-col rounded-xl border-2 transition-colors min-h-[200px] md:min-h-[400px] ${
        dragOver
          ? `${accent.border} bg-accent/5 shadow-lg scale-[1.01]`
          : "border-border bg-sidebar/30"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accent.header}`} />
          <span className={`text-sm font-bold ${accent.header}`}>{t(col.labelKey)}</span>
          <span className={`flex h-5 min-w-5 items-center justify-center rounded-full text-xs font-bold ${accent.count}`}>
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(col.status)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-sidebar hover:text-foreground transition-colors"
          title={t("tasks.newTask")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 p-3 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className={`py-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
            dragOver ? "border-accent/40 bg-accent/5" : "border-border"
          }`}>
            <Icon className="h-5 w-5 text-muted/60 mb-2" />
            <p className="text-xs font-medium text-muted">{t("tasks.noTasks")}</p>
            <p className="text-[12px] text-muted/60 mt-1">{t("tasks.dragHint")}</p>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={onCardClick} isSelected={isSelected?.(task.id)} onToggleSelect={onToggleSelect} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── AI Assessment Modal ─────────────────────────────────────────────

function renderInlineMd(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  let lastIndex = 0, match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) parts.push(<strong key={match.index}>{token.slice(2,-2)}</strong>);
    else if (token.startsWith('*') && token.endsWith('*')) parts.push(<em key={match.index}>{token.slice(1,-1)}</em>);
    else if (token.startsWith('`') && token.endsWith('`')) parts.push(<code key={match.index} className="bg-muted px-1 rounded text-xs">{token.slice(1,-1)}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function AIAssessModal({ open, onClose, result, loading }: { open: boolean; onClose: () => void; result: string | null; loading: boolean }) {
  const { t } = useLocale();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-bold text-foreground">{t("tasks.aiAssessTitle")}</h3>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sidebar hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{t("tasks.aiAssessing")}</p>
                <p className="mt-1 text-xs text-muted">AI 正在分析任务分布、逾期风险和优先级...</p>
              </div>
              {/* 骨架屏预览 */}
              <div className="w-full max-w-md space-y-3 pt-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="skeleton h-3 w-32 rounded" />
                    <div className="skeleton h-3 w-full rounded" />
                    <div className="skeleton h-3 w-2/3 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : result ? (
            <div className="max-w-none text-sm text-foreground leading-relaxed space-y-2">
              {result.split('\n').map((line, i) => {
                // Headers
                if (line.startsWith('### ')) return <h3 key={i} className="font-bold text-foreground mt-4 mb-1">{line.slice(4)}</h3>;
                if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-foreground text-base mt-4 mb-1">{line.slice(3)}</h2>;
                if (line.startsWith('# ')) return <h1 key={i} className="font-bold text-foreground text-lg mt-4 mb-1">{line.slice(2)}</h1>;
                // List items
                if (line.match(/^[-*] /)) return <li key={i} className="ml-4 list-disc text-foreground">{renderInlineMd(line.slice(2))}</li>;
                if (line.match(/^\d+\. /)) return <li key={i} className="ml-4 list-decimal text-foreground">{renderInlineMd(line.replace(/^\d+\. /, ''))}</li>;
                // Empty line
                if (!line.trim()) return <div key={i} className="h-2" />;
                // Normal line
                return <p key={i} className="text-foreground">{renderInlineMd(line)}</p>;
              })}
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-8">{t("tasks.aiAssessEmpty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Play Data Type (for fetched plays) ─────────────────────────────

interface PlayData {
  id: string;
  accountId: string;
  goalDescription: string;
  confidence: number;
  momentum: string;
  status: string;
  steps: { index: number; title: string; status: string }[];
}

const MOMENTUM_CONFIG: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-green-500", label: "推进中" },
  stalled: { dot: "bg-amber-500", label: "停滞" },
  blocked: { dot: "bg-red-500", label: "阻塞" },
  paused: { dot: "bg-gray-400", label: "暂停" },
};

// ─── Compact Task Card (for play swim lanes) ────────────────────────

function CompactTaskCard({ task, onClick }: { task: Task; onClick: (task: Task) => void }) {
  const { locale } = useLocale();
  const en = locale === "en";
  const { orgMembers } = useAuth();
  const prio = PRIORITY_CONFIG[task.priority];
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

  return (
    <button
      onClick={() => onClick(task)}
      className={`w-full text-left rounded-lg border px-2.5 py-2 transition-shadow hover:shadow-md cursor-pointer ${
        isOverdue
          ? "border-red-400/60 bg-red-50/40 dark:bg-red-900/10"
          : "border-border bg-card hover:border-accent/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${prio.bg}`} title={en ? PRIORITY_LABELS_EN[task.priority] : prio.label} />
        <span className="text-xs text-foreground leading-snug line-clamp-2 flex-1">{task.title}</span>
      </div>
      {(task.dueDate || task.assignedTo) && (
        <div className="flex items-center gap-2 mt-1 pl-4">
          {task.dueDate && (
            <span className={`text-[12px] ${isOverdue ? "text-red-500 font-medium" : "text-muted"}`}>
              {task.dueDate}
            </span>
          )}
          {task.assignedTo && (() => {
            const m = orgMembers.find((m) => m.userId === task.assignedTo);
            return <span className="text-[12px] text-muted truncate max-w-[60px]">{m?.displayName || m?.email || task.assignedTo}</span>;
          })()}
        </div>
      )}
    </button>
  );
}

// ─── Play Swim Lane ─────────────────────────────────────────────────

function PlaySwimLane({ group, playData, onCardClick, onDrop, defaultCollapsed }: {
  group: { name: string; tasks: Task[] };
  playData?: PlayData;
  onCardClick: (task: Task) => void;
  onDrop: (taskId: string, status: TaskStatus) => void;
  defaultCollapsed?: boolean;
}) {
  const { locale } = useLocale();
  const en = locale === "en";
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  const todoTasks = group.tasks.filter(t => t.status === "todo");
  const inProgressTasks = group.tasks.filter(t => t.status === "in_progress");
  const doneTasks = group.tasks.filter(t => t.status === "done");

  // Sort by step number (extract from title), then priority
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortTasks = (tasks: Task[]) => tasks.sort((a, b) => {
    const stepA = a.title.match(/Step\s*(\d+)/i)?.[1];
    const stepB = b.title.match(/Step\s*(\d+)/i)?.[1];
    if (stepA && stepB) return Number(stepA) - Number(stepB);
    if (stepA) return -1;
    if (stepB) return 1;
    return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
  });

  const sortedTodo = sortTasks([...todoTasks]);
  const sortedInProgress = sortTasks([...inProgressTasks]);
  const sortedDone = sortTasks([...doneTasks]);

  const completedCount = doneTasks.length;
  const totalCount = group.tasks.length;
  const momentum = playData ? MOMENTUM_CONFIG[playData.momentum] ?? MOMENTUM_CONFIG.active : null;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const makeDrop = useCallback((status: TaskStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onDrop(taskId, status);
  }, [onDrop]);

  return (
    <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full border-b border-border px-4 py-3 bg-background/60 hover:bg-sidebar/30 transition-colors text-left"
      >
        <ChevronRight className={`h-4 w-4 text-muted transition-transform ${collapsed ? "" : "rotate-90"}`} />
        {group.name !== "其他任务" ? (
          <Swords className="h-4 w-4 text-accent" />
        ) : (
          <CheckSquare className="h-4 w-4 text-secondary" />
        )}
        <span className="text-sm font-semibold text-foreground flex-1">{en && group.name === "其他任务" ? "Other tasks" : group.name}</span>
        {momentum && (
          <>
            <span className={`h-2 w-2 rounded-full ${momentum.dot}`} />
            <span className="text-[13px] text-muted">{en ? playData?.momentum.replaceAll("_", " ") : momentum.label}</span>
          </>
        )}
        {playData && (
          <span className="text-[13px] text-muted">{playData.confidence}%</span>
        )}
        <span className="text-xs text-muted tabular-nums">{completedCount}/{totalCount} {en ? "done" : "完成"}</span>
      </button>

      {/* Swim lane columns */}
      {!collapsed && (
        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-y-0 md:divide-x min-h-[120px]">
          {/* 待办 */}
          <div
            className="p-2"
            onDragOver={handleDragOver}
            onDrop={makeDrop("todo")}
          >
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <CheckSquare className="h-3 w-3 text-muted" />
              <span className="text-[13px] font-semibold text-muted">待办</span>
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-600 text-[12px] font-bold text-white">
                {sortedTodo.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {sortedTodo.map(task => (
                <CompactTaskCard key={task.id} task={task} onClick={onCardClick} />
              ))}
            </div>
          </div>

          {/* 进行中 */}
          <div
            className="p-2"
            onDragOver={handleDragOver}
            onDrop={makeDrop("in_progress")}
          >
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <Clock className="h-3 w-3 text-blue-500" />
              <span className="text-[13px] font-semibold text-muted">进行中</span>
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-700 text-[12px] font-bold text-white">
                {sortedInProgress.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {sortedInProgress.map(task => (
                <CompactTaskCard key={task.id} task={task} onClick={onCardClick} />
              ))}
            </div>
          </div>

          {/* 已完成 */}
          <div
            className="p-2"
            onDragOver={handleDragOver}
            onDrop={makeDrop("done")}
          >
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-[13px] font-semibold text-muted">已完成</span>
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-green-700 text-[12px] font-bold text-white">
                {sortedDone.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {sortedDone.map(task => (
                <CompactTaskCard key={task.id} task={task} onClick={onCardClick} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function TasksPage() {
  const { t, locale } = useLocale();
  const en = locale === "en";
  const moveTask = useStore((s) => s.moveTask);
  const { accounts, tasks } = useRoleFilteredData();

  const [viewMode, setViewMode] = useState<"kanban" | "by-play">("kanban");
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskDefaultStatus, setNewTaskDefaultStatus] = useState<TaskStatus>("todo");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterAccount, setFilterAccount] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showAIAssess, setShowAIAssess] = useState(false);
  const [batchStatus, setBatchStatus] = useState<TaskStatus | "">("");
  const [aiAssessResult, setAiAssessResult] = useState<string | null>(null);
  const [aiAssessLoading, setAiAssessLoading] = useState(false);
  const aiAutoRanRef = useRef(false);

  // ── 谋局数据 (for play view + AI brief) ──
  const [plays, setPlays] = useState<PlayData[]>([]);
  const playsLoadedRef = useRef(false);

  useEffect(() => {
    if (playsLoadedRef.current) return;
    playsLoadedRef.current = true;
    fetch("/api/strategic-play")
      .then(r => r.json())
      .then(data => setPlays(data.plays ?? []))
      .catch(() => {});
  }, []);

  // ── 批量选择 ──
  const selection = useSelection(tasks);
  const updateTask = useStore((s) => s.updateTask);

  function handleBatchStatusChange(newStatus: TaskStatus) {
    selection.selectedIds.forEach(id => {
      if (newStatus === 'done') {
        moveTask(id, newStatus);
      } else {
        updateTask(id, { status: newStatus });
      }
    });
    selection.clearAll();
    setBatchStatus("");
  }

  const currentSelectedTask = useMemo(() => {
    if (!selectedTask) return null;
    return tasks.find((t) => t.id === selectedTask.id) || null;
  }, [tasks, selectedTask]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    if (filterAccount && task.accountId !== filterAccount) return false;
    if (filterPriority && task.priority !== filterPriority) return false;
    return true;
  }), [tasks, filterAccount, filterPriority]);

  const taskAccountIds = useMemo(() => [...new Set(tasks.map((t) => t.accountId).filter(Boolean))], [tasks]);
  const taskAccounts = useMemo(() => accounts.filter((a) => taskAccountIds.includes(a.id)), [accounts, taskAccountIds]);

  // Group tasks by play (for play view)
  const tasksByPlay = useMemo(() => {
    // Build play lookup by ID and accountId
    const playById = new Map(plays.map(p => [p.id, p]));
    const playsByAccount = new Map<string, PlayData[]>();
    for (const p of plays) {
      const list = playsByAccount.get(p.accountId) ?? [];
      list.push(p);
      playsByAccount.set(p.accountId, list);
    }

    const playGroups = new Map<string, { play: PlayData; tasks: Task[] }>();
    const other: Task[] = [];

    for (const task of filteredTasks) {
      let matched = false;

      // 1. Match by sourceId (direct play link)
      if (task.sourceId && playById.has(task.sourceId)) {
        const play = playById.get(task.sourceId)!;
        const group = playGroups.get(play.id) ?? { play, tasks: [] };
        group.tasks.push(task);
        playGroups.set(play.id, group);
        matched = true;
      }

      // 2. Match by source type or label
      if (!matched) {
        const playLabel = (task.labels ?? []).find(l => l.includes("谋局"));
        if (task.source === "strategic_play" || playLabel) {
          // Try to match to a play by label content
          const matchedPlay = plays.find(p =>
            (playLabel && (playLabel.includes(p.goalDescription.slice(0, 15)) || p.goalDescription.includes(playLabel.replace(/^谋局[:：]\s*/, "")))) ||
            (task.accountId && p.accountId === task.accountId)
          );
          if (matchedPlay) {
            const group = playGroups.get(matchedPlay.id) ?? { play: matchedPlay, tasks: [] };
            group.tasks.push(task);
            playGroups.set(matchedPlay.id, group);
            matched = true;
          }
        }
      }

      // 3. Match by accountId — group under the account's play if only one exists
      if (!matched && task.accountId) {
        const accountPlays = playsByAccount.get(task.accountId);
        if (accountPlays?.length === 1) {
          const play = accountPlays[0];
          const group = playGroups.get(play.id) ?? { play, tasks: [] };
          group.tasks.push(task);
          playGroups.set(play.id, group);
          matched = true;
        }
      }

      if (!matched) {
        other.push(task);
      }
    }

    const result: { name: string; tasks: Task[]; playData?: PlayData }[] = [];
    for (const [, { play, tasks }] of playGroups) {
      const accountName = accounts.find(a => a.id === play.accountId)?.name ?? '';
      const displayName = accountName ? `${accountName} — ${play.goalDescription}` : play.goalDescription;
      result.push({ name: displayName, tasks, playData: play });
    }
    // Sort: plays with in_progress tasks first, then plays with todo only, then 其他 last
    result.sort((a, b) => {
      const aInProgress = a.tasks.some(t => t.status === "in_progress") ? 0 : 1;
      const bInProgress = b.tasks.some(t => t.status === "in_progress") ? 0 : 1;
      if (aInProgress !== bInProgress) return aInProgress - bInProgress;
      const aTodo = a.tasks.some(t => t.status === "todo") ? 0 : 1;
      const bTodo = b.tasks.some(t => t.status === "todo") ? 0 : 1;
      return aTodo - bTodo;
    });
    if (other.length > 0) result.push({ name: "其他任务", tasks: other });
    return result;
  }, [filteredTasks, plays]);

  // Summary stats
  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const overdue = filteredTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length;
    const blocked = filteredTasks.filter((t) => t.status === "blocked").length;
    const inProgress = filteredTasks.filter((t) => t.status === "in_progress").length;
    const done = filteredTasks.filter((t) => t.status === "done").length;
    return { total, overdue, blocked, inProgress, done };
  }, [filteredTasks]);

  // Silent background AI brief (no modal)
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [aiBriefLoading, setAiBriefLoading] = useState(false);

  async function runAiBrief() {
    if (tasks.length === 0) return;
    setAiBriefLoading(true);
    const activeTasks = tasks.filter((t) => t.status !== "done");
    const overdue = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date());
    const today = new Date().toISOString().split("T")[0];

    const taskDetails = activeTasks.slice(0, 20).map((t) => ({
      title: t.title.slice(0, 60),
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate || (en ? "No due date" : "无截止"),
      account: accounts.find((a) => a.id === t.accountId)?.name || (en ? "Unlinked" : "未关联"),
    }));

    const playContext = plays.map(p => {
      const completed = (p.steps ?? []).filter((s: { status: string }) => s.status === "completed").length;
      const total = (p.steps ?? []).length;
      return `${p.goalDescription} | ${p.momentum} | ${p.confidence}% | ${completed}/${total} ${en ? "steps done" : "步完成"}`;
    }).join("\n");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: en ? `Today is ${today}. You are an AI advisor for B2B sales execution. Analyze the task board and provide a brief.

Play status:
${playContext || "No strategic plays yet"}

Task data (top 20):
${JSON.stringify(taskDetails, null, 1)}

Stats: ${tasks.length} tasks total, ${overdue.length} overdue

Output in markdown, no more than 5 lines:
1. **Overall status**: one sentence plus reason
2. **Most urgent**: 1-2 items that must be handled today and why
3. **Play recommendation**: which play should move first and why

All output must be in English` : `今天是 ${today}。你是销售谋局执行 AI 顾问。请分析任务看板并给出简报。

谋局状态：
${playContext || "暂无谋局计划"}

任务数据（前20项）：
${JSON.stringify(taskDetails, null, 1)}

统计：共 ${tasks.length} 项，${overdue.length} 项逾期

请输出（用 markdown，不超过 5 行）：
1. **整体状态**：一句话（好/需关注/有风险）+ 原因
2. **最紧急**：1-2 项必须今天处理的，说清为什么
3. **谋局建议**：哪个谋局该优先推进，为什么

所有输出必须为中文`,
          context: { currentPage: "/tasks", taskCount: tasks.length, outputLocale: locale },
        }),
      });
      const data = await res.json();
      setAiBrief(data.reply || null);
    } catch { /* silent */ }
    finally { setAiBriefLoading(false); }
  }

  async function handleAIAssess() {
    if (tasks.length === 0) return;
    setShowAIAssess(true);
    setAiAssessLoading(true);
    setAiAssessResult(null);

    const taskSummary = tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignedTo: t.assignedTo,
      dueDate: t.dueDate,
      labels: t.labels,
      source: t.source,
      aiGenerated: t.aiGenerated,
    }));

    const today = new Date().toISOString().split("T")[0];
    const message = `请对以下任务看板进行全面评估分析（今天是 ${today}）：

任务数据：
${JSON.stringify(taskSummary, null, 2)}

请分析：
1. **任务完成度评分**（0-100分）：基于各状态任务的分布给出综合评分
2. **逾期风险预警**：列出已逾期或即将逾期的任务，标注风险等级
3. **建议下一步优先级**：根据优先级、截止日期和当前状态，建议应该优先处理的 Top 3 任务
4. **整体建议**：对团队任务管理的改进建议`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          context: { currentPage: "/tasks", taskCount: tasks.length },
        }),
      });
      const data = await res.json();
      setAiAssessResult(data.reply || "无法获取评估结果");
    } catch {
      setAiAssessResult("AI 服务暂时不可用，请稍后再试。");
    } finally {
      setAiAssessLoading(false);
    }
  }

  // Auto-run AI brief on first load (silent, no modal)
  useEffect(() => {
    if (!aiAutoRanRef.current && tasks.length > 0) {
      aiAutoRanRef.current = true;
      runAiBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length]);

  function handleDrop(taskId: string, status: TaskStatus) {
    moveTask(taskId, status);
  }

  function handleAddTask(status: TaskStatus) {
    setNewTaskDefaultStatus(status);
    setShowNewTask(true);
  }

  return (
    <div className="page-shell-wide">
      <SpotlightTour tourKey="tasks" steps={[
        { target: "body", title: en ? "Tasks - Execution Board" : "任务 — 执行看板", content: en ? "Track all next actions. Tasks can come from play steps or be created manually. Use board view or group by play." : "追踪所有待办事项。可以从谋局步骤直接生成任务，也可以手动创建。支持看板和按谋局分组两种视图。试试「按谋局」视图，按策略维度管理你的任务。", position: "bottom" },
      ]} />
      <div className="page-hero">
        <div className="page-hero-row">
          <div>
            <div className="page-kicker">{en ? "Task Pulse" : "任务脉搏"}</div>
            <h1 className="page-title">{t("tasks.title")}</h1>
            <p className="page-subtitle">{t("tasks.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={handleAIAssess}
            disabled={aiAssessLoading || tasks.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:pointer-events-none sm:px-4 sm:py-2.5"
          >
            {aiAssessLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            <span className="hidden sm:inline">{t("tasks.aiAssess")}</span>
            <span className="sm:hidden">AI</span>
          </button>
          <button
            onClick={() => { setNewTaskDefaultStatus("todo"); setShowNewTask(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover transition-colors sm:px-5 sm:py-2.5"
          >
            <Plus className="h-4 w-4" />
            {t("tasks.newTask")}
          </button>
        </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm sm:gap-6">
          <div className="page-meta">{en ? stats.total + " tasks" : stats.total + " 项任务"}</div>
          {stats.overdue > 0 && (
            <div className="page-meta">{en ? stats.overdue + " overdue" : stats.overdue + " 已逾期"}</div>
          )}
          <div className="page-meta">{en ? stats.inProgress + " in progress" : stats.inProgress + " 进行中"}</div>
          <div className="page-meta">{en ? stats.done + " done" : stats.done + " 已完成"}</div>
        </div>
      </div>

      {/* AI Brief Bar */}
      {(aiBrief || aiBriefLoading) && (
        <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border-subtle bg-background/60 px-4 py-2.5">
            <Bot className="h-4 w-4 text-accent" />
            <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent">{en ? "AI Task Brief" : "AI 任务简报"}</span>
            {!aiBriefLoading && (
              <button onClick={runAiBrief} className="ml-auto text-[13px] text-secondary hover:text-accent transition-colors">{en ? "Refresh" : "刷新"}</button>
            )}
          </div>
          <div className="px-4 py-3">
            {aiBriefLoading ? (
              <div className="flex items-center gap-2 text-xs text-secondary py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                {en ? "AI is analyzing the task board..." : "AI 正在分析任务看板..."}
              </div>
            ) : (
              <div
                className="text-sm text-foreground leading-relaxed [&_strong]:font-semibold [&_strong]:text-foreground [&_br+br]:block [&_br+br]:h-1"
                dangerouslySetInnerHTML={{
                  // Escape HTML first to prevent XSS from AI-generated content,
                  // then apply lightweight markdown-like formatting.
                  __html: (aiBrief ?? "")
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^\- /gm, '• ')
                    .replace(/^\d+\.\s/gm, (m) => `<span class="font-semibold text-accent">${m}</span>`)
                    .replace(/\n/g, '<br/>')
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* 筛选器 + 视图切换 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="form-select text-sm sm:max-w-[200px]">
            <option value="">{t("tasks.allAccounts")}</option>
            {taskAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="form-select text-sm sm:max-w-[160px]">
            <option value="">{t("tasks.allPriorities")}</option>
            {PRIORITIES.map((p) => (<option key={p} value={p}>{t(`tasks.priority.${p}` as TranslationKey)}</option>))}
          </select>
        </div>
        <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
          <button
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "kanban" ? "bg-accent text-white" : "text-secondary hover:text-foreground"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {en ? "Board" : "看板"}
          </button>
          <button
            onClick={() => setViewMode("by-play")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "by-play" ? "bg-accent text-white" : "text-secondary hover:text-foreground"}`}
          >
            <Swords className="h-3.5 w-3.5" />
            {en ? "By play" : "按谋局"}
          </button>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selection.count > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 mb-3">
          <span className="text-sm font-medium text-accent">{en ? selection.count + " selected" : "已选 " + selection.count + " 项"}</span>
          <select
            value={batchStatus}
            onChange={(e) => {
              if (e.target.value) handleBatchStatusChange(e.target.value as TaskStatus);
            }}
            className="rounded-lg border border-accent/30 bg-card px-2 py-1 text-xs text-accent"
          >
            <option value="">{en ? "Batch status..." : "批量改状态..."}</option>
            <option value="todo">{en ? "To do" : "待办"}</option>
            <option value="in_progress">{en ? "In progress" : "进行中"}</option>
            <option value="done">{en ? "Done" : "已完成"}</option>
          </select>
          <button onClick={selection.clearAll} className="ml-auto text-xs text-muted hover:text-foreground">{en ? "Clear selection" : "取消选择"}</button>
        </div>
      )}

      {/* 全局空状态：没有任何任务时显示引导 */}
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-20 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-sidebar">
            <CheckSquare className="h-6 w-6 text-muted" />
          </div>
          <p className="text-base font-semibold text-foreground">{t("tasks.emptyTitle")}</p>
          <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-secondary">
            {t("tasks.emptyHint")}
          </p>
          <button
            onClick={() => { setNewTaskDefaultStatus("todo"); setShowNewTask(true); }}
            className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            {t("tasks.newTask")}
          </button>
        </div>
      ) : viewMode === "kanban" ? (
        /* Kanban Board — 4 columns */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 md:gap-5">
          {COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status);
            return (
              <KanbanColumn
                key={col.status}
                col={col}
                tasks={colTasks}
                onDrop={handleDrop}
                onCardClick={setSelectedTask}
                onAddTask={handleAddTask}
                isSelected={selection.isSelected}
                onToggleSelect={selection.toggle}
              />
            );
          })}
        </div>
      ) : (
        /* Play View — swim lanes with mini-columns */
        <div className="space-y-4">
          {tasksByPlay.length === 0 && (
            <p className="text-sm text-secondary italic">暂无任务</p>
          )}
          {tasksByPlay.map((group) => (
            <PlaySwimLane
              key={group.name}
              group={group}
              playData={group.playData}
              onCardClick={setSelectedTask}
              onDrop={handleDrop}
              defaultCollapsed={group.name === "其他任务" && group.tasks.length > 10}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <NewTaskModal open={showNewTask} onClose={() => setShowNewTask(false)} defaultStatus={newTaskDefaultStatus} />
      {currentSelectedTask && (
        <TaskDetailModal task={currentSelectedTask} open={!!currentSelectedTask} onClose={() => setSelectedTask(null)} />
      )}
      <AIAssessModal open={showAIAssess} onClose={() => setShowAIAssess(false)} result={aiAssessResult} loading={aiAssessLoading} />
    </div>
  );
}
