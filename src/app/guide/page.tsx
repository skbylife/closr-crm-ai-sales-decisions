import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Gauge,
  Mail,
  Network,
  ScanSearch,
  Settings2,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { ClosrLogo } from "@/components/ui/closr-logo";
import { CopyTextBlock } from "@/components/guide/copy-text-block";

export const metadata: Metadata = {
  title: "Closr 新用户体验流程手册",
  description: "从企业系统设置开始，再用 Closr 建立客户判断、识别关键人、生成谋局，并把下一步推进动作落到任务里。",
};

const coveredCapabilities = [
  "系统设置",
  "客户档案",
  "Decode 解读",
  "联系人关系",
  "DISC",
  "CIL",
  "谋局",
  "邮件生成",
  "任务闭环",
  "活动复盘",
];

const systemSetupSample = `企业首次使用 Closr 前，建议先完成这些系统设置：

1. 组织信息
- 公司名称、行业、默认币种、团队使用语言
- 准备哪些已获授权的客户、联系人和商机数据用于初始化

2. 成员与权限
- 管理员：负责组织设置、成员、审计和基础配置
- 销售经理：查看团队客户、管线、任务和报表
- AE / 一线销售：维护客户、联系人、Decode、谋局和任务
- 平台角色：owner / admin / member，决定谁能邀请成员、修改设置和管理组织
- 职级范围：AE 默认看个人，Manager 看团队，VP 看全局组合

3. 销售流程
- 统一商机阶段：发现需求 / 验证需求 / 方案评估 / 采购流程 / 合同确认
- 统一健康度口径：健康 / 需关注 / 高风险
- 统一 forecast 与复盘标准

4. 产品与报价
- 录入主要产品、服务线、报价口径、ROI 常用表达
- 让 Decode、RFP、报价和客户沟通使用一致商业口径

5. 基础数据
- 至少准备 1 个客户、1 个商机、3 个联系人、1 封客户邮件或会议纪要
- 为客户、商机和任务确认负责人 owner
- 如果团队尚未准备已获授权的数据，先完成组织、成员与权限配置；工作区可以保持为空

6. 交接与治理
- 约定客户认领、转移、回收规则，避免重点客户无人负责
- 上线前检查审计入口，确认成员、权限、AI 使用和关键操作可追溯`;

const customerContextSample = `客户：华东智造集团
行业：高端制造 / 工业设备
当前目标：推动 Q3 数字化采购项目进入正式评估
当前阶段：客户认可方向，但还没有形成内部评估口径
本次体验目标：用 Closr 判断谁是关键推进人、客户真正担心什么、下一步应该怎么推进
已知联系人：
- 李明：信息化负责人，项目推动者，关注落地周期和 ERP 衔接
- 王总：集团副总，预算和最终决策相关
- 赵经理：采购负责人，关注供应商风险、价格和交付稳定性
当前最大风险：预算收益不清晰、ERP 对接风险、跨部门评估周期不确定`;

const sampleEmail = `From: 李明 <liming@east-mfg.example.com>
Title: 信息化负责人 / 项目推动者
Company: 华东智造集团
To: 张经理 <zhang.manager@vendor.example.com>
Cc: 王总 <wangvp@east-mfg.example.com>; 赵经理 <zhao.procurement@east-mfg.example.com>; 财务评估组 <finance-eval@east-mfg.example.com>
Date: 2026-05-18 09:32
Subject: 华东智造集团数字化采购项目的下一步沟通

李总您好，

上次沟通后，我们内部又讨论了一下目前采购流程数字化的推进方式。整体方向大家是认可的，不过王总这边对预算投入、系统落地周期，以及和现有 ERP 的衔接还有一些顾虑。

如果方便的话，希望你们能先发一版更具体的实施路径和风险控制方案。我们这边会再拉采购赵经理和财务同事一起评估。时间上不一定能很快定下来，但如果方案比较清楚，6 月底前应该可以安排一次内部讨论。

谢谢。`;

const contactSample = `Decode 识别出的联系人：

李明
- 公司：华东智造集团
- 角色：信息化负责人
- 关系判断：项目推动者 / 内部协调人
- 当前关注：落地周期、ERP 衔接、跨部门评估口径

王总
- 公司：华东智造集团
- 角色：集团副总
- 关系判断：预算和最终决策相关
- 当前关注：投入产出、风险控制、是否值得进入正式评估

赵经理
- 公司：华东智造集团
- 角色：采购负责人
- 关系判断：采购评估参与者
- 当前关注：供应商稳定性、价格、交付风险`;

