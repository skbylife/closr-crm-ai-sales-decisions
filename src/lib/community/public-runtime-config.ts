import 'server-only';

export type PublicRuntimeConfig = Readonly<{ url: string; anonKey: string }>;

// These values are public, but the environment is read only on the server at
// request time. The client receives exactly this pair through page props.
export function getPublicRuntimeConfig(): PublicRuntimeConfig | null {
  const url = process.env.CLOSR_SUPABASE_URL;
  const anonKey = process.env.CLOSR_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url !== url.trim() || anonKey !== anonKey.trim() ||
      anonKey.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(anonKey)) return null;
  try {
    const claims = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString('utf8'));
    if (claims?.role !== 'anon') return null;
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username || parsed.password || parsed.pathname !== '/' ||
        parsed.search || parsed.hash) return null;
    return { url: parsed.origin, anonKey };
  } catch {
    return null;
  }
}
