import { describe, expect, it } from 'vitest';
import { hasDirectTaskAccess, parseAttachmentPath, validateAttachment, MAX_ATTACHMENT_BYTES } from './policy';

const user = '11111111-1111-4111-8111-111111111111';
describe('native attachment boundary', () => {
  it('accepts task filenames without mapping them to disk paths', () => {
    expect(parseAttachmentPath('task-attachments', `${user}/task_123/123_说明.pdf`))
      .toEqual({ ownerId: user, taskId: 'task_123', filename: '123_说明.pdf' });
  });
  it.each([
    `${user}/../secret`, `${user}/task_123/../../secret`, `${user}/task_123/%2e%2e`,
    `${user}/task_123/file\\name`, `${user}/task_123/file\u0000`, `/etc/passwd`,
    `${user}/task_123/.`, `${user}/task_123/..`, `not-a-user/task_123/file`,
  ])('rejects traversal or malformed path %s', path => {
    expect(() => parseAttachmentPath('task-attachments', path)).toThrow();
  });
  it('rejects unknown buckets, oversized payloads and executable document types', () => {
    expect(() => parseAttachmentPath('public', `${user}/task_123/file.txt`)).toThrow();
    expect(() => validateAttachment('text/html', 10)).toThrow();
    expect(() => validateAttachment('text/plain', MAX_ATTACHMENT_BYTES + 1)).toThrow();
    expect(() => validateAttachment('text/plain', -1)).toThrow();
    expect(() => validateAttachment('text/plain', MAX_ATTACHMENT_BYTES)).not.toThrow();
  });
  it('does not give an unrelated member or manager automatic task access', () => {
    const row = { id: 'task', org_id: 'org', user_id: 'another-user', assigned_to: null, role: 'member', job_level: 0, team_id: null };
    expect(hasDirectTaskAccess(row, user)).toBe(false);
    expect(hasDirectTaskAccess({ ...row, role: 'manager', job_level: 1 }, user)).toBe(false);
    expect(hasDirectTaskAccess({ ...row, assigned_to: user }, user)).toBe(true);
    expect(hasDirectTaskAccess({ ...row, role: 'admin' }, user)).toBe(true);
  });
});
