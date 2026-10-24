'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, Mail, MessageSquare, Phone, Send, Lock, Loader2, Eye, EyeOff, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const REGISTER_COPY = {
  zh: {
    titleInvite: '接受邀请',
    title: '创建账号',
    subtitleInvite: '注册后将自动加入组织',
    subtitle: '注册 Closr 开始使用',
    inviteBanner: '你正在通过邀请链接注册，完成后将自动加入组织',
    email: '邮箱',
    password: '密码',
    passwordPlaceholder: '至少 8 位，含大小写和数字',
    confirmPassword: '确认密码',
    confirmPasswordPlaceholder: '再次输入密码',
    submit: '注册',
    submitting: '注册中...',
    consentPrefix: '注册即表示同意',
    terms: '服务条款',
    and: '和',
    privacy: '隐私政策',
    hasAccount: '已有账号？',
    login: '登录',
    mismatch: '两次密码不一致',
    weakPassword: '密码至少 8 位，需包含大小写字母和数字',
    registerFailed: '注册失败',
    alreadyRegistered: '该邮箱已注册',
    loginToAcceptInvite: '该邮箱已注册，请直接登录后接受邀请',
    goLogin: '去登录',
    autoLoginFailed: '账号已创建，但自动登录失败，请直接登录',
    tryLater: '注册失败，请稍后重试',
    salesTitle: '联系销售团队',
    salesSubtitle: '留下联系方式，我们会确认适合的开通方式',
    fullName: '姓名',
    company: '公司',
    phone: '电话',
    message: '补充说明',
    messagePlaceholder: '团队规模、使用场景或希望解决的问题',
    salesSubmit: '提交联系信息',
    salesSubmitting: '提交中...',
    salesSuccess: '已收到，我们会尽快联系你',
    salesFailed: '提交失败，请稍后重试',
    contactConsentPrefix: '提交即表示同意',
  },
  en: {
    titleInvite: 'Accept invitation',
    title: 'Create your account',
    subtitleInvite: 'You will join the organization after registration',
    subtitle: 'Sign up to start using Closr',
    inviteBanner: 'You are registering through an invitation link. You will join the organization after completion.',
    email: 'Email',
    password: 'Password',
    passwordPlaceholder: 'At least 8 characters with uppercase, lowercase, and a number',
    confirmPassword: 'Confirm password',
    confirmPasswordPlaceholder: 'Enter password again',
    submit: 'Sign up',
    submitting: 'Signing up...',
    consentPrefix: 'By signing up, you agree to the',
    terms: 'Terms',
    and: 'and',
    privacy: 'Privacy Policy',
    hasAccount: 'Already have an account?',
    login: 'Log in',
    mismatch: 'Passwords do not match',
    weakPassword: 'Password must be at least 8 characters and include uppercase, lowercase, and a number',
    registerFailed: 'Registration failed',
    alreadyRegistered: 'This email is already registered',
    loginToAcceptInvite: 'This email is already registered. Log in to accept the invitation.',
    goLogin: 'Go to login',
    autoLoginFailed: 'Account created, but automatic login failed. Please log in directly.',
    tryLater: 'Registration failed. Please try again later.',
    salesTitle: 'Contact sales',
    salesSubtitle: 'Leave your details and we will confirm the right way to start',
    fullName: 'Name',
    company: 'Company',
    phone: 'Phone',
    message: 'Notes',
    messagePlaceholder: 'Team size, use case, or the problem you want to solve',
    salesSubmit: 'Submit contact details',
    salesSubmitting: 'Submitting...',
    salesSuccess: 'Received. We will contact you soon.',
    salesFailed: 'Submission failed. Please try again later.',
    contactConsentPrefix: 'By submitting, you agree to the',
  },
} as const;

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const locale = searchParams.get('lang') === 'en' ? 'en' : 'zh';
  const copy = REGISTER_COPY[locale];
  const invitationToken = searchParams.get('invitation');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    localStorage.setItem('closr-locale', locale);
  }, [locale]);

  const loginParams = new URLSearchParams();
  if (locale === 'en') loginParams.set('lang', 'en');
  if (invitationToken) loginParams.set('invitation', invitationToken);
  const loginHref = `/login${loginParams.toString() ? `?${loginParams.toString()}` : ''}`;
  const onboardingHref = locale === 'en' ? '/onboarding?lang=en' : '/onboarding';

  const redirectAfterRegister = (hasInvitation: boolean) => {
    localStorage.setItem('closr-locale', locale);
    window.location.href = hasInvitation ? '/horizon' : onboardingHref;
  };

  const handleContactSales = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitted(false);
    setLoading(true);

    try {
      const res = await fetch('/api/contact-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, company, phone, message, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : copy.salesFailed);
        return;
      }
      setSubmitted(true);
      setFullName('');
      setEmail('');
      setCompany('');
      setPhone('');
      setMessage('');
    } catch {
      setError(copy.salesFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(copy.mismatch);
      return;
    }
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError(copy.weakPassword);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, invitationToken }),
      });

      const registerData = await registerRes.json().catch(() => ({}));

      if (!registerRes.ok) {
        const registerError = typeof registerData.error === 'string' ? registerData.error : copy.registerFailed;
        if (registerRes.status === 409 || /已注册|already|registered|exists/i.test(registerError)) {
          if (invitationToken) {
            // Ghost user from old invite — resolve by setting password + confirming
            try {
              const resolveRes = await fetch('/api/auth/resolve-invited-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, invitationToken }),
              });
              if (resolveRes.ok) {
                // Ghost resolved — sign in with the new password
                const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
                if (!signInErr) {
                  // Accept invitation after sign-in
                  await fetch('/api/invite/accept', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: invitationToken }),
                  });
                  localStorage.setItem('closr-locale', locale);
                  window.location.href = '/horizon';
                  return;
                }
              }
            } catch {
              // Fall through to show login link
            }
            setError(copy.loginToAcceptInvite);
          } else {
            setError(copy.alreadyRegistered);
          }
        } else {
          setError(registerError);
        }
        return;
      }

      const session = registerData.session && typeof registerData.session === 'object'
        ? registerData.session as { access_token?: unknown; refresh_token?: unknown }
        : null;

      if (typeof session?.access_token === 'string' && typeof session.refresh_token === 'string') {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (!sessionErr) {
          if (invitationToken) {
            await fetch('/api/invite/accept', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: invitationToken }),
            });
          }
          redirectAfterRegister(Boolean(invitationToken));
          return;
        }
        console.error('[register] setSession after register failed:', sessionErr.message);
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        console.error('[register] sign-in after register failed:', signInErr.message);
        setError(copy.autoLoginFailed);
        return;
      }

      localStorage.setItem('closr-locale', locale);
      if (invitationToken) {
        await fetch('/api/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: invitationToken }),
        });
        window.location.href = '/horizon';
      } else {
        window.location.href = onboardingHref;
      }
      return;
    } catch {
      setError(copy.tryLater);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white shadow-sm">
            C
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {invitationToken ? copy.titleInvite : copy.salesTitle}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {invitationToken ? copy.subtitleInvite : copy.salesSubtitle}
          </p>
        </div>

        {/* Invitation banner */}
        {invitationToken && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent">
            {copy.inviteBanner}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
            {(error.includes('请直接登录') || error.includes('Log in')) && (
              <Link
                href={loginHref}
                className="ml-1 font-medium underline hover:text-accent"
              >
                {copy.goLogin}
              </Link>
            )}
          </div>
        )}

        {submitted && !invitationToken && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
            {copy.salesSuccess}
          </div>
        )}

        {!invitationToken && (
          <form onSubmit={handleContactSales} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-foreground">
                {copy.fullName}
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>

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
              <label htmlFor="company" className="mb-1.5 block text-sm font-medium text-foreground">
                {copy.company}
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
                <input
                  id="company"
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-foreground">
                {copy.phone}
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-foreground">
                {copy.message}
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3.5 h-4 w-4 text-secondary" />
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={copy.messagePlaceholder}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? copy.salesSubmitting : copy.salesSubmit}
            </button>
          </form>
        )}

        {/* Form */}
        {invitationToken && <form onSubmit={handleRegister} className="space-y-4">
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

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-foreground">
              {copy.confirmPassword}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={copy.confirmPasswordPlaceholder}
                className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {loading ? copy.submitting : copy.submit}
          </button>
        </form>}
            <p className="mt-4 text-center text-xs text-muted">
              {invitationToken ? copy.consentPrefix : copy.contactConsentPrefix} <a href="/terms" className="text-accent hover:underline">{copy.terms}</a> {copy.and} <a href="/privacy" className="text-accent hover:underline">{copy.privacy}</a>
            </p>

        {/* Login link */}
        <p className="text-center text-sm text-secondary">
          {copy.hasAccount}{' '}
          <Link href={loginHref} className="font-medium text-accent hover:text-accent-hover">
            {copy.login}
          </Link>
        </p>
      </div>
    </div>
  );
}
