import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  Gauge,
  ScanSearch,
  Target,
  Users,
} from "lucide-react";
import { ClosrLogo } from "@/components/ui/closr-logo";
import { CopyTextBlock } from "@/components/guide/copy-text-block";

export const metadata: Metadata = {
  title: "Closr Demo 体验指南",
  description:
    "用一封客户邮件快速判断关键大单风险、决策链变化、团队推进方式和资源投入优先级。",
};

const decodeEmail = [
  "From: 周总 zhangli@platform.example.com",
  "To: 张经理 mingyuan.zhang@isoftstone.example.com",
  "Cc: 陈晓峰 chenxiaofeng@platform.example.com",
  "Subject: Re: 平台云基础设施运维续约 2026-2027 年度合同方案",
  "",
  "张经理，",
  "",
  "关于平台云基础设施运维续约 2026-2027 年度合同，采购管理部做了初步成本核算。几点反馈：",
  "",
  "1）去年合同总价 ¥3200 万，今年按年降 5% 要求应不超过 ¥3040 万。这个目标是李总在年度预算会上定的，采购部没有让步空间。",
  "",
  "2）TCS 提交了 Mantis 平台上的续约报价（通过印度区渠道），人月单价 ¥2.8 万。我知道他们是印度团队远程，情况不一样，但数字摆在那里，领导会看到。",
  "",
  "3）你们上次提的 AIOps 扩展服务，采购部原则上支持，但需要证明这笔新增投入（约 ¥500 万）能在一年内通过自动化减少等额的人力成本，否则 CFO 那边过不去。",
  "",
  "另外我把 陈晓峰 拉进来了。他这周开始接财务评审，会重点看新增服务线的 ROI 口径、预算归属和回报周期。如果这三项讲不清，这个方案即使采购这边通过，也很难往下走。",
  "",
  "麻烦整理一份成本对照方案发过来，含分项报价和 ROI 测算。格式用该平台客户统一报价模板。也请单独补一页给陈晓峰，专门说明 AIOps 这部分一年内怎么回本。",
  "",
  "—— 周总",
  "IT采购总监",
  "华东某头部互联网平台",
].join("\n");

const expectedSignals = [
  {
    label: "预算压力",
    title: "年降 5% 是硬约束",
    text: "去年合同 ¥3200 万，今年上限 ¥3040 万，而且目标来自李总年度预算会。不要把它理解成周总临时压价。",
  },
  {
    label: "竞品压力",
    title: "TCS 是低价锚点",
    text: "TCS 的 ¥2.8 万人月会影响领导心理价格，但它和本地交付、SLA、风险兜底并不完全可比。",
  },
  {
    label: "新增机会",
    title: "AIOps 变成财务问题",
    text: "客户不是否定 AIOps，而是要求证明新增约 ¥500 万能在一年内通过自动化回本。",
  },
  {
    label: "关键人变化",
    title: "陈晓峰进入决策链",
    text: "他接财务评审，重点看 ROI 口径、预算归属、回报周期。给他的材料要比给采购的材料更财务化。",
  },
];

