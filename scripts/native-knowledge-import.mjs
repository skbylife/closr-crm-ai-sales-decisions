import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

export const DIMENSIONS = 1536;
function hash(text) { return createHash('sha256').update(text).digest('hex'); }
function caseId(id) { const h = hash(`strategy-case:${id}`); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`; }
export function validateVector(values, model) {
  if (typeof model !== 'string' || !model.trim() || model.length > 200 || !Array.isArray(values) || values.length !== DIMENSIONS ||
      values.some(x => typeof x !== 'number' || !Number.isFinite(x)) || !values.some(x => x !== 0)) {
    throw new Error('Embedding requires a model id and 1536 finite, nonzero-norm dimensions');
  }
  return JSON.stringify(values);
}
export function validateCorpus(corpus) {
  if (corpus.format_version !== 1 || !corpus.corpus_version || !Array.isArray(corpus.entries)) throw new Error('Unsupported corpus format');
  const seen = new Set();
  for (const row of corpus.entries) {
    if (!row.id || seen.has(row.id) || !row.title || !row.content || !row.category ||
        row.publication_status !== 'approved-project-summary' ||
        row.license !== 'LicenseRef-Closr-Source-Available-1.1' ||
        !row.provenance?.source_commit || !row.provenance?.source_path ||
        hash(row.content) !== row.content_sha256 || !Array.isArray(row.applicable_scenarios)) {
      throw new Error('Corpus entry failed provenance, uniqueness, or content-integrity validation');
    }
    seen.add(row.id);
  }
}

/** Operator-only importer; no network model request unless embed is supplied explicitly.
 * Uses a single database transaction so an invalid item never leaves a partial corpus.
 */
export async function importCorpus(client, corpus, { embed, model } = {}) {
  validateCorpus(corpus);
  if (embed && !model) throw new Error('An explicit embedding model identifier is required');
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('closr-general-knowledge-import'))");
    let cases = 0;
    for (const row of corpus.entries) {
      const embedding = embed ? validateVector(await embed(`${row.title}\n${row.content}`), model) : null;
      const provenance = JSON.stringify({ ...row.provenance, corpus_version: corpus.corpus_version,
        license: row.license, publication_status: row.publication_status });
      const result = await client.query(`INSERT INTO public.knowledge_base
        (id,org_id,account_id,category,title,content,applicable_scenarios,source,source_type,source_id,
         is_general_knowledge,provenance,content_sha256,embedding,embedding_model,embedding_dimensions)
        VALUES ($1,NULL,NULL,$2,$3,$4,$5,'closr-general-corpus','general_corpus',$1,true,$6::jsonb,$7,$8::vector,$9,$10)
        ON CONFLICT (id) DO UPDATE SET category=EXCLUDED.category,title=EXCLUDED.title,content=EXCLUDED.content,
          applicable_scenarios=EXCLUDED.applicable_scenarios,provenance=EXCLUDED.provenance,
          embedding=CASE WHEN $8::vector IS NOT NULL THEN EXCLUDED.embedding WHEN knowledge_base.content_sha256=EXCLUDED.content_sha256 THEN knowledge_base.embedding ELSE NULL END,
          embedding_model=CASE WHEN $8::vector IS NOT NULL THEN EXCLUDED.embedding_model WHEN knowledge_base.content_sha256=EXCLUDED.content_sha256 THEN knowledge_base.embedding_model ELSE NULL END,
          embedding_dimensions=CASE WHEN $8::vector IS NOT NULL THEN EXCLUDED.embedding_dimensions WHEN knowledge_base.content_sha256=EXCLUDED.content_sha256 THEN knowledge_base.embedding_dimensions ELSE NULL END,
          content_sha256=EXCLUDED.content_sha256,updated_at=now()
        WHERE knowledge_base.is_general_knowledge=true AND knowledge_base.org_id IS NULL AND knowledge_base.account_id IS NULL
        RETURNING id`, [row.id,row.category,row.title,row.content,row.applicable_scenarios,provenance,row.content_sha256,
        embedding,embedding ? model : null,embedding ? DIMENSIONS : null]);
      if (result.rowCount !== 1) throw new Error('Corpus id conflicts with a private record; no records were changed');
      if (row.category === '案例') {
        const result = await client.query(`INSERT INTO public.strategy_cases
          (id,org_id,situation,approach,source,tags,is_general_knowledge,provenance,content_sha256,embedding,embedding_model,embedding_dimensions)
          VALUES ($1::uuid,NULL,$2,$3,'closr-general-corpus',$4,true,$5::jsonb,$6,$7::vector,$8,$9)
          ON CONFLICT (id) DO UPDATE SET situation=EXCLUDED.situation,approach=EXCLUDED.approach,tags=EXCLUDED.tags,
            provenance=EXCLUDED.provenance,
            embedding=CASE WHEN $7::vector IS NOT NULL THEN EXCLUDED.embedding WHEN strategy_cases.content_sha256=EXCLUDED.content_sha256 THEN strategy_cases.embedding ELSE NULL END,
            embedding_model=CASE WHEN $7::vector IS NOT NULL THEN EXCLUDED.embedding_model WHEN strategy_cases.content_sha256=EXCLUDED.content_sha256 THEN strategy_cases.embedding_model ELSE NULL END,
            embedding_dimensions=CASE WHEN $7::vector IS NOT NULL THEN EXCLUDED.embedding_dimensions WHEN strategy_cases.content_sha256=EXCLUDED.content_sha256 THEN strategy_cases.embedding_dimensions ELSE NULL END,
            content_sha256=EXCLUDED.content_sha256
          WHERE strategy_cases.is_general_knowledge=true AND strategy_cases.org_id IS NULL RETURNING id`,
        [caseId(row.id),row.title,row.content,row.applicable_scenarios,provenance,row.content_sha256,embedding,
          embedding ? model : null,embedding ? DIMENSIONS : null]);
        if (result.rowCount !== 1) throw new Error('Strategy case id conflicts with a private record');
        cases++;
      }
    }
    await client.query('COMMIT');
    return { knowledge: corpus.entries.length, strategyCases: cases, embedded: Boolean(embed), model: embed ? model : null };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

async function main() {
  const corpusPath = process.argv.find(x => x.startsWith('--corpus='))?.slice('--corpus='.length)
    ?? fileURLToPath(new URL('../data/knowledge/general-knowledge.json', import.meta.url));
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to your own PostgreSQL database');
  let embed;
  const model = process.env.AI_EMBEDDING_MODEL;
  if (process.argv.includes('--embed')) {
    if (!model || !process.env.AI_BASE_URL || !process.env.AI_API_KEY) throw new Error('--embed requires AI_EMBEDDING_MODEL, AI_BASE_URL and AI_API_KEY');
    embed = async text => {
      const response = await fetch(process.env.AI_BASE_URL.replace(/\/+$/, '') + '/embeddings', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text, dimensions: DIMENSIONS, encoding_format: 'float' }), signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}`);
      return (await response.json()).data?.[0]?.embedding;
    };
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: true } });
  await client.connect();
  try { console.log(JSON.stringify(await importCorpus(client, corpus, { embed, model }))); }
  finally { await client.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
