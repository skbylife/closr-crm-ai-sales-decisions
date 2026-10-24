export type AiProviderKind =
  | 'disabled'
  | 'gemini'
  | 'openai-compatible'
  | 'azure-openai'
  | 'customer-openai-compatible'
  | 'local-openai-compatible';

export type AiProviderTier = 'flash' | 'pro';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_FLASH_MODEL = 'deepseek-v4-flash';
export const DEFAULT_DEEPSEEK_PRO_MODEL = 'deepseek-v4-pro';

export interface AiProviderConfig {
  provider: AiProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  embeddingModel: string | null;
  capabilities: {
    chat: boolean;
    structuredJson: boolean;
    embeddings: boolean;
    vision: boolean;
    transcription: boolean;
  };
  customerOwned: boolean;
  allowExternalProvider: boolean;
}

function firstEnv(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function inferProvider(raw: string | null, baseUrl: string | null): AiProviderKind {
  const normalized = raw?.toLowerCase();
  if (normalized === 'disabled' || normalized === 'none') return 'disabled';
  if (normalized === 'gemini') return 'gemini';
  if (normalized === 'azure-openai') return 'azure-openai';
  if (normalized === 'customer-openai-compatible' || normalized === 'custom-openai-compatible') return 'customer-openai-compatible';
  if (normalized === 'local-openai-compatible' || normalized === 'local') return 'local-openai-compatible';
  if (normalized === 'openai-compatible' || normalized === 'deepseek') return 'openai-compatible';
  if (baseUrl) return 'openai-compatible';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'disabled';
}

function isDeepSeekProvider(raw: string | null, baseUrl: string | null): boolean {
  const normalized = raw?.toLowerCase();
  if (normalized === 'deepseek') return true;
  return /api\.deepseek\.com/i.test(baseUrl ?? '');
}

function parseBoolEnv(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] ?? '').toLowerCase());
}

function parseCapabilities() {
  const raw = process.env.AI_CAPABILITIES;
  const configured = new Set((raw ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
  const embeddingsConfigured = Boolean(firstEnv(['AI_EMBEDDING_MODEL', 'EMBEDDING_MODEL']));
  const visionConfigured = Boolean(firstEnv(['VISION_MODEL', 'VISION_BASE_URL']));

  return {
    chat: raw ? configured.has('chat') : true,
    structuredJson: raw ? (configured.has('json') || configured.has('structured_json')) : true,
    embeddings: raw ? configured.has('embeddings') : embeddingsConfigured,
    vision: raw ? visionConfigured && configured.has('vision') : visionConfigured,
    transcription: raw ? configured.has('transcription') : false,
  };
}

export function getAiProviderConfig(tier: AiProviderTier = 'flash'): AiProviderConfig {
  const pro = tier === 'pro';
  const providerHint = process.env.AI_PROVIDER ?? null;
  const configuredBaseUrl = firstEnv(pro ? ['AI_PRO_BASE_URL', 'AI_BASE_URL'] : ['AI_BASE_URL']);
  const deepSeekProvider = isDeepSeekProvider(providerHint, configuredBaseUrl);
  const baseUrl = configuredBaseUrl ?? (deepSeekProvider ? DEFAULT_DEEPSEEK_BASE_URL : null);
  const apiKey = firstEnv(
    pro
      ? ['AI_PRO_API_KEY', 'DEEPSEEK_API_KEY', 'AI_API_KEY']
      : ['DEEPSEEK_API_KEY', 'AI_API_KEY'],
  );
  const model = firstEnv(pro ? ['AI_PRO_MODEL', 'AI_MODEL', 'SG_AI_MODEL'] : ['AI_MODEL', 'SG_AI_MODEL'])
    ?? (deepSeekProvider ? (pro ? DEFAULT_DEEPSEEK_PRO_MODEL : DEFAULT_DEEPSEEK_FLASH_MODEL) : null);
  const provider = inferProvider(providerHint, baseUrl);

  return {
    provider,
    baseUrl,
    apiKey: provider === 'gemini' ? firstEnv(['GEMINI_API_KEY']) : apiKey,
    model: provider === 'gemini' ? model : model,
    embeddingModel: firstEnv(['AI_EMBEDDING_MODEL', 'EMBEDDING_MODEL']),
    capabilities: parseCapabilities(),
    customerOwned: parseBoolEnv('AI_CUSTOMER_OWNED') || provider === 'customer-openai-compatible' || provider === 'local-openai-compatible',
    allowExternalProvider: parseBoolEnv('AI_ALLOW_EXTERNAL_PROVIDER'),
  };
}

export function getAiChatCompletionsUrl(config: Pick<AiProviderConfig, 'baseUrl'>): string {
  if (!config.baseUrl) throw new Error('AI_BASE_URL is not configured');
  return `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export function getAiEmbeddingsUrl(config: Pick<AiProviderConfig, 'baseUrl'>): string {
  if (!config.baseUrl) throw new Error('AI_BASE_URL is not configured');
  return `${config.baseUrl.replace(/\/+$/, '')}/embeddings`;
}

export function isPrivateOrLocalAiBaseUrl(baseUrl: string | null): boolean {
  if (!baseUrl) return false;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (/^127\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isAiConfigured(): boolean {
  const config = getAiProviderConfig();
  if (config.provider === 'disabled') return false;
  if (config.provider === 'gemini') return Boolean(config.apiKey);
  return Boolean(config.baseUrl && config.apiKey && config.model);
}
