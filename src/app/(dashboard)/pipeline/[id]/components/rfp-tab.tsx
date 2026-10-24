'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Plus, Loader2, AlertTriangle, ArrowUpFromLine } from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';
import { toast } from '@/lib/toast-store';
import type { RfpStatus } from '@/lib/babel-engine/types';
import { RfpForm } from './rfp-form';
import type { RfpFormData } from './rfp-form';
import { RfpCard } from './rfp-card';
import type { RfpData } from './rfp-card';

// ─── Main Tab Component ─────────────────────────────────────────────

export function RfpTab({
  opportunityId,
  accountId,
}: {
  opportunityId: string;
  accountId: string;
}) {
  const [rfps, setRfps] = useState<RfpData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRfp, setEditingRfp] = useState<RfpData | null>(null);
  const [migrationAvailable, setMigrationAvailable] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const searchParams = useSearchParams();
  const highlightedRfpId = searchParams.get('rfpId');
  const highlightedAnalysisId = searchParams.get('analysisId');
  const highlightedSignalIndex = searchParams.get('signalIndex');

  // ─── Fetch RFPs from API ────────────────────────────────────────

  const fetchRfps = useCallback(async () => {
    try {
      const res = await fetch(`/api/rfps?opportunityId=${opportunityId}`);
      if (res.ok) {
        const data = await res.json();
        setRfps(data.rfps ?? []);
      } else {
        console.error('[rfp-tab] Fetch failed:', res.status);
      }
    } catch (err) {
      console.error('[rfp-tab] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  // ─── Initial load + localStorage migration check ────────────────

  useEffect(() => {
    fetchRfps();
  }, [fetchRfps]);

  useEffect(() => {
    try {
      const storageKey = `closr-rfps-${opportunityId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMigrationAvailable(true);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }, [opportunityId]);

  // ─── Migration ──────────────────────────────────────────────────

  const handleMigrate = useCallback(async () => {
    const storageKey = `closr-rfps-${opportunityId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;

    setMigrating(true);
    try {
      const oldRfps = JSON.parse(stored);
      const res = await fetch('/api/rfps/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, accountId, rfps: oldRfps }),
      });

      if (res.ok) {
        const data = await res.json();
        toast(`迁移完成：${data.migrated} 条已迁移，${data.skipped} 条已跳过`, 'success');
        localStorage.removeItem(storageKey);
        setMigrationAvailable(false);
        fetchRfps();
      } else {
        toast('迁移失败，请稍后重试', 'error');
      }
    } catch {
      toast('迁移请求失败', 'error');
    } finally {
      setMigrating(false);
    }
  }, [opportunityId, accountId, fetchRfps]);

  const dismissMigration = useCallback(() => {
    const storageKey = `closr-rfps-${opportunityId}`;
    localStorage.removeItem(storageKey);
    setMigrationAvailable(false);
    toast('已忽略本地数据', 'success');
  }, [opportunityId]);

  // ─── CRUD Handlers ──────────────────────────────────────────────

  const handleSave = useCallback(async (formData: RfpFormData) => {
    if (formData.id) {
      // Update existing RFP
      const res = await fetch('/api/rfps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfpId: formData.id,
          title: formData.title,
          issuer: formData.issuer,
          issuedDate: formData.issuedDate,
          dueDate: formData.dueDate,
          status: formData.status as RfpStatus,
          budget: formData.budget ? Number(formData.budget) : undefined,
          currency: formData.currency,
          notes: formData.notes,
        }),
      });
      if (res.ok) {
        toast('RFP 已更新', 'success');
        setEditingRfp(null);
        fetchRfps();
      } else {
        const err = await res.json().catch(() => ({}));
        toast((err as { error?: string }).error ?? '更新失败', 'error');
      }
    } else {
      // Create new RFP
      const res = await fetch('/api/rfps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId,
          accountId,
          title: formData.title,
          issuer: formData.issuer,
          issuedDate: formData.issuedDate,
          dueDate: formData.dueDate,
          status: formData.status as RfpStatus,
          budget: formData.budget ? Number(formData.budget) : undefined,
          currency: formData.currency,
          notes: formData.notes,
        }),
      });
      if (res.ok) {
        toast('RFP 已创建', 'success');
        setShowForm(false);
        fetchRfps();
      } else {
        const err = await res.json().catch(() => ({}));
        toast((err as { error?: string }).error ?? '创建失败', 'error');
      }
    }
  }, [opportunityId, accountId, fetchRfps]);

  const handleDelete = useCallback(async (rfpId: string, title: string) => {
    if (!await appConfirm({ message: `确定删除 RFP「${title}」？此操作不可恢复。`, variant: 'danger' })) return;
    const res = await fetch(`/api/rfps?rfpId=${rfpId}`, { method: 'DELETE' });
    if (res.ok) {
      toast('RFP 已删除', 'success');
      fetchRfps();
    } else {
      toast('删除失败', 'error');
    }
  }, [fetchRfps]);

  // ─── Refresh single RFP (re-fetch full list for simplicity) ────

  const handleRefreshSingle = useCallback(() => {
    fetchRfps();
  }, [fetchRfps]);

  // ─── Computed ───────────────────────────────────────────────────

  const activeRfps = rfps.filter(r => !['won', 'lost', 'no_bid'].includes(r.status));
  const closedRfps = rfps.filter(r => ['won', 'lost', 'no_bid'].includes(r.status));

  // ─── Convert RfpData to RfpFormData for editing ─────────────────

  const toFormData = (rfp: RfpData): RfpFormData => ({
    id: rfp.id,
    title: rfp.title,
    issuer: rfp.issuer,
    issuedDate: rfp.issuedDate,
    dueDate: rfp.dueDate,
    status: rfp.status,
    budget: rfp.budget?.toString() ?? '',
    currency: rfp.currency,
    notes: rfp.notes,
  });

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-accent" />
          RFP 管理
          {activeRfps.length > 0 && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-medium text-accent">{activeRfps.length} 活跃</span>
          )}
        </h3>
        {!showForm && !editingRfp && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover">
            <Plus className="h-3.5 w-3.5" /> 新建 RFP
          </button>
        )}
      </div>

      {/* Migration banner */}
      {migrationAvailable && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">发现本地 RFP 数据</p>
              <p className="text-[12px] text-muted">浏览器中存有旧版 RFP 数据，可迁移到云端数据库。</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={dismissMigration} className="text-[12px] text-secondary hover:text-foreground">忽略</button>
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {migrating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpFromLine className="h-3 w-3" />}
              迁移到云端
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <span className="ml-2 text-sm text-muted">加载中...</span>
        </div>
      )}

      {/* Form */}
      {(showForm || editingRfp) && (
        <RfpForm
          opportunityId={opportunityId}
          accountId={accountId}
          initial={editingRfp ? toFormData(editingRfp) : undefined}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingRfp(null); }}
        />
      )}

      {/* Active RFPs */}
      {!loading && activeRfps.length > 0 && (
        <div className="space-y-2">
          {activeRfps.map(rfp => (
            <RfpCard
              key={rfp.id}
              rfp={rfp}
              onEdit={() => setEditingRfp(rfp)}
              onDelete={() => handleDelete(rfp.id, rfp.title)}
              onRefresh={handleRefreshSingle}
              defaultExpanded={highlightedRfpId === rfp.id || highlightedAnalysisId === rfp.latestAnalysis?.id}
              highlightedAnalysisId={highlightedAnalysisId}
              highlightedSignalIndex={highlightedSignalIndex}
            />
          ))}
        </div>
      )}

      {/* Closed RFPs */}
      {!loading && closedRfps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted">已结束</p>
          {closedRfps.map(rfp => (
            <RfpCard
              key={rfp.id}
              rfp={rfp}
              onEdit={() => setEditingRfp(rfp)}
              onDelete={() => handleDelete(rfp.id, rfp.title)}
              onRefresh={handleRefreshSingle}
              defaultExpanded={highlightedRfpId === rfp.id || highlightedAnalysisId === rfp.latestAnalysis?.id}
              highlightedAnalysisId={highlightedAnalysisId}
              highlightedSignalIndex={highlightedSignalIndex}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && rfps.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-secondary mb-3" />
          <p className="text-sm font-medium text-foreground">暂无 RFP</p>
          <p className="mt-1 text-xs text-muted">添加 RFP 后可追踪截止日期、竞品和投标状态</p>
          <button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
            <Plus className="h-4 w-4" /> 创建 RFP
          </button>
        </div>
      )}
    </div>
  );
}
