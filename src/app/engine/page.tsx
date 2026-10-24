import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Box,
  ChevronRight,
  Cpu,
  Database,
  FileCode,
  Globe,
  Lock,
  Network,
  Server,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { ClosrLogo } from "@/components/ui/closr-logo";

export const metadata: Metadata = {
  title: "Closr Engine — 把你的 CRM 变成销售判断系统",
  description:
    "无需替换 CRM 或现有系统，通过对接 Closr Engine 即可获得有证据支撑的客户判断、赢单缺口和谋局建议。支持私有化部署。",
};

// ── Components ────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-lg leading-8 text-slate-600">{desc}</p>
    </div>
  );
}

function GradientOrb() {
  return (
    <div
      className="pointer-events-none absolute -top-48 right-0 -z-10 h-[600px] w-[600px] opacity-30"
      style={{
        background:
          "radial-gradient(circle at center, rgba(99,102,241,0.25) 0%, rgba(99,102,241,0.08) 40%, transparent 70%)",
      }}
      aria-hidden="true"
    />
  );
}

export default function EngineLanding() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      {/* ── Navigation ── */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-2">
          <ClosrLogo className="h-7 w-auto" />
          <span className="text-sm font-medium text-slate-400">/</span>
          <span className="text-sm font-semibold">Engine</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/contact-sales"
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800"
          >
            联系销售
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <GradientOrb />
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm">
              <Box className="h-4 w-4 text-indigo-500" aria-hidden="true" />
              Closr 衍生产品 · 独立部署
            </p>
            <h1 className="mt-8 text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl lg:leading-[1.1]">
              把 CRM 变成
              <br />
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                销售判断系统
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-xl leading-8 text-slate-600">
              不需要替换 CRM、不需要迁移数据、不需要改变销售团队的工作方式。
              <br />
              接入 Closr Engine，你的 CRM 就能从「记录发生了什么」变成
              <strong className="text-slate-950">「解释这意味着什么、缺什么、下一步做什么」</strong>。
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/contact-sales"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:bg-slate-800"
              >
                申请 PoC
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-500">
              支持私有化部署 · Docker Compose · BYOM · Postgres + pgvector
            </p>
          </div>
        </div>
      </section>

      {/* ── The Problem ── */}
      <section className="border-t border-slate-100 bg-slate-50/50">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                问题
              </p>
              <h2 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                CRM 只记录字段，判断在销售脑子里。
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                你的 CRM 知道商机阶段、金额、owner，但它不知道：客户是不是真的想买、
                预算到底批没批、竞品是不是已经进了门、为什么这个 deal 三个月没动过。
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  "Forecast 依赖销售主观描述，管理层无法判断 deal 真实健康度",
                  "客户信号分散在邮件、会议、备注里，缺少统一解释层",
                  "下一步动作通常是泛 follow-up，不针对具体赢单缺口",
                  "失败和不回应没有形成学习，下一次继续误判",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                      <span className="text-xs font-bold text-red-600">!</span>
                    </span>
                    <span className="text-base leading-6 text-slate-700">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Cpu className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Closr Engine</p>
                  <p className="text-xs text-slate-500">不是替代，是增强</p>
                </div>
              </div>
              <div className="mt-6 space-y-5">
                <div className="flex gap-4">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">不改 CRM 字段</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Engine 产出判断和建议，但不会自动修改商机阶段、金额、
                      预测类别或 owner。你始终拥有控制权。
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">对接现有系统</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      通过 REST API 接入 CRM、邮件、会议、RFP 和销售备注。
                      不需要替换任何现有系统。
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">私有化部署</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Engine 部署在你的 VPC、本地服务器或私有云内。
                      数据不出你的网络边界。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
        <SectionHeader
          eyebrow="How it works"
          title="三步，从信号到判断"
          desc="Engine 把原始销售信号转化为结构化判断、证据链和可执行谋局。"
        />

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              step: "01",
              icon: Network,
              title: "信号接入",
              desc: "邮件、会议记录、RFP、CRM 备注、聊天记录——通过 REST API 或 CSV 接入。Engine 自动解读每条信号，提取证据片段。",
              features: ["REST API / CSV 导入", "支持 10 种信号类型", "自动内容哈希去重"],
            },
            {
              step: "02",
              icon: TrendingUp,
              title: "判断生成",
              desc: "Engine 结合信号证据和检测到的风险模式，生成结构化销售判断：健康度、风险、置信度、缺失证据和判断依据。",
              features: ["证据链可追溯", "置信度量化", "缺失证据标注"],
            },
            {
              step: "03",
              icon: Star,
              title: "谋局建议",
              desc: "基于判断和赢单缺口，Engine 生成下一步动作建议：找谁、说什么、怎么判断成功、怎么做后判断怎么变。",
              features: ["具体到目标人物", "成功/失败标准", "人工审批后执行"],
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-3xl border border-slate-200 bg-white p-8"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <item.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Step {item.step}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-950">
                {item.title}
              </h3>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {item.desc}
              </p>
              <ul className="mt-6 space-y-2">
                {item.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircleMini className="h-4 w-4 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Delivers ── */}
      <section className="border-t border-slate-100 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/45">
              交付能力
            </p>
            <h2 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              从原始信号到可执行谋局
            </h2>
            <p className="mt-4 text-lg leading-8 text-white/65">
              Engine 自动完成信号理解、局势判断和谋局建议。你可以组合使用或按需集成。
            </p>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                <Network className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">信号解读</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">
                原始销售信号自动转化为规范化证据和风险画像。每条证据可追溯、可验证。
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">局势判断</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">
                结合所有证据生成结构化判断：deal 健康度、风险画像、置信度、缺失证据、判断依据。
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400">
                <Star className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">谋局建议</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">
                基于判断和赢单缺口，输出具体到目标人物的下一步动作。每条建议附带验证标准和预期结果。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Engine ── */}
      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
        <SectionHeader
          eyebrow="Why Engine"
          title="不是又一个 CRM 工具"
          desc="Closr Engine 不是 AI 销售助手、不是邮件总结插件、不是黑盒赢率评分。它是一套可部署的销售判断基础设施。"
        />

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "证据可追溯",
              desc: "每个判断都有来源证据支持。高层追问「为什么这么说」时，你可以打开证据链展示原文。",
            },
            {
              icon: Lock,
              title: "数据不出域",
              desc: "私有化部署在你的网络内。支持 BYOM（自带模型），无需将数据传输到第三方云。",
            },
            {
              icon: FileCode,
              title: "API-first",
              desc: "REST API 设计，与任何语言和框架集成。输出结构化 JSON，可直接对接到 BI 或内部系统。",
            },
            {
              icon: Database,
              title: "自带存储层",
              desc: "Postgres + pgvector，内置判断存储、证据存储、向量记忆和审计日志。无需额外基础设施。",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <item.icon className="h-5 w-5 text-slate-700" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="border-t border-slate-100 bg-slate-50/50">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
          <SectionHeader
            eyebrow="Use cases"
            title="三类企业销售场景，一套引擎"
            desc="Engine 覆盖了企业销售中最常见的三类阻塞场景。"
          />

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              {
                label: "续约扩容",
                risk: "finance/procurement blocker",
                desc: "业务团队认可技术方案，但 CFO、采购和竞品价格锚点卡住了预算。Engine 识别出财务证明缺口，建议联系 CFO 确认 ROI 口径。",
                quote: "「今年集团有 5% 年降目标，TCS 报价更低。CFO 需要看到 AIOps 一年回本证明。」",
              },
              {
                label: "安全评审",
                risk: "security/compliance blocker",
                desc: "业务 sponsor 想推进，但安全、法务和数据处理边界尚未通过评审。Engine 识别出合规阻塞，建议先清安全准入条件。",
                quote: "「安全评审要求数据驻留、审计日志、权限隔离和模型供应商合规材料。」",
              },
              {
                label: "RFP 投标",
                risk: "rfp/tender process blocker",
                desc: "投标窗口很短，评分标准不透明，不确定是公平机会还是陪标。Engine 建议投标前先验证评分路径。",
                quote: "「RFP 要求两周内提交投标文件，评分标准包含 OSS/BSS、MTTR 和故障预测准确率。」",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                    {item.label}
                  </span>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                    {item.risk}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {item.desc}
                </p>
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs leading-5 text-slate-500 italic">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enterprise Features ── */}
      <section className="mx-auto max-w-7xl px-6 py-24 sm:px-8 lg:px-10">
        <SectionHeader
          eyebrow="Enterprise"
          title="企业级就绪"
          desc="Engine 从第一天就为私有化部署和企业合规设计。"
        />

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Server, title: "Docker Compose 部署", desc: "三服务架构：Postgres + 迁移 Job + Next.js App。适合 PoC 和试点。" },
            { icon: Lock, title: "Writeback 安全策略", desc: "proposal_only 模式，所有输出是建议性质。禁止自动修改 CRM 字段：stage、amount、forecast、close_date、owner。" },
            { icon: Globe, title: "BYOM 自带模型", desc: "支持 OpenAI-compatible 模型端点。你可以用自己的 API key，数据不经过第三方。" },
            { icon: Users, title: "多租户隔离", desc: "所有数据表包含 tenantId，支持逻辑隔离。大客户可选物理隔离部署。" },
            { icon: Database, title: "Postgres + pgvector", desc: "自带判断存储、证据存储、向量记忆和审计事件。不需要额外基础设施。" },
            { icon: FileCode, title: "结构化输出", desc: "Engine 所有产出是标准结构化数据，可直接对接到 BI、内部系统和汇报流程。" },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <item.icon className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-slate-100 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center sm:px-8 lg:px-10 lg:py-28">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            把你的 CRM 变成销售判断系统
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/65">
            不需要替换 CRM、不需要迁移、不需要改变团队的工作方式。
            4-8 周 PoC，用 3-5 个真实 deal 验证 Engine 的判断质量。
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/contact-sales"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-semibold text-slate-950 shadow-lg transition-all hover:bg-slate-100"
            >
              申请 PoC
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/40">
            Docker Compose · Postgres + pgvector · BYOM · Audit Log · SSL
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="mx-auto flex max-w-7xl items-center justify-between px-6 py-8 text-xs text-slate-500 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <ClosrLogo className="h-5 w-auto" />
          <span className="text-slate-300">|</span>
          <span>Closr Engine · 衍生产品 · 独立部署</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-slate-700">隐私</Link>
          <span className="text-slate-300">·</span>
          <Link href="/security" className="hover:text-slate-700">安全</Link>
        </div>
      </footer>
    </main>
  );
}

// ── Inline icons ──────────────────────────────────────────

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function CheckCircleMini({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
