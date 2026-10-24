"use client";

import { useState, useMemo } from "react";
import {
  Users,
  FileText,
  MessageSquare,
  Swords,
  Loader2,
  ChevronDown,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type {
  Contact,
  MeetingPrepResult,
} from "@/lib/babel-engine/types";

interface MeetingBriefingProps {
  accountId: string;
  contactIds: string[];
  agenda: string;
  onClose: () => void;
}

function Section({
  icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground"
      >
        {icon}
        {title}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

export function MeetingBriefing({
  accountId,
  contactIds,
  agenda,
  onClose,
}: MeetingBriefingProps) {
  const accounts = useStore((s) => s.accounts);
  const emailDecodes = useStore((s) => s.emailDecodes);
  const intelItems = useStore((s) => s.intelItems);
  const tasks = useStore((s) => s.tasks);
  const opportunities = useStore((s) => s.opportunities);

  const account = accounts.find((a) => a.id === accountId);
  const contacts = account?.contacts?.filter((c) => contactIds.includes(c.id)) ?? [];

  // Recent decodes for this account (last 3)
  const recentDecodes = useMemo(
    () =>
      emailDecodes
        .filter((d) => d.accountId === accountId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 3),
    [emailDecodes, accountId]
  );

  // Pending commitment tasks
  const commitmentTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.accountId === accountId && t.status !== "done"
      ),
    [tasks, accountId]
  );

  // Active plays for account
  const accountOpps = opportunities.filter((o) => o.accountId === accountId);

  const [briefing, setBriefing] = useState<MeetingPrepResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!account) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/meeting-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          meetingType: "other",
          agenda,
          account: {
            name: account.name,
            industry: account.industry,
            dealStage: account.dealStage,
            dealValue: account.dealValue,
            dealHealth: account.dealHealth,
          },
          contacts: contacts.map((c) => ({
            name: c.name,
            title: c.title,
            role: c.role,
            decisionStyle: c.decisionStyle,
            riskAppetite: c.riskAppetite,
            communicationNotes: c.communicationNotes,
            landmines: c.landmines,
          })),
          attendees: contacts.map((c) => ({
            name: c.name,
            title: c.title,
            role: c.role,
            hasProfile: !!c.contactProfile,
            profileSummary: c.contactProfile
              ? `决策风格:${c.contactProfile.decisionStyle?.type ?? "未知"}, 风险偏好:${c.contactProfile.riskAppetite ?? "未知"}`
              : undefined,
          })),
          contactProfiles: contacts
            .filter((c) => c.contactProfile)
            .map((c) => ({
              name: c.name,
              summary: `决策风格:${c.contactProfile!.decisionStyle?.type ?? "未知"}, 沟通:${c.contactProfile!.communication?.formality ?? "未知"}, 触发:${(c.contactProfile!.positiveTriggers ?? []).join("/")}`,
            })),
          recentIntel: intelItems
            .filter((i) => i.accountId === accountId)
            .slice(0, 5)
            .map((i) => i.summary || i.title),
          recentDecodes: recentDecodes.map((d) => ({
            emailSnippet: d.emailText.slice(0, 100),
            sentiment: d.decode?.threadAnalysis?.sentimentTrend ?? "unknown",
            keySignal: d.decode?.threadAnalysis?.keySignal ?? "",
          })),
          meddiccScore: accountOpps[0]?.meddicc?.overallScore,
        }),
      });

      if (!res.ok) throw new Error("生成失败");
      const data = await res.json() as MeetingPrepResult;
      setBriefing(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  if (!account) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">
              会议准备 · {account.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sidebar hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 1. Attendee profiles */}
          <Section
            icon={<Users className="h-4 w-4 text-blue-500" />}
            title={`参会人画像 (${contacts.length})`}
          >
            {contacts.length === 0 ? (
              <p className="text-xs text-muted">未选择参会人</p>
            ) : (
              <div className="space-y-3">
                {contacts.map((c) => (
                  <ContactSummary key={c.id} contact={c} />
                ))}
              </div>
            )}
          </Section>

          {/* 2. Recent communication */}
          <Section
            icon={<MessageSquare className="h-4 w-4 text-positive" />}
            title={`最近沟通要点 (${recentDecodes.length})`}
          >
            {recentDecodes.length === 0 ? (
              <p className="text-xs text-muted">暂无沟通记录</p>
            ) : (
              <div className="space-y-2">
                {recentDecodes.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-muted mb-1">
                      <span>{d.clientName || d.accountName || "邮件"}</span>
                      <span>{new Date(d.date).toLocaleDateString("zh-CN")}</span>
                    </div>
                    {d.decode?.threadAnalysis && (
                      <div className="flex items-center gap-2 text-xs mb-1">
                        <span
                          className={`font-medium ${
                            d.decode.threadAnalysis.sentimentTrend === "warming"
                              ? "text-positive"
                              : d.decode.threadAnalysis.sentimentTrend === "cooling"
                                ? "text-danger"
                                : "text-foreground"
                          }`}
                        >
                          {d.decode.threadAnalysis.sentimentTrend}
                        </span>
                        <span className="text-muted">·</span>
                        <span className="text-foreground">
                          {d.decode.threadAnalysis.keySignal}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-secondary line-clamp-2">
                      {d.emailText.slice(0, 120)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 3. Commitment tasks */}
          <Section
            icon={<Swords className="h-4 w-4 text-warning" />}
            title={`承诺事项 (${commitmentTasks.length})`}
            defaultOpen={commitmentTasks.length > 0}
          >
            {commitmentTasks.length === 0 ? (
              <p className="text-xs text-muted">暂无待办承诺</p>
            ) : (
              <div className="space-y-1.5">
                {commitmentTasks.slice(0, 8).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                        t.priority === "urgent" || t.priority === "high"
                          ? "bg-danger"
                          : t.priority === "medium"
                            ? "bg-warning"
                            : "bg-muted"
                      }`}
                    />
                    <span className="text-foreground truncate">{t.title}</span>
                    {t.dueDate && (
                      <span className="text-muted flex-shrink-0">
                        {new Date(t.dueDate).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 4. AI Strategy */}
          {!briefing && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-5 py-3.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI 生成谈判策略中...
                </>
              ) : (
                <>
                  <Swords className="h-4 w-4" />
                  生成 AI 谈判策略
                </>
              )}
            </button>
          )}

          {error && (
            <p className="text-xs text-danger text-center">{error}</p>
          )}

          {briefing && (
            <div className="space-y-4">
              {/* Win probability */}
              {briefing.winProbability != null && (
                <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-foreground">
                      成功概率
                    </span>
                    <span className="text-lg font-bold text-accent">
                      {briefing.winProbability}%
                    </span>
                  </div>
                  {briefing.winProbabilityReasoning && (
                    <p className="text-xs text-muted">
                      {briefing.winProbabilityReasoning}
                    </p>
                  )}
                </div>
              )}

              {/* Contact analysis */}
              {briefing.contactAnalysis && briefing.contactAnalysis.length > 0 && (
                <Section
                  icon={<Users className="h-4 w-4 text-accent" />}
                  title="参会人分析"
                >
                  <div className="space-y-3">
                    {briefing.contactAnalysis.map((ca, i) => (
                      <div key={i} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground">{ca.name}</span>
                          {ca.title && <span className="text-xs text-muted">{ca.title}</span>}
                        </div>
                        <p className="text-xs text-foreground mb-1">{ca.attitudePrediction}</p>
                        {ca.communicationTips?.length > 0 && (
                          <ul className="text-xs text-secondary space-y-0.5">
                            {ca.communicationTips.map((tip, j) => (
                              <li key={j} className="flex items-start gap-1">
                                <span className="text-positive mt-0.5">•</span> {tip}
                              </li>
                            ))}
                          </ul>
                        )}
                        {ca.warnings?.length > 0 && (
                          <div className="mt-1 text-xs text-danger">
                            ⚠️ {ca.warnings.join(" | ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Talking points */}
              {briefing.talkingPoints && briefing.talkingPoints.length > 0 && (
                <Section
                  icon={<MessageSquare className="h-4 w-4 text-positive" />}
                  title="谈话要点"
                >
                  <div className="space-y-2">
                    {briefing.talkingPoints.map((tp, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-foreground">{tp.topic}：</span>
                        <span className="text-secondary">{tp.angle}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Questions to ask */}
              {briefing.questionsToAsk && briefing.questionsToAsk.length > 0 && (
                <Section
                  icon={<FileText className="h-4 w-4 text-blue-500" />}
                  title="关键提问"
                >
                  <div className="space-y-1.5">
                    {briefing.questionsToAsk.map((q, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span
                          className={`mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                            q.priority === "high"
                              ? "bg-danger"
                              : q.priority === "medium"
                                ? "bg-warning"
                                : "bg-muted"
                          }`}
                        />
                        <span className="text-foreground">{q.question}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Topics to avoid */}
              {briefing.topicsToAvoid && briefing.topicsToAvoid.length > 0 && (
                <div className="rounded-lg border border-danger/20 bg-danger/5 p-3">
                  <h4 className="text-xs font-semibold text-danger mb-1">
                    🚫 避免话题
                  </h4>
                  <ul className="text-xs text-foreground space-y-0.5">
                    {briefing.topicsToAvoid.map((t, i) => (
                      <li key={i}>• {t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scripts */}
              {briefing.suggestedScripts && (
                <Section
                  icon={<MessageSquare className="h-4 w-4 text-accent" />}
                  title="推荐话术"
                  defaultOpen={false}
                >
                  <div className="space-y-2 text-xs">
                    {briefing.suggestedScripts.opening && (
                      <div>
                        <span className="font-medium text-foreground">开场白：</span>
                        <p className="text-secondary mt-0.5">{briefing.suggestedScripts.opening}</p>
                      </div>
                    )}
                    {briefing.suggestedScripts.closing && (
                      <div>
                        <span className="font-medium text-foreground">收尾：</span>
                        <p className="text-secondary mt-0.5">{briefing.suggestedScripts.closing}</p>
                      </div>
                    )}
                  </div>
                </Section>
              )}
            </div>
          )}
        </div>
    </div>
  );
}

function ContactSummary({ contact }: { contact: Contact }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-foreground">{contact.name}</span>
        {contact.title && (
          <span className="text-xs text-muted">{contact.title}</span>
        )}
        {contact.role && contact.role !== "unknown" && (
          <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
            {contact.role}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-secondary">
        {contact.decisionStyle && (
          <span>决策风格: {contact.decisionStyle}</span>
        )}
        {contact.riskAppetite && (
          <span>风险偏好: {contact.riskAppetite}</span>
        )}
        {contact.relationship_strength != null && (
          <span>关系强度: {contact.relationship_strength}</span>
        )}
      </div>
      {contact.communicationNotes && (
        <p className="mt-1 text-xs text-muted">{contact.communicationNotes}</p>
      )}
      {contact.landmines && (
        <p className="mt-1 text-xs text-danger">⚠️ {contact.landmines}</p>
      )}
      {contact.contactProfile && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(contact.contactProfile.positiveTriggers ?? []).slice(0, 3).map((t, i) => (
            <span
              key={i}
              className="rounded-full bg-positive/10 px-1.5 py-0.5 text-[10px] text-positive"
            >
              {t}
            </span>
          ))}
          {(contact.contactProfile.negativeTriggers ?? []).slice(0, 2).map((t, i) => (
            <span
              key={i}
              className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
