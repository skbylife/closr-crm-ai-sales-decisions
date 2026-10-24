'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isNativeDatabase } from '@/lib/database-backend';
import { recordAuthAuditEvent } from '@/lib/auth-audit-client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    if (password.length < (isNativeDatabase() ? 12 : 6)) {
      setError(isNativeDatabase() ? '密码至少 12 位' : '密码至少 6 位');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      let updateError;
      if (isNativeDatabase()) {
        const token = new URLSearchParams(window.location.hash.slice(1)).get('recovery_token');
        if (!token) { setError('恢复链接缺失或无效，请联系部署管理员。'); return; }
        const response = await fetch('/api/native/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recover', token, password }) });
        const result = await response.json(); updateError = result.error;
        if (!response.ok && !updateError) updateError = { message: '恢复失败，请重新获取链接。' };
        if (!updateError) window.history.replaceState(null, '', '/reset-password');
      } else {
        ({ error: updateError } = await supabase.auth.updateUser({ password }));
      }

      if (updateError) {
        setError(updateError.message);
        return;
      }

      // Native recovery revokes every session and records the event server-side;
      // an authenticated browser audit request would now necessarily fail.
      if (!isNativeDatabase()) await recordAuthAuditEvent('password_reset_completed');
      setSuccess(true);
      setTimeout(() => router.push(isNativeDatabase() ? '/login' : '/horizon'), 2000);
    } catch {
      setError('重置失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-positive" />
          <h1 className="text-2xl font-bold text-foreground">密码已重置</h1>
          <p className="text-sm text-muted">{isNativeDatabase() ? '密码已更新，请重新登录。' : '正在跳转到仪表盘...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white shadow-sm">
            C
          </div>
          <h1 className="text-2xl font-bold text-foreground">设置新密码</h1>
          <p className="mt-2 text-sm text-muted">输入新密码</p>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              新密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isNativeDatabase() ? "至少 12 位" : "至少 6 位"}
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
              确认新密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full rounded-lg border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {loading ? '重置中...' : '重置密码'}
          </button>
        </form>
      </div>
    </div>
  );
}
