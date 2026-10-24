'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { SkeletonStatCard, SkeletonCard } from '@/components/ui/skeleton';

function HydrationSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden w-[220px] shrink-0 border-r border-border bg-[var(--chrome-bg)] lg:block">
        <div className="p-4 space-y-6">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-8 w-full rounded-lg" style={{ opacity: 1 - i * 0.1 }} />
            ))}
          </div>
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="space-y-2">
          <div className="skeleton h-4 w-16 rounded" />
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-4 w-64 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HydrationProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const isHydrated = useStore((s) => s.isHydrated);
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  // Hydrate from Supabase (both demo and real users — demo is now a real Supabase user)
  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [isHydrated, hydrate]);

  // Extra guard: if the authenticated user changes while this layout stays mounted,
  // force a fresh hydrate instead of reusing the previous user's result.
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (lastUserIdRef.current === null) {
      lastUserIdRef.current = currentUserId;
      return;
    }
    if (lastUserIdRef.current !== currentUserId) {
      lastUserIdRef.current = currentUserId;
      hydrate();
    }
  }, [user?.id, hydrate]);

  if (!isHydrated) {
    return <HydrationSkeleton />;
  }

  return <>{children}</>;
}
