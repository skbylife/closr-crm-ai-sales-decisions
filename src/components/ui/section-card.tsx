export interface SectionCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  badge?: string | number;
  children: React.ReactNode;
  compact?: boolean;
}

export function SectionCard({ title, icon: Icon, iconColor, badge, children, compact = false }: SectionCardProps) {
  return (
    <div className="card-elevated overflow-hidden rounded-2xl border border-border-subtle bg-card">
      <div className={`flex items-center gap-3 border-b border-border-subtle px-5 ${compact ? "py-3.5" : "py-4"}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-subtle bg-background/85">
          <Icon className={`h-4 w-4 ${iconColor || "text-accent"}`} />
        </div>
        <h2 className={`${compact ? "text-[15px]" : "text-sm"} font-semibold tracking-tight text-foreground text-balance`}>{title}</h2>
        {badge !== undefined && (
          <span className="ml-auto rounded-full border border-border-subtle bg-background/90 px-2.5 py-1 text-[13px] font-semibold text-secondary">
            {badge}
          </span>
        )}
      </div>
      <div className={compact ? "p-4" : "p-5"}>
        {children}
      </div>
    </div>
  );
}
