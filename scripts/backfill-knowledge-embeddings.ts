#!/usr/bin/env npx tsx
// One-off script: backfill embeddings for knowledge_base records where embedding IS NULL
// Usage: npx tsx scripts/backfill-knowledge-embeddings.ts

import 'dotenv/config';

async function main() {
  const { backfillKnowledgeEmbeddings } = await import('../src/lib/knowledge-engine');

  console.log('[backfill] Starting knowledge embeddings backfill...');
  let totalUpdated = 0;
  let batchUpdated: number;

  do {
    batchUpdated = await backfillKnowledgeEmbeddings(50);
    totalUpdated += batchUpdated;
    if (batchUpdated > 0) {
      console.log(`[backfill] Batch done: ${batchUpdated} records. Total so far: ${totalUpdated}`);
    }
  } while (batchUpdated > 0);

  console.log(`[backfill] Complete. Total updated: ${totalUpdated}`);
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
