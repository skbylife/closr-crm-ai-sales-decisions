# Native PostgreSQL database

These migrations initialize an empty PostgreSQL 16 database with pgvector 0.8.
They do not require Supabase, PostgREST, GoTrue, an external identity provider,
or a cloud account. Do not apply both this directory and the legacy Supabase
migration directories to the same database.

Run `node scripts/native-db-migrate.mjs` with operator-owned `DATABASE_URL`.
For an isolated local Docker database, set `PG_SSL=false`; remote connections
use certificate-verified TLS by default. The runner serializes migrations with
an advisory lock, records SHA-256 values, runs each file in a transaction and
skips unchanged migrations. Editing an applied migration fails closed; add a
new migration to upgrade an existing installation.

The schema baseline reconciles 99 original application tables and 244 source
index declarations. Each table retains source-path provenance comments. It
covers all 82 statically named application tables and additional tables used
through dynamic repositories. CRM record IDs are text; identities and
organizations remain UUIDs. Legacy UUID relationship columns pointing at text
CRM IDs were normalized. No customer records or database exports are included.

`closr_app` is a non-login, non-superuser, NOBYPASSRLS role. The authenticated
query executor must set transaction-local `request.jwt.claim.sub` from the
verified session and `SET LOCAL ROLE closr_app`. These SQL compatibility helper
names are implemented locally; they do not connect to a hosted Auth service.
Never give the browser a database connection or privileged database credentials.

The native schema enforces:

- Organization membership, account owner/team/job-level visibility and personal
  settings/profile visibility in RLS.
- Server-only membership writes, synchronization cursors, identity/session
  tables, audit writes and integration token vaults.
- Owner/admin-only invitation visibility and writes.
- Assigned users' same-organization task access without creator/tenant rewriting.
- All discovered parent foreign keys and standard relationship columns must
  reference the same organization. New or changed browser references must also
  fall within the user's parent-record visibility. This protects trusted server
  joins from forged cross-organization junction records.
- Composite relationship deletion retains `org_id` while nulling only the
  deleted entity reference. Update timestamps are maintained locally.

General knowledge is explicitly marked and read-only through the application
role. It is separate from customer/account knowledge; corpus import is an
operator/server operation. Embedding metadata and corpus definitions are in 050.

Validation against a disposable fresh database: all migrations applied, an
immediate second run applied zero files, and the transaction-only regression
script passed 37 checks. Run `scripts/native-db-schema-test.mjs` with the
explicit `CLOSR_SCHEMA_TEST_DATABASE_URL` pointing to an isolated migrated test
database to reproduce. All fixture data is fictional and rolled back. This
schema-level result does not by itself establish complete application/browser
acceptance or external integration readiness.

Tenant ownership is immutable, even for service writes. The existing same-organization
account handoff API remains able to update owner/user assignments after authorization;
the generic browser data endpoint cannot replace that workflow. Invitation writes likewise
remain server-only, preserving the API rule that only an owner may invite another admin.

Legacy compatibility boundary: automatic `dbMigrateUserDataToOrg` updates from an
unassigned (`org_id IS NULL`) row to an organization are not supported by this native
baseline. A fresh install has no such legacy records. Importing previously unassigned
personal data requires an explicit operator migration that moves the complete related
record set atomically; accepting an invitation is not an automatic legacy-data migration.
Do not disable tenant validation or move a parent row alone to work around this restriction.
