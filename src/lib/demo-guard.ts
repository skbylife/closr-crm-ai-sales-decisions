// Demo mode helper
// Maintains a module-level userId so non-React code (Zustand store) can check demo status.

const DEMO_USER_ID = '61b768e1-d4c6-4b22-bceb-509334092895';

let _currentUserId: string | null = null;

/** Called from AuthProvider whenever the authenticated user changes. */
export function setCurrentDemoUserId(id: string | null) {
  _currentUserId = id;
}

/** Get the current user id (set by AuthProvider). */
export function getCurrentUserId(): string | null {
  return _currentUserId;
}

/** Returns true when the given userId is the demo account. */
export function isDemoUser(userId: string | null | undefined): boolean {
  return userId === DEMO_USER_ID;
}

/**
 * Demo 模式现在允许完整演示创建/编辑流程，因此不再拦截写操作。
 * 保留这个 helper 只是为了兼容旧调用点。
 */
export function demoGuard(action: string): boolean {
  if (isDemoUser(_currentUserId)) {
    console.info(`[demo-guard] Demo 用户允许写操作: ${action}`);
  }
  return false;
}
