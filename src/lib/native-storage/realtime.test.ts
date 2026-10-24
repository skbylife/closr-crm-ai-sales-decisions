import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNativeChannel, notifyNativeChange, removeNativeChannel } from './realtime';

describe('native refresh transport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('staggered refreshes cover each table without a shared-debounce collision', async () => {
    const accounts = vi.fn(), tasks = vi.fn();
    const channel = createNativeChannel('test')
      .on('postgres_changes', { schema: 'public', table: 'accounts', event: '*' }, accounts)
      .on('postgres_changes', { schema: 'public', table: 'tasks', event: '*' }, tasks).subscribe();
    vi.advanceTimersByTime(1000);
    expect(accounts).toHaveBeenCalledTimes(1); expect(tasks).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(tasks).toHaveBeenCalledTimes(1);
    await removeNativeChannel(channel);
    vi.advanceTimersByTime(5000);
    expect(accounts).toHaveBeenCalledTimes(1); expect(tasks).toHaveBeenCalledTimes(1);
  });
  it('local mutation invalidations carry table names without row data', async () => {
    const callback = vi.fn();
    const channel = createNativeChannel('test').on('postgres_changes', { schema: 'public', table: 'tasks' }, callback).subscribe();
    notifyNativeChange('tasks');
    expect(callback).toHaveBeenCalledWith({ eventType: '*', table: 'tasks', schema: 'public' });
    notifyNativeChange('tasks;DROP TABLE');
    expect(callback).toHaveBeenCalledTimes(1);
    await channel.unsubscribe();
    notifyNativeChange('tasks');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
