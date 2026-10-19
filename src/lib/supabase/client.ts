import { createBrowserClient } from '@supabase/ssr';

export type BrowserPublicConfig = Readonly<{ url: string; anonKey: string }>;

export function createClient(config: BrowserPublicConfig) {
  if (!config?.url || !config?.anonKey) throw new Error('supabase_unavailable');
  return createBrowserClient(config.url, config.anonKey);
}
