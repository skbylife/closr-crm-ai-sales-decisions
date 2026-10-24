'use client';

interface ProgressCardProps {
  metadata: Record<string, unknown>;
}

export function ProgressCard({ metadata }: ProgressCardProps) {
  const title = (metadata.title as string) ?? '进行中';
  const percent = (metadata.percent as number) ?? 0;
  const current = metadata.current as number | undefined;
  const total = metadata.total as number | undefined;
  const detail = metadata.detail as string | undefined;

  return (
    <div className="rounded-xl border border-border bg-sidebar p-3 mt-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">
          {current != null && total != null ? `${current}/${total}` : `${Math.round(percent)}%`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {detail && (
        <p className="text-xs text-muted-foreground mt-1.5">{detail}</p>
      )}
    </div>
  );
}
