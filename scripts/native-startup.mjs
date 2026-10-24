#!/usr/bin/env node
import { runNativeMigrations } from './native-db-migrate.mjs';
import { importCorpus } from './native-knowledge-import.mjs';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const result = await runNativeMigrations();
console.log(`Native schema ready (${result.applied.length} new migrations).`);
const corpus = JSON.parse(await readFile(new URL('../data/knowledge/general-knowledge.json', import.meta.url), 'utf8'));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: true } });
await client.connect();
try {
  const imported = await importCorpus(client, corpus);
  console.log('General knowledge import complete:', JSON.stringify(imported));
} finally { await client.end(); }
