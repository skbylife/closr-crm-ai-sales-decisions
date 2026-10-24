export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground mb-1">服务条款</h1>
      <p className="text-base text-muted mb-1">Terms of Service</p>
      <p className="text-sm text-muted mb-8">最后更新：2026 年 3 月 25 日</p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-secondary">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. 接受条款（Acceptance of Terms）</h2>
          <p>
            当您访问或使用 Closr（以下简称“本服务”）时，即表示您已阅读、理解并同意受本服务条款约束。
            若您代表某一组织使用本服务，则您声明并保证自己有权代表该组织接受本条款，并使该组织受其约束。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. 服务说明（Description of Service）</h2>
          <p>
            Closr 是面向 B2B 销售团队的 AI 驱动 CRM 平台，提供客户管理、销售流程跟踪、AI 驱动的沟通分析、联系人画像及销售情报等功能。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. 账户（Accounts）</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>您应提供真实、准确并保持更新的注册信息</li>
            <li>您有责任妥善保管账户凭证并维护账户安全</li>
            <li>企业计划中的管理员账户应启用 Two-Factor Authentication (2FA)</li>
            <li>如发现任何未经授权的访问或安全事件，您应立即通知我们</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. 数据所有权（Data Ownership）</h2>
          <p>
            <strong>您提交至 Closr 的数据归您或您的组织所有。</strong>
            我们不主张对您的客户数据、沟通内容或业务情报拥有所有权。
          </p>
          <p>
            为提供本服务，包括执行 AI 分析、生成洞察及完成相关处理流程，您授予我们一项有限、非独占的处理许可；该许可仅限于为提供本服务所必需的范围内使用。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. AI 生成内容（AI-Generated Content）</h2>
          <p>
            Closr 可能基于人工智能生成分析、摘要、建议或其他内容。该等 AI 生成内容按“现状”（as-is）提供，应作为辅助参考信息使用，而不应作为商业、法律或运营决策的唯一依据。
            我们不对 AI 生成内容的完整性、准确性或适用性作出保证。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. 可接受使用（Acceptable Use）</h2>
          <p>您同意不会：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>将本服务用于任何非法目的</li>
            <li>上传恶意内容、实施攻击或试图破坏平台安全</li>
            <li>反向工程、反编译或试图提取源代码</li>
            <li>超出合理范围使用 API 或滥用系统资源</li>
            <li>向未经授权的第三方共享账户凭证</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. 服务可用性（Service Availability）</h2>
          <p>
            我们以持续、稳定地提供本服务为目标，并计划在合理范围内提前告知预约维护安排。
            但对于因第三方服务提供商故障、网络中断、不可抗力或其他超出我们合理控制范围的原因导致的服务中断或不可用，我们不承担相应责任。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. 保密（Confidentiality）</h2>
          <p>
            我们将客户数据视为保密信息。仅在支持、维护或履行服务所必需的范围内，授权人员方可访问相关数据；相应访问行为将保留在审计记录中。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. 终止（Termination）</h2>
          <p>
            任一方均可通过提前 30 日书面通知终止本服务。服务终止后，您可在 30 日内导出相关数据；在该期限届满后，相关数据将被永久删除。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">10. 责任限制（Limitation of Liability）</h2>
          <p>
            在适用法律允许的最大范围内，Closr 不对因使用或无法使用本服务所引起的任何间接、附带、特殊或后果性损害承担责任。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">11. 适用法律（Governing Law）</h2>
          <p>本条款受美国特拉华州法律管辖，并依其解释。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">12. 联系方式（Contact）</h2>
          <p>
            如您对本条款有任何问题，请联系：
            <a href="mailto:example-9318e631b9@example.invalid" className="text-accent hover:underline">example-9318e631b9@example.invalid</a>
          </p>
        </section>
      </div>
    </div>
  );
}
