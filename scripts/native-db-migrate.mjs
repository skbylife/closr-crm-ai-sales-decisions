#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

/** Applies reviewed native migrations to the operator's database, never a hosted API. */
export async function runNativeMigrations(options = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for native migrations');
  const migrationsDirectory = options.directory ?? fileURLToPath(new URL('../database/native/', import.meta.url));
  const client = new pg.Client({ connectionString, ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: true } });
  await client.connect();
  const applied = [];
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('closr-native-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS public.native_schema_migrations (
      name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('REVOKE ALL ON public.native_schema_migrations FROM PUBLIC');
    const files = (await readdir(migrationsDirectory)).filter(name => /^\d{3}[-_].*\.sql$/.test(name)).sort();
    if (files.length === 0) throw new Error('No native migrations found');
    for (const name of files) {
      const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
      const sha256 = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT sha256 FROM public.native_schema_migrations WHERE name=$1', [name]);
      if (existing.rows.length) {
        if (existing.rows[0].sha256 !== sha256) throw new Error(`Previously applied migration changed: ${name}; add a new migration instead`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.native_schema_migrations(name,sha256) VALUES($1,$2)', [name,sha256]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Native migration ${name} failed: ${error instanceof Error ? error.message : 'SQL execution failed'}`);
      }
    }
    return { applied, total: files.length };
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('closr-native-migrations'))").catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runNativeMigrations().then(result => {
    console.log(`Native migrations complete: ${result.applied.length} applied, ${result.total-result.applied.length} already current.`);
  }).catch(error => {
    // Do not print connection strings, environment variables, or query parameters.
    console.error(error instanceof Error ? error.message : 'Native migration failed');
    process.exitCode = 1;
  });
}
