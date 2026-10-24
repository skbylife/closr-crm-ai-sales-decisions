import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { ClosrLogo } from "@/components/ui/closr-logo";

export const metadata: Metadata = {
  title: "Security Packet | Closr",
  description: "Closr security packet and trial data boundary for enterprise evaluation.",
};

type SecurityLocale = "zh" | "en";
type SecuritySearchParams = Promise<Record<string, string | string[] | undefined>>;

const SECURITY_COPY = {
  en: {
    homeHref: "/?lang=en",
    loginHref: "/login?lang=en",
    privacyHref: "/privacy",
    termsHref: "/terms",
    navPrivacy: "Privacy",
    navTerms: "Terms",
    navLogin: "Sign in",
    toggleLabel: "ZH",
    toggleHref: "/security?lang=zh",
    badge: "Enterprise Pilot",
    title: "Start a Closr pilot without changing your core systems.",
    intro: "Closr lets revenue teams test better account judgment with a small, approved set of customer signals. Start with selected accounts, approved notes, and public evidence, then expand only when the pilot proves value.",
    primaryCta: "Start a secure pilot",
    secondaryCta: "Contact security",
    postureLabel: "A practical way to start",
    posture: [
      ["Choose one team", "Pick a sales team, region, or strategic account group for the first evaluation."],
      ["Use approved signals", "Begin with selected account records, meeting notes, call summaries, and public evidence."],
      ["Keep systems stable", "The pilot can run without full CRM migration, mailbox-wide sync, or production writeback."],
      ["Expand by evidence", "Use pilot results to decide what data, deployment, and controls should come next."],
    ],
    trial: {
      eyebrow: "Pilot scope",
      title: "Start with enough real context to test value.",
      body: "The first pilot should show whether Closr helps a team understand customer risk, momentum, and next actions faster. It does not need every system connected on day one.",
      allowTitle: "Use these first",
      excludeTitle: "Save these for later review",
      allow: [
        "Selected accounts and opportunities",
        "Approved meeting notes, call summaries, or email excerpts",
        "Public or customer-approved evidence",
        "Sanitized stakeholder roles, buying criteria, and deal context",
      ],
      exclude: [
        "Full CRM migration",
        "Full mailbox archive",
        "Contracts, pricing books, and legal documents",
        "Production credentials, secrets, or write access",
      ],
    },
    controls: {
      eyebrow: "Pilot controls",
      title: "The important checks are part of the pilot plan.",
      body: "Before testing begins, the team can confirm data scope, access rules, AI processing, deployment preference, and the path from pilot to production.",
      items: [
        {
          icon: LockKeyhole,
          title: "Who can see what",
          body: "Define which users can access pilot data, which actions require admin or owner permission, and which changes should be recorded for review.",
        },
        {
          icon: Database,
          title: "Where the pilot runs",
          body: "Start with a controlled hosted pilot, or prepare a dedicated or customer-managed deployment when your policy requires isolated infrastructure or specific data location.",
        },
        {
          icon: KeyRound,
          title: "How AI is used",
          body: "Confirm the approved model route, what data may be processed, no-training expectations, and what operational logs are kept.",
        },
        {
          icon: FileCheck2,
          title: "How production is approved",
          body: "When the pilot is ready to expand, confirm backup, restore, monitoring, incident response, and support expectations for the selected deployment.",
        },
      ],
    },
    packet: {
      eyebrow: "Review packet",
      title: "Clear answers for internal review.",
      body: "Closr provides a concise packet that helps stakeholders understand the pilot scope, data handling, AI processing, deployment choices, and production checklist.",
      items: [
        "Pilot scope and data inputs",
        "Data handling and retention",
        "Access control and audit logging",
        "AI processing and model routing",
        "Customer-managed model option",
        "Deployment and data location options",
        "Backup and restore expectations",
        "Monitoring and incident response",
        "Commercial and data terms for review",
        "Pilot-to-production checklist",
      ],
    },
    nonClaims: {
      eyebrow: "Next step",
      title: "Use the pilot to make a confident rollout decision.",
      body: "After the first team validates value, Closr helps turn the pilot into a clear rollout plan: what to connect, which deployment path to use, and what approvals are needed before production.",
      items: [
        "Which teams should join next",
        "Which systems should be connected",
        "Which model route should be used",
        "Which deployment option fits policy",
        "Which data terms should be finalized",
        "Which production checks must pass",
      ],
    },
    copyright: "(c) 2026 BABEL. All rights reserved.",
  },
  zh: {
    homeHref: "/?lang=zh",
    loginHref: "/login?lang=zh",
    privacyHref: "/privacy",
    termsHref: "/terms",
    navPrivacy: "隐私政策",
    navTerms: "服务条款",
    navLogin: "登录",
    toggleLabel: "EN",
    toggleHref: "/security?lang=en",
    badge: "企业试点",
    title: "不改动核心系统，也可以先测试 Closr。",
    intro: "Closr 让销售团队先用一小组经过批准的客户信号验证价值。先选择目标客户、已批准的会议记录和公开证据，看到效果后再决定是否扩大接入。",
    primaryCta: "申请安全试点",
    secondaryCta: "联系安全团队",
    postureLabel: "更容易开始的试点方式",
    posture: [
      ["先选一个团队", "从一个销售团队、区域或重点客户组开始验证。"],
      ["先用批准资料", "从客户记录、会议纪要、通话摘要和公开证据开始。"],
      ["先不动核心系统", "试点不需要完整客户关系管理系统迁移、邮箱全量同步或生产写入。"],
      ["用结果决定扩大", "根据试点效果决定下一步接入哪些数据、采用哪种部署方式。"],
    ],
    trial: {
      eyebrow: "试点范围",
      title: "先用足够真实的上下文验证价值。",
      body: "第一次试点要回答的是：Closr 能不能帮助团队更快看清客户风险、推进动量和下一步行动。这个验证不需要第一天就接入所有系统。",
      allowTitle: "先放入这些内容",
      excludeTitle: "这些留到后续再评估",
      allow: [
        "选定的目标客户和商机",
        "已批准的会议纪要、通话摘要或邮件片段",
        "公开信息或客户批准的证据",
        "脱敏后的干系人角色、采购标准和项目背景",
      ],
      exclude: [
        "完整客户关系管理系统迁移",
        "完整邮箱归档",
        "合同、价格本和法律文件",
        "生产凭证、密钥或写入权限",
      ],
    },
    controls: {
      eyebrow: "试点控制",
      title: "关键安全问题，会作为试点计划的一部分确认。",
      body: "开始测试前，可以先确认数据范围、访问规则、人工智能处理方式、部署偏好，以及从试点进入生产的条件。",
      items: [
        {
          icon: LockKeyhole,
          title: "谁可以看什么",
          body: "明确哪些用户可以访问试点数据，哪些操作需要管理员或所有者权限，哪些变更需要留下记录。",
        },
        {
          icon: Database,
          title: "试点运行在哪里",
          body: "可以先使用受控托管试点；如果客户政策要求隔离基础设施或指定数据位置，也可以准备专属部署或客户自管部署。",
        },
        {
          icon: KeyRound,
          title: "人工智能如何使用",
          body: "试点前确认模型路线、可处理的数据范围、不用于训练的要求，以及运维日志保留边界。",
        },
        {
          icon: FileCheck2,
          title: "如何批准进入生产",
          body: "试点准备扩大时，再确认所选部署方式下的备份、恢复、监控、事件响应和支持要求。",
        },
      ],
    },
    packet: {
      eyebrow: "评估资料",
      title: "把试点需要确认的问题提前说清楚。",
      body: "Closr 提供一套简洁的评估资料，帮助客户了解试点范围、数据处理、人工智能使用、部署选择和进入生产前的检查项。",
      items: [
        "试点范围与数据输入",
        "数据处理与保留方式",
        "访问控制与操作记录",
        "人工智能处理与模型路线",
        "客户自有模型选项",
        "部署方式与数据位置",
        "备份与恢复预期",
        "监控与事件响应",
        "商务与数据条款确认",
        "试点到生产检查清单",
      ],
    },
    nonClaims: {
      eyebrow: "下一步",
      title: "用试点结果决定是否扩大使用。",
      body: "当第一个团队验证价值后，Closr 会帮助客户把试点整理成清晰的扩大计划：接入哪些系统、选择哪种部署方式、进入生产前需要通过哪些检查。",
      items: [
        "下一批加入的团队",
        "下一步接入的系统",
        "后续采用的模型路线",
        "符合政策的部署方式",
        "需要确认的数据条款",
        "进入生产前的检查项",
      ],
    },
    copyright: "(c) 2026 BABEL. 保留所有权利。",
  },
} as const;

