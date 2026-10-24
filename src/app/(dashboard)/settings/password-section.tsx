"use client";
import { useState } from "react";
import { Lock, Loader2, Check, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PasswordSection() {
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const valid = newPwd.length >= 8 && /[A-Z]/.test(newPwd) && /[a-z]/.test(newPwd) && /\d/.test(newPwd) && newPwd === confirmPwd;

  async function handleSave() {
    if (!valid) return;
    setSaving(true); setMsg(null);
    try {
      const sb = createClient();
      const { error } = await sb.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setMsg({ type: "ok", text: "密码已更新" });
      setNewPwd(""); setConfirmPwd("");
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "更新失败" });
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lock className="h-4 w-4 text-muted" /> 修改密码
      </h2>
      <div className="space-y-3 max-w-md">
        <div>
          <label className="form-label">新密码</label>
          <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
            placeholder="至少8位，含大小写字母和数字" className="form-input" />
        </div>
        <div>
          <label className="form-label">确认新密码</label>
          <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
            placeholder="再次输入新密码" className="form-input" />
          {confirmPwd && newPwd !== confirmPwd && <p className="text-xs text-danger mt-1">密码不匹配</p>}
        </div>
        {msg && (
          <div className={`flex items-center gap-2 text-xs ${msg.type === "ok" ? "text-positive" : "text-danger"}`}>
            {msg.type === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {msg.text}
          </div>
        )}
        <button onClick={handleSave} disabled={!valid || saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
          更新密码
        </button>
      </div>
    </div>
  );
}
