export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground mb-1">隐私政策</h1>
      <p className="text-base text-muted mb-1">Privacy Policy</p>
      <p className="text-sm text-muted mb-8">最后更新：2026 年 3 月 25 日</p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-secondary">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. 引言（Introduction）</h2>
          <p>
            Closr（以下简称“我们”）重视并尊重用户隐私。本隐私政策说明您在使用 Closr AI 驱动的 CRM 平台过程中，我们如何收集、使用、存储及保护相关信息。
            若您代表某一组织使用本服务，则您提交或管理的数据亦可能受本政策约束。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. 信息收集（Information We Collect）</h2>

          <h3 className="text-base font-medium text-foreground">2.1 账户信息（Account Information）</h3>
          <p>当您注册账户时，我们会收集电子邮箱地址、姓名、组织名称及职位信息，用于创建和管理账户。</p>

          <h3 className="text-base font-medium text-foreground">2.2 业务数据（Business Data）</h3>
          <p>您可在平台中录入客户账户、联系人、销售机会、沟通记录及业务情报等数据。该等数据用于支持平台核心功能，并归属于您的组织。</p>

          <h3 className="text-base font-medium text-foreground">2.3 邮件内容（Email Content）</h3>
          <p>当您将邮件转发至平台进行 AI 分析时，我们会处理相关邮件内容，以生成摘要、洞察或建议。相关内容将以加密方式存储，并仅向具有适当权限的用户开放访问。</p>

          <h3 className="text-base font-medium text-foreground">2.4 使用数据（Usage Data）</h3>
          <p>我们还会收集与服务使用情况有关的信息，例如页面访问、功能使用情况及性能指标，用于运营分析、故障排查与产品改进。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. 信息使用（How We Use Your Information）</h2>
          <p>我们基于提供、维护和改进服务的需要使用相关信息，包括但不限于：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>提供并维护 Closr 平台服务</li>
            <li>生成 AI 驱动的销售洞察、分析与建议</li>
            <li>优化产品功能、算法表现与使用体验</li>
            <li>发送与服务相关的通知、更新及安全提醒</li>
            <li>保障平台安全，并识别和防止欺诈或未经授权的访问</li>
          </ul>
          <p className="mt-2">
            <strong>我们不会：</strong>
            向第三方出售您的数据；使用您的业务数据训练通用 AI 模型；或在不同组织之间共享单个客户数据。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. 数据安全（Data Security）</h2>
          <p>我们采取合理的技术和管理措施，以保护平台中处理的数据安全，包括：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>通过 HTTPS / TLS 1.3 对传输中的数据进行加密</li>
            <li>对静态数据进行数据库层面的加密（AES-256）</li>
            <li>通过 Row-Level Security (RLS) 实现组织之间的数据隔离</li>
            <li>采用基于角色的访问控制（Owner / Admin / Manager / Member）</li>
            <li>支持 Two-Factor Authentication (2FA / MFA) 等附加安全措施</li>
            <li>对数据访问和关键变更保留审计日志</li>
          </ul>
          <p className="mt-2">尽管我们采取商业上合理的防护措施，但任何网络传输或存储系统均无法保证绝对安全。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. 数据保留与删除（Data Retention &amp; Deletion）</h2>
          <p>
            在您的账户保持活跃期间，我们通常会保留与服务提供相关的数据。若账户被删除或您提出删除请求，我们将在 30 日内永久删除相关数据。
            您也可在服务支持范围内通过 CSV 导出功能导出数据。
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. 第三方服务（Third-Party Services）</h2>
          <p>为运营和交付 Closr 服务，我们可能使用以下第三方服务提供商：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — 数据库与身份认证</li>
            <li><strong>Alibaba Cloud</strong> — 应用托管与基础设施</li>
            <li><strong>Google Gemini / DeepSeek</strong> — AI 处理（相关数据不用于模型训练）</li>
          </ul>
          <p className="mt-2">第三方服务的处理方式受其各自条款和隐私政策约束。</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. 您的权利（Your Rights）</h2>
          <p>在适用法律允许的范围内，您可以就您的数据提出以下请求：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>访问平台中与您相关的数据</li>
            <li>更正不准确或不完整的数据</li>
            <li>导出您可获取的数据副本</li>
            <li>删除账户及相关数据</li>
            <li>退订非必要的服务通信</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. 联系我们（Contact Us）</h2>
          <p>
            如您对本隐私政策或数据处理方式有任何疑问，请联系：
            <a href="mailto:example-015b41011c@example.invalid" className="text-accent hover:underline">example-015b41011c@example.invalid</a>
          </p>
        </section>
      </div>
    </div>
  );
}
