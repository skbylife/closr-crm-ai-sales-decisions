const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

// Use the REST SQL endpoint via service role key
// We'll use the Supabase management API to run SQL
// Actually, let's use the pg endpoint through the /sql endpoint
// Supabase provides a SQL execution endpoint via the management API

// First, let's check if we can use the Supabase client to create tables
// via raw SQL. Actually, supabase-js doesn't support raw SQL.
// We need to use the Management API or create an RPC function.

// Let's try the pg-meta API which is available at port 8080
// Or use the /sql endpoint available in newer Supabase versions.

// Simplest approach: create tables via Supabase's REST API
// Actually the correct approach is POST to /pg/query with service role

const resp = await fetch(`${url}/pg/query`, {
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: 'SELECT 1 as test' }),
});

console.log('/pg/query status:', resp.status);
if (resp.ok) {
  console.log('Response:', await resp.json());
} else {
  console.log('Response:', await resp.text());
}

// Try the v1/sql endpoint
const resp2 = await fetch(`${url}/v1/sql`, {
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'text/plain',
  },
  body: 'SELECT 1 as test',
});

console.log('/v1/sql status:', resp2.status);
console.log('Response:', await resp2.text());
