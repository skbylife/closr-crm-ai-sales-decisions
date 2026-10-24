// Lightweight direct PostgreSQL helper — bypasses PostgREST / supabase-js schema cache.
// Uses DATABASE_URL or SUPABASE_DB_URL environment variable.

import { Pool, type PoolConfig } from 'pg';

function getConnectionString(): string {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL or SUPABASE_DB_URL environment variable for direct PostgreSQL access',
    );
  }
  return url;
}

// SSL options:
//   PG_SSL=false                → disable TLS (local dev only)
//   PG_SSL_INSECURE=true        → TLS but skip cert validation (legacy fallback)
//   default                     → TLS with full certificate validation
function getSslConfig(): PoolConfig['ssl'] {
  if (process.env.PG_SSL === 'false') return false;
  if (process.env.PG_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

let _pool: Pool | null = null;

function createPoolConfig(): PoolConfig {
  return {
    connectionString: getConnectionString(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: getSslConfig(),
  };
}

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool(createPoolConfig());
  }
  return _pool;
}

/** Run a parameterised query and return rows. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query(text, params);
  return rows as T[];
}

/** Run a parameterised query and return the first row or null. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Quick connectivity check — useful for diagnostics. */
export async function ping(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[postgres] ping failed:', err);
    return false;
  }
}

/** Run related parameterized statements atomically on one checked-out connection. */
export async function withTransaction<T>(fn:(query:<R = Record<string, unknown>>(text:string,params?:unknown[])=>Promise<R[]>)=>Promise<T>):Promise<T>{
 const client=await getPool().connect();
 try{
  await client.query('BEGIN');
  const scopedQuery=async<R = Record<string, unknown>>(text:string,params?:unknown[]):Promise<R[]>=>{const result=await client.query(text,params);return result.rows as R[]};
  const result=await fn(scopedQuery);await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
