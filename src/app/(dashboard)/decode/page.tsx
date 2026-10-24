"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, History, ChevronRight, Languages } from "lucide-react";

import type { DecodeOutput, StrategyOutput, SavedDecode } from "@/lib/babel-engine/types";
import { EmailList } from "@/components/email/email-list";
import { DecodePanel } from "@/components/email/decode-panel";
import IntelCenter from "@/components/intel/intel-center";
import { useStore } from "@/lib/store";
import { friendlyError } from "@/lib/error-helper";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { runAutoPipeline, type PipelineStep } from "@/lib/auto-pipeline";
import AutomationProgress from "@/components/ui/automation-progress";

import DecodeInput from "@/components/decode/decode-input";
import { autoMatchAccount } from "@/components/decode/decode-helpers";
import DecodeResult from "@/components/decode/decode-result";
import StrategyOutputPanel from "@/components/decode/strategy-output";
import ActionItemsPanel from "@/components/decode/action-items-panel";
import MeetingDecodePanel from "@/components/decode/meeting-decode";
import { AIProgressSteps, DecodeAnalysisProgress } from "@/components/decode/decode-shared";
import { SpotlightTour, type TourStep } from "@/components/onboarding/SpotlightTour";
import DecodeHistoryDrawer from "@/components/decode/decode-history-drawer";
import type { DecodeGoal, DecodeSource } from "@/components/decode/decode-helpers";
import { DECODE_GOAL_LABELS, DECODE_SOURCE_LABELS } from "@/components/decode/decode-helpers";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";

const DECODE_TOUR_STEPS: TourStep[] = [
  {
    target: "body",
    title: "邮件解读 — 真实意图判断",
    content: "粘贴客户邮件往来，Closr 会帮你分析对方的真实意图、风险信号和情感变化。试试粘贴一段最近的客户邮件，看看判断依据是否清楚。",
    position: "bottom",
  },
  {
    target: "[data-tour='decode-input']",
    title: "粘贴客户沟通内容",
    content: "在这里粘贴客户邮件、聊天记录或会议纪要，支持多轮往来。系统会分析对方的真实意图。",
    position: "bottom",
  },
  {
    target: "[data-tour='decode-client']",
    title: "选择关联客户",
    content: "选择关联的客户账号，系统会结合客户背景和历史沟通来分析，让解读更精准。",
    position: "bottom",
  },
  {
    target: "[data-tour='decode-button']",
    title: "开始解读",
    content: "点击开始，分析邮件的真实意图、风险信号和情感变化，并给出行动建议。",
    position: "top",
  },
  {
    target: "[data-tour='decode-result']",
    title: "解读结果",
    content: "这里显示解读结果，包括意图分析、风险信号、情绪判断和下一步行动建议。",
    position: "top",
  },
];
const DECODE_TOUR_STEPS_EN: TourStep[] = [
  { target: "body", title: "Decode - Read real intent", content: "Paste customer emails or conversations. Closr reads intent, risk signals, emotion, and the evidence behind the judgment.", position: "bottom" },
  { target: "[data-tour='decode-input']", title: "Paste customer communication", content: "Paste customer email, chat, or meeting notes. Multi-turn context is supported.", position: "bottom" },
  { target: "[data-tour='decode-client']", title: "Link an account", content: "Attach the signal to an account so Closr can use customer background and prior communication.", position: "bottom" },
  { target: "[data-tour='decode-button']", title: "Start decode", content: "Analyze intent, risk, sentiment, and recommended actions.", position: "top" },
  { target: "[data-tour='decode-result']", title: "Decode result", content: "The result shows intent, risk signals, sentiment, and recommended next moves.", position: "top" },
];

// ─── Main Page ────────────────────────────────────────────────────────

