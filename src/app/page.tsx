import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Eye,
  Layers,
  Map,
  MessageSquareText,
  Network,
  Radar,
  Shield,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { ClosrLogo } from "@/components/ui/closr-logo";
import { HeroScrubVideo } from "@/components/landing/hero-scrub-video";

function SectionHeader({
  eyebrow,
  title,
  desc,
  align = "center",
  variant = "dark",
}: {
  eyebrow: string;
  title: string;
  desc: string;
  align?: "center" | "left";
  variant?: "dark" | "light";
}) {
  const alignCls = align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl";
  const isDark = variant === "dark";

  return (
    <div className={alignCls}>
      <p className={`text-sm font-semibold uppercase tracking-[0.22em] ${isDark ? "text-[#f87171]" : "text-[#dc2626]"}`}>{eyebrow}</p>
      <h2 className={`mt-4 text-3xl font-bold tracking-tight sm:text-4xl ${isDark ? "text-white" : "text-gray-950"}`}>{title}</h2>
      <p className={`mt-4 text-base leading-7 sm:text-lg ${isDark ? "text-white/72" : "text-gray-700"}`}>{desc}</p>
    </div>
  );
}

function IntelFeedLine({
  time,
  label,
  value,
  severity,
  isLast,
}: {
  time: string;
  label: string;
  value: string;
  severity: "high" | "medium" | "low";
  isLast?: boolean;
}) {
  const dotColor =
    severity === "high" ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" : severity === "medium" ? "bg-red-400" : "bg-red-300/60";

  return (
    <div className="flex gap-3 text-xs">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        {!isLast && <div className="mt-1 w-px flex-1 bg-gradient-to-b from-white/12 to-transparent" />}
      </div>
      <div className="flex-1 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-white/90">{label}</span>
          <span className="font-mono text-[10px] text-white/35">{time}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-4 text-white/60">{value}</p>
      </div>
    </div>
  );
}

function StakeholderRow({
  role,
  stance,
  influence,
}: {
  role: string;
  stance: "supportive" | "neutral" | "blocking" | "支持" | "中立" | "阻碍";
  influence: number;
}) {
  const isSupportive = stance === "supportive" || stance === "支持";
  const isBlocking = stance === "blocking" || stance === "阻碍";
  const stanceBg =
    isSupportive ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : isBlocking ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-amber-500/15 text-amber-300 border-amber-500/25";
  const barColor =
    isSupportive ? "bg-emerald-500/60" : isBlocking ? "bg-red-500/60" : "bg-amber-500/50";
  const stanceLabel =
    stance === "supportive" ? "Supportive" : stance === "neutral" ? "Neutral" : stance === "blocking" ? "Blocking" : stance;

  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="w-[68px] shrink-0 font-medium text-white/85">{role}</span>
      <span className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold ${stanceBg}`}>{stanceLabel}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${influence}%` }} />
      </div>
    </div>
  );
}

function LoopStep({
  index,
  title,
  desc,
}: {
  index: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#7f1d1d]/50 bg-[#7f1d1d]/20 text-xs font-bold text-[#fecaca]">
          {index}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/72">{desc}</p>
    </div>
  );
}

type LandingLocale = "zh" | "en";

type LandingSearchParams = Promise<Record<string, string | string[] | undefined>>;

type AccountPanelCopy = {
  console: string;
  live: string;
  account: string;
  accountMeta: string;
  winRate: string;
  coreLabel: string;
  coreText: string;
  chips: { label: string; value: string; cls: string }[];
  feedLabel: string;
  feed: {
    time: string;
    label: string;
    value: string;
    severity: "high" | "medium" | "low";
    isLast?: boolean;
  }[];
  stakeholderLabel: string;
  stakeholders: {
    role: string;
    stance: "supportive" | "neutral" | "blocking" | "支持" | "中立" | "阻碍";
    influence: number;
  }[];
  judgmentLabel: string;
  judgmentText: string;
  nextLabel: string;
  nextMoves: { priority: string; text: string }[];
};

const LANDING_COPY: Record<LandingLocale, {
  navLogin: string;
  navCta: string;
  roiLink: string;
  engineLink: string;
  toggleLabel: string;
  badge: string;
  titleLines: [string, string, string];
  subtitle: string;
  description: string;
  primaryCta: string;
  deploymentCta: string;
  finalEyebrow: string;
  finalTitle: string;
  finalDesc: string;
  privacy: string;
  security: string;
  terms: string;
}> = {
  zh: {
    navLogin: "登录",
    navCta: "立即体验",
    roiLink: "ROI 计算",
    engineLink: "引擎",
    toggleLabel: "EN",
    badge: "B2B 销售谋局系统",
    titleLines: ["读懂客户", "谋定而动", "赢下订单"],
    subtitle: "Closr 帮你读懂客户没说出口的话，锁定关键决策人，踩准每一步推进节奏。",
    description: "邮件、会议、IM、CRM 备注——所有跟客户的互动汇到一起，变成实时更新的局势判断：谁在推动、谁在犹豫、下一步该推进谁。复杂大单里，看得准才赢得下。",
    primaryCta: "立即体验",
    deploymentCta: "自部署指南",
    finalEyebrow: "开始行动",
    finalTitle: "CRM 负责记住过去，Closr 帮你赢下接下来最重要的单。",
    finalDesc: "让团队真正围绕客户意图、组织关系与推进路径来行动，每一步都有据可依。",
    privacy: "隐私政策",
    security: "安全说明",
    terms: "服务条款",
  },
  en: {
    navLogin: "Log in",
    navCta: "Start free",
    roiLink: "ROI calculator",
    engineLink: "Engine",
    toggleLabel: "ZH",
    badge: "Customer intelligence for complex B2B revenue teams",
    titleLines: ["Know what buyers mean", "spot the risk early", "close with confidence"],
    subtitle: "Closr turns scattered customer conversations into the account intelligence your team needs to protect momentum and close complex deals.",
    description: "Bring emails, meetings, chats, and CRM notes into one living read of every account: real intent, stakeholder power, deal risk, and the actions most likely to move the opportunity forward.",
    primaryCta: "Start free",
    deploymentCta: "Deployment guide",
    finalEyebrow: "Start now",
    finalTitle: "Your CRM records the past. Closr helps your team win what comes next.",
    finalDesc: "Align every account team around buyer intent, stakeholder coverage, deal evidence, and priority actions.",
    privacy: "Privacy",
    security: "Security",
    terms: "Terms",
  },
};

function parseLandingLocale(searchParams: Record<string, string | string[] | undefined> | undefined): LandingLocale {
  const lang = Array.isArray(searchParams?.lang) ? searchParams?.lang[0] : searchParams?.lang;
  return lang === "zh" ? "zh" : "en";
}

