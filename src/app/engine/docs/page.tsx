import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Closr Judgment Engine — API Reference",
  description:
    "API 文档：将销售信号接入 Closr Judgment Engine，获取结构化判断、证据链、赢单缺口和下一步动作建议。",
};

const codeStyle = "rounded-xl border border-slate-200 bg-slate-950 p-4 text-sm leading-6 text-white overflow-x-auto";

function CodeBlock({ code }: { code: string }) {
  return <pre className={codeStyle}><code>{code}</code></pre>;
}

export default function EngineDocsPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 lg:px-10">

        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white">
                <span className="text-sm font-bold">E</span>
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">Closr Judgment Engine</p>
                <p className="text-xs text-slate-500">API Reference · v0.1 (P0)</p>
              </div>
            </div>
            <h1 className="mt-8 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              API 参考文档
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              将 CRM、邮件、会议、RFP 和销售备注中的客户信号发送给 Engine，获取有证据支撑的销售判断、
              赢单缺口和谋局建议。Engine 部署在客户环境内，不自动写回 CRM。
            </p>
          </div>
        </header>

        {/* 1. Getting Started */}
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">1. 部署引擎</h2>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Engine 以 Docker Compose 方式部署在客户本地服务器、私有云或 VPC 内。
          </p>
          <div className="mt-3">
            <CodeBlock code={`# Docker Compose 一键部署
docker compose -f docker-compose.engine.yml up -d

# 确认就绪
curl -s -o /dev/null -w "%{http_code}" http://localhost:3109/api/engine/judgment/snapshot

# API 基础地址
BASE=http://localhost:3109`} />
          </div>
        </section>

        {/* 2. API Endpoints Overview */}
        <section className="mt-12 scroll-mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">2. API 端点一览</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Engine 提供三条核心 API，支持独立调用或组合使用。
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-4">
                <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">POST</span>
                <code className="text-sm font-semibold">/api/engine/judgment/snapshot</code>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">快捷路径</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                一站式 API。发送原始信号 → 自动完成解读、判断、谋局，返回完整判断快照。
                适合快速集成的场景。
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-4">
                <span className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">POST</span>
                <code className="text-sm font-semibold">/api/engine/decode</code>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">解读</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                发送原始信号（邮件、会议、RFP 等），返回结构化解读结果：规范化信号 + 证据片段 + 信号画像。
                适合只需要信号分析、不 Engine 做判断的场景。
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-4">
                <span className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white">POST</span>
                <code className="text-sm font-semibold">/api/engine/strategic-play</code>
                <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">谋局</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                传入已有判断 + 赢单缺口 + 可选谋局目标，返回谋局建议（下一步动作、目标对象、成功/失败标准）。
                适合有自身判断逻辑、只需谋局能力的场景。
              </p>
            </div>
          </div>
        </section>

        {/* ─── 3. Common Types ─── */}
        <section className="mt-12 scroll-mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">3. 通用类型定义</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            以下类型在三个 API 的请求和响应中复用。每个字段都有业务含义，理解它们有助于正确使用 Engine。
          </p>

          {/* EngineSourceRecord */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">EngineSourceRecord</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              原始销售信号。每条 signal 代表一次客户交互（邮件、会议、聊天等）。
              Engine 基于这些信号进行解读和判断。
            </p>
            <table className="mt-4 w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">必填</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">id</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">string</td>
                  <td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    信号唯一 ID。用于去重和追溯证据来源。建议使用 UUID。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">tenantId</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">string</td>
                  <td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    租户 ID，多租户隔离的依据。每个客户一个 ID。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">sourceType</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td>
                  <td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    信号来源类型。可选值：<code className="rounded bg-slate-200 px-1">email</code>, <code className="rounded bg-slate-200 px-1">meeting</code>, <code className="rounded bg-slate-200 px-1">call</code>, <code className="rounded bg-slate-200 px-1">chat</code>, <code className="rounded bg-slate-200 px-1">rfp</code>, <code className="rounded bg-slate-200 px-1">crm_note</code>, <code className="rounded bg-slate-200 px-1">document</code>, <code className="rounded bg-slate-200 px-1">news</code>, <code className="rounded bg-slate-200 px-1">task</code>, <code className="rounded bg-slate-200 px-1">outcome</code>。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">accountId</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">string</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    此信号所属的客户账号 ID。用于关联到正确的客户上下文。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">opportunityId</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">string?</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    关联的商机 ID。同一商机的多信号会被 Engine 自动聚合分析。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">contactIds</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">string[]?</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    参与此交互的联系人 ID 列表。用于干系人分析。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">occurredAt</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">ISO8601</td>
                  <td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    信号发生时间。格式：<code className="rounded bg-slate-200 px-1">2026-06-20T12:00:00.000Z</code>。用于时序分析和 freshness 评分。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">author</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">object?</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    发送方信息。<code className="rounded bg-slate-200 px-1">side</code>（customer/seller/partner/external/unknown），<code className="rounded bg-slate-200 px-1">name</code>，<code className="rounded bg-slate-200 px-1">email</code>。用于判断信号来自客户还是己方。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">content</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">string?</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    信号的原始文本内容。Engine 会从 content 中提取证据片段。如果为空，Engine 只记录信号元数据。
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-xs">metadata</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">object?</td>
                  <td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    自定义元数据，JSON 格式。例如：<code className="rounded bg-slate-200 px-1">{'{ "emailSubject": "Q4 项目需求讨论", "emailCategory": "procurement" }'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* EngineEvidenceRef */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">EngineEvidenceRef</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              证据片段。Engine 从原始信号中提取的关键语句，作为判断的依据。
              每条证据都指向原始信号，支持可追溯性。
            </p>
            <table className="mt-4 w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="px-4 py-3 font-mono text-xs">id</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">证据唯一 ID</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">sourceRecordId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">指向原始信号 <code className="rounded bg-slate-200 px-1">source.id</code>。通过这个字段追溯到具体信号</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">evidenceType</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">
                  证据类型：<code className="rounded bg-slate-200 px-1">support</code>（支持判断的正面证据）、<code className="rounded bg-slate-200 px-1">counter</code>（反面证据）、<code className="rounded bg-slate-200 px-1">missing</code>（缺失的关键信息）、<code className="rounded bg-slate-200 px-1">context</code>（背景上下文）
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">quote</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">从原始信号中截取的关键引文。如：&ldquo;CFO 需要看到 AIOps 一年回本证明&rdquo;</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">summary</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">Engine 对这条证据的提炼总结，一句话说明它的业务含义</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">qualityScore</td><td className="px-4 py-3 font-mono text-xs text-slate-600">number</td><td className="px-4 py-3 text-xs text-slate-600">证据质量评分（0-1）。越高代表证据越明确、越直接相关</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">freshnessScore</td><td className="px-4 py-3 font-mono text-xs text-slate-600">number</td><td className="px-4 py-3 text-xs text-slate-600">证据时效评分（0-1）。越新的信号时效性越高，越近的证据权重越大</td></tr>
              </tbody>
            </table>
          </div>

          {/* EngineJudgment */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">EngineJudgment</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              结构化判断。Engine 对某个维度的客户局势作出的判断，包含结论、置信度和依据。
              一个 snapshot 通常包含多条判断，覆盖不同分析维度。
            </p>
            <table className="mt-4 w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="px-4 py-3 font-mono text-xs">id</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">判断唯一 ID</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">dimension</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">
                  判断维度。可选值：<code className="rounded bg-slate-200 px-1">commercial</code>（商业价值）、<code className="rounded bg-slate-200 px-1">relationship</code>（关系）、<code className="rounded bg-slate-200 px-1">process</code>（流程）、<code className="rounded bg-slate-200 px-1">competition</code>（竞争）、<code className="rounded bg-slate-200 px-1">evidence</code>（证据完备）、<code className="rounded bg-slate-200 px-1">progression</code>（推进）、<code className="rounded bg-slate-200 px-1">finance</code>（财务/预算）、<code className="rounded bg-slate-200 px-1">security</code>（安全/合规）、<code className="rounded bg-slate-200 px-1">rfp</code>（招标）
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">answer</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  判断结论。一句话说清楚 Engine 对这个维度的判断结果。例如：&ldquo;预算审批卡在 CFO 层面，需要 ROI 证明材料&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">status</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">
                  判断状态：<code className="rounded bg-slate-200 px-1">proposed</code>（首次提出）、<code className="rounded bg-slate-200 px-1">accepted</code>（已被确认）、<code className="rounded bg-slate-200 px-1">challenged</code>（被质疑）、<code className="rounded bg-slate-200 px-1">revised</code>（已修正）、<code className="rounded bg-slate-200 px-1">invalidated</code>（已失效）、<code className="rounded bg-slate-200 px-1">confirmed</code>（已确认）
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">confidence</td><td className="px-4 py-3 font-mono text-xs text-slate-600">number</td><td className="px-4 py-3 text-xs text-slate-600">
                  Engine 对此判断的置信度（0-1）。1=100%确定。置信度越高代表 Engine 认为证据越充分
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">impact</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">
                  影响程度：<code className="rounded bg-slate-200 px-1">low</code>、<code className="rounded bg-slate-200 px-1">medium</code>、<code className="rounded bg-slate-200 px-1">high</code>、<code className="rounded bg-slate-200 px-1">critical</code>。影响程度越高，越需要优先处理
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">supportEvidenceIds</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string[]</td><td className="px-4 py-3 text-xs text-slate-600">
                  支持此判断的证据 ID 列表。通过这些 ID 可以查到原始引文
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">counterEvidenceIds</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string[]</td><td className="px-4 py-3 text-xs text-slate-600">
                  反对此判断的证据 ID 列表。有反对证据不代表判断错误，而是需要更多信息来确认
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">missingEvidence</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string[]</td><td className="px-4 py-3 text-xs text-slate-600">
                  Engine 认为还需要的信息。例如：&ldquo;需要确认预算审批流程&rdquo;、&ldquo;需要了解竞品报价细节&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">rationale</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  Engine 的推理过程说明。解释了为什么得出这个判断、基于哪些证据
                </td></tr>
              </tbody>
            </table>
          </div>

          {/* EngineWinGap */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">EngineWinGap</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              赢单缺口。从当前状态到理想状态之间的差距。Engine 的谋局建议就是围绕弥补这些缺口来设计的。
              每个缺口对应一个或多个谋局动作。
            </p>
            <table className="mt-4 w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="px-4 py-3 font-mono text-xs">id</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">缺口唯一 ID</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">dimension</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  缺口分类。例如：<code className="rounded bg-slate-200 px-1">finance/roi_proof</code>（缺少 ROI 证明）、<code className="rounded bg-slate-200 px-1">competition/price</code>（竞品价格压力）、<code className="rounded bg-slate-200 px-1">process/stakeholder</code>（缺少关键干系人覆盖）
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">currentState</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  当前状态描述。例如：&ldquo;CFO 已要求 ROI 证明，销售团队未提供&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">desiredState</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  理想状态描述。例如：&ldquo;CFO 已看到 ROI 证明，预算审批进入下一阶段&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">impact</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  如果此缺口未被弥补，对 deal 的影响。例如：&ldquo;无法通过预算审批，deal 可能丢失&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">linkedJudgmentIds</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string[]</td><td className="px-4 py-3 text-xs text-slate-600">关联的 judgment ID 列表。这个缺口源自哪些判断</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">evidenceGap</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">缺少的具体证据说明。指向需要收集的信息类型</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">status</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">
                  处理状态：<code className="rounded bg-slate-200 px-1">open</code>（待处理）、<code className="rounded bg-slate-200 px-1">addressed</code>（已处理）、<code className="rounded bg-slate-200 px-1">invalidated</code>（已无效）、<code className="rounded bg-slate-200 px-1">accepted_risk</code>（接受风险）
                </td></tr>
              </tbody>
            </table>
          </div>

          {/* EngineMove */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">EngineMove</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              谋局建议（下一步动作）。Engine 针对赢单缺口生成的具体行动建议，包含做什么、找谁、怎么判断成功。
              每条 move 对应一个缺口，用完成此动作后的预期判断变化来衡量效果。
            </p>
            <table className="mt-4 w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="px-4 py-3 font-mono text-xs">id</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">动作唯一 ID</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">winGapId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">关联的赢单缺口 ID。此动作是为了弥补哪个缺口</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">intent</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  动作意图。一句话说明要做什么以及为什么。例如：&ldquo;安排 CFO 会议，展示一年回本 ROI 模型&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">targetPerson</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  目标对象。具体到谁应该被接触：角色、姓名或组织。例如：&ldquo;客户 CFO（张总）&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">ask</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  具体请求/话术建议。接触目标对象时要说什么、问什么、展示什么
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">expectedJudgmentDelta</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  预期的判断变化。完成此动作后，Engine 期望哪些判断会如何改变。
                  例如：&ldquo;finance 维度判断从「缺少 ROI 证明」变为「预算审批推进中」&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">successTest</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  成功标准。用什么标准来衡量此动作是否成功。例如：&ldquo;CFO 确认收到 ROI 模型并要求下一步讨论&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">failureTest</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">
                  失败标准。什么情况算此动作失败。例如：&ldquo;CFO 拒绝安排会议，或要求等待下一预算周期&rdquo;
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">status</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">
                  执行状态：<code className="rounded bg-slate-200 px-1">proposed</code>（已建议）、<code className="rounded bg-slate-200 px-1">approved</code>（已批准）、<code className="rounded bg-slate-200 px-1">in_progress</code>（执行中）、<code className="rounded bg-slate-200 px-1">done</code>（已完成）、<code className="rounded bg-slate-200 px-1">failed</code>（失败）、<code className="rounded bg-slate-200 px-1">skipped</code>（跳过）
                </td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">approvalRequired</td><td className="px-4 py-3 font-mono text-xs text-slate-600">boolean</td><td className="px-4 py-3 text-xs text-slate-600">
                  是否需要人工审批后执行。默认 true，防止自动执行风险动作
                </td></tr>
              </tbody>
            </table>
          </div>

          {/* JudgmentSummary */}
          <div className="mt-10">
            <h3 className="text-lg font-semibold">JudgmentSummary</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              判断摘要。Snapshot API 返回的顶层汇总信息，一眼看懂 deal 整体态势。
            </p>
            <table className="mt-4 w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr><td className="px-4 py-3 font-mono text-xs">health</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">deal 健康度：<code className="rounded bg-slate-200 px-1">healthy</code>（健康）、<code className="rounded bg-slate-200 px-1">at_risk</code>（有风险）、<code className="rounded bg-slate-200 px-1">critical</code>（危急）</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">momentum</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">推进势头：<code className="rounded bg-slate-200 px-1">warming</code>（升温）、<code className="rounded bg-slate-200 px-1">stable</code>（平稳）、<code className="rounded bg-slate-200 px-1">cooling</code>（降温）、<code className="rounded bg-slate-200 px-1">volatile</code>（波动）</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">primaryRisk</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3 text-xs text-slate-600">当前最大的风险描述。例如：&ldquo;finance/procurement blocker — CFO 需要 ROI 证明&rdquo;</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">confidence</td><td className="px-4 py-3 font-mono text-xs text-slate-600">number</td><td className="px-4 py-3 text-xs text-slate-600">Engine 对整体判断的置信度（0-1）</td></tr>
                <tr><td className="px-4 py-3 font-mono text-xs">evidenceQuality</td><td className="px-4 py-3 font-mono text-xs text-slate-600">enum</td><td className="px-4 py-3 text-xs text-slate-600">证据质量：<code className="rounded bg-slate-200 px-1">low</code>、<code className="rounded bg-slate-200 px-1">medium</code>、<code className="rounded bg-slate-200 px-1">high</code>。信号越多、越新、越直接，质量越高</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── 4. Snapshot API ─── */}
        <section className="mt-12 scroll-mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">4. Snapshot API</h2>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">POST /api/engine/judgment/snapshot</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            一站式快捷路径。发一次请求 = 自动完成解读 + 判断 + 谋局，返回全量结果。
            输入原始信号，输出完整的 EngineJudgmentSnapshot。
          </p>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">请求体</h4>
          <table className="mt-2 w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">必填</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr><td className="px-4 py-3 font-mono text-xs">tenantId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">租户 ID</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">accountId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">客户账号 ID</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">opportunityId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string?</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td><td className="px-4 py-3 text-xs text-slate-600">商机 ID（可选）</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">sources</td><td className="px-4 py-3 font-mono text-xs text-slate-600">EngineSourceRecord[]</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">原始销售信号列表，最少 1 条</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">persist</td><td className="px-4 py-3 font-mono text-xs text-slate-600">boolean?</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td><td className="px-4 py-3 text-xs text-slate-600">是否持久化到 Engine 数据库。默认 false。注意：enable 需要 Engine 配置了数据库</td></tr>
            </tbody>
          </table>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">响应体结构</h4>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-2 text-xs leading-6 text-slate-700">
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">schemaVersion</code>: <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">&quot;closr_judgment_engine_v1&quot;</code> — 版本标识，用于客户端校验数据格式</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">judgmentSummary</code>: <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">{'{ health, momentum, primaryRisk, confidence, evidenceQuality }'}</code> — 整体判断摘要（详见上方类型定义）</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">sources</code>: NormalizedEngineSourceRecord[] — 规范化后的信号列表（经过校验、去重、填充默认值）</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">evidenceRefs</code>: EngineEvidenceRef[] — 从信号中提取的证据片段列表</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">judgments</code>: EngineJudgment[] — 判断列表。每个维度一条，覆盖全部相关维度</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">winGaps</code>: EngineWinGap[] — 赢单缺口列表。每个维度一条或多条</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">moves</code>: EngineMove[] — 谋局建议列表。针对每个缺口生成对应的动作建议</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">writebackPolicy</code>: <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">{'{ mode: &quot;proposal_only&quot;, prohibitedFields: [...] }'}</code> — 引擎写回策略，默认只建议不自动修改 CRM</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">crmFieldUpdates</code>: [] — 默认空，Engine 不会自动改 CRM 字段</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">persistence</code>: <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">{'{ persisted: false }'}</code> — 持久化状态，默认为 false</p>
            </div>
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">调用示例</h4>
          <div className="mt-2">
            <CodeBlock code={`curl -X POST http://localhost:3109/api/engine/judgment/snapshot \\
  -H 'Content-Type: application/json' \\
  -d '{
    "tenantId": "tenant_demo",
    "accountId": "acct_customer_a",
    "sources": [{
      "id": "src_001",
      "tenantId": "tenant_demo",
      "sourceType": "email",
      "accountId": "acct_customer_a",
      "occurredAt": "2026-06-20T12:00:00.000Z",
      "author": { "side": "customer", "name": "采购负责人" },
      "content": "今年集团有 5% 年降目标，TCS 报价更低。
CFO 需要看到 AIOps 一年回本证明。"
    }, {
      "id": "src_002",
      "tenantId": "tenant_demo",
      "sourceType": "meeting",
      "accountId": "acct_customer_a",
      "occurredAt": "2026-06-18T15:30:00.000Z",
      "author": { "side": "seller", "name": "销售代表" },
      "content": "客户技术团队很认可我们的方案。
但采购那边在比价，TCS 也在跟进。"
    }]
  }'`} />
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">返回示例</h4>
          <div className="mt-2">
            <CodeBlock code={`{
  "schemaVersion": "closr_judgment_engine_v1",
  "judgmentSummary": {
    "health": "at_risk",
    "momentum": "cooling",
    "primaryRisk": "finance/procurement blocker — CFO 需要 ROI 证明",
    "confidence": 0.72,
    "evidenceQuality": "medium"
  },
  "sources": [
    {
      "id": "src_001",
      "tenantId": "tenant_demo",
      "sourceType": "email",
      "accountId": "acct_customer_a",
      "occurredAt": "2026-06-20T12:00:00.000Z",
      "author": { "side": "customer", "name": "\u91c7\u8d2d\u8d1f\u8d23\u4eba" },
      "content": "\u4eca\u5e74\u96c6\u56e2\u6709 5% \u5e74\u964d\u76ee\u6807\uff0cTCS \u62a5\u4ef7\u66f4\u4f4e\u3002CFO \u9700\u8981\u770b\u5230 AIOps \u4e00\u5e74\u56de\u672c\u8bc1\u660e\u3002"
    },
    {
      "id": "src_002",
      "tenantId": "tenant_demo",
      "sourceType": "meeting",
      "accountId": "acct_customer_a",
      "occurredAt": "2026-06-18T15:30:00.000Z",
      "author": { "side": "seller", "name": "\u9500\u552e\u4ee3\u8868" },
      "content": "\u5ba2\u6237\u6280\u672f\u56e2\u961f\u5f88\u8ba4\u53ef\u6211\u4eec\u7684\u65b9\u6848\u3002\u4f46\u91c7\u8d2d\u90a3\u8fb9\u5728\u6bd4\u4ef7\uff0cTCS \u4e5f\u5728\u8ddf\u8fdb\u3002"
    }
  ],
  "evidenceRefs": [
    {
      "id": "ev_001",
      "sourceRecordId": "src_001",
      "evidenceType": "counter",
      "quote": "TCS \u62a5\u4ef7\u66f4\u4f4e",
      "summary": "\u7ade\u54c1 TCS \u5728\u4ef7\u683c\u4e0a\u5177\u6709\u4f18\u52bf",
      "qualityScore": 0.85,
      "freshnessScore": 0.95
    },
    {
      "id": "ev_002",
      "sourceRecordId": "src_001",
      "evidenceType": "counter",
      "quote": "\u4eca\u5e74\u96c6\u56e2\u6709 5% \u5e74\u964d\u76ee\u6807",
      "summary": "\u5ba2\u6237\u5b58\u5728\u660e\u786e\u7684\u964d\u672c\u538b\u529b\uff0c\u662f\u53cc\u5203\u5251",
      "qualityScore": 0.9,
      "freshnessScore": 0.95
    },
    {
      "id": "ev_003",
      "sourceRecordId": "src_001",
      "evidenceType": "missing",
      "quote": "CFO \u9700\u8981\u770b\u5230 AIOps \u4e00\u5e74\u56de\u672c\u8bc1\u660e",
      "summary": "\u5ba2\u6237 CFO \u9700\u8981 ROI \u8bc1\u660e\u6750\u6599\u624d\u80fd\u63a8\u8fdb\u9884\u7b97",
      "qualityScore": 0.88,
      "freshnessScore": 0.95
    },
    {
      "id": "ev_004",
      "sourceRecordId": "src_002",
      "evidenceType": "support",
      "quote": "\u5ba2\u6237\u6280\u672f\u56e2\u961f\u5f88\u8ba4\u53ef\u6211\u4eec\u7684\u65b9\u6848",
      "summary": "\u6280\u672f\u5c42\u9762\u7684\u8ba4\u53ef\u5ea6\u8f83\u9ad8",
      "qualityScore": 0.7,
      "freshnessScore": 0.6
    },
    {
      "id": "ev_005",
      "sourceRecordId": "src_002",
      "evidenceType": "counter",
      "quote": "\u91c7\u8d2d\u90a3\u8fb9\u5728\u6bd4\u4ef7\uff0cTCS \u4e5f\u5728\u8ddf\u8fdb",
      "summary": "\u91c7\u8d2d\u5c42\u9762\u5b58\u5728\u6bd4\u4ef7\u7ade\u4e89",
      "qualityScore": 0.75,
      "freshnessScore": 0.6
    }
  ],
  "judgments": [
    {
      "id": "judg_001",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "finance",
      "answer": "\u9884\u7b97\u5ba1\u6279\u5361\u5728 CFO \u5c42\u9762\uff0cCFO \u9700\u8981\u770b\u5230\u4e00\u5e74\u56de\u672c\u7684 ROI \u8bc1\u660e",
      "status": "proposed",
      "confidence": 0.8,
      "impact": "high",
      "supportEvidenceIds": ["ev_003"],
      "counterEvidenceIds": [],
      "missingEvidence": ["CFO \u7684 ROI \u8ba1\u7b97\u53e3\u5f84\u662f\u4ec0\u4e48", "\u5ba2\u6237 CEO \u662f\u5426\u5df2\u6279\u51c6\u9884\u7b97\u65b9\u5411"],
      "rationale": "\u91c7\u8d2d\u8d1f\u8d23\u4eba\u660e\u786e\u63d0\u5230 CFO \u9700\u8981 ROI \u8bc1\u660e\uff0c\u8fd9\u662f\u9884\u7b97\u5ba1\u6279\u7684\u552f\u4e00\u5361\u70b9\u3002\u7f3a\u5c11 CFO \u7684\u5177\u4f53 ROI \u8ba1\u7b97\u6807\u51c6\u3002"
    },
    {
      "id": "judg_002",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "competition",
      "answer": "TCS \u5728\u4ef7\u683c\u4e0a\u6709\u4f18\u52bf\uff0c\u91c7\u8d2d\u90e8\u95e8\u6b63\u5728\u6bd4\u4ef7",
      "status": "proposed",
      "confidence": 0.75,
      "impact": "high",
      "supportEvidenceIds": ["ev_001", "ev_005"],
      "counterEvidenceIds": ["ev_004"],
      "missingEvidence": ["TCS \u7684\u5177\u4f53\u62a5\u4ef7\u662f\u591a\u5c11", "\u6211\u4eec\u65b9\u6848\u76f8\u6bd4 TCS \u7684\u6280\u672f\u4f18\u52bf\u662f\u5426\u80fd\u91cf\u5316"],
      "rationale": "\u91c7\u8d2d\u8d1f\u8d23\u4eba\u548c\u9500\u552e\u4ee3\u8868\u90fd\u786e\u8ba4 TCS \u62a5\u4ef7\u66f4\u4f4e\u4e14\u6b63\u5728\u8ddf\u5355\uff0c\u7ade\u4e89\u538b\u529b\u771f\u5b9e\u5b58\u5728\u3002\u6280\u672f\u56e2\u961f\u7684\u8ba4\u53ef\u53ef\u80fd\u5e2e\u52a9\u7f13\u89e3\u7eaf\u4ef7\u683c\u7ade\u4e89\u3002"
    }
  ],
  "winGaps": [
    {
      "id": "gap_001",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "finance/roi_proof",
      "currentState": "CFO \u5df2\u8981\u6c42 ROI \u8bc1\u660e\uff0c\u9500\u552e\u56e2\u961f\u672a\u63d0\u4f9b",
      "desiredState": "CFO \u5df2\u770b\u5230 ROI \u8bc1\u660e\u6750\u6599\uff0c\u9884\u7b97\u5ba1\u6279\u63a8\u8fdb\u4e2d",
      "impact": "\u7f3a\u5c11 ROI \u8bc1\u660e\u76f4\u63a5\u5bfc\u81f4 budget \u88ab\u780d\uff0cdeal \u53ef\u80fd\u4e22\u5931",
      "linkedJudgmentIds": ["judg_001"],
      "evidenceGap": "\u6ca1\u6709\u9488\u5bf9 CFO \u7684 ROI \u8ba1\u7b97\u6750\u6599\u548c\u5ba2\u6237 CFO \u5177\u4f53\u7684 ROI \u8ba1\u7b97\u53e3\u5f84",
      "status": "open"
    },
    {
      "id": "gap_002",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "competition/price",
      "currentState": "TCS \u62a5\u4ef7\u66f4\u4f4e\uff0c\u91c7\u8d2d\u5728\u6bd4\u4ef7",
      "desiredState": "\u5ba2\u6237\u7406\u89e3\u6211\u65b9\u65b9\u6848\u7684\u7efc\u5408\u4ef7\u503c\u9ad8\u4e8e\u4ef7\u683c\u5dee\u8ddd",
      "impact": "\u7eaf\u4ef7\u683c\u7ade\u4e89\u53ef\u80fd\u5bfc\u81f4\u4e22\u5931 deal",
      "linkedJudgmentIds": ["judg_002"],
      "evidenceGap": "\u7f3a\u5c11 TCS \u7684\u5177\u4f53\u62a5\u4ef7\u548c\u5bf9\u6bd4\u5206\u6790",
      "status": "open"
    }
  ],
  "moves": [
    {
      "id": "move_001",
      "winGapId": "gap_001",
      "intent": "\u5b89\u6392 CFO \u4f1a\u8bae\uff0c\u5c55\u793a\u4e00\u5e74\u56de\u672c ROI \u6a21\u578b\uff0c\u9644\u884c\u4e1a\u6848\u4f8b",
      "targetPerson": "\u5ba2\u6237 CFO\uff08\u5f20\u603b\uff09",
      "ask": "\u7533\u8bf7 30 \u5206\u949f\u4f1a\u8bae\uff0c\u5c55\u793a AIOps \u6295\u8d44\u56de\u62a5\u6a21\u578b\u2014\u2014\u5305\u542b TCO \u5bf9\u6bd4\u3001\u884c\u4e1a\u6848\u4f8b\u7684\u4e00\u5e74\u56de\u672c\u6570\u636e\u3002\u540c\u65f6\u8be2\u95ee CFO \u5bf9 ROI \u7684\u5177\u4f53\u8ba1\u7b97\u8981\u6c42\u3002",
      "expectedJudgmentDelta": "finance \u7ef4\u5ea6\u5224\u65ad\u4ece\u300c\u7f3a\u5c11 ROI \u8bc1\u660e\u300d\u53d8\u4e3a\u300c\u9884\u7b97\u5ba1\u6279\u63a8\u8fdb\u4e2d\u300d\uff0cconfidence \u63d0\u5347\u81f3 0.9",
      "successTest": "CFO \u786e\u8ba4\u6536\u5230 ROI \u6a21\u578b\u5e76\u8981\u6c42\u4e0b\u4e00\u6b65\u8ba8\u8bba",
      "failureTest": "CFO \u62d2\u7edd\u5b89\u6392\u4f1a\u8bae\uff0c\u6216\u8868\u793a\u9700\u8981\u7b49\u5f85\u4e0b\u4e00\u9884\u7b97\u5468\u671f",
      "status": "proposed",
      "approvalRequired": true
    },
    {
      "id": "move_002",
      "winGapId": "gap_001",
      "intent": "\u8054\u5408\u6280\u672f\u56e2\u961f\u51c6\u5907 AIOps ROI \u91cf\u5316\u6750\u6599",
      "targetPerson": "\u5185\u90e8 \u2014 \u552e\u524d\u6280\u672f\u56e2\u961f",
      "ask": "\u51c6\u5907\u5ba2\u6237\u573a\u666f\u5316\u7684\u6295\u8d44\u56de\u62a5\u8ba1\u7b97\u6a21\u677f\uff0c\u5305\u542b\uff1a\u8fd0\u7ef4\u6210\u672c\u8282\u7701\u3001\u6548\u7387\u63d0\u5347\u3001MTTR \u7f29\u77ed\u7684\u91cf\u5316\u6570\u636e\u3002\u63d0\u4f9b\u76f8\u4f3c\u89c4\u6a21\u5ba2\u6237\u7684\u53c2\u8003\u6848\u4f8b\u3002",
      "expectedJudgmentDelta": "evidence \u7ef4\u5ea6\u5224\u65ad\u4ece\u300c\u7f3a\u5c11 ROI \u6750\u6599\u300d\u53d8\u4e3a\u300cROI \u6750\u6599\u5df2\u5c31\u7eea\u300d",
      "successTest": "\u6280\u672f\u56e2\u961f\u5728 3 \u4e2a\u5de5\u4f5c\u65e5\u5185\u8f93\u51fa ROI \u6750\u6599\u521d\u7a3f",
      "failureTest": "\u6280\u672f\u56e2\u961f\u65e0\u6cd5\u8f93\u51fa\u7b26\u5408 CFO \u9884\u671f\u7684\u91cf\u5316\u6570\u636e",
      "status": "proposed",
      "approvalRequired": false
    },
    {
      "id": "move_003",
      "winGapId": "gap_002",
      "intent": "\u68b3\u7406\u4e0e TCS \u7684\u529f\u80fd\u5bf9\u6bd4\u548c\u5dee\u5f02\u5316\u4f18\u52bf",
      "targetPerson": "\u5ba2\u6237\u6280\u672f\u8d1f\u8d23\u4eba",
      "ask": "\u4e86\u89e3\u5ba2\u6237\u6280\u672f\u56e2\u961f\u9009\u62e9\u6211\u4eec\u7684\u6838\u5fc3\u539f\u56e0\uff0c\u83b7\u53d6\u529f\u80fd\u5bf9\u6bd4\u8bc1\u636e\u3002\u51c6\u5907\u5dee\u5f02\u5316\u4ef7\u503c\u6587\u6863\u5e2e\u52a9\u91c7\u8d2d\u505a\u51b3\u7b56\u3002",
      "expectedJudgmentDelta": "competition \u7ef4\u5ea6\u5224\u65ad\u4ece\u300c\u4ef7\u683c\u52a3\u52bf\u300d\u53d8\u4e3a\u300c\u7efc\u5408\u4ef7\u503c\u4f18\u52bf\u88ab\u8ba4\u53ef\u300d",
      "successTest": "\u5ba2\u6237\u6280\u672f\u8d1f\u8d23\u4eba\u4e66\u9762\u8ba4\u53ef\u6211\u65b9\u65b9\u6848\u76f8\u6bd4 TCS \u7684\u5dee\u5f02\u5316\u4f18\u52bf",
      "failureTest": "\u6280\u672f\u8d1f\u8d23\u4eba\u65e0\u6cd5\u6e05\u6670\u8bf4\u51fa\u5dee\u5f02\u5316\uff0c\u6216\u8ba4\u4e3a TCS \u65b9\u6848\u5df2\u591f\u7528",
      "status": "proposed",
      "approvalRequired": false
    }
  ],
  "writebackPolicy": {
    "mode": "proposal_only",
    "prohibitedFields": ["amount", "stage", "probability"]
  },
  "crmFieldUpdates": [],
  "persistence": {
    "persisted": false
  }
}`} />
          </div>

        </section>

        {/* ─── 5. Decode API ─── */}
        <section className="mt-12 scroll-mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">5. Decode API</h2>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">POST /api/engine/decode</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            信号解读 API。发送原始信号，返回结构化解读结果。不会自动执行判断和谋局。
            适合只需要信号分析的场景，或者作为数据预处理层。
          </p>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">请求体</h4>
          <table className="mt-2 w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">必填</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr><td className="px-4 py-3 font-mono text-xs">tenantId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">租户 ID</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">accountId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">客户账号 ID</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">opportunityId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string?</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td><td className="px-4 py-3 text-xs text-slate-600">商机 ID（可选）</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">sources</td><td className="px-4 py-3 font-mono text-xs text-slate-600">EngineSourceRecord[]</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">原始销售信号列表</td></tr>
            </tbody>
          </table>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">响应体</h4>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-2 text-xs leading-6 text-slate-700">
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">schemaVersion</code>: &quot;closr_judgment_engine_v1&quot;</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">sources</code>: NormalizedEngineSourceRecord[] — 规范化后的信号列表（经过校验、哈希去重）</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">evidenceRefs</code>: EngineEvidenceRef[] — 从信号中提取的证据片段（每条包含 quote, summary, qualityScore, freshnessScore）</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">signalProfile</code>: <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">{'{ primaryRisk, patterns, signalStrength }'}</code> — 信号画像</p>
              <ul className="ml-6 list-disc space-y-1">
                <li><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">primaryRisk</code>: string — 识别到的主要风险类型，如 <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">&quot;finance/procurement blocker&quot;</code></li>
                <li><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">patterns</code>: string[] — 检测到的风险模式列表</li>
                <li><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">signalStrength</code>: <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">&quot;strong&quot;</code> | <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">&quot;weak&quot;</code> — 信号强度</li>
              </ul>
            </div>
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">调用示例</h4>
          <div className="mt-2">
            <CodeBlock code={`curl -X POST http://localhost:3109/api/engine/decode \\
  -H 'Content-Type: application/json' \\
  -d '{
    "tenantId": "tenant_demo",
    "accountId": "acct_customer_a",
    "sources": [{
      "id": "src_001",
      "tenantId": "tenant_demo",
      "sourceType": "email",
      "accountId": "acct_customer_a",
      "occurredAt": "2026-06-20T12:00:00.000Z",
      "author": { "side": "customer", "name": "采购负责人" },
      "content": "今年集团有 5% 年降目标，TCS 报价更低。
CFO 需要看到 AIOps 一年回本证明。"
    }]
  }'`} />
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">返回示例</h4>
          <div className="mt-2">
            <CodeBlock code={`{
  "schemaVersion": "closr_judgment_engine_v1",
  "sources": [
    {
      "id": "src_001",
      "tenantId": "tenant_demo",
      "sourceType": "email",
      "accountId": "acct_customer_a",
      "occurredAt": "2026-06-20T12:00:00.000Z",
      "author": { "side": "customer", "name": "\u91c7\u8d2d\u8d1f\u8d23\u4eba" },
      "content": "\u4eca\u5e74\u96c6\u56e2\u6709 5% \u5e74\u964d\u76ee\u6807\uff0cTCS \u62a5\u4ef7\u66f4\u4f4e\u3002CFO \u9700\u8981\u770b\u5230 AIOps \u4e00\u5e74\u56de\u672c\u8bc1\u660e\u3002"
    }
  ],
  "evidenceRefs": [
    {
      "id": "ev_001",
      "sourceRecordId": "src_001",
      "evidenceType": "counter",
      "quote": "TCS \u62a5\u4ef7\u66f4\u4f4e",
      "summary": "\u7ade\u54c1\u62a5\u4ef7\u66f4\u4f4e\uff0c\u4ef7\u683c\u7ade\u4e89\u98ce\u9669",
      "qualityScore": 0.85,
      "freshnessScore": 0.95
    },
    {
      "id": "ev_002",
      "sourceRecordId": "src_001",
      "evidenceType": "counter",
      "quote": "\u4eca\u5e74\u96c6\u56e2\u6709 5% \u5e74\u964d\u76ee\u6807",
      "summary": "\u5ba2\u6237\u5b58\u5728\u660e\u786e\u964d\u672c\u538b\u529b",
      "qualityScore": 0.9,
      "freshnessScore": 0.95
    },
    {
      "id": "ev_003",
      "sourceRecordId": "src_001",
      "evidenceType": "missing",
      "quote": "CFO \u9700\u8981\u770b\u5230 AIOps \u4e00\u5e74\u56de\u672c\u8bc1\u660e",
      "summary": "CFO \u9700\u8981 ROI \u8bc1\u660e\u6750\u6599\u624d\u80fd\u63a8\u8fdb\u9884\u7b97",
      "qualityScore": 0.88,
      "freshnessScore": 0.95
    }
  ],
  "signalProfile": {
    "primaryRisk": "finance/procurement blocker",
    "patterns": ["\u4ef7\u683c\u538b\u529b", "\u9884\u7b97\u5361\u70b9", "\u7ade\u54c1\u5a01\u80c1"],
    "signalStrength": "strong"
  }
}`} />
          </div>
        </section>

        {/* ─── 6. Strategic Play API ─── */}
        <section className="mt-12 scroll-mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">6. Strategic Play API</h2>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">POST /api/engine/strategic-play</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            谋局 API。传入已有判断 + 赢单缺口（可选加谋局目标），Engine 生成针对性的谋局建议。
            适合已有自身判断逻辑、只需要 Engine 谋局能力的场景。
          </p>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">请求体</h4>
          <table className="mt-2 w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">字段</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">类型</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">必填</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr><td className="px-4 py-3 font-mono text-xs">tenantId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">租户 ID</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">accountId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">客户账号 ID</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">opportunityId</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string?</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td><td className="px-4 py-3 text-xs text-slate-600">商机 ID（可选）</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">playGoal</td><td className="px-4 py-3 font-mono text-xs text-slate-600">string?</td><td className="px-4 py-3"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">否</span></td><td className="px-4 py-3 text-xs text-slate-600">
                谋局目标。一句话说清楚想达到的目标。Engine 会根据目标约束来生成更精准的动作建议。
                例如：&ldquo;三个月内把 deal 从评估阶段推进到签单&rdquo;。
                不传则 Engine 根据判断和缺口自行推导最优方向。
              </td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">judgments</td><td className="px-4 py-3 font-mono text-xs text-slate-600">EngineJudgment[]</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">已有判断列表。至少 1 条。建议从 snapshot 或 decode + 自行处理后传入</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">winGaps</td><td className="px-4 py-3 font-mono text-xs text-slate-600">EngineWinGap[]</td><td className="px-4 py-3"><span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">是</span></td><td className="px-4 py-3 text-xs text-slate-600">赢单缺口列表。至少 1 条</td></tr>
            </tbody>
          </table>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">响应体</h4>
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="space-y-2 text-xs leading-6 text-slate-700">
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">schemaVersion</code>: &quot;closr_judgment_engine_v1&quot;</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">judgments</code>: EngineJudgment[] — 传入的判断（透传返回）</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">winGaps</code>: EngineWinGap[] — 传入的赢单缺口（透传返回）</p>
              <p><code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">moves</code>: EngineMove[] — 生成的谋局建议列表</p>
              <p className="mt-2 text-amber-700">每条 move 包含：intent（做什么）、targetPerson（找谁）、ask（说什么）、expectedJudgmentDelta（预期变化）、successTest（成功标准）、failureTest（失败标准）、approvalRequired（是否要审批）</p>
            </div>
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">调用示例（从 Snapshot 取判断 → 传入谋局）</h4>
          <div className="mt-2">
            <CodeBlock code={`# 1. 先取 snapshot
SNAPSHOT=$(curl -s -X POST http://localhost:3109/api/engine/judgment/snapshot \\
  -H 'Content-Type: application/json' \\
  -d '{
    "tenantId": "tenant_demo",
    "accountId": "acct_customer_a",
    "sources": [{
      "id":"src_001","tenantId":"tenant_demo","sourceType":"email",
      "accountId":"acct_customer_a",
      "occurredAt":"2026-06-20T12:00:00.000Z",
      "content":"CFO 要求看一年回本证明，采购说TCS报价更低。"
    }]
  }')

# 2. 传入 judgment + winGap + playGoal 给谋局 API
echo "$SNAPSHOT" | jq '{
  tenantId: .tenantId,
  accountId: .accountId,
  playGoal: "三个月内从评估阶段推进到签单",
  judgments: .judgments,
  winGaps: .winGaps
}' | curl -X POST http://localhost:3109/api/engine/strategic-play \\
    -H "Content-Type: application/json" -d @-`} />
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">调用示例（传入自定义判断 + 谋局目标）</h4>
          <div className="mt-2">
            <CodeBlock code={`curl -X POST http://localhost:3109/api/engine/strategic-play \\
  -H 'Content-Type: application/json' \\
  -d '{
    "tenantId": "tenant_demo",
    "accountId": "acct_customer_a",
    "playGoal": "两个月内让 CFO 批准预算，并清除采购层面的比价风险",
    "judgments": [{
      "id": "judg_001",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "finance",
      "answer": "预算审批卡在 CFO 层面，
CFO 需要看到一年回本的 ROI 证明",
      "status": "proposed",
      "confidence": 0.8,
      "impact": "high",
      "supportEvidenceIds": ["ev_001"],
      "counterEvidenceIds": [],
      "missingEvidence": ["CFO 的 ROI 计算口径是什么"],
      "rationale": "采购负责人多次提到 CFO 需要 ROI 证明"
    }],
    "winGaps": [{
      "id": "gap_001",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "finance/roi_proof",
      "currentState": "CFO 已要求 ROI 证明，销售团队未提供",
      "desiredState": "CFO 已看到 ROI 证明材料，预算审批推进中",
      "impact": "缺少 ROI 证明可能直接导致 budget 被砍",
      "linkedJudgmentIds": ["judg_001"],
      "evidenceGap": "没有针对 CFO 的 ROI 计算材料",
      "status": "open"
    }]
  }'`} />
          </div>

          <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">返回示例</h4>
          <div className="mt-2">
            <CodeBlock code={`{
  "schemaVersion": "closr_judgment_engine_v1",
  "judgments": [
    {
      "id": "judg_001",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "finance",
      "answer": "\u9884\u7b97\u5ba1\u6279\u5361\u5728 CFO \u5c42\u9762\uff0cCFO \u9700\u8981\u770b\u5230\u4e00\u5e74\u56de\u672c\u7684 ROI \u8bc1\u660e",
      "status": "proposed",
      "confidence": 0.8,
      "impact": "high",
      "supportEvidenceIds": ["ev_003"],
      "counterEvidenceIds": [],
      "missingEvidence": ["CFO \u7684 ROI \u8ba1\u7b97\u53e3\u5f84\u662f\u4ec0\u4e48"],
      "rationale": "\u91c7\u8d2d\u8d1f\u8d23\u4eba\u660e\u786e\u63d0\u5230 CFO \u9700\u8981 ROI \u8bc1\u660e"
    }
  ],
  "winGaps": [
    {
      "id": "gap_001",
      "tenantId": "tenant_demo",
      "accountId": "acct_customer_a",
      "dimension": "finance/roi_proof",
      "currentState": "CFO \u5df2\u8981\u6c42 ROI \u8bc1\u660e\uff0c\u9500\u552e\u56e2\u961f\u672a\u63d0\u4f9b",
      "desiredState": "CFO \u5df2\u770b\u5230 ROI \u8bc1\u660e\u6750\u6599\uff0c\u9884\u7b97\u5ba1\u6279\u63a8\u8fdb\u4e2d",
      "impact": "\u7f3a\u5c11 ROI \u8bc1\u660e\u53ef\u80fd\u76f4\u63a5\u5bfc\u81f4 budget \u88ab\u780d",
      "linkedJudgmentIds": ["judg_001"],
      "evidenceGap": "\u6ca1\u6709\u9488\u5bf9 CFO \u7684 ROI \u8ba1\u7b97\u6750\u6599",
      "status": "open"
    }
  ],
  "moves": [
    {
      "id": "move_001",
      "winGapId": "gap_001",
      "intent": "\u5b89\u6392 CFO \u4f1a\u8bae\uff0c\u5c55\u793a\u4e00\u5e74\u56de\u672c ROI \u6a21\u578b\uff0c\u9644\u884c\u4e1a\u6848\u4f8b",
      "targetPerson": "\u5ba2\u6237 CFO\uff08\u5f20\u603b\uff09",
      "ask": "\u7533\u8bf7 30 \u5206\u949f\u4f1a\u8bae\uff0c\u5c55\u793a AIOps \u6295\u8d44\u56de\u62a5\u6a21\u578b\u2014\u2014\u5305\u542b TCO \u5bf9\u6bd4\u3001\u884c\u4e1a\u6848\u4f8b\u7684\u4e00\u5e74\u56de\u672c\u6570\u636e\u3002\u540c\u65f6\u8be2\u95ee CFO \u5bf9 ROI \u7684\u5177\u4f53\u8ba1\u7b97\u8981\u6c42\u3002",
      "expectedJudgmentDelta": "finance \u7ef4\u5ea6\u5224\u65ad\u4ece\u300c\u7f3a\u5c11 ROI \u8bc1\u660e\u300d\u53d8\u4e3a\u300c\u9884\u7b97\u5ba1\u6279\u63a8\u8fdb\u4e2d\u300d",
      "successTest": "CFO \u786e\u8ba4\u6536\u5230 ROI \u6a21\u578b\u5e76\u8981\u6c42\u4e0b\u4e00\u6b65\u8ba8\u8bba",
      "failureTest": "CFO \u62d2\u7edd\u5b89\u6392\u4f1a\u8bae\uff0c\u6216\u8868\u793a\u9700\u8981\u7b49\u5f85\u4e0b\u4e00\u9884\u7b97\u5468\u671f",
      "status": "proposed",
      "approvalRequired": true
    },
    {
      "id": "move_002",
      "winGapId": "gap_001",
      "intent": "\u8054\u5408\u6280\u672f\u56e2\u961f\u51c6\u5907 AIOps ROI \u91cf\u5316\u6750\u6599",
      "targetPerson": "\u5185\u90e8 \u2014 \u552e\u524d\u6280\u672f\u56e2\u961f",
      "ask": "\u51c6\u5907\u5ba2\u6237\u573a\u666f\u5316\u7684\u6295\u8d44\u56de\u62a5\u8ba1\u7b97\u6a21\u677f\uff0c\u5305\u542b\uff1a\u8fd0\u7ef4\u6210\u672c\u8282\u7701\u3001\u6548\u7387\u63d0\u5347\u3001MTTR \u7f29\u77ed\u7684\u91cf\u5316\u6570\u636e\u3002",
      "expectedJudgmentDelta": "evidence \u7ef4\u5ea6\u5224\u65ad\u4ece\u300c\u7f3a\u5c11 ROI \u6750\u6599\u300d\u53d8\u4e3a\u300cROI \u6750\u6599\u5df2\u5c31\u7eea\u300d",
      "successTest": "\u6280\u672f\u56e2\u961f\u5728 3 \u4e2a\u5de5\u4f5c\u65e5\u5185\u8f93\u51fa ROI \u6750\u6599\u521d\u7a3f",
      "failureTest": "\u6280\u672f\u56e2\u961f\u65e0\u6cd5\u8f93\u51fa\u7b26\u5408 CFO \u9884\u671f\u7684\u91cf\u5316\u6570\u636e",
      "status": "proposed",
      "approvalRequired": false
    }
  ]
}`} />
          </div>
        </section>

        {/* ─── 7. Error Handling ─── */}
        <section className="mt-12 scroll-mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">7. 错误处理</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            所有 API 在出错时返回 JSON 格式的错误信息，格式：<code className="rounded bg-slate-200 px-1">{'{ "error": "错误描述" }'}</code>
          </p>

          <table className="mt-4 w-full min-w-[400px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">状态码</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">说明</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">常见原因</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr><td className="px-4 py-3 font-mono text-xs">200</td><td className="px-4 py-3 text-xs text-slate-600">成功</td><td className="px-4 py-3 text-xs text-slate-600">返回完整 JSON body</td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">400</td><td className="px-4 py-3 text-xs text-slate-600">请求体校验失败</td><td className="px-4 py-3 text-xs text-slate-600">
                字段缺失、格式错误、sources 为空、超过 25 条限制等。具体原因在 error 消息中说明
              </td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">413</td><td className="px-4 py-3 text-xs text-slate-600">请求体过大</td><td className="px-4 py-3 text-xs text-slate-600">
                单条 source content 超过 50KB。分批发送或截断过长的信号
              </td></tr>
              <tr><td className="px-4 py-3 font-mono text-xs">429</td><td className="px-4 py-3 text-xs text-slate-600">请求频率超限</td><td className="px-4 py-3 text-xs text-slate-600">
                AI 模式每分钟最多 10 次请求（每个 tenantId）。规则引擎模式不限频
              </td></tr>
            </tbody>
          </table>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-800">常见 400 错误</p>
            <ul className="mt-2 space-y-1 text-xs leading-6 text-amber-700">
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;tenantId is required&quot;</code> — 请求体缺少 tenantId</li>
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;accountId is required&quot;</code> — 请求体缺少 accountId</li>
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;sources are required&quot;</code> — sources 数组为空（decode/snapshot）</li>
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;sources exceeds maximum of 25&quot;</code> — sources 超过 25 条</li>
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;source &quot;xxx&quot; content exceeds maximum of 50KB&quot;</code> — 单条内容超过 50KB</li>
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;judgments are required&quot;</code> — judgments 数组为空（strategic-play）</li>
              <li><code className="rounded bg-amber-200 px-1.5 py-0.5">&quot;winGaps are required&quot;</code> — winGaps 数组为空（strategic-play）</li>
            </ul>
          </div>
        </section>

        {/* ─── 8. 集成模式 ─── */}
        <section className="mt-12 border-t border-slate-200 pt-12">
          <h2 className="text-2xl font-semibold tracking-tight">8. 集成模式</h2>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">模式 A：全链路 Snapshot</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                发原始信号 → 一次调用拿全量结果（解读 + 判断 + 谋局）。适合快速集成和试用。
              </p>
              <CodeBlock code={`# Python
import requests, json

resp = requests.post("http://localhost:3109/api/engine/judgment/snapshot", json={
    "tenantId": "tenant_demo",
    "accountId": "acct_customer_a",
    "sources": [{
        "id": "src_001",
        "tenantId": "tenant_demo",
        "sourceType": "email",
        "accountId": "acct_customer_a",
        "occurredAt": "2026-06-20T12:00:00.000Z",
        "author": {"side": "customer", "name": "采购负责人"},
        "content": "今年集团有 5% 年降目标，TCS 报价更低。CFO 需要看到 AIOps 一年回本证明。"
    }]
})
print(json.dumps(resp.json(), ensure_ascii=False, indent=2))`} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">模式 B：解读 → 判断 → 谋局</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                先调 Decode 拿到证据链和信号画像，自行处理判断后调 Strategic Play 生成谋局建议。
                适合有自身判断逻辑的客户。
              </p>
              <CodeBlock code={`# Step 1: Decode
decoded = requests.post(
    "http://localhost:3109/api/engine/decode",
    json={...}
).json()

# Step 2: 自行处理判断...
# Step 3: Strategic Play
moves = requests.post(
    "http://localhost:3109/api/engine/strategic-play",
    json={...}
).json()`} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">模式 C：带目标的谋局</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                传入判断 + 赢单缺口 + 明确的谋局目标，Engine 按目标约束生成动作。
                适合有明确推进方向但需要排列优先级和生成话术。
              </p>
              <CodeBlock code={`# Python: snapshot → strategic play with goal
snap = requests.post(
    "http://localhost:3109/api/engine/judgment/snapshot",
    json={...}
).json()

moves = requests.post(
    "http://localhost:3109/api/engine/strategic-play",
    json={
        "tenantId": snap["tenantId"],
        "accountId": snap["accountId"],
        "playGoal": "三个月内推进到签单",
        "judgments": snap["judgments"],
        "winGaps": snap["winGaps"],
    }
).json()`} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">模式 D：仅用谋局</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                客户已有自己的 AI/pipeline 生成判断，只需要 Engine 的谋局能力。
              </p>
              <CodeBlock code={`# 已有判断，只需谋局
resp = requests.post(
    "http://localhost:3109/api/engine/strategic-play",
    json={
        "tenantId": "tenant_demo",
        "accountId": "acct_customer_a",
        "judgments": [...],
        "winGaps": [...],
    }
).json()
# → moves: Engine 推测最优方向`} />
            </div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <section className="mt-16 border-t border-slate-200 pt-8">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Closr Judgment Engine · P0 (v0.1)</span>
            <span className="text-slate-300">|</span>
            <span>衍生产品 · 独立部署</span>
          </div>
        </section>
      </div>
    </main>
  );
}
