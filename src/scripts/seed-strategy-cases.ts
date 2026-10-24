/**
 * Seed Strategy Cases — RAG 案例库种子脚本
 * 从 memory/babel-strategy-cases.json 读取案例，向量化后写入 strategy_cases 表
 *
 * Run: npx tsx src/scripts/seed-strategy-cases.ts
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

// ─── Load .env.local ──────────────────────────────────────────────────

function loadEnvFile(path: string) {
  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore */
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

// ─── Supabase Client ──────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// ─── Embedding ───────────────────────────────────────────────────────

const AI_BASE_URL =
  process.env.AI_BASE_URL ||
  'https://api.deepseek.com';
const AI_API_KEY = process.env.AI_API_KEY;
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || 'deepseek-embedding-v2';

async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${AI_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}

// ─── Types ───────────────────────────────────────────────────────────

interface RawStrategyCase {
  id: number;
  situation: string;
  disc_type_guess: string;
  approach: string;
  opening_line?: string;
  result: string;
  why_it_worked: string;
  tags: string[];
}

interface StrategyCasesFile {
  version: string;
  source: string;
  created_at: string;
  total_cases: number;
  strategy_cases: RawStrategyCase[];
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  // 1. 读取 JSON 文件
  const jsonPath = process.env.STRATEGY_CASES_FILE;
  if (!jsonPath) throw new Error('Set STRATEGY_CASES_FILE to your own approved dataset');
  console.log(`📂 Reading cases from: ${jsonPath}`);

  let casesFile: StrategyCasesFile;
  try {
    const raw = readFileSync(jsonPath, 'utf-8');
    casesFile = JSON.parse(raw) as StrategyCasesFile;
  } catch (err) {
    console.error('Failed to read babel-strategy-cases.json:', err);
    process.exit(1);
  }

  const cases = casesFile.strategy_cases;
  console.log(`📋 Found ${cases.length} cases to seed`);

  if (!AI_API_KEY) {
    console.error('Missing AI_API_KEY in .env.local — needed for embedding');
    process.exit(1);
  }

  let successCount = 0;
  let errorCount = 0;

  // 2. 对每个案例处理
  for (const c of cases) {
    try {
      // 拼接文本：situation + approach + why_it_worked
      const text = [
        `情境：${c.situation}`,
        `策略：${c.approach}`,
        `原因：${c.why_it_worked}`,
        `DISC类型：${c.disc_type_guess}`,
        `标签：${c.tags.join(', ')}`,
      ].join('\n');

      // 3. 向量化
      const embedding = await embedText(text);

      // 4. Upsert 到 strategy_cases 表
      // 用 situation+approach 的 hash 生成稳定 UUID 格式 ID
      const stableHash = createHash('sha256')
        .update(`${c.situation}::${c.approach}`)
        .digest('hex');
      const stableId = [
        stableHash.slice(0, 8),
        stableHash.slice(8, 12),
        stableHash.slice(12, 16),
        stableHash.slice(16, 20),
        stableHash.slice(20, 32),
      ].join('-');

      const { error } = await supabase.from('strategy_cases').upsert(
        {
          id: stableId,
          situation: c.situation,
          disc_type: c.disc_type_guess,
          approach: c.approach,
          opening_line: c.opening_line ?? null,
          result: c.result as 'success' | 'failure' | 'neutral',
          why_it_worked: c.why_it_worked,
          tags: c.tags,
          source: casesFile.source,
          embedding: `[${embedding.join(',')}]`,
        },
        { onConflict: 'id', ignoreDuplicates: false }
      );

      if (error) {
        console.error(`  ❌ Case ${c.id} failed: ${error.message}`);
        errorCount++;
      } else {
        console.log(`  ✅ [${successCount + 1}/${cases.length}] Case ${c.id}: ${c.situation.slice(0, 40)}...`);
        successCount++;
      }

      // 短暂延迟避免 API 限频
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`  ❌ Case ${c.id} error:`, err);
      errorCount++;
    }
  }

  // 5. 打印结果
  console.log('\n────────────────────────────────────────');
  console.log(`✅ Done: ${successCount} seeded, ${errorCount} errors`);
  console.log(`📊 Total cases in DB: ${successCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
