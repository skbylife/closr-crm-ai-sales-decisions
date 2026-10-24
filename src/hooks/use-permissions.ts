import { useEffectiveJobLevel } from '@/hooks/use-effective-job-level';
import { getPlayPermissions, type PlayPermissions } from '@/lib/permissions';

export function usePlayPermissions(): PlayPermissions {
  const jobLevel = useEffectiveJobLevel();
  return getPlayPermissions(jobLevel ?? 0);
}
