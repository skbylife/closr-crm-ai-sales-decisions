# Closr CRM — AI-Powered Sales Decisions

<p align="center">
  <strong>Open-source, self-hosted CRM for evidence-based B2B sales judgment.</strong>
</p>

<p align="center">
  <a href="https://www.closr.ing"><img src="https://img.shields.io/badge/Official%20Website-closr.ing-0f172a?style=for-the-badge" alt="Closr official website"></a>
  <a href="#english"><img src="https://img.shields.io/badge/Language-English-0f172a?style=for-the-badge" alt="Read in English"></a>
  <a href="#中文"><img src="https://img.shields.io/badge/语言-中文-0f172a?style=for-the-badge" alt="阅读中文版"></a>
</p>

<p align="center">
  <a href="https://www.closr.ing">Website</a> ·
  <a href="#architecture-en">Architecture</a> ·
  <a href="#technical-baseline-en">Technical baseline</a> ·
  <a href="#open-source-status-en">Open-source status</a>
</p>

> **Pre-release repository.** Available here today: the project introduction and design discussion. The first licensed source release, deployment guide, security guidance, and contribution process are not published yet. This repository contains no source code, Docker images, CI configuration, release artifacts, or production-support commitment.

---

<a id="english"></a>

## English

### Read the customer. See the deal. Decide the next move.

Closr is an open-source, self-hosted **CRM for evidence-based B2B sales judgment**. It combines the CRM foundation—accounts, contacts, opportunities, activities, and follow-ups—with a reviewable sales-judgment layer: customer signals, supporting and conflicting evidence, missing proof, accountable next moves, and outcome feedback.

Traditional CRM tells a team what was recorded. Closr is designed to help a team review **what changed, what is missing, who matters, what could block progress, and what should be validated next**.

