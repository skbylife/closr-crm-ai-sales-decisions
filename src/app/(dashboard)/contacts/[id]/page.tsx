"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  User2,
  Mail,
  Phone,
  Building2,
  Brain,
  MessageSquare,
  TrendingUp,
  Briefcase,
  Lightbulb,
  Edit2,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { appConfirm } from '@/lib/confirm-store';
import type { LinkedInResearchResult } from "@/types/linkedin-research";
import { Search, Loader2 } from "lucide-react";
import { ContactsTab } from "@/components/accounts/ContactCard";
import { useStore } from "@/lib/store";
import {
  PROFILE_DECISION_STYLE_LABELS,
  PROFILE_FORMALITY_LABELS,
  PROFILE_LENGTH_LABELS,
  PROFILE_RISK_LABELS,
  localizeProfileFreeText,
  profileDisplayValue,
} from '@/lib/contact-profile-display';
import { useLocale } from "@/lib/i18n";
import type {
  Contact,
  Account,
  DecisionStyle,
  Opportunity,
} from "@/lib/babel-engine/types";
import type { TranslationKey } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/constants";
import { EmailTimeline } from "@/components/integration/email-timeline";
import { AttitudeTrendChart } from "@/components/contacts/attitude-trend-chart";
import { CommunicationTimeline } from "@/components/contacts/communication-timeline";
import { PageBackButton } from "@/components/navigation/page-back-button";
import { DISCTypeBadge } from "@/components/contacts/disc-type-badge";
import { InferredRoleBadge } from "@/components/contacts/inferred-role-badge";
import { AIInferenceSummaryCard } from "@/components/contacts/ai-inference-summary";
import { EnrichmentHistoryTab } from "@/components/contacts/enrichment-history-tab";

// ─── Constants ───────────────────────────────────────────────────────

const DISC_CONFIG: Record<
  DecisionStyle,
  { label: string; color: string; bgColor: string }
