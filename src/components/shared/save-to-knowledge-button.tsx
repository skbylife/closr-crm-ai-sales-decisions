'use client';

import { useState } from 'react';
import { BookOpen, CheckCircle2, Loader2 } from 'lucide-react';

interface SaveToKnowledgeButtonProps {
  accountId: string;
  title: string;
  content: string;
  category?: string;
  className?: string;
}

export function SaveToKnowledgeButton({
  accountId,
  title,
  content,
  category = 'ai_insight',
  className,
}: SaveToKnowledgeButtonProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!accountId) return null;

  const handleSave = async () => {
    if (status === 'saving' || status === 'saved') return;
    setStatus('saving');
    try {
      const res = await fetch(`/api/accounts/${accountId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category }),
      });
      if (!res.ok) throw new Error('Save failed');
      setStatus('saved');
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  if (status === 'saved') {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-lg border border-positive/20 bg-positive/10 px-3 py-1.5 text-xs font-medium text-positive ${className ?? ''}`}>
        <CheckCircle2 className="h-3 w-3" />
        已存入知识库
      </span>
    );
  }

  return (
    <button
      onClick={handleSave}
      disabled={status === 'saving'}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-600 transition-colors duration-150 hover:bg-purple-500/20 hover:border-purple-500/30 disabled:opacity-50 ${className ?? ''}`}
    >
      {status === 'saving' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <BookOpen className="h-3 w-3" />
      )}
      {status === 'error' ? '保存失败，重试' : '存入知识库'}
    </button>
  );
}
