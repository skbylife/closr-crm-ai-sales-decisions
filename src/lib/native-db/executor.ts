import { Pool, type PoolClient } from 'pg';
import type { NativeQueryContext, QueryFilter, QueryResult, QuerySpec } from './types';

// Server-only module: import only from route handlers/server adapters, never browser code.
// No schema/table/function supplied by the browser is interpolated without validation.
export const NATIVE_TABLES = new Set(`account_claims account_evidence account_knowledge_pages account_memory_snapshots account_open_questions accounts activity_logs agent_notifications ai_advices ai_events ai_forecasts ai_insights ai_invocation_logs audit_log channel_partners comments composed_emails contact_coverage_assignments contact_coverage_responsibilities contact_enrichment_log contact_opportunity_roles contact_profiles_v2 contacts data_quality_findings deal_registrations decode_feedbacks discovery_notes duplicate_candidates email_decodes engine_audit_events engine_evidence_refs engine_judgments engine_moves engine_source_records engine_win_gaps field_mappings forecasts import_jobs import_rows integration_audit_logs integration_connections integration_emails integration_sync_state integration_tokens integration_wecom_contacts integration_wecom_groups intel intel_items judgment_ownership_assignments knowledge_base knowledge_items knowledge_update_log leads meeting_preps meeting_recordings memory_conflicts merge_decisions opportunities opportunity_close_date_history opportunity_contacts opportunity_stage_history org_dashboard_configs org_invitations org_memberships org_wide_defaults organizations outreach_logs ownership_transfers pallas_action_proposals pallas_artifact_versions pallas_artifacts pallas_tool_runs play_relationships pool_rules products pursuit_team_member_responsibilities pursuit_team_members pursuit_teams quotas quote_items quotes record_shares relationship_edges relationship_signals responsibility_catalog rfp_ai_analyses rfp_competitors rfp_documents rfp_milestones rfps source_records strategic_plays strategy_cases sync_logs tasks teams timeline_event_links timeline_events user_settings`.split(/\s+/));
const SERVER_ONLY_TABLES = new Set(['integration_tokens']);
const OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd', 'ov']);
const ACTIONS = new Set(['select', 'insert', 'upsert', 'update', 'delete', 'rpc']);
const RPC_ARGUMENTS: Record<string, string[]> = {
  match_strategy_cases: ['query_embedding', 'match_count', 'filter_disc_type'],
  match_knowledge: ['query_embedding', 'match_count', 'filter_org_id', 'filter_account_id'],
  append_successful_strategy: ['p_profile_id', 'p_strategy'],
  increment_outreach_count: ['p_profile_id'],
};
const RELATIONS: Record<string, Record<string, [string, string]>> = {
  org_memberships: { organizations: ['org_id', 'id'] },
  contact_opportunity_roles: { contacts: ['contact_id', 'id'] },
};
let pool: Pool | undefined;
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the native PostgreSQL backend');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: true } });
  }
  return pool;
}
/** Test/controlled shutdown hook; no connection is created merely by importing this module. */
export async function closeNativeQueryPool() { const current = pool; pool = undefined; if (current) await current.end(); }
function identifier(name: unknown): string {
  if (typeof name !== 'string' || !/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error('Invalid SQL identifier');
  return '"' + name + '"';
}
function integer(value: unknown, label: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > max) throw new Error(`Invalid ${label}`);
  return value as number;
}
export function splitQueryList(value: string): string[] {
  if (typeof value !== 'string' || value.length > 20_000) throw new Error('Invalid query expression');
  const result: string[] = []; let depth = 0; let quote = ''; let start = 0; let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (quote && c === '\\') { escaped = true; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"') { quote = c; continue; }
    if (c === '(') depth++;
    if (c === ')') { depth--; if (depth < 0) throw new Error('Unbalanced query expression'); }
    if (depth > 12) throw new Error('Query nesting limit exceeded');
    if (c === ',' && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (depth || quote || escaped) throw new Error('Unbalanced query expression');
  result.push(value.slice(start).trim());
  if (result.some(x => !x)) throw new Error('Empty query expression');
  return result;
}
function unquote(value: string): string {
  if (value.startsWith('"')) { const parsed: unknown = JSON.parse(value); if (typeof parsed !== 'string') throw new Error('Invalid quoted value'); return parsed; }
  return value;
}
export interface CompiledQuery { sql: string; params: unknown[]; countSql?: string; countParams?: unknown[]; }
export type ColumnTypes = Record<string, string>;
export function compileNativeQuery(spec: QuerySpec, columnTypes: ColumnTypes = {}): CompiledQuery {
  if (!spec || typeof spec !== 'object' || !ACTIONS.has(spec.action)) throw new Error('Invalid query action');
  if (!Array.isArray(spec.filters) || !Array.isArray(spec.orders) || spec.filters.length > 100 || spec.orders.length > 20) throw new Error('Invalid query modifiers');
  if (spec.cardinality && !['single', 'maybeSingle'].includes(spec.cardinality)) throw new Error('Invalid result cardinality');
  if (spec.count && !['exact', 'planned', 'estimated'].includes(spec.count)) throw new Error('Invalid count method');
  if (spec.head !== undefined && typeof spec.head !== 'boolean') throw new Error('Invalid head option');
  const params: unknown[] = [];
  const bind = (v: unknown) => { if (v === undefined) throw new Error('Undefined query value'); params.push(v); return '$' + params.length; };
  const valueForColumn = (column: string, value: unknown) => ['json', 'jsonb'].includes(columnTypes[column]) && value !== null ? JSON.stringify(value) : value;
  if (spec.action === 'rpc') {
    if (spec.head || spec.count) throw new Error('RPC count/head modifiers are unsupported');
    const allowed = RPC_ARGUMENTS[spec.table];
    if (!allowed || !spec.rpcArgs || typeof spec.rpcArgs !== 'object' || Array.isArray(spec.rpcArgs)) throw new Error('Unsupported RPC');
    if (spec.filters.length || spec.orders.length || spec.limit !== undefined || spec.offset !== undefined) throw new Error('RPC modifiers are unsupported');
    const args = Object.entries(spec.rpcArgs).map(([key, value]) => {
      if (!allowed.includes(key)) throw new Error('Unsupported RPC argument');
      if (key === 'query_embedding') {
        if (!Array.isArray(value) || value.length !== 1536 || value.some(x => typeof x !== 'number' || !Number.isFinite(x))) throw new Error('Embedding must contain 1536 finite numbers');
        return `${identifier(key)} => ${bind('[' + value.join(',') + ']')}::vector`;
      }
      if (key === 'match_count') integer(value, 'match_count', 100);
      return `${identifier(key)} => ${bind(value)}`;
    });
    return { sql: `SELECT * FROM public.${identifier(spec.table)}(${args.join(', ')})`, params };
  }
  if (spec.action !== 'select' && spec.head) throw new Error('Mutation head modifier is unsupported');
  if (!NATIVE_TABLES.has(spec.table)) throw new Error('Table is not available through the native data API');
  const table = 'public.' + identifier(spec.table);
  const column = (name: unknown) => 't.' + identifier(name);
  function condition(filter: QueryFilter): string {
    if (!filter || typeof filter !== 'object') throw new Error('Invalid query filter');
    if (filter.expression !== undefined) {
      if (typeof filter.expression !== 'string') throw new Error('Invalid OR expression');
      return '(' + splitQueryList(filter.expression).map(x => expression(x, 0)).join(' OR ') + ')';
    }
    const col = column(filter.column); const op = filter.operator;
    if (!op || !OPERATORS.has(op)) throw new Error('Unsupported filter operator');
    let sql: string;
    if (op === 'is') {
      if (filter.value === null || filter.value === 'null') sql = `${col} IS NULL`;
      else if (filter.value === true || filter.value === 'true') sql = `${col} IS TRUE`;
      else if (filter.value === false || filter.value === 'false') sql = `${col} IS FALSE`;
      else throw new Error('IS accepts only null or boolean');
    } else if (op === 'in') {
      let values = filter.value;
      if (typeof values === 'string' && values.startsWith('(') && values.endsWith(')')) values = values === '()' ? [] : splitQueryList(values.slice(1, -1)).map(unquote);
      if (!Array.isArray(values) || values.length > 5000) throw new Error('IN requires a bounded array');
      sql = values.length ? `${col} IN (${values.map(bind).join(', ')})` : 'FALSE';
    } else if (filter.value === null && (op === 'eq' || op === 'neq')) sql = `${col} IS ${op === 'neq' ? 'NOT ' : ''}NULL`;
    else {
      const operators: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE', cs: '@>', cd: '<@', ov: '&&' };
      let value = valueForColumn(filter.column!, filter.value);
      if ((op === 'like' || op === 'ilike') && typeof value === 'string') value = value.replace(/\*/g, '%');
      sql = `${col} ${operators[op]} ${bind(value)}`;
    }
    return filter.negate ? `NOT (${sql})` : sql;
  }
  function expression(value: string, depth: number): string {
    if (depth > 12) throw new Error('Query nesting limit exceeded');
    const group = /^(and|or)\((.*)\)$/.exec(value);
    if (group) return '(' + splitQueryList(group[2]).map(x => expression(x, depth + 1)).join(group[1] === 'and' ? ' AND ' : ' OR ') + ')';
    const match = /^([a-z_][a-z0-9_]*)\.(not\.)?([a-z]+)\.([\s\S]*)$/.exec(value);
    if (!match) throw new Error('Invalid filter expression');
    return condition({ column: match[1], operator: match[3] as QueryFilter['operator'], value: unquote(match[4]), negate: Boolean(match[2]) });
  }
  function projection(value: string, sourceTable = spec.table, alias = 't'): string {
    return splitQueryList(value).map(part => {
      if (part === '*') return `${alias}.*`;
      const nested = /^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)\((.+)\)$/.exec(part);
      if (nested) {
        const [, renamed, relation, fields] = nested;
        const join = RELATIONS[sourceTable]?.[relation];
        if (!join || fields.includes('(')) throw new Error('Unsupported related-table projection');
        const relCols = projection(fields, relation, 'r');
        return `(SELECT row_to_json(related) FROM (SELECT ${relCols} FROM public.${identifier(relation)} r WHERE r.${identifier(join[1])} = ${alias}.${identifier(join[0])} LIMIT 1) related) AS ${identifier(renamed ?? relation)}`;
      }
      const parts = part.split(':');
      if (parts.length > 2) throw new Error('Invalid column projection');
      return `${alias}.${identifier(parts[parts.length - 1])}${parts.length === 2 ? ' AS ' + identifier(parts[0]) : ''}`;
    }).join(', ');
  }
  const selected = projection(spec.columns ?? '*');
  // Filter parameters are compiled before mutation parameters; positional numbering is retained.
  const where = spec.filters.length ? ' WHERE ' + spec.filters.map(condition).join(' AND ') : '';
  const countParams = params.slice();
  const order = spec.orders.length ? ' ORDER BY ' + spec.orders.map(x => {
    if (!x || typeof x.ascending !== 'boolean' || (x.nullsFirst !== undefined && typeof x.nullsFirst !== 'boolean')) throw new Error('Invalid ordering');
    return column(x.column) + (x.ascending ? ' ASC' : ' DESC') + (x.nullsFirst === undefined ? '' : x.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST');
  }).join(', ') : '';
  if (spec.action === 'select') {
    const limit = spec.limit === undefined ? 1000 : integer(spec.limit, 'limit', 10_000);
    const offset = spec.offset === undefined ? 0 : integer(spec.offset, 'offset', 1_000_000);
    return { sql: `SELECT ${selected} FROM ${table} t${where}${order} LIMIT ${bind(limit)} OFFSET ${bind(offset)}`, params,
      ...(spec.count || spec.head ? { countSql: `SELECT count(*)::bigint AS count FROM ${table} t${where}`, countParams } : {}) };
  }
  if (spec.orders.length || spec.limit !== undefined || spec.offset !== undefined) throw new Error('Mutation order/range modifiers are unsupported');
  const returning = spec.returning || spec.count ? ` RETURNING ${selected}` : '';
  if (spec.action === 'delete') return { sql: `DELETE FROM ${table} t${where}${returning}`, params };
  if (spec.action === 'update') {
    if (!spec.values || typeof spec.values !== 'object' || Array.isArray(spec.values)) throw new Error('UPDATE requires a record');
    const entries = Object.entries(spec.values).filter(([, value]) => value !== undefined);
    if (!entries.length) throw new Error('UPDATE requires fields');
    return { sql: `UPDATE ${table} t SET ${entries.map(([key, value]) => `${identifier(key)} = ${bind(valueForColumn(key, value))}`).join(', ')}${where}${returning}`, params };
  }
  if (spec.filters.length) throw new Error('INSERT/UPSERT filters are unsupported');
  const rows = Array.isArray(spec.values) ? spec.values : [spec.values];
  if (!rows.length || rows.length > 1000 || rows.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error('INSERT requires 1–1000 records');
  const keys = [...new Set(rows.flatMap(row => Object.keys(row!).filter(key => row![key] !== undefined)))];
  if (!keys.length || keys.length > 250) throw new Error('Invalid mutation fields');
  const values = rows.map(row => '(' + keys.map(key => row![key] === undefined ? 'DEFAULT' : bind(valueForColumn(key, row![key]))).join(', ') + ')').join(', ');
  let conflict = '';
  if (spec.action === 'upsert') {
    const target = splitQueryList(spec.onConflict ?? 'id'); target.forEach(identifier);
    const updateKeys = keys.filter(key => !target.includes(key));
    conflict = ` ON CONFLICT (${target.map(identifier).join(', ')}) DO ` + (spec.ignoreDuplicates || !updateKeys.length ? 'NOTHING' : 'UPDATE SET ' + updateKeys.map(key => `${identifier(key)} = EXCLUDED.${identifier(key)}`).join(', '));
  }
  return { sql: `INSERT INTO ${table} AS t (${keys.map(identifier).join(', ')}) VALUES ${values}${conflict}${returning}`, params };
}
async function columnsFor(client: PoolClient, table: string): Promise<ColumnTypes> {
  const { rows } = await client.query<{ name: string; type: string }>(`SELECT a.attname AS name, ty.typname AS type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type ty ON ty.oid=a.atttypid WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped`, [table]);
  return Object.fromEntries(rows.map(x => [x.name, x.type]));
}
function failure(message: string, code = 'NATIVE_QUERY_INVALID', status = 400): QueryResult { return { data: null, error: { message, code }, count: null, status, statusText: status === 401 ? 'Unauthorized' : 'Bad Request' }; }
export async function executeNativeQuery(spec: QuerySpec, context: NativeQueryContext = {}): Promise<QueryResult> {
  if (!context.admin && (!context.userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.userId))) return failure('Authentication required', 'NATIVE_AUTH_REQUIRED', 401);
  if (!context.admin && SERVER_ONLY_TABLES.has(spec?.table)) return failure('This table is server-only', '42501', 403);
  let client: PoolClient | undefined;
  try {
    // First validation occurs before connection acquisition; use empty metadata only for validation.
    compileNativeQuery(spec);
    client = await getPool().connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    if (!context.admin) {
      await client.query('SET LOCAL ROLE closr_app');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)", [context.userId]);
    }
    const compiled = compileNativeQuery(spec, spec.action === 'rpc' ? {} : await columnsFor(client, spec.table));
    let count: number | null = null;
    if (compiled.countSql) { const result = await client.query(compiled.countSql, compiled.countParams); count = Number(result.rows[0]?.count ?? 0); }
    const result = spec.head ? { rows: [], rowCount: 0 } : await client.query(compiled.sql, compiled.params);
    if (spec.count && count === null) count = result.rowCount ?? result.rows.length;
    let data: unknown = spec.head || (!spec.returning && spec.action !== 'select' && spec.action !== 'rpc') ? null : result.rows;
    if (spec.cardinality && !spec.head) {
      if (result.rows.length > 1 || (spec.cardinality === 'single' && result.rows.length !== 1)) {
        await client.query('ROLLBACK');
        return failure('JSON object requested, multiple (or no) rows returned', 'PGRST116', 406);
      }
      data = result.rows[0] ?? null;
    }
    await client.query('COMMIT');
    return { data, error: null, count, status: 200, statusText: 'OK' };
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    const e = error as { message?: string; code?: string };
    // Never return SQL statements, connection strings, row details, or stack traces.
    const message = e.code ? (['42703', '42P01'].includes(e.code) ? e.message ?? 'Database schema mismatch' : 'Database query failed') : e.message ?? 'Invalid query';
    return failure(message, e.code ?? 'NATIVE_QUERY_INVALID', e.code === '42501' ? 403 : 400);
  } finally { client?.release(); }
}
