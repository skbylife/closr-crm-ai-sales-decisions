'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Loader2, Eye, EyeOff, ArrowRight, Sparkles, Headset } from 'lucide-react';
import { ClosrLogo } from '@/components/ui/closr-logo';
import { createClient } from '@/lib/supabase/client';
import { isNativeDatabase } from '@/lib/database-backend';
import { recordAuthAuditEvent } from '@/lib/auth-audit-client';

const LOGIN_COPY = {
  zh: {
    switchLabel: 'EN',
    headline: ['读懂客户', '谋定而动', '赢下订单'],
    mobileHeadline: '读懂客户，谋定而动，赢下订单',
    subhead: 'B2B 销售情报智能应用',
    desc: '整合 CRM、邮件、IM、会议录音等全渠道客户沟通。Closr 解读客户真实意图，分析利益相关方图谱，谋划多步推进策略，让每一步都踩在客户的决策节奏上。',
    welcome: '欢迎回来',
    welcomeDesc: '登录 Closr 继续使用',
    email: '邮箱',
    password: '密码',
    passwordPlaceholder: '输入密码',
    forgot: '忘记密码？',
    login: '登录',
    loggingIn: '登录中...',
    noAccount: '需要开通团队账号？',
    register: '联系销售团队',
    consentPrefix: '登录即表示同意',
    terms: '服务条款',
    and: '和',
    privacy: '隐私政策',
    or: '或者',
    demo: '体验 Demo',
    demoPrompt: '请输入访问密码以进入演示环境。',
    accessPassword: '访问密码',
    cancel: '取消',
    enter: '进入',
  },
  en: {
    switchLabel: '中文',
    headline: ['Read the customer', 'Plan the move', 'Win the deal'],
    mobileHeadline: 'Read the customer. Plan the move. Win the deal.',
    subhead: 'B2B Sales Judgment System',
    desc: 'Closr unifies CRM notes, email, IM, and meeting signals into transparent account judgment, stakeholder maps, evidence trace, and strategic plays.',
    welcome: 'Welcome back',
    welcomeDesc: 'Log in to continue using Closr',
    email: 'Email',
    password: 'Password',
    passwordPlaceholder: 'Enter password',
    forgot: 'Forgot password?',
    login: 'Log in',
    loggingIn: 'Logging in...',
    noAccount: 'Need a team account?',
    register: 'Contact sales',
    consentPrefix: 'By logging in, you agree to the',
    terms: 'Terms',
    and: 'and',
    privacy: 'Privacy Policy',
    or: 'or',
    demo: 'View Demo',
    demoPrompt: 'Enter the access password to open the demo workspace.',
    accessPassword: 'Access password',
    cancel: 'Cancel',
    enter: 'Enter',
  },
} as const;

