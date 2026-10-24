'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, X, Loader2, FileText, ExternalLink } from 'lucide-react';
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';

// ─── Types ──────────────────────────────────────────────────────────

export interface RfpDocument {
  id: string;
  rfpId: string;
  name: string;
  docType: 'rfp' | 'response' | 'clarification' | 'amendment' | 'other';
  url: string | null;
  fileSize: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

interface RfpDocumentsProps {
  rfpId: string;
  documents: RfpDocument[];
  onUpdate: () => void;
}

// ─── Doc type labels & colors ───────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  rfp: '招标文件',
  response: '投标文件',
  clarification: '澄清文件',
  amendment: '修订文件',
  other: '其他',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  rfp: 'bg-accent/10 text-accent',
  response: 'bg-positive/10 text-positive',
  clarification: 'bg-warning/10 text-warning',
  amendment: 'bg-purple-100 text-purple-600',
  other: 'bg-muted/10 text-muted',
};

// ─── Component ──────────────────────────────────────────────────────

export function RfpDocuments({ rfpId, documents, onUpdate }: RfpDocumentsProps) {
  const [showForm, setShowForm] = useState(false);

  const handleDelete = useCallback(async (doc: RfpDocument) => {
    if (!await appConfirm({ message: `确定删除文档「${doc.name}」？`, variant: 'danger' })) return;
    const res = await fetch(`/api/rfps/documents?documentId=${doc.id}`, { method: 'DELETE' });
    if (res.ok) { toast('已删除文档', 'success'); onUpdate(); }
    else toast('删除失败', 'error');
  }, [onUpdate]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-secondary flex items-center gap-1">
          <FileText className="h-3 w-3" /> 文档 ({documents.length})
        </p>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[12px] text-accent hover:text-accent-hover">
            <Plus className="h-3 w-3" /> 添加
          </button>
        )}
      </div>

      {documents.length > 0 && (
        <div className="space-y-1">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center justify-between rounded-md border border-border bg-background/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium flex-shrink-0 ${DOC_TYPE_COLORS[doc.docType] ?? DOC_TYPE_COLORS.other}`}>
                  {DOC_TYPE_LABELS[doc.docType] ?? '其他'}
                </span>
                <span className="text-xs text-foreground truncate">{doc.name}</span>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-accent hover:text-accent-hover">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <button onClick={() => handleDelete(doc)} className="flex-shrink-0 text-muted hover:text-danger ml-2">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DocumentForm rfpId={rfpId} onDone={() => { setShowForm(false); onUpdate(); }} onCancel={() => setShowForm(false)} />
      )}

      {documents.length === 0 && !showForm && (
        <p className="text-[12px] text-muted py-2">暂无文档</p>
      )}
    </div>
  );
}

// ─── Document Form ──────────────────────────────────────────────────

function DocumentForm({ rfpId, onDone, onCancel }: { rfpId: string; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [docType, setDocType] = useState<string>('rfp');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/rfps/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfpId,
          name: name.trim(),
          docType,
          url: url.trim() || undefined,
        }),
      });
      if (res.ok) { toast('已添加文档', 'success'); onDone(); }
      else toast('添加失败', 'error');
    } finally {
      setSaving(false);
    }
  }, [name, docType, url, rfpId, onDone]);

  return (
    <div className="rounded-lg border border-accent/20 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">添加文档</span>
        <button onClick={onCancel} className="text-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="text-[11px] text-secondary">文档名称 *</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="例：招标书 v2" />
        </div>
        <div>
          <label className="text-[11px] text-secondary">类型</label>
          <select value={docType} onChange={e => setDocType(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-secondary">链接 URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" placeholder="https://..." />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-border px-2 py-1 text-[11px] text-secondary hover:bg-background">取消</button>
        <button onClick={handleSave} disabled={!name.trim() || saving} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          添加
        </button>
      </div>
    </div>
  );
}
