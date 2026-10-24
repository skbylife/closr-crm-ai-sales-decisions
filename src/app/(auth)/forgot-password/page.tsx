'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { isNativeDatabase } from '@/lib/database-backend';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccess(true);
    } catch {
      setError('发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (isNativeDatabase()) return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6"><section className="max-w-md space-y-5">
      <h1 className="text-2xl font-semibold">恢复账号 / Account recovery</h1>
      <p className="text-secondary">请联系工作空间的部署管理员，核实身份后获取一次性密码恢复链接。链接有效期为 15 分钟。恢复密码不会关闭双重验证。</p>
      <p className="text-secondary">Contact your deployment administrator to verify your identity and receive a one-time password recovery link. It expires in 15 minutes. Two-factor authentication remains enabled.</p>
      <Link href="/login" className="text-accent">返回登录 / Back to login</Link>
    </section></main>
  );

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-positive" />
          <h1 className="text-2xl font-bold text-foreground">邮件已发送</h1>
          <p className="text-sm text-muted">
            重置密码链接已发送到 <span className="font-medium text-foreground">{email}</span>。
            请查收邮箱并点击链接重置密码。
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white shadow-sm">
            C
          </div>
          <h1 className="text-2xl font-bold text-foreground">重置密码</h1>
          <p className="mt-2 text-sm text-muted">输入注册邮箱，我们将发送重置链接</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              邮箱
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

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? '发送中...' : '发送重置链接'}
          </button>
        </form>

        {/* Back to login */}
        <p className="text-center text-sm text-secondary">
          <Link href="/login" className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}