export default function LoginPage() {
  const searchParams = useSearchParams();
  const locale = searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const invitationToken = searchParams.get('invitation');
  const shouldOpenDemo = searchParams.get('demo') === 'true';
  const copy = LOGIN_COPY[locale];
  const alternateParams = new URLSearchParams(searchParams.toString());
  alternateParams.set('lang', locale === 'zh' ? 'en' : 'zh');
  const alternateLanguageHref = `/login?${alternateParams.toString()}`;
  const demoParams = new URLSearchParams(searchParams.toString());
  demoParams.set('demo', 'true');
  const demoHref = `/login?${demoParams.toString()}`;
  const registerParams = new URLSearchParams();
  if (locale === 'en') registerParams.set('lang', 'en');
  if (invitationToken) registerParams.set('invitation', invitationToken);
  const registerHref = `/register${registerParams.toString() ? `?${registerParams.toString()}` : ''}`;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  useEffect(() => {
    if (!isNativeDatabase()) return;
    fetch('/api/native/auth/setup-status').then(r => r.json()).then(status => { if (status.setupRequired) window.location.replace('/setup'); }).catch(() => {});
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(searchParams.get('error') === 'auth_callback_failed' ? '认证失败，请重试' : '');
  const [loading, setLoading] = useState(false);
  const [demoAccessInput, setDemoAccessInput] = useState('');
  const [demoAccessError, setDemoAccessError] = useState('');
  const demoAccessInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const credentials = { email, password, ...(isNativeDatabase() ? { totpCode } : {}) };
      const { error: authError } = await supabase.auth.signInWithPassword(credentials);

      if (authError) {
        if (authError.code === 'mfa_required' || authError.code === 'invalid_totp') {
          setNeedsMfa(true);
          setError(locale === 'en' ? 'Enter the current code from your authenticator.' : '请输入验证器中的当前动态验证码。');
          return;
        }
        console.error('[login] Auth error:', authError.message);
        if (authError.message.includes('Invalid login credentials')) {
          setError('邮箱或密码错误');
        } else if (authError.message.includes('Email not confirmed')) {
          setError('请先验证邮箱');
        } else {
          setError('登录失败，请稍后重试');
        }
        return;
      }

      await recordAuthAuditEvent('login_success', { email });
      localStorage.setItem('closr-locale', locale);

      // Accept invitation if present
      if (invitationToken) {
        try {
          await fetch('/api/invite/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: invitationToken }),
          });
        } catch {
          // Non-blocking — user can accept later
        }
      }

      window.location.href = '/horizon';
      return;
    } catch {
      setError('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const readJson = async (res: Response) => {
    return res.json().catch(() => ({})) as Promise<Record<string, unknown>>;
  };

  const handleDemo = async (accessPassword?: string) => {
    setError('');
    setLoading(true);
    try {
      const passwordToVerify = (accessPassword ?? demoAccessInput).trim();
      // Server-side login: requires access password proof
      const res = await fetch('/api/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accessPassword: passwordToVerify }),
      });
      const data = await readJson(res);
      if (!res.ok || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') {
        setError(typeof data.error === 'string' ? data.error : 'Demo 登录失败，请稍后重试');
        return;
      }
      // Inject session into Supabase client
      const supabase = createClient();
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionErr) {
        console.warn('[demo-login] browser setSession skipped:', sessionErr.message);
      } else {
        await supabase.auth.getSession().catch((err) => {
          console.warn('[demo-login] browser getSession skipped:', err instanceof Error ? err.message : err);
        });
      }
      await recordAuthAuditEvent('demo_login_success', { email: 'example-c39293aa15@example.invalid' });
      // Set demo cookie so middleware and UI can detect demo mode
      document.cookie = 'closr-demo-mode=true; path=/; max-age=86400';
      localStorage.setItem('closr-locale', locale);

      window.location.href = '/horizon';
      return;
    } catch {
      setError('Demo 登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const verifyDemoAccess = async (candidatePassword?: string) => {
    const fallbackPassword = demoAccessInput || demoAccessInputRef.current?.value || '';
    const passwordToVerify = (candidatePassword ?? fallbackPassword).trim();
    setDemoAccessError('');
    setError('');
    if (!passwordToVerify) {
      setDemoAccessError('请输入访问密码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/verify-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: passwordToVerify }),
      });
      const data = await readJson(res);
      if (res.ok && data.ok) {
        await handleDemo(passwordToVerify);
      } else {
        setDemoAccessError(typeof data.error === 'string' ? data.error : '密码错误，请重试');
      }
    } catch {
      setDemoAccessError('验证失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Link
        href={alternateLanguageHref}
        className="fixed right-4 top-4 z-10 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-secondary shadow-sm transition-colors hover:border-accent/40 hover:text-accent"
        aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
      >
        {copy.switchLabel}
      </Link>

      {/* Left — Brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 xl:px-24 bg-[var(--chrome-bg)]">
        <div className="mb-12">
          <ClosrLogo size="xl" variant="dark" />
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl xl:text-6xl">
          {copy.headline[0]}
          <br />
          {copy.headline[1]}
          <br />
          <span className="text-accent">{copy.headline[2]}</span>
        </h1>
        <p className="mt-6 text-lg font-medium text-white/70">
          {copy.subhead}
        </p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/40">
          {copy.desc}
        </p>
      </div>

      {/* Right — Login Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Mobile logo (hidden on lg+) */}
        <div className="text-center lg:hidden">
          <div className="mb-4">
            <ClosrLogo size="xl" variant="light" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{copy.mobileHeadline}</h1>
          <p className="mt-2 text-sm font-medium text-foreground/70">{copy.subhead}</p>
        </div>

        {/* Desktop heading */}
        <div className="hidden lg:block">
          <h2 className="text-2xl font-bold text-foreground">{copy.welcome}</h2>
          <p className="mt-1 text-sm text-secondary">{copy.welcomeDesc}</p>
        </div>

        {/* Invitation banner */}
        {invitationToken && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            登录后将自动接受邀请并加入组织
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              {copy.email}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example-97af051a28@example.invalid"
                className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              {copy.password}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={copy.passwordPlaceholder}
                className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-10 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {needsMfa && <label className="block text-sm font-medium">{locale === 'en' ? 'Authenticator code' : '动态验证码'}<input name="totpCode" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required value={totpCode} onChange={e => setTotpCode(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-card p-3" /></label>}

          <div className="flex items-center justify-end">
            <Link href="/forgot-password" className="text-xs text-accent hover:text-accent-hover">
              {copy.forgot}
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {loading ? copy.loggingIn : copy.login}
          </button>
        </form>
        <Link
          href={registerHref}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/5 py-3 text-sm font-semibold text-accent shadow-sm transition-colors hover:bg-accent/10"
        >
          <Headset className="h-4 w-4" />
          {copy.register}
        </Link>
            <p className="mt-4 text-center text-xs text-muted">
              {copy.consentPrefix} <a href="/terms" className="text-accent hover:underline">{copy.terms}</a> {copy.and} <a href="/privacy" className="text-accent hover:underline">{copy.privacy}</a>
            </p>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[var(--background)] px-3 text-secondary">{copy.or}</span>
          </div>
        </div>

        {/* Demo button */}
        {shouldOpenDemo && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-foreground">{copy.demo}</p>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-secondary">{copy.demoPrompt}</p>
            <input
              ref={demoAccessInputRef}
              type="password"
              value={demoAccessInput}
              onChange={(e) => {
                setDemoAccessInput(e.target.value);
                setDemoAccessError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  verifyDemoAccess(e.currentTarget.value);
                }
              }}
              placeholder={copy.accessPassword}
              className="mb-2 w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            {demoAccessError && <p className="mb-2 text-xs text-red-500">{demoAccessError}</p>}
            <button
              type="button"
              onClick={() => verifyDemoAccess()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {copy.enter}
            </button>
          </div>
        )}
        {!shouldOpenDemo && (
          <Link
            href={demoHref}
            onClick={() => {
              setDemoAccessError('');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-[var(--background)]"
          >
            <Sparkles className="h-4 w-4 text-accent" />
            {copy.demo}
          </Link>
        )}
      </div>
      </div>

    </div>
  );
}
