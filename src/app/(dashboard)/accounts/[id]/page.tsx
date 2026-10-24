"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FadeIn } from "@/components/ui/fade-in";
import {
  ArrowLeft,
  Building2,
  Users,
  Radio,
  AlertTriangle,
  FileText,
  ListChecks,
  Route,
  MessageSquarePlus,
  BookOpen,
  ChevronRight,
  Loader2,
  Network,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { appConfirm } from '@/lib/confirm-store';
import { getAccountWorkspace } from '@/lib/accounts/account-workspace';
import { ContactsTab } from "@/components/accounts/ContactCard";
import { ContactSuggestions } from "@/components/accounts/ContactSuggestions";
import { DecodeHistory } from "@/components/accounts/DecodeHistory";
import { IntelSection } from "@/components/accounts/IntelSection";
import { TaskListSection } from "@/components/tasks/TaskListSection";
import {
  DEAL_STAGE_LABELS,
  HEALTH_CONFIG,
  formatDealValue,
} from "@/components/accounts/shared";
import { AccountBasicsPanel } from "./components/overview-tab";
import { ProjectTeamCard } from "./components/project-team-card";
import { AccountTeamSummaryStrip } from "./components/account-team-summary-strip";
import {
  ACCOUNT_DETAIL_TAB_ITEMS,
  getNextAccountEditIntent,
  isAccountDetailTabKey,
  type AccountDetailTabKey,
} from "./components/account-detail-navigation";
import { MarketIntelTab } from "./components/market-intel-tab";
import { StrategicPlayTab } from "./components/strategic-play-tab";
import { DecisionAndStakeholderMap } from "./components/analysis-tab";
import { SentimentTrend } from "@/components/accounts/SentimentTrend";
import MeetingHistory from "@/components/meeting/meeting-history";
import { CustomerHealthCard } from "@/components/accounts/CustomerHealthCard";
import { UnifiedTimeline } from "@/components/integration/unified-timeline";
import type { Account, AccountMemoryConflict, AccountMemorySummary, AccountTimelineItem, Contact, MomentumShift, Opportunity, SavedDecode, Task } from "@/lib/babel-engine/types";
import { CommentThread } from "@/components/collaboration/comment-thread";
import { HandoffPanel } from "@/components/collaboration/handoff-panel";
import { KnowledgeTab } from "./components/knowledge-tab";
import { AccountQuickActions } from "@/components/accounts/AccountQuickActions";
import { RoleFocusBanner } from "@/components/shared/role-focus-banner";
import { AccountMemoryPanel } from "./components/account-memory-panel";
import { JudgmentBoard } from "./components/judgment-board";
import { RelationshipIntelligenceTab } from "./components/relationship-intelligence-tab";
import { JudgmentActionPanel } from "./components/judgment-action-panel";
import { JudgmentTraceBanner } from "@/components/judgment/judgment-trace-banner";
import { buildJudgmentsFromMemory } from "@/lib/judgment";
import { buildAccountTraceNarrative } from "@/lib/judgment/trace-narrative";
import { JUDGMENT_MEMORY_SOURCE_LABELS, type JudgmentMemorySourceItem } from "@/lib/judgment/memory-sources";
import { buildAccountVerificationSignals, type AccountVerificationSignal } from "@/lib/judgment/contradiction-signals";
import type { AccountMomentumSnapshot } from "@/lib/judgment/momentum";
import type { StakeholderInterpretation } from "@/lib/judgment/stakeholder";
import type { AccountOpenQuestion } from "@/lib/judgment/open-questions";
import type { JudgmentFeedbackRevisionRecord } from "@/lib/judgment/feedback";
import type { WinLossCalibrationItem } from "@/lib/judgment/win-loss-calibration";
import type { JudgmentTimelineItem } from "@/lib/judgment/timeline";
import type { InterventionOutcomeItem, JudgmentLearningSummary } from "@/lib/judgment/intervention-learning";
import type { DecodeStabilityTimelineItem } from "@/lib/judgment/decode-stability";
import { roleViewRoleFromJobLevel, type RoleBasedJudgmentView, type RoleViewRole } from "@/lib/judgment/role-view";
import { normalizeComparisonWindow, COMPARISON_WINDOW_VALUES, type ComparisonWindow } from "@/lib/comparison-window";
import { visibleBusinessText } from "@/lib/visible-business-text";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { useEffectiveJobLevel } from "@/hooks/use-effective-job-level";
import { DECODE_SOURCE_LABELS } from "@/components/decode/decode-helpers";
import { useLocale, type Locale } from "@/lib/i18n";


// ─── Constants ───────────────────────────────────────────────────────

const TAB_ICONS = {
  overview: Building2,
  plays: Route,
  contacts: Users,
  relationship: Network,
  team: Users,
  activity: Radio,
  tasks: ListChecks,
  collab: MessageSquarePlus,
  knowledge: BookOpen,
} as const satisfies Record<AccountDetailTabKey, typeof Building2>;

const TABS = ACCOUNT_DETAIL_TAB_ITEMS.map((tab) => ({
  ...tab,
  icon: TAB_ICONS[tab.key],
}));

const COMPARISON_WINDOW_OPTIONS = [
  { value: 14, label: '近14天' },
  { value: 30, label: '近30天' },
  { value: 90, label: '近90天' },
] as const satisfies { value: (typeof COMPARISON_WINDOW_VALUES)[number]; label: string }[];
const COMPARISON_WINDOW_LABELS_EN: Record<(typeof COMPARISON_WINDOW_VALUES)[number], string> = {
  14: 'Last 14 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
};

function l(locale: Locale, zh: string, en: string): string {
  return locale === 'en' ? en : zh;
}

function hasCjk(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value);
}

function englishFallback(value: string, fallback: string, locale: Locale): string {
  return locale === 'en' && hasCjk(value) ? fallback : value;
}

function accountAnalysisStatusText(message: string, locale: Locale): string {
  if (!message) return '';
  if (locale !== 'en') return message;
  const match = message.match(/正在分析\s*(\d+)\s*条证据/);
  if (match) return `Analyzing ${match[1]} evidence records...`;
  return hasCjk(message) ? 'Refreshing account judgment...' : message;
}

const VERIFICATION_PRIORITY_LABEL: Record<AccountVerificationSignal['severity'] | AccountOpenQuestion['priority'], string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
};

const VERIFICATION_PRIORITY_CLASS: Record<AccountVerificationSignal['severity'] | AccountOpenQuestion['priority'], string> = {
  high: 'border-danger/30 bg-danger/10 text-danger',
  medium: 'border-warning/30 bg-warning/10 text-warning',
  low: 'border-border bg-card text-secondary',
};

const STAKEHOLDER_PATH_ROLE_LABEL: Record<StakeholderInterpretation['role'], string> = {
  champion: '内部推动者',
  blocker: '阻力点',
  evaluator: '评估者',
  decision_maker: '决策或预算权',
  sponsor: '高层支持者',
  unknown: '角色待确认 / 权力待验证',
};

const STAKEHOLDER_PATH_STANCE_LABEL: Record<StakeholderInterpretation['stance'], string> = {
  supportive: '支持',
  resistant: '怀疑 / 阻挡',
  neutral: '中立',
  mixed: '立场摇摆',
  unknown: '待确认',
};

const CONTACT_ROLE_PATH_LABEL: Partial<Record<NonNullable<Contact['role']>, string>> = {
  economic_buyer: '预算负责人',
  decision_maker: '决策人',
  executive_sponsor: '高层支持者',
  champion: '内部推动者',
  coach: '内线教练',
  blocker: '阻力点',
  technical_evaluator: '技术评估人',
  procurement: '采购流程负责人',
  legal: '法务把关人',
  finance: '预算把关人',
  influencer: '影响者',
  gate_keeper: '入口把关人',
  unknown: '角色待确认 / 权力待验证',
};

function buildVerificationMessage(question: AccountOpenQuestion): string {
  const targetName = question.whoToAsk?.name?.trim() || '对方';
  const fact = visibleBusinessText(question.question)
    .replace(/^向\s*[^「]+确认「/, '')
    .replace(/」是否属实.*$/, '')
    .replace(/^确认「/, '')
    .replace(/^确认/, '')
    .trim();
  const cleanFact = fact || '当前推进判断是否准确';
  return `${targetName}，想跟您确认一件事：${cleanFact}。如果方便，您直接回复“是 / 不是 / 需要补充”，我这边好据此调整后续推进方式。`;
}

function buildVerificationChannel(question: AccountOpenQuestion): string {
  const target = question.whoToAsk?.name ? `发给 ${question.whoToAsk.name}` : '发给最熟悉该客户的联系人';
  return `${target}，建议用微信或邮件短消息；只问这一件事，不同时追问预算、流程和态度。`;
}

function buildVerificationComposeHref(question: AccountOpenQuestion, accountId?: string): string {
  const params = new URLSearchParams();
  if (question.whoToAsk?.name) params.set('name', question.whoToAsk.name);
  if (question.whoToAsk?.title) params.set('title', question.whoToAsk.title);
  if (question.whoToAsk?.contactId) params.set('contactId', question.whoToAsk.contactId);
  if (accountId) params.set('accountId', accountId);
  params.set('emailType', 'follow_up');
  params.set('goal', `确认待验证问题：${visibleBusinessText(question.question)}`);
  params.set('draft', buildVerificationMessage(question));
  params.set('context', `为什么重要：${visibleBusinessText(question.whyItMatters)}\n怎么发：${buildVerificationChannel(question)}`);
  params.set('autoGenerate', '1');
  return `/compose?${params.toString()}`;
}