export default function QuickDecodePage() {
  const { t, locale } = useLocale();
  const en = locale === "en";
  const { jobTitle, user: authUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pageTab, setPageTab] = useState<"decode" | "intel">("decode");
  const [inputCollapsed, setInputCollapsed] = useState(false);
  const [emailText, setEmailText] = useState("");
  const [clientName, setClientName] = useState("");
  const [dealStage, setDealStage] = useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [role, setRole] = useState("");
  const [activeTab, setActiveTab] = useState<"decode" | "inbox">("decode");
  const [decodeMode, setDecodeMode] = useState<"text" | "recording">("text");
  const [context, setContext] = useState("");
  const [signalSource, setSignalSource] = useState<DecodeSource>("email");
  const [analysisGoal, setAnalysisGoal] = useState<DecodeGoal>("auto");
  const [signalContext, setSignalContext] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- InboxEmail type is component-local in inbox-panel
  const [selectedInboxEmail, setSelectedInboxEmail] = useState<any>(null);
  const [decodeStatusMap, setDecodeStatusMap] = useState<Record<string, "pending" | "decoding" | "done" | "error">>({});

  const [decodeResult, setDecodeResult] = useState<DecodeOutput | null>(null);
  const [strategyResult, setStrategyResult] = useState<StrategyOutput | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [strategizing, setStrategizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);
  const [savedAccountName, setSavedAccountName] = useState("");
  const [savedAccountId, setSavedAccountId] = useState("");
  const [savedDecodeId, setSavedDecodeId] = useState("");
  const [savedOpportunityId, setSavedOpportunityId] = useState("");
  const [savedContactId, setSavedContactId] = useState("");
  const [historyDetailItem, setHistoryDetailItem] = useState<SavedDecode | null>(null);
  const drawerClosingRef = useRef(false);
  const [signalLibrarySource, setSignalLibrarySource] = useState<"all" | DecodeSource>("all");
  const [signalLibraryRisk, setSignalLibraryRisk] = useState<"all" | "high" | "medium" | "low">("all");
  const [signalLibraryStatus, setSignalLibraryStatus] = useState<"all" | "new" | "task_created" | "in_play" | "ignored">("all");

  const saveDecode = useStore((s) => s.saveDecode);
  const { emailDecodes, accounts } = useRoleFilteredData();

  const signalStatusLabels: Record<"new" | "task_created" | "in_play" | "ignored", string> = {
    new: en ? "Open" : "待处理",
    task_created: en ? "Task created" : "已建任务",
    in_play: en ? "In play" : "已进谋局",
    ignored: en ? "Ignored" : "已忽略",
  };

  // 自动化 pipeline 状态
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);

  // 从 store 加载角色
  const savedRole = useStore((s) => s.userSettings.roleDescription);
  useEffect(() => {
    if (savedRole) {
      setRole(savedRole);
    } else {
      const levelLabels: Record<string, string> = en ? { ae: "Sales representative", director: "Director", executive: "Executive" } : { ae: "销售代表", director: "总监", executive: "高管" };
      if (levelLabels[jobTitle]) setRole(levelLabels[jobTitle]);
    }
  }, [jobTitle, savedRole, en]);

  const canDecode = emailText.trim().length > 10 && !decoding;

  // Auto-match account/contact when email text changes
  const [matchedAccountId, setMatchedAccountId] = useState<string | null>(null);
  const [matchedContactId, setMatchedContactId] = useState<string | null>(null);

  const tryAutoMatch = useCallback((text: string) => {
    if (text.trim().length < 20) return;
    const match = autoMatchAccount(text, accounts);
    if (match) {
      // Only auto-fill clientName if user hasn't manually typed something
      if (!clientName || clientName === match.accountName) {
        setClientName(match.accountName);
      }
      setMatchedAccountId(match.accountId);
      setMatchedContactId(match.contactId ?? null);
    }
  }, [accounts, clientName, setClientName]);

  // Debounced auto-match on emailText change
  useEffect(() => {
    if (!emailText || emailText.trim().length < 20) return;
    const timer = setTimeout(() => tryAutoMatch(emailText), 500);
    return () => clearTimeout(timer);
  }, [emailText, tryAutoMatch]);

  // Handle decode from inbox email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- InboxEmail type is component-local
  function handleInboxDecodeEmail(email: any) {
    const content = email.text?.trim() || email.html?.trim() || "";
    if (!content) {
      console.warn("[decode] 收件箱邮件内容为空");
      return;
    }
    setDecodeStatusMap(prev => ({ ...prev, [email.messageId]: "decoding" }));
    setSelectedInboxEmail(email);
  }

  async function handleDecode() {
    setDecoding(true);
    setError(null);
    setDecodeResult(null);
    setStrategyResult(null);
    setStrategyError(null);
    setSaved(false);
    setSavedAccountName("");
    setSavedAccountId("");
    setSavedDecodeId("");
    setSavedOpportunityId("");
    setSavedContactId("");
    setHistoryDetailItem(null);

    try {
      const contextParts: string[] = [];
      if (role) contextParts.push(`My role: ${role}`);
      if (context) contextParts.push(context);
      if (signalContext) contextParts.push(`Signal background: ${signalContext}`);
      const ctxString = contextParts.length > 0 ? contextParts.join(". ") : undefined;

      const res = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailText,
          clientName: clientName || undefined,
          dealStage: dealStage || undefined,
          context: ctxString,
          signalSource,
          analysisGoal,
          signalContext: signalContext || undefined,
          matchedContactId: matchedContactId || undefined,
          matchedAccountId: matchedAccountId || undefined,
          opportunityId: selectedOpportunityId || undefined,
          outputLocale: locale,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `Request failed (${res.status})`
        );
      }

      const decoded: DecodeOutput = await res.json();
      setDecodeResult(decoded);
      setDecoding(false);
      setInputCollapsed(true);

      // Auto-fetch strategies
      setStrategizing(true);
      let strategies: StrategyOutput | undefined;
      const selectedAcc = clientName ? accounts.find((a) => a.name === clientName) : undefined;
      const taskSummaries = selectedAcc
        ? (() => {
            const allTasks = useStore.getState().tasks;
            const accTasks = allTasks.filter((t) => t.accountId === selectedAcc.id);
            const now = new Date();
            return accTasks.map((t) => ({
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              isOverdue: !!(t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'),
              assignedTo: t.assignedTo,
            }));
          })()
        : undefined;
      const stratRes = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decodedEmail: decoded,
          tasks: taskSummaries,
          accountId: selectedAcc?.id,
          outputLocale: locale,
        }),
      });

      if (stratRes.ok) {
        strategies = await stratRes.json();
        setStrategyResult(strategies ?? null);
      } else {
        const data = await stratRes.json().catch(() => ({}));
        setStrategyError((data as { error?: string }).error ?? "推荐邮件生成失败，请稍后重试。");
      }

      // Auto-save to account if a client is selected
      const selectedAccount = clientName
        ? accounts.find((a) => a.name === clientName)
        : undefined;
      if (selectedAccount) {
        const opportunityId = selectedOpportunityId || undefined;

        const decodeId1 = saveDecode({
          accountId: selectedAccount.id,
          accountName: selectedAccount.name,
          opportunityId,
          matchedContactId: matchedContactId || undefined,
          emailText,
          clientName: clientName || undefined,
          dealStage: dealStage || undefined,
          signalSource,
          analysisGoal,
          signalContext: signalContext || undefined,
          decode: decoded,
          strategy: strategies,
        });
        setSaved(true);
        setSavedAccountName(selectedAccount.name);
        setSavedAccountId(selectedAccount.id);
        setSavedDecodeId(decodeId1);
        setSavedOpportunityId(opportunityId ?? "");
        setSavedContactId(matchedContactId ?? "");

        // 自动触发 pipeline
        setPipelineOpen(true);
        setPipelineSteps([
          { key: "decode", label: "邮件已解读", status: "done" },
          { key: "contact", label: "联系人已识别", status: "pending" },
          { key: "profile", label: "心理画像生成中", status: "pending" },
          { key: "linkedin", label: "LinkedIn调研中", status: "pending" },
        ]);
        runAutoPipeline({
          decodeResult: decoded,
          emailText,
          senderName: undefined,
          senderEmail: authUser?.email || undefined,
          accountId: selectedAccount.id,
          onProgress: (p) => setPipelineSteps([...p.steps]),
        }).catch(() => {/* pipeline 错误已通过 onProgress 报告 */});
      }
    } catch (err) {
      setError(friendlyError(err));
      setDecoding(false);
    } finally {
      setStrategizing(false);
    }
  }

  function handleSaveToAccount(accountId: string, accountName: string) {
    if (saved) return;
    if (!decodeResult) return;
    const decodeId2 = saveDecode({
      accountId,
      accountName,
      matchedContactId: matchedContactId || undefined,
      emailText,
      clientName: clientName || undefined,
      dealStage: dealStage || undefined,
      signalSource,
      analysisGoal,
      signalContext: signalContext || undefined,
      decode: decodeResult,
      strategy: strategyResult ?? undefined,
    });
    setSaved(true);
    setSavedAccountName(accountName);
    setSavedAccountId(accountId);
    setSavedDecodeId(decodeId2);
    setSavedContactId(matchedContactId ?? "");
  }

  const openDecodeHistoryItem = useCallback((item: SavedDecode) => {
    setDecodeResult(item.decode);
    setStrategyResult(item.strategy ?? null);
    setSaved(true);
    setSavedAccountName(item.accountName || item.clientName || '未命名客户');
    setSavedAccountId(item.accountId || '');
    setSavedDecodeId(item.id);
    setSavedOpportunityId(item.opportunityId || '');
    setSavedContactId(item.matchedContactId || '');
    setClientName(item.clientName || item.accountName || '');
    setDealStage(item.dealStage || '');
    setSignalSource(item.signalSource || 'email');
    setAnalysisGoal(item.analysisGoal || 'auto');
    setSignalContext(item.signalContext || '');
    setSelectedOpportunityId(item.opportunityId || '');
    setEmailText(item.emailText || '');
    setInputCollapsed(true);
    setError(null);
    setDecoding(false);
    setStrategizing(false);
    setHistoryDetailItem(item);
    const params = new URLSearchParams(searchParams.toString());
    params.set("decodeId", item.id);
    router.replace(`/decode?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  function detectHistoryLanguage(text: string) {
    if (!text.trim()) return en ? 'Unknown' : '未知';
    if (/[\u4e00-\u9fff]/.test(text)) return en ? 'Chinese' : '中文';
    if (/[ぁ-んァ-ン]/.test(text)) return en ? 'Japanese' : '日语';
    if (/[가-힣]/.test(text)) return en ? 'Korean' : '韩语';
    return 'English';
  }

  const recentDecodes = emailDecodes
    .filter((item) => signalLibrarySource === "all" || (item.signalSource || "email") === signalLibrarySource)
    .filter((item) => signalLibraryStatus === "all" || (item.signalStatus || "new") === signalLibraryStatus)
    .filter((item) => {
      if (signalLibraryRisk === "all") return true;
      const risk = item.decode.threadAnalysis?.riskLevel;
      if (signalLibraryRisk === "high") return risk === "high" || risk === "critical";
      return risk === signalLibraryRisk;
    })
    .slice(0, 12);

  useEffect(() => {
    const targetDecodeId = searchParams.get("decodeId");
    if (!targetDecodeId) {
      // URL no longer has decodeId — reset the closing guard
      drawerClosingRef.current = false;
      return;
    }
    // Skip if we are in the middle of an intentional close
    if (drawerClosingRef.current) return;
    if (historyDetailItem?.id === targetDecodeId) return;
    const targetDecode = emailDecodes.find((item) => item.id === targetDecodeId);
    if (targetDecode) {
      openDecodeHistoryItem(targetDecode);
    }
  }, [searchParams, emailDecodes, historyDetailItem?.id, openDecodeHistoryItem]);

  return (
    <div className="page-shell">
      <SpotlightTour tourKey="decode" steps={en ? DECODE_TOUR_STEPS_EN : DECODE_TOUR_STEPS} />
      {/* Full-width tab bar */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setPageTab("decode")}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${pageTab === "decode" ? "bg-[var(--accent-primary)] text-white" : "text-secondary hover:bg-background"}`}
        >
          {t("decode.tabs.decode")}
        </button>
        <button
          onClick={() => setPageTab("intel")}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${pageTab === "intel" ? "bg-[var(--accent-primary)] text-white" : "text-secondary hover:bg-background"}`}
        >
          {t("decode.tabs.intel")}
        </button>
      </div>

      {/* ═══ Intel Tab ═══ */}
      {pageTab === "intel" && <IntelCenter />}

      {/* ═══ Decode Tab ═══ */}
      {pageTab === "decode" && (<>
      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-sidebar p-0.5">
        <button
          onClick={() => setActiveTab("decode")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "decode" ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"
          }`}
        >
          {t("decode.quickDecodeTab")}
        </button>
        <button
          onClick={() => setActiveTab("inbox")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "inbox" ? "bg-card text-foreground shadow-sm" : "text-secondary hover:text-foreground"
          }`}
        >
          {t("decode.inboxTab")}
        </button>
      </div>

      {activeTab === "decode" && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{en ? "How to enter customer updates" : "怎么录入客户信号？"}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[13px] text-secondary">
            <span className="rounded-full bg-card px-2 py-1 border border-border">{en ? "Customer email" : "客户邮件"}</span>
            <span className="rounded-full bg-card px-2 py-1 border border-border">{en ? "Meeting notes" : "会议纪要"}</span>
            <span className="rounded-full bg-card px-2 py-1 border border-border">{en ? "Call notes" : "通话记录"}</span>
            <span className="rounded-full bg-card px-2 py-1 border border-border">{en ? "WeCom / Slack chat" : "企业微信 / Slack 聊天"}</span>
            <span className="rounded-full bg-card px-2 py-1 border border-border">{en ? "Channel / competitor intel" : "渠道 / 竞品情报"}</span>
          </div>
        </div>
      )}

      {/* Inbox Tab */}
      {activeTab === "inbox" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1">
          {/* Email List */}
          <div className="rounded-xl border border-border bg-card card-elevated flex flex-col min-h-0">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">{en ? "Inbox" : "收件箱"}</h2>
              <p className="mt-0.5 text-sm text-secondary">{en ? "Select an email to decode" : "选择邮件进行解读"}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <EmailList
                onSelectEmail={setSelectedInboxEmail}
                onDecodeEmail={handleInboxDecodeEmail}
                selectedEmailId={selectedInboxEmail?.messageId}
                decodeStatus={decodeStatusMap}
              />
            </div>
          </div>

          {/* Decode Panel */}
          <div className="rounded-xl border border-border bg-card card-elevated flex flex-col min-h-0">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">{en ? "Email Decode" : "邮件解读"}</h2>
              <p className="mt-0.5 text-sm text-secondary">{en ? "Read the real intent and next move in the email" : "判断邮件里的真实意图和下一步动作"}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DecodePanel
                selectedEmail={selectedInboxEmail}
                onDecodeComplete={() => {
                  if (selectedInboxEmail) {
                    setDecodeStatusMap(prev => ({
                      ...prev,
                      [selectedInboxEmail.messageId]: "done"
                    }));
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Full-width Input + Results (vertical stack) */}
      {activeTab === "decode" && (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {/* INPUT SECTION (full width, collapsible) */}
        {inputCollapsed ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-secondary">{en ? "Input collapsed" : "输入内容已折叠"}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setEmailText('');
                  setClientName('');
                  setDealStage('');
                  setSelectedOpportunityId('');
                  setContext('');
                  setSignalSource('email');
                  setAnalysisGoal('auto');
                  setSignalContext('');
                  setDecodeResult(null);
                  setStrategyResult(null);
                  setSaved(false);
                  setSavedAccountName('');
                  setSavedAccountId('');
                  setSavedDecodeId('');
                  setSavedOpportunityId('');
                  setSavedContactId('');
                  setInputCollapsed(false);
                  setMatchedAccountId(null);
                  setMatchedContactId(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                {en ? "New decode" : "新建解读"}
              </button>
              <button
                onClick={() => setInputCollapsed(false)}
                className="text-sm text-accent hover:underline"
              >
                {en ? "Expand" : "展开"}
              </button>
            </div>
          </div>
        ) : (
        <div className="flex flex-col rounded-xl border border-border bg-card card-elevated" data-tour="decode-input">
          <div className="border-b border-border px-5 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t("decode.title")}</h1>
              <p className="mt-0.5 text-sm text-secondary">{t("decode.subtitle")}</p>
            </div>
            {decodeResult && (
              <button
                onClick={() => setInputCollapsed(true)}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                {en ? "Collapse ▲" : "折叠 ▲"}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4">
            {/* Level 1: 邮件/聊天 vs 会议录音 */}
            <div className="module-tabs">
              <button
                onClick={() => setDecodeMode("text")}
                className={`module-tab ${decodeMode === "text" ? "module-tab-active" : ""}`}
              >
                {en ? "Email / chat" : "邮件/聊天"}
              </button>
              <button
                onClick={() => setDecodeMode("recording")}
                className={`module-tab ${decodeMode === "recording" ? "module-tab-active" : ""}`}
              >
                {en ? "Meeting recording" : "会议录音"}
              </button>
            </div>

            {decodeMode === "text" && (
              <DecodeInput
                emailText={emailText}
                setEmailText={setEmailText}
                clientName={clientName}
                setClientName={setClientName}
                dealStage={dealStage}
                setDealStage={setDealStage}
                selectedOpportunityId={selectedOpportunityId}
                setSelectedOpportunityId={setSelectedOpportunityId}
                role={role}
                setRole={setRole}
                context={context}
                setContext={setContext}
                signalSource={signalSource}
                setSignalSource={setSignalSource}
                analysisGoal={analysisGoal}
                setAnalysisGoal={setAnalysisGoal}
                signalContext={signalContext}
                setSignalContext={setSignalContext}
                decoding={decoding}
                error={error}
                canDecode={canDecode}
                onDecode={handleDecode}
              />
            )}

            {decodeMode === "recording" && (
              <MeetingDecodePanel inputFieldClass="form-input" />
            )}
          </div>
        </div>
        )}

        {/* RESULTS SECTION */}
        <div className="flex flex-col rounded-xl border border-border bg-card card-elevated" data-tour="decode-result">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">{t("decode.babelAnalysis")}</h2>
            <p className="mt-0.5 text-sm text-secondary">{t("decode.uncoverSignals")}</p>
          </div>

          <div>
            {(decoding || strategizing) && <AIProgressSteps step={decoding ? "decode" : "strategy"} />}
            {decoding && <DecodeAnalysisProgress />}

            {!decoding && !strategizing && !decodeResult && (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-sidebar">
                  <Send className="h-6 w-6 text-muted" />
                </div>
                <p className="text-sm font-medium text-foreground">{t("decode.pasteHint")}</p>
                <p className="mt-1.5 text-xs text-muted">{t("decode.babelReveal")}</p>
              </div>
            )}

            {decodeResult && (
              <DecodeResult
                decodeResult={decodeResult}
                saved={saved}
                savedAccountName={savedAccountName}
                savedAccountId={savedAccountId}
                savedDecodeId={savedDecodeId}
                savedOpportunityId={savedOpportunityId}
                savedContactId={savedContactId}
                clientName={clientName}
                signalSource={signalSource}
                analysisGoal={analysisGoal}
                signalContext={signalContext}
                onSaveToAccount={handleSaveToAccount}
              />
            )}
          </div>
        </div>
      </div>
      )}

      {/* Action Items Panel */}
      {decodeResult?.actionItems && decodeResult.actionItems.length > 0 && (
        <ActionItemsPanel
          decodeResult={decodeResult}
          clientName={clientName}
          accountId={savedAccountId}
          opportunityId={savedOpportunityId}
        />
      )}

      {/* Reply Strategies: current decode output, before historical signal library */}
      {(strategizing || strategyResult || strategyError) && (
        <StrategyOutputPanel
          strategyResult={strategyResult}
          strategizing={strategizing}
          error={strategyError}
          savedAccountId={savedAccountId}
          opportunityId={savedOpportunityId}
        />
      )}

      {activeTab === "decode" && emailDecodes.length > 0 && (
        <div className="rounded-xl border border-border bg-card card-elevated">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <History className="h-4 w-4 text-accent" />
                {en ? "Signal Library" : "信号库"}
              </h2>
            </div>
            {savedAccountId && (
              <Link href={`/accounts/${savedAccountId}?tab=activity${savedDecodeId ? `&targetKind=email_decode&targetId=${encodeURIComponent(savedDecodeId)}` : ''}`} className="text-xs text-accent hover:underline">
                {en ? "View full account history" : "查看客户内完整历史"}
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(["all", "email", "meeting", "call", "chat", "intel", "other"] as const).map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setSignalLibrarySource(source)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      signalLibrarySource === source
                        ? "border-accent/30 bg-accent/10 text-accent"
                        : "border-border bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    {source === "all" ? (en ? "All sources" : "全部来源") : DECODE_SOURCE_LABELS[source]?.[locale] ?? source}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "all", label: en ? "All statuses" : "全部状态" },
                  { key: "new", label: signalStatusLabels.new },
                  { key: "task_created", label: signalStatusLabels.task_created },
                  { key: "in_play", label: signalStatusLabels.in_play },
                  { key: "ignored", label: signalStatusLabels.ignored },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSignalLibraryStatus(item.key as typeof signalLibraryStatus)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      signalLibraryStatus === item.key
                        ? "border-positive/30 bg-positive/10 text-positive"
                        : "border-border bg-background text-muted hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: "all", label: en ? "All risks" : "全部风险" },
                { key: "high", label: en ? "High risk" : "高风险" },
                { key: "medium", label: en ? "Medium risk" : "中风险" },
                { key: "low", label: en ? "Low risk" : "低风险" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSignalLibraryRisk(item.key as typeof signalLibraryRisk)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    signalLibraryRisk === item.key
                      ? "border-foreground/15 bg-foreground/5 text-foreground"
                      : "border-border bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentDecodes.length > 0 ? recentDecodes.map((item) => (
              <button
                key={item.id}
                onClick={() => openDecodeHistoryItem(item)}
                className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-sidebar/60 ${savedDecodeId === item.id ? 'bg-accent/[0.04]' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.accountName || item.clientName || (en ? 'Unnamed account' : '未命名客户')}</span>
                    <span className="text-xs text-muted">{new Date(item.date).toLocaleString(en ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                      {DECODE_SOURCE_LABELS[item.signalSource || 'email']?.[locale] ?? (en ? 'Email' : '邮件')}
                    </span>
                    <span className="rounded-full border border-positive/20 bg-positive/5 px-2 py-0.5 text-[11px] text-positive">
                      {signalStatusLabels[item.signalStatus || 'new']}
                    </span>
                    {item.dealStage && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">{item.dealStage}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-secondary">{item.decode.threadAnalysis?.keySignal || item.emailText.slice(0, 120)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                    <span>{item.clientName || item.accountName || (en ? 'Unnamed object' : '未命名对象')}</span>
                    <span>{DECODE_GOAL_LABELS[item.analysisGoal || 'auto']?.[locale] ?? (en ? 'Auto judgment' : '自动判断')}</span>
                    <span className="inline-flex items-center gap-1"><Languages className="h-3 w-3" />{detectHistoryLanguage(item.emailText)}</span>
                    <span>{item.strategy?.strategies?.length ? (en ? 'Has reply strategy' : '含回复策略') : (en ? 'Decode only' : '仅解读')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span>{en ? "Details" : "查看详情"}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            )) : (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-foreground">{en ? "No signals match the current filters" : "当前筛选下暂无信号"}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <DecodeHistoryDrawer
        item={historyDetailItem}
        open={!!historyDetailItem}
        onClose={() => {
          // Set closing guard FIRST so the searchParams useEffect won't reopen
          drawerClosingRef.current = true;
          setHistoryDetailItem(null);
          // Use router.replace so Next.js searchParams actually updates
          const params = new URLSearchParams(searchParams.toString());
          params.delete('decodeId');
          router.replace(`/decode${params.size ? `?${params.toString()}` : ''}`, { scroll: false });
        }}
      />

      {/* 自动化进度弹窗 */}
      <AutomationProgress
        open={pipelineOpen}
        steps={pipelineSteps}
        onClose={() => setPipelineOpen(false)}
      />
      </>)}
    </div>
  );
}
