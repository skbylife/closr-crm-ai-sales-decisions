"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import { ConfirmationCard, type PendingAction } from "@/components/chat/ConfirmationCard";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "@/lib/toast-store";
import { appConfirm } from '@/lib/confirm-store';
import {
  Save,
  Download,
  Trash2,
  User,
  Info,
  Shield,
  Package,
  Upload,
  Wrench,
  Mail,
  Copy,
  Check,
  Palette,
  Languages,
  LogOut,
  Bell,
  Activity,
} from "lucide-react";

import { useStore } from "@/lib/store";
import MfaSection from "./mfa-section";
import PasswordSection from "./password-section";
import NotificationSection from "./notification-section";
import PipelineConfigSection from "./pipeline-config-section";
import IntegrationPanel from "@/components/integration/integration-panel";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateForwardAddress, getActualInboxAddress } from "@/lib/forward-address";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { useLocale, type Locale } from "@/lib/i18n";
import { resetAllTours } from "@/components/onboarding/SpotlightTour";
import type { ExportData } from "@/lib/store";
import { CURRENCY_LABELS, SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/format-currency";


const inputFieldClass = "form-input";
// 邮箱格式验证
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SettingsTab = "general" | "security" | "notifications" | "pipeline" | "data" | "ai" | "about";
type DemoSeedVariant = "seed-a" | "seed-b-retail";
type DemoSeedLocale = "zh" | "en";
const DEMO_SEED_VARIANT_STORAGE_KEY = "closr-demo-seed-variant";
const DEMO_SEED_LOCALE_STORAGE_KEY = "closr-demo-seed-locale";

const DEMO_SEED_OPTIONS: Array<{
  id: DemoSeedVariant;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
  badge: Record<Locale, string>;
}> = [
  {
    id: "seed-a",
    title: { zh: "Seed A · 标准 Demo", en: "Seed A · Standard Demo" },
    description: {
      zh: "3 个企业级场景，覆盖续约扩展、客户沉默、招投标推进，适合通用 Closr 演示。",
      en: "Three enterprise scenarios covering renewal expansion, customer silence, and RFP pursuit for the standard Closr demo.",
    },
    badge: { zh: "默认", en: "Default" },
  },
  {
    id: "seed-b-retail",
    title: { zh: "Seed B · 零售 Demo", en: "Seed B · Retail Demo" },
    description: {
      zh: "独立 3 客户零售版：突出真实机会、竞品锁定和高管判断。",
      en: "Separate three-account retail demo focused on live opportunities, competitor pressure, and executive judgment.",
    },
    badge: { zh: "零售", en: "Retail" },
  },
];

const SETTINGS_TABS: { key: SettingsTab; label: Record<Locale, string>; icon: typeof User }[] = [
  { key: "general", label: { zh: "通用", en: "General" }, icon: User },
  { key: "security", label: { zh: "安全", en: "Security" }, icon: Shield },
  { key: "notifications", label: { zh: "通知", en: "Notifications" }, icon: Bell },
  { key: "pipeline", label: { zh: "管线配置", en: "Pipeline" }, icon: Wrench },
  { key: "data", label: { zh: "数据", en: "Data" }, icon: Download },
  { key: "ai", label: { zh: "AI Usage", en: "AI Usage" }, icon: Activity },
  { key: "about", label: { zh: "关于", en: "About" }, icon: Info },
];




function EmailForwardingSection() {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const [copiedActual, setCopiedActual] = useState(false);
  const { user, isDemo } = useAuth();

  // Generate user-specific display address
  const displayAddress = user?.id
    ? generateForwardAddress(user.id)
    : isDemo
      ? "example-dd3492fb9f@example.invalid"
      : t("settings.loginToSeeAddress");

  // Actual inbox address (AgentMail) for current phase
  const actualAddress = getActualInboxAddress();

  async function handleCopy() {
    await navigator.clipboard.writeText(actualAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyDisplay() {
    await navigator.clipboard.writeText(displayAddress);
    setCopiedActual(true);
    setTimeout(() => setCopiedActual(false), 2000);
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Mail className="h-4 w-4 text-muted" />
        {t("settings.emailForwarding")}
      </h2>
      <p className="mb-3 text-xs text-muted">
        {t("settings.emailForwardingHint")}
      </p>

      <div className="space-y-3">
        {/* User-specific display address */}
        <div>
          <label className="form-label">你的专属转发地址</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5">
              <Mail className="mr-2 h-4 w-4 text-accent flex-shrink-0" />
              <span className="text-sm font-mono text-accent select-all">{displayAddress}</span>
            </div>
            <button
              onClick={handleCopyDisplay}
              disabled={!user && !isDemo}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                copiedActual
                  ? "bg-positive/10 text-positive border border-positive/20"
                  : "bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 disabled:opacity-40"
              }`}
            >
              {copiedActual ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </>
              )}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">🔮 未来版本将使用此地址自动识别你的身份</p>
        </div>

        {/* Actual forwarding address (AgentMail) */}
        <div>
          <label className="form-label">当前转发地址（临时）</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center rounded-lg border border-border bg-background px-3 py-2.5">
              <Mail className="mr-2 h-4 w-4 text-muted flex-shrink-0" />
              <span className="text-sm font-mono text-foreground select-all">{actualAddress}</span>
            </div>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                copied
                  ? "bg-positive/10 text-positive border border-positive/20"
                  : "bg-accent text-white hover:bg-accent-hover"
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </>
              )}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-accent/10 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent mb-1.5">使用方法</p>
          <ol className="text-xs text-secondary space-y-1 list-decimal list-inside">
            <li>复制上方「当前转发地址」</li>
            <li>在你的 Outlook / Gmail 中，将客户邮件转发到此地址</li>
            <li>前往「快速解读」页面，点击「检查新邮件」查看解读结果</li>
            <li>系统将自动识别原始发件人并匹配已有联系人</li>
          </ol>
        </div>

        <p className="text-xs text-muted">
          💡 提示：邮件内容仅用于 AI 分析，不会被第三方访问。
        </p>
      </div>
    </div>
  );
}

interface AIUsageMetricSummary {
  calls: number;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  errors: number;
  avgDurationMs: number | null;
}

interface AIUsageBreakdownRow extends AIUsageMetricSummary {
  key: string;
}

interface AIUsageLogRow {
  id: string;
  route: string | null;
  use_case: string | null;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  created_at: string;
}

interface AIUsageResponse {
  summary?: {
    windows?: { '24h'?: AIUsageMetricSummary };
    unattributed?: {
      last24h?: { route: number; useCase: number; user: number; account: number; opportunity: number };
    };
  };
  breakdowns?: {
    route?: AIUsageBreakdownRow[];
    use_case?: AIUsageBreakdownRow[];
    model?: AIUsageBreakdownRow[];
  };
  logs?: AIUsageLogRow[];
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US');
}

function formatDuration(ms: number | null | undefined) {
  if (typeof ms !== 'number') return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function AIUsageSection() {
  const [data, setData] = useState<AIUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadUsage() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/ai-usage?window=24h&limit=50', { cache: 'no-store' });
        if (!res.ok) {
          setError(res.status === 403 ? '仅 owner/admin 可查看 AI Usage。' : 'AI Usage 加载失败。');
          return;
        }
        const json = await res.json() as AIUsageResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('AI Usage 请求失败。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadUsage();
    return () => { cancelled = true; };
  }, []);

  const summary = data?.summary?.windows?.['24h'];
  const unattributed = data?.summary?.unattributed?.last24h;
  const topRoute = data?.breakdowns?.route?.[0];
  const topUseCase = data?.breakdowns?.use_case?.[0];
  const topModel = data?.breakdowns?.model?.[0];
  const recentLogs = data?.logs?.slice(0, 8) ?? [];

  const metrics = [
    { label: 'Calls', value: summary?.calls ?? 0 },
    { label: 'Errors', value: summary?.errors ?? 0 },
    { label: 'Token total', value: formatNumber(summary?.totalTokens ?? 0) },
    { label: 'Avg duration', value: formatDuration(summary?.avgDurationMs) },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card card-elevated p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="h-4 w-4 text-muted" />
          AI Usage（最近 24h）
        </h2>
        <p className="mb-4 text-xs text-muted">仅展示安全元数据聚合，不记录 prompt、completion、正文或 transcript。</p>

        {loading && <p className="text-sm text-muted">正在加载 AI 用量...</p>}
        {error && <p className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning">{error}</p>}

        {!loading && !error && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted">{m.label}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {[
                { label: 'Top route', row: topRoute },
                { label: 'Top use_case', row: topUseCase },
                { label: 'Top model', row: topModel },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted">{item.label}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">{item.row?.key ?? '—'}</p>
                  <p className="mt-1 text-xs text-muted">{item.row ? `${item.row.calls} calls · ${formatNumber(item.row.totalTokens)} tokens` : '暂无数据'}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <p className="text-xs font-medium text-secondary">最近调用 token 明细</p>
                <p className="text-[11px] text-muted">Prompt / Completion / Total</p>
              </div>
              {recentLogs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted">
                        <th className="px-3 py-2 font-medium">Use case</th>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="px-3 py-2 text-right font-medium">Prompt</th>
                        <th className="px-3 py-2 text-right font-medium">Completion</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                        <th className="px-3 py-2 text-right font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLogs.map((row) => (
                        <tr key={row.id} className="border-b border-border last:border-b-0">
                          <td className="max-w-[220px] truncate px-3 py-2 text-secondary">{row.use_case ?? row.route ?? 'unknown'}</td>
                          <td className="px-3 py-2 text-secondary">{row.model ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-foreground">{formatNumber(row.prompt_tokens)}</td>
                          <td className="px-3 py-2 text-right font-medium text-foreground">{formatNumber(row.completion_tokens)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-foreground">{formatNumber(row.total_tokens)}</td>
                          <td className="px-3 py-2 text-right text-secondary">{formatDuration(row.duration_ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-3 py-4 text-sm text-muted">暂无调用明细。</p>
              )}
            </div>

            <div className="mt-4 rounded-lg border border-border bg-background p-3">
              <p className="text-xs font-medium text-secondary">未归属日志数量（最近 24h）</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                <span>route: {unattributed?.route ?? 0}</span>
                <span>use_case: {unattributed?.useCase ?? 0}</span>
                <span>user: {unattributed?.user ?? 0}</span>
                <span>account: {unattributed?.account ?? 0}</span>
                <span>opportunity: {unattributed?.opportunity ?? 0}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface SelfHostedReadinessResponse {
  deployment?: { mode?: string; nodeEnv?: string; appVersion?: string | null };
  license?: { mode: string; plan: string; seats: number | null; seatsUsed?: number | null; modules: string[]; expiresAt: string | null };
  summary?: { overall: 'pass' | 'warn' | 'fail' | 'manual'; pass: number; warn: number; fail: number; manual: number };
  checks?: Array<{ id: string; phase: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'; label: string; status: 'pass' | 'warn' | 'fail' | 'manual'; detail: string; action?: string }>;
}

const READINESS_STATUS_LABEL: Record<string, string> = {
  pass: '通过',
  warn: '注意',
  fail: '失败',
  manual: '人工确认',
};

function CommercialReadinessSection({ accountCount, isDemo }: { accountCount: number; isDemo: boolean }) {
  const [readinessData, setReadinessData] = useState<SelfHostedReadinessResponse | null>(null);
  const [readinessError, setReadinessError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/self-hosted/readiness', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null) as SelfHostedReadinessResponse | { error?: string } | null;
        if (!res.ok) throw new Error((body && 'error' in body && body.error) || '私有化自检加载失败');
        return body as SelfHostedReadinessResponse;
      })
      .then((body) => {
        if (!cancelled) setReadinessData(body);
      })
      .catch((err) => {
        if (!cancelled) setReadinessError(err instanceof Error ? err.message : '私有化自检加载失败');
      });
    return () => { cancelled = true; };
  }, []);

  const readiness = [
    {
      label: '产品闭环',
      status: '已具备',
      detail: 'Dashboard 今日判断、账户证据、谋局执行和反馈校准已经有主链路。',
    },
    {
      label: '用量可观测',
      status: 'P0 可用',
      detail: 'AI 调用只记录安全元数据、token、耗时和错误，便于排查成本与异常。',
    },
    {
      label: '部署自检',
      status: readinessData?.summary ? READINESS_STATUS_LABEL[readinessData.summary.overall] : readinessError ? '需登录/权限' : '加载中',
      detail: readinessData?.summary
        ? `${readinessData.summary.pass} 通过 / ${readinessData.summary.warn} 注意 / ${readinessData.summary.fail} 失败 / ${readinessData.summary.manual} 人工确认`
        : readinessError || '正在读取私有化部署 readiness API。',
    },
    {
      label: '数据卫生',
      status: isDemo ? 'Demo 模式' : accountCount > 0 ? '已有真实数据' : '待初始化',
      detail: '示例数据、导入、导出和清理已经在数据页；下一步要让 demo/真实工作区边界更显性。',
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4 text-muted" />
            私有化交付稳定层 P0-P4
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            面向客户本地/私有化部署：重点是部署自检、权限硬化、内网运维和离线授权，不做 SaaS billing 优先。
          </p>
        </div>
        <a
          href="/audit/ai-usage"
          className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          查看 AI Usage Audit
        </a>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {readiness.map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">{item.label}</p>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">{item.status}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-semibold text-secondary">Self-hosted Phase Map</p>
        <div className="mt-2 grid gap-2 text-xs text-muted md:grid-cols-5">
          <p><span className="font-semibold text-foreground">P0</span>：可运营可诊断。</p>
          <p><span className="font-semibold text-foreground">P1</span>：部署与环境自检。</p>
          <p><span className="font-semibold text-foreground">P2</span>：权限与数据边界硬化。</p>
          <p><span className="font-semibold text-foreground">P3</span>：备份、恢复、迁移、日志导出。</p>
          <p><span className="font-semibold text-foreground">P4</span>：离线 license / entitlement。</p>
        </div>
      </div>

      {readinessData?.checks && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-secondary">部署自检清单</p>
            <p className="text-[11px] text-muted">
              {readinessData.deployment?.mode ?? 'self-hosted'} · {readinessData.license?.mode ?? 'license-unconfigured'}
              {typeof readinessData.license?.seatsUsed === 'number' ? ` · seats ${readinessData.license.seatsUsed}/${readinessData.license.seats ?? '∞'}` : ''}
            </p>
          </div>
          <div className="divide-y divide-border">
            {readinessData.checks.slice(0, 12).map((check) => {
              const tone = check.status === 'fail' ? 'text-danger' : check.status === 'warn' ? 'text-warning' : check.status === 'pass' ? 'text-positive' : 'text-muted';
              return (
                <div key={check.id} className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[56px_120px_1fr]">
                  <span className="font-semibold text-accent">{check.phase}</span>
                  <span className={`font-semibold ${tone}`}>{READINESS_STATUS_LABEL[check.status]}</span>
                  <div>
                    <p className="font-medium text-foreground">{check.label}</p>
                    <p className="mt-0.5 text-muted">{check.detail}</p>
                    {check.action && <p className="mt-0.5 text-secondary">动作：{check.action}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPageInner() {
  const [name, setName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [demoSeedVariant, setDemoSeedVariant] = useState<DemoSeedVariant>(() => {
    if (typeof window === "undefined") return "seed-a";
    const saved = window.localStorage.getItem(DEMO_SEED_VARIANT_STORAGE_KEY);
    return saved === "seed-b-retail" ? "seed-b-retail" : "seed-a";
  });
  const [seedBPassword, setSeedBPassword] = useState("");
  const [clearLoading, setClearLoading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingAction[] | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmStatusMessage, setConfirmStatusMessage] = useState("");
  const [confirmErrorMessage, setConfirmErrorMessage] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [tourReset, setTourReset] = useState(false);
  const accounts = useStore((s) => s.accounts);

  // Theme & Locale
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [demoSeedLocale, setDemoSeedLocale] = useState<DemoSeedLocale>(() => {
    if (typeof window === "undefined") return locale;
    const saved = window.localStorage.getItem(DEMO_SEED_LOCALE_STORAGE_KEY);
    return saved === "zh" || saved === "en" ? saved : locale;
  });
  const demoSeedOptions = DEMO_SEED_OPTIONS.map((option) => ({
    id: option.id,
    title: option.title[locale],
    description: option.description[locale],
    badge: option.badge[locale],
  }));
  const { isDemo, isLoading: authLoading, signOut, exitDemo, jobTitle: roleLevel, jobLevel, setJobLevel, orgId, orgRole, refreshOrg } = useAuth();
  const canManageOrgData = orgRole === "owner";
  const demoSeedLocaleOptions: Array<{ id: DemoSeedLocale; title: string; description: string }> = [
    {
      id: "zh",
      title: locale === "en" ? "Chinese seed" : "中文 Seed",
      description: locale === "en" ? "Load the original Chinese demo dataset." : "导入原始中文版演示数据。",
    },
    {
      id: "en",
      title: locale === "en" ? "English seed" : "英文 Seed",
      description: locale === "en" ? "Load the customer-ready English demo dataset." : "导入客户可用的英文版演示数据。",
    },
  ];


  const { exportData, importData, addAccount, addContact, currencyCode, setCurrencyCode } = useStore();
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");

  const userSettings = useStore((s) => s.userSettings);

  // ── OAuth redirect: consume integration query params and show toast ──
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const integration = searchParams.get("integration");
    if (!integration) return;
    if (integration === "success") {
      toast("邮箱对接成功！", "success");
    } else if (integration === "error") {
      const msg = searchParams.get("message") ?? "unknown";
      toast(`邮箱对接失败：${msg}`, "error");
    }
    // Strip query params to prevent re-triggering on re-render
    router.replace("/settings", { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    setName(userSettings.displayName);
    setCompanyDomain(userSettings.companyDomain);
    setEmail(userSettings.email);
    setRole(userSettings.roleDescription);
  }, [userSettings]);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  function showSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const setUserSettings = useStore((s) => s.setUserSettings);

  function handleSaveProfile() {
    // 邮箱格式校验
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
      setEmailError("请输入有效的邮箱地址");
      return;
    }
    setUserSettings({
      displayName: name,
      companyDomain,
      email,
      roleDescription: role,
    });
    showSaved();
  }

  async function handleChangePassword() {
    setPwdError("");
    setPwdSuccess("");
    const PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!PWD_REGEX.test(newPassword)) {
      setPwdError("密码需至少8位，包含大写字母、小写字母和数字");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("两次输入的密码不一致");
      return;
    }
    setPwdLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwdError("密码修改失败，请稍后重试");
      } else {
        setPwdSuccess("密码修改成功");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwdSuccess(""), 3000);
      }
    } catch {
      setPwdError("网络错误，请稍后重试");
    } finally {
      setPwdLoading(false);
    }
  }


  function handleExportJSON() {
    const data = exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `closr-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCSV() {
    const allAccounts = useStore.getState().accounts;
    const BOM = "\uFEFF";
    const header = "客户名称,行业,联系人姓名,职位,角色,邮箱,电话,微信,LinkedIn";
    const rows: string[] = [header];
    for (const acct of allAccounts) {
      for (const c of acct.contacts) {
        const fields = [
          acct.name,
          acct.industry ?? "",
          c.name,
          c.title ?? "",
          c.role ?? "",
          c.email ?? "",
          c.phone ?? "",
          c.wechat ?? "",
          c.linkedin ?? "",
        ].map((f) => `"${String(f).replace(/"/g, '""')}"`);
        rows.push(fields.join(","));
      }
    }
    const blob = new Blob([BOM + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `closr-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportJSON(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData;
        if (!data || typeof data !== "object") throw new Error("invalid");
        const accountCount = data.accounts?.length ?? 0;
        const contactCount = (data.accounts ?? []).reduce((sum, a) => sum + (a.contacts?.length ?? 0), 0);
        if (!await appConfirm({ message: `将导入 ${accountCount} 个客户、${contactCount} 个联系人，确认？`, variant: 'warning' })) return;
        importData(data);
        setImportMessage(`已导入 ${accountCount} 个客户、${contactCount} 个联系人`);
        setTimeout(() => setImportMessage(""), 4000);
      } catch {
        setImportMessage("JSON 格式无效，请检查文件");
        setTimeout(() => setImportMessage(""), 4000);
      }
    };
    reader.readAsText(file);
  }

  function handleImportCSV(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string;
        // Strip UTF-8 BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) { setImportMessage("CSV 文件为空"); setTimeout(() => setImportMessage(""), 4000); return; }

        // Parse CSV line handling quoted fields
        function parseLine(line: string): string[] {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
              if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
              else if (ch === '"') { inQuotes = false; }
              else { current += ch; }
            } else {
              if (ch === '"') { inQuotes = true; }
              else if (ch === ',') { result.push(current); current = ""; }
              else { current += ch; }
            }
          }
          result.push(current);
          return result;
        }

        const existingAccounts = useStore.getState().accounts;
        const accountMap = new Map<string, string>(); // name -> id
        for (const a of existingAccounts) accountMap.set(a.name, a.id);

        let newAccounts = 0;
        let newContacts = 0;
        // Skip header
        for (let i = 1; i < lines.length; i++) {
          const cols = parseLine(lines[i]);
          const accountName = cols[0]?.trim();
          if (!accountName) continue;

          let accountId = accountMap.get(accountName);
          if (!accountId) {
            accountId = addAccount({ name: accountName, industry: cols[1]?.trim() || undefined });
            accountMap.set(accountName, accountId);
            newAccounts++;
          }

          const contactName = cols[2]?.trim();
          if (contactName) {
            addContact(accountId, {
              name: contactName,
              title: cols[3]?.trim() || undefined,
              role: (cols[4]?.trim() as import("@/lib/babel-engine/types").ContactRole) || undefined,
              email: cols[5]?.trim() || "",
              phone: cols[6]?.trim() || undefined,
              wechat: cols[7]?.trim() || undefined,
              linkedin: cols[8]?.trim() || undefined,
            });
            newContacts++;
          }
        }

        setImportMessage(`已导入 ${newAccounts} 个新客户、${newContacts} 个联系人`);
        setTimeout(() => setImportMessage(""), 4000);
      } catch {
        setImportMessage("CSV 解析失败，请检查文件格式");
        setTimeout(() => setImportMessage(""), 4000);
      }
    };
    reader.readAsText(file);
  }

  async function handleClearData() {
    setConfirmErrorMessage("");
    setConfirmStatusMessage("");
    setPendingConfirm([
      {
        toolName: 'clear-data',
        displayName: '清除全部数据',
        requiresConfirmation: true,
        fields: [
          {
            field: '操作',
            value: '清除当前账号全部数据',
            confidence: 'explicit',
            source_quote: '确定要清除所有数据吗？此操作不可恢复。',
          },
        ],
      },
    ]);
  }

  async function executeClearData() {
    setConfirmBusy(true);
    setConfirmErrorMessage("");
    setConfirmStatusMessage("正在清除数据，请稍候...");
    setClearLoading(true);
    try {
      const res = await fetch("/api/seed-data", { method: "DELETE" });
      if (!res.ok) {
        setConfirmErrorMessage("清除失败，请稍后重试");
        return;
      }
      localStorage.removeItem("closr-store");
      setCleared(true);
      setConfirmStatusMessage("数据已清除，页面即将刷新...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setConfirmErrorMessage("清除失败，请检查网络后重试");
    } finally {
      setClearLoading(false);
      setConfirmBusy(false);
    }
  }

  function confirmLoadSample() {
    setConfirmErrorMessage("");
    setConfirmStatusMessage("");
    if (demoSeedVariant === "seed-b-retail" && seedBPassword.trim() !== "EXAMPLE_ONLY_NOT_A_PASSWORD") {
      setConfirmErrorMessage(locale === "en" ? "Seed B Retail Demo requires the correct password." : "加载 Seed B 零售 Demo 需要输入正确密码。");
      return;
    }
    const selectedSeed = demoSeedOptions.find((option) => option.id === demoSeedVariant);
    const selectedSeedLocale = demoSeedLocaleOptions.find((option) => option.id === demoSeedLocale);
    setPendingConfirm([
      {
        toolName: 'load-sample',
        displayName: locale === "en" ? `Load sample data · ${selectedSeed?.badge ?? 'Demo'} · ${selectedSeedLocale?.title ?? 'Seed language'}` : `加载示例数据 · ${selectedSeed?.badge ?? 'Demo'} · ${selectedSeedLocale?.title ?? 'Seed 语言'}`,
        requiresConfirmation: true,
        fields: [
          {
            field: locale === "en" ? "Action" : "操作",
            value: accounts.length > 0
              ? (locale === "en" ? `Replace current data and rebuild ${selectedSeed?.title ?? 'Demo Seed'}` : `覆盖当前数据并重建 ${selectedSeed?.title ?? 'Demo Seed'}`)
              : (locale === "en" ? `Initialize ${selectedSeed?.title ?? 'Demo Seed'}` : `初始化 ${selectedSeed?.title ?? 'Demo Seed'}`),
            confidence: 'explicit',
            source_quote: accounts.length > 0
              ? (locale === "en" ? 'Current data exists. Loading sample data will replace it. Continue?' : '当前已有数据，加载示例数据将覆盖现有数据。确定继续？')
              : selectedSeed?.description ?? (locale === "en" ? 'Load sample data' : '加载示例数据'),
          },
          {
            field: locale === "en" ? "Seed language" : "Seed 语言",
            value: selectedSeedLocale?.title ?? demoSeedLocale,
            confidence: 'explicit',
            source_quote: selectedSeedLocale?.description ?? demoSeedLocale,
          },
        ],
      },
    ]);
  }

  async function executeLoadSample() {
    setConfirmBusy(true);
    setConfirmErrorMessage("");
    setConfirmStatusMessage(locale === "en" ? "Initializing sample data. Please wait..." : "正在初始化示例数据，请稍候...");
    setSeedLoading(true);
    try {
      const res = await fetch("/api/seed-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant: demoSeedVariant, seedPassword: seedBPassword.trim(), seedLocale: demoSeedLocale }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setConfirmErrorMessage(body?.error ?? (locale === "en" ? "Load failed. Please try again later." : "加载失败，请稍后重试"));
        return;
      }
      setSampleLoaded(true);
      localStorage.setItem(DEMO_SEED_VARIANT_STORAGE_KEY, demoSeedVariant);
      localStorage.setItem(DEMO_SEED_LOCALE_STORAGE_KEY, demoSeedLocale);
      localStorage.removeItem("closr-store");
      setConfirmStatusMessage(locale === "en" ? "Sample data loaded. The page will refresh shortly..." : "示例数据已加载，页面即将刷新...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setConfirmErrorMessage(locale === "en" ? "Load failed. Check the network and try again." : "加载失败，请检查网络后重试");
    } finally {
      setSeedLoading(false);
      setConfirmBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-6">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded-lg bg-sidebar animate-pulse" />
          <div className="h-3 w-48 rounded-lg bg-sidebar animate-pulse" />
        </div>
        <div className="h-10 w-full rounded-lg bg-sidebar animate-pulse" />
        <div className="h-64 w-full rounded-xl bg-sidebar animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("settings.title")}</h1>
        <p className="mt-0.5 text-sm text-secondary">{t("settings.subtitle")}</p>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-border flex-nowrap scrollbar-hide">
        {SETTINGS_TABS.map((tab, idx) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative border-b-2 px-5 py-3 text-sm transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
              idx < SETTINGS_TABS.length - 1 ? "border-r border-r-border" : ""
            } ${
              activeTab === tab.key
                ? "border-b-accent text-accent font-bold"
                : "border-b-transparent text-secondary font-medium hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label[locale]}
          </button>
        ))}
      </div>

      {/* ── Tab: 通用 ── */}
      {activeTab === "general" && (
        <>
          {/* Personal Info */}
          <div className="rounded-xl border border-border bg-card card-elevated p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <User className="h-4 w-4 text-muted" />
              {locale === "en" ? "Personal Information" : "个人信息"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="form-label">{t("settings.name")}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={locale === "en" ? "Your name" : "你的姓名"} className={inputFieldClass} />
              </div>
              <div>
                <label className="form-label">{t("settings.email")}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  placeholder="example-652740e1be@example.invalid"
                  className={`${inputFieldClass} ${emailError ? "border-danger" : ""}`}
                />
                {emailError && <p className="text-xs text-danger mt-1">{emailError}</p>}
              </div>
              <div>
                <label className="form-label">{t("settings.roleDescription")}</label>
                <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder={locale === "en" ? "Example: Account Executive, Sales Director" : "例如：客户经理、销售总监"} className={inputFieldClass} />
              </div>
              <button onClick={handleSaveProfile} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover">
                <Save className="h-3.5 w-3.5" />
                {t("settings.save")}
              </button>
            </div>
          </div>

          {/* Theme */}
          <div className="rounded-xl border border-border bg-card card-elevated p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Palette className="h-4 w-4 text-muted" />
              {t("settings.theme")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(["light", "dark", "system"] as ThemeMode[]).map((m) => {
                const labels: Record<ThemeMode, string> = { light: t("settings.themeLight"), dark: t("settings.themeDark"), system: t("settings.themeSystem") };
                return (
                  <button key={m} onClick={() => setThemeMode(m)} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${themeMode === m ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-sidebar hover:text-foreground"}`}>
                    {m === "light" ? "☀️" : m === "dark" ? "🌙" : "💻"} {labels[m]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language */}
          <div className="rounded-xl border border-border bg-card card-elevated p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Languages className="h-4 w-4 text-muted" />
              {t("settings.language")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(["zh", "en"] as Locale[]).map((l) => {
                const labels: Record<Locale, string> = { zh: locale === "en" ? "🇨🇳 Chinese" : "🇨🇳 中文", en: "🇺🇸 English" };
                return (
                  <button key={l} onClick={() => setLocale(l)} className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${locale === l ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-sidebar hover:text-foreground"}`}>
                    {labels[l]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency */}
          <div className="rounded-xl border border-border bg-card card-elevated p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Languages className="h-4 w-4 text-muted" />
              {locale === "en" ? "Currency" : "币种"}
            </h2>
            <p className="mb-3 text-xs text-muted">{locale === "en" ? "Choose the default currency for amounts displayed in the system" : "选择系统中金额显示的默认币种"}</p>
            <select className="form-input w-64" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value as CurrencyCode)}>
              {SUPPORTED_CURRENCIES.map((code) => {
                const label = CURRENCY_LABELS[code];
                return (
                  <option key={code} value={code}>
                    {label.symbol} {locale === "en" ? label.en : label.zh} ({code})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tour Reset */}
          <div className="rounded-xl border border-border bg-card card-elevated p-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Info className="h-4 w-4 text-muted" />
              {locale === "en" ? "Product Tour" : "功能引导"}
            </h2>
            <p className="mb-3 text-xs text-muted">
              {locale === "en" ? "Replay the interactive product tour and review Closr core capabilities." : "重新体验各页面的交互式功能引导，了解 Closr 的核心功能。"}
            </p>
            <button
              onClick={() => {
                resetAllTours();
                setTourReset(true);
                setTimeout(() => {
                  window.location.href = "/horizon";
                }, 800);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              {tourReset ? (locale === "en" ? "Redirecting..." : "即将跳转...") : (locale === "en" ? "Replay Product Tour" : "重新体验功能引导")}
            </button>
            {tourReset && (
              <p className="mt-2 text-xs text-accent">{locale === "en" ? "Tour reset. Redirecting to home..." : "引导已重置，正在跳转到首页..."}</p>
            )}
          </div>
        </>
      )}

      {/* ── Tab: 安全 ── */}
      {activeTab === "security" && (
        <>
          <PasswordSection />
          <MfaSection />
        </>
      )}

      {/* ── Tab: 通知 ── */}
      {activeTab === "notifications" && <NotificationSection />}

      {/* ── Tab: 管线配置 ── */}
      {activeTab === "pipeline" && (
        <>
          <PipelineConfigSection />
          {orgId && <IntegrationPanel orgId={orgId} />}
        </>
      )}

      {/* ── Tab: 数据 ── */}
      {activeTab === "data" && (
        <div className="rounded-xl border border-border bg-card card-elevated p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Download className="h-4 w-4 text-muted" />
            {t("settings.dataManagement")}
          </h2>

          {/* Export */}
          <p className="mb-2 text-xs font-medium text-secondary">{t("settings.export")}</p>
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <button onClick={handleExportJSON} className="flex items-center gap-1.5 rounded-lg border border-accent px-5 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/5">
                <Download className="h-3.5 w-3.5" />
                {t("settings.exportJSON")}
              </button>
              <p className="mt-1 text-xs text-muted">{t("settings.exportJSONHint")}</p>
            </div>
            <div>
              <button onClick={handleExportCSV} className="flex items-center gap-1.5 rounded-lg border border-accent px-5 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/5">
                <Download className="h-3.5 w-3.5" />
                {t("settings.exportCSV")}
              </button>
              <p className="mt-1 text-xs text-muted">{t("settings.exportCSVHint")}</p>
            </div>
          </div>

          {/* Import */}
          <p className="mb-2 text-xs font-medium text-secondary">{t("settings.import")}</p>
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <button onClick={() => jsonImportRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-sidebar">
                <Upload className="h-3.5 w-3.5" />
                {t("settings.importJSON")}
              </button>
              <p className="mt-1 text-xs text-muted">{t("settings.importJSONHint")}</p>
              <input ref={jsonImportRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportJSON(f); e.target.value = ""; }} />
            </div>
            <div>
              <button onClick={() => csvImportRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-sidebar">
                <Upload className="h-3.5 w-3.5" />
                {t("settings.importCSV")}
              </button>
              <p className="mt-1 text-xs text-muted">{t("settings.importCSVHint")}</p>
              <input ref={csvImportRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); e.target.value = ""; }} />
            </div>
          </div>

          {importMessage && <p className="mb-3 text-xs text-accent font-medium">{importMessage}</p>}

          <div className={`${canManageOrgData ? "mb-4" : "hidden"} rounded-lg border border-border bg-background/60 p-3`}>
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 text-muted" />
              <div>
                <p className="text-xs font-semibold text-foreground">Demo Seed</p>
                <p className="text-xs text-muted">
                  {locale === "en" ? "Choose which sample data set and language to load. Loading will replace the current demo data." : "选择要加载的演示数据版本和语言；加载会覆盖当前 demo 数据。"}
                </p>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {demoSeedOptions.map((option) => {
                const selected = demoSeedVariant === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={seedLoading}
                    onClick={() => setDemoSeedVariant(option.id)}
                    className={`min-h-[104px] rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-card text-secondary hover:border-accent/30 hover:bg-accent/5"
                    } disabled:opacity-50`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{option.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${selected ? "bg-accent text-white" : "bg-sidebar text-muted"}`}>
                        {option.badge}
                      </span>
                    </div>
                    <p className="text-xs leading-5 text-muted">{option.description}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-xs font-semibold text-foreground">{locale === "en" ? "Seed language" : "Seed 语言"}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {demoSeedLocaleOptions.map((option) => {
                  const selected = demoSeedLocale === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={seedLoading}
                      onClick={() => setDemoSeedLocale(option.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-border bg-background text-secondary hover:border-accent/30 hover:bg-accent/5"
                      } disabled:opacity-50`}
                    >
                      <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">{option.description}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                {locale === "en"
                  ? "This controls the language of UI-facing seed content, AI analysis fixtures, and sample records at import time."
                  : "这里控制导入时 UI 可见 seed 内容、AI 分析样例和示例记录的语言。"}
              </p>
            </div>
            {demoSeedVariant === "seed-b-retail" && (
              <div className="mt-3 rounded-lg border border-warning/25 bg-warning/[0.06] p-3">
                <label htmlFor="seed-b-password" className="text-xs font-semibold text-foreground">
                  {locale === "en" ? "Seed B Retail Demo password" : "Seed B 零售 Demo 密码"}
                </label>
                <input
                  id="seed-b-password"
                  type="password"
                  value={seedBPassword}
                  onChange={(event) => {
                    setSeedBPassword(event.target.value);
                    if (confirmErrorMessage) setConfirmErrorMessage("");
                  }}
                  placeholder={locale === "en" ? "Enter password to load Seed B" : "输入密码后加载 Seed B"}
                  autoComplete="off"
                  className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
                />
                <p className="mt-1.5 text-xs text-muted">
                  {locale === "en" ? "Enter the correct password before replacing current demo data with the retail sample." : "只有输入正确密码后，才能覆盖当前 demo 数据并加载零售版样例。"}
                </p>
              </div>
            )}
          </div>

          {/* Other actions */}
          <div className="flex flex-wrap gap-3 border-t border-border pt-4">
            {!canManageOrgData && (
              <p className="text-xs leading-6 text-muted">
                {locale === "en"
                  ? "Demo seed reset and destructive data clearing are restricted to the organization owner."
                  : "Demo Seed 重置和清除全部数据仅限组织 Owner 操作。"}
              </p>
            )}
            <button
              disabled={seedLoading}
              onClick={confirmLoadSample}
              className={`${canManageOrgData ? "flex" : "hidden"} items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-5 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50`}
            >
              {seedLoading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              ) : (
                <Package className="h-3.5 w-3.5" />
              )}
              {seedLoading ? "正在加载..." : t("settings.loadSample")}
            </button>
            <button disabled={clearLoading} onClick={handleClearData} className={`${canManageOrgData ? "flex" : "hidden"} items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-5 py-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50`}>
              {clearLoading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-danger border-t-transparent" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {clearLoading ? "正在清除..." : t("settings.clearAll")}
            </button>
          </div>
          {sampleLoaded && <p className="mt-2 text-xs text-accent">{locale === "en" ? "Sample data loaded. The page will refresh shortly..." : "示例数据已加载，页面即将刷新..."}</p>}
          {cleared && <p className="mt-2 text-xs text-danger">数据已清除，页面即将刷新...</p>}
          {confirmErrorMessage && !pendingConfirm && <p className="mt-2 text-xs font-medium text-danger">{confirmErrorMessage}</p>}
        </div>
      )}

      {/* ── Tab: AI Usage ── */}
      {activeTab === "ai" && (
        <>
          <CommercialReadinessSection accountCount={accounts.length} isDemo={isDemo} />
          <AIUsageSection />
        </>
      )}

      {/* ── Tab: 关于 ── */}
      {activeTab === "about" && (
        <div className="rounded-xl border border-border bg-card card-elevated p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Info className="h-4 w-4 text-muted" />
            {t("settings.about")}
          </h2>
          <div className="space-y-1 text-sm text-muted">
            <p>版本：<span className="font-semibold text-foreground">PALLAS</span></p>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={() => { if (isDemo) { exitDemo(); } else { signOut(); } }}
              className="flex items-center gap-2 rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/5 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {isDemo ? "退出 Demo" : "退出登录"}
            </button>
          </div>
        </div>
      )}

      {pendingConfirm && isMounted && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50">
          <div className="flex min-h-dvh items-center justify-center px-4 py-6">
            <div className="w-full max-w-xl">
              <ConfirmationCard
                actions={pendingConfirm}
                onCancel={() => {
                  if (confirmBusy) return;
                  setPendingConfirm(null);
                  setConfirmErrorMessage("");
                  setConfirmStatusMessage("");
                }}
                onModify={() => {}}
                onConfirm={(actions) => {
                  const action = actions[0]?.toolName;
                  if (action === 'clear-data') {
                    void executeClearData();
                  } else if (action === 'load-sample') {
                    void executeLoadSample();
                  }
                }}
                isConfirming={confirmBusy}
                confirmingLabel="处理中..."
                statusMessage={confirmStatusMessage}
                errorMessage={confirmErrorMessage}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Toast */}
      <div
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-positive/20 bg-positive/10 px-4 py-2.5 text-sm font-medium text-positive shadow-lg backdrop-blur-sm transition-colors duration-250 ${
          saved ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 pointer-events-none"
        }`}
      >
        <Check className="h-4 w-4" />
        {t("settings.saved")}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