function AccountCommandPanel({ panel, className = "" }: { panel: AccountPanelCopy; className?: string }) {
  return (
    <div className={`closr-float-panel closr-fade-up closr-delay-2 relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0d10] shadow-2xl shadow-black/50 ${className}`}>
      <div className="closr-panel-sheen pointer-events-none absolute inset-0 rounded-[28px]" />
      <div className="relative flex items-center justify-between border-b border-white/8 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-white/84">
            {panel.console}
          </span>
        </div>
        <span className="rounded bg-red-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-red-200">
          {panel.live}
        </span>
      </div>

      <div className="border-b border-white/8 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold tracking-tight text-white">{panel.account}</p>
            <p className="mt-1.5 text-[11px] text-white/50">{panel.accountMeta}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold tabular-nums leading-none text-red-400">78<span className="text-lg text-red-400/70">%</span></p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/50">{panel.winRate}</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-white/6 bg-white/[0.025] px-4 py-3">
          <p className="text-[11px] font-semibold text-[#fca5a5]">{panel.coreLabel}</p>
          <p className="mt-1 text-sm leading-6 text-white/88">{panel.coreText}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {panel.chips.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px]">
              <span className="text-white/45">{item.label}</span>
              <span className={`font-semibold ${item.cls}`}>{item.value}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="border-b border-white/8 px-5 py-4 lg:border-b-0 lg:border-r lg:border-white/8">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">{panel.feedLabel}</p>
          {panel.feed.map((item) => (
            <IntelFeedLine key={item.label} time={item.time} label={item.label} value={item.value} severity={item.severity} isLast={item.isLast} />
          ))}
        </div>

        <div className="px-5 py-4">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">{panel.stakeholderLabel}</p>
          <div className="space-y-2.5">
            {panel.stakeholders.map((item) => (
              <StakeholderRow key={item.role} role={item.role} stance={item.stance} influence={item.influence} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">{panel.judgmentLabel}</p>
          <p className="mt-1.5 text-xs leading-5 text-white/65">{panel.judgmentText}</p>
        </div>
        <div className="px-5 pb-5 pt-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#f87171]">{panel.nextLabel}</p>
          <div className="mt-3 space-y-2">
            {panel.nextMoves.map((item, index) => (
              <div key={item.text} className={`flex items-start gap-3 rounded-lg px-3.5 py-2.5 ${index === 0 ? "border border-red-500/25 bg-red-500/[0.08]" : "border border-white/6 bg-white/[0.02]"}`}>
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${index === 0 ? "bg-red-500/25 text-red-200" : "bg-white/8 text-white/45"}`}>
                  {item.priority}
                </span>
                <p className={`text-xs leading-5 ${index === 0 ? "font-medium text-white/95" : "text-white/75"}`}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EnglishLandingSections() {
  const painPoints = [
    {
      icon: Clock3,
      title: "Signals are scattered",
      desc: "A hesitant sentence in email, silence in a meeting, a forwarded chat thread: the signals that explain the deal are spread across five or six systems.",
    },
    {
      icon: Users,
      title: "Decision power is hidden",
      desc: "You think you are working one contact. In reality, supporters, blockers, budget owners, and procurement are all shaping the outcome.",
    },
    {
      icon: AlertTriangle,
      title: "Action relies on instinct",
      desc: "Teams keep chasing progress, but no one can say who to move next, what to validate, or which risk will stall the deal if ignored.",
    },
  ];

  const scenarios = [
    {
      title: "The customer goes quiet",
      trigger: "No reply for 10 days after a meeting, while internal forwarding and file opens increase.",
      insight: "The champion is still working internally, but finance review and alternative comparison have entered the process.",
      action: "Send ROI comparison first, then arrange a short business-owner meeting.",
    },
    {
      title: "The opportunity appears stuck",
      trigger: "CRM stage has not changed, but two new copied stakeholders and one cross-functional meeting appear.",
      insight: "The deal has moved from single-thread conversation into multi-person decision-making.",
      action: "Complete the stakeholder map and remind the AE to cover the new IT and procurement roles.",
    },
    {
      title: "A competitor appears",
      trigger: "The customer repeatedly asks about go-live timeline, migration cost, and system compatibility.",
      insight: "Procurement comparison has started; the core concern is switching risk and internal accountability.",
      action: "Shift from product demo to risk coverage: implementation path, internal alignment brief, and pilot design.",
    },
  ];

  const systemSteps = [
    {
      icon: MessageSquareText,
      title: "Continuous conversation decoding",
      signal: "Input layer",
      desc: "Turn tone, timing, hesitation, and unstated concerns from email, meetings, and chat into useful account intelligence.",
      output: "Situation read",
    },
    {
      icon: Network,
      title: "Stakeholder relationship mapping",
      signal: "Structure layer",
      desc: "Clarify who is pushing, who can approve, who can block, and where the team is over-dependent on one contact.",
      output: "Relationship path",
    },
    {
      icon: Map,
      title: "Advancement path design",
      signal: "Decision layer",
      desc: "Plan the sequence: who to approach first, what to validate first, and which material to prepare first.",
      output: "Priority actions",
    },
    {
      icon: Shield,
      title: "Risk handling before it is late",
      signal: "Defense layer",
      desc: "Surface procurement, competitor, implementation, and security risks before they take control of the deal.",
      output: "Risk controls",
    },
  ];

  const roles = [
    {
      role: "AE",
      lens: "Deal execution",
      headline: "Who should I move next, and what should I say?",
      bullets: ["The next stakeholder to engage", "The risk to handle first", "The proof needed to keep momentum"],
    },
    {
      role: "Manager",
      lens: "Coaching",
      headline: "Where is the team stuck?",
      bullets: ["Single-threaded deals", "Missing value proof", "Coverage gaps and coaching priorities"],
    },
    {
      role: "VP",
      lens: "Portfolio control",
      headline: "Which deals deserve resources now?",
      bullets: ["High-value deals worth executive support", "Noisy deals with weak internal power", "Account motions that should be repeated"],
    },
  ];

  return (
    <>
      <section className="border-b border-gray-200 bg-white px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="The Problem"
            title="Most teams lose complex deals before the loss is visible in CRM."
            desc="The advantage is not more activity. It is seeing the buying committee shift early enough to protect momentum, change the message, and bring the right people in."
            variant="light"
          />
          <div className="mt-8 grid gap-6 sm:mt-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200">
              {painPoints.map((item) => (
                <div key={item.title} className="bg-gray-50 p-7 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#dc2626]">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-gray-700">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-3xl bg-[#050709] p-8 text-white shadow-2xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f87171]">What changes the outcome</p>
              <h3 className="mt-4 text-2xl font-semibold">You keep selling at the old pace while the customer has already changed the script.</h3>
              <div className="mt-6 space-y-4 text-sm leading-7 text-white/78">
                {[
                  ["Surface signal", "The customer keeps replying, but no new decision maker enters the conversation."],
                  ["Real meaning", "The champion cannot move this alone; organizational inertia is diluting the project."],
                  ["Common mistake", "The team keeps pushing demos, feedback, and another meeting."],
                  ["Result", "By the time procurement or a competitor owns the story, the team realizes momentum is gone."],
                ].map(([label, text]) => (
                  <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#fca5a5]">{label}</p>
                    <p className="mt-1 text-white/88">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Why Closr"
            title="CRM tells you what happened. Closr tells you what the account needs next."
            desc="Traditional systems are built for tracking. Closr is built for revenue teams that need to understand buyer intent, stakeholder power, and risk before the deal slows down."
            variant="light"
          />
          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <div className="rounded-[28px] border border-gray-200 bg-white p-8">
              <h3 className="text-xl font-semibold text-gray-900">Traditional CRM</h3>
              <div className="mt-6 space-y-4">
                {[
                  "Records contacts, stages, activities, and notes so the team knows where the deal is.",
                  "Key buying signals stay buried in chats and meeting notes, leaving sellers to assemble the real picture themselves.",
                  "Useful for reporting and tracking, but weak at answering who to move next.",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <p className="text-sm leading-7 text-gray-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[28px] border border-red-200 bg-white p-8 shadow-xl shadow-red-950/5">
              <h3 className="text-xl font-semibold text-gray-900">Closr Customer Intelligence</h3>
              <div className="mt-6 space-y-4">
                {[
                  "Turns scattered customer updates into a continuously updated account situation view.",
                  "Tracks intent changes, stakeholder relationships, risks, and decision windows so the team knows where the deal really stands.",
                  "Shows the next stakeholder to engage, the risk to handle, and the material the buyer needs next.",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#dc2626]" />
                    <p className="text-sm leading-7 text-gray-800">{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 rounded-2xl bg-red-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#dc2626]">Three parts working together</p>
                <div className="mt-4 grid gap-3">
                  {[
                    { label: "Deep decode", text: "Read the real intent in each person and each conversation." },
                    { label: "Account memory", text: "Turn history into a continuously updated understanding of the account." },
                    { label: "Account plan", text: "Convert intelligence into priority actions, and improve the plan with each outcome." },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-gray-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#050709] px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f87171]">Real deal scenarios</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Three sales moments your team has already seen.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/92">At each critical moment, Closr turns fragmented information into a clear next action.</p>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {scenarios.map((item) => (
              <div key={item.title} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-7">
                <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                <div className="mt-6 space-y-4">
                  {[
                    ["Input", item.trigger],
                    ["Insight", item.insight],
                    ["Action", item.action],
                  ].map(([label, text]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f87171]">{label}</p>
                      <p className="mt-2 text-sm leading-6 text-white/78">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-white px-6 py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#dc2626]">Deep decode</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Read people, language, and the deal situation.</h2>
            <p className="mt-5 text-base leading-8 text-gray-700">
              Every email, meeting, and chat helps Closr identify the customer&apos;s real intent, stakeholder style, and organizational mood, so the team knows who is pushing, who is hesitating, and who may become resistance.
            </p>
            <div className="mt-8 grid gap-4">
              {[
                { label: "Intent recognition", text: "Infer the customer's true priorities from tone, wording changes, and response rhythm." },
                { label: "Role modeling", text: "Identify decision makers, supporters, blockers, and budget owners with influence context." },
                { label: "Conversation interpretation", text: "Turn every interaction into an executable read: what the customer said, and what they did not say." },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="mt-2 text-sm leading-7 text-gray-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-gray-200 bg-gray-50 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc2626]">Executive persona example</p>
            <h3 className="mt-4 text-xl font-semibold text-gray-900">Business VP — the owner of the growth agenda</h3>
            <p className="mt-4 text-sm leading-7 text-gray-700">
              She owns North America growth and channel efficiency. Her pressure is not another tool demo; it is how the system helps the team replicate high-quality pipeline and reduce strategic deal slowdown.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[11px] font-semibold text-[#dc2626]">Her value</p>
                <p className="mt-2 text-sm leading-6 text-gray-800">She can move the project from procurement into a growth-target discussion.</p>
              </div>
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[11px] font-semibold text-red-500">Her concern</p>
                <p className="mt-2 text-sm leading-6 text-gray-800">Slow implementation and weak cross-functional alignment will leave the business team carrying the risk.</p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-[11px] font-semibold text-[#dc2626]">Account plan entry</p>
              <p className="mt-2 text-sm leading-6 text-gray-800">She needs a growth narrative, risk coverage, and an advancement frame that can be used in internal meetings.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-start">
            <div className="rounded-[28px] bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc2626]">Real situation · Global manufacturing group / seven-figure deal</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">The deal must move from single-thread execution to executive breakthrough.</h2>
              <p className="mt-5 text-base leading-8 text-gray-700">
                The regional sales operations leader is now an internal champion and meeting feedback remains positive. But Closr identifies a repeated pattern from account memory: this type of customer has been delayed in the final stage by IT security review, global procurement process, and unclear budget ownership.
              </p>
            </div>
            <div className="rounded-[28px] border border-red-200 bg-white p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dc2626]">Four risks Closr identifies</p>
              <div className="mt-6 space-y-4 text-sm leading-7 text-gray-700">
                <p>1. <span className="font-semibold text-gray-900">Decision layer not closed</span> — the budget owner has not entered the conversation.</p>
                <p>2. <span className="font-semibold text-gray-900">Technical resistance is latent</span> — IT and security get harder to handle the later they appear.</p>
                <p>3. <span className="font-semibold text-gray-900">Champion is single-threaded</span> — momentum is concentrated in one person.</p>
                <p>4. <span className="font-semibold text-gray-900">Enterprise inertia</span> — everyone may verbally agree on value while real approval still drifts.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-white px-6 py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#dc2626]">Account memory</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Every deal carries a complete learning history.</h2>
            <p className="mt-5 text-base leading-8 text-gray-700">
              Contacts, historical interactions, past wins and losses, and organizational changes become a living account memory, so every recommendation has complete context.
            </p>
            <div className="mt-8 grid gap-4">
              {[
                { label: "Context accumulation", text: "Signals from email, meetings, and CRM notes are collected into a continuously updated account memory." },
                { label: "Win/loss pattern recognition", text: "How similar customers were won or lost becomes decision support for the current deal." },
                { label: "Organization change tracking", text: "Key-person departure, department changes, and budget shifts update account context proactively." },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="mt-2 text-sm leading-7 text-gray-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#dc2626]">From memory to action</p>
            <p className="mt-4 text-lg font-semibold text-gray-950">
              Account memory is a living library of advancement experience. At the critical moment, it brings historical win/loss patterns forward and shows how to rewrite the outcome this time.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#050709] px-6 py-24 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.95fr] lg:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f87171]">Account plan · the last mile of revenue execution</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Winning requires the right move at the right moment.</h2>
              <p className="mt-5 text-base leading-8 text-white/80">
                Once the team understands the account and has the right context, it must become concrete action: who to reach, what to say, and in what order. Each outcome then improves the plan.
              </p>
              <div className="mt-8 rounded-[28px] border border-red-500/25 bg-red-500/[0.08] p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ef4444]">Account plan output</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">East China Manufacturing Group — advancement sequence</h3>
                <div className="mt-6 space-y-3">
                  {[
                    "Bring the internal champion to the Business VP and budget owner; lift the project from local pilot to quarterly priority.",
                    "Prepare IT and security answers before formal review, so alignment starts early.",
                    "Build second and third lines beyond the champion to avoid single-person dependency.",
                    "Give procurement a risk-coverage and implementation plan, so the team keeps narrative control.",
                  ].map((item, index) => (
                    <div key={item} className="flex gap-3 rounded-2xl bg-black/20 p-4">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7f1d1d]/20 text-xs font-bold text-[#fecaca]">{index + 1}</span>
                      <p className="text-sm leading-6 text-white/90">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ef4444]">Why action matters most</p>
                <p className="mt-4 text-lg font-semibold text-white">The difference is whether the team makes the right move at the critical moment.</p>
                <p className="mt-3 text-sm leading-7 text-white/88">Signals reveal the situation, account memory adds context, and account planning turns insight into action. Every outcome makes the next recommendation sharper.</p>
              </div>
              <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Continuous learning loop</p>
                <div className="mt-5 space-y-4">
                  <LoopStep index="01" title="Deep decode: see the deal" desc="Identify who is pushing, who is hesitating, and who may become resistance." />
                  <LoopStep index="02" title="Account memory: remember the deal" desc="Use historical interactions, org changes, and win/loss patterns as full context." />
                  <LoopStep index="03" title="Account plan: move the deal" desc="Generate priority actions, proof points, and stakeholder sequence; outcomes update the plan." />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-white px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#dc2626]">Three parts · continuously improving</p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-950">See the deal, remember the deal, move the deal.</h2>
                <p className="mt-5 text-base leading-8 text-gray-700">
                  Each move creates a new signal. Closr keeps customer understanding, historical experience, and team action correcting each other.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: Eye, title: "See", text: "Identify real intent and stakeholder structure" },
                  { icon: Radar, title: "Remember", text: "Preserve account experience and risk patterns" },
                  { icon: Map, title: "Move", text: "Generate priority actions and calibrate outcomes" },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl bg-white p-5 shadow-sm">
                    <item.icon className="h-6 w-6 text-[#dc2626]" />
                    <h3 className="mt-4 text-lg font-semibold text-gray-950">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-700">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-200 bg-gray-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="System capability"
            title="The best team's playbook becomes a repeatable team capability."
            desc="Reading the account, mapping influence, planning actions, and managing risk: Closr turns senior sales experience into a repeatable revenue workflow."
            variant="light"
          />
          <div className="mt-14 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white">
              {systemSteps.map((item, index) => (
                <div key={item.title} className="grid gap-4 border-b border-gray-100 px-7 py-6 last:border-b-0 md:grid-cols-[auto_1fr_auto] md:items-start">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#dc2626]">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="text-lg font-semibold text-gray-950">0{index + 1} · {item.title}</h4>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-700">{item.signal}</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-gray-700">{item.desc}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">Output to next layer</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">{item.output}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-5">
              <div className="rounded-[28px] border border-red-200 bg-red-50 p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#dc2626]">Every role benefits</p>
                <h3 className="mt-3 text-xl font-semibold text-gray-950">Senior sales judgment becomes a repeatable workflow for the whole team.</h3>
                <div className="mt-6 space-y-4">
                  {[
                    ["For AE", "Every deal has a clear next move and a sharper path forward."],
                    ["For Manager", "See exactly who or what is blocking the team and coach with precision."],
                    ["For VP", "Know which deals deserve more resources and where to intervene."],
                  ].map(([label, text]) => (
                    <div key={label} className="border-l-2 border-red-300 pl-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#dc2626]">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-800">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] border border-gray-200 bg-white p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-600">The revenue workflow</p>
                <div className="mt-5 grid gap-3">
                  {[
                    "Customer signals become account evidence.",
                    "The organizational structure becomes clear, so the team knows where to break through.",
                    "Priority actions and risk controls are created together, so the plan stays actionable.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-[#dc2626]" />
                      <p className="text-sm leading-6 text-gray-800">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Role outcomes"
            title="Every role sees the account in the way they need to act."
            desc="Closr gives AEs, managers, and revenue leaders a different view of the same account reality, so execution stays aligned."
            variant="light"
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {roles.map((item) => (
              <div key={item.role} className="rounded-[24px] border border-gray-200 bg-gray-50 p-7">
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-lg bg-red-50 px-3.5 py-2 text-sm font-bold text-[#dc2626]">{item.role}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">{item.lens}</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold leading-8 text-gray-950">{item.headline}</h3>
                <div className="mt-6 space-y-3">
                  {item.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-3 rounded-2xl border border-white bg-white px-4 py-3">
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626]" />
                      <p className="text-sm leading-6 text-gray-800">{bullet}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default async function Home({ searchParams }: { searchParams?: LandingSearchParams }) {
  const locale = parseLandingLocale(searchParams ? await searchParams : undefined);
  const copy = LANDING_COPY[locale];
  const alternateLocale = locale === "zh" ? "en" : "zh";
  const loginHref = locale === "en" ? "/login?lang=en" : "/login";
  const deploymentHref = "https://github.com/skbylife/closr-crm-ai-sales-decisions/blob/main/SELF_HOSTING.md";
  const panel = locale === "en" ? {
    console: "CLOSR // Account workspace",
    live: "Live",
    account: "East China Manufacturing Group",
    accountMeta: "Seven-figure deal · Q2 decision window · Global procurement involved",
    winRate: "Close probability",
    coreLabel: "Account read",
    coreText: "Technical validation has passed. The real risk has shifted to internal ownership, budget alignment, and executive sponsorship.",
    chips: [
      { label: "Budget signal", value: "Warming", cls: "text-white/80" },
      { label: "Org risk", value: "Medium-high", cls: "text-amber-300/90" },
      { label: "Competitive pressure", value: "Active", cls: "text-red-400" },
    ],
    feedLabel: "Signal stream",
    feed: [
      { time: "14:32", label: "Email tone", value: "VP asks about budget path", severity: "high" as const },
      { time: "11:05", label: "Meeting note", value: "Technical validation passed", severity: "low" as const },
      { time: "09:18", label: "Org change", value: "Procurement added to thread", severity: "medium" as const },
      { time: "Yesterday", label: "Competitor signal", value: "Customer asks about migration cost", severity: "high" as const, isLast: true },
    ],
    stakeholderLabel: "Stakeholder posture",
    stakeholders: [
      { role: "Business VP", stance: "supportive" as const, influence: 92 },
      { role: "IT Director", stance: "neutral" as const, influence: 68 },
      { role: "Procurement", stance: "blocking" as const, influence: 57 },
      { role: "Regional champion", stance: "supportive" as const, influence: 76 },
    ],
    judgmentLabel: "Recommended action",
    judgmentText: "The window is open. Bring the budget owner and risk-coverage brief into the next 48 hours, or account momentum may weaken.",
    nextLabel: "Priority actions",
    nextMoves: [
      { priority: "P0", text: "Bring the Business VP and budget owner into the conversation; move the deal from pilot evaluation to quarterly growth priority." },
      { priority: "P1", text: "Send the implementation path and risk-coverage brief before security and migration concerns slow the process." },
      { priority: "P2", text: "Build a second path before procurement formally enters, so the deal is not dependent on one champion." },
    ],
  } : {
    console: "CLOSR // 账户指挥台",
    live: "实时",
    account: "华东制造集团",
    accountMeta: "七位数商机 · Q2 决策窗 · 全球采购链路介入",
    winRate: "胜率预测",
    coreLabel: "核心判断",
    coreText: "技术验证通过后，博弈已转向内部背锅成本。预算负责人尚未进场，窗口正在收窄。",
    chips: [
      { label: "预算温度", value: "升温", cls: "text-white/80" },
      { label: "组织风险", value: "中高", cls: "text-amber-300/90" },
      { label: "竞对压力", value: "出现", cls: "text-red-400" },
    ],
    feedLabel: "信号流",
    feed: [
      { time: "14:32", label: "邮件情绪", value: "VP 主动提及预算路径", severity: "high" as const },
      { time: "11:05", label: "会议纪要", value: "技术验证通过", severity: "low" as const },
      { time: "09:18", label: "组织变化", value: "新增采购抄送人", severity: "medium" as const },
      { time: "昨日", label: "竞对信号", value: "客户询问迁移成本", severity: "high" as const, isLast: true },
    ],
    stakeholderLabel: "利益相关方态势",
    stakeholders: [
      { role: "业务 VP", stance: "支持" as const, influence: 92 },
      { role: "IT 总监", stance: "中立" as const, influence: 68 },
      { role: "采购经理", stance: "阻碍" as const, influence: 57 },
      { role: "区域推动者", stance: "支持" as const, influence: 76 },
    ],
    judgmentLabel: "CLOSR 判断",
    judgmentText: "窗口已打开 — 48h 内把预算负责人与风险对冲材料拉进局势，才能继续掌握叙事主动权。",
    nextLabel: "谋局 / 下一步",
    nextMoves: [
      { priority: "P0", text: "引入业务 VP 与预算负责人，把项目从试点评估升格为季度增长动作。" },
      { priority: "P1", text: "发送实施路径与风险对冲摘要，提前处理迁移与安全疑虑。" },
      { priority: "P2", text: "在采购正式介入前建立第二推进线，避免单点失速。" },
    ],
  };

  return (
    <div className="closr-marketing-fixed-theme flex min-h-screen flex-col bg-[#050709]">
      <nav className="closr-glass-nav sticky top-0 z-50 border-b border-white/5 bg-[#06080a]/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <ClosrLogo size="lg" variant="dark" />
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              href={`/?lang=${alternateLocale}`}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-white/25 hover:text-white"
              aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
            >
              {copy.toggleLabel}
            </Link>
            <Link
              href={locale === "en" ? "/roi?lang=en" : "/roi"}
              className="text-xs font-medium text-white/78 transition-colors hover:text-white sm:text-sm"
            >
              {copy.roiLink}
            </Link>
            <Link
              href={locale === "en" ? "/engine?lang=en" : "/engine"}
              className="text-xs font-medium text-white/78 transition-colors hover:text-white sm:text-sm"
            >
              {copy.engineLink}
            </Link>
            <Link href={loginHref} className="text-sm font-medium text-white/92 transition-colors hover:text-white">
              {copy.navLogin}
            </Link>
            <Link
              href={loginHref}
              className="glow-button rounded-lg bg-[#991b1b] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-950/30 transition-all hover:bg-[#b91c1c]"
            >
              {copy.navCta}
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <section className="closr-hero-stage relative flex min-h-[calc(100vh-73px)] items-center overflow-hidden bg-[#050709] py-20">
          <HeroScrubVideo />
          <div
            className="closr-hero-grid pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="closr-hero-orbit closr-hero-orbit-a pointer-events-none absolute rounded-full" />
          <div className="closr-hero-orbit closr-hero-orbit-b pointer-events-none absolute rounded-full" />
          <div className="closr-hero-beam pointer-events-none absolute left-[-18%] top-[18%] h-px w-[62%] rotate-[-18deg]" />

          <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-8">
            <div className="max-w-3xl pt-4">
              <div className="closr-fade-up closr-delay-1 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-white/88">
                <Target className="h-3.5 w-3.5 text-[#f87171]" />
                {copy.badge}
              </div>

              <h1 className="closr-fade-up closr-delay-2 mt-8 text-4xl font-bold leading-[1.06] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
                {copy.titleLines[0]}
                <br />
                {copy.titleLines[1]}
                <br />
                <span className="text-[#ef4444]">{copy.titleLines[2]}</span>
              </h1>

              <p className="closr-fade-up closr-delay-3 mt-6 max-w-2xl text-lg font-medium leading-8 text-white/92">
                {copy.subtitle}
              </p>
              <p className="closr-fade-up closr-delay-4 mt-3 max-w-2xl text-sm leading-7 text-white/92">
                {copy.description}
              </p>

              <div className="closr-fade-up closr-delay-5 mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href={loginHref}
                  className="glow-button inline-flex items-center gap-2 rounded-lg bg-[#991b1b] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition-all hover:bg-[#b91c1c]"
                >
                  {copy.primaryCta}
                </Link>
                <Link
                  href={deploymentHref}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-white/92 transition-all hover:bg-white/[0.06] hover:text-white"
                >
                  {copy.deploymentCta}
                  <ArrowRight className="h-4 w-4 text-white/40" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-white/8 bg-[#050709] px-6 py-14 sm:py-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/40 to-transparent" />
          <div className="mx-auto max-w-6xl">
            <AccountCommandPanel panel={panel} className="mx-auto max-w-5xl" />
          </div>
        </section>

        {locale === "en" ? <EnglishLandingSections /> : (
        <>
        <section className="border-b border-gray-200 bg-white px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="痛点"
              title="多数团队输单，因为看到信号的时候已经晚了。"
              desc="复杂大单里，真正决定输赢的，是你有没有在客户内部发生变化的那一刻就看到，并且提前布好局。"
              variant="light"
            />

            <div className="mt-8 grid gap-6 sm:mt-12 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200">
                {[
                  {
                    icon: Clock3,
                    title: "信号分散",
                    desc: "邮件里一句犹豫、会议里一个沉默、IM 里一次转发——这些真正说明局势的线索，散落在五六个系统里，没人帮你串起来。",
                  },
                  {
                    icon: Users,
                    title: "决策不可见",
                    desc: "你以为对接的是一个联系人，实际面对的是一组利益关系：支持者、阻碍者、预算控制者与拖延者在同时影响这笔单。",
                  },
                  {
                    icon: AlertTriangle,
                    title: "动作靠直觉",
                    desc: "团队忙着追进度，但没人告诉你：现在该推进谁、验证什么、哪个风险如果不处理会直接把单子拖死。",
                  },
                ].map((item) => (
                  <div key={item.title} className="bg-gray-50 p-7 sm:p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#dc2626]">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-gray-700">{item.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-red-200 bg-red-50 p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#dc2626]">局势后果</p>
                <h3 className="mt-4 text-2xl font-semibold text-gray-900">你还在按原来的节奏追，客户内部已经悄悄换了剧本。</h3>
                <div className="mt-8 space-y-5">
                  {[
                    ["表面现象", "客户继续回复，但决策层没有新增角色进场。"],
                    ["真实含义", "支持者没法独自推进，项目正在被组织惯性稀释。"],
                    ["常见误判", "销售继续催演示、催反馈、催下一次会议。"],
                    ["结果", "直到采购或竞对接管叙事时，团队才意识到节奏已丢。"],
                  ].map(([label, text]) => (
                    <div key={label} className="border-l-2 border-red-300 pl-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-600">{label}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-700">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gray-50 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="为什么需要 Closr"
              title="CRM 帮你记账，Closr 帮你赢单。"
              desc="传统工具记录发生过什么，Closr 告诉团队接下来该怎么推、找谁、用什么路径。"
              variant="light"
            />

            <div className="mt-14 grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
              <div className="rounded-3xl border border-gray-200 bg-white p-8">
                <h3 className="text-xl font-semibold text-gray-900">传统 CRM</h3>
                <div className="mt-6 space-y-4">
                  {[
                    "记录联系人、阶段、活动与备注，让团队知道事情做到哪一步了。",
                    "关键信号留在聊天记录和会议纪要里，还要靠销售自己拼出全貌。",
                    "适合汇报和追踪，但很难直接回答下一步该找谁突破。",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                      <p className="text-sm leading-7 text-gray-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-red-200 bg-red-50 p-8">
                <div className="grid gap-8 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">Closr 销售谋局系统</h3>
                    <div className="mt-6 space-y-4">
                      {[
                        "把持续沟通里散落的线索，整理成一张不断更新的局势视图。",
                        "持续追踪意图变化、角色关系、风险和窗口期，让团队知道这笔单到底走到哪一步。",
                        "直接给出该找谁、怎么推进、带什么材料，让团队围绕赢单动作协同。",
                      ].map((item) => (
                        <div key={item} className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#dc2626]" />
                          <p className="text-sm leading-7 text-gray-700">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-red-200 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#dc2626]">三步形成合力</p>
                    <div className="mt-4 space-y-4">
                      {[
                        { label: "深度解读", text: "读清每个人和每次对话中的真实意图。" },
                        { label: "账户记忆", text: "把历史互动沉淀为持续更新的认知积累。" },
                        { label: "谋局推进", text: "把判断直接转成动作，越打越准。" },
                      ].map((item, index) => (
                        <div key={item.label} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-[#dc2626]">
                            {index + 1}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                            <p className="mt-1 text-sm leading-6 text-gray-700">{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#050709] px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f87171]">实局势景</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                三个你一定遇过的推进场景。
              </h2>
              <p className="mt-4 text-base leading-7 text-white/92">每个关键时刻，Closr 帮你把碎片信息变成明确动作。</p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {[
                {
                  num: "01",
                  title: "客户突然沉默",
                  trigger: "会议后 10 天没有回复，但内部转发链条与附件打开行为变多。",
                  insight: "内部支持者仍在推动，新增财务审查与替代方案比较，风险来自投资回报论证不够。",
                  action: "先发 ROI 对照材料，再安排业务负责人参与的短会。",
                },
                {
                  num: "02",
                  title: "项目推进卡住",
                  trigger: "CRM 阶段没变，团队认为停滞；但近两周新增两位抄送对象与一次跨部门会议。",
                  insight: "局面已从单点沟通进入多人决策阶段，复杂度正在上升。",
                  action: "补齐利益相关方图谱，提醒 AE 覆盖新进入的 IT 与采购角色。",
                },
                {
                  num: "03",
                  title: "竞争对手出现",
                  trigger: "客户开始反复询问上线周期、迁移成本与系统兼容性。",
                  insight: "采购比较已经开始，客户核心顾虑是切换风险与内部背锅成本。",
                  action: "策略从产品演示切换为风险对冲：实施路径 + 内部共识文档 + 试点设计。",
                },
              ].map((item) => (
                <div key={item.num} className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                  <span className="font-mono text-xs font-bold text-[#f87171]">{item.num}</span>
                  <h3 className="mt-2 text-lg font-semibold text-white">{item.title}</h3>
                  <div className="mt-5 space-y-3 text-sm leading-6">
                    <p>
                      <span className="font-semibold text-white/92">输入</span>
                      <span className="mx-1.5 text-white/20">—</span>
                      <span className="text-white/92">{item.trigger}</span>
                    </p>
                    <p>
                      <span className="font-semibold text-[#f87171]">洞察</span>
                      <span className="mx-1.5 text-white/20">—</span>
                      <span className="text-white/92">{item.insight}</span>
                    </p>
                    <p>
                      <span className="font-semibold text-[#fecaca]">动作</span>
                      <span className="mx-1.5 text-white/20">—</span>
                      <span className="text-white/88">{item.action}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-gray-200 bg-white px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#dc2626]">深度解读</p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">读人、读话、读局</h2>
                <p className="mt-4 text-base leading-7 text-gray-700">
                  每一通邮件、每一次会议、每一段 IM 对话，Closr 都在持续识别客户的真实意图、角色风格和组织情绪。让团队随时知道谁在推动、谁在犹豫、谁可能成为阻力。
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    {
                      icon: Eye,
                      label: "意图识别",
                      text: "从语气、措辞变化与回复节奏中判断客户的真实优先级。",
                    },
                    {
                      icon: Users,
                      label: "角色建模",
                      text: "自动识别决策者、支持者、阻碍者与预算控制者的影响力关系。",
                    },
                    {
                      icon: MessageSquareText,
                      label: "沟通解读",
                      text: "把每次客户互动变成可执行判断：对方到底在说什么，没说什么。",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#dc2626]">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                        <p className="mt-0.5 text-sm leading-6 text-gray-700">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5">
                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-7 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-[#dc2626]" />
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-700">
                      高层人物画像示例
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-gray-900">业务 VP — 内部增长议程的推动者</h3>
                  <p className="mt-3 text-sm leading-7 text-gray-700">
                    负责北美增长与渠道效率，对季度营收目标有硬压力。她关注的是系统如何帮助团队更快复制高质量商机管道、减少关键大单失速。
                  </p>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-[11px] font-semibold text-[#dc2626]">她的价值</p>
                      <p className="mt-1 text-xs leading-5 text-gray-700">
                        能把项目从一笔采购，拉高成一场和增长目标直接相关的讨论。
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-[11px] font-semibold text-red-500">她的顾虑</p>
                      <p className="mt-1 text-xs leading-5 text-gray-700">
                        落地慢、跨部门协同弱，最终业务团队承担全部压力。
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-[11px] font-semibold text-[#dc2626]">对应谋局入口</p>
                    <p className="mt-1 text-xs leading-6 text-gray-700">
                      她要的是可带进内部会议的增长叙事、风险对冲与推进框架。
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-gray-50 p-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Brain className="h-4 w-4 text-[#dc2626]" />
                    沟通风格信号
                  </div>
                  <div className="mt-4 space-y-2.5">
                    {[
                      "推进风格偏结果导向，沟通应直给结论、少铺垫。",
                      "组织影响力敏感度高，需提供可内部转述的价值叙事。",
                      "对实施路径和风险验证有追问倾向，准备量化证据。",
                      "决策节奏快但容忍度低，超过两轮未推进将流失注意力。",
                    ].map((text) => (
                      <div key={text} className="flex items-start gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#dc2626]" />
                        <p className="text-xs leading-6 text-gray-700">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-gray-200 bg-gray-50 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
              <div className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#dc2626]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
                    实局势景 · 全球化制造集团 / 七位数商机
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  局势需要马上从单线程切到决策层突破。
                </h3>
                <p className="mt-4 text-sm leading-7 text-gray-700">
                  区域销售运营负责人已成为内部推动者，会议反馈持续积极；但 Closr 从历史互动与账户记忆里识别出，这类客户过去 18 个月内多次在最后阶段被 IT 安全审查、全球采购流程和预算归属不清晰拖延。
                </p>

                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dc2626]">Closr 识别到的四个风险</p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
                    <p>1. <span className="font-semibold text-gray-900">决策层未闭合</span> —— 预算分配权人还没进入对话。</p>
                    <p>2. <span className="font-semibold text-gray-900">技术阻力潜伏</span> —— IT / 安全越晚处理越容易被一票打回。</p>
                    <p>3. <span className="font-semibold text-gray-900">推动者单线程</span> —— 推动力集中在一人身上。</p>
                    <p>4. <span className="font-semibold text-gray-900">大客户惯性</span> —— 大家口头上都认可价值，但真正拍板往往还会拖很久。</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#dc2626]">账户记忆</p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">每笔单都有完整的认知积累</h2>
                <p className="mt-4 text-base leading-7 text-gray-700">
                  联系人、历史互动、过去的输赢经验、组织变化——Closr 把这些串成一张持续更新的记忆网，让团队每次判断都有完整上下文。
                </p>

                <div className="mt-8 space-y-4">
                  {[
                    {
                      icon: Layers,
                      label: "上下文积累",
                      text: "跨邮件、会议、CRM 备注的全量信号自动归集，形成持续更新的账户记忆。",
                    },
                    {
                      icon: TrendingUp,
                      label: "输赢模式识别",
                      text: "这类客户过去怎么赢的、怎么输的，历史经验转化为当前决策参考。",
                    },
                    {
                      icon: Network,
                      label: "组织变化追踪",
                      text: "关键人离职、部门重组、预算调整，系统主动更新账户上下文。",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#dc2626]">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                        <p className="mt-0.5 text-sm leading-6 text-gray-700">{item.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#dc2626]">从记忆到行动</p>
                  <p className="mt-3 text-sm leading-7 text-gray-700">
                    账户记忆是一座活的推进经验库——关键时刻把历史输赢模式推到台前，告诉你这类局过去怎么死的，这次该怎样提前改写结局。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-[#050709] px-6 py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.04),transparent_34%),radial-gradient(circle_at_80%_50%,rgba(148,163,184,0.05),transparent_36%)]" />

          <div className="relative mx-auto max-w-6xl">
            <div className="text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#7f1d1d]/45 bg-[#7f1d1d]/18 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-[#fecaca]">
                <Zap className="h-3.5 w-3.5" />
                谋局推进 · 赢单的最后一公里
              </p>
              <h2 className="mx-auto mt-6 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                赢单，靠的是打得准。
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/92">
                看懂了局面，积累了记忆，最后要落到具体动作上：找谁、怎么推、按什么顺序突破。每一次推进的结果又会反过来让判断更准。
              </p>
            </div>

            <div className="mt-16 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,15,18,0.97),rgba(5,7,9,0.99))] p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_28px_90px_rgba(0,0,0,0.48)] sm:p-8">
                <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ef4444]">谋局输出</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">华东制造集团 — 推进序列</h3>
                  </div>
                  <div className="rounded-full border border-[#7f1d1d]/50 bg-[#7f1d1d]/18 px-3 py-1 text-xs font-semibold text-[#fecaca]">
                    优先执行
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {[
                    {
                      icon: Target,
                      title: "推进动作",
                      desc: "根据当前局势生成下一步该推进谁、用什么路径、说什么话。",
                    },
                    {
                      icon: MessageSquareText,
                      title: "说服材料",
                      desc: "为内部支持者生成可转述的业务案例、ROI 逻辑与推进节奏。",
                    },
                    {
                      icon: Network,
                      title: "多线触达",
                      desc: "避免单线程绑定，自动规划跨角色的触达路径与时序。",
                    },
                    {
                      icon: Shield,
                      title: "风险对冲",
                      desc: "前置 IT 答疑、采购异议处理与竞对防御，把风险判断提前纳入推进节奏。",
                    }
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/8 bg-[#050709] p-5">
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#7f1d1d]/18 text-[#ef4444]">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-base font-semibold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/92">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-3">
                  {[
                    "让内部推动者引入业务 VP / 预算负责人，把项目从局部试用提升到季度业务优先级。",
                    "前置 IT 与安全答疑材料，在正式评审前主动建立共识。",
                    "在内部推动者之外建立第二、第三条推进线，避免被单点人物绑定。",
                    "向采购线输出风险对冲与实施计划，把叙事权拿回来。",
                  ].map((item, index) => (
                    <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7f1d1d]/20 text-xs font-bold text-[#fecaca]">
                        {index + 1}
                      </span>
                      <p className="text-sm leading-6 text-white/90">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ef4444]">为什么推进最重要</p>
                  <p className="mt-4 text-lg font-semibold text-white">真正拉开差距的，是关键时刻有没有打对那一步。</p>
                  <p className="mt-3 text-sm leading-7 text-white/88">
                    持续沟通带来信号，账户记忆补齐背景，谋局推进把判断落到动作上。团队每推进一次，系统就更了解这笔单，下一次判断也会更准。
                  </p>
                </div>

                <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">持续进化</p>
                  <div className="mt-5 space-y-4">
                    <LoopStep index="01" title="深度解读：看清局" desc="识别谁在推动、谁在迟疑、谁会成为阻力。" />
                    <LoopStep index="02" title="账户记忆：记住局" desc="结合历史互动、组织变化与输赢经验，始终基于完整上下文判断。" />
                    <LoopStep index="03" title="谋局推进：打穿局" desc="输出下一步打法、说服材料与触达顺序，推进结果又反过来更新判断。" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-gray-200 bg-white px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-3xl border border-red-200 bg-red-50 p-8 sm:p-10">
              <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#dc2626]">三步合一 · 持续进化</p>
                  <p className="mt-3 text-lg font-semibold text-gray-900">
                    看清局、记住局、打穿局——三步持续联动，越打越准。
                  </p>
                  <p className="mt-2 text-sm leading-7 text-gray-700">
                    每一次推进动作产生的新信号，又会反过来更新判断。Closr 的核心差异就在这里：让你对客户的理解、历史经验和进攻动作不断相互校正，形成一套持续进化的推进系统。
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { icon: Eye, title: "看见", text: "识别真实意图与人物结构" },
                    { icon: Radar, title: "记住", text: "沉淀账户经验与风险模式" },
                    { icon: Map, title: "推进", text: "生成可执行打法并校正结果" },
                  ].map((item) => (
                    <div key={item.title} className="rounded-2xl border border-red-200 bg-white p-5">
                      <item.icon className="h-5 w-5 text-[#dc2626]" />
                      <p className="mt-3 text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-1 text-xs leading-6 text-gray-700">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-gray-200 bg-gray-50 px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="系统能力"
              title="高手的打法，慢慢变成整个团队的能力。"
              desc="读局、布点、推演、控风险——Closr 把顶尖销售在复杂大单里的经验，整理成团队都能复用的推进方式。"
              variant="light"
            />

            <div className="mt-14 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 bg-gray-50 px-7 py-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#dc2626]">从信号到行动</p>
                  <h3 className="mt-3 text-2xl font-semibold text-gray-950">四步把客户信号变成团队动作</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-700">
                    前面负责看懂局势，中间负责理清路径，后面负责推进行动与控住风险。一套围绕赢单持续运转的推进流程。
                  </p>
                </div>

                <div className="divide-y divide-gray-200">
                  {[
                    {
                      icon: MessageSquareText,
                      title: "持续沟通解读",
                      signal: "输入层",
                      desc: "把客户在邮件、会议、IM 里的语气、节奏和没说出口的顾虑，整理成团队能直接使用的判断。",
                    },
                    {
                      icon: Network,
                      title: "角色关系梳理",
                      signal: "结构层",
                      desc: "把谁在推动、谁能拍板、谁会挡住项目，一层层理清楚，避免团队被单一联系人绑住。",
                    },
                    {
                      icon: Map,
                      title: "推进路径设计",
                      signal: "决策层",
                      desc: "根据当前局势安排推进顺序：先找谁、先验证什么、先补哪块材料，团队能直接照着打。",
                    },
                    {
                      icon: Shield,
                      title: "风险提前处理",
                      signal: "防御层",
                      desc: "在商机还没变冷之前就把采购、竞对、实施、安全这些风险拉到台前，别等它们在最后一刻接管局面。",
                    },
                  ].map((item, index) => (
                    <div key={item.title} className="grid gap-4 px-7 py-6 md:grid-cols-[auto_1fr_auto] md:items-start">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#dc2626]">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="text-lg font-semibold text-gray-950">0{index + 1} · {item.title}</h4>
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-700">
                            {item.signal}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-gray-700">{item.desc}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">输出到下一层</p>
                        <p className="mt-2 text-sm font-medium text-gray-900">
                          {index === 0 && "局势判断"}
                          {index === 1 && "角色路径"}
                          {index === 2 && "行动序列"}
                          {index === 3 && "风险护栏"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[28px] border border-red-200 bg-red-50 p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#dc2626]">每个角色都受益</p>
                  <h3 className="mt-3 text-xl font-semibold text-gray-950">高手的打法沉淀进系统，整个团队的判断力一起提升。</h3>
                  <div className="mt-6 space-y-4">
                    {[
                      ["对 AE", "每笔单都有明确的下一步打法，精准推进。"],
                      ["对经理", "清晰看到团队究竟卡在谁、卡在什么，针对性辅导。"],
                      ["对 VP", "精确掌握哪些项目值得追加资源，全盘调度有据可依。"],
                    ].map(([label, text]) => (
                      <div key={label} className="border-l-2 border-red-300 pl-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#dc2626]">{label}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-800">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-gray-200 bg-white p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-600">系统就是推进回路</p>
                  <div className="mt-5 grid gap-3">
                    {[
                      "信号进入系统，被持续解读、归拢、转化为判断依据。",
                      "组织结构被补齐，团队知道该从哪里突破。",
                      "推进动作与风险护栏同步生成，形成真正可执行的谋局能力。",
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <span className="mt-1 h-2 w-2 rounded-full bg-[#dc2626]" />
                        <p className="text-sm leading-6 text-gray-800">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeader
              eyebrow="按角色看成果"
              title="不同角色，看到的是不同局势。"
              desc="Closr 让 AE、销售经理、销售 VP 各自获得自己最需要的判断视角，按角色精准交付。"
              variant="light"
            />
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {[
                {
                  role: "AE",
                  lens: "一线推进视角",
                  headline: "我下一步该找谁、说什么、先拆哪个阻力？",
                  summary: "AE 看到的就是眼前这笔单的具体打法，即刻可用。",
                  bullets: [
                    "当前最该推进的关键人是谁",
                    "要验证的假设与需要补齐的材料",
                    "哪一个阻力如果不先处理，会直接拖慢成交",
                  ],
                },
                {
                  role: "销售经理",
                  lens: "辅导与校正视角",
                  headline: "团队到底卡在能力、路径，还是账户结构？",
                  summary: "经理看到的是队伍为何推进失速，以及应该如何具体辅导。",
                  bullets: [
                    "哪笔单是单线程推进，存在人物绑定风险",
                    "哪位 AE 缺的是价值证明、角色突破还是风险处理",
                    "辅导动作精准落在账户策略层面",
                  ],
                },
                {
                  role: "销售 VP",
                  lens: "组合与资源视角",
                  headline: "哪些项目该加码，哪些热闹商机该尽早降温？",
                  summary: "VP 看到的是整条管线的胜率结构、资源投放点与高层介入时机。",
                  bullets: [
                    "哪些大单值得拉高层资源介入",
                    "哪些商机只是表面活跃，但内部并未真正成局",
                    "哪些打法正在被验证，适合复制到更大团队",
                  ],
                },
              ].map((item) => (
                <div key={item.role} className="rounded-[28px] border border-gray-200 bg-gray-50 p-7 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="rounded-lg bg-red-50 px-3.5 py-2 text-sm font-bold text-[#dc2626]">{item.role}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-600">{item.lens}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold leading-8 text-gray-950">{item.headline}</h3>
                  <p className="mt-3 text-sm leading-7 text-gray-700">{item.summary}</p>
                  <div className="mt-6 space-y-3">
                    {item.bullets.map((bullet) => (
                      <div key={bullet} className="flex items-start gap-3 rounded-2xl border border-white bg-white px-4 py-3">
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626]" />
                        <p className="text-sm leading-6 text-gray-800">{bullet}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        </>
        )}

        <section className="bg-white px-6 pb-24 pt-8">
          <div className="mx-auto max-w-4xl rounded-[28px] bg-[#050709] px-8 py-16 text-center text-white shadow-2xl shadow-black/20 sm:px-14">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#f87171]">{copy.finalEyebrow}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {copy.finalTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-white/92">
              {copy.finalDesc}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href={loginHref}
                className="glow-button inline-flex items-center gap-2 rounded-lg bg-[#991b1b] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition-all hover:bg-[#b91c1c]"
              >
                {copy.primaryCta}
              </Link>
              <Link
                href={deploymentHref}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-8 py-3.5 text-sm font-semibold text-white/92 transition-all hover:bg-white/[0.06] hover:text-white"
              >
                {copy.deploymentCta}
                <Target className="h-4 w-4 text-white/92" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e5e7eb] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
          <div className="flex items-center gap-2">
            <ClosrLogo size="sm" variant="light" />
            <span className="text-sm text-[#6b7280]">© 2026 BABEL. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-xs text-[#6b7280] hover:text-[#111827]">
              {copy.privacy}
            </Link>
            <Link href="/security" className="text-xs text-[#6b7280] hover:text-[#111827]">
              {copy.security}
            </Link>
            <Link href="/terms" className="text-xs text-[#6b7280] hover:text-[#111827]">
              {copy.terms}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
