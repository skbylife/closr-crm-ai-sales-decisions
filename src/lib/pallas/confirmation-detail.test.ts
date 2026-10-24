import { describe, expect, it } from 'vitest';
import { buildPallasConfirmationDetailContract } from './confirmation-detail';
import type { PallasActionProposal } from './types';

const proposal: PallasActionProposal = {
  id: 'draft_1',
  orgId: 'org_1',
  userId: 'user_1',
  artifactId: null,
  conversationId: 'pallas-strategic-play-action-board:play_1',
  context: {
    entityType: 'strategic_play',
    entityId: 'play_1',
    accountId: 'acc_1',
    opportunityId: 'opp_1',
    strategicPlayId: 'play_1',
  },
  status: 'draft',
  riskLevel: 'low',
  actions: [{
    toolName: 'create_task',
    displayName: '创建任务：准备技术评审材料',
    requiresConfirmation: true,
    fields: [{
      field: 'title',
      value: '准备技术评审材料',
      confidence: 'explicit',
      source_quote: '准备技术评审材料',
    }],
  }],
  sourceRefs: [],
  createdAt: '2026-05-17T05:00:00.000Z',
};

describe('Pallas confirmation detail contract', () => {
  it('keeps preview confirmation controls read-only and disconnected from execution', () => {
    const contract = buildPallasConfirmationDetailContract(proposal, {
      now: new Date('2026-05-17T06:00:00.000Z'),
    });

    expect(contract).toMatchObject({
      mode: 'preview',
      proposalId: 'draft_1',
      status: 'draft',
      statusLabel: '草稿',
      riskLabel: '低风险',
      isStale: false,
      expiresAt: '2026-05-18T05:00:00.000Z',
    });
    expect(contract.controls).toEqual([
      expect.objectContaining({ name: 'confirm', enabled: false }),
      expect.objectContaining({ name: 'reject', enabled: false }),
      expect.objectContaining({ name: 'expire', enabled: false }),
      expect.objectContaining({ name: 'execute', enabled: false }),
    ]);
    expect(contract.controls.map((control) => control.reason).join('\n')).toContain('预览永远不调用 execute-tools');
  });

  it('enables confirm, reject, and expire for persisted awaiting-confirmation proposals', () => {
    const contract = buildPallasConfirmationDetailContract({
      ...proposal,
      id: 'proposal_1',
      status: 'awaiting_confirmation',
      expiresAt: '2026-05-18T05:00:00.000Z',
    }, {
      mode: 'persisted',
      now: new Date('2026-05-17T06:00:00.000Z'),
    });

    expect(contract.mode).toBe('persisted');
    expect(contract.controls).toEqual([
      expect.objectContaining({ name: 'confirm', enabled: true, label: '确认提案' }),
      expect.objectContaining({ name: 'reject', enabled: true, label: '拒绝提案（不创建任务）' }),
      expect.objectContaining({ name: 'expire', enabled: true, label: '标记过期（不执行工具）' }),
      expect.objectContaining({ name: 'execute', enabled: false, label: '创建任务（不可用）' }),
    ]);
    expect(contract.controls.find((control) => control.name === 'confirm')?.reason).toContain('单独执行动作');
    expect(contract.controls.find((control) => control.name === 'reject')?.reason).toContain('不会创建任务');
    expect(contract.controls.find((control) => control.name === 'expire')?.reason).toContain('不会调用工具');
  });

  it('enables local task creation only after a persisted proposal is confirmed', () => {
    const contract = buildPallasConfirmationDetailContract({
      ...proposal,
      id: 'proposal_1',
      status: 'confirmed',
      expiresAt: '2026-05-18T05:00:00.000Z',
    }, {
      mode: 'persisted',
      now: new Date('2026-05-17T06:00:00.000Z'),
    });

    expect(contract.controls).toEqual([
      expect.objectContaining({ name: 'confirm', enabled: false }),
      expect.objectContaining({ name: 'reject', enabled: false }),
      expect.objectContaining({ name: 'expire', enabled: false }),
      expect.objectContaining({ name: 'execute', enabled: true, label: '创建 Closr 任务' }),
    ]);
    expect(contract.controls.find((control) => control.name === 'execute')?.reason).toContain('不会调用 execute-tools');
  });

  it('does not allow confirming stale persisted proposals', () => {
    const contract = buildPallasConfirmationDetailContract({
      ...proposal,
      id: 'proposal_1',
      status: 'awaiting_confirmation',
      expiresAt: '2026-05-18T05:00:00.000Z',
    }, {
      mode: 'persisted',
      now: new Date('2026-05-18T05:00:01.000Z'),
    });

    expect(contract.isStale).toBe(true);
    expect(contract.controls.find((control) => control.name === 'confirm')).toMatchObject({
      enabled: false,
      label: '确认（不可用）',
    });
    expect(contract.controls.find((control) => control.name === 'reject')?.enabled).toBe(true);
    expect(contract.controls.find((control) => control.name === 'expire')?.enabled).toBe(true);
  });

  it('spells out permission, expiration, rejection, execution, and audit boundaries', () => {
    const contract = buildPallasConfirmationDetailContract(proposal);

    expect(contract.boundaries.map((boundary) => boundary.kind)).toEqual([
      'permission',
      'expiration',
      'rejection',
      'execution',
      'audit',
    ]);
    expect(contract.boundaries.find((boundary) => boundary.kind === 'permission')?.description).toContain('重新校验');
    expect(contract.boundaries.find((boundary) => boundary.kind === 'rejection')?.description).toContain('不创建任务');
    expect(contract.boundaries.find((boundary) => boundary.kind === 'execution')?.description).toContain('单独接口');
  });

  it('marks stale draft previews without mutating the proposal status', () => {
    const contract = buildPallasConfirmationDetailContract(proposal, {
      now: new Date('2026-05-19T05:00:00.000Z'),
    });

    expect(contract.status).toBe('draft');
    expect(contract.statusLabel).toBe('草稿已过期');
    expect(contract.isStale).toBe(true);
    expect(contract.statusDescription).toContain('不执行服务器过期写入');
  });
});
