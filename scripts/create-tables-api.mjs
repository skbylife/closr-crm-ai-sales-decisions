// Legacy Supabase Cloud bootstrap path. Disabled by default because the
// Singapore line must not mutate the legacy hosted Supabase project.
if (process.env.CLOSR_ALLOW_LEGACY_SUPABASE_MANAGEMENT_API !== '1') {
  throw new Error('create-tables-api.mjs is disabled. Use scripts/run-migration.mjs with DATABASE_URL/SUPABASE_DB_URL for the self-hosted stack.');
}

// Execute SQL via Supabase Management API
const projectRef = 'uhtgqkphacogoqgzaoqt';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

// Read the SQL file
import { readFileSync } from 'fs';
const sql = readFileSync('scripts/create-schema.sql', 'utf8');

// First try: use the Supabase Management API /v1/projects/{ref}/database/query
const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

console.log('Status:', resp.status);
const body = await resp.text();
console.log('Response:', body.slice(0, 500));
