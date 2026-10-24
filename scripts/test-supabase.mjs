import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', url);
console.log('Anon key:', key ? key.slice(0, 20) + '...' : 'MISSING');
console.log('Service key:', serviceKey ? serviceKey.slice(0, 20) + '...' : 'MISSING');

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const sb = createClient(url, serviceKey || key);

// Test 1: Check all tables
const tables = ['accounts', 'contacts', 'opportunities', 'intel_items', 'email_decodes', 
  'composed_emails', 'meeting_preps', 'discovery_notes', 'knowledge_items', 'user_settings'];

console.log('\nTable check:');
for (const t of tables) {
  const { data, error } = await sb.from(t).select('id').limit(0);
  console.log(`  ${error ? '❌' : '✅'} ${t}${error ? ': ' + error.message : ''}`);
}

// Test 2: Try inserting a text ID (not UUID)
try {
  const testId = 'test_' + Date.now().toString(36);
  const { error } = await sb.from('accounts').insert({ id: testId, name: 'TEST_CONNECTIVITY' });
  if (error) {
    console.log('\n❌ Text ID insert failed:', error.message);
    console.log('   → Schema uses uuid, but app generates text IDs. Must alter to text.');
  } else {
    console.log('\n✅ Text ID insert succeeded');
    await sb.from('accounts').delete().eq('id', testId);
    console.log('   Cleaned up test row.');
  }
} catch (e) {
  console.error('Insert test error:', e.message);
}
