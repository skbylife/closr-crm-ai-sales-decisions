export type QueryAction = 'select' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc';
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in' | 'cs' | 'cd' | 'ov';
export interface QueryFilter { column?: string; operator?: FilterOperator; value?: unknown; negate?: boolean; expression?: string; }
export interface QueryOrder { column: string; ascending: boolean; nullsFirst?: boolean; }
export interface QuerySpec {
  table: string;
  action: QueryAction;
  columns?: string;
  returning?: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[];
  filters: QueryFilter[];
  orders: QueryOrder[];
  limit?: number;
  offset?: number;
  cardinality?: 'single' | 'maybeSingle';
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
  onConflict?: string;
  ignoreDuplicates?: boolean;
  rpcArgs?: Record<string, unknown>;
}
export interface QueryError { message: string; code: string; details?: string; hint?: string; }
export interface QueryResult<T = unknown> { data: T | null; error: QueryError | null; count: number | null; status: number; statusText: string; }
export type QueryExecutor = (spec: QuerySpec) => Promise<QueryResult>;
export interface NativeQueryContext { userId?: string; admin?: boolean; }
