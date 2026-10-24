"use client";
import { useState, useEffect } from "react";
import { Settings, Plus, Trash2, GripVertical, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const DEFAULT_STAGES = ["已识别线索", "需求发现中", "方案已呈现", "报价已发送", "商务谈判中", "已签约", "已丢单"];

export default function PipelineConfigSection() {
  const { orgId, orgRole } = useAuth();
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const [newStage, setNewStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canEdit = orgRole === "owner" || orgRole === "admin";
  if (!canEdit) return null;

  function addStage() {
    if (!newStage.trim()) return;
    setStages([...stages, newStage.trim()]);
    setNewStage("");
  }

  function removeStage(i: number) {
    setStages(stages.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      await fetch("/api/organization/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, settings: { pipelineStages: stages } }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Settings className="h-4 w-4 text-muted" /> 销售流程配置
      </h2>
      <p className="text-xs text-muted mb-3">自定义销售管线阶段名称和顺序</p>
      <div className="space-y-1.5 mb-3">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <GripVertical className="h-3.5 w-3.5 text-muted/40" />
            <span className="text-sm text-foreground flex-1">{s}</span>
            <button onClick={() => removeStage(i)} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <input value={newStage} onChange={e => setNewStage(e.target.value)} onKeyDown={e => e.key === "Enter" && addStage()}
          placeholder="添加新阶段..." className="form-input flex-1 text-sm" />
        <button onClick={addStage} disabled={!newStage.trim()}
          className="rounded-lg bg-sidebar px-3 py-2 text-sm text-foreground hover:bg-border disabled:opacity-40">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <span>✅ 已保存</span> : <><Save className="h-3.5 w-3.5" /> 保存配置</>}
      </button>
    </div>
  );
}
