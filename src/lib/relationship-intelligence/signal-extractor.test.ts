import { describe, expect, it } from 'vitest';
import { extractRelationshipSignalsFromActivityLogs, extractRelationshipSignalsFromIntegrationEmails, extractRelationshipSignalsFromMeetingPreps } from './signal-extractor';
import type { ActivityLogRow, IntegrationEmailRow, MeetingPrepRow, SourceRecordRow } from './types';

const sourceRecords: SourceRecordRow[] = [
  { id: 'sr_email', org_id: 'org_1', account_id: 'acc_1', source_kind: 'email', source_table: 'integration_emails', source_row_id: 'email_1', title: '客户确认邮件', summary: '客户认可方案', occurred_at: '2026-05-10T10:00:00.000Z', metadata: {}, created_at: '2026-05-10T10:00:00.000Z' },
  { id: 'sr_activity', org_id: 'org_1', account_id: 'acc_1', source_kind: 'meeting', source_table: 'activity_logs', source_row_id: 'act_1', title: '技术评审会', summary: '技术认可', occurred_at: '2026-05-11T10:00:00.000Z', metadata: {}, created_at: '2026-05-11T10:00:00.000Z' },
];

describe('relationship signal extraction', () => {
  it('extracts integration email relationship signals with evidence and actor fallback', () => {
    const rows: IntegrationEmailRow[] = [{
      id: 'email_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      contact_id: 'contact_1',
      opportunity_id: 'opp_1',
      sender: 'guo.min@example.com',
      subject: '方案认可',
      summary: '郭敏明确支持A项目组进入试点评审。',
      sentiment: 'positive',
      intent: 'support',
      key_info: [],
      visible_to: ['user_a'],
      received_at: '2026-05-10T10:00:00.000Z',
      created_at: '2026-05-10T10:00:00.000Z',
    }];

    const [signal] = extractRelationshipSignalsFromIntegrationEmails(rows, sourceRecords);

    expect(signal).toEqual(expect.objectContaining({
      kind: 'email_interaction',
      valence: 'positive',
      actorUserId: 'user_a',
      contactId: 'contact_1',
    }));
    expect(signal.evidence).toEqual(expect.objectContaining({ sourceId: 'sr_email', sourceTable: 'integration_emails' }));
  });

  it('extracts activity logs as meeting signals when action type indicates a meeting', () => {
    const rows: ActivityLogRow[] = [{
      id: 'act_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      contact_id: 'contact_2',
      contact_name: '何强',
      opportunity_id: null,
      user_id: 'user_b',
      action_type: '会议',
      summary: '何强认可周晨的技术判断，建议进入联调。',
      metadata: { sentiment: 'positive' },
      created_at: '2026-05-11T10:00:00.000Z',
    }];

    const [signal] = extractRelationshipSignalsFromActivityLogs(rows, sourceRecords);

    expect(signal.kind).toBe('meeting');
    expect(signal.actorUserId).toBe('user_b');
    expect(signal.strength).toBeGreaterThan(40);
    expect(signal.evidence?.sourceId).toBe('sr_activity');
  });

  it('degrades safely when meeting prep does not identify contacts', () => {
    const rows: MeetingPrepRow[] = [{
      id: 'prep_1',
      org_id: 'org_1',
      account_id: 'acc_1',
      user_id: 'user_a',
      input: { objective: '准备会议' },
      result: { summary: '暂无联系人映射' },
      created_at: '2026-05-12T10:00:00.000Z',
    }];

    expect(extractRelationshipSignalsFromMeetingPreps(rows, [])).toEqual([]);
  });
});