**Learn more about the product at [closr.ing](https://www.closr.ing).**

### Why Closr

Complex B2B deals do not live in a single pipeline field. The signals are distributed across CRM records, emails, meeting notes, calls, chat messages, stakeholder changes, procurement questions, and previous account history.

A team can see activity without seeing the situation:

- a customer still replies, but the decision owner is absent;
- a deal stage is unchanged, but new IT and procurement stakeholders have entered;
- a request for references may be interest—or a missing proof point before a comparison;
- a quiet account may be stalled—or an internal champion may still be working through approval.

Closr gives the team one place to examine these signals, distinguish evidence from inference, and turn a shared account read into an explicit next action.

### What makes Closr different

#### 1. BABEL Decode — interpret communication, not just store it

**BABEL Decode** turns emails, meeting notes, calls, chats, and approved external context into structured communication observations: intent signals, risk signals, uncertainty, stakeholder context, and recommended questions or actions.

The goal is not to treat AI as an oracle. A decode is a **reviewable hypothesis**: the original source, counter-signals, missing information, and human correction remain part of the account record.

#### 2. Account intelligence and memory — preserve the context behind the deal

Closr connects contacts, interactions, account history, relationship changes, past wins and losses, and current evidence into a continuously updated account view.

Instead of asking a salesperson to reconstruct the whole situation from scattered notes before every meeting, the team can review the current account context together:

- who is supporting, evaluating, delaying, or controlling budget;
- which signals changed since the last review;
- which assumptions remain unproven;
- which historical patterns may matter now.

#### 3. Judgment Layer — make the sales read explicit and challengeable

Closr maintains an account and deal judgment across health, momentum, contradictions, uncertainty, risks, evidence gaps, and next moves.

A useful sales decision should be challengeable. Closr is designed to keep supporting evidence, counter-evidence, missing facts, confidence, revisions, and ownership visible rather than hiding the reasoning behind a single score.

#### A reviewable decision record

| Every proposed move should show | Example |
|---|---|
| Source evidence | Email, meeting, or CRM record with timestamp |
| Interpretation | “The budget owner has not entered the process.” |
| Counter-evidence / missing proof | “No confirmed budget owner; validate this in the next meeting.” |
| Confidence and review | Confidence plus a human approval or correction |
| Accountable action and outcome | Owner, next action, and the later result |

#### 4. Strategic Plays — turn judgment into a plan to move the deal

A **Strategic Play** is not a generic task list. It connects the account situation to an executable path:

```text
Customer signals
→ account judgment
→ stakeholder route + customer pain + solution fit + required proof
→ decision criteria + timing + escalation
→ accountable next move
```

For a stalled deal, the next move may be to test whether ROI proof is missing. For a new procurement question, it may be to switch from product demonstration to implementation evidence and internal consensus material. Closr helps teams make that choice explicit.

#### 5. Calibration — learn from outcomes and human corrections

Sales teams should be able to revisit why a judgment changed and whether a proposed action helped. Closr is designed to retain outcome feedback and human corrections so future account reviews can become more grounded over time.

### The Closr operating loop

```text
CRM + email + meetings + calls + chat + approved account context
                             ↓
                  normalized customer signals
                             ↓
     BABEL Decode + account memory + evidence and counter-evidence
                             ↓
                 reviewable account/deal judgment
                             ↓
                  Strategic Play and next action
                             ↓
                  outcome, correction, calibration
```

### Core CRM capabilities

Closr is intended to stand on its own as a useful everyday CRM for small and growing teams:

| Area | Intended workflow |
|---|---|
| Accounts and contacts | Organize companies, people, roles, relationships, and account context. |
| Opportunities and pipeline | Track deal stage, commercial scope, dates, owners, priority, and account health. |
| Activities and follow-up | Keep meetings, notes, tasks, messages, and next actions connected to the account. |
| Customer communication | Bring customer interactions into the account history and review conversation. |
| Sales review | Examine evidence, risks, stakeholder coverage, assumptions, and next moves together. |

<a id="architecture-en"></a>

### Architecture

Closr is being prepared as a web application with an application layer, a multi-tenant data layer, and an AI-assisted decision layer.

```text
┌──────────────────────────────────────────────────────────────────┐
│  Web CRM workspace                                                 │
│  Accounts · Contacts · Opportunities · Pipeline · Review · Plays   │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│  Sales decision services                                           │
│  BABEL Decode · Judgment Layer · Evidence Trace · Strategic Plays  │
│  Outcome feedback · Calibration                                   │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│  Customer data and deployment boundary                             │
│  PostgreSQL/Supabase · Auth · Row-level access · Storage · Audit   │
│  Self-hosted infrastructure and customer-approved AI providers     │
└──────────────────────────────────────────────────────────────────┘
```

<a id="technical-baseline-en"></a>

### Planned release baseline — not yet publicly auditable

This repository currently contains no source, deployment artifacts, tests, CI configuration, license, or security documentation. The following are **release targets**, not public verification evidence or production commitments. Exact installation instructions, supported versions, and operational guarantees will be published with the first licensed source release.

| Layer | Baseline |
|---|---|
| Application | Next.js App Router and React web application |
| Language | TypeScript |
| UI | Tailwind CSS and shared React components |
| Data and identity | Supabase/PostgreSQL, Auth, storage, and organization-scoped access controls |
| Client state | Zustand with React context where appropriate |
| AI integration | OpenAI-compatible model providers through server-side routes; AI output is designed for review rather than autonomous authority |
| Self-hosting | Docker-based deployment profile with application health checks; the public deployment guide will define supported infrastructure and configuration |
| Quality gates | Type checking, targeted tests, build checks, and environment/deployment validation are part of the release baseline |

### Data, AI, and decision boundaries

Closr handles sales information that can be commercially sensitive. The project therefore follows these design principles:

- **Source before summary:** account judgment should point back to source records and business data, not only an AI-generated cache.
- **Evidence and counter-evidence:** a useful account read includes supporting signals, conflicting signals, and missing information.
- **Human authority:** AI-assisted interpretations and recommendations are review inputs; people retain responsibility for customer communication and business decisions.
- **Organization boundary:** customer data, access, retention, and approved AI-provider choices belong to the deploying organization.
- **Self-hosting:** the public project is intended to let teams run Closr in their own environment and control their own data boundary.

### Who is Closr for?

Closr is being built for:

- founders and small B2B sales teams that want a self-hosted CRM without losing the context behind customer conversations;
- account executives and sales leaders working complex, multi-stakeholder opportunities;
- RevOps and technical teams that want a CRM and decision workflow they can inspect, operate, and improve in the open.

### FAQ

**Is Closr a CRM or a sales-intelligence tool?**<br>
Both. Closr includes a practical CRM foundation and adds a customer-signal, account-judgment, and Strategic Play workflow for B2B sales decisions.

**Does Closr replace human sales judgment?**<br>
No. Closr is designed to expose evidence, uncertainty, and suggested next moves for review. The team remains responsible for decisions and customer communication.

**Will Closr be self-hosted?**<br>
Yes—the project is being prepared as a self-hosted open-source CRM. The supported deployment guide and exact configuration will be released with the first public source version.

**Is the source code available now?**<br>
Not yet. This README is the public project introduction while the first source release, licensing, security review, and contributor materials are prepared.

<a id="open-source-status-en"></a>

### Open-source status

**Watch this repository for the first licensed source release.** Until then, this is a pre-release space for project information and design discussion; code contributions will open with the licensed source release.

#### What the first public release will include

- complete Closr source code and an explicit open-source license;
- reproducible self-hosting and environment documentation;
- documented supported AI-provider and data-boundary configuration;
- security reporting guidance, upgrade/backup guidance, and contribution rules.

Follow the product at [closr.ing](https://www.closr.ing).

---

<a id="中文"></a>

## 中文

### 读懂客户，看清局势，决定下一步。

Closr 是一个正在准备发布的开源、自部署 **B2B 销售判断 CRM**。它具备账户、联系人、商机、活动和跟进等 CRM 基础能力，并加入可复核的销售判断层：客户信号、支持证据与反向证据、待证明事项、有责任人的下一步和结果反馈。

传统 CRM 告诉团队“记录了什么”；Closr 希望帮助团队复盘 **什么变了、什么还缺、谁在影响、什么会阻断推进、下一步应该验证什么**。

**更多产品信息请访问 [Closr 官网：closr.ing](https://www.closr.ing)。**

### 为什么是 Closr

复杂 B2B 商机并不只存在于某一个 Pipeline 字段。它分散在 CRM 记录、邮件、会议纪要、电话、即时消息、关键人变化、采购问题和历史账户经验中。

团队往往能看见活动，却没有看清局势：

- 客户仍在回复，但真正的决策负责人没有进入；
- 商机阶段没变，但 IT 和采购角色已经加入；
- 客户索要案例，可能是兴趣，也可能说明进入比较前还缺少证据；
- 客户暂时沉默，可能是真的停滞，也可能是内部推动者仍在处理审批。

Closr 将这些信号放到一个可复盘的账户视图中，帮助团队区分事实与推断，并把共同判断转化为明确行动。

### Closr 强在哪里

#### 1. BABEL 解读：不只是保存沟通，而是理解需要复核的信号

**BABEL Decode** 将邮件、会议纪要、电话、聊天记录和已批准的外部上下文整理为结构化的沟通观察：意图信号、风险信号、不确定性、关键人上下文，以及建议验证的问题或动作。

目标不是把 AI 当成不可质疑的答案。每一次解读都是一个**可复核假设**：原始来源、反向信号、缺失信息和人工修订都保留在账户记录中。

#### 2. 账户情报与记忆：保存商机背后的完整上下文

Closr 将联系人、互动、账户历史、关系变化、过往输赢经验和当前证据连接成持续更新的账户视图。

团队不必在每次会议前从零拼凑局面，而是共同复盘：

- 谁在推动、评估、拖延，或控制预算；
- 上次复盘后哪些信号发生变化；
- 哪些假设仍未被证明；
- 哪些历史模式可能正在重演。

#### 3. Judgment Layer：把销售判断变成可挑战的共同语言

Closr 围绕健康度、推进动量、矛盾信号、不确定性、风险、证据缺口和下一步，维护账户与商机判断。

有价值的销售判断必须能被挑战。Closr 希望把支持证据、反向证据、待确认事实、置信度、修订记录和责任人放在一起，而不是把推理隐藏在一个分数后面。

#### 可复核的判断记录

| 每一项建议都应显示 | 示例 |
|---|---|
| 来源证据 | 邮件、会议或 CRM 记录及时间戳 |
| 解读 | “预算负责人尚未进入流程” |
| 反证 / 待证明事项 | “尚无已确认预算权人；下次会议验证” |
| 置信度与复核 | 置信度及人工批准或修订 |
| 有责任人的行动与结果 | 负责人、下一步与后续结果 |

#### 4. 谋局推进：将判断转化为能够推进商机的路径

**Strategic Play（谋局）** 不是泛泛的任务清单，而是将账户局势连接为可执行路径：

```text
客户信号
→ 账户判断
→ 关键人路径 + 客户痛点 + 方案匹配 + 必备证明
→ 决策标准 + 时机 + 升级路径
→ 有责任人的下一步行动
```

面对停滞商机，下一步可能是验证 ROI 证明是否缺失；面对新的采购问题，重点可能从产品演示转向实施证据和内部共识材料。Closr 帮团队把这种选择说清楚、记下来、共同推进。

#### 5. 校准与学习：从结果和人工修订中持续提升

销售团队应该能够回看判断为什么发生变化、某个行动是否有效。Closr 计划保留结果反馈与人工修订，让后续的账户复盘随着真实业务结果不断更扎实。

### Closr 的销售闭环

```text
CRM + 邮件 + 会议 + 电话 + 聊天 + 已批准账户上下文
                            ↓
                      归一化客户信号
                            ↓
       BABEL 解读 + 账户记忆 + 支持证据 / 反向证据
                            ↓
                  可复盘的账户 / 商机判断
                            ↓
                    谋局推进与下一步行动
                            ↓
                    结果、修订与校准
```

### 基础 CRM 能力

Closr 的目标是独立成为中小团队可日常使用的 CRM：

| 模块 | 预期工作流 |
|---|---|
| 账户与联系人 | 管理公司、人员、角色、关系和账户上下文。 |
| 商机与 Pipeline | 跟踪阶段、商业范围、日期、负责人、优先级和账户健康度。 |
| 活动与跟进 | 将会议、笔记、任务、消息和下一步动作持续关联到账户。 |
| 客户沟通 | 将客户互动沉淀到账户历史与团队复盘中。 |
| 销售复盘 | 一起检查证据、风险、关键人覆盖、假设与下一步。 |

<a id="architecture"></a>

### 技术架构

Closr 正在按“应用层 + 多租户数据层 + AI 辅助销售判断层”准备开源：

```text
┌───────────────────────────────────────────────────────────────┐
│  Web CRM 工作台                                                 │
│  账户 · 联系人 · 商机 · Pipeline · Review · 谋局                │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│  销售判断服务                                                   │
│  BABEL Decode · Judgment Layer · Evidence Trace · Strategic Play│
│  结果反馈 · Calibration                                         │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌────────────────────────────▼──────────────────────────────────┐
│  客户数据与部署边界                                              │
│  PostgreSQL/Supabase · Auth · 行级访问 · Storage · Audit        │
│  自部署基础设施与客户批准的 AI Provider                          │
└───────────────────────────────────────────────────────────────┘
```

<a id="technical-baseline"></a>

### 首版发布技术目标（尚不可由公开仓库审计）

当前公开仓库不含源代码、部署制品、测试、CI 配置、许可证或安全文档。以下是**首版发布目标**，不是当前的公开验证证据或生产承诺。准确的安装步骤、支持版本与运行承诺会随首个已许可源代码版本发布。

| 层 | 技术基线 |
|---|---|
| 应用 | Next.js App Router 与 React Web 应用 |
| 语言 | TypeScript |
| UI | Tailwind CSS 与共享 React 组件 |
| 数据与身份 | Supabase/PostgreSQL、Auth、Storage 和组织级访问控制 |
| 客户端状态 | Zustand 与适当的 React Context |
| AI 集成 | 通过服务端路由接入 OpenAI-compatible Provider；AI 输出用于复核，不承担自主权威 |
| 自部署 | Docker 部署 profile 与应用健康检查；公开部署指南将定义支持的基础设施与配置 |
| 质量门 | 类型检查、针对性测试、构建检查与环境/部署校验构成发布基线 |

### 数据、AI 与判断边界

Closr 处理的销售资料可能具有商业敏感性。因此项目遵循这些设计原则：

- **来源优先：**账户判断应回到来源记录和业务数据，不只依赖 AI 生成的缓存摘要。
- **证据与反证：**有价值的判断同时呈现支持信号、冲突信号和缺失信息。
- **人类责任：**AI 解读和建议是复盘输入；客户沟通与业务决策始终由人承担。
- **组织边界：**客户数据、访问权限、保留策略和批准的 AI Provider 由部署组织负责。
- **自部署：**开源项目的目标是让团队在自己的环境中运行 Closr，并掌握自身数据边界。

### 谁适合使用 Closr

Closr 正在面向：

- 希望使用自部署 CRM、又不想丢失客户沟通上下文的创始人和中小 B2B 销售团队；
- 正在推进多关键人、复杂商机的 AE 与销售管理者；
- 希望公开检查、运营和改进 CRM 与销售判断工作流的 RevOps 与技术团队。

### 常见问题

**Closr 是 CRM 还是销售情报工具？**<br>
两者都是。Closr 提供实用 CRM 基础能力，并在其上增加客户信号、账户判断和谋局推进的工作流。

**Closr 会替代人的销售判断吗？**<br>
不会。Closr 的目标是让证据、不确定性和建议行动可被团队复核；最终判断与客户沟通仍由人负责。

**Closr 能自部署吗？**<br>
可以。Closr 正在准备成为自部署开源 CRM。支持的部署方式和准确配置将在第一版公开源代码中发布。

**现在有源代码吗？**<br>
尚未。本 README 用于公开介绍项目；首版源代码、许可证、安全审查和贡献材料正在准备中。

<a id="open-source-status"></a>

### 开源状态与参与方式

**请 Watch 本仓库，等待第一个已许可的源代码版本。** 在此之前，这里是项目介绍与设计讨论的预发布空间；代码贡献会在已许可源代码发布后开放。

#### 首个公开版本将包含

- 完整 Closr 源代码与明确的开源许可证；
- 可复现的自部署与环境配置文档；
- 已支持 AI Provider 与数据边界配置说明；
- 安全报告、升级/备份说明与贡献规范。

访问 [Closr 官网](https://www.closr.ing) 了解产品。

---

Built openly, for teams that want their CRM to stay useful.
