# PostgreSQL-native self-hosting work plan

Status: native implementation and fresh Compose acceptance completed. The acceptance
covered first-owner setup, login/logout, CRM CRUD, private files, tenant/security
regressions, knowledge import, and persistence after container recreation. External
provider integrations and production data migration were not exercised.

## Required outcome

An operator can start a fresh PostgreSQL + pgvector database and the actual Closr
application through Docker Compose, without a Supabase account or Supabase services.
The current hosted/Supabase backend may remain an optional compatibility mode.
No production service, migration, database, or paid model is used for validation.

## Confirmed coupling

Static scan excludes test files. There are 950 non-Array `.from()` calls across 178
files, including three task storage bucket calls. The literal name inventory contains
82 table names and one storage bucket; dynamic table names require separate review.
There are 80 auth references across 39 files and SDK imports in 17 files (some type-only).
The application uses password auth, cookie sessions, invitation/admin user operations,
password recovery/change, callback code exchange, and TOTP MFA. Store synchronization
contains a realtime channel. 51 SQL files reference Auth/RLS/service roles or related
Supabase constructs. These are not solved by substituting a DATABASE_URL.

The existing `src/lib/postgres.ts` already supplies parameterized pg Pool queries.
BABEL vector storage and knowledge retrieval can be moved behind repositories using
that driver. The complete application also needs browser/server query boundaries,
authentication, authorization policies, uploads, and a reconciled fresh schema.

## Implemented architecture

- Next.js API handlers plus server-side `pg` repositories, PostgreSQL + pgvector.
- Local account/session authentication with HttpOnly cookies and database-backed
  session revocation; preserve invitation, password-change/recovery, and TOTP features.
- App-owned file storage on a Docker volume, served through authenticated handlers
  with organization/task ownership checks. S3-compatible storage can be optional later.
- First-run setup creates the first owner and organization atomically. No shared
  default login. Bootstrap closes after initialization; credentials stay operator-owned.
- Preserve organization/team/RBAC checks and database RLS; use a restricted runtime
  role plus transaction-local identity, not a universal table-owner connection for
  browser-originated CRUD. RPC calls become typed SQL/repository methods.
- Replace realtime subscriptions with an authenticated invalidation/polling transport
  that preserves cross-tab updates without exposing another tenant's records.

The native deployment uses no additional identity-provider or object-storage service.

## Implementation sequence

1. Reconcile schema and migration dependencies into a fresh PostgreSQL baseline; retain
   all 82 queried tables plus dynamically referenced tables, constraints, and indexes.
2. Add the native database interface and authentication/storage contracts; keep the
   legacy optional backend selectable. No direct PostgreSQL credentials in browsers.
3. Implement local authentication, initial-owner setup, memberships, session checks,
   recovery/MFA, and RLS identity plumbing before enabling native browser writes.
4. Port CRM CRUD, integrations and file uploads behind those boundaries. Reject
   unsupported operations explicitly; do not silently make existing features disappear.
5. Implement vector/profile/knowledge repositories, compatible embeddings, and
   repeatable general-knowledge import. Include readable text, provenance, tags,
   corpus version, content hashes, and model/dimension metadata; never mix customer
   records into the general corpus.
6. Supply health-gated Compose initialization and restart-safe migration/seed commands.

## Acceptance checks

- Start from an empty Docker volume without any SUPABASE_* values; create the first
  owner, log in/out, restart, and verify durable organization and CRM records.
- Test two organizations and roles, unauthenticated access, guessed IDs, query/RPC
  injection, session revocation, CSRF/origin enforcement and recovery/MFA boundaries.
- Upload, retrieve and remove a file; reject traversal and cross-tenant reads/deletes.
- Import the approved generic corpus twice without duplication. Verify readable text
  and provenance survive restart. Use deterministic, explicit test-only 1536-dimensional
  embeddings to test nearest-neighbor ranking and tenant/global-corpus scoping.
- Verify cultural decoding/strategic-play context receives retrieved knowledge with
  model calls stubbed. Reject dimension/model mismatches; test keyword fallback.
- Typecheck/build, targeted unit/integration tests, fresh-install browser flows, and
  a new complete secret/customer-data/license scan before any publication.

## Knowledge found in GitHub

`src/scripts/seed-knowledge-base.ts` contains 52 readable notes: negotiation 10,
sales methodology 12, psychology 10, game theory 6, business strategy 6, cases 8.
They are extracted without executing the seed script into
`data/knowledge/general-knowledge.json`. Per-item provenance decisions and four
transparent editorial changes are documented in `data/knowledge/provenance-review.json`.
This publication covers original summaries; it does not grant rights to referenced
third-party books or imply that their full text is included.

`src/lib/babel-engine/prompts/cultural.ts` contains six culture profiles and framework
text in source, already retained; `cultural.ts` has language/domain detection rules.
The strategy-case importer references an external `babel-strategy-cases.json` that is
not present in the tracked GitHub snapshot. Actual `strategy_cases`/`knowledge_base`
database rows have not been read; no authorized database export is currently supplied.
No claim is made that the 52 source notes equal the production corpus.
