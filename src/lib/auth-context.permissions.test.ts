import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, context: vi.fn(), hydrate: vi.fn().mockResolvedValue(undefined), getSession: vi.fn(), getItem: vi.fn(), callbacks: [] as Array<(event: string, session: unknown) => void> }));
vi.mock('react', async () => {
  const original = await vi.importActual<typeof import('react')>('react');
  return { ...original, useEffect: (effect: () => unknown) => { fixture.effects.push(effect); }, useState: (initial: unknown) => [initial, vi.fn()], useRef: (current: unknown) => ({ current }), useCallback: (callback: unknown) => callback };
});
vi.mock('@/lib/db', () => ({ clearOrgCache: vi.fn(), setAuthUserId: vi.fn(), setOrgContext: fixture.context }));
vi.mock('@/lib/store', () => ({ useStore: { getState: () => ({ resetForAuthChange: vi.fn(), hydrate: fixture.hydrate }) } }));
vi.mock('@/lib/auth-audit-client', () => ({ recordAuthAuditEvent: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getSession: fixture.getSession, onAuthStateChange: (callback: (event: string, session: unknown) => void) => { fixture.callbacks.push(callback); return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
  from: () => ({ select: () => ({ eq: (column: string) => column === 'user_id'
    ? Promise.resolve({ data: [{ org_id: 'test-org', role: 'member', job_title: 'ae', team_id: null, organizations: { name: 'Synthetic test organization' } }] })
    : { order: () => Promise.resolve({ data: [] }) } }) }),
}) }));
import { AuthProvider } from './auth-context';

afterEach(() => { fixture.effects.length = 0; fixture.callbacks.length = 0; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('hydrates only the authenticated membership scope despite stale role cookies and local storage', async () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { cookie: 'closr-demo-mode=true' });
  vi.stubGlobal('localStorage', { getItem: fixture.getItem.mockReturnValue('2') });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { headers: { 'content-type': 'application/json' } })));
  fixture.getSession.mockResolvedValue({ data: { session: { user: { id: 'synthetic-user', email: 'test@example.invalid' } } }, error: null });
  AuthProvider({ children: null });
  const cleanup = fixture.effects[0]() as () => void;
  await vi.waitFor(() => expect(fixture.hydrate).toHaveBeenCalledOnce());
  expect(fixture.context).toHaveBeenCalledExactlyOnceWith('test-org', 'member', null, 0);
  expect(fixture.getItem).not.toHaveBeenCalled();
  cleanup();
});

it('does not create a session or organization scope from a stale mode cookie', async () => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { cookie: 'closr-demo-mode=true' });
  vi.stubGlobal('localStorage', { getItem: fixture.getItem.mockReturnValue('2') });
  fixture.getSession.mockResolvedValue({ data: { session: null }, error: null });
  AuthProvider({ children: null });
  const cleanup = fixture.effects[0]() as () => void;
  await vi.waitFor(() => expect(fixture.hydrate).toHaveBeenCalledOnce());
  expect(fixture.context).not.toHaveBeenCalled();
  expect(fixture.getItem).not.toHaveBeenCalled();
  cleanup();
});
