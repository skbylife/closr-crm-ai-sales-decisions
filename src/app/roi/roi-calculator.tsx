"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

type Locale = "zh" | "en";
type Inputs = {
  sellers: number;
  managers: number;
  solutionPeople: number;
  sellerHourlyCost: number;
  managerHourlyCost: number;
  solutionHourlyCost: number;
  sellerWeeklyHoursSaved: number;
  managerWeeklyHoursSaved: number;
  monthlyStrategicDeals: number;
  hoursSavedPerDeal: number;
  annualPipeline: number;
  grossMargin: number;
  riskImprovement: number;
};

const DEFAULTS: Record<Locale, Inputs> = {
  zh: {
    sellers: 24,
    managers: 5,
    solutionPeople: 4,
    sellerHourlyCost: 180,
    managerHourlyCost: 280,
    solutionHourlyCost: 240,
    sellerWeeklyHoursSaved: 2,
    managerWeeklyHoursSaved: 3,
    monthlyStrategicDeals: 4,
    hoursSavedPerDeal: 8,
    annualPipeline: 97000000,
    grossMargin: 30,
    riskImprovement: 0.8,
  },
  en: {
    sellers: 20,
    managers: 4,
    solutionPeople: 3,
    sellerHourlyCost: 75,
    managerHourlyCost: 110,
    solutionHourlyCost: 95,
    sellerWeeklyHoursSaved: 3,
    managerWeeklyHoursSaved: 4,
    monthlyStrategicDeals: 5,
    hoursSavedPerDeal: 10,
    annualPipeline: 12000000,
    grossMargin: 40,
    riskImprovement: 1,
  },
};