const discSample = `联系人：李明，华东智造集团信息化负责人

DISC 判断：
- 更偏谨慎、逻辑型沟通
- 不适合只讲愿景或产品亮点
- 更需要阶段计划、风险控制、技术衔接说明

建议沟通方式：
- 邮件先给结论，再列 3 个评估模块
- 每个模块都说明需要客户确认什么
- 会议中避免过度销售，重点帮他降低内部协调成本`;

const cilSample = `华东智造集团 CIL 初步判断：

李明：高影响 / 中高支持
- 能组织信息化、采购和财务进入评估
- 不是最终拍板人，但能决定方案是否进入正式讨论

王总：高影响 / 支持度未知
- 影响预算和最终方向
- 当前只通过李明间接出现，需要尽快获得其评估口径

赵经理：中影响 / 中性
- 会影响采购和供应商风险评估
- 需要提前准备交付稳定性和价格解释`;

const strategicPlaySample = `华东智造集团谋局摘要：

当前局势：
客户认可采购流程数字化方向，但还没有形成跨部门评估口径。李明愿意推动，王总关注预算和风险，采购赵经理会参与供应商评估。

突破路径：
1. 先支持李明完成内部评估材料，而不是急着报价
2. 用实施路径降低落地周期不确定性
3. 用 ERP 衔接说明降低技术风险
4. 用预算收益拆解回应王总的投入产出问题
5. 在 6 月底前推动一次信息化、采购、财务共同参加的评估会

关键风险：
- 王总没有直接表达支持，预算风险仍未消除
- 赵经理可能会把评估拉回价格和供应商风险
- 如果材料不够具体，6 月底内部讨论可能被推迟`;

const replySample = `李总您好，

收到，非常理解集团对预算投入、落地周期以及 ERP 衔接的关注。我们下一步会先整理一版更具体的实施路径，包括阶段拆分、关键风险点、与现有系统的对接方式，以及每个阶段需要贵方配合确认的事项。

为了让您和王总、赵经理以及财务同事后续评估更高效，我建议我们把材料分成三部分：
1. 项目推进路径与时间安排
2. 预算投入与预期收益拆解
3. 系统衔接和风险控制方案

我会先发一版初稿给您，您看是否需要我们再补充贵司内部评估更关注的部分。若方便，也可以安排一次 30 分钟沟通，我们先把评估口径对齐。

谢谢。`;

const strategyTaskSample = `谋局目标：让客户在 6 月底前安排一次跨部门评估会

建议任务：
1. 准备实施路径材料：阶段拆分、里程碑、客户配合事项
2. 准备预算收益说明：成本结构、预期收益、可量化指标
3. 准备 ERP 对接说明：接口方式、风险控制、技术评估清单
4. 约李明进行 30 分钟预沟通：先确认评估口径，再邀请采购赵经理和财务加入
5. 准备给王总看的 1 页管理层摘要：为什么值得进入正式评估、最大风险如何控制`;

const accountMemorySample = `华东智造集团客户档案备注：

当前机会：
采购流程数字化方向已被认可，李明愿意继续推动，6 月底前有机会安排跨部门评估会。

当前风险：
王总仍关注预算投入和风险控制；赵经理可能从采购角度压低供应商风险和价格；ERP 衔接必须讲清楚。

下一步：
先发实施路径、预算收益、ERP 衔接三部分材料；发出前让李明确认评估口径是否适合内部转发。`;

const dashboardReviewSample = `华东智造集团复盘状态：

客户状态：已进入正式评估前准备
关键联系人：李明 / 王总 / 赵经理
最新判断：客户认可方向，但预算收益和 ERP 衔接仍是核心风险
下一步任务：
- 2 天内发实施路径初稿
- 3 天内补预算收益和 ERP 对接说明
- 本周内约李明预沟通
下次更新 Closr 的触发点：客户回复邮件、评估会纪要、王总或赵经理的新反馈`;

