"use client";

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { ConfidenceMeter } from './confidence-meter';

interface EnrichmentLogEntry {
  id: string;
  action: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  confidence: number | null;
  source: string;
  evidence: string | null;
  created_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  agent_tool: 'AI 工具',
  decode_infer: '邮件解读',
  intel_agent: '情报扫描',
  tavily: 'Tavily',
};

const ACTION_LABELS: Record<string, string> = {
  role_inferred: '角色推断',
  title_updated: '职位更新',
  linkedin_found: 'LinkedIn 发现',
  department_inferred: '部门推断',
  job_level_set: '职级设定',
  profile_enriched: '资料丰富',
};

interface EnrichmentHistoryTabProps {
  contactId: string;
}

export function EnrichmentHistoryTab({ contactId }: EnrichmentHistoryTabProps) {
  const [history, setHistory] = useState<EnrichmentLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/enrichment-history?limit=50`);
      if (!res.ok) throw new Error('加载失败');
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [contactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-center">
        <p className="text-sm text-danger">{error}</p>
        <button onClick={fetchHistory} className="mt-2 text-xs text-accent hover:underline">重试</button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted">暂无 AI 丰富记录</p>
      </div>
    );
  }

  // Group by date
  const grouped = new Map<string, EnrichmentLogEntry[]>();
  for (const entry of history) {
    const date = new Date(entry.created_at).toLocaleDateString('zh-CN');
    const list = grouped.get(date) ?? [];
    list.push(entry);
    grouped.set(date, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">AI 丰富历史</p>
        <button onClick={fetchHistory} className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
          <RefreshCw className="h-3 w-3" />
          刷新
        </button>
      </div>

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([date, entries]) => (
          <div key={date}>
            <p className="mb-2 text-[11px] font-semibold text-secondary uppercase tracking-wide">{date}</p>
            <div className="relative border-l-2 border-border pl-4 space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="relative">
                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-accent bg-card" />
                  <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">
                        {SOURCE_LABELS[entry.source] ?? entry.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-muted">{entry.field_name}:</span>
                      {entry.old_value && (
                        <>
                          <span className="text-danger/70 line-through">{entry.old_value}</span>
                          <span className="text-muted">&rarr;</span>
                        </>
                      )}
                      <span className="text-positive font-medium">{entry.new_value}</span>
                    </div>
                    {entry.confidence != null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted">置信度:</span>
                        <ConfidenceMeter value={entry.confidence} size="sm" />
                      </div>
                    )}
                    {entry.evidence && (
                      <p className="text-[10px] text-muted line-clamp-2">{entry.evidence}</p>
                    )}
                    <p className="text-[10px] text-muted/50">
                      {new Date(entry.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
