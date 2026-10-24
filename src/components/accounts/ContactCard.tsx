"use client";

import { useEffect, useState } from "react";
import type { LinkedInResearchResult } from "@/types/linkedin-research";
import {
  Plus,
  X,
  ChevronRight,
  Trash2,
  Sparkles,
  Loader2,
  Send,
  TrendingUp,
  Check,
  Search,
  MessageSquare,
  RefreshCw,
  Brain,
  Pencil,
  AlertTriangle,
  Radio,
  Users,
  Mail,
  FileText,
  CheckCircle2,
  Save,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import { appConfirm } from '@/lib/confirm-store';
import {
  PROFILE_DECISION_STYLE_LABELS,
  PROFILE_FORMALITY_LABELS,
  PROFILE_LENGTH_LABELS,
  PROFILE_RISK_LABELS,
  localizeProfileFreeText,
  profileDisplayValue,
} from '@/lib/contact-profile-display';
import { friendlyError } from "@/lib/error-helper";
import type {
  Account,
  Contact,
  ContactRole,
  IntelItem,
  ContactProfileResult,
  EmailType,
} from "@/lib/babel-engine/types";
import { STAGE_LABELS } from "@/lib/babel-engine/types";
import { AttitudeTrendChart } from "@/components/contacts/attitude-trend-chart";
import { CommunicationTimeline } from "@/components/contacts/communication-timeline";
import { OrgMap } from "@/components/org-map/org-map";
import {
  ROLE_CONFIG,
  CONTACT_ROLES,
  EMAIL_TYPE_OPTIONS,
  SOURCE_LABELS,
  inputFieldClass,
  selectFieldClass,
  timeAgo,
  CopyButton,
} from "./shared";
import { ContactForm } from "./ContactForm";
import { UrgencyBadge } from "./IntelSection";

function ProfileGenerationModal({
  accountId,
  contact,
  onClose,
}: {
  accountId: string;
  contact: Contact;
  onClose: () => void;
}) {
  const { updateContact, intelItems } = useStore();
  const relatedIntel = intelItems.filter((i) => (i.relatedContactIds ?? []).includes(contact.id));
  const [records, setRecords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (records.trim().length < 30) return;
    setLoading(true);
    setError(null);
    try {
      const relatedIntelTexts = relatedIntel.map(
        (i) => `[${SOURCE_LABELS[i.source] ?? i.source}] ${i.content}${i.analysis ? `\nAI分析：${i.analysis.implications}` : ""}`
      );
      const res = await fetch("/api/contact-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: {
            name: contact.name,
            title: contact.title,
            role: contact.role,
            department: contact.department,
            email: contact.email,
          },
          communicationRecords: records.trim(),
          relatedIntel: relatedIntelTexts.length > 0 ? relatedIntelTexts : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const result: ContactProfileResult = await res.json();
      const recordCount = records.split(/\n\n+/).filter((s) => s.trim().length > 0).length || 1;
      updateContact(accountId, contact.id, {
        contactProfile: {
          ...result,
          generatedAt: new Date().toISOString(),
          basedOnCount: recordCount,
          basedOnIntelCount: relatedIntel.length,
        },
      });
      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="mx-3 sm:mx-0 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6" style={{ boxShadow: 'var(--shadow-floating)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            <Brain className="mr-2 inline h-4 w-4 text-accent" />
            生成心理画像 — {contact.name}
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-background hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {relatedIntel.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-accent/10 bg-accent/[0.02] px-3 py-2 text-xs text-accent">
              <Radio className="h-3.5 w-3.5" />
              将自动包含 {relatedIntel.length} 条相关情报进行综合分析
            </div>
          )}

          <textarea
            value={records}
            onChange={(e) => setRecords(e.target.value)}
            placeholder="粘贴与该联系人的邮件/沟通记录（至少 30 字）..."
            className="min-h-[200px] w-full resize-none rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150"
          />

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border border-border bg-sidebar p-3">
                  <div className="skeleton h-4 w-24 rounded mb-2" />
                  <div className="skeleton h-3 w-full rounded mb-1" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-foreground">
              取消
            </button>
            <button
              onClick={handleGenerate}
              disabled={records.trim().length < 30 || loading}
              className="flex items-center gap-2 rounded-lg bg-[#C41E3A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#A01830] disabled:pointer-events-none disabled:opacity-40"
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />生成中...</> : <><Brain className="h-4 w-4" />生成心理画像</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function ContactProfileDisplay({ profile }: { profile: ContactProfileResult }) {
  const STYLE_MAP = PROFILE_DECISION_STYLE_LABELS;
  const RISK_COLORS: Record<string, string> = {
    aggressive: "bg-danger/10 text-danger border-danger/20",
    moderate: "bg-warning/10 text-warning border-warning/20",
    cautious: "bg-positive/10 text-positive border-positive/20",
  };
  const RISK_LABELS_MAP = PROFILE_RISK_LABELS;

  return (
    <div className="space-y-3">
      {/* Decision Style */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">决策风格</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(["analytical", "driver", "amiable", "expressive"] as const).map((style) => {
            const isMatch = profile.decisionStyle.type === style;
            return (
              <div
                key={style}
                className={`rounded-lg border p-2 text-center text-xs font-medium transition-colors ${
                  isMatch
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-background text-muted"
                }`}
              >
                {STYLE_MAP[style]}
                {isMatch && (
                  <p className="mt-0.5 text-xs font-mono">{Math.round(profile.decisionStyle.confidence * 100)}%</p>
                )}
              </div>
            );
          })}
        </div>
        {profile.decisionStyle.evidence && (
          <p className="mt-1.5 text-xs text-muted">{profile.decisionStyle.evidence}</p>
        )}
      </div>

      {/* Risk Appetite */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">风险偏好</p>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RISK_COLORS[profile.riskAppetite] ?? ""}`}>
          {RISK_LABELS_MAP[profile.riskAppetite] ?? profile.riskAppetite}
        </span>
      </div>

      {/* Communication Preferences */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">沟通偏好</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-card p-2">
            <span className="text-secondary">回复速度</span>
            <p className="font-medium text-foreground">{profile.communication.responseSpeed}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2">
            <span className="text-secondary">长度偏好</span>
            <p className="font-medium text-foreground">{profileDisplayValue(profile.communication.lengthPreference, PROFILE_LENGTH_LABELS)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2">
            <span className="text-secondary">正式度</span>
            <p className="font-medium text-foreground">{profileDisplayValue(profile.communication.formality, PROFILE_FORMALITY_LABELS)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-2">
            <span className="text-secondary">最佳联系时间</span>
            <p className="font-medium text-foreground">{profile.communication.bestContactTime}</p>
          </div>
        </div>
      </div>

      {/* Positive Triggers */}
      {profile.positiveTriggers.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-positive">正面触发点</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.positiveTriggers.map((t, i) => (
              <span key={i} className="inline-flex items-center rounded-full border border-positive/20 bg-positive/5 px-2.5 py-0.5 text-xs text-foreground">
                {localizeProfileFreeText(t)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Negative Triggers & Landmines */}
      {(profile.negativeTriggers.length > 0 || profile.landmines.length > 0) && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-danger">负面触发 / 地雷</p>
          <div className="flex flex-wrap gap-1.5">
            {[...profile.negativeTriggers, ...profile.landmines].map((t, i) => (
              <span key={i} className="inline-flex items-center rounded-full border border-danger/20 bg-danger/5 px-2.5 py-0.5 text-xs text-foreground">
                {localizeProfileFreeText(t)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Engagement Tips */}
      {profile.engagementTips.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-accent">沟通建议</p>
          <ol className="space-y-1">
            {profile.engagementTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent/15 text-xs font-bold text-accent">{i + 1}</span>
                {localizeProfileFreeText(tip)}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-muted border-t border-border pt-2">
        基于 {profile.basedOnCount} 段沟通记录{profile.basedOnIntelCount ? ` + ${profile.basedOnIntelCount} 条相关情报` : ""} | 生成于 {new Date(profile.generatedAt).toLocaleDateString("zh-CN")}
      </p>
    </div>
  );
}


function ContactRelatedIntel({ contactId, intelItems }: { contactId: string; intelItems: IntelItem[] }) {
  const related = intelItems.filter((i) => (i.relatedContactIds ?? []).includes(contactId));
  const [expandedIntelId, setExpandedIntelId] = useState<string | null>(null);

  if (related.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
        <FileText className="h-3 w-3" />
        相关情报 ({related.length})
      </p>
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
        {related.map((intel) => {
          const isExpanded = expandedIntelId === intel.id;
          return (
            <div
              key={intel.id}
              className="rounded-lg border border-border bg-card p-2.5 text-xs transition-colors hover:border-border-subtle cursor-pointer"
              onClick={() => setExpandedIntelId(isExpanded ? null : intel.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">{SOURCE_LABELS[intel.source] ?? intel.source}</span>
                  <span className="text-xs text-muted">{timeAgo(intel.date)}</span>
                  <UrgencyBadge urgency={intel.urgency} />
                </div>
                <ChevronRight className={`h-3 w-3 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </div>
              <p className={`mt-1 text-foreground leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                {intel.content}
              </p>
              {isExpanded && intel.analysis && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-accent/10 bg-accent/[0.02] p-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">AI 分析</p>
                  <p className="text-xs leading-relaxed text-secondary">{intel.analysis.implications}</p>
                  {intel.analysis.suggestedActions.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {intel.analysis.suggestedActions.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                          <span className="mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-accent/15 text-[10px] font-bold text-accent">{i + 1}</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function ContactsTab({ account, focusContactId, autoOpenAdd = false }: { account: Account; focusContactId?: string; autoOpenAdd?: boolean }) {
  const { deleteContact, updateContact, intelItems, emailDecodes, addComposedEmail, updateComposedEmail, knowledgeItems, opportunities } = useStore();
  const { locale } = useLocale();
  const en = locale === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(focusContactId ?? account.contacts[0]?.id ?? null);
  const [viewMode, setViewMode] = useState<"list" | "org">("list");
  const [profileGenContactId, setProfileGenContactId] = useState<string | null>(null);
  const [composingContactId, setComposingContactId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpenAdd) {
      setShowAdd(true);
    }
  }, [autoOpenAdd]);
  const [editForm, setEditForm] = useState({
    name: "", title: "", email: "", phone: "", mobilePhone: "", reportsTo: "", department: "",
    linkedin: "", wechat: "", twitter: "",
    location: "", timezone: "", preferredChannel: "" as string, preferredLanguage: "",
    personalNotes: "",
  });

  // LinkedIn research state
  const [linkedinResearchContactId, setLinkedinResearchContactId] = useState<string | null>(null);
  const [savedLinkedinProfile, setSavedLinkedinProfile] = useState<Set<string>>(new Set());
  const [linkedinResearching, setLinkedinResearching] = useState(false);
  const [linkedinResearchResult, setLinkedinResearchResult] = useState<LinkedInResearchResult | null>(null);
  const [linkedinResearchError, setLinkedinResearchError] = useState<string | null>(null);

  // Email composer state
  const [emailType, setEmailType] = useState<EmailType>("follow_up");
  const [emailGoal, setEmailGoal] = useState("");
  const [emailContext, setEmailContext] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeResult, setComposeResult] = useState<{ subject: string; body: string; sendingAdvice: string; suggestedCc?: string[] } | null>(null);
  const [lastComposedEmailId, setLastComposedEmailId] = useState<string | null>(null);
  const [showSentModal, setShowSentModal] = useState(false);
  const [sentFinalContent, setSentFinalContent] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);

  // Compute interaction status for contacts
  function getContactInteraction(contact: Contact) {
    const relatedIntel = intelItems.filter(
      (i) => i.accountId === account.id && i.relatedContactIds.includes(contact.id)
    );
    const relatedDecodes = emailDecodes.filter(
      (d) => d.accountId === account.id && d.clientName?.includes(contact.name)
    );

    const dates = [
      ...relatedIntel.map((i) => new Date(i.date).getTime()),
      ...relatedDecodes.map((d) => new Date(d.date).getTime()),
    ];
    const lastDate = dates.length > 0 ? Math.max(...dates) : null;
    const daysSince = lastDate ? Math.floor((Date.now() - lastDate) / 86400000) : null;

    let status: "active" | "follow_up" | "silent" | "never";
    if (daysSince === null) status = "never";
    else if (daysSince <= 7) status = "active";
    else if (daysSince <= 14) status = "follow_up";
    else status = "silent";

    return { lastDate: lastDate ? new Date(lastDate).toISOString() : null, daysSince, status };
  }

  const STATUS_CONFIG = {
    active: { dot: "bg-green-500", label: t("活跃", "Active"), textStyle: "text-green-700" },
    follow_up: { dot: "bg-yellow-500", label: t("需跟进", "Needs follow-up"), textStyle: "text-yellow-700" },
    silent: { dot: "bg-red-500", label: t("沉默", "Silent"), textStyle: "text-red-700" },
    never: { dot: "bg-gray-800", label: t("从未联系", "Never contacted"), textStyle: "text-gray-600" },
  };

  const roleLabel = (role: ContactRole | undefined | null) => {
    const key = role ?? "unknown";
    if (!en) return ROLE_CONFIG[key]?.label ?? ROLE_CONFIG.unknown.label;
    const labels: Partial<Record<ContactRole, string>> = {
      decision_maker: "Decision Maker",
      economic_buyer: "Economic Buyer",
      executive_sponsor: "Executive Sponsor",
      champion: "Champion",
      coach: "Coach",
      influencer: "Influencer",
      external_advisor: "External Advisor",
      consultant: "Consultant",
      channel_influencer: "Channel Influencer",
      project_manager: "Project Manager",
      technical_evaluator: "Technical Evaluator",
      it_admin: "IT Admin",
      procurement: "Procurement",
      legal: "Legal",
      finance: "Finance",
      operations: "Operations",
      blocker: "Blocker",
      gate_keeper: "Gatekeeper",
      committee_member: "Committee Member",
      end_user: "End User",
      contact: "Contact",
      unknown: "Unknown",
    };
    return labels[key] ?? key;
  };

  const roleOptionLabel = (role: ContactRole) => `${ROLE_CONFIG[role]?.icon ?? ''} ${roleLabel(role)}`.trim();
  const channelLabel = (channel: NonNullable<Contact['preferredChannel']>) => ({
    email: t('邮件', 'Email'),
    phone: t('电话', 'Phone'),
    wechat: t('微信', 'WeChat'),
    teams: 'Teams',
    in_person: t('当面', 'In person'),
  }[channel]);

  // LinkedIn research handler
  async function handleLinkedinResearch(contact: Contact) {
    if (!contact.linkedin) return;
    setLinkedinResearchContactId(contact.id);
    setLinkedinResearching(true);
    setLinkedinResearchError(null);
    setLinkedinResearchResult(null);
    try {
      const url = contact.linkedin.startsWith("http")
        ? contact.linkedin
        : `https://linkedin.com/in/${contact.linkedin}`;
      const res = await fetch("/api/linkedin-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url, outputLocale: locale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const result: LinkedInResearchResult = await res.json();
      setLinkedinResearchResult(result);
    } catch (err) {
      setLinkedinResearchError(err instanceof Error ? err.message : "调研失败");
    } finally {
      setLinkedinResearching(false);
    }
  }

  // Compose email handler
  async function handleComposeEmail(contact: Contact) {
    setComposing(true);
    setComposeError(null);
    setComposeResult(null);

    try {
      const accountOpps = opportunities.filter((o) => o.accountId === account.id);
      const relatedIntel = intelItems.filter((i) => i.accountId === account.id).slice(0, 5);
      const relatedDecodes = emailDecodes.filter((d) => d.accountId === account.id).slice(0, 3);
      const productKb = knowledgeItems.filter((k) => k.category === "company_info" || k.category === "competitor").slice(0, 2);

      const STYLE_LABELS_MAP: Record<string, string> = { analytical: "分析型", driver: "驱动型", amiable: "亲和型", expressive: "表现型" };
      const APPETITE_LABELS_MAP: Record<string, string> = { aggressive: "冒险", moderate: "谨慎", cautious: "规避" };
      const ROLE_LABELS_MAP: Record<string, string> = { decision_maker: "决策者", champion: "推动者", technical_evaluator: "技术评估", influencer: "影响者", blocker: "阻碍者", end_user: "终端用户", contact: "联系人" };

      const profileParts: string[] = [];
      if (contact.decisionStyle) profileParts.push(`决策风格：${STYLE_LABELS_MAP[contact.decisionStyle] ?? contact.decisionStyle}`);
      if (contact.riskAppetite) profileParts.push(`风险偏好：${APPETITE_LABELS_MAP[contact.riskAppetite] ?? contact.riskAppetite}`);
      if (contact.communicationNotes) profileParts.push(`沟通偏好：${contact.communicationNotes}`);
      if (contact.landmines) profileParts.push(`地雷/禁忌：${contact.landmines}`);
      if (contact.contactProfile) {
        const cp = contact.contactProfile;
        profileParts.push(`AI 画像 — 决策风格：${STYLE_LABELS_MAP[cp.decisionStyle.type] ?? cp.decisionStyle.type}（置信度 ${Math.round(cp.decisionStyle.confidence * 100)}%）`);
        if (cp.positiveTriggers.length) profileParts.push(`积极触发：${cp.positiveTriggers.join("、")}`);
        if (cp.negativeTriggers.length) profileParts.push(`防御触发：${cp.negativeTriggers.join("、")}`);
        if (cp.landmines.length) profileParts.push(`地雷词：${cp.landmines.join("、")}`);
        if (cp.engagementTips.length) profileParts.push(`接触建议：${cp.engagementTips.join("；")}`);
      }

      const dealParts = accountOpps.map((o) => {
        const stageLbl = STAGE_LABELS[o.stage] ?? o.stage;
        return `${o.name} — 阶段：${stageLbl}，金额：${o.currency === "CNY" ? "¥" : "$"}${o.value.toLocaleString()}，MEDDICC ${o.meddicc.overallScore}/100`;
      }).join("\n");

      const intelParts = relatedIntel.map((i) => `[${i.title}] ${i.content.slice(0, 200)}`).join("\n");
      const decodeParts = relatedDecodes.map((d) => `[${d.clientName || "解读"}] 关键信号：${d?.decode?.threadAnalysis?.keySignal}`).join("\n");
      const productParts = productKb.map((k) => `[${k.title}] ${k.content.slice(0, 500)}`).join("\n");

      const storeState = useStore.getState();
      const senderName = storeState.userSettings.displayName || "";
      const senderRole = storeState.userSettings.roleDescription || "";

      const res = await fetch("/api/compose-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: contact.name,
          contactTitle: contact.title,
          contactRole: contact.role ? ROLE_LABELS_MAP[contact.role] ?? contact.role : undefined,
          emailType,
          emailGoal,
          additionalContext: emailContext || undefined,
          contactProfile: profileParts.length > 0 ? profileParts.join("\n") : undefined,
          dealInfo: dealParts || undefined,
          recentIntel: intelParts || undefined,
          recentDecodes: decodeParts || undefined,
          productInfo: productParts || undefined,
          senderName: senderName || undefined,
          senderRole: senderRole || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `请求失败 (${res.status})`);
      }

      const result = await res.json();
      setComposeResult(result);
      setEditSubject(result.subject);
      setEditBody(result.body);

      // Save to store
      const emailId = addComposedEmail({
        accountId: account.id,
        contactId: contact.id,
        contactName: contact.name,
        opportunityId: accountOpps[0]?.id,
        type: emailType,
        goal: emailGoal,
        subject: result.subject,
        body: result.body,
        sendingAdvice: result.sendingAdvice,
        suggestedCc: result.suggestedCc,
        status: "draft",
      });
      setLastComposedEmailId(emailId);
    } catch (err) {
      setComposeError(friendlyError(err));
    } finally {
      setComposing(false);
    }
  }

  function resetComposer() {
    setComposeResult(null);
    setEditSubject("");
    setEditBody("");
    setComposeError(null);
    setEmailGoal("");
    setEmailContext("");
  }

  if (account.contacts.length === 0 && !showAdd) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card shadow-sm p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card">
          <Users className="h-5 w-5 text-muted" />
        </div>
        <p className="text-sm font-medium text-foreground">{t('暂无联系人', 'No contacts yet')}</p>
        <p className="mt-1 max-w-[260px] text-xs text-muted">
          {t('了解采购委员会结构，标注角色和心理画像', 'Map the buying committee, roles, and stakeholder profiles.')}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('添加联系人', 'Add contact')}
        </button>
      </div>
    );
  }

  const STYLE_LABELS: Record<string, string> = {
    analytical: "分析型", driver: "驱动型", amiable: "亲和型", expressive: "表现型",
  };
  const APPETITE_LABELS: Record<string, string> = {
    aggressive: "冒险", moderate: "谨慎", cautious: "规避",
  };

  const profileGenContact = profileGenContactId ? account.contacts.find((c) => c.id === profileGenContactId) : undefined;

  const filteredContacts = account.contacts.filter((c) => {
    if (!contactSearch.trim()) return true;
    const q = contactSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.title?.toLowerCase().includes(q)) || (c.role && roleLabel(c.role).toLowerCase().includes(q));
  });

  const selectedContact = selectedContactId ? account.contacts.find((c) => c.id === selectedContactId) : null;

  return (
    <div className="space-y-4">
      {/* Top bar: search + view toggle + add */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)}
            placeholder={t('搜索联系人...', 'Search contacts...')}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted/50 focus:border-accent/40 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-sidebar p-0.5">
            <button onClick={() => setViewMode("list")} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>{t('列表视图', 'List')}</button>
            <button onClick={() => setViewMode("org")} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${viewMode === "org" ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}>{t('组织架构', 'Org map')}</button>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover">
            <Plus className="h-3.5 w-3.5" />{t('添加联系人', 'Add contact')}
          </button>
        </div>
      </div>



      {/* Org Chart View */}
      {viewMode === "org" && (
        <OrgMap accountId={account.id} contacts={account.contacts} onAddContact={() => setShowAdd(true)} />
      )}

      {/* List + Detail Two-Panel View */}
      {viewMode === "list" && (
        <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 480 }}>
          {/* Left: compact list */}
          <div className="w-full lg:w-72 max-h-[400px] lg:max-h-[600px] flex-shrink-0 overflow-y-auto rounded-xl border border-border bg-card shadow-sm">
            {filteredContacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted">{t('无匹配联系人', 'No matching contacts')}</div>
            ) : (
              filteredContacts.map((contact) => {
                const roleInfo = ROLE_CONFIG[contact.role ?? "unknown"];
                const interaction = getContactInteraction(contact);
                const statusCfg = STATUS_CONFIG[interaction.status];
                const isSelected = selectedContactId === contact.id;
                return (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContactId(contact.id)}
                    className={`flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors ${isSelected ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-sidebar"}`}
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                      {contact.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground truncate">{contact.name}</p>
                        <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${statusCfg.dot}`} title={statusCfg.label} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {contact.title && <p className="text-xs text-muted truncate">{contact.title}</p>}
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium flex-shrink-0 ${roleInfo.style}`}>
                      {roleLabel(contact.role)}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: selected contact detail */}
          <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card shadow-sm">
            {selectedContact ? (() => {
              const contact = selectedContact;
              const roleInfo = ROLE_CONFIG[contact.role ?? "unknown"];
              const hasProfile = contact.decisionStyle || contact.riskAppetite || contact.communicationNotes || contact.landmines;
              const hasAIProfile = !!contact.contactProfile;
              const manager = contact.reportsTo ? account.contacts.find((c) => c.id === contact.reportsTo) : undefined;
              const interaction = getContactInteraction(contact);
              const statusCfg = STATUS_CONFIG[interaction.status];
              const isComposing = composingContactId === contact.id;
              const isEditing = editingContactId === contact.id;

              return (
                <div className="p-5 space-y-5">
                  {/* Contact header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-lg font-bold text-accent">
                        {isEditing ? editForm.name.charAt(0) || "?" : contact.name.charAt(0)}
                      </div>
                      <div>
                        {isEditing ? (
                          <div className="space-y-4 max-w-xl">
                            {/* Section 1: 基本信息 */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('基本信息', 'Basic Information')}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder={t('姓名 *', 'Name *')} className={inputFieldClass} />
                                <input type="text" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder={t('职位', 'Title')} className={inputFieldClass} />
                                <input type="text" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} placeholder={t('部门', 'Department')} className={inputFieldClass} />
                                <select value={editForm.reportsTo} onChange={(e) => setEditForm({ ...editForm, reportsTo: e.target.value })} className={selectFieldClass}>
                                  <option value="">{t('无汇报对象', 'No reporting line')}</option>
                                  {account.contacts.filter((c) => c.id !== contact.id).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                                </select>
                              </div>
                            </div>
                            {/* Section 2: 联系方式 */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('联系方式', 'Contact Details')}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder={t('邮箱', 'Email')} className={inputFieldClass} />
                                <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder={t('办公电话', 'Office phone')} className={inputFieldClass} />
                                <input type="text" value={editForm.mobilePhone} onChange={(e) => setEditForm({ ...editForm, mobilePhone: e.target.value })} placeholder={t('手机', 'Mobile phone')} className={inputFieldClass} />
                                <input type="text" value={editForm.wechat} onChange={(e) => setEditForm({ ...editForm, wechat: e.target.value })} placeholder={t('微信', 'WeChat')} className={inputFieldClass} />
                                <select value={editForm.preferredChannel} onChange={(e) => setEditForm({ ...editForm, preferredChannel: e.target.value })} className={selectFieldClass}>
                                  <option value="">{t('首选沟通方式', 'Preferred channel')}</option>
                                  <option value="email">{t('邮件', 'Email')}</option>
                                  <option value="phone">{t('电话', 'Phone')}</option>
                                  <option value="wechat">{t('微信', 'WeChat')}</option>
                                  <option value="teams">Teams</option>
                                  <option value="in_person">{t('当面', 'In person')}</option>
                                </select>
                                <input type="text" value={editForm.preferredLanguage} onChange={(e) => setEditForm({ ...editForm, preferredLanguage: e.target.value })} placeholder={t('首选语言', 'Preferred language')} className={inputFieldClass} />
                              </div>
                            </div>
                            {/* Section 3: 社交账号 */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('社交账号', 'Social Profiles')}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input type="text" value={editForm.linkedin} onChange={(e) => setEditForm({ ...editForm, linkedin: e.target.value })} placeholder="🔗 LinkedIn" className={inputFieldClass} />
                                <input type="text" value={editForm.twitter} onChange={(e) => setEditForm({ ...editForm, twitter: e.target.value })} placeholder="Twitter / X" className={inputFieldClass} />
                              </div>
                            </div>
                            {/* Section 4: 其他 */}
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('其他', 'Other')}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input type="text" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} placeholder={t('所在城市/办公室', 'City / office')} className={inputFieldClass} />
                                <input type="text" value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })} placeholder={t('时区', 'Timezone')} className={inputFieldClass} />
                              </div>
                              <textarea value={editForm.personalNotes} onChange={(e) => setEditForm({ ...editForm, personalNotes: e.target.value })} placeholder={t('兴趣爱好、家庭情况、建立关系的切入点...', 'Interests, context, and relationship entry points...')} className="mt-2 w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none" rows={2} />
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button onClick={() => { updateContact(account.id, contact.id, { name: editForm.name, title: editForm.title || undefined, email: editForm.email, phone: editForm.phone || undefined, mobilePhone: editForm.mobilePhone || undefined, reportsTo: editForm.reportsTo || undefined, department: editForm.department || undefined, linkedin: editForm.linkedin || undefined, wechat: editForm.wechat || undefined, twitter: editForm.twitter || undefined, location: editForm.location || undefined, timezone: editForm.timezone || undefined, preferredChannel: (editForm.preferredChannel as Contact["preferredChannel"]) || undefined, preferredLanguage: editForm.preferredLanguage || undefined, personalNotes: editForm.personalNotes || undefined }); setEditingContactId(null); }} className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover">{t('保存', 'Save')}</button>
                              <button onClick={() => setEditingContactId(null)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-secondary hover:bg-sidebar">{t('取消', 'Cancel')}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="text-base font-semibold text-foreground">{contact.name}</h3>
                            {contact.title && <p className="text-sm text-secondary">{contact.title}</p>}
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <select
                                value={contact.role ?? "unknown"}
                                onChange={(e) => updateContact(account.id, contact.id, { role: e.target.value as ContactRole })}
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium cursor-pointer appearance-none pr-4 bg-no-repeat bg-[length:8px] bg-[right_4px_center] ${roleInfo.style}`}
                                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24'%3E%3Cpath fill='currentColor' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")" }}
                                title={t('点击更改角色', 'Change role')}
                              >
                                {CONTACT_ROLES.map((r) => (<option key={r.value} value={r.value}>{roleOptionLabel(r.value)}</option>))}
                              </select>
                              <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusCfg.textStyle}`}>
                                <span className={`inline-block h-2 w-2 rounded-full ${statusCfg.dot}`} />{statusCfg.label}
                              </span>
                              <span className="text-xs text-muted">{interaction.lastDate ? `${t('最近互动：', 'Last interaction: ')}${en ? new Date(interaction.lastDate).toLocaleDateString('en-US') : timeAgo(interaction.lastDate)}` : t('暂无互动', 'No interactions yet')}</span>
                            </div>
                            {/* Relationship Strength */}
                            {contact.relationship_strength != null && (
                              <div className="group relative mt-2 max-w-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted whitespace-nowrap">{t('关系强度', 'Relationship strength')}</span>
                                  <div className="h-2 flex-1 rounded-full bg-gray-100 min-w-[80px]">
                                    <div
                                      className={`h-2 rounded-full transition-all ${contact.relationship_strength >= 70 ? "bg-green-500" : contact.relationship_strength >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                      style={{ width: `${contact.relationship_strength}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs font-semibold tabular-nums ${contact.relationship_strength >= 70 ? "text-green-600" : contact.relationship_strength >= 40 ? "text-amber-600" : "text-red-500"}`}>
                                    {contact.relationship_strength}
                                  </span>
                                  <span className={`text-xs ${contact.relationship_strength >= 70 ? "text-green-600" : contact.relationship_strength >= 40 ? "text-amber-600" : "text-red-500"}`}>
                                    {contact.relationship_strength >= 70 ? t('强关系', 'Strong') : contact.relationship_strength >= 40 ? t('一般', 'Moderate') : t('弱关系', 'Weak')}
                                  </span>
                                </div>
                                <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-20 pointer-events-none">
                                  <div className="rounded-md bg-foreground px-2.5 py-1.5 text-xs text-white whitespace-nowrap shadow-lg">
                                    {t('关系强度综合互动频率、信任深度和影响力水平', 'Relationship strength combines interaction frequency, trust depth, and influence.')}
                                  </div>
                                </div>
                              </div>
                            )}
                            {contact.department && <p className="mt-1 text-xs text-muted">{t('部门：', 'Department: ')}{contact.department}</p>}
                            {manager && <p className="mt-1 text-xs text-muted">{t('汇报给 ', 'Reports to ')}{manager.name}</p>}
                            {contact.email && <p className="mt-1 text-xs text-secondary">{contact.email}</p>}
                            {contact.phone && <p className="text-xs text-secondary">{t('办公：', 'Office: ')}{contact.phone}</p>}
                            {contact.mobilePhone && <p className="text-xs text-secondary">{t('手机：', 'Mobile: ')}{contact.mobilePhone}</p>}
                            {contact.wechat && <p className="text-xs text-secondary">{t('微信：', 'WeChat: ')}{contact.wechat}</p>}
                            {contact.linkedin && <p className="text-xs text-secondary">🔗 <a href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://linkedin.com/in/${contact.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">LinkedIn</a></p>}
                            {contact.twitter && <p className="text-xs text-secondary">Twitter: {contact.twitter}</p>}
                            {contact.location && <p className="text-xs text-muted">{contact.location}{contact.timezone ? ` (${contact.timezone})` : ""}</p>}
                            {contact.preferredChannel && <p className="text-xs text-muted">{t('首选沟通：', 'Preferred channel: ')}{channelLabel(contact.preferredChannel)}</p>}
                            {contact.preferredLanguage && <p className="text-xs text-muted">{t('首选语言：', 'Preferred language: ')}{contact.preferredLanguage}</p>}
                            {contact.personalNotes && <p className="mt-1 text-xs text-muted italic">{contact.personalNotes}</p>}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Primary actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setProfileGenContactId(contact.id)} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs min-h-[36px] font-semibold text-white transition-colors hover:bg-accent-hover">
                          <Brain className="h-3 w-3" />{hasAIProfile ? t('重新生成', 'Regenerate') : t('生成画像', 'Generate profile')}
                        </button>
                        {contact.linkedin && (
                          <button
                            onClick={() => {
                              if (linkedinResearchContactId === contact.id && linkedinResearchResult) {
                                setLinkedinResearchContactId(null);
                                setLinkedinResearchResult(null);
                              } else {
                                handleLinkedinResearch(contact);
                              }
                            }}
                            disabled={linkedinResearching && linkedinResearchContactId === contact.id}
                            className="flex items-center gap-1 rounded-lg bg-[#0A66C2] px-3 py-2 text-xs min-h-[36px] font-semibold text-white transition-colors hover:bg-[#004182] disabled:opacity-60"
                          >
                            {linkedinResearching && linkedinResearchContactId === contact.id ? (
                              <><Loader2 className="h-3 w-3 animate-spin" />{t('调研中...', 'Researching...')}</>
                            ) : linkedinResearchContactId === contact.id && linkedinResearchResult ? (
                              <><Search className="h-3 w-3" />{t('收起调研', 'Hide research')}</>
                            ) : (
                              <><Search className="h-3 w-3" />LinkedIn {t('调研', 'research')}</>
                            )}
                          </button>
                        )}
                        <button onClick={() => { if (isComposing) { setComposingContactId(null); resetComposer(); } else { setComposingContactId(contact.id); resetComposer(); } }} className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs min-h-[36px] font-semibold transition-colors ${isComposing ? "bg-gray-200 text-gray-700" : "border border-border bg-card text-foreground hover:bg-background"}`}>
                          <Mail className="h-3 w-3" />{isComposing ? t('收起', 'Collapse') : t('写邮件', 'Write email')}
                        </button>
                      </div>
                      {/* Secondary / destructive actions */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => { setEditingContactId(contact.id); setEditForm({ name: contact.name, title: contact.title ?? "", email: contact.email, phone: contact.phone ?? "", mobilePhone: contact.mobilePhone ?? "", reportsTo: contact.reportsTo ?? "", department: contact.department ?? "", linkedin: contact.linkedin ?? "", wechat: contact.wechat ?? "", twitter: contact.twitter ?? "", location: contact.location ?? "", timezone: contact.timezone ?? "", preferredChannel: contact.preferredChannel ?? "", preferredLanguage: contact.preferredLanguage ?? "", personalNotes: contact.personalNotes ?? "" }); }} title={t('编辑联系人', 'Edit contact')} aria-label={t('编辑联系人', 'Edit contact')} className="rounded-lg border border-border p-2 text-secondary min-h-[36px] min-w-[36px] hover:text-accent hover:border-accent/30">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={async () => { if (await appConfirm({ message: en ? `Delete contact "${contact.name}"? This cannot be undone.` : `确定删除联系人「${contact.name}」？此操作不可撤销。`, variant: 'danger' })) deleteContact(account.id, contact.id); }} title={t('删除联系人', 'Delete contact')} aria-label={t('删除联系人', 'Delete contact')} className="rounded-lg border border-border p-2 text-secondary min-h-[36px] min-w-[36px] hover:text-danger hover:border-danger/30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* AI Profile Hint */}
                  {!hasAIProfile && (
                    <p className="text-xs text-muted px-1">{t('生成 AI 画像可以帮你了解此人的决策风格和沟通偏好', "Generate an AI profile to understand this stakeholder's decision style and communication preferences.")}</p>
                  )}

                  {/* LinkedIn Research Result */}
                  {linkedinResearchContactId === contact.id && linkedinResearchError && (
                    <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{linkedinResearchError}
                    </div>
                  )}
                  {linkedinResearchContactId === contact.id && linkedinResearchResult && (
                    <div className="rounded-xl border border-[#0A66C2]/15 bg-[#0A66C2]/[0.02] p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#0A66C2] flex items-center gap-1.5">
                          <Search className="h-3 w-3" />LinkedIn 调研 — {linkedinResearchResult.person.name}
                        </p>
                        <a href={linkedinResearchResult.person.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                          查看 LinkedIn ↗
                        </a>
                      </div>

                      {/* Person Header */}
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                        {linkedinResearchResult.person.profilePicture && (
                          <img
                            src={linkedinResearchResult.person.profilePicture}
                            alt={linkedinResearchResult.person.name}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-foreground">{linkedinResearchResult.person.name}</p>
                          <p className="text-xs text-secondary">{linkedinResearchResult.person.headline}</p>
                          <p className="text-xs text-muted">{linkedinResearchResult.person.location}</p>
                        </div>
                      </div>

                      {/* Education */}
                      {linkedinResearchResult.education.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">📚 教育经历</p>
                          <div className="space-y-1">
                            {linkedinResearchResult.education.map((edu, i) => (
                              <div key={i} className="rounded-lg border border-border bg-card p-2 text-xs">
                                <p className="font-medium text-foreground">{edu.schoolName}</p>
                                {(edu.degreeName || edu.fieldOfStudy) && (
                                  <p className="text-muted">{[edu.degreeName, edu.fieldOfStudy].filter(Boolean).join(' · ')}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Posts & Articles */}
                      {(linkedinResearchResult.featuredPosts.length > 0 || linkedinResearchResult.articles.length > 0) && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">📝 帖子 & 文章</p>
                          <div className="space-y-1">
                            {linkedinResearchResult.featuredPosts.slice(0, 3).map((post, i) => (
                              <div key={`p-${i}`} className="rounded-lg border border-border bg-card p-2 text-xs">
                                <p className="text-foreground line-clamp-2">{post.text || post.title || post.content || '(无内容)'}</p>
                                {(post.totalReactionCount || post.commentsCount) && (
                                  <p className="mt-1 text-muted">👍 {post.totalReactionCount ?? 0} · 💬 {post.commentsCount ?? 0}</p>
                                )}
                              </div>
                            ))}
                            {linkedinResearchResult.articles.slice(0, 3).map((article, i) => (
                              <div key={`a-${i}`} className="rounded-lg border border-border bg-card p-2 text-xs">
                                <p className="font-medium text-foreground">{article.title}</p>
                                {article.description && <p className="text-muted line-clamp-2">{article.description}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reactions */}
                      {linkedinResearchResult.reactions.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">🤝 互动模式</p>
                          <div className="flex flex-wrap gap-1.5">
                            {linkedinResearchResult.reactions.slice(0, 8).map((r, i) => (
                              <span key={i} className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted">
                                {r.reactionType || 'LIKE'}: {(r.postText || '').slice(0, 40)}...
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* BABEL Analysis */}
                      <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                          <Brain className="h-3 w-3" />分析
                        </p>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="font-medium text-muted">沟通风格：</span>
                            <span className="text-foreground">{linkedinResearchResult.babelAnalysis.communicationStyle}</span>
                          </div>
                          <div>
                            <span className="font-medium text-muted">性格特征：</span>
                            <span className="text-foreground">{linkedinResearchResult.babelAnalysis.personality}</span>
                          </div>
                          <div>
                            <span className="font-medium text-muted">职业关注：</span>
                            <span className="text-foreground">{linkedinResearchResult.babelAnalysis.professionalFocus}</span>
                          </div>
                          {linkedinResearchResult.babelAnalysis.topicEntryPoints.length > 0 && (
                            <div>
                              <p className="font-medium text-positive mb-1">话题切入点：</p>
                              <ul className="space-y-0.5 pl-2">
                                {linkedinResearchResult.babelAnalysis.topicEntryPoints.map((t, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-foreground">
                                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-positive" />{t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {linkedinResearchResult.babelAnalysis.icebreakers.length > 0 && (
                            <div>
                              <p className="font-medium text-accent mb-1">开场白建议：</p>
                              {linkedinResearchResult.babelAnalysis.icebreakers.map((ib, i) => (
                                <p key={i} className="italic text-foreground border-l-2 border-accent/30 pl-2 mb-1">&ldquo;{ib}&rdquo;</p>
                              ))}
                            </div>
                          )}
                          {linkedinResearchResult.babelAnalysis.warnings.length > 0 && (
                            <div>
                              <p className="font-medium text-danger mb-1">⚠️ 注意事项：</p>
                              <ul className="space-y-0.5 pl-2">
                                {linkedinResearchResult.babelAnalysis.warnings.map((w, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-foreground">
                                    <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger" />{w}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/30">
                        {savedLinkedinProfile.has(contact.id) ? (
                          <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" />已保存到画像</span>
                        ) : (
                          <button
                            onClick={() => {
                              const babel = linkedinResearchResult.babelAnalysis;
                              const profile: ContactProfileResult = {
                                decisionStyle: {
                                  type: (babel.personality?.includes('分析') ? 'analytical' : babel.personality?.includes('驱动') ? 'driver' : babel.personality?.includes('表现') ? 'expressive' : 'amiable') as ContactProfileResult['decisionStyle']['type'],
                                  confidence: 0.7,
                                  evidence: babel.personality || '',
                                },
                                riskAppetite: 'moderate',
                                communication: {
                                  responseSpeed: '',
                                  lengthPreference: '',
                                  formality: babel.communicationStyle || '',
                                  bestContactTime: '',
                                },
                                positiveTriggers: babel.topicEntryPoints || [],
                                negativeTriggers: [],
                                landmines: babel.warnings || [],
                                engagementTips: babel.icebreakers || [],
                                generatedAt: linkedinResearchResult.generatedAt,
                                basedOnCount: 1,
                              };
                              updateContact(account.id, contact.id, {
                                contactProfile: profile,
                                communicationNotes: [contact.communicationNotes, `[LinkedIn] ${babel.communicationStyle}`].filter(Boolean).join('\n'),
                                personalNotes: [contact.personalNotes, `[LinkedIn] ${babel.professionalFocus}`].filter(Boolean).join('\n'),
                              });
                              setSavedLinkedinProfile((prev) => new Set(prev).add(contact.id));
                            }}
                            className="flex items-center gap-1 rounded-lg border border-accent/30 px-2.5 py-1 text-xs text-accent hover:bg-accent/5 transition-colors"
                          >
                            <Save className="h-3 w-3" />保存到联系人画像
                          </button>
                        )}
                        <p className="text-xs text-muted">
                          生成于 {new Date(linkedinResearchResult.generatedAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Email Composer */}
                  {isComposing && (
                    <div className="rounded-xl border border-accent/15 bg-accent/[0.02] p-4 space-y-3">
                      <p className="text-xs font-semibold text-accent flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" />AI 写信工作台 — 给 {contact.name}
                      </p>
                      {!composeResult ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="form-label">邮件类型</label>
                              <select value={emailType} onChange={(e) => setEmailType(e.target.value as EmailType)} className={selectFieldClass}>
                                {EMAIL_TYPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                              </select>
                            </div>
                            <div>
                              <label className="form-label">邮件目标</label>
                              <input type="text" value={emailGoal} onChange={(e) => setEmailGoal(e.target.value)} placeholder="例如：约一次技术评审会议" className={inputFieldClass} />
                            </div>
                          </div>
                          <div>
                            <label className="form-label">补充上下文（可选）</label>
                            <textarea value={emailContext} onChange={(e) => setEmailContext(e.target.value)} placeholder="例如：上次会议她提到了竞品报价" className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none" rows={2} />
                          </div>
                          <button onClick={() => handleComposeEmail(contact)} disabled={!emailGoal.trim() || composing} className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40">
                            {composing ? <><Loader2 className="h-4 w-4 animate-spin" />生成中...</> : <><Sparkles className="h-4 w-4" />生成邮件草稿</>}
                          </button>
                          {composeError && (
                            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-2 text-xs text-danger">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />{composeError}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="form-label">邮件主题</label>
                              <CopyButton text={editSubject} />
                            </div>
                            <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className={inputFieldClass} />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="form-label">邮件正文</label>
                              <CopyButton text={editBody} />
                            </div>
                            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground focus:border-accent/40 focus:outline-none" rows={8} />
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                            <p className="text-xs font-semibold text-blue-700 mb-1">发送建议</p>
                            <p className="text-xs text-blue-600 whitespace-pre-wrap">{composeResult.sendingAdvice}</p>
                          </div>
                          {/* CC Suggestions */}
                          {composeResult.suggestedCc && composeResult.suggestedCc.length > 0 && (
                            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                              <p className="text-xs font-semibold text-purple-700 mb-1">建议抄送</p>
                              <div className="flex flex-wrap gap-1.5">
                                {composeResult.suggestedCc.map((cc, i) => (
                                  <span key={i} className="inline-flex items-center rounded-full border border-purple-200 bg-card px-2 py-0.5 text-xs text-purple-700">{cc}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => { setComposeResult(null); setComposeError(null); }} disabled={composing} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-sidebar">
                              <RefreshCw className="h-3 w-3" />重新生成
                            </button>
                            <button onClick={() => { setShowSentModal(true); setSentFinalContent(editBody); }} className="flex items-center gap-1.5 rounded-lg bg-positive px-3 py-1.5 text-xs font-semibold text-white hover:bg-positive/90">
                              <Send className="h-3 w-3" />标记已发送
                            </button>
                            <button onClick={() => { setComposingContactId(null); resetComposer(); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-sidebar">关闭</button>
                          </div>
                          {/* Sent confirmation modal */}
                          {showSentModal && (
                            <div className="rounded-xl border border-positive/20 bg-positive/5 p-4 space-y-3">
                              <p className="text-xs font-semibold text-positive">确认发送内容</p>
                              <textarea value={sentFinalContent} onChange={(e) => setSentFinalContent(e.target.value)} className="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm leading-relaxed text-foreground focus:border-accent/40 focus:outline-none" rows={6} />
                              <div className="flex gap-2">
                                <button onClick={() => {
                                  if (lastComposedEmailId) {
                                    updateComposedEmail(lastComposedEmailId, { status: "sent", finalContent: sentFinalContent, sentAt: new Date().toISOString() });
                                  }
                                  setShowSentModal(false);
                                  setComposingContactId(null);
                                  resetComposer();
                                }} className="rounded-lg bg-positive px-3 py-1.5 text-xs font-semibold text-white hover:bg-positive/90">
                                  <Check className="inline h-3 w-3 mr-1" />确认已发送
                                </button>
                                <button onClick={() => setShowSentModal(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary hover:bg-sidebar">取消</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Profile sections */}
                  {hasProfile && (
                    <div className="rounded-xl border border-border bg-sidebar p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">🧠 {contact.name} · 心理画像</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {contact.decisionStyle && (
                          <div><span className="text-xs text-secondary">决策风格</span><p className="font-medium text-foreground">{STYLE_LABELS[contact.decisionStyle] ?? contact.decisionStyle}</p></div>
                        )}
                        {contact.riskAppetite && (
                          <div><span className="text-xs text-secondary">风险偏好</span><p className="font-medium text-foreground">{APPETITE_LABELS[contact.riskAppetite] ?? contact.riskAppetite}</p></div>
                        )}
                        {contact.communicationNotes && (
                          <div className="col-span-2"><span className="text-xs text-secondary">沟通偏好</span><p className="font-medium text-foreground">{contact.communicationNotes}</p></div>
                        )}
                        {contact.landmines && (
                          <div className="col-span-2"><span className="text-xs text-secondary">注意事项 / 地雷</span><p className="font-medium text-danger">{contact.landmines}</p></div>
                        )}
                      </div>
                    </div>
                  )}

                  {hasAIProfile && contact.contactProfile && (
                    <div className="rounded-xl border border-border bg-sidebar p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                        <Brain className="h-3 w-3" />AI 心理画像
                      </p>
                      <ContactProfileDisplay profile={contact.contactProfile} />
                    </div>
                  )}

                  {/* Attitude Trend */}
                  {contact.attitudeTrend && contact.attitudeTrend.length >= 2 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3" />态度趋势
                      </p>
                      <AttitudeTrendChart attitudeTrend={contact.attitudeTrend} />
                    </div>
                  )}

                  {/* Communication Timeline */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" />沟通时间线
                    </p>
                    <CommunicationTimeline contactId={contact.id} contactName={contact.name} />
                  </div>

                  {/* Related Intel */}
                  <ContactRelatedIntel contactId={contact.id} intelItems={intelItems} />
                </div>
              );
            })() : (
              <div className="flex items-center justify-center h-full text-sm text-muted p-8">
                选择一个联系人查看详情
              </div>
            )}
          </div>
        </div>
      )}



      {showAdd && <ContactForm accountId={account.id} contacts={account.contacts} onClose={() => setShowAdd(false)} />}
      {profileGenContact && (
        <ProfileGenerationModal accountId={account.id} contact={profileGenContact} onClose={() => setProfileGenContactId(null)} />
      )}
    </div>
  );
}