function parseSecurityLocale(searchParams: Record<string, string | string[] | undefined> | undefined): SecurityLocale {
  const lang = Array.isArray(searchParams?.lang) ? searchParams?.lang[0] : searchParams?.lang;
  return lang === "en" ? "en" : "zh";
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h2>
      <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">{body}</p>
    </div>
  );
}

export default async function SecurityPacketPage({ searchParams }: { searchParams: SecuritySearchParams }) {
  const locale = parseSecurityLocale(await searchParams);
  const copy = SECURITY_COPY[locale];

  return (
    <div className="min-h-screen bg-[#f7f5f1] text-slate-950">
      <header className="border-b border-slate-200 bg-[#f7f5f1]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href={copy.homeHref} aria-label="Closr home">
            <ClosrLogo size="lg" variant="light" />
          </Link>
          <nav className="flex items-center gap-3 text-sm sm:gap-4">
            <Link href={copy.privacyHref} className="hidden font-medium text-slate-600 transition-colors hover:text-slate-950 sm:inline">
              {copy.navPrivacy}
            </Link>
            <Link href={copy.termsHref} className="hidden font-medium text-slate-600 transition-colors hover:text-slate-950 sm:inline">
              {copy.navTerms}
            </Link>
            <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5" aria-label="Language switcher">
              <Link
                href="/security?lang=zh"
                aria-current={locale === "zh" ? "page" : undefined}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  locale === "zh" ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                中文
              </Link>
              <Link
                href="/security?lang=en"
                aria-current={locale === "en" ? "page" : undefined}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                  locale === "en" ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                English
              </Link>
            </div>
            <Link href={copy.loginHref} className="rounded-md bg-slate-950 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-900">
              {copy.navLogin}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-200 bg-[#f7f5f1] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                <ShieldCheck className="h-4 w-4 text-red-700" />
                {copy.badge}
              </div>
              <h1 className="mt-7 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-tight text-slate-950 sm:text-6xl">{copy.title}</h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg">{copy.intro}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href={copy.loginHref} className="inline-flex items-center gap-2 rounded-md bg-red-800 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-900">
                  {copy.primaryCta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="mailto:example-c9041334fa@example.invalid" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-500">
                  {copy.secondaryCta}
                </a>
              </div>
            </div>

            <div className="border border-slate-300 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{copy.postureLabel}</p>
              <div className="mt-6 space-y-5">
                {copy.posture.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[120px_1fr] gap-4 border-t border-slate-200 pt-4 text-sm sm:grid-cols-[130px_1fr]">
                    <span className="font-semibold text-slate-950">{label}</span>
                    <span className="leading-6 text-slate-600">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow={copy.trial.eyebrow} title={copy.trial.title} body={copy.trial.body} />
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="border border-emerald-200 bg-emerald-50 p-6">
                <h3 className="text-base font-semibold text-emerald-950">{copy.trial.allowTitle}</h3>
                <ul className="mt-5 space-y-3">
                  {copy.trial.allow.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-emerald-950">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-base font-semibold text-slate-950">{copy.trial.excludeTitle}</h3>
                <ul className="mt-5 space-y-3">
                  {copy.trial.exclude.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-[#f7f5f1] px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow={copy.controls.eyebrow} title={copy.controls.title} body={copy.controls.body} />
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {copy.controls.items.map((control) => {
                const Icon = control.icon;
                return (
                  <article key={control.title} className="border border-slate-300 bg-white p-6">
                    <Icon className="h-5 w-5 text-red-800" />
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">{control.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{control.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-16 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <SectionHeading eyebrow={copy.packet.eyebrow} title={copy.packet.title} body={copy.packet.body} />
            <div className="grid gap-3 sm:grid-cols-2">
              {copy.packet.items.map((item) => (
                <div key={item} className="border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950 px-5 py-16 text-white sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">{copy.nonClaims.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">{copy.nonClaims.title}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{copy.nonClaims.body}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {copy.nonClaims.items.map((item) => (
                <div key={item} className="border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2">
            <ClosrLogo size="sm" variant="light" />
            <span className="text-sm text-slate-500">{copy.copyright}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href={copy.privacyHref} className="text-xs font-medium text-slate-500 hover:text-slate-950">
              {copy.navPrivacy}
            </Link>
            <Link href={copy.termsHref} className="text-xs font-medium text-slate-500 hover:text-slate-950">
              {copy.navTerms}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
