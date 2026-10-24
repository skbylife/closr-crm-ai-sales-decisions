// 全局 Dashboard 骨架屏 — 页面加载时显示
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
      {/* 页面标题骨架 */}
      <div className="space-y-2">
        <div className="h-5 w-40 rounded bg-muted/20" />
        <div className="h-3 w-64 rounded bg-muted/10" />
      </div>

      {/* 统计卡片骨架 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-3 w-16 rounded bg-muted/15" />
            <div className="h-6 w-24 rounded bg-muted/20" />
          </div>
        ))}
      </div>

      {/* 内容区域骨架 */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="h-4 w-32 rounded bg-muted/20" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted/15 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-muted/15" />
              <div className="h-2.5 w-1/2 rounded bg-muted/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
