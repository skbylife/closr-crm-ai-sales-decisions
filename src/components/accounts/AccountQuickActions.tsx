"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Mail,
  Phone,
  Calendar,
  ClipboardList,
  Swords,
  Radio,
  UserPlus,
  BarChart3,
  MessageCircle,
} from "lucide-react";
import { useLocale } from "@/lib/i18n";

interface QuickAction {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  onClick: () => void;
}

interface AccountQuickActionsProps {
  accountId: string;
  accountName: string;
  onShowActivity: (type: 'call' | 'meeting' | 'note') => void;
}

export function AccountQuickActions({
  accountId,
  accountName,
  onShowActivity,
}: AccountQuickActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useLocale();
  const en = locale === "en";
  const decodeHref = `/decode?accountId=${accountId}`;
  const tasksHref = `/tasks?accountId=${accountId}`;
  const intelHref = `/intel?accountId=${accountId}`;
  const newPlayHref = `${pathname}?tab=plays&quickAction=new-play`;
  const addContactHref = `${pathname}?tab=contacts&quickAction=add-contact`;
  const analysisHref = `${pathname}?tab=overview&quickAction=view-analysis`;

  useEffect(() => {
    [decodeHref, tasksHref, intelHref, newPlayHref, addContactHref, analysisHref].forEach((href) => router.prefetch(href));
  }, [addContactHref, analysisHref, decodeHref, intelHref, newPlayHref, router, tasksHref]);

  const secondaryActions: QuickAction[] = [
    {
      id: "task",
      icon: ClipboardList,
      label: en ? "Create task" : "创建任务",
      color: "text-orange-500",
      onClick: () => router.push(tasksHref),
    },
    {
      id: "play",
      icon: Swords,
      label: en ? "New play" : "新建谋局",
      color: "text-red-500",
      onClick: () => router.push(newPlayHref),
    },
    {
      id: "intel",
      icon: Radio,
      label: en ? "Search intel" : "搜索情报",
      color: "text-indigo-500",
      onClick: () => router.push(intelHref),
    },
    {
      id: "contact",
      icon: UserPlus,
      label: en ? "Add contact" : "添加联系人",
      color: "text-teal-500",
      onClick: () => router.push(addContactHref),
    },
    {
      id: "analysis",
      icon: BarChart3,
      label: en ? "View analysis" : "查看分析",
      color: "text-pink-500",
      onClick: () => router.push(analysisHref),
    },
  ];

  const interactionChips = [
    { id: "email", icon: Mail, label: en ? "Email" : "邮件", color: "text-blue-500", onClick: () => router.push(decodeHref) },
    { id: "call", icon: Phone, label: en ? "Call" : "通话", color: "text-green-500", onClick: () => onShowActivity('call') },
    { id: "meeting", icon: Calendar, label: en ? "Meeting" : "会议", color: "text-purple-500", onClick: () => onShowActivity('meeting') },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{en ? "Quick actions" : "快捷动作"}</h2>
        <span className="text-xs text-muted">{en ? `Common actions for ${accountName}` : `针对 ${accountName} 的常用操作`}</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr]">
        {/* Primary: 解读互动 card */}
        <div className="sm:col-span-2 lg:col-span-1 rounded-xl border border-accent/20 bg-gradient-to-br from-card to-stripe px-4 py-3.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <MessageCircle className="h-4 w-4 text-accent" />
            </div>
            <span className="text-sm font-semibold text-foreground">{en ? "Decode interaction" : "解读互动"}</span>
          </div>
          <div className="flex gap-1.5">
            {interactionChips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.id}
                  onClick={chip.onClick}
                  onMouseEnter={() => {
                    if (chip.id === "email") router.prefetch(decodeHref);
                  }}
                  className="group flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card/80 px-2.5 py-2 text-xs font-medium text-foreground transition-all hover:border-accent/30 hover:bg-background hover:shadow-sm"
                >
                  <Icon className={`h-3.5 w-3.5 ${chip.color} shrink-0`} />
                  <span className="leading-none">{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary actions grid — fills remaining space */}
        <div className="sm:col-span-2 lg:col-span-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {secondaryActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={action.onClick}
                onMouseEnter={() => {
                  if (action.id === "task") router.prefetch(tasksHref);
                  if (action.id === "intel") router.prefetch(intelHref);
                  if (action.id === "play") router.prefetch(newPlayHref);
                  if (action.id === "contact") router.prefetch(addContactHref);
                  if (action.id === "analysis") router.prefetch(analysisHref);
                }}
                className="group flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 text-center transition-all hover:border-accent/30 hover:bg-stripe hover:shadow-sm"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background transition-colors">
                  <Icon className={`h-4 w-4 ${action.color}`} />
                </div>
                <span className="text-xs font-medium text-foreground leading-tight">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