const COPY = {
  zh: {
    navHome: "官网首页",
    navLogin: "登录",
    toggle: "EN",
    title: "Closr 的 ROI是减少销售里的错误判断。",
    subtitle:
      "当团队看不清客户真实意图、关键关系、采购风险和下一步动作时，损失通常不会出现在 CRM 里。Closr 的价值，是把这些隐性损失提前暴露，并让团队用同一套证据推进。",
    primaryCta: "体验 Demo",
    secondaryCta: "登录",
    heroMetricLabel: "按当前保守假设，预计年度可量化价值",
    conditionLabel: "计算条件",
    painTitle: "三类隐形损失",
    pains: [
      ["管理层看到风险太晚", "商机看起来还在推进，但预算人、采购标准、竞品压力和关系缺口没有被及时暴露。"],
      ["销售动作依赖个人经验", "同样一封邮件、一次会议、一个 RFP，不同销售给出不同判断，团队很难复用最佳打法。"],
      ["售前和经理反复补材料", "大量时间花在整理背景、复盘管线、解释风险、重写方案，而不是推进客户决策。"],
    ],
    valueTitle: "Closr 把 ROI 拆成三个方面",
    values: [
      ["节省准备时间", "销售、经理和方案团队少做重复整理，把时间放回客户推进。"],
      ["减少错误动作", "提前识别缺失证据、错误对象、采购风险和关系盲区，减少无效跟进。"],
      ["保护高毛利机会", "不假设胜率大幅提升，只计算一小部分重点管线因风险提前纠偏带来的毛利保护。"],
    ],
    calculatorTitle: "用你的团队数据估算",
    calculatorLead: "下面不是承诺收益，而是一个可替换假设的预算讨论模型。客户可以把人数、成本、管线和改善幅度改成自己的真实数据。",
    team: "团队规模",
    cost: "小时成本",
    time: "每周节省时间",
    dealRisk: "重点机会与风险",
    sellers: "销售人数",
    managers: "销售经理人数",
    solutionPeople: "售前/方案人数",
    sellerHourlyCost: "销售小时成本",
    managerHourlyCost: "经理小时成本",
    solutionHourlyCost: "售前小时成本",
    sellerWeeklyHoursSaved: "每位销售每周少花",
    managerWeeklyHoursSaved: "每位经理每周少花",
    monthlyStrategicDeals: "每月重点机会/RFP 数量",
    hoursSavedPerDeal: "每个重点机会少花",
    annualPipeline: "年度重点销售管线",
    grossMargin: "毛利率",
    riskImprovement: "风险纠偏带来的成交概率改善",
    operatingSavings: "年度时间成本节省",
    protectedMargin: "风险纠偏保护的毛利",
    hoursSaved: "年度节省小时",
    totalValue: "年度可量化价值",
    formulaTitle: "计算方式",
    formulaLines: [
      "时间成本节省 = 角色人数 × 每周节省小时 × 52 周 × 小时成本",
      "重点机会准备节省 = 每月重点机会数量 × 每个机会节省小时 × 12 月 × 售前小时成本",
      "风险纠偏毛利保护 = 年度重点管线 × 成交概率改善 × 毛利率",
    ],
  },
  en: {
    navHome: "Home",
    navLogin: "Log in",
    toggle: "中文",
    title: "Closr ROI is not about saving a few hours. It is about reducing wrong judgment in strategic sales.",
    subtitle:
      "When teams miss buyer intent, relationship gaps, procurement risk, or the next best move, the loss rarely shows up cleanly in CRM. Closr makes those hidden losses visible earlier and turns them into evidence-based action.",
    primaryCta: "View demo",
    secondaryCta: "Log in",
    heroMetricLabel: "Estimated annual value under conservative assumptions",
    conditionLabel: "Conditions",
    painTitle: "Buyers do not care about another AI tool. They care about these losses.",
    pains: [
      ["Leadership sees risk too late", "Deals still look active while buyer access, decision criteria, competitor pressure, and relationship gaps remain hidden."],
      ["Sales motion depends on individual judgment", "The same email, meeting, or RFP can lead to different calls from different reps, making good judgment hard to reuse."],
      ["Managers and presales redo work", "Too much time is spent reconstructing context, reviewing pipeline, explaining risk, and rewriting solution material."],
    ],
    valueTitle: "Closr breaks ROI into three auditable buckets",
    values: [
      ["Preparation time saved", "Reps, managers, and solution teams spend less time rebuilding context."],
      ["Fewer wrong moves", "Missing evidence, wrong stakeholders, procurement risk, and relationship gaps surface earlier."],
      ["Protected gross margin", "The model assumes only a small slice of pipeline improves because risks are corrected earlier."],
    ],
    calculatorTitle: "Estimate with your team data",
    calculatorLead: "This is not a guaranteed-return claim. It is a replaceable-assumption model for budget discussion.",
    team: "Team size",
    cost: "Hourly cost",
    time: "Time saved",
    dealRisk: "Strategic deals and risk",
    sellers: "Sales reps",
    managers: "Sales managers",
    solutionPeople: "Presales / solution",
    sellerHourlyCost: "Rep hourly cost",
    managerHourlyCost: "Manager hourly cost",
    solutionHourlyCost: "Presales hourly cost",
    sellerWeeklyHoursSaved: "Hours saved per rep / week",
    managerWeeklyHoursSaved: "Hours saved per manager / week",
    monthlyStrategicDeals: "Strategic deals / RFPs per month",
    hoursSavedPerDeal: "Hours saved per strategic deal",
    annualPipeline: "Annual strategic pipeline",
    grossMargin: "Gross margin",
    riskImprovement: "Win-probability lift from risk correction",
    operatingSavings: "Annual time-cost savings",
    protectedMargin: "Protected gross margin",
    hoursSaved: "Annual hours saved",
    totalValue: "Annual quantified value",
    formulaTitle: "Calculation basis",
    formulaLines: [
      "Time-cost savings = role count × weekly hours saved × 52 weeks × hourly cost",
      "Strategic-deal prep savings = monthly strategic deals × hours saved per deal × 12 months × presales hourly cost",
      "Protected margin = annual strategic pipeline × probability lift × gross margin",
    ],
  },
} as const;

function formatCurrency(value: number, locale: Locale, compact = false) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: locale === "zh" ? "CNY" : "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(Math.round(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatCondition(inputs: Inputs, locale: Locale) {
  if (locale === "zh") {
    return `${inputs.sellers} 名销售、${inputs.managers} 名经理、${inputs.solutionPeople} 名售前；销售/经理/售前小时成本 ${formatCurrency(inputs.sellerHourlyCost, locale)}/${formatCurrency(inputs.managerHourlyCost, locale)}/${formatCurrency(inputs.solutionHourlyCost, locale)}；每月 ${inputs.monthlyStrategicDeals} 个重点机会，年度重点管线 ${formatCurrency(inputs.annualPipeline, locale, true)}；毛利率 ${inputs.grossMargin}%，风险纠偏改善 ${inputs.riskImprovement}%。`;
  }

  return `${inputs.sellers} reps, ${inputs.managers} managers, ${inputs.solutionPeople} presales; hourly costs ${formatCurrency(inputs.sellerHourlyCost, locale)}/${formatCurrency(inputs.managerHourlyCost, locale)}/${formatCurrency(inputs.solutionHourlyCost, locale)}; ${inputs.monthlyStrategicDeals} strategic deals per month, ${formatCurrency(inputs.annualPipeline, locale, true)} annual pipeline; ${inputs.grossMargin}% margin, ${inputs.riskImprovement}% risk-correction lift.`;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function Field({
  label,
  value,
  min,
  max,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  prefix?: string;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium text-stone-600">{label}</span>
      <div className="flex h-11 items-center border-b border-stone-300 bg-transparent focus-within:border-red-700">
        {prefix ? <span className="pr-1 text-sm text-stone-500">{prefix}</span> : null}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(Math.min(max, Math.max(min, parseNumber(event.target.value))))}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-stone-950 outline-none"
        />
        {suffix ? <span className="pl-1 text-xs font-medium text-stone-500">{suffix}</span> : null}
      </div>
    </label>
  );
}
function SectionTitle({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-800">{eyebrow}</p> : null}
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">{title}</h2>
      {body ? <p className="mt-3 text-sm leading-7 text-stone-600">{body}</p> : null}
    </div>
  );
}

