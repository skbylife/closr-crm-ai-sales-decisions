'use client';

type Listener = { table: string; callback: (payload: unknown) => void };
const localListeners = new Set<(table: string) => void>();
let broadcast: BroadcastChannel | null = null;

function broadcastChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcast) {
    broadcast = new BroadcastChannel('closr-native-invalidation');
    broadcast.onmessage = event => {
      const table = event.data?.table;
      if (typeof table === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(table)) {
        localListeners.forEach(listener => listener(table));
      }
    };
  }
  return broadcast;
}

/** Sends invalidation only, never records, identifiers, user information or credentials. */
export function notifyNativeChange(table: string) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(table)) return;
  localListeners.forEach(listener => listener(table));
  broadcastChannel()?.postMessage({ table });
}

export function createNativeChannel(_name: string) {
  const listeners: Listener[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let position = 0;
  const dispatch = (listener: Listener) => listener.callback({ eventType: '*', table: listener.table, schema: 'public' });
  const invalidate = (table: string) => listeners.filter(listener => listener.table === table).forEach(dispatch);
  const channel = {
    on(event: string, filter: { schema?: string; table?: string; event?: string }, callback: Listener['callback']) {
      if (timer) throw new Error('Subscribe after registering change handlers');
      if (event !== 'postgres_changes' || filter.schema !== 'public' || !filter.table || !/^[a-z][a-z0-9_]{0,63}$/.test(filter.table)) {
        throw new Error('Unsupported native subscription');
      }
      listeners.push({ table: filter.table, callback });
      return channel;
    },
    subscribe(callback?: (status: string) => void) {
      if (timer) return channel;
      localListeners.add(invalidate);
      broadcastChannel();
      // One table per second avoids simultaneous callbacks being dropped by the
      // store's shared 500 ms debounce. Every table is reloaded through authenticated
      // queries, so this remains correct across tabs, users and server-side writes.
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!listeners.length) return;
        dispatch(listeners[position++ % listeners.length]);
      }, 1000);
      callback?.('SUBSCRIBED');
      return channel;
    },
    async unsubscribe() {
      if (timer) clearInterval(timer);
      timer = null;
      localListeners.delete(invalidate);
      if (!localListeners.size) { broadcast?.close(); broadcast = null; }
      return 'ok' as const;
    },
  };
  return channel;
}

export async function removeNativeChannel(channel: { unsubscribe(): Promise<string> }) {
  return channel.unsubscribe();
}
