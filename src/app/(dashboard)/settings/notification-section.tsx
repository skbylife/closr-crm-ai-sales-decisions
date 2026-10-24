"use client";
import { Bell } from "lucide-react";
import { useStore } from "@/lib/store";

export default function NotificationSection() {
  const notificationPrefs = useStore((s) => s.userSettings.notificationPrefs);
  const setUserSettings = useStore((s) => s.setUserSettings);

  function toggle(key: keyof typeof notificationPrefs) {
    const updated = { ...notificationPrefs, [key]: !notificationPrefs[key] };
    setUserSettings({ notificationPrefs: updated });
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bell className="h-4 w-4 text-muted" /> 通知偏好
      </h2>
      <div className="space-y-3">
        {([
          ["taskAssigned", "新任务分配通知"] as const,
          ["decodeComplete", "邮件解读完成通知"] as const,
          ["teamChange", "团队成员变更通知"] as const,
          ["inApp", "应用内通知"] as const,
        ]).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-foreground">{label}</span>
            <button onClick={() => toggle(key)}
              className={`relative h-6 w-11 rounded-full transition-colors ${notificationPrefs[key] ? "bg-accent" : "bg-border"}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notificationPrefs[key] ? "translate-x-5" : ""}`} />
            </button>
          </label>
        ))}
      </div>
    </div>
  );
}
