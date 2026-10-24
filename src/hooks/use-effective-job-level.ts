'use client';

import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';

export function useEffectiveJobLevel(): number {
  const { isDemo, jobLevel: authJobLevel } = useAuth();
  const storeJobLevel = useStore((state) => state.jobLevel) ?? 0;
  if (!isDemo) return authJobLevel;
  return storeJobLevel;
}
