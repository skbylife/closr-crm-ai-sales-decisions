import type { FilterOperator, QueryExecutor, QueryFilter, QueryResult, QuerySpec } from './types';

/** Browser-safe, transport-independent builder. Never contains a database credential. */
export class NativeQuery implements PromiseLike<QueryResult> {
  private promise?: Promise<QueryResult>;
  private throws = false;
  private signal?: AbortSignal;
  constructor(private readonly execute: QueryExecutor, private readonly spec: QuerySpec) {}
  private change(fn: () => void) { if (this.promise) throw new Error('A query cannot be changed after execution'); fn(); return this; }
  select(columns = '*', options: { count?: QuerySpec['count']; head?: boolean } = {}) {
    return this.change(() => { this.spec.columns = columns; this.spec.returning = true; if (options.count !== undefined) this.spec.count = options.count; if (options.head !== undefined) this.spec.head = options.head; });
  }
  insert(values: QuerySpec['values'], options: { count?: QuerySpec['count']; defaultToNull?: boolean } = {}) {
    return this.change(() => { if (options.defaultToNull) throw new Error('defaultToNull is unsupported; use explicit null values'); this.spec.action = 'insert'; this.spec.values = values; this.spec.returning = false; this.spec.count = options.count; });
  }
  upsert(values: QuerySpec['values'], options: { onConflict?: string; ignoreDuplicates?: boolean; count?: QuerySpec['count']; defaultToNull?: boolean } = {}) {
    return this.change(() => { if (options.defaultToNull) throw new Error('defaultToNull is unsupported; use explicit null values'); this.spec.action = 'upsert'; this.spec.values = values; this.spec.returning = false; this.spec.onConflict = options.onConflict; this.spec.ignoreDuplicates = options.ignoreDuplicates; this.spec.count = options.count; });
  }
  update(values: Record<string, unknown>, options: { count?: QuerySpec['count'] } = {}) { return this.change(() => { this.spec.action = 'update'; this.spec.values = values; this.spec.returning = false; this.spec.count = options.count; }); }
  delete(options: { count?: QuerySpec['count'] } = {}) { return this.change(() => { this.spec.action = 'delete'; this.spec.returning = false; this.spec.count = options.count; }); }
  private add(filter: QueryFilter) { return this.change(() => { this.spec.filters.push(filter); }); }
  eq(column: string, value: unknown) { return this.add({ column, operator: 'eq', value }); }
  neq(column: string, value: unknown) { return this.add({ column, operator: 'neq', value }); }
  gt(column: string, value: unknown) { return this.add({ column, operator: 'gt', value }); }
  gte(column: string, value: unknown) { return this.add({ column, operator: 'gte', value }); }
  lt(column: string, value: unknown) { return this.add({ column, operator: 'lt', value }); }
  lte(column: string, value: unknown) { return this.add({ column, operator: 'lte', value }); }
  like(column: string, value: string) { return this.add({ column, operator: 'like', value }); }
  ilike(column: string, value: string) { return this.add({ column, operator: 'ilike', value }); }
  is(column: string, value: boolean | null) { return this.add({ column, operator: 'is', value }); }
  in(column: string, value: unknown[]) { return this.add({ column, operator: 'in', value }); }
  contains(column: string, value: unknown) { return this.add({ column, operator: 'cs', value }); }
  containedBy(column: string, value: unknown) { return this.add({ column, operator: 'cd', value }); }
  overlaps(column: string, value: unknown) { return this.add({ column, operator: 'ov', value }); }
  not(column: string, operator: FilterOperator, value: unknown) { return this.add({ column, operator, value, negate: true }); }
  filter(column: string, operator: FilterOperator, value: unknown) { return this.add({ column, operator, value }); }
  match(values: Record<string, unknown>) { for (const [column, value] of Object.entries(values)) this.eq(column, value); return this; }
  or(expression: string, options?: { foreignTable?: string; referencedTable?: string }) { if (options?.foreignTable || options?.referencedTable) throw new Error('Related-table OR filters are unsupported'); return this.add({ expression }); }
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string } = {}) {
    return this.change(() => { if (options.foreignTable || options.referencedTable) throw new Error('Related-table ordering is unsupported'); this.spec.orders.push({ column, ascending: options.ascending ?? true, nullsFirst: options.nullsFirst }); });
  }
  limit(count: number, options?: { foreignTable?: string; referencedTable?: string }) { if (options?.foreignTable || options?.referencedTable) throw new Error('Related-table limits are unsupported'); return this.change(() => { this.spec.limit = count; }); }
  range(from: number, to: number) { return this.change(() => { this.spec.offset = from; this.spec.limit = to - from + 1; }); }
  single() { return this.change(() => { this.spec.cardinality = 'single'; }); }
  maybeSingle() { return this.change(() => { this.spec.cardinality = 'maybeSingle'; }); }
  returns<T>() { return this as unknown as NativeQuery & PromiseLike<QueryResult<T>>; }
  throwOnError() { this.throws = true; return this; }
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }
  then<TResult1 = QueryResult, TResult2 = never>(onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    if (!this.promise) this.promise = Promise.resolve().then(async () => {
      if (this.signal?.aborted) throw this.signal.reason ?? new Error('Query aborted');
      const result = await this.execute(structuredClone(this.spec));
      if (this.throws && result.error) throw Object.assign(new Error(result.error.message), result.error);
      return result;
    });
    return this.promise.then(onfulfilled, onrejected);
  }
}
export function createQueryClient(execute: QueryExecutor) {
  return {
    from(table: string) { return new NativeQuery(execute, { table, action: 'select', columns: '*', returning: true, filters: [], orders: [] }); },
    rpc(name: string, args: Record<string, unknown> = {}, options: { count?: QuerySpec['count']; head?: boolean; get?: boolean } = {}) {
      if (options.get) throw new Error('GET RPC execution is unsupported');
      return new NativeQuery(execute, { table: name, action: 'rpc', rpcArgs: args, filters: [], orders: [], returning: true, count: options.count, head: options.head });
    },
  };
}
