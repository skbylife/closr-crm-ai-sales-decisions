/**
 * Shared formatting utility functions
 */

export function formatDealValue(v?: number): string {
  if (!v) return "—";
  if (v >= 10000) return `$${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}万`;
  return `$${v.toLocaleString()}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
