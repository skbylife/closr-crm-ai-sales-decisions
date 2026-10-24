"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Trash2, Plus, AlertTriangle } from "lucide-react";
import { genId } from "@/lib/gen-id";

interface Competitor {
  id: string;
  name: string;
  strength: "high" | "medium" | "low";
  knownContacts: string;
  notes: string;
}

const STRENGTH_CONFIG = {
  high: { label: "高威胁", style: "bg-red-50 text-red-700 border-red-200" },
  medium: { label: "中威胁", style: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  low: { label: "低威胁", style: "bg-green-50 text-green-700 border-green-200" },
} as const;

export function CompetitorsTab({ accountId }: { accountId: string }) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formStrength, setFormStrength] = useState<Competitor["strength"]>("medium");
  const [formContacts, setFormContacts] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCompetitors = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/competitors`);
      const data = await res.json();
      setCompetitors(data.competitors ?? []);
    } catch {
      console.error("Failed to fetch competitors");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  const saveCompetitors = async (updated: Competitor[]) => {
    setSaving(true);
    try {
      await fetch(`/api/accounts/${accountId}/competitors`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitors: updated }),
      });
      setCompetitors(updated);
    } catch {
      console.error("Failed to save competitors");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!formName.trim()) return;
    const newCompetitor: Competitor = {
      id: genId(),
      name: formName.trim(),
      strength: formStrength,
      knownContacts: formContacts.trim(),
      notes: formNotes.trim(),
    };
    await saveCompetitors([...competitors, newCompetitor]);
    setFormName("");
    setFormStrength("medium");
    setFormContacts("");
    setFormNotes("");
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    await saveCompetitors(competitors.filter((c) => c.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted">
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-secondary" />
          <h3 className="text-sm font-semibold text-foreground">
            竞争对手 ({competitors.length})
          </h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          添加竞争对手
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="竞争对手公司名称"
                className="form-input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                威胁等级
              </label>
              <select
                value={formStrength}
                onChange={(e) => setFormStrength(e.target.value as Competitor["strength"])}
                className="form-input w-full text-sm"
              >
                <option value="high">高威胁</option>
                <option value="medium">中威胁</option>
                <option value="low">低威胁</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              已知客户联系人
            </label>
            <input
              type="text"
              value={formContacts}
              onChange={(e) => setFormContacts(e.target.value)}
              placeholder="如：CTO刘总、采购王总"
              className="form-input w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              备注
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="竞对优劣势、报价信息等"
              rows={2}
              className="form-input w-full text-sm resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:text-foreground"
            >
              取消
            </button>
            <button
              onClick={handleAdd}
              disabled={!formName.trim() || saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "保存中..." : "添加"}
            </button>
          </div>
        </div>
      )}

      {/* Competitor List */}
      {competitors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-2 text-sm text-muted">暂无竞争对手信息</p>
          <p className="mt-1 text-xs text-muted">
            添加竞对信息后，谋局生成时将自动注入竞争防守策略
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {competitors.map((c) => {
            const config = STRENGTH_CONFIG[c.strength];
            return (
              <div
                key={c.id}
                className="flex items-start justify-between rounded-xl border border-border bg-card p-4"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {c.name}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.style}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  {c.knownContacts && (
                    <p className="text-xs text-secondary">
                      已知联系人：{c.knownContacts}
                    </p>
                  )}
                  {c.notes && (
                    <p className="text-xs text-muted">{c.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  disabled={saving}
                  className="ml-3 flex-shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