> = {
  driver: {
    label: "D 驱动型",
    color: "text-danger",
    bgColor: "bg-danger/10",
  },
  analytical: {
    label: "A 分析型",
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
  },
  amiable: {
    label: "A 亲和型",
    color: "text-positive",
    bgColor: "bg-positive/10",
  },
  expressive: {
    label: "E 表现型",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
};

const DISC_ADVICE: Record<DecisionStyle, { zh: string; en: string }> = {
  driver: {
    zh: "开门见山，聚焦结果和ROI，不要浪费时间在寒暄",
    en: "Be direct, focus on results and ROI, skip small talk",
  },
  analytical: {
    zh: "提供详细数据和案例支撑，给足时间思考",
    en: "Provide detailed data and case studies, give time to think",
  },
  amiable: {
    zh: "建立个人关系，强调团队协作和稳定性",
    en: "Build personal rapport, emphasize teamwork and stability",
  },
  expressive: {
    zh: "描绘愿景，激发热情，用故事打动",
    en: "Paint a vision, inspire enthusiasm, use storytelling",
  },
};

type TabKey = "overview" | "timeline" | "trend" | "enrichment";

// ─── Main Page ───────────────────────────────────────────────────────

interface ContactDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ContactDetailPage({ params }: ContactDetailPageProps) {
  const { id } = use(params);
  const accounts = useStore((s) => s.accounts);
  const opportunities = useStore((s) => s.opportunities);
  const updateContact = useStore((s) => s.updateContact);
  const deleteContact = useStore((s) => s.deleteContact);
  const { locale, t } = useLocale();
  const { isDemo } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', title: '', email: '', phone: '', mobilePhone: '', department: '', linkedin: '', wechat: '', location: '', preferredChannel: '', personalNotes: '' });
  const router = useRouter();
  const [linkedinSearching, setLinkedinSearching] = useState(false);
  const [linkedinResult, setLinkedinResult] = useState<LinkedInResearchResult | null>(null);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);

  // Find contact across all accounts
  let contact: Contact | undefined;
  let parentAccount: Account | undefined;
  for (const acc of accounts) {
    const found = acc.contacts.find((c) => c.id === id);
    if (found) {
      contact = found;
      parentAccount = acc;
      break;
    }
  }

  if (!contact || !parentAccount) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-12 text-center">
        <User2 className="mx-auto h-12 w-12 text-muted" />
        <p className="mt-4 text-sm font-medium text-foreground">
          {t("contact.notFound")}
        </p>
        <Link
          href="/contacts"
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <ArrowLeft className="h-4 w-4" />
          返回联系人列表
        </Link>
      </div>
    );
  }

  const discStyle =
    contact.decisionStyle ||
    contact.contactProfile?.decisionStyle?.type ||
    null;

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: t("contact.overview"), icon: Brain },
    { key: "timeline", label: t("contact.timeline"), icon: MessageSquare },
    { key: "trend", label: t("contact.trend"), icon: TrendingUp },
    { key: "enrichment", label: "AI 丰富", icon: Sparkles },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back button */}
      <PageBackButton fallbackHref="/contacts" />

      {/* Hero */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-sidebar text-2xl font-bold text-secondary">
            <User2 className="h-10 w-10" />
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              {contact.name}
            </h1>
            {contact.title && (
              <p className="mt-0.5 text-sm text-secondary">{contact.title}</p>
            )}

            {/* Tags */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {contact.contactProfile?.discType ? (
                <DISCTypeBadge
                  discType={contact.contactProfile.discType}
                  confidence={contact.contactProfile.discConfidence}
                  approach={contact.contactProfile.discApproach}
                  evidence={contact.contactProfile.discEvidence}
                />
              ) : discStyle && DISC_CONFIG[discStyle] ? (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${DISC_CONFIG[discStyle].bgColor} ${DISC_CONFIG[discStyle].color}`}
                >
                  {DISC_CONFIG[discStyle].label}
                </span>
              ) : null}
              {contact.role && contact.role !== 'unknown' && contact.role !== 'contact' ? (
                <InferredRoleBadge
                  role={contact.role}
                  roleSource={contact.roleSource}
                  roleConfidence={contact.roleConfidence}
                />
              ) : null}
            </div>

            {/* Contact info */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-muted sm:justify-start">
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-1 hover:text-accent"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" />
                  {contact.phone}
                </span>
              )}
            </div>

            {/* Company */}
            <div className="mt-2">
              <Link
                href={`/accounts/${parentAccount.id}`}
                className="inline-flex items-center gap-1 text-xs text-secondary hover:text-accent hover:underline"
              >
                <Building2 className="h-3.5 w-3.5" />
                {t("contact.company")}: {parentAccount.name}
              </Link>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            {contact.email && (
              <Link
                href={`/compose?to=${encodeURIComponent(contact.email)}&name=${encodeURIComponent(contact.name)}&title=${encodeURIComponent(contact.title || "")}&accountId=${encodeURIComponent(parentAccount.id)}&contactId=${encodeURIComponent(contact.id)}`}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <Mail className="h-4 w-4" />
                {t("contact.sendEmail")}
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  setLinkedinSearching(true);
                  setLinkedinError(null);
                  setLinkedinResult(null);
                  try {
                    const res = await fetch('/api/linkedin-research', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        contactName: contact.name,
                        companyName: parentAccount.name,
                        linkedinUrl: contact.linkedin || undefined,
                        outputLocale: locale,
                      }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                    const data = await res.json();
                    setLinkedinResult(data);
                    // Auto-update contact with LinkedIn data
                    if (data.person?.profileUrl) {
                      updateContact(parentAccount.id, contact.id, {
                        linkedin: data.person.profileUrl,
                        ...(data.person.location && !contact.location ? { location: data.person.location } : {}),
                      });
                    }
                  } catch (e) {
                    setLinkedinError(e instanceof Error ? e.message : '搜索失败');
                  } finally {
                    setLinkedinSearching(false);
                  }
                }}
                disabled={linkedinSearching}
                className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
              >
                {linkedinSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                LinkedIn 调研
              </button>
              <button
                onClick={() => {
                  setEditForm({
                    name: contact.name,
                    title: contact.title || '',
                    email: contact.email || '',
                    phone: contact.phone || '',
                    mobilePhone: contact.mobilePhone || '',
                    department: contact.department || '',
                    linkedin: contact.linkedin || '',
                    wechat: contact.wechat || '',
                    location: contact.location || '',
                    preferredChannel: contact.preferredChannel || '',
                    personalNotes: contact.personalNotes || '',
                  });
                  setIsEditing(true);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background"
                title="编辑联系人"
              >
                <Edit2 className="h-3.5 w-3.5" />
                编辑
              </button>
              <button
                onClick={async () => {
                  if (await appConfirm({ message: `确定删除联系人「${contact.name}」吗？`, variant: 'danger' })) {
                    deleteContact(parentAccount.id, contact.id);
                    router.push('/contacts');
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                title="删除联系人"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* LinkedIn Research Result */}
      {linkedinError && (
        <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
          <p className="text-sm text-danger">LinkedIn 搜索失败：{linkedinError}</p>
        </div>
      )}
      {linkedinResult && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-blue-400">🔗 LinkedIn 调研结果</p>
            <button onClick={() => setLinkedinResult(null)} className="text-xs text-secondary hover:text-foreground">关闭</button>
          </div>

          {/* Person info */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              {linkedinResult.person.profilePicture && (
                <img src={linkedinResult.person.profilePicture} alt="" className="h-12 w-12 rounded-full object-cover" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{linkedinResult.person.name}</p>
                <p className="text-xs text-secondary">{linkedinResult.person.headline}</p>
                <p className="text-xs text-muted">{linkedinResult.person.location}</p>
              </div>
            </div>
            {linkedinResult.person.profileUrl && (
              <a href={linkedinResult.person.profileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                查看 LinkedIn →
              </a>
            )}
          </div>

          {/* BABEL Analysis */}
          {linkedinResult.babelAnalysis && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">🧠 BABEL 分析</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted font-medium mb-1">沟通风格</p>
                  <p className="text-foreground">{linkedinResult.babelAnalysis.communicationStyle}</p>
                </div>
                <div>
                  <p className="text-muted font-medium mb-1">性格特征</p>
                  <p className="text-foreground">{linkedinResult.babelAnalysis.personality}</p>
                </div>
                <div>
                  <p className="text-muted font-medium mb-1">专业方向</p>
                  <p className="text-foreground">{linkedinResult.babelAnalysis.professionalFocus}</p>
                </div>
              </div>
              {linkedinResult.babelAnalysis.topicEntryPoints?.length > 0 && (
                <div>
                  <p className="text-muted font-medium text-xs mb-1">💬 话题切入点</p>
                  <ul className="space-y-0.5">
                    {linkedinResult.babelAnalysis.topicEntryPoints.map((t, i) => (
                      <li key={i} className="text-xs text-secondary flex items-start gap-1">
                        <span className="text-muted">•</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {linkedinResult.babelAnalysis.icebreakers?.length > 0 && (
                <div>
                  <p className="text-muted font-medium text-xs mb-1">🧊 破冰建议</p>
                  <ul className="space-y-0.5">
                    {linkedinResult.babelAnalysis.icebreakers.map((t, i) => (
                      <li key={i} className="text-xs text-secondary flex items-start gap-1">
                        <span className="text-muted">•</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {linkedinResult.babelAnalysis.warnings?.length > 0 && (
                <div>
                  <p className="text-danger font-medium text-xs mb-1">⚠️ 注意事项</p>
                  <ul className="space-y-0.5">
                    {linkedinResult.babelAnalysis.warnings.map((t, i) => (
                      <li key={i} className="text-xs text-danger/80 flex items-start gap-1">
                        <span>•</span>{t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">编辑联系人</p>
            <button onClick={() => setIsEditing(false)} className="text-secondary hover:text-foreground text-sm">取消</button>
          </div>

          {/* 基本信息 */}
          <div>
            <p className="text-xs font-semibold text-secondary mb-2">基本信息</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] text-muted font-medium">姓名 *</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="form-input mt-1 w-full" />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">职位</label>
                <input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="form-input mt-1 w-full" placeholder="例：CTO、采购总监" />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">部门</label>
                <input type="text" value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})} className="form-input mt-1 w-full" placeholder="例：技术部、采购部" />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">所在城市</label>
                <input type="text" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} className="form-input mt-1 w-full" placeholder="例：上海、深圳" />
              </div>
            </div>
          </div>

          {/* 联系方式 */}
          <div>
            <p className="text-xs font-semibold text-secondary mb-2">联系方式</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] text-muted font-medium">邮箱</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="form-input mt-1 w-full" />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">座机</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="form-input mt-1 w-full" />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">手机</label>
                <input type="text" value={editForm.mobilePhone} onChange={e => setEditForm({...editForm, mobilePhone: e.target.value})} className="form-input mt-1 w-full" />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">首选沟通方式</label>
                <select value={editForm.preferredChannel} onChange={e => setEditForm({...editForm, preferredChannel: e.target.value})} className="form-select mt-1 w-full">
                  <option value="">未设置</option>
                  <option value="email">邮件</option>
                  <option value="phone">电话</option>
                  <option value="wechat">微信</option>
                  <option value="teams">Teams</option>
                  <option value="in_person">面谈</option>
                </select>
              </div>
            </div>
          </div>

          {/* 社交信息 */}
          <div>
            <p className="text-xs font-semibold text-secondary mb-2">社交信息</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] text-muted font-medium">LinkedIn</label>
                <input type="text" value={editForm.linkedin} onChange={e => setEditForm({...editForm, linkedin: e.target.value})} className="form-input mt-1 w-full" placeholder="linkedin.com/in/..." />
              </div>
              <div>
                <label className="text-[12px] text-muted font-medium">微信号</label>
                <input type="text" value={editForm.wechat} onChange={e => setEditForm({...editForm, wechat: e.target.value})} className="form-input mt-1 w-full" />
              </div>
            </div>
          </div>

          {/* 备注 */}
          <div>
            <p className="text-xs font-semibold text-secondary mb-2">个人备注</p>
            <textarea
              value={editForm.personalNotes}
              onChange={e => setEditForm({...editForm, personalNotes: e.target.value})}
              className="form-input mt-1 w-full"
              rows={3}
              placeholder="兴趣爱好、家庭情况、注意事项等（用于建立关系）"
            />
          </div>

          <button
            onClick={() => {
              if (!editForm.name.trim()) return;
              updateContact(parentAccount.id, contact.id, {
                name: editForm.name.trim(),
                title: editForm.title || undefined,
                email: editForm.email || undefined,
                phone: editForm.phone || undefined,
                mobilePhone: editForm.mobilePhone || undefined,
                department: editForm.department || undefined,
                linkedin: editForm.linkedin || undefined,
                wechat: editForm.wechat || undefined,
                location: editForm.location || undefined,
                preferredChannel: (editForm.preferredChannel as Contact['preferredChannel']) || undefined,
                personalNotes: editForm.personalNotes || undefined,
              });
              setIsEditing(false);
            }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            保存
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b-2 border-border">
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex flex-nowrap whitespace-nowrap items-center gap-1.5 py-3 px-4 text-[15px] transition-colors ${
                index < tabs.length - 1 ? "border-r border-border" : ""
              } ${
                isActive
                  ? "-mb-[2px] border-b-2 border-accent font-bold text-accent"
                  : "-mb-[2px] border-b-2 border-transparent font-medium text-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && (
          <div className="space-y-4">
            <AIInferenceSummaryCard
              contact={contact}
              contactProfile={contact.contactProfile}
            />
            <ContactsTab account={parentAccount} focusContactId={contact.id} />
          </div>
        )}
        {activeTab === "timeline" && (
          <div className="space-y-6">
            <CommunicationTimeline contactId={id} contactName={contact.name} />
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-secondary uppercase tracking-wide">邮件互动</p>
              <EmailTimeline contactId={id} />
            </div>
          </div>
        )}
        {activeTab === "trend" && (
          <div className="space-y-4">
            <AttitudeTrendChart attitudeTrend={contact.attitudeTrend || []} />
          </div>
        )}
        {activeTab === "enrichment" && (
          <EnrichmentHistoryTab contactId={id} />
        )}
      </div>
    </div>
  );
}

// ─── Tab 1: Overview ─────────────────────────────────────────────────

function OverviewContent({
  contact,
  parentAccount,
  discStyle,
  opportunities,
  t,
}: {
  contact: Contact;
  parentAccount: Account;
  discStyle: DecisionStyle | null;
  opportunities: Opportunity[];
  t: (key: TranslationKey) => string;
}) {
  const profile = contact.contactProfile;

  // Find related opportunities
  const relatedOpps = opportunities.filter(
    (opp) => opp.accountId === parentAccount.id
  );

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Brain className="h-4 w-4 text-accent" />
          {t("contact.profile")}
        </h3>
        {profile ? (
          <div className="mt-4 space-y-3">
            {profile.communication && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoItem
                  label="响应速度"
                  value={profile.communication.responseSpeed}
                />
                <InfoItem
                  label="长度偏好"
                  value={profileDisplayValue(profile.communication.lengthPreference, PROFILE_LENGTH_LABELS)}
                />
                <InfoItem
                  label="正式程度"
                  value={profileDisplayValue(profile.communication.formality, PROFILE_FORMALITY_LABELS)}
                />
                <InfoItem
                  label="最佳联系时间"
                  value={profile.communication.bestContactTime}
                />
              </div>
            )}
            {profile.decisionStyle && (
              <InfoItem
                label="决策风格"
                value={`${profileDisplayValue(profile.decisionStyle.type, PROFILE_DECISION_STYLE_LABELS)}（置信度 ${Math.round(profile.decisionStyle.confidence * 100)}%）`}
              />
            )}
            {profile.riskAppetite && (
              <InfoItem
                label="风险偏好"
                value={
                  profileDisplayValue(profile.riskAppetite, PROFILE_RISK_LABELS)
                }
              />
            )}
            {profile.engagementTips && profile.engagementTips.length > 0 && (
              <div>
                <p className="text-xs font-medium text-secondary">沟通技巧</p>
                <ul className="mt-1 space-y-1">
                  {profile.engagementTips.map((tip, i) => (
                    <li
                      key={i}
                      className="text-xs text-muted flex items-start gap-1.5"
                    >
                      <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                      {localizeProfileFreeText(tip)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {profile.positiveTriggers &&
              profile.positiveTriggers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-positive">
                    正面触发因素
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {profile.positiveTriggers.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-positive/10 px-2 py-0.5 text-[12px] text-positive"
                      >
                        {localizeProfileFreeText(t)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            {profile.negativeTriggers &&
              profile.negativeTriggers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-danger">
                    负面触发因素
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {profile.negativeTriggers.map((t, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-danger/10 px-2 py-0.5 text-[12px] text-danger"
                      >
                        {localizeProfileFreeText(t)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            {profile.landmines && profile.landmines.length > 0 && (
              <div>
                <p className="text-xs font-medium text-warning">⚠️ 雷区</p>
                <ul className="mt-1 space-y-1">
                  {profile.landmines.map((l, i) => (
                    <li key={i} className="text-xs text-muted">
                      • {localizeProfileFreeText(l)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[12px] text-muted">
              基于 {profile.basedOnCount} 次交互生成 ·{" "}
              {new Date(profile.generatedAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">{t("contact.noProfile")}</p>
        )}
      </div>

      {/* AI Advice Card */}
      {discStyle && DISC_ADVICE[discStyle] && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb className="h-4 w-4 text-warning" />
            {t("contact.aiAdvice")}
          </h3>
          <div className="mt-3 rounded-lg bg-stripe p-4">
            <p className="text-sm text-foreground leading-relaxed">
              {DISC_ADVICE[discStyle].zh}
            </p>
            <p className="mt-1 text-xs text-muted italic">
              {DISC_ADVICE[discStyle].en}
            </p>
          </div>
        </div>
      )}

      {/* Related Opportunities */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Briefcase className="h-4 w-4 text-accent" />
          {t("contact.relatedDeals")}
        </h3>
        {relatedOpps.length > 0 ? (
          <div className="mt-3 max-h-[400px] overflow-y-auto space-y-2">
            {relatedOpps.map((opp) => (
              <Link
                key={opp.id}
                href={`/pipeline/${opp.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-background"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {opp.name}
                  </p>
                  <p className="text-[12px] text-muted">
                    {opp.stage} · 概率 {opp.probability}%
                  </p>
                </div>
                <span className="text-sm font-mono font-semibold text-accent">
                  {opp.currency === "CNY" ? "¥" : "$"}
                  {opp.value.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">暂无关联商机</p>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-secondary uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}
