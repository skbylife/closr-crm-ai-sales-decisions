"use client";

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, Building2, CircleHelp, ClipboardList, GitBranch, LayoutDashboard, Lightbulb, Route, ScanSearch, Search, Settings2, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useLocale, type Locale } from "@/lib/i18n";
type GuideLink = {
  label: string;
  href: string;
};
type GuidePreview = {
  caption: string;
  start: string;
  done: string;
};
type GuideModule = {
  name: string;
  purpose: string;
  helps: string;
  useWhen: string;
};
type GuideSection = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  why: string;
  steps: string[];
  result: string;
  modules?: GuideModule[];
  tips?: string[];
  preview?: GuidePreview;
  links: GuideLink[];
};
type HelpCopy = {
  hero: {
    kicker: string;
    title: string;
    subtitle: string;
    meta: string;
    primaryCta: string;
    secondaryCta: string;
  };
  productTitle: string;
  productSubtitle: string;
  productPositioning: Array<{
    title: string;
    description: string;
    icon: LucideIcon;
  }>;
  enginesTitle: string;
  enginesSubtitle: string;
  engines: Array<{
    name: string;
    layer: string;
    description: string;
  }>;
  rolesTitle: string;
  rolesSubtitle: string;
  roles: Array<{
    role: string;
    question: string;
    value: string;
  }>;
  tocTitle: string;
  quickTitle: string;
  quickSubtitle: string;
  quickSteps: Array<{
    label: string;
    text: string;
    href: string;
  }>;
  sectionsTitle: string;
  sectionsSubtitle: string;
  modulesLabel: string;
  whyLabel: string;
  howLabel: string;
  resultLabel: string;
  tipsLabel: string;
  openLabel: string;
  workflowTitle: string;
  workflowSubtitle: string;
  workflow: Array<{
    label: string;
    detail: string;
  }>;
  faqTitle: string;
  faqSubtitle: string;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  sections: GuideSection[];
};
type HelpSearchItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  href: string;
  keywords: string;
};
type HelpAssistantAnswer = {
  title: string;
  body: string;
  steps: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
  }>;
  model?: string;
  source: "local" | "llm";
};
const COPY: Record<Locale, HelpCopy> = {
  zh: {
    hero: {
      kicker: "帮助中心",
      title: "Closr 全功能帮助中心",
      subtitle: "这里按模块解释 Closr 的功能、入口、适用场景、字段含义和常见问题。企业首次启用时，应先完成系统设置，再进入客户判断流程。",
      meta: "功能索引：设置 / 全景 / Decode / 客户 / 联系人 / 谋局 / 管线 / 任务",
      primaryCta: "查看功能目录",
      secondaryCta: "新用户体验手册"
    },
    productTitle: "先理解 Closr：它不是传统 CRM",
    productSubtitle: "传统 CRM 主要记录“发生了什么”；Closr 更关注“现在该怎么判断、下一步该怎么赢”。围绕续约扩容、沟通关系风险和RFP招投标等业务场景，把零散信号编译成带证据链的判断、谋局策略、RFP推进和校准闭环。谋局不是只找人推进，而是组织客户痛点、我方方案、证据、关系和时机。",
    productPositioning: [{
      title: "从记录到判断",
      description: "CRM 帮你记录客户、商机和活动；Closr 帮你判断客户真正想什么、谁影响决策、当前风险在哪里、下一步该怎么推进。",
      icon: Lightbulb
    }, {
      title: "从信息堆积到策略生成",
      description: "邮件、会议、聊天、通话、联系人、竞对和外部动态不会只是被保存，而会被转化为风险、机会、关系地图和下一步动作。",
      icon: ScanSearch
    }, {
      title: "从个人经验到组织智慧",
      description: "Closr 会把每次沟通、判断、证据来源、结果和复盘沉淀为可复用的账户记忆，让优秀 AE 的经验逐步变成团队共享能力。",
      icon: BookOpenCheck
    }],
    enginesTitle: "Closr 的四个判断系统",
    enginesSubtitle: "你可以把 Closr 理解成一个动态客户增长系统：先读懂客户信号，再形成可信判断，然后推演推进路径，最后用结果校准。",
    engines: [{
      name: "Decode / BABEL",
      layer: "信号层",
      description: "持续解读客户话语、语气、节奏和未明说信号，形成风险、机会和下一步动作。"
    }, {
      name: "Judgment Layer",
      layer: "判断层",
      description: "把客户、商机、联系人、RFP 和活动信号编译成当前局势判断、矛盾、不确定性和胜率。"
    }, {
      name: "Evidence Trace",
      layer: "可信层",
      description: "关键判断要能回到来源：邮件、会议、RFP、活动、人工反馈或 source_records，而不是只看 AI 输出。"
    }, {
      name: "Strategic Play",
      layer: "执行层",
      description: "基于当前局势生成推进路径：客户痛点是什么、我方方案如何贴合、需要什么证明、决策标准是什么、先接触谁、由谁出面，并用 win/loss 结果校准。"
    }],
    rolesTitle: "不同角色如何用 Closr",
    rolesSubtitle: "同一个客户工作区，对一线销售、销售经理和销售 VP 的价值不同。",
    roles: [{
      role: "AE / 一线销售",
      question: "我下一步该做什么？",
      value: "识别当前最值得推进的关键人、优先阻力和下一步动作，减少靠直觉推进。"
    }, {
      role: "销售经理",
      question: "团队卡在能力、路径还是账户结构？",
      value: "发现单线程推进、角色覆盖不足、关键证据缺失，把辅导落到真实客户情境。"
    }, {
      role: "销售 VP",
      question: "哪些大单该加码，哪些商机该降温？",
      value: "从组合视角看漏斗健康度、高危风险和资源调度，把数字汇报升级为战略判断。"
    }],
    tocTitle: "目录",
    quickTitle: "核心功能地图",
    quickSubtitle: "帮助中心按功能查找。企业 how-to-start 的第一步是设置组织、成员、权限、销售流程、产品报价和基础数据；如果你想按截图和 sample 跑第一遍，请打开新用户体验手册。",
    quickSteps: [{
      label: "01",
      text: "设置：配置组织、成员、权限、销售流程、产品报价和基础数据。",
      href: "/forge"
    }, {
      label: "02",
      text: "全景：查看重点客户、风险、任务和组合层面的优先级。",
      href: "/horizon"
    }, {
      label: "03",
      text: "解读：分析邮件、会议纪要、聊天记录和客户原话里的信号。",
      href: "/decode"
    }, {
      label: "04",
      text: "客户和联系人：沉淀账户判断、关键人、关系、动态、谋局和任务。",
      href: "/atlas"
    }, {
      label: "05",
      text: "谋局：把客户判断转成推进路径、关键假设和下一步动作。",
      href: "/plays"
    }, {
      label: "06",
      text: "管线和任务：管理商机阶段、RFP、forecast 与执行闭环。",
      href: "/pipeline"
    }],
    sectionsTitle: "按你遇到的问题找功能",
    sectionsSubtitle: "每个功能都从用户视角说明：你为什么会需要它、它帮你判断什么、什么时候该打开、下一步怎么做。",
    modulesLabel: "你看到这些模块时，可以用它判断什么",
    whyLabel: "你为什么需要它",
    howLabel: "你怎么用它",
    resultLabel: "用完后你应该得到什么",
    tipsLabel: "使用建议",
    openLabel: "打开",
    workflowTitle: "推荐日常工作流",
    workflowSubtitle: "每天使用 Closr 时，可以按这个顺序检查和推进。",
    workflow: [{
      label: "1",
      detail: "首次启用先完成系统设置：组织、成员、权限、销售流程、产品报价和基础数据。"
    }, {
      label: "2",
      detail: "再看全景：确认今天最该关注的客户、风险和任务。"
    }, {
      label: "3",
      detail: "录入新信号：把客户邮件、会议纪要、聊天记录放进解读。"
    }, {
      label: "4",
      detail: "回客户页并更新联系人：确认新判断、风险、关键人和关系覆盖。"
    }, {
      label: "5",
      detail: "调整谋局：把新判断转成下一步策略和关键假设。"
    }, {
      label: "6",
      detail: "落到任务和管线：明确谁在什么时候做什么。"
    }],
    faqTitle: "常见问题",
    faqSubtitle: "第一次使用最容易卡住的地方。",
    faqs: [{
      question: "我刚进来数据很少，正常吗？",
      answer: "正常。Closr 的判断来自客户、商机、联系人和沟通信号。先添加一个客户，再录入一段真实沟通，系统就有了形成判断的基础。"
    }, {
      question: "第一次应该先用哪个功能？",
      answer: "企业第一次启用应先进入「设置」，完成组织、成员、权限、销售流程、产品报价和基础数据；随后打开「新用户体验手册」，按 sample 跑完第一条客户判断闭环。"
    }, {
      question: "谋局和商机有什么区别？",
      answer: "商机回答交易在哪个阶段、金额多少、什么时候成交；谋局回答怎么赢这个客户：该找谁、说什么、验证什么、突破什么阻力。"
    }, {
      question: "客户页里为什么有概览、谋局、联系人、动态、任务这么多 tab？",
      answer: "它们对应一个客户的完整工作区：概览看判断，谋局看策略，联系人看权力结构，动态看信号历史，任务看下一步执行。"
    }, {
      question: "Closr 的判断为什么可信？",
      answer: "关键判断会尽量绑定证据来源，例如 Decode、会议、RFP、活动记录、人工反馈或 source_records。AI 输出只是展示/缓存材料，不能替代可追溯证据。"
    }, {
      question: "RFP 和赢输复盘放在哪里？",
      answer: "RFP 在管线商机详情里管理，用来记录招标文件、竞品、里程碑、投标判断和关联谋局；赢输复盘用于把真实结果校准回 Judgment Layer。"
    }],
    sections: [{
      id: "horizon",
      eyebrow: "01 / 全景",
      title: "全景 Horizon：每天先看哪里需要你关注",
      summary: "全景是进入 Closr 后的客户增长首页，用来汇总重点客户、风险、任务和 AI 建议。",
      icon: LayoutDashboard,
      why: "你不需要每天从客户列表和管线里手动翻风险。全景会随着你的数据增加，把最需要关注的客户、商机和任务集中呈现出来。",
      steps: ["点击左侧导航「全景」。", "先看顶部的整体指标和 AI 指挥中心，判断今天的优先级。", "查看风险、待办、商机阶段和 AI 建议。", "如果某个客户或商机被标记为需要关注，点击进入对应页面继续处理。"],
      result: "你会知道今天最应该处理哪些客户、哪些商机存在风险、哪些动作已经逾期或需要推进。",
      modules: [{
        name: "AI 指挥中心",
        purpose: "把客户组合、商机金额、风险和逾期动作压缩成一段可读的今日判断。",
        helps: "不用翻多个页面，就能知道今天管理层最该看哪几个客户、哪类风险正在变大。",
        useWhen: "每天第一次打开 Closr，先用它判断今天要追什么、帮谁、暂停什么。"
      }, {
        name: "全局态势指标",
        purpose: "展示活跃客户、Pipeline 总额、风险客户、逾期任务等关键数字。",
        helps: "让你从组合视角判断增长健康度，而不是只看单个商机的乐观叙述。",
        useWhen: "做周会、forecast、资源调度前，先看这里确认整体盘面。"
      }, {
        name: "重点客户局势",
        purpose: "列出当前最值得关注的客户，并显示阶段、风险、最近信号和下一步建议。",
        helps: "快速发现大客户是否出现采购压价、关键人缺失、竞品介入、推进停滞等问题。",
        useWhen: "需要决定今天应该亲自介入哪个客户，或让团队优先跟进哪个客户时。"
      }, {
        name: "谋局信号",
        purpose: "把最近沟通、客户变化和系统判断转成需要调整谋局的提示。",
        helps: "避免客户信号已经变化，但团队还沿用旧策略继续推进。",
        useWhen: "看到“重新计划谋局”、关系覆盖不足、关键假设变化等提示时，进入客户或谋局页处理。"
      }, {
        name: "今日优先事项",
        purpose: "聚合逾期任务、关键跟进和高影响动作。",
        helps: "把 AI 建议落成具体行动，避免判断停留在页面上。",
        useWhen: "每天安排销售动作、分配团队任务、检查是否有人漏跟进时。"
      }, {
        name: "组合洞察和风险分布",
        purpose: "按阶段、金额、客户状态、风险类型和团队动作展示组合层面的变化。",
        helps: "识别 pipeline 虚胖、风险集中、资源错配和团队执行断点。",
        useWhen: "做 forecast、业务复盘、重点客户资源分配时。"
      }, {
        name: "动态信息流",
        purpose: "展示最近 Decode、任务、商机、客户判断和活动更新。",
        helps: "让管理者知道团队最近到底发生了什么，而不是只等口头同步。",
        useWhen: "想追溯某个判断为什么出现，或确认团队是否真的执行了下一步动作时。"
      }],
      tips: ["新账号数据少时，全景会比较空；先录入客户和沟通信号，判断会逐步丰富。"],
      preview: {
        caption: "这是你会看到的全景界面：AI 指挥中心会把活跃商机、Pipeline 总额、风险和逾期任务放在同一屏。",
        start: "点这里开始：左侧导航「全景」→ 先看 AI 指挥中心和全局态势。",
        done: "完成后看到什么：今天最该关注的客户、风险商机和需要跟进的动作。"
      },
      links: [{
        label: "打开全景",
        href: "/horizon"
      }]
    }, {
      id: "decode",
      eyebrow: "02 / 解读",
      title: "解读 Decode：把客户沟通变成可执行判断",
      summary: "解读是最核心的入口。你可以把邮件、会议纪要、通话记录、聊天内容粘贴进去，让 AI 分析真实意图和风险。",
      icon: ScanSearch,
      why: "销售最容易漏掉的是客户话里的隐含信号：预算压价、技术顾虑、采购阻力、关键人态度变化。解读会把这些信号结构化，并结合客户模型、谋局目标和 DISC 推进风格判断，给出更适合的回应和推进方式。",
      steps: ["点击左侧导航「解读」。", "选择「邮件/聊天」或其他合适的来源类型。", "选择或填写关联客户。客户越准确，AI 判断越少猜。", "粘贴客户邮件、会议纪要、通话记录或聊天内容。邮件类内容要保留 From、To、Cc、Subject、时间、发件人 title 和公司信息。", "点击解读按钮，等待 AI 输出分析。", "检查真实意图、风险信号、机会信号、下一步动作和回复建议。", "确认有价值后，点击保存到客户。"],
      result: "这段沟通会从一次性文本变成客户档案里的判断证据，后续会影响客户概览、谋局策略和任务建议。",
      modules: [{
        name: "信号类型",
        purpose: "标记这段内容来自邮件、会议、聊天、通话还是其他来源。",
        helps: "让系统理解上下文，避免把正式采购邮件和随口聊天用同一种方式判断。",
        useWhen: "每次粘贴客户沟通前先选，来源越准确，后续判断越稳。"
      }, {
        name: "关联客户 / 商机",
        purpose: "把这段沟通绑定到具体客户或机会。",
        helps: "后续客户概览、谋局、任务和管线才能继承这条证据。",
        useWhen: "只要这段内容和某个客户相关，就不要留空。"
      }, {
        name: "客户原文输入区",
        purpose: "粘贴客户邮件、会议纪要、聊天记录或通话摘要。",
        helps: "保留原始表达和邮件元信息，让 Closr 从客户话语、发件人、收件人、抄送链路里识别预算、权力、技术、采购和竞品信号。",
        useWhen: "客户给出价格压力、技术疑虑、采购流程、内部评审、竞品信息时最值得解读。"
      }, {
        name: "AI 解读结果",
        purpose: "输出真实意图、风险信号、机会信号、下一步动作和推荐回复。",
        helps: "把模糊沟通变成可讨论、可分派、可追踪的判断。",
        useWhen: "读完客户邮件仍不确定对方真正担心什么，或需要给团队一个清晰判断时。"
      }, {
        name: "保存到客户",
        purpose: "把有价值的解读沉淀到客户档案。",
        helps: "让这条信号影响客户概览、谋局调整、联系人判断和后续任务。",
        useWhen: "确认这段沟通会影响客户判断、风险或下一步动作时。"
      }, {
        name: "推荐回复 / 后续动作",
        purpose: "把解读结果转成可直接使用的客户回应和内部动作。",
        helps: "减少从分析到行动的断层，让团队能立刻写邮件、约会议、补材料或升级资源。",
        useWhen: "客户要求报价、ROI、技术评审、采购模板、补充材料时。"
      }],
      tips: ["不要只粘贴正文或一句话。邮件最好保留 From、To、Cc、Subject、时间、发件人 title、公司信息和当前商机背景。", "Cc 往往比正文更能暴露决策链：采购、财务、技术评审、领导是否被拉进来，会直接影响联系人和关系判断。", "解读不是简单摘要，重点看：客户真实意图、潜在顾虑、沟通风险、下一步动作和推荐回复。", "如果 AI 判断不准，回到客户页用「修正判断」补充你的真实判断。"],
      preview: {
        caption: "这是你会看到的解读界面：选择信号类型、关联客户，再粘贴客户邮件、会议纪要或聊天记录。",
        start: "点这里开始：左侧导航「解读」→ 在信号录入区粘贴客户沟通内容。",
        done: "完成后看到什么：真实意图、风险信号、机会信号、推荐回复和下一步行动。"
      },
      links: [{
        label: "打开解读",
        href: "/decode"
      }]
    }, {
      id: "atlas",
      eyebrow: "03 / 客户",
      title: "客户 Atlas：一个客户的完整工作区",
      summary: "客户页不是简单资料页，而是围绕单个客户沉淀判断、联系人、沟通、商机、谋局和任务的地方。",
      icon: Building2,
      why: "B2B 销售不是只跟一个联系人聊天。你需要持续理解这个客户现在的状态、关键人、风险、历史沟通和下一步动作。客户页就是这个账户的动态客户模型：信号、判断、关系和行动都会回到这里。",
      steps: ["点击左侧导航「客户」。", "找到目标客户，点击进入客户页。", "在「概览」查看当前判断、关键矛盾、最近变化和交易摘要。", "点击「看完整判断」可以展开更详细的证据和判断来源。", "使用顶部快捷动作：邮件、通话、会议、创建任务、新建谋局、搜索情报、添加联系人。"],
      result: "你会看到这个客户当前该怎么推进、最大风险是什么、最近哪些信号改变了判断、下一步应该做什么。",
      modules: [{
        name: "客户列表",
        purpose: "集中展示所有客户、阶段、负责人、健康度和最近更新。",
        helps: "先决定该看哪个客户，而不是在多个表格里找线索。",
        useWhen: "管理重点客户、检查沉睡客户、筛选高风险客户时。"
      }, {
        name: "客户概览",
        purpose: "展示当前判断、关键矛盾、风险、机会、近期变化和下一步动作。",
        helps: "让团队对同一个客户形成一致判断，减少只靠个人记忆推进。",
        useWhen: "开客户会、做大单复盘、准备拜访或需要快速接手客户时。"
      }, {
        name: "完整判断 / 证据来源",
        purpose: "展开 AI 判断背后的来源、理由和变化。",
        helps: "判断不是一句 AI 结论，而是能追溯到邮件、会议、任务、RFP 或人工反馈。",
        useWhen: "你要确认某个风险是否真实，或需要向团队解释为什么要调整策略时。"
      }, {
        name: "客户页谋局",
        purpose: "查看该客户当前推进目标、关键假设、关系缺口和下一步策略。",
        helps: "把客户判断和实际推进路径连接起来。",
        useWhen: "Decode 出现新风险、采购条件变化、关键人变化或需要重新计划谋局时。"
      }, {
        name: "客户页联系人",
        purpose: "管理该客户下的决策者、预算人、技术评估人、采购、支持者和阻碍者。",
        helps: "发现关系覆盖是否单薄，谁缺失，谁需要被争取。",
        useWhen: "发现客户推进依赖单一联系人，或进入采购/技术评审阶段时。"
      }, {
        name: "动态 / 活动记录",
        purpose: "按时间线保留 Decode、任务、会议、邮件、商机和人工更新。",
        helps: "追溯客户判断如何演变，避免团队只看当前结论。",
        useWhen: "复盘、交接客户、解释风险变化或找证据时。"
      }, {
        name: "客户任务",
        purpose: "展示这个客户相关的所有下一步动作和完成状态。",
        helps: "保证判断能落地，不让关键跟进没人负责。",
        useWhen: "客户会后分配动作，或检查团队是否按策略执行时。"
      }],
      tips: ["客户判断有时需要加载几秒；如果刚保存 Decode，刷新或稍等后再看。", "建议把客户页当作每个大客户的客户增长工作台，而不是资料库。"],
      preview: {
        caption: "这是你会看到的客户页：顶部是客户状态和快捷动作，下方按概览、谋局、联系人、动态、任务组织所有判断。",
        start: "点这里开始：左侧导航「客户」→ 选择一个客户 → 先看「概览」。",
        done: "完成后看到什么：客户当前阶段、关键风险、下一步动作和可继续钻取的判断证据。"
      },
      links: [{
        label: "打开客户",
        href: "/atlas"
      }]
    }, {
      id: "contacts",
      eyebrow: "04 / 联系人",
      title: "联系人：补齐采购委员会和关键人地图",
      summary: "联系人页帮助你识别决策者、预算负责人、技术评估人、内部推动者和可能阻碍者。",
      icon: Users,
      why: "大客户成交通常不是一个人决定。只认识对接人会产生单线程风险，Closr 会帮你看到关系覆盖是否足够，并把决策者、预算控制者、技术评估人、采购、支持者、中立方和阻碍者放到同一张地图里。",
      steps: ["进入某个客户页，点击「联系人」。", "点击添加联系人，补充姓名、职位、角色和联系方式。", "优先补充决策者、预算负责人、技术评估人、内部推动者。", "查看利益相关方分析和 AI 主动建议。", "对关键但未覆盖的人，创建任务或谋局动作去建立联系。"],
      result: "你会知道当前关系覆盖是否健康，谁是支持者，谁可能阻碍，下一步应该优先接触谁。",
      modules: [{
        name: "联系人档案",
        purpose: "记录姓名、职位、联系方式、所属客户、影响力和角色。",
        helps: "把散落在人脑、微信、邮件里的关键人信息变成团队可见资产。",
        useWhen: "新增关键人、客户组织变化、或销售交接时。"
      }, {
        name: "采购委员会角色",
        purpose: "区分决策者、预算负责人、技术评估人、采购、使用方、推动者和阻碍者。",
        helps: "看到谁真正影响成交，避免只围着友好联系人推进。",
        useWhen: "进入预算、技术评审、采购谈判或 RFP 阶段前必须检查。"
      }, {
        name: "关系覆盖分析",
        purpose: "判断当前覆盖是否单线程、是否缺关键角色、是否存在未触达高影响力人物。",
        helps: "提前暴露大单最常见风险：内部支持者不够强、决策者没见过、技术评审没有参与。",
        useWhen: "商机金额大、周期长、推进突然变慢，或全景提示关系风险时。"
      }, {
        name: "沟通风格 / DISC",
        purpose: "沉淀关键人的沟通偏好和决策风格。",
        helps: "让邮件、会议、材料和推进节奏更贴合对方，而不是所有人用同一种话术。",
        useWhen: "准备给 CFO、CTO、采购负责人或业务负责人分别沟通时。"
      }, {
        name: "联系人下一步动作",
        purpose: "把“需要接触谁”转成任务、会议或谋局动作。",
        helps: "关系地图不只是展示，而是能直接推动覆盖补齐。",
        useWhen: "发现关键人缺失、支持者薄弱、阻碍者没有处理计划时。"
      }],
      tips: ["第一次不需要填很多人，但至少要有决策者、技术评估人和内部推动者。", "如果只有一个推动者，要警惕单线程风险，尽快建立第二推进线。"],
      links: [{
        label: "打开客户",
        href: "/atlas"
      }]
    }, {
      id: "plays",
      eyebrow: "05 / 谋局",
      title: "谋局 Plays：把客户判断变成赢单策略",
      summary: "谋局回答的是“这个客户怎么赢”：该找谁、说什么、验证什么、突破什么阻力、下一步怎么推进。",
      icon: Route,
      why: "CRM 通常告诉你交易在哪个阶段，但不会告诉你怎么推进。谋局让销售策略变成清晰路径：先接触谁、验证什么、用什么材料、何时升级、如何处理阻力。",
      steps: ["点击左侧导航「谋局」，查看所有活跃谋局；或在客户页点击「谋局」。", "选择一个客户或点击新建谋局。", "选择目标，例如建立长期关系、推进关键决策人、消除采购阻力、赢下当前商机。", "补充目标描述、关键假设、关键联系人和下一步动作。", "执行后持续更新进展，让谋局保持活跃。"],
      result: "你会得到一条围绕客户目标展开的推进路径，并能把策略拆成任务持续执行。",
      modules: [{
        name: "谋局列表",
        purpose: "集中查看所有活跃谋局、关联客户、目标、状态和最近变化。",
        helps: "让管理者知道团队正在用什么策略推进哪些关键客户。",
        useWhen: "检查重点客户是否有清晰推进路径，或判断哪些谋局需要你介入时。"
      }, {
        name: "谋局目标",
        purpose: "定义这条谋局要达成什么，例如拿到技术评审会参与、补齐 CFO ROI 口径、突破采购压价。",
        helps: "把泛泛的“推进客户”变成可判断成败的具体目标。",
        useWhen: "客户出现明确阻力、关键人缺位、或需要争取新资源时。"
      }, {
        name: "关键假设",
        purpose: "记录当前策略依赖的判断，例如谁有影响力、客户真正担心什么、竞品优势在哪里。",
        helps: "让团队知道策略背后的逻辑，也方便新信号出现后判断是否需要重新计划谋局。",
        useWhen: "每次 Decode、会议或 RFP 反馈改变客户局势后都要检查。"
      }, {
        name: "关系与覆盖缺口",
        purpose: "把谋局和联系人地图连接，显示哪些角色需要被触达或影响。",
        helps: "避免策略只停留在话术层面，真正落到关键人覆盖。",
        useWhen: "需要 CTO、CFO、采购负责人、业务负责人参与评审或决策时。"
      }, {
        name: "推进动作",
        purpose: "把谋局拆成下一步任务、会议、材料、内部升级和客户沟通。",
        helps: "让策略变成可执行动作，并能在任务页追踪完成情况。",
        useWhen: "谋局确定后，马上把下一步分派给具体负责人。"
      }, {
        name: "重新计划谋局提示",
        purpose: "当新客户信号影响原有假设时，提示你更新策略。",
        helps: "防止客户预算、ROI、竞品或关键人变化后，团队仍按旧路径推进。",
        useWhen: "解读新邮件后看到系统提示需要重新计划谋局时。"
      }],
      tips: ["客户页谋局入口在 tab「谋局」里；如果从全局谋局进入，也可以按客户查找。", "谋局不是一次性计划，客户信号变化后要回来更新假设和下一步动作。"],
      preview: {
        caption: "这是你会看到的谋局界面：先看采购委员会覆盖率和组织结构，再把关键关系、阻力和推进路径拆成策略。",
        start: "点这里开始：进入客户页「谋局」tab，或从左侧导航「谋局」按客户查找。",
        done: "完成后看到什么：围绕该客户的推进路径、关键假设、关系缺口和后续行动。"
      },
      links: [{
        label: "打开谋局",
        href: "/plays"
      }]
    }, {
      id: "pipeline",
      eyebrow: "06 / 管线",
      title: "管线 Pipeline：管理商机阶段、RFP 和交易风险",
      summary: "管线用来看商机阶段、金额、概率、预计成交日期、RFP 投标判断和推进风险。",
      icon: GitBranch,
      why: "商机是收入结果，客户判断、RFP 证据和谋局解释为什么它会推进或停滞。管线负责把结果层面管理清楚，并把招投标判断与行动计划连起来。",
      steps: ["点击左侧导航「管线」。", "按看板查看不同销售阶段的机会。", "点击某个商机，查看金额、阶段、概率、预计成交日期、RFP 和风险。", "如果有 RFP，检查招标文件、竞品、里程碑、投标判断和证据信号是否完整。", "如果商机停留太久、RFP 证据不足或缺少谋局，回到客户页补充策略。", "推进阶段时，确保下一步任务也已经创建。"],
      result: "你会看到所有商机的阶段分布、收入规模、风险状态、RFP 判断，以及哪些机会需要立刻推进。",
      modules: [{
        name: "商机看板",
        purpose: "按销售阶段展示所有机会、金额、概率、预计成交时间和负责人。",
        helps: "让团队从收入结果层面看当前 pipeline 是否健康。",
        useWhen: "做 forecast、周会、阶段推进和资源分配时。"
      }, {
        name: "商机详情",
        purpose: "查看单个机会的金额、阶段、概率、客户、联系人、活动和风险。",
        helps: "把“这单值多少钱”与“为什么能赢/为什么危险”放在一起看。",
        useWhen: "重点商机推进、阶段变更、或需要管理层介入时。"
      }, {
        name: "RFP / 招投标管理",
        purpose: "记录招标文件、里程碑、竞品、评分标准、投标判断和证据。",
        helps: "避免 RFP 只靠销售感觉推进，让是否投、怎么投、输赢原因都有依据。",
        useWhen: "客户进入正式采购、招标、评审、比价或要求统一模板时。"
      }, {
        name: "风险与阻塞",
        purpose: "标记采购压价、预算不清、技术评审缺口、竞品优势、阶段停滞等风险。",
        helps: "让 pipeline 不是只显示金额，也显示这笔收入是否可信。",
        useWhen: "某个机会金额大但推进慢、概率虚高、或客户反馈开始变保守时。"
      }, {
        name: "阶段推进",
        purpose: "把机会从发现、验证、方案、采购、合同等阶段推进。",
        helps: "让团队对成交时间和阶段定义保持一致。",
        useWhen: "客户完成关键会议、确认预算、进入采购流程或签约前后。"
      }],
      tips: ["管线里看到风险后，不要只改阶段；最好回客户页检查判断、证据链和谋局。", "RFP 判断应能回到具体文件、竞品、里程碑或人工校准来源。"],
      links: [{
        label: "打开管线",
        href: "/pipeline"
      }]
    }, {
      id: "pulse",
      eyebrow: "07 / 任务",
      title: "任务 Pulse：把建议变成下一步行动",
      summary: "任务页用来管理所有销售待办，确保 AI 建议和谋局动作真正执行。",
      icon: ClipboardList,
      why: "没有任务，策略就容易停留在纸面。任务把“下一步应该做什么”变成明确责任和时间。",
      steps: ["点击左侧导航「任务」。", "查看待办、进行中、已完成和逾期任务。", "点击新建任务，把 Decode 或谋局里的下一步动作写成任务。", "关联客户或商机，设置优先级和截止日期。", "完成动作后及时更新任务状态。"],
      result: "你会得到一个清晰的执行清单，知道每个客户下一步由谁在什么时候推进。",
      modules: [{
        name: "任务列表",
        purpose: "集中展示待办、进行中、已完成和逾期任务。",
        helps: "让销售动作可追踪，不再依赖口头承诺或个人备忘录。",
        useWhen: "每天检查团队执行、客户会后分派动作、或追踪逾期跟进时。"
      }, {
        name: "任务优先级",
        purpose: "标记任务的重要性和紧急程度。",
        helps: "区分真正影响大单推进的动作和普通行政事项。",
        useWhen: "全景提示高风险客户、谋局需要关键动作、或客户要求限时回复时。"
      }, {
        name: "关联客户 / 商机",
        purpose: "把任务绑定到具体客户或机会。",
        helps: "回到客户页或管线时能看到上下文，知道这件事为什么重要。",
        useWhen: "任何客户跟进、材料补充、内部协调、会议安排都应该关联。"
      }, {
        name: "截止时间和状态",
        purpose: "明确什么时候完成、当前是否阻塞、是否已经执行。",
        helps: "让管理者能及时发现关键动作延误。",
        useWhen: "客户要求报价、ROI、技术材料、采购模板或内部资源确认时。"
      }, {
        name: "从 Decode / 谋局生成动作",
        purpose: "把 AI 建议和策略拆成任务。",
        helps: "保证 Closr 的判断不会停留在分析结果里，而是进入执行闭环。",
        useWhen: "完成一次解读、更新一次谋局、或确认一个关键阻力后。"
      }],
      tips: ["每次完成一次解读或谋局调整后，建议至少创建一个下一步任务。"],
      links: [{
        label: "打开任务",
        href: "/pulse"
      }]
    }, {
      id: "forge",
      eyebrow: "08 / 设置",
      title: "设置 Forge / 组织 Organization：企业启用 Closr 的第一步",
      summary: "设置和组织页集中管理组织、团队成员、角色权限、数据范围、审计、销售流程、产品报价、数据导入导出和高级工具。",
      icon: Settings2,
      why: "企业使用 Closr 前，必须先统一组织边界、角色权限、销售阶段、产品报价和基础数据。否则后续客户判断、管线、任务和报表会因为口径不一致而失真。",
      steps: ["点击左侧导航「设置」。", "先完成组织信息：公司名称、默认语言、币种和基础偏好。", "进入「组织」管理团队成员：邀请成员，设置 owner / admin / member 平台角色。", "为每个成员设置职级：AE / Manager / VP，用来决定默认数据范围和管理视图。", "如团队规模较大，创建团队分组，并把成员分配到对应团队。", "确认客户负责人规则：客户、商机、任务要有明确 owner；交接时使用转移/回收能力，避免客户悬空。", "统一销售流程：商机阶段、健康度、forecast、赢输复盘和任务优先级。", "维护产品与报价：产品线、服务项、报价口径、ROI 常用表达。", "准备基础数据：确认来源和使用权限，再录入或导入客户、联系人和商机。", "上线前检查审计入口，确认成员、权限、AI 使用和关键操作可追溯。", "需要重新学习页面时，点击功能引导或回到帮助中心。"],
      result: "你会得到一个适合企业团队共同使用的 Closr 工作区，而不是只适合个人试用的空白工具。",
      modules: [{
        name: "个人设置",
        purpose: "管理姓名、头像、语言、主题、默认偏好等个人体验。",
        helps: "让每个用户按自己的工作习惯使用 Closr。",
        useWhen: "第一次进入系统，或需要切换语言、显示偏好时。"
      }, {
        name: "组织与团队设置",
        purpose: "管理组织名称、团队成员、团队分组和基础组织配置。",
        helps: "让 Closr 从个人工具变成团队工作区，避免成员、客户和权限边界混乱。",
        useWhen: "企业第一次启用、多人协作、团队扩张、或需要调整组织结构时。"
      }, {
        name: "成员邀请",
        purpose: "邀请新成员加入组织，并为其选择平台角色和职级。",
        helps: "确保新成员进入后就拥有合适的操作权限和默认数据视图。",
        useWhen: "新增 AE、销售经理、VP、运营或管理员账号时。"
      }, {
        name: "平台角色：owner / admin / member",
        purpose: "控制谁能管理组织、邀请成员、修改设置和访问管理能力。",
        helps: "把系统管理权和日常销售使用权分开，降低误操作和权限外泄风险。",
        useWhen: "决定谁负责系统治理、谁只是使用客户和商机功能时。"
      }, {
        name: "职级与数据范围：AE / Manager / VP",
        purpose: "按职级决定默认数据范围：个人、团队或全局视角。",
        helps: "AE 聚焦自己的客户，Manager 看团队，VP 看组合和全局风险。",
        useWhen: "需要让不同层级看到不同范围的客户、商机、任务和报表时。"
      }, {
        name: "团队分组",
        purpose: "创建团队并把成员分配进去。",
        helps: "让团队范围过滤、manager 管理视图和客户协作更符合真实组织结构。",
        useWhen: "销售团队按区域、行业、客户组或业务线管理时。"
      }, {
        name: "客户负责人和交接",
        purpose: "为客户、商机和任务明确 owner，并在人员变化时转移或回收。",
        helps: "避免客户无人负责、交接断层、任务留在离职或转岗成员名下。",
        useWhen: "客户认领、团队调整、销售离职/转岗、或 manager 需要回收重点客户时。"
      }, {
        name: "销售流程",
        purpose: "配置阶段、流程语言、管线习惯和团队统一定义。",
        helps: "让机会阶段、forecast 和复盘使用同一套标准。",
        useWhen: "团队已有固定销售流程，或准备正式启用时。"
      }, {
        name: "产品与报价",
        purpose: "维护产品、服务项、报价口径和可复用方案信息。",
        helps: "让 Decode、报价、RFP 和客户材料能调用一致的商业口径。",
        useWhen: "团队需要统一价格、套餐、服务线或方案模板时。"
      }, {
        name: "审计与高级工具",
        purpose: "查看关键系统行为、权限相关记录和高级配置入口。",
        helps: "让团队在正式使用时具备治理和排查能力。",
        useWhen: "上线前检查配置、排查数据问题、或需要管理员治理时。"
      }],
      tips: ["设置页偏治理和配置；日常查功能时重点看模块职责、入口、权限和字段含义。"],
      links: [{
        label: "打开设置",
        href: "/forge"
      }, {
        label: "打开组织",
        href: "/organization"
      }]
    }, {
      id: "more-features",
      eyebrow: "09 / 更多入口",
      title: "更多功能：把情报、撰写、报表和治理补齐",
      summary: "除了左侧主导航，Closr 还提供情报、邮件撰写、报表、预测、竞品、财务分析、导入和通知等辅助能力。",
      icon: BookOpenCheck,
      why: "这些功能不是每天都必须打开，但会在准备客户沟通、做管理复盘、分析 RFP、导入数据或上线治理时补齐关键能力。",
      steps: ["优先从主流程开始：全景、解读、客户、谋局、管线、任务。", "当你需要写客户邮件，打开「撰写」。", "当你需要查客户外部动态或内部知识，打开「情报」或客户页知识模块。", "当你需要管理层复盘，打开「报表」「预测」「竞品分析」或「财务分析」。", "当你需要批量迁移数据或配置团队，打开「导入」「组织」「产品」「渠道」等治理入口。"],
      result: "你可以围绕同一批客户完成从信号录入、判断、策略、执行，到报表复盘和团队治理的完整闭环。",
      modules: [{
        name: "撰写 Compose",
        purpose: "根据客户背景、解读结果和推进目标生成邮件或沟通草稿。",
        helps: "把客户判断转成更贴合角色、语气和目标的对外表达。",
        useWhen: "需要回复客户邮件、发 ROI 材料、约技术评审、推动采购下一步时。"
      }, {
        name: "情报 Intel / 知识库",
        purpose: "沉淀客户新闻、外部动态、source records、内部材料和可检索知识。",
        helps: "让销售判断有来源，避免只靠 AI 临场编写或个人记忆。",
        useWhen: "准备客户会议、RFP、行业背景调研、或需要解释判断依据时。"
      }, {
        name: "报表 Reports",
        purpose: "展示阶段转化、赢输分析、团队活动、Decode 使用和关键模式。",
        helps: "把 Closr 里的执行数据转成管理层可复盘的经营视图。",
        useWhen: "周会、月度复盘、团队 coaching、判断哪些动作真的提升胜率时。"
      }, {
        name: "预测 Forecast",
        purpose: "基于商机阶段、金额、风险和历史表现辅助判断收入预测。",
        helps: "让 forecast 不只是销售主观概率，而能参考风险和证据。",
        useWhen: "做季度预测、commit 判断、或识别 pipeline 虚高时。"
      }, {
        name: "竞品分析",
        purpose: "记录竞争对手、客户比较口径、优势劣势和应对策略。",
        helps: "让团队在 RFP、采购比价、替换供应商时有统一应对口径。",
        useWhen: "客户提到 TCS、Mantis、其他供应商报价或竞品方案时。"
      }, {
        name: "财务分析",
        purpose: "分析成本、ROI、预算归属、回报周期和商业合理性。",
        helps: "把方案从“功能价值”推进到 CFO/采购能接受的财务口径。",
        useWhen: "客户要求 ROI、一年回本、降本测算、预算归属或采购模板时。"
      }, {
        name: "导入 Import",
        purpose: "批量导入客户、联系人、商机或其他基础数据。",
        helps: "让团队不用从零手动录入，能更快进入真实业务场景。",
        useWhen: "从旧 CRM 或已获授权的表格迁移数据时。"
      }, {
        name: "通知 Notifications",
        purpose: "提醒你风险变化、任务逾期、客户更新和系统建议。",
        helps: "避免重要信号只停留在某个页面里没人看到。",
        useWhen: "需要及时处理关键客户变化或逾期动作时。"
      }, {
        name: "组织 / 产品 / 渠道",
        purpose: "管理团队结构、产品服务、渠道伙伴和基础业务配置。",
        helps: "让 Closr 支持团队持续协作和长期使用。",
        useWhen: "团队试用转正式使用，或需要统一产品报价、权限和业务结构时。"
      }],
      tips: ["这些入口是主导航以外的补充能力；遇到具体场景时再打开对应模块。"],
      links: [{
        label: "打开撰写",
        href: "/compose"
      }, {
        label: "打开情报",
        href: "/intel"
      }, {
        label: "打开报表",
        href: "/reports"
      }]
    }]
  },
  en: {
    hero: {
      kicker: "Help Center",
      title: "Closr full feature help center",
      subtitle: "Use this page as a module-by-module reference for capabilities, entry points, fields, scenarios, and FAQs. For the first-run walkthrough, open the separate onboarding guide.",
      meta: "Feature index: Horizon / Decode / Accounts / Contacts / Plays / Pipeline / Tasks / Settings",
      primaryCta: "View feature guide",
      secondaryCta: "Onboarding guide"
    },
    productTitle: "Understand Closr first: it is not a traditional CRM",
    productSubtitle: "A CRM records what happened. Closr helps you judge what is happening now and what to do next. Enterprise 1.0 focuses on three accounts: renewal/expansion, RFP/tender, and communication-risk calibration.",
    productPositioning: [{
      title: "From record to judgment",
      description: "Closr helps you understand customer intent, decision influence, current risk, and the next move — not just store records.",
      icon: Lightbulb
    }, {
      title: "From data pile to strategy",
      description: "Emails, meetings, chats, contacts, competitors, and external signals become risks, opportunities, relationship maps, and next actions.",
      icon: ScanSearch
    }, {
      title: "From individual instinct to team wisdom",
      description: "Each signal, judgment, outcome, and review becomes reusable account memory and shared operating knowledge.",
      icon: BookOpenCheck
    }],
    enginesTitle: "Closr’s four judgment systems",
    enginesSubtitle: "Think of Closr as a dynamic customer-growth system: read customer updates, form evidence-backed judgment, plan the path, and calibrate with outcomes.",
    engines: [{
      name: "Decode / BABEL",
      layer: "Signal",
      description: "Decode customer words, tone, pace, and hidden signals into risks, opportunities, and next actions."
    }, {
      name: "Judgment Layer",
      layer: "Judgment",
      description: "Compile account, opportunity, contact, RFP, and activity signals into current account judgment."
    }, {
      name: "Evidence Trace",
      layer: "Trust",
      description: "Keep important claims tied to source records instead of treating AI output as final truth."
    }, {
      name: "Strategic Play",
      layer: "Execution",
      description: "Generate the path: customer pain, solution fit, proof needed, decision criteria, owner, and next action."
    }],
    rolesTitle: "How each role uses Closr",
    rolesSubtitle: "The same account workspace creates different value for AEs, managers, and sales VPs.",
    roles: [{
      role: "AE",
      question: "What should I do next?",
      value: "Find the key person, highest-priority blocker, and next action with less guesswork."
    }, {
      role: "Sales Manager",
      question: "Is the team blocked by skill, path, or account structure?",
      value: "Spot single-threaded deals, missing role coverage, and weak evidence for targeted coaching."
    }, {
      role: "Sales VP",
      question: "Which deals deserve resources, and which should cool down?",
      value: "Use risk, health, and portfolio signals for strategic resource allocation."
    }],
    tocTitle: "Contents",
    quickTitle: "Core feature map",
    quickSubtitle: "The help center is for feature lookup, not the full onboarding flow. Use this map for common entry points; use the onboarding guide for a screenshot-and-sample walkthrough.",
    quickSteps: [{
      label: "01",
      text: "Horizon: review focus accounts, risks, tasks, and portfolio priorities.",
      href: "/horizon"
    }, {
      label: "02",
      text: "Decode: analyze emails, meeting notes, chats, and customer words.",
      href: "/decode"
    }, {
      label: "03",
      text: "Accounts: keep account judgment, contacts, activity, plays, and tasks together.",
      href: "/atlas"
    }, {
      label: "04",
      text: "Contacts: maintain roles, influence, relationship signals, and communication style.",
      href: "/atlas"
    }, {
      label: "05",
      text: "Plays: turn account judgment into path, assumptions, and next actions.",
      href: "/plays"
    }, {
      label: "06",
      text: "Pipeline and Tasks: manage opportunity stage, RFP, forecast, and execution.",
      href: "/pipeline"
    }],
    sectionsTitle: "Detailed feature guide",
    sectionsSubtitle: "Each module explains why it matters, how to use it, and what you should see after using it.",
    modulesLabel: "Modules / features",
    whyLabel: "Why it matters",
    howLabel: "How to use it",
    resultLabel: "What you should see",
    tipsLabel: "Tips",
    openLabel: "Open",
    workflowTitle: "Recommended daily workflow",
    workflowSubtitle: "Use this sequence when working deals in Closr.",
    workflow: [{
      label: "1",
      detail: "Check Horizon for today’s focus accounts, risks, and tasks."
    }, {
      label: "2",
      detail: "Add new customer updates through Decode."
    }, {
      label: "3",
      detail: "Return to the account page and review changed judgment."
    }, {
      label: "4",
      detail: "Update contacts and relationship coverage."
    }, {
      label: "5",
      detail: "Adjust the play and next assumptions."
    }, {
      label: "6",
      detail: "Turn the next step into a task or pipeline action."
    }],
    faqTitle: "FAQ",
    faqSubtitle: "Common first-use questions.",
    faqs: [{
      question: "Why is my workspace sparse at first?",
      answer: "Closr needs accounts, opportunities, contacts, and customer updates to form judgment. Start with one real account and one real customer message."
    }, {
      question: "Which feature should I try first?",
      answer: "Use this page when you are looking up a feature. For first-time onboarding, open the separate onboarding guide and follow its sample workflow."
    }, {
      question: "What is the difference between a play and an opportunity?",
      answer: "An opportunity tracks stage, amount, probability, and timing. A play explains how to win the account."
    }, {
      question: "Why are there many tabs on the account page?",
      answer: "They represent the full account workspace: overview for judgment, plays for strategy, contacts for power map, activity for signals, and tasks for execution."
    }],
    sections: []
  }
};
function getCopy(locale: Locale) {
  if (locale === "en") {
    return {
      ...COPY.en,
      sections: COPY.zh.sections
    } satisfies HelpCopy;
  }
  return COPY.zh;
}
const SEARCH_SUGGESTIONS: Record<Locale, string[]> = {
  zh: ["我今天该先看什么", "客户邮件到底说明什么", "这单为什么危险", "我要找谁推进", "ROI 怎么给客户讲", "怎么重新计划谋局"],
  en: ["What are play signals in Horizon", "How do I decode a customer email", "Where can I check ROI", "How do I replan a play"]
};
const SEARCH_SYNONYMS: Record<string, string[]> = {
  ai: ["AI", "智能", "建议", "判断", "解读"],
  roi: ["ROI", "回本", "财务", "预算", "成本", "回报周期"],
  rfp: ["RFP", "招标", "投标", "采购", "竞品", "评分"],
  邮件: ["邮件", "回复", "撰写", "客户沟通", "Decode", "解读"],
  谋局: ["谋局", "策略", "推进路径", "重新计划", "关键假设", "关系覆盖"],
  全景: ["全景", "Horizon", "仪表盘", "今日", "风险", "优先事项"],
  客户: ["客户", "账户", "Atlas", "概览", "工作区", "证据"],
  联系人: ["联系人", "关键人", "决策者", "CTO", "CFO", "采购委员会"],
  管线: ["管线", "Pipeline", "商机", "阶段", "forecast", "预测"],
  任务: ["任务", "Pulse", "待办", "逾期", "执行", "下一步"],
  危险: ["危险", "风险", "阻塞", "高危", "停滞", "压价", "竞品", "预算", "关系覆盖", "商机"]
};
function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function expandSearchQuery(query: string) {
  const normalized = normalizeSearchText(query);
  const expansions = Object.entries(SEARCH_SYNONYMS).filter(([key, words]) => normalized.includes(normalizeSearchText(key)) || words.some(word => normalized.includes(normalizeSearchText(word)))).flatMap(([, words]) => words);
  return normalizeSearchText([query, ...expansions].join(" "));
}
function buildHelpSearchIndex(copy: HelpCopy): HelpSearchItem[] {
  const items: HelpSearchItem[] = [];
  copy.quickSteps.forEach(step => {
    items.push({
      id: `quick-${step.label}`,
      title: `快速路径 ${step.label}`,
      category: "Feature Map",
      description: step.text,
      href: step.href,
      keywords: step.text
    });
  });
  copy.sections.forEach(section => {
    items.push({
      id: section.id,
      title: section.title,
      category: section.eyebrow,
      description: section.summary,
      href: `#${section.id}`,
      keywords: [section.title, section.summary, section.why, section.result, section.steps.join(" "), section.tips?.join(" ")].filter(Boolean).join(" ")
    });
    section.modules?.forEach(module => {
      items.push({
        id: `${section.id}-${module.name}`,
        title: module.name,
        category: section.title.replace(/^.*?：/, ""),
        description: module.purpose,
        href: `#${section.id}`,
        keywords: [module.name, module.purpose, module.helps, module.useWhen, section.title, section.summary].join(" ")
      });
    });
  });
  copy.faqs.forEach((faq, index) => {
    items.push({
      id: `faq-${index}`,
      title: faq.question,
      category: "FAQ",
      description: faq.answer,
      href: "#faq",
      keywords: [faq.question, faq.answer].join(" ")
    });
  });
  return items;
}
function scoreHelpSearchItem(item: HelpSearchItem, expandedQuery: string) {
  if (!expandedQuery) return 0;
  const haystack = normalizeSearchText([item.title, item.category, item.description, item.keywords].join(" "));
  const terms = Array.from(new Set(expandedQuery.split(" ").filter(term => term.length > 0)));
  let score = 0;
  terms.forEach(term => {
    if (haystack.includes(term)) score += term.length > 1 ? 2 : 1;
    if (normalizeSearchText(item.title).includes(term)) score += 3;
    if (normalizeSearchText(item.category).includes(term)) score += 1;
  });
  if (haystack.includes(expandedQuery)) score += 8;
  return score;
}
function searchHelpItems(index: HelpSearchItem[], query: string, limit = 6) {
  const expanded = expandSearchQuery(query);
  return index.map(item => ({
    item,
    score: scoreHelpSearchItem(item, expanded)
  })).filter(({
    score
  }) => score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(({
    item
  }) => item);
}
function buildAssistantAnswer(query: string, results: HelpSearchItem[]): HelpAssistantAnswer {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      title: "先告诉我你现在卡在哪里",
      body: "你不需要知道功能名。可以直接问“客户邮件到底说明什么”“这单为什么危险”“我要找谁推进”，我会把相关模块、解释和入口串成一条路径。",
      steps: [],
      source: "local"
    };
  }
  if (results.length === 0) {
    return {
      title: "我会先帮你判断问题类型",
      body: "这个问题需要 AI 综合判断。点击下方按钮后，我会基于帮助中心内容给出该去哪里看、为什么看、下一步怎么做。",
      steps: [],
      source: "local"
    };
  }
  const [primary, secondary, tertiary] = results;
  const path = [primary, secondary, tertiary].filter(Boolean);
  const nextStep = secondary ? `然后再看「${secondary.title}」，确认下一步动作。` : "看完后按页面里的下一步入口继续处理。";
  return {
    title: `建议先看「${primary.title}」`,
    body: `${primary.description}${nextStep}`,
    steps: path.map((item, index) => ({
      id: `local-${index}-${item.id}`,
      title: index === 0 ? `先看：${item.title}` : `再看：${item.title}`,
      detail: item.description,
      href: item.href
    })),
    source: "local"
  };
}
export default function HelpPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const copy = getCopy(locale);
  const [searchQuery, setSearchQuery] = useState("");
  const [llmAnswer, setLlmAnswer] = useState<HelpAssistantAnswer | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const searchIndex = useMemo(() => buildHelpSearchIndex(copy), [copy]);
  const searchResults = useMemo(() => searchHelpItems(searchIndex, searchQuery), [searchIndex, searchQuery]);
  const localAssistantAnswer = useMemo(() => buildAssistantAnswer(searchQuery, searchResults), [searchQuery, searchResults]);
  const assistantAnswer = llmAnswer ?? localAssistantAnswer;
  const askLLM = useCallback(async (queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;
    const candidates = searchHelpItems(searchIndex, query, 8);
    const candidatePayload = (candidates.length > 0 ? candidates : searchIndex.slice(0, 8)).map(({
      title,
      category,
      description,
      href
    }) => ({
      title,
      category,
      description,
      href
    }));
    setLlmLoading(true);
    setLlmError(null);
    setLlmAnswer(null);
    try {
      const response = await fetch("/api/help/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          candidates: candidatePayload
        })
      });
      const payload = (await response.json()) as {
        answerTitle?: string;
        answerBody?: string;
        steps?: Array<{
          title: string;
          detail: string;
          href: string;
        }>;
        model?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "AI 助手暂时不可用。");
      const steps = (payload.steps ?? []).map((item, index) => ({
        id: `llm-step-${index}-${item.href}`,
        title: item.title,
        detail: item.detail,
        href: item.href
      }));
      setLlmAnswer({
        title: payload.answerTitle ?? localAssistantAnswer.title,
        body: payload.answerBody ?? localAssistantAnswer.body,
        steps,
        model: payload.model,
        source: "llm"
      });
    } catch (error) {
      setLlmError(error instanceof Error ? error.message : "AI 助手暂时不可用。");
      setLlmAnswer(null);
    } finally {
      setLlmLoading(false);
    }
  }, [localAssistantAnswer.body, localAssistantAnswer.title, searchIndex, searchQuery]);
  const suggestions = SEARCH_SUGGESTIONS[locale];
  return <div className="page-shell">
      <div className="page-hero">
        <div className="page-hero-row">
          <div>
            <div className="page-kicker">{copy.hero.kicker}</div>
            <h1 className="page-title">{copy.hero.title}</h1>
            <p className="page-subtitle">{copy.hero.subtitle}</p>
          </div>
          <div className="page-meta">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {copy.hero.meta}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="#sections-title" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
            <BookOpenCheck className="h-4 w-4" />
            {copy.hero.primaryCta}
          </Link>
          <Link href="/guide" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-secondary">
            <BookOpenCheck className="h-4 w-4" />
            {copy.hero.secondaryCta}
          </Link>
        </div>
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-accent/20 bg-card card-elevated" aria-labelledby="help-ai-search-title">
        <div className="border-b border-border-subtle bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="page-kicker">AI Help Assistant</p>
              <h2 id="help-ai-search-title" className="mt-1 text-xl font-semibold tracking-tight text-foreground">{tx("直接问你现在想解决的问题")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-secondary">{tx("AI 会回答“你该去哪里看、为什么、下一步点什么”。不用先懂功能名。")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="rounded-2xl border border-border-subtle bg-background/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{tx("AI 回答")}</p>
                  <h3 className="text-base font-semibold text-foreground">{assistantAnswer.title}</h3>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-secondary">{assistantAnswer.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2.5 py-1 font-semibold ${assistantAnswer.source === "llm" ? "bg-accent text-white" : "bg-background text-muted"}`}>
                  {assistantAnswer.source === "llm" ? "AI 已回答" : "准备回答"}
                </span>
                {assistantAnswer.model && <span className="rounded-full bg-background px-2.5 py-1 font-medium text-secondary">{tx("使用模型：")}{assistantAnswer.model}</span>}
              </div>
              {llmError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-700">{llmError}</p>}
              {assistantAnswer.steps.length > 0 && <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{tx("按这几步做")}</p>
                  <div className="space-y-2">
                    {assistantAnswer.steps.map((item, index) => <Link key={item.id} href={item.href} className="group flex items-center gap-3 rounded-xl border border-border-subtle bg-card p-3 transition-colors hover:border-accent/40">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/8 text-xs font-bold text-accent">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                          <span className="block text-xs leading-relaxed text-secondary">{item.detail}</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                      </Link>)}
                  </div>
                </div>}
            </div>
          </div>

          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input type="search" value={searchQuery} onChange={event => {
              setSearchQuery(event.target.value);
              setLlmAnswer(null);
              setLlmError(null);
            }} onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                void askLLM();
              }
            }} placeholder={tx("例如：我今天该先看什么？客户要求 ROI 怎么办？这单为什么危险？")} className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
            </div>
            <button type="button" onClick={() => {
            void askLLM();
          }} disabled={llmLoading || searchQuery.trim().length === 0} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-muted">
              <Sparkles className="h-4 w-4" />
              {llmLoading ? "AI 正在想..." : "问 AI 助手"}
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => {
              setSearchQuery(suggestion);
              void askLLM(suggestion);
            }} className="rounded-full border border-border-subtle bg-background px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-accent/40 hover:text-accent">
                  {suggestion}
                </button>)}
            </div>

            {searchQuery.trim().length > 0 && searchResults.length > 0 && <div className="mt-4">
                {searchResults.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">
                    {searchResults.map(result => <Link key={result.id} href={result.href} className="group rounded-xl border border-border-subtle bg-background/60 p-4 transition-colors hover:border-accent/40 hover:bg-background">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="rounded-full bg-accent/8 px-2.5 py-1 text-[11px] font-bold text-accent">{result.category}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">{result.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-secondary">{result.description}</p>
                      </Link>)}
                  </div> : <div className="rounded-xl border border-border-subtle bg-background/60 p-4 text-sm leading-relaxed text-secondary">{tx("没找到精确匹配。可以换成更贴近工作场景的问题，例如“客户邮件到底说明什么”“我要找谁推进”“ROI 怎么给客户讲”。")}</div>}
              </div>}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border border-border bg-card p-4 card-elevated">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <BookOpenCheck className="h-4 w-4 text-accent" />
              {copy.tocTitle}
            </div>
            <nav className="space-y-1 text-sm">
              <a href="#what-is-closr" className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-background hover:text-foreground">{copy.productTitle}</a>
              <a href="#quick-path" className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-background hover:text-foreground">{copy.quickTitle}</a>
              {copy.sections.map(section => <a key={section.id} href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-background hover:text-foreground">
                  {section.title.replace(/^.*?：/, "")}
                </a>)}
              <a href="#workflow" className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-background hover:text-foreground">{copy.workflowTitle}</a>
              <a href="#faq" className="block rounded-lg px-3 py-2 text-secondary transition-colors hover:bg-background hover:text-foreground">{copy.faqTitle}</a>
            </nav>
          </div>
        </aside>

        <main className="space-y-8">
          <section id="what-is-closr" className="scroll-mt-6 space-y-5" aria-labelledby="product-title">
            <div>
              <p className="page-kicker">Positioning</p>
              <h2 id="product-title" className="mt-1 text-xl font-semibold tracking-tight text-foreground">{copy.productTitle}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-relaxed text-secondary">{copy.productSubtitle}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {copy.productPositioning.map(({
              title,
              description,
              icon: Icon
            }) => <div key={title} className="rounded-2xl border border-border bg-card p-5 card-elevated">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/8 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-secondary">{description}</p>
                </div>)}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-border bg-card p-5 card-elevated">
                <p className="page-kicker">Operating System</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{copy.enginesTitle}</h3>
                <p className="mt-1 text-sm leading-relaxed text-secondary">{copy.enginesSubtitle}</p>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {copy.engines.map((engine, index) => <div key={engine.name} className="rounded-xl border border-border-subtle bg-background/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">0{index + 1}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{engine.layer}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-foreground">{engine.name}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-secondary">{engine.description}</p>
                    </div>)}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 card-elevated">
                <p className="page-kicker">Roles</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">{copy.rolesTitle}</h3>
                <p className="mt-1 text-sm leading-relaxed text-secondary">{copy.rolesSubtitle}</p>
                <div className="mt-4 space-y-2">
                  {copy.roles.map(role => <div key={role.role} className="rounded-xl border border-border-subtle bg-background/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{role.role}</h4>
                        <span className="text-xs text-accent">{role.question}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-secondary">{role.value}</p>
                    </div>)}
                </div>
              </div>
            </div>
          </section>

          <section id="quick-path" className="scroll-mt-6 space-y-4" aria-labelledby="quick-start-title">
            <div>
              <p className="page-kicker">Feature Map</p>
              <h2 id="quick-start-title" className="mt-1 text-xl font-semibold tracking-tight text-foreground">{copy.quickTitle}</h2>
              <p className="mt-1 text-sm text-secondary">{copy.quickSubtitle}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {copy.quickSteps.map(step => <Link key={step.label} href={step.href} className="group rounded-2xl border border-border bg-card p-4 card-elevated transition-all hover:border-accent/30 hover:shadow-md">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="rounded-full bg-accent/8 px-2.5 py-1 text-xs font-bold text-accent">{step.label}</span>
                    <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-sm leading-relaxed text-secondary">{step.text}</p>
                </Link>)}
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="sections-title">
            <div>
              <p className="page-kicker">Guide</p>
              <h2 id="sections-title" className="mt-1 text-xl font-semibold tracking-tight text-foreground">{copy.sectionsTitle}</h2>
              <p className="mt-1 text-sm text-secondary">{copy.sectionsSubtitle}</p>
            </div>

            <div className="space-y-4">
              {copy.sections.map(section => {
              const Icon = section.icon;
              return <article key={section.id} id={section.id} className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 card-elevated">
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/8 text-accent">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="page-kicker">{section.eyebrow}</p>
                          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{section.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-secondary">{section.summary}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {section.links.map(link => <Link key={link.href + link.label} href={link.href} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent/40 hover:text-accent">
                            {link.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>)}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-xl border border-border-subtle bg-background/60 p-4">
                        <h4 className="text-sm font-semibold text-foreground">{copy.whyLabel}</h4>
                        <p className="mt-2 text-sm leading-relaxed text-secondary">{section.why}</p>
                        {section.tips && section.tips.length > 0 && <div className="mt-4 rounded-xl bg-card p-3">
                            <h5 className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{copy.tipsLabel}</h5>
                            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-secondary">
                              {section.tips.map(tip => <li key={tip}>• {tip}</li>)}
                            </ul>
                          </div>}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">{copy.howLabel}</h4>
                          <ol className="mt-2 space-y-2">
                            {section.steps.map((step, index) => <li key={step} className="flex gap-3 rounded-xl border border-border-subtle bg-background/60 p-3 text-sm leading-relaxed text-secondary">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{index + 1}</span>
                                <span>{step}</span>
                              </li>)}
                          </ol>
                        </div>
                        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                          <h4 className="text-sm font-semibold text-foreground">{copy.resultLabel}</h4>
                          <p className="mt-2 text-sm leading-relaxed text-secondary">{section.result}</p>
                        </div>
                      </div>
                    </div>

                    {section.modules && section.modules.length > 0 && <div className="mt-4 rounded-xl border border-border-subtle bg-background/60 p-4">
                        <h4 className="text-sm font-semibold text-foreground">{copy.modulesLabel}</h4>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {section.modules.map(module => <div key={module.name} className="rounded-xl border border-border-subtle bg-card p-4">
                              <h5 className="text-sm font-semibold text-foreground">{module.name}</h5>
                              <p className="mt-2 text-sm leading-relaxed text-secondary">{module.purpose}</p>
                              <div className="mt-3 space-y-2 text-sm leading-relaxed">
                                <p><span className="font-semibold text-foreground">{tx("帮你解决：")}</span><span className="text-secondary">{module.helps}</span></p>
                                <p><span className="font-semibold text-foreground">{tx("什么时候用：")}</span><span className="text-secondary">{module.useWhen}</span></p>
                              </div>
                            </div>)}
                        </div>
                      </div>}

                    {section.preview && <div className="mt-4 overflow-hidden rounded-xl border border-border-subtle bg-background/60">
                        <div className="border-b border-border-subtle px-4 py-3">
                          <h4 className="text-sm font-semibold text-foreground">{en ? "Workflow walkthrough" : "操作说明"}</h4>
                          <p className="mt-1 text-sm leading-relaxed text-secondary">{section.preview.caption}</p>
                        </div>
                        <div className="grid gap-2 border-t border-border-subtle p-4 text-sm leading-relaxed text-secondary md:grid-cols-2">
                          <p><span className="font-semibold text-foreground">{tx("点这里开始：")}</span>{section.preview.start.replace(/^点这里开始：/, "")}</p>
                          <p><span className="font-semibold text-foreground">{tx("完成后看到：")}</span>{section.preview.done.replace(/^完成后看到什么：/, "")}</p>
                        </div>
                      </div>}

                  </article>;
            })}
            </div>
          </section>

          <section id="workflow" className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 card-elevated">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/8 text-accent">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <p className="page-kicker">Workflow</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{copy.workflowTitle}</h2>
                <p className="mt-1 text-sm text-secondary">{copy.workflowSubtitle}</p>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {copy.workflow.map(item => <div key={item.label} className="flex gap-3 rounded-xl border border-border-subtle bg-background/60 p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{item.label}</span>
                  <p className="text-sm leading-relaxed text-secondary">{item.detail}</p>
                </div>)}
            </div>
          </section>

          <section id="faq" className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 card-elevated" aria-labelledby="faq-title">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-accent">
                <CircleHelp className="h-5 w-5" />
              </div>
              <div>
                <p className="page-kicker">FAQ</p>
                <h2 id="faq-title" className="mt-1 text-xl font-semibold tracking-tight text-foreground">{copy.faqTitle}</h2>
                <p className="mt-1 text-sm text-secondary">{copy.faqSubtitle}</p>
              </div>
            </div>
            <div className="space-y-2">
              {copy.faqs.map(faq => <details key={faq.question} className="group rounded-xl border border-border-subtle bg-background/60 p-3 open:bg-card">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:hidden">
                    <span className="inline-flex w-full items-center justify-between gap-3">
                      {faq.question}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-secondary">{faq.answer}</p>
                </details>)}
            </div>
          </section>
        </main>
      </div>
    </div>;
}