const quickPath = [
  {
    step: "setup",
    title: "完成企业系统设置",
    time: "8 分钟",
    goal: "先让 Closr 有正确的组织边界、权限、销售流程和商业口径，再开始录入客户信号。",
    actions: [
      "进入「设置」或管理员配置区，先确认组织名称、默认语言、币种和基础偏好。",
      "进入「组织」邀请团队成员，区分 owner / admin / member 平台角色。",
      "为成员设置 AE / Manager / VP 职级，决定个人、团队或全局数据范围。",
      "按区域、行业或客户组创建团队分组，并把成员分配到对应团队。",
      "统一商机阶段、健康度、forecast、赢输复盘和任务优先级口径。",
      "录入产品、服务线、报价口径和常用 ROI 表达。",
      "确认客户 owner、商机 owner 和任务负责人规则；人员变化时使用转移/回收。",
      "确认数据来源与使用权限，再导入第一批客户、联系人和商机。",
    ],
    result: "企业级 onboarding 的地基先搭好：团队看到同一套权限、流程、产品口径和数据结构，后面的客户判断才不会各说各话。",
    capability: {
      title: "系统设置",
      label: "建立企业使用 Closr 的组织和流程基础",
      useWhen: "企业第一次使用、团队正式启用、或从其他系统迁移已获授权的业务数据时。",
      input: "组织信息、成员角色、职级、团队分组、权限边界、销售阶段、产品/报价、基础客户数据。",
      output: "一套团队可共同使用的 Closr 工作区配置。",
      next: "创建或导入第一个客户，再开始 Decode 和客户判断闭环。",
    },
    sample: {
      title: "企业系统设置清单",
      label: "管理员可照此检查",
      text: systemSetupSample,
    },
    icon: Settings2,
  },
  {
    step: "account",
    title: "选择一个客户",
    time: "2 分钟",
    goal: "选一个真实正在推进的客户，或者用样本客户开始。",
    actions: ["进入工作台后，创建或选择一个公司。", "只填写公司名称、行业、当前目标和阶段。", "先不要补全所有字段，第一次的重点是形成判断。"],
    result: "你有了华东智造集团这个样例客户，后续邮件、联系人、谋局和任务都会围绕它展开。",
    capability: {
      title: "客户档案",
      label: "建立客户判断的承载对象",
      useWhen: "你准备分析一个真实客户，或者想用样本客户跑完第一遍时。",
      input: "公司名称、行业、当前目标、推进阶段。",
      output: "一个可以承载 Decode、联系人、谋局和任务的客户档案。",
      next: "进入 Decode，把第一段客户材料归档到这个客户。",
    },
    sample: {
      title: "客户背景样本",
      label: "可直接复制",
      text: customerContextSample,
    },
    icon: Building2,
  },
  {
    step: "decode",
    title: "输入第一段客户信息",
    time: "3 分钟",
    goal: "把客户邮件、聊天记录或会议纪要交给 Decode。",
    actions: ["打开「解读」。", "粘贴最近一封客户邮件，或使用本页提供的样本。", "粘贴邮件时保留 From、To、Cc、Subject、时间、发件人 title 和公司信息。", "选择刚才的公司，让这次分析归档到正确客户。"],
    result: "Closr 开始从李明这封邮件里识别客户意图、预算风险、ERP 风险、联系人和下一步。",
    capability: {
      title: "Decode 解读",
      label: "从原始沟通提炼客户情报",
      useWhen: "收到客户邮件、会议纪要、聊天记录，想快速判断真实意图时。",
      input: "客户原话、From / To / Cc、Subject、时间、发件人角色、公司背景、当前推进目标。",
      output: "意图判断、风险信号、机会点、联系人线索、下一步建议。",
      next: "确认系统识别出的联系人和关系线索。",
    },
    sample: {
      title: "客户邮件样本",
      label: "可直接粘贴到 Decode，包含发件人 / 收件人 / 抄送",
      text: sampleEmail,
    },
    icon: ScanSearch,
  },
  {
    step: "contacts",
    title: "识别关键联系人",
    time: "2 分钟",
    goal: "让系统先从沟通内容里发现人，不要一开始手动录一堆联系人。",
    actions: ["查看 Decode 识别出的联系人。", "确认他们是否属于当前公司。", "补充角色：推动者、决策者、评估者、采购、财务或潜在阻力方。"],
    result: "华东智造集团档案里出现李明、王总、赵经理，后续 DISC、CIL 和谋局都有了关系基础。",
    capability: {
      title: "联系人关系",
      label: "把客户组织里的人整理成判断线索",
      useWhen: "邮件或会议里出现多人，你需要分清谁参与、谁推进、谁可能阻碍时。",
      input: "Decode 识别出的人名、角色、部门、沟通语境。",
      output: "关键联系人列表和初步角色判断。",
      next: "用 DISC 看沟通方式，用 CIL 判断影响力。",
    },
    sample: {
      title: "联系人识别样本",
      label: "来自同一封客户邮件",
      text: contactSample,
    },
    icon: UserCheck,
  },
  {
    step: "disc",
    title: "理解沟通风格：DISC",
    time: "2 分钟",
    goal: "判断联系人更适合什么沟通方式。",
    actions: ["进入李明的联系人详情或相关分析区域。", "查看 DISC 判断：他更关注结果、逻辑、关系，还是稳定性。", "把下一封邮件的语气和信息密度调整到适合李明。"],
    result: "你知道给李明的回复不能泛泛介绍产品，而要给清楚的实施路径和风险控制说明。",
    capability: {
      title: "DISC",
      label: "理解人的沟通风格",
      useWhen: "你需要写邮件、约会、推进会议，想知道该怎么和这个人沟通时。",
      input: "联系人信息、历史沟通内容、对方关注点。",
      output: "沟通风格、信息偏好、适合的表达方式和需要避免的说法。",
      next: "根据 DISC 调整邮件语气、会议节奏和材料结构。",
    },
    sample: {
      title: "DISC 判断样本",
      label: "联系人：李明",
      text: discSample,
    },
    icon: BrainCircuit,
  },
  {
    step: "cil",
    title: "判断影响力：CIL",
    time: "2 分钟",
    goal: "区分谁只是参与，谁真的能影响推进。",
    actions: ["查看李明、王总、赵经理的 CIL 影响力判断。", "确认他们在项目中的影响范围、支持度和风险。", "标记下一步应该支持李明、争取王总、提前回应赵经理的采购顾虑。"],
    result: "你不再只看职位，而是能判断华东智造集团里谁影响预算、技术评估和采购评估。",
    capability: {
      title: "CIL",
      label: "判断联系人影响力",
      useWhen: "客户组织里有多人参与，你不确定谁真正影响结果时。",
      input: "联系人角色、互动记录、项目参与方式、支持或阻力信号。",
      output: "影响力等级、支持度、风险点、关系优先级。",
      next: "决定下一步要争取谁、补强谁、让谁帮你进入更关键的讨论。",
    },
    sample: {
      title: "CIL 判断样本",
      label: "同一客户的三位联系人",
      text: cilSample,
    },
    icon: Gauge,
  },
  {
    step: "play",
    title: "生成客户谋局",
    time: "3 分钟",
    goal: "把客户信息、联系人判断和当前目标合成一份推进策略。",
    actions: ["进入「谋局」或客户策略区域。", "选择华东智造集团和当前目标。", "让 Closr 结合 Decode、DISC、CIL 生成局势判断、关键风险、突破路径和下一步建议。"],
    result: "你得到一份围绕华东智造集团的推进策略，而不是一段通用建议。",
    capability: {
      title: "谋局",
      label: "生成客户推进策略",
      useWhen: "你已经有客户信息和联系人判断，需要形成可执行策略时。",
      input: "客户目标、当前阶段、Decode 结果、DISC、CIL、关键约束。",
      output: "局势判断、关键风险、突破路径、沟通策略、下一步任务。",
      next: "把策略拆成任务，并用于下一封邮件或下一次会议。",
    },
    sample: {
      title: "谋局摘要样本",
      label: "同一客户的策略判断",
      text: strategicPlaySample,
    },
    icon: Target,
  },
  {
    step: "memory",
    title: "沉淀到客户档案",
    time: "1 分钟",
    goal: "让判断变成可复用的客户记忆。",
    actions: ["回到华东智造集团详情页。", "检查 Decode、联系人、DISC、CIL 和谋局是否都关联到这个客户。", "补充一条简短备注：当前最大机会、最大风险、下一步动作。"],
    result: "以后团队打开华东智造集团，就能快速理解来龙去脉，而不是重新问一遍。",
    capability: {
      title: "客户档案",
      label: "沉淀可复用的客户记忆",
      useWhen: "你希望团队任何人打开客户，都能接上上下文时。",
      input: "公司信息、联系人、解读记录、谋局结果、任务和备注。",
      output: "一个持续更新的客户判断面板。",
      next: "每次客户互动后更新档案，不让判断散落在邮件和聊天里。",
    },
    sample: {
      title: "客户档案备注样本",
      label: "沉淀同一客户判断",
      text: accountMemorySample,
    },
    icon: Network,
  },
  {
    step: "email",
    title: "生成回复邮件",
    time: "2 分钟",
    goal: "把客户判断转成可以发出的下一步沟通。",
    actions: ["根据李明的邮件、Decode 和谋局结果生成回复建议。", "对照华东智造集团最关心的问题，检查是否回应了预算、周期、ERP 衔接和下一步。", "按李明的 DISC 调整语气和信息密度，再复制到邮件或聊天工具。"],
    result: "你得到一封能直接改写发给李明的回复，而不是停留在分析结果里。",
    capability: {
      title: "邮件生成",
      label: "把判断转成高质量客户沟通",
      useWhen: "客户要求补材料、确认下一步、推进会议，或你需要快速写一封专业回复时。",
      input: "客户原话、Decode 判断、DISC 沟通风格、谋局建议。",
      output: "结构清晰、回应顾虑、有明确下一步的邮件草稿。",
      next: "发送前结合真实业务补充产品、时间、材料承诺和会议安排。",
    },
    sample: {
      title: "回复邮件样本",
      label: "可直接改写发送",
      text: replySample,
    },
    icon: Mail,
  },
  {
    step: "tasks",
    title: "创建任务闭环",
    time: "2 分钟",
    goal: "把判断落到具体推进动作里。",
    actions: ["把华东智造集团的谋局建议拆成 3-5 个任务。", "为每个任务写清负责人、截止时间和输出物。", "下一次李明回复或评估会结束后，再用 Decode 更新判断。"],
    result: "你完成了第一个 Closr 闭环：同一客户的信息输入、关系判断、策略生成、邮件回复和任务推进。",
    capability: {
      title: "任务闭环",
      label: "把判断变成推进动作",
      useWhen: "你已经知道应该做什么，需要确保动作不会丢时。",
      input: "谋局建议、客户下一步、内部协作事项。",
      output: "负责人、截止时间、输出物明确的任务。",
      next: "完成任务后继续 Decode 新信息，更新策略判断。",
    },
    sample: {
      title: "谋局与任务样本",
      label: "可直接拆成任务",
      text: strategyTaskSample,
    },
    icon: CheckCircle2,
  },
  {
    step: "review",
    title: "回到仪表盘复盘",
    time: "2 分钟",
    goal: "确认客户、联系人、解读、谋局、邮件和任务已经连成一个可追踪的记录。",
    actions: ["回到工作台或华东智造集团详情页。", "检查最近活动、待办任务、客户风险和关键判断是否已经更新。", "把这次跟进作为下次复盘的起点。"],
    result: "你能从总览里看到华东智造集团的当前状态、下一步动作和需要继续验证的风险。",
    capability: {
      title: "活动复盘",
      label: "用仪表盘追踪客户状态和执行进度",
      useWhen: "你完成一次客户沟通后，需要确认判断是否沉淀、任务是否推进、风险是否变化时。",
      input: "客户档案、Decode 记录、任务、邮件草稿、最近活动。",
      output: "客户状态总览、待办优先级、风险提醒和后续复盘线索。",
      next: "下一次有新邮件或会议纪要时，再回到 Decode 更新判断。",
    },
    sample: {
      title: "仪表盘复盘样本",
      label: "同一客户的最终状态",
      text: dashboardReviewSample,
    },
    icon: BarChart3,
  },
];

