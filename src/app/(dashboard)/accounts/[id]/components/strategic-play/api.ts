import type {
  StrategicPlay,
} from '@/lib/babel-engine/types';

export async function patchStrategicPlay(play: StrategicPlay, patch: Record<string, unknown>): Promise<Response> {
  const res = await fetch('/api/strategic-play', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playId: play.id,
      expectedUpdatedAt: play.updatedAt ?? undefined,
      ...patch,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? '更新失败，请刷新后重试');
  }
  return res;
}

export function strategicPlayPatchErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '更新失败，请刷新后重试';
}
