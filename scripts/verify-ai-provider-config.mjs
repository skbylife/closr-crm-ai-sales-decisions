#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';

const sourceChecks = [
  {
    file: 'src/lib/ai-provider-config.ts',
    markers: [
      'getAiProviderConfig',
      'customer-openai-compatible',
      'local-openai-compatible',
      'AI_CUSTOMER_OWNED',
      'isPrivateOrLocalAiBaseUrl',
    ],
  },
  {
    file: 'src/lib/babel-engine/gemini.ts',
    markers: ['getAiProviderConfig', 'getAiChatCompletionsUrl', 'config.provider'],
  },
  {
    file: 'src/lib/knowledge-engine.ts',
    markers: ['getAiProviderConfig', 'getAiEmbeddingsUrl'],
  },
  {
    file: 'docs/compliance/AI-PROVIDER-BYOM.md',
    markers: ['Bring Your Own Model', 'Customer-Owned Provider', 'Capability Matrix', 'Release Gate'],
  },
  {
    file: 'docs/compliance/AI-DATA-PROCESSING-ADDENDUM.md',
    markers: ['Bring Your Own Model', 'customer-owned LLM', 'AI provider adapter'],
  },
];

const failures = [];

for (const check of sourceChecks) {
  const text = readFileSync(check.file, 'utf8');
  for (const marker of check.markers) {
    if (!text.includes(marker)) failures.push(check.file + ': missing ' + marker);
  }
}

const provider = (process.env.AI_PROVIDER ?? '').toLowerCase();
const baseUrl = process.env.AI_BASE_URL ?? '';
const model = process.env.AI_MODEL ?? process.env.SG_AI_MODEL ?? '';
const key = process.env.AI_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? process.env.GEMINI_API_KEY ?? '';
const enterpriseLocal = ['customer-self-hosted', 'customer-self-hosted-lite', 'customer-self-hosted-enterprise'].includes(process.env.DEPLOY_TARGET ?? '')
  || process.env.CLOSR_ENTERPRISE_LOCAL_DEPLOYMENT === '1';
const allowExternal = process.env.AI_ALLOW_EXTERNAL_PROVIDER === '1';

if (enterpriseLocal) {
  if (!provider) failures.push('enterprise local deployment requires AI_PROVIDER');
  if (provider !== 'gemini' && !baseUrl) failures.push('enterprise local deployment requires AI_BASE_URL for customer-owned provider');
  if (!model && provider !== 'gemini') failures.push('enterprise local deployment requires AI_MODEL');
  if (!key) failures.push('enterprise local deployment requires customer-owned AI key');
  if (!allowExternal && baseUrl && !isPrivateOrLocalUrl(baseUrl)) {
    failures.push('enterprise local deployment AI_BASE_URL must be private/local unless AI_ALLOW_EXTERNAL_PROVIDER=1');
  }
}

if (process.env.CLOSR_VERIFY_AI_PROVIDER_LIVE === '1') {
  await verifyLiveProvider({ provider, baseUrl, model, key });
}

if (failures.length) {
  console.error('AI provider configuration verification failed:\n' + failures.join('\n'));
  process.exit(1);
}

console.log('AI provider configuration verification passed.');

function isPrivateOrLocalUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost'
      || host.endsWith('.local')
      || host.endsWith('.internal')
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch {
    return false;
  }
}

async function verifyLiveProvider({ provider, baseUrl, model, key }) {
  if (!key) failures.push('live AI provider check requires API key');
  if (provider !== 'gemini' && !baseUrl) failures.push('live AI provider check requires AI_BASE_URL');
  if (provider !== 'gemini' && !model) failures.push('live AI provider check requires AI_MODEL');
  if (failures.length) return;

  if (provider === 'gemini') {
    console.log('Live Gemini provider check is intentionally manual for now.');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Return only JSON.' },
          { role: 'user', content: 'Return {"ok":true} as JSON.' },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      await res.text().catch(() => '');
      failures.push('live AI provider check failed with HTTP ' + res.status);
      return;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || !JSON.parse(content).ok) failures.push('live AI provider check did not return parseable JSON');
  } catch (err) {
    failures.push('live AI provider check failed: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    clearTimeout(timeout);
  }
}
