'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  ArrowRightLeft,
  UserCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowRight,
  FileText,
  Search,
} from 'lucide-react';

interface TransferRecord {
  id: string;
  from_user: string | null;
  to_user: string | null;
  reason: string;
  notes: string | null;
  transferred_by: string;
  created_at: string;
  context_snapshot?: Record<string, unknown>;
}

interface HandoffPanelProps {
  accountId: string;
  currentOwnerId?: string;
  accountName: string;
  onTransferDone?: () => void;
}

export function HandoffPanel({
  accountId,
  currentOwnerId,
  accountName,
  onTransferDone,
}: HandoffPanelProps) {
  const { user, orgMembers } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);

  const getMemberName = useCallback(
    (userId: string | null) => {
      if (!userId) return '公海（未分配）';
      if (userId === user?.id) return '我';
      const m = orgMembers.find((m) => m.userId === userId);
      if (m?.displayName) return m.displayName;
      if (m?.email) return m.email.split('@')[0];
      return '未知用户';
    },
    [user, orgMembers]
  );

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `/api/accounts/transfer?accountId=${accountId}`
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (showHistory && history.length === 0) {
      fetchHistory();
    }
  }, [showHistory, history.length, fetchHistory]);

  const handleTransfer = async () => {
    if (!selectedUser || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/accounts/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          toUserId: selectedUser,
          reason: 'transfer',
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setSelectedUser('');
        setNotes('');
        setHistory([]); // force refetch
        onTransferDone?.();
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const availableMembers = orgMembers.filter((m) => {
    if (m.userId === currentOwnerId) return false;
    if (!searchQuery) return true;
    const name = (m.displayName || m.email || '').toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  const contextFieldLabels: Record<string, string> = {
    contacts: '联系人',
    opportunities: '商机',
    meddicc: 'MEDDICC 评估',
    strategicPlays: '谋局计划',
    decodeHistory: '邮件解读',
    intelItems: '情报',
    activities: '活动记录',
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            客户交接
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">
            当前负责人:{' '}
            <span className="font-semibold text-foreground">
              {getMemberName(currentOwnerId ?? null)}
            </span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 space-y-3">
        {!showForm ? (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <UserCheck className="h-3.5 w-3.5" />
              发起交接
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-background hover:text-foreground"
            >
              <Clock className="h-3.5 w-3.5" />
              交接历史
              {showHistory ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <p className="text-sm font-semibold text-foreground">
              交接「{accountName}」
            </p>

            {/* Member search & selection */}
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                选择接收人
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索成员..."
                  className="form-input w-full pl-8 text-xs"
                />
              </div>
              <div className="max-h-36 space-y-1 overflow-y-auto">
                {availableMembers.map((m) => (
                  <button
                    key={m.userId}
                    onClick={() => setSelectedUser(m.userId)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                      selectedUser === m.userId
                        ? 'bg-accent/10 border border-accent/30 text-accent font-semibold'
                        : 'border border-transparent hover:bg-card text-foreground'
                    }`}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                      {(m.displayName || m.email || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div>{m.displayName || m.email?.split('@')[0]}</div>
                      {m.email && m.displayName && (
                        <div className="text-[10px] text-muted">{m.email}</div>
                      )}
                    </div>
                  </button>
                ))}
                {availableMembers.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted">
                    暂无其他成员
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">
                交接备注（可选）
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="重要背景、注意事项、下一步建议..."
                rows={3}
                className="form-input w-full resize-none text-xs"
              />
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setSelectedUser('');
                  setNotes('');
                  setSearchQuery('');
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:text-foreground"
              >
                取消
              </button>
              <button
                onClick={handleTransfer}
                disabled={!selectedUser || submitting}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                )}
                确认交接
              </button>
            </div>
          </div>
        )}

        {/* Transfer History */}
        {showHistory && (
          <div className="space-y-2">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">暂无交接记录</p>
            ) : (
              history.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-secondary">
                      {getMemberName(record.transferred_by)}
                    </span>
                    <span className="text-muted">将客户从</span>
                    <span className="font-semibold text-foreground">
                      {getMemberName(record.from_user)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted" />
                    <span className="font-semibold text-foreground">
                      {getMemberName(record.to_user)}
                    </span>
                    <span className="ml-auto text-[10px] text-muted">
                      {new Date(record.created_at).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {record.notes && (
                    <p className="mt-1.5 text-xs text-secondary">
                      <FileText className="mr-1 inline h-3 w-3" />
                      {record.notes}
                    </p>
                  )}

                  {/* Context snapshot summary */}
                  {record.context_snapshot && (
                    <div className="mt-2">
                      <button
                        onClick={() =>
                          setExpandedRecord(
                            expandedRecord === record.id ? null : record.id
                          )
                        }
                        className="flex items-center gap-1 text-[10px] text-accent hover:underline"
                      >
                        {expandedRecord === record.id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        交接上下文包
                      </button>
                      {expandedRecord === record.id && (
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {Object.entries(record.context_snapshot).map(
                            ([key, val]) => {
                              const count = Array.isArray(val) ? val.length : 0;
                              return (
                                <div
                                  key={key}
                                  className="rounded border border-border bg-card px-2 py-1 text-[10px]"
                                >
                                  <span className="font-medium text-secondary">
                                    {contextFieldLabels[key] || key}
                                  </span>
                                  <span className="ml-1 font-mono text-accent">
                                    {count}
                                  </span>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
