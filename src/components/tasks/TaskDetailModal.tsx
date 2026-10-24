"use client";

import { useState, useRef, useMemo, useEffect } from 'react';
import Link from "next/link";
import {
  Zap,
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
  Search,
  ChevronDown,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";
import type { TaskStatus, TaskPriority, Task, TaskSource, TaskAttachment } from "@/lib/babel-engine/types";

// ─── Constants ──────────────────────────────────────────────────────

const COLUMNS: { status: TaskStatus; labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { status: "todo", labelKey: "tasks.todo", icon: CheckSquare },
  { status: "in_progress", labelKey: "tasks.inProgress", icon: Clock },
  { status: "blocked", labelKey: "tasks.blocked", icon: Ban },
  { status: "done", labelKey: "tasks.done", icon: CheckCircle2 },
];

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Assignee Avatar ────────────────────────────────────────────────

export function AssigneeAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
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

// ─── Assignee Picker ────────────────────────────────────────────────

export function AssigneePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
            {filtered.map((m) => {
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

export function LabelInput({ labels, onChange }: { labels: string[]; onChange: (labels: string[]) => void }) {
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

// ─── Task Detail Modal ──────────────────────────────────────────────

function TaskDetailModalContent({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const { accounts, opportunities } = useRoleFilteredData();
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);

  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assignee, setAssignee] = useState(task.assignedTo || "");
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  const [labels, setLabels] = useState<string[]>(task.labels || []);
  const [accountId, setAccountId] = useState(task.accountId || "");
  const [opportunityId, setOpportunityId] = useState(task.opportunityId || "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingAttachment, setDeletingAttachment] = useState<string | null>(null);

  const filteredOpportunities = useMemo(() => {
    if (!accountId) return [];
    return opportunities.filter((o) => o.accountId === accountId);
  }, [accountId, opportunities]);

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0 || !user) return;
    const sb = getSupabase();
    if (!sb) { setUploadError("数据库未配置"); return; }
    setUploading(true);
    setUploadError(null);
    const newAttachments: TaskAttachment[] = [...(task.attachments || [])];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_FILE_TYPES.includes(file.type)) { setUploadError(`不支持的文件类型: ${file.name}`); continue; }
      if (file.size > MAX_FILE_SIZE) { setUploadError(`文件过大（最大 10MB）: ${file.name}`); continue; }
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_");
      const storagePath = `${user.id}/${task.id}/${Date.now()}_${safeName}`;
      const { error } = await sb.storage.from("task-attachments").upload(storagePath, file, { upsert: false });
      if (error) { setUploadError(`上传失败: ${error.message}`); continue; }
      const { data: urlData } = sb.storage.from("task-attachments").getPublicUrl(storagePath);
      newAttachments.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size, storagePath });
    }
    updateTask(task.id, { attachments: newAttachments });
    setUploading(false);
  }

  function handleDownload(att: TaskAttachment) {
    const a = document.createElement("a");
    a.href = att.url; a.download = att.name; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  async function handleDeleteAttachment(att: TaskAttachment) {
    if (deletingAttachment !== att.storagePath) { setDeletingAttachment(att.storagePath); return; }
    const sb = getSupabase();
    if (!sb) { setUploadError("数据库未配置"); setDeletingAttachment(null); return; }
    const { error } = await sb.storage.from("task-attachments").remove([att.storagePath]);
    if (error) { setUploadError(`删除失败: ${error.message}`); setDeletingAttachment(null); return; }
    const updated = (task.attachments || []).filter((a) => a.storagePath !== att.storagePath);
    updateTask(task.id, { attachments: updated.length > 0 ? updated : undefined });
    setDeletingAttachment(null);
  }

  function handleSave() {
    updateTask(task.id, {
      title: title.trim(),
      status,
      priority,
      assignedTo: assignee.trim() || undefined,
      description: description.trim() || undefined,
      dueDate: dueDate || undefined,
      labels: labels.length > 0 ? labels : undefined,
      accountId: accountId || undefined,
      opportunityId: opportunityId || undefined,
    });
    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    deleteTask(task.id);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-foreground">{t("tasks.detail")}</h3>
            {task.aiGenerated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
                <Zap className="h-3 w-3" />
                {t("tasks.aiGenerated")}
              </span>
            )}
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${SOURCE_LABELS[task.source].color}`}>
              {SOURCE_LABELS[task.source].zh}
            </span>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sidebar hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="form-label">{t("tasks.taskTitle")}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="form-input text-base font-semibold" />
          </div>

          {/* 状态 + 优先级 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("tasks.status")}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className="form-select">
                {COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>{t(c.labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("tasks.filterPriority")}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="form-select">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{t(`tasks.priority.${p}` as TranslationKey)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 负责人 + 截止日期 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("tasks.assignee")}</label>
              <AssigneePicker value={assignee} onChange={setAssignee} />
            </div>
            <div>
              <label className="form-label">{t("tasks.dueDate")}</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="form-input" />
            </div>
          </div>

          {/* 客户 + 机会 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("tasks.account")}</label>
              <select
                value={accountId}
                onChange={(e) => {
                  const nextAccountId = e.target.value;
                  setAccountId(nextAccountId);
                  if (nextAccountId !== task.accountId) {
                    setOpportunityId("");
                  }
                }}
                className="form-select"
              >
                <option value="">{t("tasks.selectAccount")}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("tasks.opportunity")}</label>
              <select value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} className="form-select" disabled={!accountId}>
                <option value="">{t("tasks.selectOpportunity")}</option>
                {filteredOpportunities.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="form-label">{t("tasks.labels")}</label>
            <LabelInput labels={labels} onChange={setLabels} />
          </div>

          {/* Description */}
          <div>
            <label className="form-label">{t("tasks.taskDescription")}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("tasks.taskDescriptionPlaceholder")} className="form-input min-h-[120px] resize-y" rows={5} />
          </div>

          {/* Linked refs (read-only display) */}
          {(task.accountId || task.opportunityId) && (
            <div className="flex flex-wrap gap-2">
              {task.accountId && (() => {
                const acc = accounts.find((a) => a.id === task.accountId);
                return acc ? (
                  <Link href={`/accounts/${acc.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-sidebar px-3 py-1.5 text-sm text-accent hover:bg-accent/5 transition-colors">
                    {acc.name} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null;
              })()}
              {task.opportunityId && (() => {
                const opp = opportunities.find((o) => o.id === task.opportunityId);
                return opp ? (
                  <Link href={`/pipeline/${opp.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-sidebar px-3 py-1.5 text-sm text-accent hover:bg-accent/5 transition-colors">
                    {opp.name} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null;
              })()}
            </div>
          )}

          {/* Attachments */}
          <div>
            <label className="form-label">{t("tasks.attachments")}</label>
            <div className="space-y-3">
              {task.attachments && task.attachments.length > 0 && (
                <div className="space-y-2">
                  {task.attachments.map((att) => (
                    <div key={att.storagePath} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm group">
                      <Paperclip className="h-4 w-4 text-muted flex-shrink-0" />
                      <button onClick={() => handleDownload(att)} className="text-foreground hover:text-accent truncate text-left flex-1 min-w-0" title={att.name}>
                        {att.name}
                      </button>
                      <span className="text-xs text-muted flex-shrink-0">{formatFileSize(att.size)}</span>
                      <button
                        onClick={() => handleDeleteAttachment(att)}
                        className={`flex-shrink-0 p-0.5 rounded transition-colors ${deletingAttachment === att.storagePath ? "text-white bg-red-600 hover:bg-red-700" : "text-muted hover:text-danger opacity-0 group-hover:opacity-100"}`}
                        title={deletingAttachment === att.storagePath ? t("tasks.deleteAttachmentConfirm") : t("tasks.deleteAttachment")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div
                className="relative rounded-lg border border-dashed border-border bg-sidebar/50 p-4 transition-colors hover:border-accent/50"
                onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input type="file" multiple accept={ACCEPTED_FILE_TYPES.join(",")} onChange={(e) => handleFileUpload(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
                <div className="flex flex-col items-center justify-center py-2 text-center pointer-events-none">
                  {uploading ? (
                    <><Loader2 className="h-6 w-6 text-accent mb-2 animate-spin" /><p className="text-xs text-accent font-medium">{t("tasks.uploading")}</p></>
                  ) : (
                    <><Upload className="h-6 w-6 text-muted mb-2" /><p className="text-xs text-muted">{t("tasks.uploadHint")}</p></>
                  )}
                </div>
              </div>
              {uploadError && (
                <div className="flex items-center gap-1.5 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /><span>{uploadError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Created At */}
          <div className="flex items-center gap-4 text-xs text-muted border-t border-border pt-4">
            <span>{t("tasks.createdAt")}: {new Date(task.createdAt).toLocaleString("zh-CN")}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleDelete}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${confirmDelete ? "bg-red-600 text-white hover:bg-red-700" : "border border-border text-danger hover:bg-danger/5"}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDelete ? t("tasks.deleteConfirm") : t("tasks.delete")}
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary hover:bg-sidebar">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={!title.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none"
              >
                <Save className="h-3.5 w-3.5" />
                {t("tasks.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskDetailModal({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  const taskResetKey = useMemo(() => JSON.stringify(task), [task]);

  if (!open) return null;

  return <TaskDetailModalContent key={taskResetKey} task={task} onClose={onClose} />;
}
