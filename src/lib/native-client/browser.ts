'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createQueryClient } from '@/lib/native-db/query';
import { createNativeBrowserAuth } from '@/lib/native-auth/browser';
import { createNativeStorageClient } from '@/lib/native-storage/client';
import { createNativeChannel, removeNativeChannel, notifyNativeChange } from '@/lib/native-storage/realtime';

let client: SupabaseClient | null = null;

export function createNativeBrowserClient(): SupabaseClient {
  if (client) return client;
  const queries = createQueryClient(async (spec) => {
    try {
      const response = await fetch('/api/native/data', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
      const result = await response.json();
      if (!response.ok && !result.error) {
        return { data: null, error: { message: 'Database request failed', code: String(response.status) }, count: null, status: response.status, statusText: response.statusText };
      }
      if (!result.error && spec.action !== 'select' && spec.table) notifyNativeChange(spec.table);
      return result;
    } catch {
      return { data: null, error: { message: 'Database service is unavailable', code: 'NETWORK_ERROR' }, count: null, status: 503, statusText: 'Unavailable' };
    }
  });
  client = {
    ...queries,
    auth: createNativeBrowserAuth(),
    storage: createNativeStorageClient(),
    channel: createNativeChannel,
    removeChannel: removeNativeChannel,
  } as unknown as SupabaseClient;
  return client;
}