function AccountVisualSnapshot({
  account,
  activeOpportunities,
  decodeCount,
  intelCount,
  activeTaskCount,
  conflictCount,
  openQuestionCount,
  locale,
}: {
  account: Account;
  activeOpportunities: Opportunity[];
  decodeCount: number;
  intelCount: number;
  activeTaskCount: number;
  conflictCount: number;
  openQuestionCount: number;
  locale: Locale;
}) {
  const contacts = account.contacts ?? [];
  const keyRoles = new Set(contacts.map((contact) => contact.role).filter(Boolean));
  const relationshipScore = Math.min(
    100,
    contacts.length * 12
      + (keyRoles.has('champion') ? 24 : 0)
      + (keyRoles.has('decision_maker') || keyRoles.has('economic_buyer') ? 24 : 0)
      + (contacts.some((contact) => contact.lastContactedAt) ? 16 : 0),
  );
  const pipelineValue = activeOpportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
  const signalCount = decodeCount + intelCount;
  const riskLoad = conflictCount + openQuestionCount + activeTaskCount;
  const tiles = [
    { label: l(locale, '关系覆盖', 'Relationship coverage'), value: relationshipScore, color: 'bg-accent', hint: l(locale, contacts.length + ' 人', contacts.length + ' people') },
    { label: l(locale, '活跃商机管线', 'Active pipeline'), value: activeOpportunities.length, color: 'bg-positive', hint: formatDealValue(pipelineValue) },
    { label: l(locale, '新信号', 'New signals'), value: signalCount, color: 'bg-warning', hint: l(locale, decodeCount + ' 条解读 / ' + intelCount + ' 条情报', decodeCount + ' decodes / ' + intelCount + ' intel') },
    { label: l(locale, '待复核', 'Needs review'), value: riskLoad, color: 'bg-danger', hint: l(locale, conflictCount + ' 冲突 / ' + openQuestionCount + ' 问题', conflictCount + ' conflicts / ' + openQuestionCount + ' questions') },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-4">
      {tiles.map((tile) => {
        const pct = tile.label === '关系覆盖' ? tile.value : Math.min(100, tile.value * 18);
        return (
          <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{tile.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{tile.value}</p>
              </div>
              <span className="rounded-full bg-background px-2 py-1 text-[11px] text-secondary">{tile.hint}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
              <div className={'h-full rounded-full ' + tile.color} style={{ width: Math.max(4, pct) + '%' }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

type TabKey = AccountDetailTabKey;
type StrategicPlayPrefill = {
  goalType?: string;
  goalDescription?: string;
  successCriteria?: string;
  opportunityId?: string;
  additionalContext?: string;
};

type AIAnalysisResult = {
  narrative: string;
  momentum: { status: string; label: string; reason: string };
  risks: { title: string; severity: string; detail: string }[];
  nextActions: { title: string; reason: string; urgency: string }[];
  stakeholderSummary: string;
  openQuestions: string[];
  analyzedAt: string;
  previousAnalysis?: {
    narrative: string;
    momentum: { status: string; label: string; reason: string };
    analyzedAt: string;
  };
};

type MemoryPayloadResponse = {
  summary?: AccountMemorySummary | null;
  previousSummary?: AccountMemorySummary | null;
  momentumShift?: MomentumShift | null;
  summaryHistory?: Array<{ id: string; label: string; summary: AccountMemorySummary }>;
  conflicts?: AccountMemoryConflict[];
  timelineItems?: AccountTimelineItem[];
  aiAnalysis?: AIAnalysisResult | null;
  judgmentMemories?: JudgmentMemorySourceItem[];
  accountMomentum?: AccountMomentumSnapshot | null;
  stakeholderInterpretations?: StakeholderInterpretation[];
  openQuestions?: AccountOpenQuestion[];
  feedbackRevisionRecords?: JudgmentFeedbackRevisionRecord[];
  winLossCalibrations?: WinLossCalibrationItem[];
  interventionOutcomes?: InterventionOutcomeItem[];
  judgmentLearning?: JudgmentLearningSummary | null;
  judgmentTimeline?: JudgmentTimelineItem[];
  decodeStabilityTimeline?: DecodeStabilityTimelineItem[];
  judgmentStabilityTimeline?: DecodeStabilityTimelineItem[];
  roleView?: RoleBasedJudgmentView | null;
};

const memoryPayloadCache = new Map<string, { timestamp: number; payload: MemoryPayloadResponse }>();
const memoryPayloadInFlight = new Map<string, Promise<MemoryPayloadResponse>>();

function invalidateMemoryPayloadCache(accountId: string, comparisonWindow: ComparisonWindow) {
  const prefix = `${accountId}:${comparisonWindow}:`;
  for (const key of memoryPayloadCache.keys()) {
    if (key.startsWith(prefix) || key === `${accountId}:${comparisonWindow}`) {
      memoryPayloadCache.delete(key);
    }
  }
  for (const key of memoryPayloadInFlight.keys()) {
    if (key.startsWith(prefix) || key === `${accountId}:${comparisonWindow}`) {
      memoryPayloadInFlight.delete(key);
    }
  }
}
const MEMORY_PAYLOAD_CACHE_TTL_MS = 30_000;
function isSparseSummary(summary: AccountMemorySummary | null | undefined): boolean {
  if (!summary) return true;
  return (
    (summary.sourceCoverage?.totalRecords ?? 0) === 0 ||
    (((summary.people?.length ?? 0) === 0) && ((summary.tensions?.length ?? 0) === 0) && ((summary.timelineHighlights?.length ?? 0) === 0))
  );
}

function buildFallbackSummary(params: {
  accountId: string;
  aiAnalysis: AIAnalysisResult | null;
  timelineItems: AccountTimelineItem[];
  opportunityCount: number;
  activeOpportunityCount: number;
}): AccountMemorySummary | null {
  const { accountId, aiAnalysis, timelineItems, opportunityCount, activeOpportunityCount } = params;
  if (!aiAnalysis) return null;
  const fallbackTimeline = timelineItems.slice(0, 5);
  const tensions = aiAnalysis.risks?.map((risk) => `${risk.title}：${risk.detail}`).slice(0, 4) ?? [];
  const stakeholderSummary = aiAnalysis.stakeholderSummary?.trim();
  const people = stakeholderSummary ? [{
    contactId: `${accountId}:stakeholder-summary`,
    name: '关键干系人',
    influenceLabel: '综合判断',
    stance: 'unclear' as const,
    summary: stakeholderSummary,
    sourceIds: fallbackTimeline.slice(0, 2).map((item) => item.sourceId),
  }] : [];
  return {
    accountId,
    narrativeSummary: aiAnalysis.narrative,
    momentum: {
      status: (aiAnalysis.momentum?.status as AccountMemorySummary['momentum']['status']) || 'steady',
      label: aiAnalysis.momentum?.label || '平稳',
      reasoning: aiAnalysis.momentum?.reason || `当前有 ${activeOpportunityCount || opportunityCount} 个交易相关对象可供判断。`,
    },
    people,
    tensions,
    timelineHighlights: fallbackTimeline,
    lastComputedAt: aiAnalysis.analyzedAt || new Date().toISOString(),
    confidence: Math.max(0.58, Math.min(0.86, 0.58 + fallbackTimeline.length * 0.04 + Math.min(tensions.length, 3) * 0.03)),
    sourceCoverage: {
      kinds: [...new Set(fallbackTimeline.map((item) => item.sourceKind))],
      totalRecords: fallbackTimeline.length,
      freshRecords: fallbackTimeline.length,
      oldestRecordAt: fallbackTimeline[fallbackTimeline.length - 1]?.occurredAt,
      newestRecordAt: fallbackTimeline[0]?.occurredAt,
    },
  };
}

async function getMemoryPayload(accountId: string, comparisonWindow: ComparisonWindow, signal: AbortSignal, role?: RoleViewRole, locale?: Locale): Promise<MemoryPayloadResponse> {
  const cacheKey = `${accountId}:${comparisonWindow}:${role ?? 'server'}:${locale ?? 'zh'}`;
  const now = Date.now();
  const cached = memoryPayloadCache.get(cacheKey);
  if (cached && now - cached.timestamp < MEMORY_PAYLOAD_CACHE_TTL_MS) {
    return cached.payload;
  }

  let request = memoryPayloadInFlight.get(cacheKey);
  if (!request) {
    const params = new URLSearchParams({ window: String(comparisonWindow) });
    if (role) params.set('role', role);
    if (locale) params.set('outputLocale', locale);
    request = fetch(`/api/accounts/${accountId}/memory-payload?${params.toString()}`, { cache: 'no-store', signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`memory-payload:${res.status}`);
        }
        const payload = (await res.json()) as MemoryPayloadResponse;
        memoryPayloadCache.set(cacheKey, { timestamp: Date.now(), payload });
        return payload;
      })
      .finally(() => {
        memoryPayloadInFlight.delete(cacheKey);
      });
    memoryPayloadInFlight.set(cacheKey, request);
  }

  return request;
}

type StakeholderPathSummaryItem = {
  id: string;
  name: string;
  title?: string;
  roleLabel: string;
  stanceLabel: string;
  whyImportant: string;
  uncertainty: string;
  nextAction: string;
  evidenceLabel: string;
  provisional: boolean;
};

function buildStakeholderPathSummary(params: {
  contacts: Contact[];
  interpretations: StakeholderInterpretation[];
  openQuestions: AccountOpenQuestion[];
}): StakeholderPathSummaryItem[] {
  const { contacts, interpretations, openQuestions } = params;
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const questionByContactName = new Map<string, AccountOpenQuestion>();
  for (const question of openQuestions) {
    const name = question.whoToAsk?.name;
    if (name) questionByContactName.set(name.toLowerCase(), question);
  }

  const interpreted = interpretations.map((item) => {
    const contact = contactById.get(item.contactId);
    const matchingQuestion = questionByContactName.get(item.name.toLowerCase());
    const evidenceCount = item.evidenceRefs.length;
    const lowEvidence = evidenceCount === 0 || item.confidence < 0.5;
    return {
      id: item.contactId,
      name: item.name,
      title: item.title ?? contact?.title,
      roleLabel: STAKEHOLDER_PATH_ROLE_LABEL[item.role],
      stanceLabel: STAKEHOLDER_PATH_STANCE_LABEL[item.stance],
      whyImportant: item.whyThisRole || contact?.communicationNotes || '其真实影响力仍需通过客户信号验证。',
      uncertainty: item.uncertainty || matchingQuestion?.question || (lowEvidence ? '待验证 / 证据不足' : '暂无明显反证，但仍需持续校准。'),
      nextAction: item.nextAction || matchingQuestion?.nextVerificationAction || '下一次沟通中确认其真实关切、影响范围和是否愿意推动。',
      evidenceLabel: evidenceCount > 0 ? `${evidenceCount} 条证据 · 可信度 ${Math.round(item.confidence * 100)}%` : '证据不足',
      provisional: item.provisional || lowEvidence,
    } satisfies StakeholderPathSummaryItem;
  });

  const interpretedIds = new Set(interpreted.map((item) => item.id));
  const fallbackContacts = contacts
    .filter((contact) => !interpretedIds.has(contact.id))
    .filter((contact) => contact.role && contact.role !== 'contact')
    .sort((a, b) => (b.jobLevel ?? 0) - (a.jobLevel ?? 0))
    .slice(0, Math.max(0, 5 - interpreted.length))
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      title: contact.title,
      roleLabel: CONTACT_ROLE_PATH_LABEL[contact.role ?? 'unknown'] ?? '角色待确认',
      stanceLabel: '待验证',
      whyImportant: contact.role
        ? '根据联系人职能推断可能影响推进路径，但还缺少一手客户信号。'
        : '尚未确认其在客户内部的真实影响力。',
      uncertainty: '待验证 / 证据不足',
      nextAction: '补一次关键沟通或会议纪要，确认其立场、权力范围和真实关切。',
      evidenceLabel: '证据不足',
      provisional: true,
    } satisfies StakeholderPathSummaryItem));

  return [...interpreted, ...fallbackContacts].slice(0, 5);
}

function StakeholderPathSummaryPanel({
  contacts,
  stakeholderInterpretations,
  openQuestions,
  loading,
}: {
  contacts: Contact[];
  stakeholderInterpretations: StakeholderInterpretation[];
  openQuestions: AccountOpenQuestion[];
  loading: boolean;
}) {
  const items = useMemo(() => buildStakeholderPathSummary({
    contacts,
    interpretations: stakeholderInterpretations,
    openQuestions,
  }), [contacts, openQuestions, stakeholderInterpretations]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">关键人路径摘要</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">这家客户内部要先搞清楚谁</h2>
        </div>
        {items.length > 0 ? <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-secondary">{items.length} 人</span> : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((person) => (
          <div key={person.id} className={`rounded-xl border p-4 ${person.provisional ? 'border-warning/20 bg-warning/[0.03]' : 'border-border bg-muted/10'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{visibleBusinessText(person.name)}</p>
                {person.title ? <p className="mt-0.5 truncate text-xs text-muted">{visibleBusinessText(person.title)}</p> : null}
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${person.provisional ? 'border-warning/30 bg-warning/10 text-warning' : 'border-accent/20 bg-accent/5 text-accent'}`}>
                {person.evidenceLabel}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-md border border-border bg-background px-2 py-0.5 text-secondary">{person.roleLabel}</span>
              <span className="rounded-md border border-border bg-background px-2 py-0.5 text-secondary">立场：{person.stanceLabel}</span>
            </div>
            <div className="mt-3 space-y-2 text-xs leading-5">
              <p className="text-secondary"><span className="font-semibold text-foreground">为什么重要：</span>{visibleBusinessText(person.whyImportant)}</p>
              <p className={person.provisional ? 'text-warning' : 'text-secondary'}><span className="font-semibold text-foreground">不确定性 / 反证：</span>{visibleBusinessText(person.uncertainty)}</p>
              <p className="rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground"><span className="font-semibold">下一步打法：</span>{visibleBusinessText(person.nextAction)}</p>
            </div>
          </div>
        ))}

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 lg:col-span-2">
            <p className="text-sm font-semibold text-foreground">关键人路径待验证</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              {loading ? '正在加载账户记忆与关键人解释...' : '当前还缺少可追踪的联系人立场、权力路径或证据来源。先补一次客户互动、会议纪要或联系人角色。'}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────

interface AccountDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountDetailPage({ params }: AccountDetailPageProps) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLocale();
  const en = locale === 'en';
  const { accounts, intelItems, emailDecodes, opportunities, tasks } = useRoleFilteredData();
  const isHydrated = useStore((s) => s.isHydrated);
  const { orgMembers, user } = useAuth();
  const jobLevel = useEffectiveJobLevel();
  const tabParam = searchParams.get("tab");
  const targetKind = searchParams.get("targetKind");
  const targetId = searchParams.get("targetId");
  const quickAction = searchParams.get("quickAction");
  const comparisonWindow = useMemo(
    () => normalizeComparisonWindow(searchParams.get('window') ?? 30),
    [searchParams],
  );
  const validTabs = useMemo(() => TABS.map((t) => t.key), []);
  const initialTab = isAccountDetailTabKey(tabParam) ? tabParam : "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [pendingComparisonWindow, setPendingComparisonWindow] = useState<ComparisonWindow | null>(null);
  const workspace = getAccountWorkspace({
    accountId: id,
    accounts,
    opportunities,
    intelItems,
    emailDecodes,
    tasks,
  });
  const account = workspace?.account;
  const accountId = account?.id;

  // Sync active tab from URL so deep links such as /accounts/:id?tab=plays
  // always land on the requested workspace after hydration/navigation.
  useEffect(() => {
    const nextTab = isAccountDetailTabKey(tabParam) ? tabParam : null;
    if (nextTab) setActiveTab(nextTab);
  }, [tabParam, validTabs]);

  useEffect(() => {
    if (quickAction === 'new-play') {
      setActiveTab('plays');
      setPlayPrefill((current) => current ?? { goalDescription: en ? `Create an action plan for ${account?.name ?? 'this account'}` : `围绕 ${account?.name ?? '当前客户'} 制定推进计划` });
      return;
    }
    if (quickAction === 'add-contact') {
      setActiveTab('contacts');
      return;
    }
    if (quickAction === 'view-analysis') {
      setActiveTab('overview');
      setJudgmentBoardOpen(true);
      setTimeout(() => {
        judgmentBoardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [account?.name, quickAction, en]);

  useEffect(() => {
    if (pendingComparisonWindow === comparisonWindow) {
      setPendingComparisonWindow(null);
    }
  }, [comparisonWindow, pendingComparisonWindow]);

  const displayComparisonWindow = pendingComparisonWindow ?? comparisonWindow;

  const handleComparisonWindowChange = (nextWindow: ComparisonWindow) => {
    if (nextWindow === displayComparisonWindow) return;
    setPendingComparisonWindow(nextWindow);
    const params = new URLSearchParams(searchParams.toString());
    params.set('window', String(nextWindow));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleTabChange = (nextTab: TabKey) => {
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const [isEditing, setIsEditing] = useState(false);

  const handleEditToggle = () => {
    const intent = getNextAccountEditIntent(activeTab, isEditing);
    if (intent.nextTab !== activeTab) {
      handleTabChange(intent.nextTab);
    }
    setIsEditing(intent.nextEditing);
  };
  const [showTransferModal, setShowTransferModal] = useState(false);
  // 从情报信号跳转时，自动预填谋局目标
  const intelSignalRaw = searchParams.get("intelSignal");
  const intelSignalPrefill = intelSignalRaw
    ? (() => {
        try {
          const signal = JSON.parse(decodeURIComponent(intelSignalRaw));
          return {
            goalDescription: `【情报信号触发】${signal.content}${signal.sourceUrl ? `\n来源：${signal.sourceUrl}` : ""}`,
          };
        } catch { return null; }
      })()
    : null;
  const rfpPlayPrefill = searchParams.get('newPlay') === '1'
    ? {
        goalType: searchParams.get('goalType') ?? undefined,
        goalDescription: searchParams.get('goalDescription') ?? undefined,
        opportunityId: searchParams.get('opportunityId') ?? undefined,
        additionalContext: [
          searchParams.get('rfpTitle') ? `来源：RFP「${searchParams.get('rfpTitle')}」谋局建议` : '',
          searchParams.get('recommendationReason') ? `推荐原因：${searchParams.get('recommendationReason')}` : '',
          searchParams.get('rfpId') ? `RFP ID：${searchParams.get('rfpId')}` : '',
        ].filter(Boolean).join('\n'),
      }
    : null;
  const [playPrefill, setPlayPrefill] = useState<StrategicPlayPrefill | null>(rfpPlayPrefill ?? intelSignalPrefill);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activityType, setActivityType] = useState<'call' | 'meeting' | 'note'>('note');
  const [activityText, setActivityText] = useState('');
  const [memoryArchiveOpen, setMemoryArchiveOpen] = useState(false);
  const [judgmentBoardOpen, setJudgmentBoardOpen] = useState(false);
  const judgmentBoardRef = useRef<HTMLDivElement | null>(null);
  const [memorySummary, setMemorySummary] = useState<AccountMemorySummary | null>(null);
  const [previousMemorySummary, setPreviousMemorySummary] = useState<AccountMemorySummary | null>(null);
  const [momentumShift, setMomentumShift] = useState<MomentumShift | null>(null);
  const [memorySummaryHistory, setMemorySummaryHistory] = useState<Array<{ id: string; label: string; summary: AccountMemorySummary }>>([]);
  const [memoryConflicts, setMemoryConflicts] = useState<AccountMemoryConflict[]>([]);
  const [memoryTimeline, setMemoryTimeline] = useState<AccountTimelineItem[]>([]);
  const [judgmentMemories, setJudgmentMemories] = useState<JudgmentMemorySourceItem[]>([]);
  const [accountMomentum, setAccountMomentum] = useState<AccountMomentumSnapshot | null>(null);
  const [stakeholderInterpretations, setStakeholderInterpretations] = useState<StakeholderInterpretation[]>([]);
  const [openQuestions, setOpenQuestions] = useState<AccountOpenQuestion[]>([]);
  const [winLossCalibrations, setWinLossCalibrations] = useState<WinLossCalibrationItem[]>([]);
  const [interventionOutcomes, setInterventionOutcomes] = useState<InterventionOutcomeItem[]>([]);
  const [judgmentLearning, setJudgmentLearning] = useState<JudgmentLearningSummary | null>(null);
  const [judgmentTimeline, setJudgmentTimeline] = useState<JudgmentTimelineItem[]>([]);
  const [decodeStabilityTimeline, setDecodeStabilityTimeline] = useState<DecodeStabilityTimelineItem[]>([]);
  const [roleView, setRoleView] = useState<RoleBasedJudgmentView | null>(null);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiNarrativeOpen, setAiNarrativeOpen] = useState(true);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState(false);
  const [streamingNarrative, setStreamingNarrative] = useState('');
  const [aiStatusMessage, setAiStatusMessage] = useState('');
  const memoryRole = useMemo(() => roleViewRoleFromJobLevel(jobLevel), [jobLevel]);
  const [memoryRefreshNonce, setMemoryRefreshNonce] = useState(0);

  // Memory snapshot loader — must be called unconditionally (React rules of hooks)
  useEffect(() => {
    if (!accountId) return;

    const controller = new AbortController();

    function resetMemorySnapshot() {
      setJudgmentMemories([]);
      setAccountMomentum(null);
      setStakeholderInterpretations([]);
      setOpenQuestions([]);
      setWinLossCalibrations([]);
      setInterventionOutcomes([]);
      setJudgmentLearning(null);
      setJudgmentTimeline([]);
      setDecodeStabilityTimeline([]);
      setRoleView(null);
      setMemoryLoaded(true);
    }

    async function loadMemorySnapshot() {
      if (!accountId) return;
      try {
        const payload = await getMemoryPayload(accountId, comparisonWindow, controller.signal, memoryRole, locale);
        if (controller.signal.aborted) return;
        setMemorySummary(payload.summary ?? null);
        setPreviousMemorySummary(payload.previousSummary ?? null);
        setMomentumShift(payload.momentumShift ?? null);
        setMemorySummaryHistory(payload.summaryHistory ?? []);
        setMemoryConflicts(payload.conflicts ?? []);
        setMemoryTimeline(payload.timelineItems ?? []);
        setJudgmentMemories(payload.judgmentMemories ?? []);
        setAccountMomentum(payload.accountMomentum ?? null);
        setStakeholderInterpretations(payload.stakeholderInterpretations ?? []);
        setOpenQuestions(payload.openQuestions ?? []);
        setWinLossCalibrations(payload.winLossCalibrations ?? []);
        setInterventionOutcomes(payload.interventionOutcomes ?? []);
        setJudgmentLearning(payload.judgmentLearning ?? null);
        setJudgmentTimeline(payload.judgmentTimeline ?? []);
        setDecodeStabilityTimeline(payload.decodeStabilityTimeline ?? payload.judgmentStabilityTimeline ?? []);
        setRoleView(payload.roleView ?? null);
        setAiAnalysis(payload.aiAnalysis ?? null);
        setMemoryLoaded(true);
      } catch {
        if (controller.signal.aborted) return;
        resetMemorySnapshot();
      }
    }

    void loadMemorySnapshot();
    return () => {
      controller.abort();
    };
  }, [accountId, comparisonWindow, memoryRefreshNonce, memoryRole, locale]);

  const accountIntel = workspace?.intelItems ?? [];
  const accountDecodes = workspace?.emailDecodes ?? [];
  const recentAccountDecodes = [...accountDecodes]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);
  const accountOpportunities = workspace?.opportunities ?? [];
  const activeOpportunities = accountOpportunities.filter((item) => item.stage !== 'closed_won' && item.stage !== 'closed_lost');
  const accountTasks = workspace?.tasks ?? [];
  const activeTasks = accountTasks.filter((item) => item.status !== 'done');
  const nextTaskItems = [...activeTasks]
    .sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 3);
  const resolvedMemorySummary = useMemo(() => {
    if (!isSparseSummary(memorySummary)) return memorySummary;
    return buildFallbackSummary({
      accountId: id,
      aiAnalysis,
      timelineItems: memoryTimeline,
      opportunityCount: accountOpportunities.length,
      activeOpportunityCount: activeOpportunities.length,
    });
  }, [memorySummary, id, aiAnalysis, memoryTimeline, accountOpportunities.length, activeOpportunities.length]);
  const resolvedPreviousSummary = useMemo(() => {
    if (!isSparseSummary(previousMemorySummary)) return previousMemorySummary;
    return null;
  }, [previousMemorySummary]);
  const resolvedMomentumShift = useMemo(() => momentumShift, [momentumShift]);
  const keyJudgments = buildJudgmentsFromMemory({
    summary: resolvedMemorySummary,
    previousSummary: resolvedPreviousSummary,
    summaryHistory: memorySummaryHistory,
    conflicts: memoryConflicts,
    momentumShift: resolvedMomentumShift,
  });
  const leadJudgment = keyJudgments[0] ?? null;
  const riskJudgment = keyJudgments.find((item) => item.kind === 'deal_risk') ?? null;
  const topTimelineItems = memoryTimeline.slice(0, 3);
  const verificationSignals = useMemo(() => buildAccountVerificationSignals({
    conflicts: memoryConflicts,
    judgmentMemories,
    timelineItems: memoryTimeline,
    limit: 4,
  }), [memoryConflicts, judgmentMemories, memoryTimeline]);
  const accountTraceNarrative = useMemo(() => buildAccountTraceNarrative({
    currentJudgment: accountMomentum?.currentJudgment ?? leadJudgment?.summary,
    evidenceSourceCount: judgmentMemories.length + memoryTimeline.length + judgmentTimeline.length,
    evidenceLabels: [
      ...new Set([
        ...judgmentMemories.map((item) => JUDGMENT_MEMORY_SOURCE_LABELS[item.sourceKind] ?? item.title),
        ...(memoryTimeline.length > 0 ? ['客户动态'] : []),
        ...(judgmentTimeline.length > 0 ? ['判断时间线'] : []),
      ]),
    ],
    conflictCount: memoryConflicts.length,
    openQuestionCount: openQuestions.length,
    activeOpportunityCount: activeOpportunities.length,
    activeTaskCount: activeTasks.length,
    nextAction: accountMomentum?.nextAction ?? aiAnalysis?.nextActions?.[0]?.title,
    accountId: id,
  }), [accountMomentum?.currentJudgment, accountMomentum?.nextAction, activeOpportunities.length, activeTasks.length, aiAnalysis?.nextActions, id, judgmentMemories, judgmentTimeline.length, leadJudgment?.summary, memoryConflicts.length, memoryTimeline.length, openQuestions.length]);
  const suggestedAskContacts = useMemo(() => openQuestions
    .map((question) => question.whoToAsk)
    .filter((person): person is NonNullable<AccountOpenQuestion['whoToAsk']> => Boolean(person?.name))
    .slice(0, 2), [openQuestions]);
  // Show "正在分析" when memory data hasn't loaded yet, or AI is actively analyzing
  const showAnalyzing = !memoryLoaded || aiAnalyzing;
  const needsAIAnalysis = memoryLoaded && !aiAnalysis;
  const shouldAutoGenerateAIAnalysis = needsAIAnalysis;

  const autoAnalysisTriggeredRef = useRef(false);

  // Reset auto-analysis guard when observation window or account changes
  useEffect(() => {
    autoAnalysisTriggeredRef.current = false;
  }, [accountId, comparisonWindow]);

  useEffect(() => {
    if (!accountId || !shouldAutoGenerateAIAnalysis || aiAnalyzing || autoAnalysisTriggeredRef.current) return;
    autoAnalysisTriggeredRef.current = true;
    void triggerAIAnalysis();
    // triggerAIAnalysis intentionally remains outside deps; autoAnalysisTriggeredRef prevents repeated streams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoGenerateAIAnalysis, aiAnalyzing, accountId, comparisonWindow]);

  useEffect(() => {
    if (aiAnalysis?.analyzedAt) {
      autoAnalysisTriggeredRef.current = true;
    }
  }, [aiAnalysis?.analyzedAt]);

  const triggerAIAnalysis = async () => {
    if (!accountId || aiAnalyzing) return;
    setAiAnalyzing(true);
    setAiAnalysisError(false);
    setStreamingNarrative('');
    setAiStatusMessage('');
    try {
      const res = await fetch(`/api/accounts/${accountId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputLocale: locale }),
      });
      if (!res.ok) {
        console.error(`[account] AI analysis returned ${res.status}`);
        setAiAnalysisError(true);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          try {
            const event = JSON.parse(trimmed.slice(5).trim());
            if (event.type === 'status') {
              setAiStatusMessage(event.message);
            } else if (event.type === 'narrative') {
              setStreamingNarrative(event.text);
            } else if (event.type === 'complete') {
              const result = event.result;
              setAiAnalysis(result);
              setStreamingNarrative('');
              setAiStatusMessage('');
              invalidateMemoryPayloadCache(accountId, comparisonWindow);
              if (resolvedMemorySummary && result.narrative) {
                setMemorySummary({
                  ...resolvedMemorySummary,
                  narrativeSummary: result.narrative,
                  momentum: {
                    ...resolvedMemorySummary.momentum,
                    label: result.momentum?.label ?? resolvedMemorySummary.momentum.label,
                    status: result.momentum?.status ?? resolvedMemorySummary.momentum.status,
                  },
                });
              }
            } else if (event.type === 'error') {
              console.error('[account] AI analysis stream error:', event.message);
              setAiAnalysisError(true);
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    } catch (err) {
      console.error('[account] AI analysis failed:', err);
      setAiAnalysisError(true);
    } finally {
      setAiAnalyzing(false);
      setStreamingNarrative('');
      setAiStatusMessage('');
    }
  };

  if (!isHydrated) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 rounded-xl bg-sidebar animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-48 rounded-lg bg-sidebar animate-pulse" />
            <div className="h-3 w-32 rounded-lg bg-sidebar animate-pulse" />
          </div>
        </div>
        <div className="h-10 w-full rounded-lg bg-sidebar animate-pulse" />
        <div className="h-64 w-full rounded-xl bg-sidebar animate-pulse" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card card-elevated p-12 text-center">
        <p className="text-sm font-medium text-foreground">{l(locale, "客户不存在", "Account not found")}</p>
        <p className="mt-1 text-xs text-muted">{l(locale, "该客户可能已被删除。", "This account may have been deleted.")}</p>
        <Link
          href="/accounts"
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <ArrowLeft className="h-4 w-4" />
          {l(locale, "返回客户列表", "Back to accounts")}
        </Link>
      </div>
    );
  }

  function getOwnerName(userId?: string): string {
    if (!userId) return en ? "Unassigned" : "未分配";
    if (userId === user?.id) return en ? "Me" : "我";
    const member = orgMembers.find((m) => m.userId === userId);
    if (member?.displayName) return member.displayName;
    if (member?.email) {
      const localPart = member.email.split("@")[0];
      return localPart.replace(/[._-]/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    return en ? "Unknown" : "未知";
  }

  const handleTransfer = async (toUserId: string) => {
    await fetch("/api/accounts/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id, toUserId, reason: "transfer" }),
    });
    setShowTransferModal(false);
    window.location.reload();
  };

  const handleReclaim = async () => {
    if (!await appConfirm({ message: en ? "Reclaim this account to the pool?" : "确定将此客户回收到公海？", variant: 'danger' })) return;
    await fetch("/api/accounts/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id, toUserId: null, reason: "reclaim" }),
    });
    window.location.reload();
  };

  const handleAddActivity = async () => {
    if (!activityText.trim()) return;
    await fetch('/api/log-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: account.id,
        activityType,
        title: activityType === 'call' ? (en ? '📞 Call note' : '📞 通话记录') : activityType === 'meeting' ? (en ? '🤝 Meeting note' : '🤝 会议记录') : (en ? '📝 Note' : '📝 备注'),
        description: activityText,
      }),
    });
    setActivityText('');
    setShowAddActivity(false);
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <Link href="/accounts" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted shadow-sm transition-all hover:bg-card hover:text-foreground hover:shadow-md">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 space-y-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">{account.name}</h1>
                  {account.industry && (
                    <span className="inline-flex items-center rounded-lg border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-secondary">
                      {account.industry}
                    </span>
                  )}
                </div>
                {(account.website || account.notes) && (
                  <p className="mt-1 truncate text-xs text-muted">{account.website ?? account.notes}</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                  {l(locale, "负责人", "Owner")} {getOwnerName(account.ownerId ?? account.userId)}
                </span>
                {account.lastActivity && (
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    {l(locale, "最后活动", "Last activity")} {new Date(account.lastActivity).toLocaleDateString(en ? "en-US" : "zh-CN")}
                  </span>
                )}
                {account.dealStage && (
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    {l(locale, "阶段", "Stage")} {en ? account.dealStage.replaceAll('_', ' ') : DEAL_STAGE_LABELS[account.dealStage] ?? account.dealStage}
                  </span>
                )}
                {account.dealValue && (
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 font-mono text-accent">
                    {l(locale, "金额", "Value")} {formatDealValue(account.dealValue)}
                  </span>
                )}
                {account.dealHealth && (
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${HEALTH_CONFIG[account.dealHealth].style}`}>
                    {account.dealHealth === "critical" && <AlertTriangle className="mr-1 h-3 w-3" />}
                    {l(locale, "状态", "Status")} {en ? account.dealHealth.replaceAll('_', ' ') : HEALTH_CONFIG[account.dealHealth].label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleEditToggle}
            aria-expanded={isEditing}
            aria-controls="account-basics-edit-form"
            className="flex items-center gap-1.5 self-start rounded-xl border border-border bg-card px-4 py-2 text-xs font-medium text-secondary shadow-sm transition-all hover:bg-card hover:text-foreground hover:shadow-md"
          >
            <FileText className="h-3.5 w-3.5" />
            {isEditing ? l(locale, "取消编辑", "Cancel edit") : l(locale, "编辑", "Edit")}
          </button>
        </div>
      </div>

      <AccountTeamSummaryStrip
        account={account}
        ownerName={getOwnerName(account.ownerId ?? account.userId)}
        onEditBasics={() => {
          setIsEditing(true);
          handleTabChange('overview');
        }}
        onOpenTeamTab={() => handleTabChange('team')}
      />

      <RoleFocusBanner surface="account" jobLevel={jobLevel} />

      <AccountVisualSnapshot
        account={account}
        activeOpportunities={activeOpportunities}
        decodeCount={accountDecodes.length}
        intelCount={accountIntel.length}
        activeTaskCount={activeTasks.length}
        conflictCount={memoryConflicts.length}
        openQuestionCount={openQuestions.length}
        locale={locale}
      />

      {isEditing && (
        <AccountBasicsPanel
          account={account}
          isEditing={isEditing}
          onEditDone={() => setIsEditing(false)}
          onTransfer={() => setShowTransferModal(true)}
          onReclaim={handleReclaim}
        />
      )}

      {/* 快捷动作栏 */}
      <AccountQuickActions
        accountId={id}
        accountName={account.name}
        onShowActivity={(type) => {
          setActivityType(type);
          setShowAddActivity(true);
          setActiveTab('overview');
        }}
      />

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b-2 border-border">
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`relative flex flex-nowrap whitespace-nowrap items-center gap-1.5 px-3 py-3 text-sm transition-colors sm:px-4 sm:text-[15px] ${
                index < TABS.length - 1 ? "border-r border-border" : ""
              } ${
                isActive
                  ? "-mb-[2px] border-b-2 border-accent font-bold text-accent"
                  : "-mb-[2px] border-b-2 border-transparent font-medium text-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {en ? tab.labelEn : tab.label}
            </button>
          );
        })}
      </div>


      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowTransferModal(false)}>
          <div className="card-elevated mx-3 w-full max-w-sm rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-4">{l(locale, '转让客户', 'Transfer account')}</h3>
            <p className="text-sm text-secondary mb-3">{l(locale, '选择新的负责人：', 'Choose the new owner:')}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {orgMembers
                .filter((m) => m.userId !== (account.ownerId ?? account.userId))
                .map((m) => (
                  <button
                    key={m.userId}
                    onClick={() => handleTransfer(m.userId)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-background transition-colors"
                  >
                    {m.displayName || m.email || m.userId}
                  </button>
                ))}
              {orgMembers.filter((m) => m.userId !== (account.ownerId ?? account.userId)).length === 0 && (
                <p className="text-sm text-muted py-4 text-center">{l(locale, '暂无其他团队成员', 'No other team members')}</p>
              )}
            </div>
            <button
              onClick={() => setShowTransferModal(false)}
              className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-secondary hover:bg-background"
            >
              {l(locale, '取消', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <FadeIn key={activeTab}>
        {activeTab === "overview" && (
          <div className="space-y-4">
            <OverviewDecisionBoard
              account={account}
              aiAnalysis={aiAnalysis}
              aiAnalysisError={aiAnalysisError}
              showAnalyzing={showAnalyzing}
              aiAnalyzing={aiAnalyzing}
              streamingNarrative={visibleBusinessText(streamingNarrative, locale)}
              aiStatusMessage={aiStatusMessage}
              leadJudgment={leadJudgment?.summary}
              riskJudgment={riskJudgment?.summary}
              accountMomentum={accountMomentum}
              activeOpportunities={activeOpportunities}
              nextActions={aiAnalysis?.nextActions ?? []}
              nextTasks={nextTaskItems}
              openQuestions={openQuestions}
              suggestedAskContacts={suggestedAskContacts}
              onRetry={() => { setAiAnalysisError(false); void triggerAIAnalysis(); }}
              onOpenPlays={(prefill) => {
                if (prefill) setPlayPrefill(prefill);
                setActiveTab('plays');
              }}
              onOpenActivity={() => setActiveTab('activity')}
            />

            {showAddActivity ? (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wide">快速记录</p>
                    <p className="mt-1 text-xs text-muted">补充这次互动，首页判断会在下一轮自动吸收这些信号。</p>
                  </div>
                  <button onClick={() => setShowAddActivity(false)} className="rounded-md border border-border px-2.5 py-1 text-xs text-secondary hover:text-foreground hover:bg-background">关闭</button>
                </div>
                <textarea
                  value={activityText}
                  onChange={(e) => setActivityText(e.target.value)}
                  placeholder={activityType === 'call' ? '通话内容摘要...' : activityType === 'meeting' ? '会议纪要...' : '备注内容...'}
                  rows={3}
                  className="form-input w-full resize-none"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowAddActivity(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:text-foreground">取消</button>
                  <button onClick={handleAddActivity} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">保存</button>
                </div>
              </div>
            ) : null}

          </div>
        )}
        {activeTab === "contacts" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{l(locale, '利益相关方分析', 'Stakeholder Analysis')}</h3>
              </div>
              <div className="p-4">
                <DecisionAndStakeholderMap contacts={account.contacts} />
              </div>
            </div>
            <ContactSuggestions contacts={account.contacts} accountId={account.id} dealStage={account.dealStage} />
            <SentimentTrendOverview contacts={account.contacts} />
            <ContactsTab account={account} autoOpenAdd={quickAction === 'add-contact'} />
          </div>
        )}
        {activeTab === "relationship" && <RelationshipIntelligenceTab accountId={id} />}
        {activeTab === "team" && <ProjectTeamCard account={account} />}
        {activeTab === "activity" && (
          <div className="space-y-6">
            <IntelSection
              accountId={id}
              accountName={account.name}
              contacts={account.contacts}
              highlightId={targetKind === 'intel_item' ? targetId : null}
            />
            <MarketIntelTab
              account={account}
              contacts={account.contacts}
              intelItems={accountIntel}
              decodes={accountDecodes}
            />
            <DecodeHistory
              accountId={id}
              accountName={account.name}
              highlightId={targetKind === 'email_decode' ? targetId : null}
            />
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">互动时间线</p>
              <div className="max-h-[600px] overflow-y-auto">
                <UnifiedTimeline
                  accountId={id}
                  highlightId={targetKind === 'integration_email' || targetKind === 'activity_log' ? targetId : null}
                />
              </div>
            </div>
            <MeetingHistory accountId={id} />
          </div>
        )}
        {activeTab === "tasks" && <TaskListSection accountId={id} title="任务" />}
        {activeTab === "plays" && <StrategicPlayTab account={account} opportunities={accountOpportunities} prefill={playPrefill} onPrefillConsumed={() => setPlayPrefill(null)} initialPlayId={searchParams.get("playId") ?? undefined} />}
        {activeTab === "collab" && (
          <div className="space-y-4">
            <CommentThread entityType="account" entityId={id} />
            <HandoffPanel
              accountId={id}
              currentOwnerId={account.ownerId ?? account.userId}
              accountName={account.name}
              onTransferDone={() => window.location.reload()}
            />
          </div>
        )}
        {activeTab === "knowledge" && (
          <KnowledgeTab
            accountId={account.id}
            highlightId={targetKind === 'source_record' ? targetId : null}
          />
        )}
      </FadeIn>
    </div>
  );
}


// ─── Overview Focus Layout Helpers ───────────────────────────────────

function OverviewDecisionBoard({
  account,
  aiAnalysis,
  aiAnalysisError,
  showAnalyzing,
  aiAnalyzing,
  streamingNarrative,
  aiStatusMessage,
  leadJudgment,
  riskJudgment,
  accountMomentum,
  activeOpportunities,
  nextActions,
  nextTasks,
  openQuestions,
  suggestedAskContacts,
  onRetry,
  onOpenPlays,
  onOpenActivity,
}: {
  account: Account;
  aiAnalysis: AIAnalysisResult | null;
  aiAnalysisError: boolean;
  showAnalyzing: boolean;
  aiAnalyzing: boolean;
  streamingNarrative: string;
  aiStatusMessage: string;
  leadJudgment?: string;
  riskJudgment?: string;
  accountMomentum: AccountMomentumSnapshot | null;
  activeOpportunities: Opportunity[];
  nextActions: AIAnalysisResult['nextActions'];
  nextTasks: Task[];
  openQuestions: AccountOpenQuestion[];
  suggestedAskContacts: NonNullable<AccountOpenQuestion['whoToAsk']>[];
  onRetry: () => void;
  onOpenPlays: (prefill?: StrategicPlayPrefill) => void;
  onOpenActivity: () => void;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';

  const primaryQuestion = openQuestions[0];
  const primaryContact = suggestedAskContacts[0]
    ?? primaryQuestion?.whoToAsk
    ?? account.contacts.find((contact) => contact.role && ['champion', 'coach', 'decision_maker', 'economic_buyer', 'executive_sponsor'].includes(contact.role))
    ?? account.contacts[0];
  const primaryAction = nextActions[0];
  const primaryTask = nextTasks[0];
  const currentSituation = visibleBusinessText(
    englishFallback(
      aiAnalysis?.narrative
      ?? accountMomentum?.currentJudgment
      ?? leadJudgment
      ?? l(locale, `${account.name} 还缺少足够客户信号，先补一条真实沟通或会议记录。`, `${account.name} still needs more customer evidence. Add one real conversation or meeting note first.`),
      `${account.name} account judgment is refreshing. Add or review the latest customer evidence before confirming the next move.`,
      locale,
    ),
    locale,
  );
  const riskItems = aiAnalysis?.risks?.length
    ? aiAnalysis.risks.slice(0, 3).map((risk) => ({
      id: risk.title,
      title: risk.title,
      body: risk.detail,
    }))
    : [
      riskJudgment ? { id: 'risk-judgment', title: l(locale, '当前最大风险', 'Current largest risk'), body: riskJudgment } : null,
      ...openQuestions.slice(0, 2).map((question) => ({
        id: question.id,
        title: question.question,
        body: question.whyItMatters,
      })),
    ].filter((item): item is { id: string; title: string; body: string } => Boolean(item));
  const actionTitle = primaryAction?.title ?? primaryTask?.title ?? accountMomentum?.nextAction ?? l(locale, '补一条最新客户信号，让系统重新判断。', 'Add the latest customer evidence so the system can re-judge.');
  const actionReason = primaryAction?.reason
    ?? (primaryTask?.dueDate ? l(locale, `任务到期：${new Date(primaryTask.dueDate).toLocaleDateString('zh-CN')}`, `Task due: ${new Date(primaryTask.dueDate).toLocaleDateString('en-US')}`) : undefined)
    ?? primaryQuestion?.whyItMatters
    ?? l(locale, '没有明确动作时，不继续堆信息，先补最新客户反馈。', 'When the next action is unclear, add the latest customer feedback first.');
  const contactLine = primaryContact
    ? `${primaryContact.name}${primaryContact.title ? ` · ${primaryContact.title}` : ''}`
    : l(locale, '先找到最接近真实决策或一手信息的人。', 'First find the person closest to the real decision or first-hand information.');
  const messageDraft = primaryQuestion
    ? buildVerificationMessage(primaryQuestion)
    : primaryContact
      ? l(locale, `${primaryContact.name}，想跟您确认一下当前推进里最关键的一点：下一步我们应该优先处理哪个风险，才能让内部评估继续往前走？`, `${primaryContact.name}, I want to confirm the most important point in the current process: which risk should we handle first so the internal evaluation can keep moving?`)
      : l(locale, '先补充关键联系人，再生成具体触达内容。', 'Add a key contact first, then generate a specific outreach draft.');
  const composeHref = primaryQuestion
    ? buildVerificationComposeHref(primaryQuestion, account.id)
    : `/compose?${new URLSearchParams({
      accountId: account.id,
      name: primaryContact?.name ?? '',
      title: primaryContact?.title ?? '',
      emailType: 'follow_up',
      goal: `推进 ${account.name} 的下一步动作`,
      draft: messageDraft,
      autoGenerate: '1',
    }).toString()}`;
  const suggestedPlayPrefill: StrategicPlayPrefill = {
    goalType: 'reach_key_person',
    goalDescription: actionTitle,
    successCriteria: primaryContact
      ? `与 ${primaryContact.name} 对齐下一步，并获得可验证的客户承诺或明确反馈。`
      : '获得可验证的客户承诺或明确反馈，让当前判断可以继续推进。',
    opportunityId: activeOpportunities[0]?.id,
    additionalContext: [
      '来源：客户全景「下一步」建议',
      `客户：${account.name}`,
      `当前情况：${currentSituation}`,
      `下一步原因：${actionReason}`,
      primaryContact ? `建议联系：${contactLine}` : '',
      primaryQuestion?.question ? `待确认问题：${primaryQuestion.question}` : '',
      messageDraft ? `建议触达话术：${messageDraft}` : '',
    ].filter(Boolean).join('\n'),
  };
  const playAssumption = primaryQuestion?.question
    || l(locale, '先确认最新客户证据是否改变当前下一步。', 'Confirm whether the latest customer evidence changes the next move.');
  const playPrefillWithAssumption: StrategicPlayPrefill = {
    ...suggestedPlayPrefill,
    additionalContext: [
      suggestedPlayPrefill.additionalContext,
      '',
      l(locale, '谋局前需确认的假设：', 'Assumption to validate before creating the play:'),
      playAssumption,
    ].filter(Boolean).join('\n'),
  };

  if (aiAnalysisError) {
    return (
      <div className="rounded-2xl border border-warning/20 bg-warning/[0.04] p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <p className="text-sm font-medium text-warning">{l(locale, '客户局势分析暂时不可用', 'Account situation analysis is temporarily unavailable')}</p>
          <button type="button" onClick={onRetry} className="ml-auto text-xs font-medium text-accent hover:underline">{l(locale, '重试', 'Retry')}</button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{l(locale, '客户全景', 'Account Overview')}</p>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{l(locale, '当前情况、风险和下一步', 'Current situation, risk, and next move')}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onOpenPlays()} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">{l(locale, '去谋局', 'Open plays')}</button>
            <Link href={composeHref} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">{l(locale, '写给对方', 'Write outreach')}</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          <div className="rounded-xl border border-accent/20 bg-accent/[0.04] px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{l(locale, '情况', 'Situation')}</p>
            {showAnalyzing ? (
              <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-accent">
                <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin" />
                <span>{accountAnalysisStatusText(aiStatusMessage, locale) || (aiAnalyzing ? l(locale, '正在生成客户局势分析...', 'Generating account situation analysis...') : l(locale, '正在加载账户判断...', 'Loading account judgment...'))}</span>
              </div>
            ) : (
              <p className="mt-2 text-base leading-8 text-foreground">{currentSituation}</p>
            )}
            {streamingNarrative ? <p className="mt-3 text-sm leading-6 text-foreground">{visibleBusinessText(englishFallback(streamingNarrative, 'Building an updated account judgment from the latest evidence...', locale), locale)}<span className="inline-block h-4 w-1.5 animate-pulse bg-accent/60 align-text-bottom" /></p> : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-warning/20 bg-warning/[0.035] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">{l(locale, '风险', 'Risk')}</p>
              <div className="mt-3 space-y-3">
                {riskItems.length > 0 ? riskItems.map((risk) => (
                  <div key={risk.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                    <p className="text-sm font-semibold leading-5 text-foreground">{visibleBusinessText(risk.title, locale)}</p>
                    <p className="mt-1 text-xs leading-5 text-secondary">{visibleBusinessText(risk.body, locale)}</p>
                  </div>
                )) : (
                  <p className="text-sm leading-6 text-muted">{l(locale, '当前没有明确风险；用下一次客户反馈确认判断没有过期。', 'No clear risk yet; use the next customer feedback to confirm the judgment is still current.')}</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-positive/20 bg-positive/[0.035] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-positive">{l(locale, '下一步', 'Next move')}</p>
              <p className="mt-3 text-base font-semibold leading-7 text-foreground">{visibleBusinessText(actionTitle, locale)}</p>
              <p className="mt-2 text-sm leading-6 text-secondary">{visibleBusinessText(actionReason, locale)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => onOpenPlays(playPrefillWithAssumption)} className="rounded-lg border border-positive/30 bg-card px-3 py-1.5 text-xs font-medium text-positive hover:bg-positive/10">{l(locale, '做成谋局动作', 'Create play action')}</button>
                <button type="button" onClick={onOpenActivity} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">{l(locale, '补客户信号', 'Add customer evidence')}</button>
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-border bg-muted/10 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{l(locale, '问谁', 'Who to ask')}</p>
              <p className="mt-2 text-base font-semibold text-foreground">{visibleBusinessText(contactLine, locale)}</p>
              {primaryQuestion?.question ? (
                <p className="mt-2 text-sm leading-6 text-secondary">{l(locale, '要确认：', 'Confirm: ')}{visibleBusinessText(primaryQuestion.question, locale)}</p>
              ) : (
                <p className="mt-2 text-sm leading-6 text-secondary">{l(locale, '目标是拿到一手判断，不是同时追问所有信息。', 'The goal is to get first-hand judgment, not ask for everything at once.')}</p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{l(locale, '怎么说', 'What to say')}</p>
              <p className="mt-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-sm leading-6 text-foreground">{visibleBusinessText(messageDraft, locale)}</p>
              <Link href={composeHref} className="mt-3 inline-flex rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">{l(locale, '打开写信', 'Open compose')}</Link>
            </div>

            <div className="rounded-xl border border-border bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{l(locale, '背景', 'Context')}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border bg-background px-2 py-2">
                  <p className="text-lg font-semibold text-foreground">{activeOpportunities.length}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{l(locale, '商机', 'Deals')}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-2 py-2">
                  <p className="text-lg font-semibold text-foreground">{account.contacts.length}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{l(locale, '联系人', 'Contacts')}</p>
                </div>
                <div className="rounded-lg border border-border bg-background px-2 py-2">
                  <p className="text-lg font-semibold text-foreground">{openQuestions.length}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{l(locale, '待验证', 'To verify')}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}



function OverviewAIAnalysisCard({
  aiAnalysis,
  aiAnalysisError,
  showAnalyzing,
  aiAnalyzing,
  aiNarrativeOpen,
  streamingNarrative,
  aiStatusMessage,
  onToggle,
  onRetry,
}: {
  aiAnalysis: AIAnalysisResult | null;
  aiAnalysisError: boolean;
  showAnalyzing: boolean;
  aiAnalyzing: boolean;
  aiNarrativeOpen: boolean;
  streamingNarrative: string;
  aiStatusMessage: string;
  onToggle: () => void;
  onRetry: () => void;
}) {
  if (aiAnalysis) {
    return (
      <div className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 shadow-sm sm:p-5">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-start gap-3 text-left"
          aria-expanded={aiNarrativeOpen}
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">客户局势分析</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">这家客户现在到底是什么局面</h2>
          </div>
          <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-accent transition-transform ${aiNarrativeOpen ? 'rotate-90' : ''}`} />
        </button>

        {aiNarrativeOpen ? (
          <div className="mt-4 space-y-4 border-t border-accent/10 pt-4">
            <p className="text-base leading-8 text-foreground">{visibleBusinessText(aiAnalysis.narrative)}</p>
            {aiAnalysis.stakeholderSummary ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">关键人怎么理解</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(aiAnalysis.stakeholderSummary)}</p>
              </div>
            ) : null}
            {aiAnalysis.momentum?.reason ? (
              <div className="rounded-xl border border-accent/15 bg-card px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">为什么局势是「{aiAnalysis.momentum.label}」</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(aiAnalysis.momentum.reason)}</p>
              </div>
            ) : null}
            {aiAnalysis.previousAnalysis && aiAnalysis.previousAnalysis.momentum.status !== aiAnalysis.momentum.status ? (
              <p className="rounded-xl border border-warning/20 bg-warning/[0.04] px-4 py-3 text-sm leading-6 text-foreground">
                判断变化：从「{aiAnalysis.previousAnalysis.momentum.label}」变为「{aiAnalysis.momentum.label}」。{visibleBusinessText(aiAnalysis.momentum.reason)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (aiAnalysisError) {
    return (
      <div className="rounded-2xl border border-warning/20 bg-warning/[0.04] p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <p className="text-sm font-medium text-warning">客户局势分析暂时不可用</p>
          <button type="button" onClick={onRetry} className="ml-auto text-xs font-medium text-accent hover:underline">重试</button>
        </div>
      </div>
    );
  }

  if (showAnalyzing) {
    return (
      <div className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <p className="text-sm font-medium text-accent">{aiStatusMessage || (aiAnalyzing ? '正在生成客户局势分析...' : '正在加载账户判断...')}</p>
        </div>
        {streamingNarrative ? (
          <p className="mt-3 text-sm leading-6 text-foreground">{visibleBusinessText(streamingNarrative)}<span className="inline-block h-4 w-1.5 animate-pulse bg-accent/60 align-text-bottom" /></p>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-accent/10" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-accent/10" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-accent/10" />
          </div>
        )}
      </div>
    );
  }

  return null;
}

function OverviewVerificationPanel({
  accountId,
  openQuestions,
  aiOpenQuestions,
  verificationSignals,
  loading,
}: {
  accountId?: string;
  openQuestions: AccountOpenQuestion[];
  aiOpenQuestions: string[];
  verificationSignals: AccountVerificationSignal[];
  loading: boolean;
}) {
  const seenVerification = new Set<string>();
  const visibleQuestions = openQuestions.filter((question) => {
    const key = question.question.replace(/\s+/g, ' ').slice(0, 120);
    if (seenVerification.has(key)) return false;
    seenVerification.add(key);
    return true;
  }).slice(0, 3);
  const visibleSignals = verificationSignals.filter((signal) => {
    const key = signal.summary.replace(/\s+/g, ' ').slice(0, 120);
    if (seenVerification.has(key)) return false;
    seenVerification.add(key);
    return true;
  }).slice(0, Math.max(0, 4 - visibleQuestions.length));

  return (
    <div className="rounded-2xl border border-warning/20 bg-warning/[0.035] p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">关键矛盾 / 待验证信号</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">推进前必须搞清楚什么</h2>
      </div>

      <div className="mt-4 space-y-3">
        {visibleQuestions.map((question) => (
          <div key={question.id} className="rounded-xl border border-warning/20 bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERIFICATION_PRIORITY_CLASS[question.priority]}`}>
                {VERIFICATION_PRIORITY_LABEL[question.priority]}
              </span>
              {question.whoToAsk?.name ? <span className="text-[11px] text-secondary">建议问：{question.whoToAsk.name}</span> : null}
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-foreground">{visibleBusinessText(question.question)}</p>
            <p className="mt-1 text-xs leading-5 text-secondary">为什么重要：{visibleBusinessText(question.whyItMatters)}</p>
            <div className="mt-2 space-y-2 rounded-lg border border-warning/15 bg-warning/[0.04] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-warning">怎么发</p>
                <Link
                  href={buildVerificationComposeHref(question, accountId)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  <Sparkles className="h-3 w-3" />
                  写邮件并自动生成
                </Link>
              </div>
              <p className="text-sm leading-6 text-foreground">{buildVerificationChannel(question)}</p>
              <p className="text-[11px] font-semibold text-warning">建议发送内容</p>
              <p className="rounded-md border border-border bg-background/70 px-3 py-2 text-sm leading-6 text-foreground">{buildVerificationMessage(question)}</p>
            </div>
          </div>
        ))}

        {visibleSignals.map((signal) => (
          <div key={signal.id} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERIFICATION_PRIORITY_CLASS[signal.severity]}`}>
                {VERIFICATION_PRIORITY_LABEL[signal.severity]}
              </span>
              <span className="text-[11px] text-secondary">{signal.typeLabel}</span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-foreground">{visibleBusinessText(signal.summary)}</p>
            <p className="mt-2 rounded-lg border border-warning/15 bg-warning/[0.04] px-3 py-2 text-sm leading-6 text-foreground">建议验证动作：{visibleBusinessText(signal.suggestedAction)}</p>
          </div>
        ))}

        {visibleQuestions.length === 0 && visibleSignals.length === 0 && aiOpenQuestions.length > 0 ? (
          <div className="space-y-2">
            {aiOpenQuestions.slice(0, 4).map((question, index) => (
              <p key={`${index}-${visibleBusinessText(question)}`} className="rounded-xl border border-warning/20 bg-card px-4 py-3 text-sm leading-6 text-foreground">{visibleBusinessText(question)}</p>
            ))}
          </div>
        ) : null}

        {visibleQuestions.length === 0 && visibleSignals.length === 0 && aiOpenQuestions.length === 0 ? (
          loading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-accent">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在分析待验证信号...
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">当前没有明确待验证矛盾；继续用下一次客户反馈校准判断。</p>
          )
        ) : null}
      </div>
    </div>
  );
}

function OverviewDealSummary({
  account,
  activeOpportunities,
  activeTasksCount,
  topTimelineCount,
  riskSummary,
  momentumSummary,
  onOpenPlays,
}: {
  account: Account;
  activeOpportunities: Opportunity[];
  activeTasksCount: number;
  topTimelineCount: number;
  riskSummary?: string;
  momentumSummary?: string;
  onOpenPlays: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">客户局势摘要</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">和当前局势判断有关的推进状态</h2>
        </div>
        <button
          type="button"
          onClick={onOpenPlays}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/20"
        >
          去谋局页
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          {activeOpportunities.length > 0 ? activeOpportunities.slice(0, 3).map((opp) => (
            <Link key={opp.id} href={`/pipeline/${opp.id}`}>
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{opp.name}</p>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    {DEAL_STAGE_LABELS[opp.stage] ?? opp.stage}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">{formatDealValue(opp.value)} · 证据健康度 {opp.meddicc?.overallScore ?? 0}</p>
              </div>
            </Link>
          )) : (
            <p className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted">当前没有活跃商机，先沉淀判断并补齐下一步动作。</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted">活跃商机</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{activeOpportunities.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted">待办动作</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{activeTasksCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted">最近变化</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{topTimelineCount}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">局势风险提示</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{visibleBusinessText(riskSummary ?? momentumSummary ?? `继续围绕 ${account.name} 补充最新客户反馈。`)}</p>
          {momentumSummary && riskSummary ? <p className="mt-2 text-xs leading-5 text-muted">{visibleBusinessText(momentumSummary)}</p> : null}
        </div>
      </div>
    </div>
  );
}

function OverviewActionSidebar({
  comparisonWindow,
  onComparisonWindowChange,
  showAnalyzing,
  aiAnalyzing,
  aiAnalysisReady,
  onTriggerAIAnalysis,
  nextActions,
  nextTasks,
  suggestedAskContacts,
  openQuestions,
  recentAccountDecodes,
  onOpenActivity,
  onOpenPlays,
  onOpenJudgmentBoard,
  onNavigateToDecode,
}: {
  comparisonWindow: ComparisonWindow;
  onComparisonWindowChange: (nextWindow: ComparisonWindow) => void;
  showAnalyzing: boolean;
  aiAnalyzing: boolean;
  aiAnalysisReady: boolean;
  onTriggerAIAnalysis: () => void;
  nextActions: AIAnalysisResult['nextActions'];
  nextTasks: Task[];
  suggestedAskContacts: NonNullable<AccountOpenQuestion['whoToAsk']>[];
  openQuestions: AccountOpenQuestion[];
  recentAccountDecodes: SavedDecode[];
  onOpenActivity: () => void;
  onOpenPlays: () => void;
  onOpenJudgmentBoard: () => void;
  onNavigateToDecode: (decodeId: string) => void;
}) {
  const actionItems = nextActions.length > 0
    ? nextActions.slice(0, 3).map((action) => ({ id: action.title, title: action.title, detail: action.reason }))
    : nextTasks.slice(0, 3).map((task) => ({ id: task.id, title: task.title, detail: task.dueDate ? `到期 ${new Date(task.dueDate).toLocaleDateString('zh-CN')}` : '待排期' }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">今天先做什么</h3>
        <div className="mt-3 space-y-2">
          {actionItems.length > 0 ? actionItems.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
              <p className="text-sm font-medium leading-5 text-foreground">{visibleBusinessText(item.title)}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{visibleBusinessText(item.detail)}</p>
            </div>
          )) : (
            <p className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-muted">暂无明确动作；先补一次最新客户沟通。</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onOpenPlays} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">去谋局</button>
          <button type="button" onClick={onOpenJudgmentBoard} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">修正判断</button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">下次该问谁</h3>
        <div className="mt-3 space-y-2">
          {suggestedAskContacts.length > 0 ? suggestedAskContacts.map((person, index) => (
            <div key={`${person.name}-${index}`} className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">{person.name}</p>
              {person.title ? <p className="mt-0.5 text-xs text-muted">{visibleBusinessText(person.title)}</p> : null}
            </div>
          )) : openQuestions.length > 0 ? (
            <p className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-muted">先围绕待验证问题找到能拍板或能提供一手信息的人。</p>
          ) : (
            <p className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-muted">暂无明确对象；优先补关键联系人角色。</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">最近客户信号</h3>
          <button type="button" onClick={onOpenActivity} className="text-[11px] font-medium text-accent hover:underline">查看全部</button>
        </div>
        <div className="mt-3 space-y-2">
          {recentAccountDecodes.length > 0 ? recentAccountDecodes.slice(0, 3).map((decode) => {
            const risk = decode.decode.threadAnalysis?.riskLevel;
            const riskClass = risk === 'critical' || risk === 'high'
              ? 'border-danger/20 bg-danger/5 text-danger'
              : risk === 'medium'
                ? 'border-warning/20 bg-warning/5 text-warning'
                : 'border-positive/20 bg-positive/5 text-positive';
            return (
              <button
                key={decode.id}
                type="button"
                onClick={() => onNavigateToDecode(decode.id)}
                className="w-full rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.03]"
              >
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${riskClass}`}>{DECODE_SOURCE_LABELS[decode.signalSource || 'email']?.zh ?? '客户信号'}</span>
                <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-foreground">{visibleBusinessText(decode.decode.threadAnalysis?.keySignal || decode.emailText.slice(0, 100))}</p>
              </button>
            );
          }) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted">暂无已沉淀信号。</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-base font-semibold text-foreground">辅助操作</h3>
        <div className="mt-3 space-y-3">
          <button
            type="button"
            disabled={aiAnalyzing || showAnalyzing}
            onClick={onTriggerAIAnalysis}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {aiAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiAnalysisReady ? '重新生成战略分析' : '生成战略分析'}
          </button>
          <div>
            <p className="text-[11px] text-muted">观察窗口</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COMPARISON_WINDOW_OPTIONS.map((option) => {
                const active = comparisonWindow === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onComparisonWindowChange(option.value)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-secondary hover:text-foreground'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sentiment Trend Overview ────────────────────────────────────────

function SentimentTrendOverview({ contacts }: { contacts: Contact[] }) {
  const keyContacts = contacts.filter(c =>
    c.role && ['decision_maker', 'champion', 'influencer', 'technical_evaluator', 'blocker'].includes(c.role)
  ).slice(0, 3);

  if (keyContacts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide">关键联系人态度趋势</h3>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {keyContacts.map(c => (
          <SentimentTrend key={c.id} contactId={c.id} contactName={c.name} />
        ))}
      </div>
    </div>
  );
}
