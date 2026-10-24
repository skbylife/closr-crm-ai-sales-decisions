"use client";

import { useState } from "react";
import {
  Plus,
  Zap,
  Calendar,
  Trash2,
  CheckSquare,
  Clock,
  CheckCircle2,
  Ban,
  ChevronRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { appConfirm } from '@/lib/confirm-store';
import { useAuth } from "@/lib/auth-context";
import type { Task, TaskStatus, TaskPriority } from "@/lib/babel-engine/types";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";

// ─── Styles ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ComponentType<{ className?: string }>; style: string }> = {
  todo: { label: "待办", icon: CheckSquare, style: "bg-gray-100 text-gray-600" },
  in_progress: { label: "进行中", icon: Clock, style: "bg-blue-100 text-blue-700" },
  done: { label: "已完成", icon: CheckCircle2, style: "bg-green-100 text-green-700" },
  blocked: { label: "阻塞", icon: Ban, style: "bg-red-100 text-red-700" },
};

const PRIORITY_STYLES: Record<TaskPriority, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "低" },
  medium: { bg: "bg-blue-100", text: "text-blue-700", label: "中" },
  high: { bg: "bg-orange-100", text: "text-orange-700", label: "高" },
  urgent: { bg: "bg-red-100", text: "text-red-700", label: "紧急" },
};

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
// Avatar colors for assignee initials
const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Inline New Task Form ───────────────────────────────────────────

function InlineNewTaskForm({
  defaultAccountId,
  defaultOpportunityId,
  onClose,
}: {
  defaultAccountId?: string;
  defaultOpportunityId?: string;
  onClose: () => void;
}) {
  const addTask = useStore((s) => s.addTask);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  function handleCreate() {
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      status: "todo",
      priority,
      accountId: defaultAccountId,
      opportunityId: defaultOpportunityId,
      dueDate: dueDate || undefined,
      source: "manual",
      aiGenerated: false,
    });
    setTitle("");
    setPriority("medium");
    setDueDate("");
    onClose();
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent/[0.03] p-3 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="任务标题..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none"
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onClose(); }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent/40 focus:outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_STYLES[p].label}</option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent/40 focus:outline-none"
        />
        <div className="flex-1" />
        <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-sidebar">
          取消
        </button>
        <button
          onClick={handleCreate}
          disabled={!title.trim()}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40"
        >
          创建
        </button>
      </div>
    </div>
  );
}

// ─── Task Row ───────────────────────────────────────────────────────

function TaskRow({ task, onSelect }: { task: Task; onSelect: (task: Task) => void }) {
  const { moveTask, deleteTask } = useStore();
  const { orgMembers } = useAuth();
  const statusCfg = STATUS_CONFIG[task.status];
  const priorityCfg = PRIORITY_STYLES[task.priority];
  const StatusIcon = statusCfg.icon;

  const nextStatus: TaskStatus | null =
    task.status === "todo" ? "in_progress" :
    task.status === "in_progress" ? "done" : null;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

  // Resolve assignee name
  const assignee = task.assignedTo
    ? orgMembers.find((m) => m.userId === task.assignedTo)
    : null;
  const assigneeName = assignee?.displayName || assignee?.email?.split("@")[0] || null;

  return (
    <div
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-all hover:shadow-sm hover:border-secondary cursor-pointer"
      onClick={() => onSelect(task)}
    >
      {/* Status toggle button */}
      {nextStatus ? (
        <button
          onClick={(e) => { e.stopPropagation(); moveTask(task.id, nextStatus); }}
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border text-muted hover:border-accent hover:text-accent transition-colors"
          title={`切换到 ${STATUS_CONFIG[nextStatus].label}`}
        >
          {task.status === "in_progress" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      ) : (
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
          <StatusIcon className={`h-4 w-4 ${task.status === "done" ? "text-positive" : "text-danger"}`} />
        </div>
      )}

      {/* AI badge */}
      {task.aiGenerated && <Zap className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" />}

      {/* Title */}
      <span
        className={`flex-1 min-w-0 truncate text-sm font-medium transition-colors ${
          task.status === "done" ? "line-through text-muted" : "text-foreground"
        }`}
      >
        {task.title}
      </span>

      {/* Assignee */}
      {assigneeName && (
        <div className="flex flex-shrink-0 items-center gap-1 max-w-[80px]">
          <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-bold text-white ${getAvatarColor(assigneeName)}`}>
            {assigneeName[0].toUpperCase()}
          </div>
          <span className="truncate text-xs text-secondary">{assigneeName}</span>
        </div>
      )}

      {/* Priority badge */}
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${priorityCfg.bg} ${priorityCfg.text}`}>
        {priorityCfg.label}
      </span>

      {/* Status badge */}
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${statusCfg.style}`}>
        {statusCfg.label}
      </span>

      {/* Due date */}
      {task.dueDate && (
        <span className={`flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
          isOverdue ? "bg-red-100 text-red-600" : "bg-sidebar text-secondary"
        }`}>
          <Calendar className="h-3 w-3" />
          {task.dueDate.slice(5)}
        </span>
      )}

      {/* Delete */}
      <button
        onClick={async (e) => { e.stopPropagation(); if (await appConfirm({ message: '确定删除此任务？', variant: 'danger' })) deleteTask(task.id); }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-colors p-0.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

interface TaskListSectionProps {
  accountId?: string;
  opportunityId?: string;
  title?: string;
}

export function TaskListSection({ accountId, opportunityId, title = "任务" }: TaskListSectionProps) {
  const { tasks } = useRoleFilteredData();
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (opportunityId) return t.opportunityId === opportunityId;
    if (accountId) return t.accountId === accountId;
    return false;
  });

  // Sort: active first (todo, in_progress), then blocked, then done
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const order: Record<TaskStatus, number> = { todo: 0, in_progress: 1, blocked: 2, done: 3 };
    return order[a.status] - order[b.status];
  });

  const activeTasks = sortedTasks.filter((t) => t.status !== "done");
  const doneTasks = sortedTasks.filter((t) => t.status === "done");
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar text-xs font-medium text-muted">
            {activeTasks.length}
          </span>
        </div>
        <button
          onClick={() => setShowNewTask(true)}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-sidebar hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </button>
      </div>
      <div className="p-3 space-y-2">
        {showNewTask && (
          <InlineNewTaskForm
            defaultAccountId={accountId}
            defaultOpportunityId={opportunityId}
            onClose={() => setShowNewTask(false)}
          />
        )}

        {activeTasks.length === 0 && !showNewTask ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card">
              <CheckSquare className="h-4 w-4 text-muted" />
            </div>
            <p className="text-xs font-medium text-foreground">暂无任务</p>
            <p className="mt-1 max-w-[200px] text-xs text-muted">点击「新建」添加任务</p>
          </div>
        ) : (
          activeTasks.map((task) => <TaskRow key={task.id} task={task} onSelect={setSelectedTask} />)
        )}

        {/* Done tasks toggle */}
        {doneTasks.length > 0 && (
          <>
            <button
              onClick={() => setShowDone(!showDone)}
              className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${showDone ? "rotate-90" : ""}`} />
              已完成 ({doneTasks.length})
            </button>
            {showDone && doneTasks.map((task) => <TaskRow key={task.id} task={task} onSelect={setSelectedTask} />)}
          </>
        )}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskDetailModal task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}