const valueOutcomes = [
  "你能先完成组织、成员、权限、销售流程、产品报价和基础数据设置，让团队在同一套口径下使用 Closr。",
  "你能从一段客户原话里看出真实意图、隐藏风险和下一步要求，而不是只得到一段摘要。",
  "你能分清谁只是参与讨论、谁影响预算、谁影响采购、谁真正推动项目往前走。",
  "你能根据 DISC 调整沟通方式，让邮件和会议更适合关键联系人，而不是所有客户都用同一套话术。",
  "你能用 CIL 把分散在邮件、会议和联系人里的信息编译成同一层客户判断。",
  "你能生成一份围绕同一客户的谋局，明确当前局势、关键风险、突破路径和下一步动作。",
  "你能把谋局拆成任务，知道谁负责、什么时候完成、需要交付什么材料。",
  "你能让团队打开客户页时看到同一套上下文，而不是重新翻邮件、聊天记录和会议纪要。",
  "你能判断一个客户下一步应该先推进谁、怎么说、风险在哪里、资源该押在哪里。",
];

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-950">
      <section className="border-b border-slate-200 bg-[#07090c] text-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <ClosrLogo size="lg" variant="dark" />
          <div className="flex items-center gap-3">
            <Link href="/help" className="text-sm font-medium text-white/72 transition-colors hover:text-white">
              帮助中心
            </Link>
            <Link href="/login" className="text-sm font-medium text-white/72 transition-colors hover:text-white">
              登录
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-[#df2531] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-red-950/30 transition-colors hover:bg-[#c41e2a]"
            >
              联系销售
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-20 lg:pt-14">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-red-300">Closr 新用户体验流程手册</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              先完成系统设置，再建立可信客户判断
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 sm:text-lg">
              Closr 不是让你多填一个 CRM。企业第一次使用时，先完成组织、成员、权限、销售流程和产品口径设置；然后围绕一个真实客户跑通一条线：从客户原话里识别风险和关键人，形成判断，生成谋局，再把下一步动作交给团队执行。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100"
              >
                联系销售开通
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/decode"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/16 px-5 py-3 text-sm font-semibold text-white/90 transition-colors hover:border-white/32 hover:text-white"
              >
                已登录，直接去解读
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4 text-red-300" aria-hidden="true" />
              第一次体验只追求一个结果
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">先形成判断，再补齐资料</p>
                <p className="mt-2 text-sm leading-6 text-white/64">
                  不要从手动补全字段开始。先把真实沟通放进 Decode，让系统从客户原话里识别人、事、风险和机会。
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white">先跑通闭环，再补细节</p>
                <p className="mt-2 text-sm leading-6 text-white/64">
                  系统设置完成后，只需要跑通一条线：客户信息输入、关系判断、谋局生成、任务推进和后续复盘。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-1">
                  {["系统设置", "Decode", "谋局"].map((item) => (
                  <div key={item} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs font-semibold text-red-200">{item}</p>
                    <p className="mt-2 text-[11px] leading-5 text-white/52">第一天必须体验</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-red-700">企业第一次注册后的体验路径</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">先完成系统设置，再用同一个客户跑完判断闭环</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            这不是功能清单，而是一条企业上手路径：先设置组织、权限、销售流程、产品报价和基础数据，再建立客户对象，用 Decode 提取情报，补全联系人、DISC、CIL 和谋局，最后生成沟通内容、创建任务并回到仪表盘复盘。
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {coveredCapabilities.map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {quickPath.map((item, index) => {
            const Icon = item.icon;
            const displayStep = String(index + 1).padStart(2, "0");
            return (
              <article
                key={item.step}
                className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.04)] lg:grid-cols-[190px_1fr]"
              >
                <div className="flex items-start justify-between gap-4 lg:block">
                  <div>
                    <span className="text-xs font-bold text-red-700">{displayStep}</span>
                    <h3 className="mt-2 text-lg font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-xs font-medium text-slate-500">{item.time}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  </div>
                </div>

                <div>
                  <p className="text-sm leading-6 text-slate-600">{item.goal}</p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-500">照着做</p>
                      <ul className="mt-3 space-y-2">
                        {item.actions.map((action) => (
                          <li key={action} className="flex gap-2 text-sm leading-6 text-slate-700">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-red-100 bg-red-50/70 p-4">
                      <p className="text-xs font-semibold text-red-700">完成后你应该得到</p>
                      <p className="mt-3 text-sm leading-6 text-slate-700">{item.result}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950">
                        <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-red-700">本步总结的 Closr 功能</p>
                        <h4 className="mt-1 text-base font-semibold text-slate-950">{item.capability.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.capability.label}</p>
                      </div>
                    </div>

                    <dl className="mt-4 grid gap-3 text-sm leading-6 md:grid-cols-2">
                      <div>
                        <dt className="font-semibold text-slate-950">什么时候用</dt>
                        <dd className="mt-1 text-slate-600">{item.capability.useWhen}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-950">输入什么</dt>
                        <dd className="mt-1 text-slate-600">{item.capability.input}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-950">产出什么</dt>
                        <dd className="mt-1 text-slate-600">{item.capability.output}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-950">下一步</dt>
                        <dd className="mt-1 text-slate-600">{item.capability.next}</dd>
                      </div>
                    </dl>
                  </div>

                  {item.sample ? (
                    <div className="mt-4">
                      <CopyTextBlock title={item.sample.title} label={item.sample.label} text={item.sample.text} />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-sm font-semibold text-red-300">完成标准</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">第一次体验结束前，你应该感受到 Closr 的价值</h2>
              <p className="mt-4 text-base leading-7 text-white/64">
                不用记住每个按钮在哪里。真正的完成标准是：你已经能用 Closr 把零散客户信号变成可信判断，并推动下一步行动。
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {valueOutcomes.map((item) => (
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
