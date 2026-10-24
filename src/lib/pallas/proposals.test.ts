import { describe, expect, it, vi } from 'vitest';
import type { PendingAction } from '@/components/chat/ConfirmationCard';
import {
  classifyPallasRisk,
  createPallasProposalDraft,
  toPallasProposedActions,
} from './proposals';
import {
  parsePallasArtifactBody,
  parsePallasEntityContext,
  parsePallasProposalBody,
  parsePallasStatusBody,
} from './api';
import { pallasContextColumns } from './server';

describe('Pallas proposal contracts', () => {
  it('converts existing pending actions without mutating or widening fields', () => {
    const actions: PendingAction[] = [{
      toolName: 'create_task',
      displayName: '创建跟进任务',
      requiresConfirmation: true,
      args: { title: '跟进李总', accountId: 'acc_1' },
      fields: [
        {
          field: 'title',
          value: '跟进李总',
          confidence: 'explicit',
          source_quote: '明天跟进李总',
        },
        {
          field: 'suggestedDueDate',
          value: '建议明天',
          confidence: 'inferred',
          source_quote: '',
          isBlocked: true,
        },
      ],
    }];

    const proposed = toPallasProposedActions(actions);

    expect(proposed).toEqual([{
      toolName: 'create_task',
      displayName: '创建跟进任务',
      requiresConfirmation: true,
      args: { title: '跟进李总', accountId: 'acc_1' },
      fields: [{
        field: 'title',
        value: '跟进李总',
        confidence: 'explicit',
        source_quote: '明天跟进李总',
        needsClarification: undefined,
        needs_clarification: undefined,
      }],
    }]);
    expect(actions[0].fields).toHaveLength(2);
  });

  it('classifies risk by the highest-risk action in the proposal', () => {
    expect(classifyPallasRisk([{ toolName: 'create_task' }])).toBe('low');
    expect(classifyPallasRisk([{ toolName: 'add_intel' }])).toBe('medium');
    expect(classifyPallasRisk([{ toolName: 'create_task' }, { toolName: 'update_opportunity' }])).toBe('high');
  });

  it('creates a draft proposal scoped to org/user/context', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const draft = createPallasProposalDraft({
      orgId: 'org_1',
      userId: 'user_1',
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      now: new Date('2026-05-17T05:00:00.000Z'),
      actions: [{
        toolName: 'create_task',
        displayName: '创建任务',
        requiresConfirmation: true,
        fields: [{
          field: 'title',
          value: '跟进 CFO',
          confidence: 'explicit',
          source_quote: '跟进 CFO',
        }],
      }],
    });

    expect(draft).toMatchObject({
      id: 'draft_4fzzzxjy',
      orgId: 'org_1',
      userId: 'user_1',
      artifactId: null,
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1', accountId: 'acc_1' },
      status: 'draft',
      riskLevel: 'low',
      createdAt: '2026-05-17T05:00:00.000Z',
    });
  });

  it('maps entity context to additive Pallas storage columns', () => {
    expect(pallasContextColumns({
      entityType: 'strategic_play',
      entityId: '11111111-1111-1111-1111-111111111111',
      accountId: 'acc_1',
    })).toEqual({
      entity_type: 'strategic_play',
      entity_id: '11111111-1111-1111-1111-111111111111',
      account_id: 'acc_1',
      contact_id: null,
      opportunity_id: null,
      strategic_play_id: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('parses API payloads without accepting unknown kinds or statuses', () => {
    expect(parsePallasEntityContext({ entityType: 'account', entityId: 'acc_1' })).toEqual({
      entityType: 'account',
      entityId: 'acc_1',
      accountId: undefined,
      contactId: undefined,
      opportunityId: undefined,
      strategicPlayId: undefined,
    });
    expect(parsePallasArtifactBody({
      kind: 'strategic_play_action_board',
      title: '行动板',
      context: { entityType: 'account', entityId: 'acc_1' },
      data: { items: [] },
    })).toMatchObject({ kind: 'strategic_play_action_board', title: '行动板' });
    expect(parsePallasArtifactBody({
      kind: 'unsafe_html',
      title: 'bad',
      context: { entityType: 'account', entityId: 'acc_1' },
    })).toBeNull();
    expect(parsePallasProposalBody({
      conversationId: 'conv_1',
      context: { entityType: 'account', entityId: 'acc_1' },
      actions: [{ toolName: 'create_task', displayName: '创建任务', requiresConfirmation: true, fields: [] }],
    })).toMatchObject({ conversationId: 'conv_1' });
    expect(parsePallasStatusBody({ status: 'succeeded', resultSummary: 'ok' })).toEqual({
      status: 'succeeded',
      resultSummary: 'ok',
    });
    expect(parsePallasStatusBody({ status: 'delete_everything' })).toBeNull();
  });
});
