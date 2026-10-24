/**
 * Seed Knowledge Base — 50-60 high-quality B2B sales knowledge entries
 * Run: npx tsx src/scripts/seed-knowledge-base.ts
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

// Load env from .env.local (without dotenv dependency)
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
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch { /* file not found, rely on existing env */ }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function deterministicId(category: string, title: string): string {
  return createHash('sha256').update(`${category}::${title}`).digest('hex').slice(0, 32);
}

interface KnowledgeEntry {
  category: string;
  title: string;
  content: string;
  applicable_scenarios: string[];
}

// ============================================================
// KNOWLEDGE ENTRIES
// ============================================================

const entries: KnowledgeEntry[] = [];

// ============================================================
// MAIN
// ============================================================

async function ensureTable() {
  // Create table if not exists
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
CREATE TABLE IF NOT EXISTS knowledge_base (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  applicable_scenarios text[] DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
    `,
  });

  if (error) {
    // Table might already exist or rpc not available — try direct insert to test
    console.warn('[seed] Could not run DDL via rpc:', error.message);
    console.log('[seed] Assuming table already exists, proceeding with upsert...');
  }
}

async function seedEntries() {
  let success = 0;
  let failed = 0;

  for (const entry of entries) {
    const id = deterministicId(entry.category, entry.title);
    const row = {
      id,
      category: entry.category,
      title: entry.title,
      content: entry.content,
      applicable_scenarios: entry.applicable_scenarios,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('knowledge_base')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.error(`  ✗ [${entry.category}] ${entry.title}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ [${entry.category}] ${entry.title}`);
      success++;
    }
  }

  return { success, failed };
}

async function main() {
  console.log(`\n🔧 Knowledge Base Seeder`);
  console.log(`   Target: ${supabaseUrl}`);
  console.log(`   Entries: ${entries.length}\n`);

  await ensureTable();

  console.log('Upserting entries...\n');
  const { success, failed } = await seedEntries();

  console.log(`\n--- Done ---`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Total:   ${entries.length}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