const journey = [
  {
    number: "01",
    title: "登录 Demo，先进入工作台",
    time: "1 分钟",
    icon: Gauge,
    do: [
      "打开你自己的 Closr 部署地址；仅在管理员配置 Demo 后使用 Demo 登录入口。",
      "先看「全景」页面，把它当成重点客户风险面板。",
      "不要从录入客户开始，而是先判断哪些客户需要你介入、哪些大单推进方式可能跑偏。",
    ],
    result: "你先建立一个管理视角：Closr 不是让团队多填 CRM，而是把关键客户风险、团队动作和 AI 判断推到你面前。",
    image: {
      src: "/help/demo/horizon-overview.webp",
      alt: "Closr Demo 全景页面",
    },
  },
  {
    number: "02",
    title: "用客户原话校验团队判断",
    time: "5 分钟",
    icon: ScanSearch,
    do: [
      "打开左侧导航里的「解读」。",
      "把下面这封周总邮件完整复制进去，模拟一线 AE 转发给你的一条关键客户信号。",
      "客户选择「华东某头部互联网平台」。如果系统让你选择联系人，优先选择周总。",
    ],
    result: "这一步的目标不是让 AI 写摘要，而是让你直接看到：一线团队是否低估了预算、竞品、ROI 和财务评审风险。",
    sampleTitle: "复制到 Decode 的邮件",
    sample: decodeEmail,
    image: {
      src: "/help/demo/decode-workspace.webp",
      alt: "Closr Demo 解读页面",
    },
  },
  {
    number: "03",
    title: "看解读结果，判断风险是否被看穿",
    time: "4 分钟",
    icon: FileText,
    do: [
      "先看系统识别出的风险、关键人和下一步建议。",
      "重点核对下面 4 个信号有没有被识别出来。",
      "从管理视角判断：这是不是需要你调资源、压节奏、重审报价结构的信号。",
    ],
    result: "你会看到 Closr 的管理价值：它把一封客户邮件拆成可审查、可追责、可行动的销售判断，而不是只帮 AE 改写文字。",
  },
  {
    number: "04",
    title: "回到客户页，审视这个大单是否失焦",
    time: "4 分钟",
    icon: Building2,
    do: [
      "进入「华东某头部互联网平台」客户页。",
      "看账户概览里有没有出现续约、AIOps 扩展、成本压力、竞品压力相关判断。",
      "把这封邮件理解成一次大单状态变化：它会影响 forecast、资源投入和高层介入时机。",
    ],
    result: "你会发现同一封邮件会影响客户健康度、商机风险、团队推进方式和管理层是否需要介入。",
    image: {
      src: "/help/demo/account-overview.webp",
      alt: "Closr Demo 账户概览页面",
    },
  },
  {
    number: "05",
    title: "看决策链，确认团队找对了人",
    time: "4 分钟",
    icon: Users,
    do: [
      "在客户页查看联系人或关系信息。",
      "把李总、周总、陈晓峰、何总四个角色分开理解。",
      "不要只按职位判断，要看他们分别控制预算、采购口径、财务评审和技术认可。",
    ],
    result: "你应该得到一个管理判断：当前团队不能只跟采购谈价格，必须同时补齐 CFO/财务 ROI 口径和 CTO 技术价值路径。",
  },
  {
    number: "06",
    title: "进入谋局，决定是否要重排推进方式",
    time: "5 分钟",
    icon: Target,
    do: [
      "打开「谋局」或客户页里的策略区域。",
      "找到这条谋局：「获得 CTO 何总的技术评审会参与」。",
      "确认页面出现「需要重新计划谋局」提醒。",
      "从管理视角判断：是否需要把基础续约、AIOps 扩展和财务 ROI 证明拆成不同路径推进。",
      "把团队下一步压到三份关键材料：成本对照、TCS 可比性说明、AIOps 一年回本页。",
    ],
    result: "你不再只是听 AE 汇报“客户有压力”，而是能看到哪条谋局假设被新信号推翻，以及你该让团队重新计划什么。",
    image: {
      src: "/help/demo/strategic-plays.webp",
      alt: "Closr Demo 谋局页面",
    },
  },
];

const roleMap = [
  {
    name: "李总",
    role: "预算目标来源",
    detail: "年降 5% 是他在年度预算会上定的，所以这不是周总能单独让步的问题。",
  },
  {
    name: "周总",
    role: "采购口径执行人",
    detail: "他要成本对照、分项报价和统一模板。你要帮他拿出能往上交的材料。",
  },
  {
    name: "陈晓峰",
    role: "财务评审关键人",
    detail: "他关心新增服务线 ROI、预算归属和回报周期。给他的材料要像财务页，不要像产品介绍。",
  },
];

const otherCases = [
  {
    title: "某全国性股份制银行",
    point: "用来体验“客户沉默不等于客户没兴趣”。孙宁 14 天没回复，但上下文显示她在等安全评审结束。",
  },
  {
    title: "某全国性通信运营商集团",
    point: "用来体验“Champion 活跃不等于 deal 前进”。孙总很积极，但真正卡点在集团采购链路没有闭合。",
  },
];

