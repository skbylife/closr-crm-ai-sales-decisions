"use client";

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useState } from "react";
import { Plus, X, AlertTriangle, Target, Trash2, Loader2, Globe, FileText, Briefcase, Search, BarChart3, MessageSquare, RefreshCw, BookOpen, ChevronDown, ChevronUp, History, Tag, Paperclip, CheckCircle2, Save } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Account, Contact, IntelItem, SavedDecode, NewsAnalysisResult, FinancialAnalysisResult, MeetingPrepResult, MeetingPrepInput, MeetingType } from "@/lib/babel-engine/types";
import { MEETING_TYPE_LABELS } from "@/lib/babel-engine/types";
import { ROLE_CONFIG, CopyButton } from "@/components/accounts/shared";
import { NewsSearch } from "@/components/intel/news-search";
import { useLocale } from "@/lib/i18n";
export function MarketIntelTab({
  account,
  contacts,
  intelItems: accountIntel,
  decodes: accountDecodes
}: {
  account: Account;
  contacts: Contact[];
  intelItems: IntelItem[];
  decodes: SavedDecode[];
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const {
    updateAccount,
    addIntel,
    opportunities: allOpportunities
  } = useStore();
  const accountOpportunities = allOpportunities.filter(o => o.accountId === account.id);
  const [savedNewsAsIntel, setSavedNewsAsIntel] = useState(false);
  const [savedFinancialAsIntel, setSavedFinancialAsIntel] = useState(false);
  const [activeSection, setActiveSection] = useState<"news" | "financial" | "meeting">("news");

  // News analysis state - load from cache
  const [newsResult, setNewsResult] = useState<NewsAnalysisResult | null>(account.marketIntel?.newsAnalysis ?? null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Financial analysis state - load from cache
  const [financialBlocks, setFinancialBlocks] = useState<{
    title: string;
    content: string;
  }[]>([{
    title: '',
    content: ''
  }]);
  const [showKbImport, setShowKbImport] = useState(false);
  const kbItems = useStore(s => s.knowledgeItems);
  const totalFinancialChars = financialBlocks.reduce((sum, b) => sum + b.content.trim().length, 0);
  const [financialResult, setFinancialResult] = useState<FinancialAnalysisResult | null>(account.marketIntel?.financialAnalysis ?? null);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);

  // Meeting prep state
  const [meetingResult, setMeetingResult] = useState<MeetingPrepResult | null>(account.marketIntel?.meetingPrep ?? null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [meetingInput, setMeetingInput] = useState<MeetingPrepInput>({
    meetingTitle: '',
    meetingDate: '',
    meetingType: 'discovery' as MeetingType,
    agenda: '',
    topics: [],
    attendeeContactIds: [],
    externalAttendees: [],
    ourTeam: '',
    meetingObjective: '',
    specialConcerns: ''
  });
  const [topicInput, setTopicInput] = useState('');
  const [externalAttendeeInput, setExternalAttendeeInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showTavilySearch, setShowTavilySearch] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const {
    addMeetingPrep,
    getMeetingPreps
  } = useStore();
  const meetingHistory = getMeetingPreps(account.id);
  async function handleNewsSearch() {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const res = await fetch("/api/news-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyName: account.name,
          industry: account.industry,
          dealContext: [account.dealStage ? `${locale === "en" ? "Deal stage" : "交易阶段"}: ${account.dealStage}` : null, accountOpportunities.length > 0 ? `${locale === "en" ? "Related opportunities" : "相关商机"}: ${accountOpportunities.map(o => `${o.name}${o.value ? `(${o.currency || ''}${o.value})` : ''}`).join(locale === "en" ? ', ' : '、')}` : null].filter(Boolean).join(locale === "en" ? '; ' : '；') || undefined,
          knowledgeContext: kbItems.filter(k => k.summary || k.content).slice(0, 10).map(k => `[${k.title}]${k.tags?.length ? ' #' + k.tags.join(' #') : ''} ${k.summary || k.content?.slice(0, 300) || ''}`).join("\n") || undefined,
          searchFirst: true,
          outputLocale: locale
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as {
          error?: string;
        }).error ?? `请求失败 (${res.status})`);
      }
      const result: NewsAnalysisResult = await res.json();
      const cached = {
        ...result,
        generatedAt: new Date().toISOString()
      };
      setNewsResult(cached);
      updateAccount(account.id, {
        marketIntel: {
          ...account.marketIntel,
          newsAnalysis: cached
        }
      });
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setNewsLoading(false);
    }
  }
  async function handleFinancialAnalysis() {
    const mergedData = financialBlocks.filter(b => b.content.trim()).map(b => b.title ? `=== ${b.title} ===\n${b.content}` : b.content).join('\n\n');
    if (mergedData.trim().length < 20) return;
    setFinancialLoading(true);
    setFinancialError(null);
    try {
      const res = await fetch("/api/financial-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyName: account.name,
          industry: account.industry,
          financialData: mergedData
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as {
          error?: string;
        }).error ?? `请求失败 (${res.status})`);
      }
      const result: FinancialAnalysisResult = await res.json();
      const cached = {
        ...result,
        generatedAt: new Date().toISOString()
      };
      setFinancialResult(cached);
      updateAccount(account.id, {
        marketIntel: {
          ...account.marketIntel,
          financialAnalysis: cached
        }
      });
    } catch (err) {
      setFinancialError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setFinancialLoading(false);
    }
  }
  async function handleMeetingPrep() {
    setMeetingLoading(true);
    setMeetingError(null);
    try {
      // Build attendees from selected contacts + external
      const selectedContacts = contacts.filter(c => meetingInput.attendeeContactIds.includes(c.id));
      const attendees = [...selectedContacts.map(c => ({
        name: c.name,
        title: c.title,
        role: c.role,
        hasProfile: !!c.contactProfile,
        profileSummary: c.contactProfile ? `决策风格:${c.contactProfile.decisionStyle.type} 触发:${c.contactProfile.positiveTriggers.slice(0, 2).join(',')} 地雷:${c.contactProfile.landmines.slice(0, 2).join(',')}` : undefined
      })), ...meetingInput.externalAttendees.map(name => ({
        name,
        hasProfile: false
      }))];
      const res = await fetch("/api/meeting-prep", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          accountId: account.id,
          meetingTitle: meetingInput.meetingTitle,
          meetingDate: meetingInput.meetingDate,
          meetingType: meetingInput.meetingType,
          agenda: meetingInput.agenda,
          topics: meetingInput.topics,
          ourTeam: meetingInput.ourTeam,
          meetingObjective: meetingInput.meetingObjective,
          specialConcerns: meetingInput.specialConcerns,
          attendees,
          account: {
            name: account.name,
            industry: account.industry,
            dealStage: account.dealStage,
            dealValue: account.dealValue,
            dealHealth: account.dealHealth
          },
          contacts: contacts.map(c => ({
            name: c.name,
            title: c.title,
            role: c.role,
            decisionStyle: c.decisionStyle,
            riskAppetite: c.riskAppetite,
            communicationNotes: c.communicationNotes,
            landmines: c.landmines
          })),
          recentIntel: accountIntel.slice(0, 5).map(i => i.content),
          recentDecodes: accountDecodes.slice(0, 5).map(d => ({
            emailSnippet: d.emailText.slice(0, 200),
            sentiment: d?.decode?.threadAnalysis?.sentimentTrend,
            keySignal: d?.decode?.threadAnalysis?.keySignal
          })),
          newsAnalysis: newsResult ? JSON.stringify(newsResult) : undefined,
          financialAnalysis: financialResult ? JSON.stringify(financialResult) : undefined,
          contactProfiles: selectedContacts.filter(c => c.contactProfile).map(c => ({
            name: c.name,
            summary: `决策:${c.contactProfile!.decisionStyle.type} 正面触发:${c.contactProfile!.positiveTriggers.join(',')} 地雷:${c.contactProfile!.landmines.join(',')}`
          })),
          knowledgeBase: kbItems.length > 0 ? kbItems.slice(0, 3).map(k => `[${k.title}] ${k.content.slice(0, 200)}`).join('\n') : undefined
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as {
          error?: string;
        }).error ?? `请求失败 (${res.status})`);
      }
      const result = (await res.json()) as MeetingPrepResult;
      const cached = {
        ...result,
        generatedAt: new Date().toISOString()
      };
      setMeetingResult(cached);
      updateAccount(account.id, {
        marketIntel: {
          ...account.marketIntel,
          meetingPrep: cached
        }
      });
      // Save to history
      addMeetingPrep(account.id, meetingInput, cached);
    } catch (err) {
      setMeetingError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setMeetingLoading(false);
    }
  }
  const TREND_ICONS: Record<string, string> = {
    up: "📈",
    down: "📉",
    stable: "➡️"
  };
  const FREQ_STYLES: Record<string, string> = {
    high: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
    medium: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
    low: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
  };
  function buildMeetingPrepText(): string {
    if (!meetingResult) return "";
    const lines: string[] = [];
    const ms = meetingResult.meetingSummary;
    if (ms) {
      lines.push(`会议准备简报 — ${ms.title || account.name}`);
      if (ms.date) lines.push(`日期: ${ms.date}`);
      if (ms.type) lines.push(`类型: ${ms.type}`);
      if (ms.ourTeam) lines.push(`我方团队: ${ms.ourTeam}`);
    } else {
      lines.push(`会议准备简报 — ${account.name}`);
    }
    lines.push(`成功概率: ${meetingResult.winProbability}%`);
    lines.push(`原因: ${meetingResult.winProbabilityReasoning}`);
    lines.push("");
    lines.push("客户最近动态:");
    lines.push(meetingResult.recentDynamics);
    lines.push("");
    if (meetingResult.contactAnalysis?.length > 0) {
      lines.push("参会人员分析:");
      meetingResult.contactAnalysis.forEach(ca => {
        lines.push(`  ${ca.name}${ca.title ? ` (${ca.title})` : ''}`);
        lines.push(`    态度预判: ${ca.attitudePrediction}`);
        ca.communicationTips.forEach(t => lines.push(`    - ${t}`));
        if (ca.warnings.length > 0) lines.push(`    ⚠️ ${ca.warnings.join('; ')}`);
      });
      lines.push("");
    }
    if (meetingResult.agendaPrep?.length > 0) {
      lines.push("议程准备:");
      meetingResult.agendaPrep.forEach((ap, i) => {
        lines.push(`  ${i + 1}. ${ap.topic}`);
        lines.push(`     关键信息: ${ap.keyInfo}`);
        lines.push(`     推荐说法: ${ap.recommendedApproach}`);
        lines.push(`     预期反应: ${ap.expectedReaction}`);
        lines.push(`     应对策略: ${ap.counterStrategy}`);
      });
      lines.push("");
    }
    if (meetingResult.suggestedScripts) {
      lines.push("推荐话术:");
      lines.push(`  开场白: ${meetingResult.suggestedScripts.opening}`);
      meetingResult.suggestedScripts.keyTransitions?.forEach(t => lines.push(`  切入: ${t}`));
      lines.push(`  收尾: ${meetingResult.suggestedScripts.closing}`);
      lines.push("");
    }
    lines.push("讨论话题:");
    meetingResult.talkingPoints.forEach((tp, i) => {
      lines.push(`  ${i + 1}. ${tp.topic} — 切入点: ${tp.angle}`);
    });
    lines.push("");
    lines.push("应该问的问题:");
    meetingResult.questionsToAsk.forEach((q, i) => {
      const qt = typeof q === 'string' ? q : q.question;
      lines.push(`  ${i + 1}. ${qt}`);
    });
    lines.push("");
    lines.push("避免的话题:");
    meetingResult.topicsToAvoid.forEach(t => lines.push(`  - ${t}`));
    lines.push("");
    lines.push("行动清单:");
    const phases = {
      before: "会前",
      during: "会中",
      after: "会后"
    };
    (["before", "during", "after"] as const).forEach(phase => {
      const items = meetingResult.actionItems.filter(a => a.phase === phase);
      if (items.length > 0) {
        lines.push(`  [${phases[phase]}]`);
        items.forEach(a => lines.push(`    - ${a.action}`));
      }
    });
    if (meetingResult.suggestedMaterials?.length > 0) {
      lines.push("");
      lines.push("建议准备材料:");
      meetingResult.suggestedMaterials.forEach(m => lines.push(`  - ${m}`));
    }
    return lines.join("\n");
  }
  return <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-sidebar p-0.5">
        <button onClick={() => setActiveSection("news")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeSection === "news" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
          <Search className="h-3 w-3" />{tx("公司新闻")}</button>
        <button onClick={() => setActiveSection("financial")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeSection === "financial" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
          <BarChart3 className="h-3 w-3" />{tx("财报分析")}</button>
        <button onClick={() => setActiveSection("meeting")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeSection === "meeting" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>
          <Briefcase className="h-3 w-3" />{tx("会议准备")}</button>
      </div>

      {/* ─── News Section ──────────────────────────────────────── */}
      {activeSection === "news" && <div className="space-y-4">
          <div className="rounded-xl border border-border bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{tx("公司新闻搜索")}</h3>
                <p className="mt-0.5 text-xs text-muted">{tx("AI 将分析「")}{account.name}{tx("」的最新动态和市场情报")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {newsResult && <button onClick={handleNewsSearch} disabled={newsLoading} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground disabled:opacity-40">
                    <RefreshCw className={`h-3 w-3 ${newsLoading ? "animate-spin" : ""}`} />{tx("刷新")}</button>}
                {!newsResult && <button onClick={handleNewsSearch} disabled={newsLoading} className="flex items-center gap-1.5 rounded-lg bg-[#C41E3A] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#A01830] disabled:opacity-40 disabled:pointer-events-none">
                    {newsLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{tx("分析中...")}</> : <><Search className="h-3.5 w-3.5" />{tx("搜索分析")}</>}
                  </button>}
              </div>
            </div>
            {newsError && <p className="mt-2 text-xs text-danger">{newsError}</p>}
          </div>

          {/* Loading skeleton */}
          {newsLoading && !newsResult && <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="rounded-xl border border-border bg-sidebar p-4">
                  <div className="skeleton h-4 w-48 rounded mb-3" />
                  <div className="skeleton h-3 w-full rounded mb-2" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>)}
            </div>}

          {newsResult && <div className="space-y-3">
              {/* News Items as Cards */}
              {newsResult.news && newsResult.news.length > 0 && <div className="space-y-2">
                  {newsResult.news.map((item, i) => <div key={i} className="rounded-xl border border-border bg-sidebar p-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-accent">{item.date}</span>
                      </div>
                      <h5 className="text-sm font-semibold text-foreground">{item.title}</h5>
                      <p className="mt-1 text-xs leading-relaxed text-secondary">{item.summary}</p>
                    </div>)}
                </div>}

              {/* Deal Relevance */}
              <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">{tx("交易关联分析")}</h4>
                <p className="text-sm leading-relaxed text-foreground">{newsResult.dealRelevance}</p>
              </div>

              {/* Talking Points */}
              <div className="rounded-xl border border-border bg-sidebar p-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  <MessageSquare className="h-3 w-3" />{tx("话题建议")}</h4>
                <ul className="space-y-1.5">
                  {newsResult.talkingPoints.map((tp, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                      {tp}
                    </li>)}
                </ul>
              </div>

              {/* Opportunities & Risks */}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-positive/15 bg-positive/[0.03] p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">{tx("机会信号")}</h4>
                  {newsResult.opportunities.length > 0 ? <ul className="space-y-1">
                      {newsResult.opportunities.map((o, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-positive" />{typeof o === 'string' ? o : o.text}
                        </li>)}
                    </ul> : <p className="text-xs text-muted">{tx("暂无数据")}</p>}
                </div>
                <div className="rounded-xl border border-danger/15 bg-danger/[0.03] p-4">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-danger">
                    <AlertTriangle className="h-3 w-3" />{tx("风险信号")}</h4>
                  {newsResult.risks.length > 0 ? <ul className="space-y-1">
                      {newsResult.risks.map((r, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger" />{typeof r === 'string' ? r : r.text}
                        </li>)}
                    </ul> : <p className="text-xs text-muted">{tx("暂无数据")}</p>}
                </div>
              </div>

              {/* Save as intel + timestamp */}
              <div className="flex items-center justify-between pt-2">
                {savedNewsAsIntel ? <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" />{tx("已保存为情报")}</span> : <button onClick={() => {
            const summary = newsResult.dealRelevance || newsResult.news?.map(n => n.title).join('; ') || '';
            addIntel({
              accountName: account.name,
              source: 'news',
              content: summary,
              credibility: 'high',
              urgency: 'medium',
              type: 'news',
              analysis: {
                crossValidation: newsResult.news?.map(n => n.title) || [],
                implications: newsResult.dealRelevance || '',
                suggestedActions: newsResult.talkingPoints || [],
                riskAssessment: {
                  level: (newsResult.risks?.length > 0 ? 'medium' : 'low') as 'low' | 'medium' | 'high' | 'critical',
                  description: newsResult.risks?.length > 0 ? newsResult.risks.map(r => typeof r === 'string' ? r : r.text).join('; ') : '无风险信号'
                }
              }
            });
            setSavedNewsAsIntel(true);
          }} className="flex items-center gap-1 rounded-lg border border-accent/30 px-2.5 py-1 text-xs text-accent hover:bg-accent/5 transition-colors">
                    <Save className="h-3 w-3" />{tx("保存为情报")}</button>}
                {newsResult.generatedAt && <p className="text-xs text-muted">{tx("生成于")}{new Date(newsResult.generatedAt).toLocaleString("zh-CN")}
                  </p>}
              </div>
            </div>}

          {/* ─── Tavily News Search ────────────────────────── */}
          <div className="rounded-xl border border-border bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{tx("搜索行业新闻")}</h3>
                <p className="mt-0.5 text-xs text-muted">{tx("搜索「")}{account.name}{tx("」相关的实时行业新闻，结果可直接保存为情报")}</p>
              </div>
              <button onClick={() => setShowTavilySearch(v => !v)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground">
                <Globe className="h-3.5 w-3.5" />
                {showTavilySearch ? "收起" : "展开搜索"}
              </button>
            </div>
            {showTavilySearch && <div className="mt-3">
                <NewsSearch defaultQuery={[account.name, account.industry].filter(Boolean).join(" ")} accountName={account.name} onSaveAsIntel={item => {
            addIntel({
              accountName: account.name,
              source: "news",
              content: `${item.title}\n\n${item.content}\n\n来源: ${item.url}`,
              credibility: "medium",
              urgency: "medium",
              type: "news"
            });
          }} />
              </div>}
          </div>

          {!newsResult && !newsLoading && <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
                <Globe className="h-5 w-5 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground">{tx("搜索公司新闻")}</p>
              <p className="mt-1 max-w-[280px] text-xs text-muted">{tx("点击「搜索分析」，AI 将分析「")}{account.name}{tx("」的最新动态，找出对你的交易有价值的情报。")}</p>
            </div>}
        </div>}

      {/* ─── Financial Section ─────────────────────────────────── */}
      {activeSection === "financial" && <div className="space-y-4">
          <div className="rounded-xl border border-border bg-sidebar p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{tx("财报分析")}</h3>
                <p className="mt-0.5 text-xs text-muted">{tx("添加多份财报/报告，AI 将综合分析")}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowKbImport(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground">
                  <BookOpen className="h-3.5 w-3.5" />{tx("从知识库导入")}</button>
                <button onClick={() => setFinancialBlocks([...financialBlocks, {
              title: '',
              content: ''
            }])} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />{tx("添加文本块")}</button>
              </div>
            </div>

            {financialBlocks.map((block, idx) => <div key={idx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="text" value={block.title} onChange={e => {
              const updated = [...financialBlocks];
              updated[idx] = {
                ...updated[idx],
                title: e.target.value
              };
              setFinancialBlocks(updated);
            }} placeholder={tx("标题（例如：2025 Q3 财报）")} className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none" />
                  {financialBlocks.length > 1 && <button onClick={() => setFinancialBlocks(financialBlocks.filter((_, i) => i !== idx))} className="rounded p-1 text-muted hover:text-danger transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>}
                </div>
                <textarea value={block.content} onChange={e => {
            const updated = [...financialBlocks];
            updated[idx] = {
              ...updated[idx],
              content: e.target.value
            };
            setFinancialBlocks(updated);
          }} placeholder={tx("粘贴财报内容...")} className="min-h-[120px] w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none input-glow" />
              </div>)}

            <button onClick={handleFinancialAnalysis} disabled={totalFinancialChars < 20 || financialLoading} className="flex items-center gap-1.5 rounded-lg bg-[#C41E3A] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#A01830] disabled:opacity-40 disabled:pointer-events-none">
              {financialLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{tx("分析中...")}</> : <><BarChart3 className="h-3.5 w-3.5" />{tx("分析财报")}</>}
            </button>
            {financialError && <p className="text-xs text-danger">{financialError}</p>}
          </div>

          {/* Knowledge Import Modal */}
          {showKbImport && <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setShowKbImport(false)}>
              <div className="mx-3 sm:mx-0 w-full sm:w-[480px] max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card p-4" style={{
          boxShadow: 'var(--shadow-floating)'
        }} onClick={e => e.stopPropagation()}>
                <h3 className="mb-3 text-sm font-semibold text-foreground">{tx("从知识库导入")}</h3>
                {kbItems.length === 0 ? <p className="py-8 text-center text-xs text-muted">{tx("知识库为空，请先在知识库页面添加内容")}</p> : <div className="space-y-2">
                    {kbItems.map(item => <button key={item.id} onClick={() => {
              setFinancialBlocks([...financialBlocks, {
                title: item.title,
                content: item.content
              }]);
              setShowKbImport(false);
            }} className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-sidebar">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs text-muted line-clamp-2">{item.content}</p>
                      </button>)}
                  </div>}
              </div>
            </div>}

          {financialResult && <div className="space-y-3">
              {/* Overall Assessment */}
              <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  <Target className="h-3.5 w-3.5" />{tx("总体评估")}</h4>
                <p className="text-sm leading-relaxed text-foreground">{financialResult.overallAssessment}</p>
              </div>

              {/* Key Metrics - bigger cards */}
              <div className="rounded-xl border border-border bg-sidebar p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{tx("关键财务指标")}</h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {financialResult.keyMetrics.map((m, i) => <div key={i} className="rounded-xl border border-border bg-card card-elevated p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-muted">{m.name}</span>
                        <span className="text-lg">{TREND_ICONS[m.trend] ?? "➡️"}</span>
                      </div>
                      <p className="font-mono text-2xl font-bold text-foreground">{m.value}</p>
                      <p className="mt-1 text-xs text-muted">{m.note}</p>
                    </div>)}
                </div>
              </div>

              {/* Strategic Keywords - colored tags */}
              <div className="rounded-xl border border-border bg-sidebar p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{tx("战略关键词频率")}</h4>
                <div className="flex flex-wrap gap-2">
                  {financialResult.strategicKeywords.map((kw, i) => <div key={i} className={`rounded-lg border px-3 py-2 ${FREQ_STYLES[kw.frequency] ?? FREQ_STYLES.medium}`}>
                      <p className="text-sm font-semibold">{kw.keyword}</p>
                      <p className="text-xs opacity-80">{kw.significance}</p>
                    </div>)}
                </div>
              </div>

              {/* Digital Signals & Risk Signals */}
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-positive/15 bg-positive/[0.03] p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">{tx("数字化/技术信号")}</h4>
                  <ul className="space-y-1.5">
                    {financialResult.digitalSignals.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-positive" />{s}
                      </li>)}
                  </ul>
                </div>
                <div className="rounded-xl border border-danger/15 bg-danger/[0.03] p-4">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-danger">
                    <AlertTriangle className="h-3 w-3" />{tx("风险信号")}</h4>
                  <ul className="space-y-1.5">
                    {financialResult.riskSignals.map((r, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-danger" />{r}
                      </li>)}
                  </ul>
                </div>
              </div>

              {/* Sales Talking Points - blockquote style */}
              <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  <MessageSquare className="h-3 w-3" />{tx("话术建议")}</h4>
                <div className="space-y-2">
                  {financialResult.salesTalkingPoints.map((tp, i) => <div key={i} className="flex items-start gap-3 rounded-lg border-l-2 border-accent/30 bg-card/50 px-3 py-2">
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                      <p className="text-sm text-foreground">{tp}</p>
                    </div>)}
                </div>
              </div>

              {/* Save as intel + timestamp */}
              <div className="flex items-center justify-between pt-2">
                {savedFinancialAsIntel ? <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" />{tx("已保存为情报")}</span> : <button onClick={() => {
            addIntel({
              accountName: account.name,
              source: 'news',
              content: financialResult.overallAssessment || '',
              credibility: 'high',
              urgency: 'medium',
              type: 'earnings',
              analysis: {
                crossValidation: financialResult.keyMetrics?.map(m => `${m.name}: ${m.value}`) || [],
                implications: financialResult.overallAssessment || '',
                suggestedActions: financialResult.salesTalkingPoints || [],
                riskAssessment: {
                  level: (financialResult.riskSignals?.length > 0 ? 'medium' : 'low') as 'low' | 'medium' | 'high' | 'critical',
                  description: financialResult.riskSignals?.length > 0 ? financialResult.riskSignals.join('; ') : '无风险信号'
                }
              }
            });
            setSavedFinancialAsIntel(true);
          }} className="flex items-center gap-1 rounded-lg border border-accent/30 px-2.5 py-1 text-xs text-accent hover:bg-accent/5 transition-colors">
                    <Save className="h-3 w-3" />{tx("保存为情报")}</button>}
                {financialResult.generatedAt && <p className="text-xs text-muted">{tx("生成于")}{new Date(financialResult.generatedAt).toLocaleString("zh-CN")}
                  </p>}
              </div>
            </div>}

          {!financialResult && !financialLoading && totalFinancialChars === 0 && <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
                <FileText className="h-5 w-5 text-muted" />
              </div>
              <p className="text-sm font-medium text-foreground">{tx("粘贴财报数据")}</p>
              <p className="mt-1 max-w-[280px] text-xs text-muted">{tx("粘贴财报内容或关键数据，AI 将提取关键指标、战略信号和话术建议。")}</p>
            </div>}
        </div>}

      {/* ─── Meeting Prep Section ──────────────────────────────── */}
      {activeSection === "meeting" && <div className="space-y-4">
          {/* History toggle */}
          {meetingHistory.length > 0 && <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors">
              <History className="h-3.5 w-3.5" />{tx("历史记录 (")}{meetingHistory.length})
              {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>}

          {/* History list */}
          {showHistory && meetingHistory.length > 0 && <div className="rounded-xl border border-border bg-sidebar p-4 space-y-2 max-h-[400px] overflow-y-auto">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{tx("历史会议简报")}</h4>
              {meetingHistory.map(record => <button key={record.id} onClick={() => {
          setMeetingResult(record.result);
          setMeetingInput(record.input);
          setShowHistory(false);
        }} className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-background">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{record.input.meetingTitle || '未命名会议'}</p>
                    <span className="text-xs text-muted">{new Date(record.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-secondary">
                    <span>{MEETING_TYPE_LABELS[record.input.meetingType as MeetingType] || record.input.meetingType}</span>
                    {record.result.winProbability != null && <span className={`font-medium ${record.result.winProbability >= 60 ? 'text-positive' : record.result.winProbability >= 40 ? 'text-warning' : 'text-danger'}`}>{record.result.winProbability}%</span>}
                  </div>
                </button>)}
            </div>}

          {/* ─── Meeting Input Form ─────────────────────────────── */}
          <div className="rounded-xl border border-border bg-sidebar p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{tx("会议准备工作台")}</h3>

            {/* Step 1: Required fields */}
            <div>
              <label className="form-label">{tx("会议类型")}</label>
              <select value={meetingInput.meetingType} onChange={e => setMeetingInput({
            ...meetingInput,
            meetingType: e.target.value as MeetingType
          })} className="form-input">
                {Object.entries(MEETING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Attendees from contacts */}
            <div>
              <label className="form-label">{tx("参会联系人（从客户联系人中选择）")}</label>
              {contacts.length > 0 ? <div className="space-y-1.5 rounded-lg border border-border bg-card">
                  <div className="px-2 pt-2">
                    <input type="text" placeholder={tx("搜索联系人...")} value={contactSearchQuery} onChange={e => setContactSearchQuery(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted/40 focus:border-accent/40 focus:outline-none" />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto p-2 pt-1 space-y-1.5">
                  {contacts.filter(c => {
                const q = contactSearchQuery.toLowerCase();
                if (!q) return true;
                return c.name.toLowerCase().includes(q) || (c.title ?? '').toLowerCase().includes(q) || (c.role ?? '').toLowerCase().includes(q);
              }).map(c => {
                const selected = meetingInput.attendeeContactIds.includes(c.id);
                return <label key={c.id} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${selected ? 'bg-accent/5' : 'hover:bg-background'}`}>
                        <input type="checkbox" checked={selected} onChange={() => {
                    const ids = selected ? meetingInput.attendeeContactIds.filter(id => id !== c.id) : [...meetingInput.attendeeContactIds, c.id];
                    setMeetingInput({
                      ...meetingInput,
                      attendeeContactIds: ids
                    });
                  }} className="rounded border-border text-accent focus:ring-accent/20" />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground">{c.name}</span>
                          {c.title && <span className="text-xs text-muted">{c.title}</span>}
                          {c.role && c.role !== 'unknown' && <span className={`inline-flex rounded-full border px-1.5 py-0 text-xs font-medium ${ROLE_CONFIG[c.role]?.style || ''}`}>
                              {ROLE_CONFIG[c.role]?.label || c.role}
                            </span>}
                          {c.contactProfile && <span className="rounded border border-positive/20 bg-positive/5 px-1.5 py-0 text-xs font-medium text-positive">{tx("有画像")}</span>}
                        </div>
                      </label>;
              })}
                  </div>
                </div> : <p className="text-xs text-muted py-2">{tx("暂无联系人，可在联系人 Tab 中添加")}</p>}
            </div>

            <div>
              <label className="form-label">{tx("会议目标")}</label>
              <textarea value={meetingInput.meetingObjective} onChange={e => setMeetingInput({
            ...meetingInput,
            meetingObjective: e.target.value
          })} placeholder={tx("确认 Q3 部署时间线，获取 VP 反馈")} rows={2} className="form-input resize-none" />
            </div>

            {/* Toggle for Step 2 */}
            <button type="button" onClick={() => setShowMoreOptions(!showMoreOptions)} className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors">
              {showMoreOptions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showMoreOptions ? '收起更多选项' : '展开更多选项'}
            </button>

            {/* Step 2: Optional fields */}
            {showMoreOptions && <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="form-label">{tx("会议标题")}</label>
                  <input type="text" value={meetingInput.meetingTitle} onChange={e => setMeetingInput({
                ...meetingInput,
                meetingTitle: e.target.value
              })} placeholder={tx("例如：Q3 需求沟通会")} className="form-input" />
                </div>
                <div>
                  <label className="form-label">{tx("会议日期")}</label>
                  <input type="datetime-local" value={meetingInput.meetingDate} onChange={e => setMeetingInput({
                ...meetingInput,
                meetingDate: e.target.value
              })} className="form-input" />
                </div>
              </div>

              {/* Agenda */}
              <div>
                <label className="form-label">{tx("会议议程 / Agenda")}</label>
                <textarea value={meetingInput.agenda} onChange={e => setMeetingInput({
              ...meetingInput,
              agenda: e.target.value
            })} placeholder={"1. 项目进度回顾\n2. Q3 部署方案讨论\n3. 定价和合同条款\n4. 下一步行动"} rows={3} className="form-input resize-none" />
              </div>

              {/* Topics (tag input) */}
              <div>
                <label className="form-label">{tx("讨论话题")}</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {meetingInput.topics.map((t, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-2.5 py-0.5 text-xs font-medium text-accent">
                      {t}
                      <button onClick={() => setMeetingInput({
                  ...meetingInput,
                  topics: meetingInput.topics.filter((_, j) => j !== i)
                })} className="hover:text-danger">
                        <X className="h-3 w-3" />
                      </button>
                    </span>)}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={topicInput} onChange={e => setTopicInput(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && topicInput.trim()) {
                  e.preventDefault();
                  setMeetingInput({
                    ...meetingInput,
                    topics: [...meetingInput.topics, topicInput.trim()]
                  });
                  setTopicInput('');
                }
              }} placeholder={tx("输入话题后回车添加")} className="form-input flex-1" />
                  <button onClick={() => {
                if (topicInput.trim()) {
                  setMeetingInput({
                    ...meetingInput,
                    topics: [...meetingInput.topics, topicInput.trim()]
                  });
                  setTopicInput('');
                }
              }} className="flex-shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-card transition-colors">
                    <Tag className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* External attendees */}
              <div>
                <label className="form-label">{tx("外部参会人（未录入系统的）")}</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {meetingInput.externalAttendees.map((name, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {name}
                      <button onClick={() => setMeetingInput({
                  ...meetingInput,
                  externalAttendees: meetingInput.externalAttendees.filter((_, j) => j !== i)
                })} className="hover:text-danger">
                        <X className="h-3 w-3" />
                      </button>
                    </span>)}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={externalAttendeeInput} onChange={e => setExternalAttendeeInput(e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter' && externalAttendeeInput.trim()) {
                  e.preventDefault();
                  setMeetingInput({
                    ...meetingInput,
                    externalAttendees: [...meetingInput.externalAttendees, externalAttendeeInput.trim()]
                  });
                  setExternalAttendeeInput('');
                }
              }} placeholder={tx("姓名回车添加")} className="form-input flex-1" />
                </div>
              </div>

              <div>
                <label className="form-label">{tx("我方参会人员")}</label>
                <input type="text" value={meetingInput.ourTeam} onChange={e => setMeetingInput({
              ...meetingInput,
              ourTeam: e.target.value
            })} placeholder={tx("张三（技术顾问）, 李四（区域经理）")} className="form-input" />
              </div>

              {/* Special Concerns */}
              <div>
                <label className="form-label">{tx("特别关注事项")}</label>
                <textarea value={meetingInput.specialConcerns} onChange={e => setMeetingInput({
              ...meetingInput,
              specialConcerns: e.target.value
            })} placeholder={tx("例如：上次会议 VP 提到了竞品 X 的报价更低")} rows={2} className="form-input resize-none" />
              </div>
            </div>}

            {/* Context preview (collapsible) */}
            <div className="rounded-lg border border-border bg-card p-3">
              <button onClick={() => setShowContext(!showContext)} className="flex w-full items-center justify-between text-xs font-medium text-muted">
                <span>{tx("AI 将参考以下信息")}</span>
                {showContext ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showContext && <div className="mt-2 space-y-1 text-xs">
                  <p className={account.name ? "text-positive" : "text-muted"}>
                    {account.name ? "✅" : "⬜"}{tx("客户基本信息（")}{account.industry || '未知行业'} / {account.dealStage || '无阶段'} / {account.dealValue ? `$${account.dealValue.toLocaleString()}` : '无金额'}）
                  </p>
                  <p className={meetingInput.attendeeContactIds.length > 0 ? "text-positive" : "text-muted"}>
                    {meetingInput.attendeeContactIds.length > 0 ? "✅" : "⬜"}{tx("参会联系人画像（")}{contacts.filter(c => meetingInput.attendeeContactIds.includes(c.id) && c.contactProfile).length}{tx("人有画像）")}</p>
                  <p className={accountIntel.length > 0 ? "text-positive" : "text-muted"}>
                    {accountIntel.length > 0 ? "✅" : "⬜"}{tx("相关情报（")}{accountIntel.length}{tx("条）")}</p>
                  <p className={accountDecodes.length > 0 ? "text-positive" : "text-muted"}>
                    {accountDecodes.length > 0 ? "✅" : "⬜"}{tx("邮件解读历史（")}{accountDecodes.length}{tx("条）")}</p>
                  <p className={newsResult ? "text-positive" : "text-muted"}>
                    {newsResult ? "✅" : "⬜"}{tx("新闻分析")}{newsResult ? '' : '（未生成）'}
                  </p>
                  <p className={financialResult ? "text-positive" : "text-muted"}>
                    {financialResult ? "✅" : "⬜"}{tx("财报分析")}{financialResult ? '' : '（未生成）'}
                  </p>
                  <p className={kbItems.length > 0 ? "text-positive" : "text-muted"}>
                    {kbItems.length > 0 ? "✅" : "⬜"}{tx("知识库（")}{kbItems.length}{tx("份资料）")}</p>
                  <p className={account.meddicc ? "text-positive" : "text-muted"}>
                    {account.meddicc ? "✅" : "⬜"}{tx("MEDDICC 评估")}{account.meddicc ? '' : '（未配置）'}
                  </p>
                </div>}
            </div>

            {/* Generate button */}
            <button onClick={handleMeetingPrep} disabled={meetingLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C41E3A] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A01830] disabled:opacity-40 disabled:pointer-events-none shadow-sm">
              {meetingLoading ? <><Loader2 className="h-4 w-4 animate-spin" />{tx("生成中...")}</> : <>{tx("🎯 生成会议准备简报")}</>}
            </button>
            {meetingError && <p className="text-xs text-danger">{meetingError}</p>}
          </div>

          {/* Loading skeleton */}
          {meetingLoading && !meetingResult && <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="rounded-xl border border-border bg-sidebar p-4">
                  <div className="skeleton h-4 w-32 rounded mb-3" />
                  <div className="skeleton h-3 w-full rounded mb-2" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>)}
            </div>}

          {/* ─── Meeting Result Display ───────────────────────────── */}
          {meetingResult && <div className="space-y-3">
              {/* 1. Meeting Summary */}
              {meetingResult.meetingSummary && <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">{tx("📋 会议概要")}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted">{tx("标题：")}</span><span className="font-medium text-foreground">{meetingResult.meetingSummary.title}</span></div>
                    <div><span className="text-muted">{tx("日期：")}</span><span className="font-medium text-foreground">{meetingResult.meetingSummary.date}</span></div>
                    <div><span className="text-muted">{tx("类型：")}</span><span className="font-medium text-foreground">{meetingResult.meetingSummary.type}</span></div>
                    <div><span className="text-muted">{tx("我方：")}</span><span className="font-medium text-foreground">{meetingResult.meetingSummary.ourTeam}</span></div>
                  </div>
                </div>}

              {/* 2. Win Probability */}
              <div className={`rounded-xl border p-6 text-center ${meetingResult.winProbability >= 60 ? "border-positive/20 bg-positive/[0.05]" : meetingResult.winProbability >= 40 ? "border-warning/20 bg-warning/[0.05]" : "border-danger/20 bg-danger/[0.05]"}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">{tx("📊 成功概率评估")}</p>
                <div className="relative mx-auto h-32 w-32">
                  <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
                    <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" strokeLinecap="round" className={meetingResult.winProbability >= 60 ? "text-positive" : meetingResult.winProbability >= 40 ? "text-warning" : "text-danger"} stroke="currentColor" strokeDasharray={`${meetingResult.winProbability * 3.267} 326.7`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`font-mono text-3xl font-bold ${meetingResult.winProbability >= 60 ? "text-positive" : meetingResult.winProbability >= 40 ? "text-warning" : "text-danger"}`}>
                      {meetingResult.winProbability}
                    </span>
                    <span className="text-xs text-muted">%</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted max-w-md mx-auto">{meetingResult.winProbabilityReasoning}</p>
              </div>

              {/* Recent Dynamics */}
              <div className="rounded-xl border border-border bg-sidebar p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{tx("客户最近动态")}</h4>
                <p className="text-sm leading-relaxed text-foreground">{meetingResult.recentDynamics}</p>
              </div>

              {/* 3. Contact Analysis */}
              {meetingResult.contactAnalysis?.length > 0 && <div className="rounded-xl border border-border bg-sidebar p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{tx("👥 参会人员分析")}</h4>
                  <div className="space-y-3">
                    {meetingResult.contactAnalysis.map((ca, i) => <div key={i} className="rounded-xl border border-border bg-card card-elevated p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                            {ca.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{ca.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted">
                              {ca.title && <span>{ca.title}</span>}
                              {ca.role && <span className="rounded bg-accent/10 px-1.5 py-0 text-accent">{ca.role}</span>}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-foreground mb-2"><span className="text-muted">{tx("态度预判：")}</span>{ca.attitudePrediction}</p>
                        {ca.communicationTips?.length > 0 && <div className="mb-2">
                            <p className="text-xs font-medium text-positive mb-1">{tx("沟通建议：")}</p>
                            <ul className="space-y-0.5">
                              {ca.communicationTips.map((tip, j) => <li key={j} className="flex items-start gap-1.5 text-xs text-foreground">
                                  <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-positive" />{tip}
                                </li>)}
                            </ul>
                          </div>}
                        {ca.warnings?.length > 0 && <div className="rounded-lg bg-danger/5 border border-danger/10 px-2.5 py-1.5">
                            <p className="text-xs font-medium text-danger mb-0.5">{tx("⚠️ 注意事项：")}</p>
                            {ca.warnings.map((w, j) => <p key={j} className="text-xs text-danger/80">{w}</p>)}
                          </div>}
                      </div>)}
                  </div>
                </div>}

              {/* 4. Agenda Prep */}
              {meetingResult.agendaPrep?.length > 0 && <div className="rounded-xl border border-border bg-sidebar p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">{tx("📝 议程准备")}</h4>
                  <div className="space-y-3">
                    {meetingResult.agendaPrep.map((ap, i) => <div key={i} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                          <p className="text-sm font-semibold text-foreground">{ap.topic}</p>
                        </div>
                        <div className="pl-7 space-y-1.5 text-xs">
                          <div><span className="font-medium text-muted">{tx("关键信息：")}</span><span className="text-foreground">{ap.keyInfo}</span></div>
                          <div className="rounded bg-positive/5 border border-positive/10 px-2 py-1">
                            <span className="font-medium text-positive">{tx("推荐说法：")}</span><span className="text-foreground">{ap.recommendedApproach}</span>
                          </div>
                          <div><span className="font-medium text-warning">{tx("预期反应：")}</span><span className="text-foreground">{ap.expectedReaction}</span></div>
                          <div><span className="font-medium text-accent">{tx("应对策略：")}</span><span className="text-foreground">{ap.counterStrategy}</span></div>
                        </div>
                      </div>)}
                  </div>
                </div>}

              {/* 5. Suggested Scripts */}
              {meetingResult.suggestedScripts && <div className="rounded-xl border border-border bg-sidebar p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">{tx("💬 推荐话术")}</h4>
                  <div className="space-y-2">
                    <div className="rounded-lg border-l-2 border-positive/40 bg-card px-3 py-2">
                      <p className="text-xs font-medium text-positive mb-0.5">{tx("开场白")}</p>
                      <p className="text-sm text-foreground">{meetingResult.suggestedScripts.opening}</p>
                    </div>
                    {meetingResult.suggestedScripts.keyTransitions?.map((t, i) => <div key={i} className="rounded-lg border-l-2 border-accent/40 bg-card px-3 py-2">
                        <p className="text-xs font-medium text-accent mb-0.5">{tx("切入点")}{i + 1}</p>
                        <p className="text-sm text-foreground">{t}</p>
                      </div>)}
                    <div className="rounded-lg border-l-2 border-warning/40 bg-card px-3 py-2">
                      <p className="text-xs font-medium text-warning mb-0.5">{tx("收尾 / 下一步")}</p>
                      <p className="text-sm text-foreground">{meetingResult.suggestedScripts.closing}</p>
                    </div>
                  </div>
                </div>}

              {/* Talking Points */}
              {meetingResult.talkingPoints?.length > 0 && <div className="rounded-xl border border-border bg-sidebar p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">{tx("💬 备用讨论话题")}</h4>
                  <div className="space-y-2">
                    {meetingResult.talkingPoints.map((tp, i) => <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{tp.topic}</p>
                          <p className="mt-0.5 text-xs text-accent">{tx("切入点:")}{tp.angle}</p>
                        </div>
                      </div>)}
                  </div>
                </div>}

              {/* 6. Questions - with priority */}
              <div className="rounded-xl border border-border bg-sidebar p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-positive">{tx("❓ 应该问的问题")}</h4>
                <ol className="space-y-1.5">
                  {meetingResult.questionsToAsk.map((q, i) => {
              const question = typeof q === 'string' ? q : q.question;
              const priority = typeof q === 'string' ? undefined : q.priority;
              const priorityStyles: Record<string, string> = {
                high: 'bg-danger/10 text-danger border-danger/20',
                medium: 'bg-warning/10 text-warning border-warning/20',
                low: 'bg-card text-muted border-border'
              };
              return <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-positive/15 text-xs font-bold text-positive">{i + 1}</span>
                        <span className="flex-1">{question}</span>
                        {priority && <span className={`flex-shrink-0 rounded-full border px-1.5 py-0 text-xs font-medium ${priorityStyles[priority] || ''}`}>
                            {priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'}
                          </span>}
                      </li>;
            })}
                </ol>
              </div>

              {/* 7. Topics to Avoid */}
              {meetingResult.topicsToAvoid?.length > 0 && <div className="rounded-xl border border-danger/20 bg-danger/[0.03] p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-danger">{tx("🚫 避免的话题")}</h4>
                  <div className="space-y-1">
                    {meetingResult.topicsToAvoid.map((t, i) => <div key={i} className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {t}
                      </div>)}
                  </div>
                </div>}

              {/* 8. Action Items */}
              <div className="rounded-xl border border-border bg-sidebar p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">{tx("✅ 行动清单")}</h4>
                {(["before", "during", "after"] as const).map(phase => {
            const phaseLabels = {
              before: "会前准备",
              during: "会中要点",
              after: "会后跟进"
            };
            const phaseColors = {
              before: "text-accent",
              during: "text-positive",
              after: "text-warning"
            };
            const phaseIcons = {
              before: "📋",
              during: "🎯",
              after: "📨"
            };
            const items = meetingResult.actionItems.filter(a => a.phase === phase);
            if (items.length === 0) return null;
            return <div key={phase} className="mb-3 last:mb-0">
                      <p className={`mb-1.5 text-xs font-semibold ${phaseColors[phase]}`}>{phaseIcons[phase]} {phaseLabels[phase]}</p>
                      <ul className="space-y-1">
                        {items.map((a, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground pl-2">
                            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-border bg-card text-xs font-medium text-muted">{i + 1}</span>
                            {a.action}
                          </li>)}
                      </ul>
                    </div>;
          })}
              </div>

              {/* 9. Suggested Materials */}
              {meetingResult.suggestedMaterials?.length > 0 && <div className="rounded-xl border border-border bg-sidebar p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{tx("📎 建议携带/准备的材料")}</h4>
                  <ul className="space-y-1">
                    {meetingResult.suggestedMaterials.map((m, i) => <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <Paperclip className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted" />
                        {m}
                      </li>)}
                  </ul>
                </div>}

              {/* Copy + Regenerate */}
              <div className="flex items-center justify-between">
                <CopyButton text={buildMeetingPrepText()} />
                <button onClick={handleMeetingPrep} disabled={meetingLoading} className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-card hover:text-foreground">
                  <RefreshCw className={`h-3.5 w-3.5 ${meetingLoading ? "animate-spin" : ""}`} />{tx("重新生成")}</button>
              </div>

              {meetingResult.generatedAt && <p className="text-xs text-muted text-right">{tx("生成于")}{new Date(meetingResult.generatedAt).toLocaleString("zh-CN")}
                </p>}
            </div>}
        </div>}
    </div>;
}