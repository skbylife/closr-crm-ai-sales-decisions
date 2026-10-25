'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function SetupPage() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [english, setEnglish] = useState(true);
  useEffect(() => {
    fetch('/api/native/auth/setup-status').then(async response => {
      if (!response.ok) throw new Error('Setup service is unavailable');
      const status = await response.json(); setSetupRequired(status.setupRequired);
    }).catch(() => setError('无法连接初始化服务 / Setup service is unavailable'));
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/native/auth', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup', email: form.get('email'), password: form.get('password'), displayName: form.get('displayName'), organizationName: form.get('organizationName') }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'Setup failed');
      window.location.assign('/horizon');
    } catch (e) { setError(e instanceof Error ? e.message : 'Setup failed'); }
    finally { setBusy(false); }
  }
  const inputClass = 'mt-2 w-full rounded-lg border border-border bg-card p-3 text-foreground';
  return <main className="min-h-screen flex items-center justify-center bg-background p-6">
    <section className="w-full max-w-md space-y-6">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{english ? 'Set up Closr' : '初始化 Closr'}</h1><button type="button" onClick={() => setEnglish(!english)} className="text-accent">{english ? '中文' : 'English'}</button></div>
      <p className="text-secondary">{english ? 'Create your workspace and its first owner account.' : '创建工作空间和第一个所有者账号。'}</p>
      {error && <p role="alert" className="rounded-lg border border-danger p-3 text-danger">{error}</p>}
      {setupRequired === false ? <p>{english ? 'Your workspace is already initialized.' : '工作空间已初始化。'} <Link className="text-accent" href="/login">{english ? 'Log in' : '登录'}</Link></p> : setupRequired === null ? <p>{english ? 'Checking setup…' : '正在检查初始化状态…'}</p> :
        <form onSubmit={submit} className="space-y-4">
          <label className="block">{english ? 'Workspace name' : '工作空间名称'}<input className={inputClass} name="organizationName" required maxLength={120} autoComplete="organization" /></label>
          <label className="block">{english ? 'Your name' : '姓名'}<input className={inputClass} name="displayName" required maxLength={120} autoComplete="name" /></label>
          <label className="block">{english ? 'Email' : '邮箱'}<input className={inputClass} name="email" type="email" required autoComplete="username" /></label>
          <label className="block">{english ? 'Password' : '密码'}<input className={inputClass} name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <p className="text-sm text-secondary">{english ? 'Use at least 12 characters. You can enable two-factor authentication in Settings.' : '请使用至少 12 个字符的密码。登录后可在设置中启用双重验证。'}</p>
          <button className="w-full rounded-lg bg-accent p-3 font-medium text-white disabled:opacity-50" disabled={busy}>{busy ? (english ? 'Creating…' : '创建中…') : (english ? 'Create workspace' : '创建工作空间')}</button>
        </form>}
    </section>
  </main>;
}
