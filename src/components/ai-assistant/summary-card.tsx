'use client';

interface SummaryItem {
  label: string;
  value: string;
  status?: 'ok' | 'warning' | 'error';
}

interface SummaryCardProps {
  metadata: Record<string, unknown>;
}

const statusIcon: Record<string, string> = {
  ok: '✅',
  warning: '⚠️',
  error: '❌',
};

export function SummaryCard({ metadata }: SummaryCardProps) {
  const title = (metadata.title as string) ?? '配置摘要';
  const items = (metadata.items as SummaryItem[]) ?? [];

  return (
    <div className="rounded-xl border border-border bg-sidebar p-3">
      <h4 className="text-sm font-semibold text-foreground mb-2">{title}</h4>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="flex items-center gap-1 text-foreground font-medium">
              {item.value}
              {item.status && (
                <span className="text-xs">{statusIcon[item.status]}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
