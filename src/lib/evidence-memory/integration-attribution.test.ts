import { describe, expect, it } from 'vitest';
import { inferEmailAccount } from './integration-attribution';

describe('account attribution from recorded account data', () => {
  it.each(['https://www.north.example.invalid/about', 'north.example.invalid'])('uses a recorded website %s', website => {
    expect(inferEmailAccount({ id: 'email', sender: 'Buyer <buyer@north.example.invalid>' }, [{ id: 'north', name: 'North', website }])).toMatchObject({ accountId: 'north', matchMethod: 'sender_domain' });
  });
  it('accepts explicit domains and known contact domains', () => {
    for (const hint of [{ domain: 'north.example.invalid' }, { knownDomains: ['north.example.invalid'] }]) {
      expect(inferEmailAccount({ id: 'email', sender: 'buyer@north.example.invalid' }, [{ id: 'north', name: 'North', ...hint }]).accountId).toBe('north');
    }
  });
  it('does not guess a company from an old fixed domain/name pairing', () => {
    expect(inferEmailAccount({ id: 'email', sender: 'buyer@huawei.com' }, [{ id: 'unrelated', name: 'Huawei consulting' }]).accountId).toBeNull();
  });
  it('does not choose arbitrarily between accounts sharing a domain', () => {
    expect(inferEmailAccount({ id: 'email', sender: 'buyer@shared.example.invalid' }, [
      { id: 'one', name: 'One', website: 'shared.example.invalid' }, { id: 'two', name: 'Two', website: 'shared.example.invalid' },
    ]).accountId).toBeNull();
  });
  it('does not match suffix impersonation or invalid website URLs', () => {
    for (const website of ['https://north.example.invalid.attacker.invalid', 'https://user:password@north.example.invalid', 'javascript:alert(1)']) {
      expect(inferEmailAccount({ id: 'email', sender: 'buyer@north.example.invalid' }, [{ id: 'north', name: 'North', website }]).accountId).toBeNull();
    }
  });
  it('uses actual connection labels and ignores empty account names', () => {
    expect(inferEmailAccount({ id: 'email', connection_id: 'connection', subject: 'Hello' }, [{ id: 'empty', name: '' }, { id: 'north', name: 'North' }], [{ id: 'connection', config: { label: 'North mailbox' } }])).toMatchObject({ accountId: 'north', matchMethod: 'connection_label' });
  });
});
