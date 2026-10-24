import { describe, expect, it } from 'vitest';
import type { StrategicPlay } from '@/lib/babel-engine/types';
import {
  buildStrategicPlayActionBoardArtifact,
  buildStrategicPlayActionBoardData,
  buildStrategicPlayActionProposals,
  isPallasActionBoardPreviewEnabled,
} from './strategic-play-action-board';

const play = {
  id: '11111111-1111-1111-1111-111111111111',
  orgId: 'org_1',
  accountId: 'acc_1',
  opportunityId: 'opp_1',
  goalDescription: '拿到 CFO 预算确认',
  steps: [
    {
      index: 1,
      title: '请 Champion 引荐 CFO',
      description: '让 Champion 介绍 CFO 的预算关注点',
      who: 'AE',
      target: 'Champion',
      action: '发送跟进邮件',
      timing: '本周',
      purpose: '确认预算链',
      expectedOutcome: 'Champion 给出 CFO 引荐',
      risk: 'Champion 回避',
      fallback: '找技术负责人侧证',
      status: 'planned',
      dueDate: '2026-05-20',
    },
    {
      index: 2,
      title: '完成安全材料',
      description: '发送安全问卷补充材料',
      who: 'SE',
      target: '安全负责人',
      action: '补材料',
      timing: '今天',
      purpose: '降低阻力',
      risk: '材料不完整',
      fallback: '安排安全会',
      status: 'completed',
    },
  ],
} as StrategicPlay;

describe('Pallas strategic play action board', () => {
  it('builds a whitelisted artifact payload without changing strategic play fields', () => {
    const artifact = buildStrategicPlayActionBoardArtifact(play);

    expect(artifact.kind).toBe('strategic_play_action_board');
    expect(artifact.context).toMatchObject({
      entityType: 'strategic_play',
      entityId: play.id,
      accountId: 'acc_1',
      opportunityId: 'opp_1',
      strategicPlayId: play.id,
    });
    expect((artifact.data as { items: unknown[] }).items).toHaveLength(2);
    expect(artifact.sourceRefs[0]).toMatchObject({ kind: 'closr_record', entityId: play.id });
  });

  it('normalizes steps into action board items', () => {
    const board = buildStrategicPlayActionBoardData(play);

    expect(board.items[0]).toMatchObject({
      stepIndex: 1,
      title: '请 Champion 引荐 CFO',
      owner: 'AE',
      status: 'planned',
      dueDate: '2026-05-20',
      priority: 'medium',
    });
  });

  it('creates task proposals only for unfinished steps', () => {
    const actions = buildStrategicPlayActionProposals({
      ...play,
      steps: [
        ...play.steps,
        {
          index: 3,
          title: '跳过旧路径',
          description: '这条路径不再推进',
          who: 'AE',
          target: '采购',
          action: '不执行',
          timing: '无',
          purpose: '避免重复动作',
          risk: '',
          fallback: '',
          status: 'skipped',
        },
      ],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      toolName: 'create_task',
      displayName: '创建任务：请 Champion 引荐 CFO',
      args: {
        title: '请 Champion 引荐 CFO',
        accountId: 'acc_1',
        opportunityId: 'opp_1',
        dueDate: '2026-05-20',
        strategicPlayId: play.id,
        strategicPlayStepIndex: 1,
      },
    });
    expect(actions[0].fields.map((field) => field.field)).toEqual([
      'title',
      'priority',
      'dueDate',
      'description',
      'accountId',
      'opportunityId',
    ]);
  });

  it('keeps the UI preview behind an explicit local URL switch', () => {
    expect(isPallasActionBoardPreviewEnabled(new URLSearchParams('pallas=1'))).toBe(true);
    expect(isPallasActionBoardPreviewEnabled(new URLSearchParams('pallas=action-board'))).toBe(true);
    expect(isPallasActionBoardPreviewEnabled(new URLSearchParams('pallas=strategic-play-action-board'))).toBe(true);
    expect(isPallasActionBoardPreviewEnabled(new URLSearchParams('pallas=0'))).toBe(false);
    expect(isPallasActionBoardPreviewEnabled(new URLSearchParams())).toBe(false);
  });
});
