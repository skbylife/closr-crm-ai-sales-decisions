import { readFileSync } from 'fs';

if (process.env.CLOSR_ALLOW_LEGACY_SUPABASE_SQL_API !== '1') {
  throw new Error('create-tables-pg.mjs is disabled. Use scripts/run-migration.mjs with DATABASE_URL/SUPABASE_DB_URL for the self-hosted stack.');
}

// Supabase direct connection: postgresql://EXAMPLE_USER:EXAMPLE_PASSWORD@db.example.invalid:5432/EXAMPLE_DB
// Or: postgresql://EXAMPLE_USER:EXAMPLE_PASSWORD@db.example.invalid:5432/EXAMPLE_DB
// The password is the database password set during project creation.

// We need to get it from the env or Supabase dashboard. 
// Let's try the pooler connection string format that Supabase provides.
// Use only your own project reference.

// Actually, let's try another approach: use the Supabase REST API with service role
// to create an RPC function that executes SQL.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase provides a /rest/v1/rpc endpoint. If we create a function first...
// But we can't create a function without SQL access. Chicken-and-egg.

// Let's try the Supabase SQL API (newer feature)
// POST https://<project-ref>.supabase.co/sql with Bearer: service_role_key
const sqlContent = readFileSync('scripts/create-schema.sql', 'utf8');

const resp = await fetch(`${url}/sql`, {
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sqlContent }),
});

console.log('Status:', resp.status);
const body = await resp.text();
console.log('Response:', body.slice(0, 1000));

if (resp.status === 404) {
  console.log('\nTrying alternative endpoint...');
  
  // Try the pg endpoint
  const resp2 = await fetch(`${url}/pg`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: 'SELECT 1' }),
  });
  console.log('/pg Status:', resp2.status);
  console.log('/pg Response:', await resp2.text());
}