export default function DemoGuidePage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <section className="border-b border-slate-200 bg-[#07090c] text-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <ClosrLogo size="lg" variant="dark" />
          <div className="flex items-center gap-3">
            <Link href="/guide" className="text-sm font-medium text-white/70 transition-colors hover:text-white">
              普通指南
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-[#df2531] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c41e2a]"
            >
              进入 Demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-20 lg:pt-14">
          <div>
            <p className="text-sm font-semibold text-red-300">Closr Demo 体验指南</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl">
              用一封客户邮件看清关键大单
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
              你不需要先研究所有功能，只需要用周总这封续约邮件，判断团队有没有看穿风险、找对关键人、重排推进方式，并知道你该在哪里介入。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100"
              >
                登录 Demo 后开始
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#email"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/16 px-5 py-3 text-sm font-semibold text-white/90 transition-colors hover:border-white/32 hover:text-white"
              >
                先看要复制的邮件
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <p className="text-sm font-semibold text-red-300">这次你要完成的管理闭环</p>
            <div className="mt-5 space-y-3">
              {["读取客户原话", "校验团队判断", "识别关键人和风险", "决定是否重排推进方式"].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-950">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold text-white">{item}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6 text-white/60">
              跑完后，你应该能回答：这张大单现在卡在哪里、谁真正影响推进、团队下一步是否正确、你是否需要介入。
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold text-red-700">先记住这个场景</p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">
              你现在负责关键客户增长
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              客户是「华东某头部互联网平台」。这不是一封普通采购邮件，而是一张可能影响年度续约、AIOps 扩展和团队 forecast 的关键大单信号。你的目标是判断团队当前推进方式是否还成立。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {roleMap.map((person) => (
              <article key={person.name} className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                <p className="text-lg font-semibold text-slate-950">{person.name}</p>
                <p className="mt-1 text-xs font-semibold text-red-700">{person.role}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{person.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-red-700">跟着做</p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">第一次体验的 6 个步骤</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              每一步都围绕管理层的核心问题：这张单有没有风险、团队有没有误判、关键人路径是否完整、下一步资源该怎么押。
            </p>
          </div>

          <div className="mt-8 space-y-6">
            {journey.map((step) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.number}
                  id={step.number === "02" ? "email" : undefined}
                  className="grid gap-5 rounded-lg border border-slate-200 bg-[#f8fafc] p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)] lg:grid-cols-[190px_1fr]"
                >
                  <div className="flex items-start justify-between gap-4 lg:block">
                    <div>
                      <span className="text-xs font-bold text-red-700">{step.number}</span>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">{step.title}</h3>
                      <p className="mt-2 text-xs font-medium text-slate-500">{step.time}</p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                      <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-[1fr_0.82fr]">
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-semibold text-slate-500">现在要看</p>
                        <ul className="mt-3 space-y-2">
                          {step.do.map((item) => (
                            <li key={item} className="flex gap-2 text-sm leading-6 text-slate-700">
                              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-red-100 bg-red-50/70 p-4">
                        <p className="text-xs font-semibold text-red-700">你应该形成的管理判断</p>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{step.result}</p>
                      </div>
                    </div>

                    {step.sample ? (
                      <CopyTextBlock title={step.sampleTitle ?? "可复制内容"} text={step.sample} compact={step.number === "02"} />
                    ) : null}

                    {step.number === "03" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {expectedSignals.map((signal) => (
                          <div key={signal.title} className="rounded-lg border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold text-red-700">{signal.label}</p>
                            <h4 className="mt-2 text-base font-semibold text-slate-950">{signal.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{signal.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {step.image ? (
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <Image
                          src={step.image.src}
                          alt={step.image.alt}
                          width={1200}
                          height={760}
                          className="aspect-[16/9] w-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-sm font-semibold text-red-700">继续探索</p>
            <h2 className="mt-3 text-3xl font-bold tracking-normal text-slate-950">跑完主线后，再看另外两个案例</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              第一次体验只建议先跑平台续约这条线。理解之后，再用另外两个客户看 Closr 如何区分“客户沉默”“Champion 活跃”和“真实推进”之间的差别。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {otherCases.map((item) => (
              <article key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
                <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.point}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-semibold text-red-300">完成标准</p>
              <h2 className="mt-3 text-3xl font-bold tracking-normal">跑完这条线，你应该理解 Closr 的价值</h2>
              <p className="mt-4 text-base leading-7 text-white/64">
                Closr 不是让 AE 多填一个 CRM，而是让管理者看到复杂交易背后的真实局势：风险从哪里来、谁影响成败、团队推进方式是否该改、资源该押在哪里。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "提前发现 forecast 风险：从一封邮件里同时看到预算硬约束、竞品锚点、ROI 压力和评审人变化。",
                "校验团队判断质量：BABEL / Decode 把客户原话拆成真实意图、隐藏风险和行动要求，避免 AE 只报好消息。",
                "看清决策链缺口：DISC + 关系判断帮助你判断团队该推进李总、周总、陈晓峰还是何总。",
                "统一管理层视图：CIL 把分散信息编译成同一层客户判断，让 AE、销售经理和管理层看到同一套依据。",
                "把判断变成管理动作：Plays 告诉你原推进方式是否还成立；当新邮件改变局势时，提示「重新计划谋局」。",
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
                  <p className="text-sm leading-6 text-white/72">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
