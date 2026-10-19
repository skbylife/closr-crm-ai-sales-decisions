'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, type BrowserPublicConfig } from '@/lib/supabase/client';

export default function LoginForm({ config }: { config: BrowserPublicConfig }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { error } = await createClient(config).auth.signInWithPassword({ email, password });
      if (error) { setError('登录失败，请检查账号和密码。'); return; }
      router.push('/accounts'); router.refresh();
    } catch { setError('登录服务暂不可用。'); }
    finally { setBusy(false); }
  }
  return <main><h1>Closr Community</h1><form onSubmit={login}>
    <label>邮箱<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>密码<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button type="submit" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
  </form></main>;
}
