/**
 * Integration utilities — 共用工具函数
 */

/**
 * 从 unknown error 中提取错误消息
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 节流函数 — 每次调用后等待指定延迟
 */
export async function throttledCall<T>(fn: () => Promise<T>, delayMs: number = 100): Promise<T> {
  const result = await fn();
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return result;
}

/**
 * 并发限制器 — 最多 N 个并行请求
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number = 5,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      }
    }
  }
  return results;
}