export function RoiCalculator({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS[locale]);

  const results = useMemo(() => {
    const sellerHours = inputs.sellers * inputs.sellerWeeklyHoursSaved * 52;
    const managerHours = inputs.managers * inputs.managerWeeklyHoursSaved * 52;
    const dealPrepHours = inputs.monthlyStrategicDeals * inputs.hoursSavedPerDeal * 12;
    const sellerSavings = sellerHours * inputs.sellerHourlyCost;
    const managerSavings = managerHours * inputs.managerHourlyCost;
    const solutionSavings = dealPrepHours * inputs.solutionHourlyCost;
    const operatingSavings = sellerSavings + managerSavings + solutionSavings;
    const protectedMargin = inputs.annualPipeline * (inputs.riskImprovement / 100) * (inputs.grossMargin / 100);
    return {
      sellerHours,
      managerHours,
      dealPrepHours,
      totalHours: sellerHours + managerHours + dealPrepHours,
      sellerSavings,
      managerSavings,
      solutionSavings,
      operatingSavings,
      protectedMargin,
      totalValue: operatingSavings + protectedMargin,
    };
  }, [inputs]);

  const update = (key: keyof Inputs, value: number) => setInputs((current) => ({ ...current, [key]: value }));
  const loginHref = locale === "en" ? "/login?lang=en" : "/login";
  const demoHref = locale === "en" ? "/login?demo=true&lang=en" : "/login?demo=true";
  const alternateHref = locale === "en" ? "/roi" : "/roi?lang=en";
  const currencyPrefix = locale === "zh" ? "¥" : "$";
  const conditionText = formatCondition(inputs, locale);

  return (
    <div className="closr-marketing-fixed-theme min-h-screen bg-[#f7f3ec] text-stone-950">
      <nav className="border-b border-stone-200 bg-[#f7f3ec]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <a href={locale === "en" ? "/?lang=en" : "/"} className="text-lg font-semibold tracking-tight text-stone-950">
            Closr
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href={locale === "en" ? "/?lang=en" : "/"} className="hidden text-stone-600 hover:text-stone-950 sm:inline">
              {copy.navHome}
            </a>
            <a href={alternateHref} className="text-stone-600 hover:text-stone-950">
              {copy.toggle}
            </a>
            <a href={loginHref} className="font-medium text-stone-950">
              {copy.navLogin}
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="px-5 py-14 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight text-stone-950 sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-stone-700 sm:text-lg">{copy.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={demoHref} className="inline-flex items-center gap-2 bg-red-800 px-5 py-3 text-sm font-semibold text-white hover:bg-red-900">
                  {copy.primaryCta}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href={loginHref} className="inline-flex items-center border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-950 hover:border-stone-950">
                  {copy.secondaryCta}
                </a>
              </div>
            </div>

            <div className="border border-stone-300 bg-white p-6 shadow-[12px_12px_0_#1c1917]">
              <p className="text-sm font-medium text-stone-600">{copy.heroMetricLabel}</p>
              <p className="mt-3 text-xs leading-5 text-stone-500">
                {copy.conditionLabel}: {conditionText}
              </p>
              <p className="mt-4 text-5xl font-semibold tabular-nums tracking-tight text-stone-950 sm:text-6xl">
                {formatCurrency(results.totalValue, locale, true)}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {[
                  [copy.operatingSavings, formatCurrency(results.operatingSavings, locale, true), Clock3],
                  [copy.protectedMargin, formatCurrency(results.protectedMargin, locale, true), ShieldCheck],
                  [copy.hoursSaved, formatNumber(results.totalHours), TrendingUp],
                ].map(([label, value, Icon]) => (
                  <div key={String(label)} className="border-t border-stone-200 pt-4">
                    <Icon className="h-4 w-4 text-red-800" />
                    <p className="mt-2 text-xl font-semibold tabular-nums text-stone-950">{String(value)}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">{String(label)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionTitle title={copy.painTitle} />
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {copy.pains.map(([title, body], index) => (
                <article key={title} className="border-l border-stone-300 pl-5">
                  <p className="text-xs font-semibold text-red-800">0{index + 1}</p>
                  <h3 className="mt-3 text-lg font-semibold text-stone-950">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-stone-600">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <SectionTitle title={copy.valueTitle} />
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {copy.values.map(([title, body]) => (
                <div key={title} className="bg-stone-950 p-6 text-white">
                  <CheckCircle2 className="h-5 w-5 text-red-300" />
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-white/70">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <aside>
              <div className="sticky top-8">
                <SectionTitle eyebrow={locale === "zh" ? "可替换假设" : "Replaceable assumptions"} title={copy.calculatorTitle} body={copy.calculatorLead} />
                <div className="mt-8 border border-stone-300 bg-[#f7f3ec] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{copy.totalValue}</p>
                  <p className="mt-3 text-4xl font-semibold tabular-nums text-stone-950">
                    {formatCurrency(results.totalValue, locale)}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-stone-600">
                    {copy.operatingSavings}: {formatCurrency(results.operatingSavings, locale)} · {copy.protectedMargin}: {formatCurrency(results.protectedMargin, locale)}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    {copy.conditionLabel}: {conditionText}
                  </p>
                </div>
              </div>
            </aside>

            <div className="space-y-9">
              {[
                {
                  title: copy.team,
                  fields: [
                    ["sellers", copy.sellers, 1, 500, undefined, undefined],
                    ["managers", copy.managers, 0, 100, undefined, undefined],
                    ["solutionPeople", copy.solutionPeople, 0, 100, undefined, undefined],
                  ],
                },
                {
                  title: copy.cost,
                  fields: [
                    ["sellerHourlyCost", copy.sellerHourlyCost, 1, 5000, currencyPrefix, undefined],
                    ["managerHourlyCost", copy.managerHourlyCost, 1, 5000, currencyPrefix, undefined],
                    ["solutionHourlyCost", copy.solutionHourlyCost, 1, 5000, currencyPrefix, undefined],
                  ],
                },
                {
                  title: copy.time,
                  fields: [
                    ["sellerWeeklyHoursSaved", copy.sellerWeeklyHoursSaved, 0, 40, undefined, "h"],
                    ["managerWeeklyHoursSaved", copy.managerWeeklyHoursSaved, 0, 40, undefined, "h"],
                    ["monthlyStrategicDeals", copy.monthlyStrategicDeals, 0, 200, undefined, undefined],
                    ["hoursSavedPerDeal", copy.hoursSavedPerDeal, 0, 100, undefined, "h"],
                  ],
                },
                {
                  title: copy.dealRisk,
                  fields: [
                    ["annualPipeline", copy.annualPipeline, 0, 10000000000, currencyPrefix, undefined],
                    ["grossMargin", copy.grossMargin, 1, 95, undefined, "%"],
                    ["riskImprovement", copy.riskImprovement, 0, 20, undefined, "%"],
                  ],
                },
              ].map((group) => (
                <div key={group.title}>
                  <div className="mb-4 flex items-center gap-2 border-b border-stone-200 pb-3">
                    <SlidersHorizontal className="h-4 w-4 text-red-800" />
                    <h3 className="text-base font-semibold text-stone-950">{group.title}</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {group.fields.map(([key, label, min, max, prefix, suffix]) => (
                      <Field
                        key={String(key)}
                        label={String(label)}
                        value={inputs[key as keyof Inputs]}
                        min={Number(min)}
                        max={Number(max)}
                        prefix={prefix ? String(prefix) : undefined}
                        suffix={suffix ? String(suffix) : undefined}
                        onChange={(value) => update(key as keyof Inputs, value)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  [copy.operatingSavings, formatCurrency(results.operatingSavings, locale), CircleDollarSign],
                  [copy.protectedMargin, formatCurrency(results.protectedMargin, locale), ShieldCheck],
                  [copy.hoursSaved, formatNumber(results.totalHours), Clock3],
                ].map(([label, value, Icon]) => (
                  <div key={String(label)} className="border border-stone-200 p-5">
                    <Icon className="h-5 w-5 text-red-800" />
                    <p className="mt-4 text-2xl font-semibold tabular-nums text-stone-950">{String(value)}</p>
                    <p className="mt-2 text-xs leading-5 text-stone-500">{String(label)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 border-t border-stone-300 pt-10 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-red-800" />
                  <h2 className="text-2xl font-semibold text-stone-950">{copy.formulaTitle}</h2>
                </div>
              </div>
              <div className="space-y-3">
                {copy.formulaLines.map((line) => (
                  <p key={line} className="border-b border-stone-200 pb-3 text-sm leading-7 text-stone-700">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
