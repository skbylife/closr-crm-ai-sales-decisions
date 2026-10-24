import { describe, expect, it } from 'vitest';
import { getRoleFocusCopy, roleFocusRoleFromJobLevel } from './role-focus';

describe('role focus copy', () => {
  it('maps job levels to decision roles', () => {
    expect(roleFocusRoleFromJobLevel(0)).toBe('ae');
    expect(roleFocusRoleFromJobLevel(1)).toBe('manager');
    expect(roleFocusRoleFromJobLevel(2)).toBe('executive');
    expect(roleFocusRoleFromJobLevel(null)).toBe('ae');
  });

  it('gives each surface role-specific decision focus', () => {
    const horizonExecutive = getRoleFocusCopy('horizon', 2);
    const executive = getRoleFocusCopy('opportunity', 2);
    const manager = getRoleFocusCopy('opportunity', 1);
    const ae = getRoleFocusCopy('opportunity', 0);

    expect(horizonExecutive.title).toContain('经营判断');
    expect(executive.title).toContain('经营预测');
    expect(manager.title).toContain('校准打法');
    expect(ae.title).toContain('今天怎么推进');
    expect(new Set([executive.decision, manager.decision, ae.decision]).size).toBe(3);
  });
});
