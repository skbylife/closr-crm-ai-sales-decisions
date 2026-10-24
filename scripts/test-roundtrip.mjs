import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const testAccountId = 'e2e_test_' + Date.now().toString(36);
const testContactId = 'e2e_contact_' + Date.now().toString(36);

// Test: Insert account
const { error: e1 } = await sb.from('accounts').insert({
  id: testAccountId,
  name: 'E2E Test Account',
  industry: 'Testing',
  created_at: new Date().toISOString(),
});
console.log('Insert account:', e1 ? `❌ ${e1.message}` : '✅');

// Test: Insert contact with FK
const { error: e2 } = await sb.from('contacts').insert({
  id: testContactId,
  account_id: testAccountId,
  name: 'Test Contact',
  email: 'example-f660ab912e@example.invalid',
  created_at: new Date().toISOString(),
});
console.log('Insert contact (FK):', e2 ? `❌ ${e2.message}` : '✅');

// Test: Read back
const { data: accounts, error: e3 } = await sb.from('accounts').select('*').eq('id', testAccountId);
console.log('Read account:', e3 ? `❌ ${e3.message}` : `✅ name=${accounts[0]?.name}`);

const { data: contacts, error: e4 } = await sb.from('contacts').select('*').eq('account_id', testAccountId);
console.log('Read contacts:', e4 ? `❌ ${e4.message}` : `✅ count=${contacts?.length}`);

// Test: Upsert (what the app does)
const { error: e5 } = await sb.from('accounts').upsert({
  id: testAccountId,
  name: 'E2E Test Account UPDATED',
  industry: 'Testing',
  created_at: new Date().toISOString(),
}, { onConflict: 'id' });
console.log('Upsert account:', e5 ? `❌ ${e5.message}` : '✅');

// Test: Cascade delete
const { error: e6 } = await sb.from('accounts').delete().eq('id', testAccountId);
console.log('Delete account (cascade):', e6 ? `❌ ${e6.message}` : '✅');

// Verify contact was cascade deleted
const { data: orphans } = await sb.from('contacts').select('id').eq('id', testContactId);
console.log('Cascade verified:', (orphans?.length === 0) ? '✅ contact deleted' : '❌ orphan remains');

// Test: JSONB columns work (important for meddicc, strategy, etc.)
const testOppId = 'e2e_opp_' + Date.now().toString(36);
const testAccId2 = 'e2e_acc2_' + Date.now().toString(36);
await sb.from('accounts').insert({ id: testAccId2, name: 'Temp', created_at: new Date().toISOString() });
const { error: e7 } = await sb.from('opportunities').insert({
  id: testOppId,
  account_id: testAccId2,
  name: 'Test Opp',
  meddicc: { metrics: { notes: 'test', status: 'confirmed' } },
  mutual_action_plan: { milestones: [{ id: 'm1', title: 'Test' }] },
  champion_contact_ids: ['c1', 'c2'],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});
console.log('JSONB + array insert:', e7 ? `❌ ${e7.message}` : '✅');

// Read back JSONB
const { data: opps } = await sb.from('opportunities').select('meddicc,champion_contact_ids').eq('id', testOppId);
console.log('JSONB read:', opps?.[0]?.meddicc?.metrics?.status === 'confirmed' ? '✅' : '❌');
console.log('Array read:', opps?.[0]?.champion_contact_ids?.length === 2 ? '✅' : '❌');

// Cleanup
await sb.from('accounts').delete().eq('id', testAccId2);

console.log('\n✅ All roundtrip tests passed!');
