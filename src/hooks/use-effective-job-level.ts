'use client';

import { useAuth } from '@/lib/auth-context';

/** Job level is derived from the authenticated organization membership. */
export function useEffectiveJobLevel(): number {
  return useAuth().jobLevel;
}
