'use client';

import { getRoleFocusCopy, type RoleFocusSurface } from '@/lib/role-focus';
import { useLocale } from '@/lib/i18n';

export function RoleFocusBanner({
  surface,
  jobLevel,
}: {
  surface: RoleFocusSurface;
  jobLevel: number | null | undefined;
}) {
  const { locale } = useLocale();
  const focus = getRoleFocusCopy(surface, jobLevel, locale);

  if (surface === 'account' && focus.role === 'executive') {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 rounded-full border border-accent/20 bg-accent/8 px-2 py-0.5 text-[11px] font-semibold text-accent">
          {focus.roleLabel}
        </span>
        <h2 className="min-w-0 text-sm font-semibold text-foreground">{focus.title}</h2>
      </div>
    </section>
  );
}
