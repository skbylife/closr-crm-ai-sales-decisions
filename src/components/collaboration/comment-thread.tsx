'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { appConfirm } from '@/lib/confirm-store';
import { useLocale } from '@/lib/i18n';
import {
  MessageSquare,
  Send,
  Loader2,
  Trash2,
  Pencil,
  X,
  Check,
  AtSign,
} from 'lucide-react';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  mentions: string[];
  created_at: string;
  updated_at?: string;
}

interface CommentThreadProps {
  entityType: 'account' | 'opportunity' | 'contact';
  entityId: string;
}

export function CommentThread({ entityType, entityId }: CommentThreadProps) {
  const { user, orgMembers } = useAuth();
  const { locale } = useLocale();
  const en = locale === 'en';
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?entity_type=${entityType}&entity_id=${entityId}`
      );
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const getMemberName = (userId: string) => {
    if (userId === user?.id) return en ? 'Me' : '我';
    const m = orgMembers.find((m) => m.userId === userId);
    if (m?.displayName) return m.displayName;
    if (m?.email) return m.email.split('@')[0];
    return en ? 'Unknown user' : '未知用户';
  };

  const getMemberInitial = (userId: string) => {
    const name = getMemberName(userId);
    return name.charAt(0).toUpperCase();
  };

  // Extract @mentions from content
  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const ids: string[] = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      ids.push(match[2]);
    }
    return ids;
  };

  // Render content with highlighted mentions
  const renderContent = (text: string) => {
    const parts = text.split(/(@\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
      const mentionMatch = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
      if (mentionMatch) {
        return (
          <span
            key={i}
            className="rounded bg-accent/10 px-1 py-0.5 text-xs font-semibold text-accent"
          >
            @{mentionMatch[1]}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const insertMention = (memberId: string, memberName: string) => {
    const before = content.slice(0, cursorPos);
    const after = content.slice(cursorPos);
    // Find the @ that triggered the mention
    const atIdx = before.lastIndexOf('@');
    const newContent =
      before.slice(0, atIdx) + `@[${memberName}](${memberId}) ` + after;
    setContent(newContent);
    setShowMentions(false);
    setMentionFilter('');
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || 0;
    setContent(val);
    setCursorPos(pos);

    // Check if we should show mention dropdown
    const before = val.slice(0, pos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === ' ' || before[atIdx - 1] === '\n')) {
      const query = before.slice(atIdx + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        setShowMentions(true);
        setMentionFilter(query.toLowerCase());
        return;
      }
    }
    setShowMentions(false);
  };

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      const mentions = extractMentions(content);
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          content: content.trim(),
          mentions,
        }),
      });
      if (res.ok) {
        setContent('');
        fetchComments();
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    const res = await fetch('/api/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, content: editContent.trim() }),
    });
    if (res.ok) {
      setEditingId(null);
      setEditContent('');
      fetchComments();
    }
  };

  const handleDelete = async (id: string) => {
    if (!await appConfirm({ message: en ? 'Delete this comment?' : '确定删除此评论？', variant: 'danger' })) return;
    const res = await fetch(`/api/comments?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchComments();
  };

  const filteredMembers = orgMembers.filter((m) => {
    if (m.userId === user?.id) return false;
    const name = (m.displayName || m.email || '').toLowerCase();
    return name.includes(mentionFilter);
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {en ? 'Collaboration Notes' : '协作备注'}
        </h3>
        <span className="ml-auto text-xs text-muted">{comments.length} {en ? (comments.length === 1 ? 'comment' : 'comments') : '条'}</span>
      </div>

      {/* Comments List */}
      <div className="max-h-80 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            {en ? 'No comments yet. Be the first to add context.' : '暂无评论，成为第一个发言的人'}
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="group flex gap-2.5">
              {/* Avatar */}
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                {getMemberInitial(c.user_id)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    {getMemberName(c.user_id)}
                  </span>
                  <span className="text-[10px] text-muted">
                    {new Date(c.created_at).toLocaleString(en ? 'en-US' : 'zh-CN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {c.updated_at && (
                    <span className="text-[10px] text-muted">{en ? '(edited)' : '(已编辑)'}</span>
                  )}

                  {/* Actions (only for own comments) */}
                  {c.user_id === user?.id && !editingId && (
                    <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingId(c.id);
                          setEditContent(c.content);
                        }}
                        className="rounded p-0.5 text-muted hover:text-foreground"
                        title={en ? 'Edit comment' : '编辑评论'}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="rounded p-0.5 text-muted hover:text-danger"
                        title={en ? 'Delete comment' : '删除评论'}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {editingId === c.id ? (
                  <div className="mt-1 flex gap-1.5">
                    <input
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="form-input flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdate(c.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdate(c.id)}
                      className="rounded-lg bg-accent p-1.5 text-white hover:bg-accent-hover"
                      title={en ? 'Save edit' : '保存编辑'}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-border p-1.5 text-muted hover:text-foreground"
                      title={en ? 'Cancel edit' : '取消编辑'}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs leading-relaxed text-secondary">
                    {renderContent(c.content)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>

      {/* Input */}
      <div className="relative border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={content}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={en ? 'Write a comment... use @ to mention teammates' : '写评论… 用 @ 提及同事'}
              rows={1}
              className="form-input w-full resize-none pr-8 text-xs"
            />
            <button
              onClick={() => {
                setContent((prev) => prev + '@');
                setShowMentions(true);
                setMentionFilter('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-accent"
              title={en ? 'Mention teammate' : '提及同事'}
            >
              <AtSign className="h-3.5 w-3.5" />
            </button>

            {/* Mentions dropdown */}
            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-1 w-full max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {filteredMembers.map((m) => (
                  <button
                    key={m.userId}
                    onClick={() =>
                      insertMention(
                        m.userId,
                        m.displayName || m.email?.split('@')[0] || m.userId
                      )
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-background"
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                      {(m.displayName || m.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-foreground">
                      {m.displayName || m.email?.split('@')[0]}
                    </span>
                    {m.email && m.displayName && (
                      <span className="text-muted">{m.email}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!content.trim() || submitting}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            title={en ? 'Send comment' : '发送评论'}
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
