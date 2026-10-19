import { connection } from 'next/server';
import { getPublicRuntimeConfig } from '@/lib/community/public-runtime-config';
import LoginForm from './login-form';

export default async function LoginPage() {
  await connection();
  const config = getPublicRuntimeConfig();
  if (!config) return <main><h1>Closr Community</h1><p role="alert">登录服务暂不可用。</p></main>;
  return <LoginForm config={config} />;
}
