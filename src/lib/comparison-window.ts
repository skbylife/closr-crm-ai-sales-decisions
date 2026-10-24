export const COMPARISON_WINDOW_VALUES = [14, 30, 90] as const;
export type ComparisonWindow = (typeof COMPARISON_WINDOW_VALUES)[number];

export function normalizeComparisonWindow(value: unknown): ComparisonWindow {
  const n = Number(value);
  return (COMPARISON_WINDOW_VALUES as readonly number[]).includes(n)
    ? (n as ComparisonWindow)
    : 30;
}
