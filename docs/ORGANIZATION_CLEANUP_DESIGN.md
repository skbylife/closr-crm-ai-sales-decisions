# Organization cleanup: design and execution boundary

Status: design only. The product currently exposes a read-only owner inventory preview; there is no bulk deletion endpoint. Restoring a menu is not authorization to run an irreversible delete. Tests use synthetic records only.

## Tenant and authorization

Replace first-membership selection with an explicit authenticated active-organization context before enabling execution. Bind preview and execution to the same user, session and organization. Re-read membership under transaction lock and require exact `owner`; admin, executive job level, shared access and former ownership are insufficient. Reject tenant switches, membership revocation and ambiguous context. Never accept a body-supplied organization as authority.

Execution must be same-origin POST with recent password verification and, when enrolled, MFA verification. Apply retry limits. A five-minute, single-use server token binds actor, session, tenant, scope version, backup ID, row-count digest and expiry. Require the displayed organization name and an explicit cleanup phrase. GET, replay and expired tokens cannot execute.

## Scope and recoverability

The existing five-category inventory is not the deletion allowlist. Before enabling deletion, enumerate the complete foreign-key closure for each selected business category, including child rows without `org_id`, and classify every edge as delete, preserve or reject. Do not infer scope from table names or delete every table containing an organization column. Reject shared or cross-tenant edges. Account/user identities, organizations, memberships, MFA, sessions, invitations, deployment configuration, general BABEL knowledge and audit evidence are outside the default scope.

Require an encrypted, integrity-checked tenant snapshot and a successful restore rehearsal in an empty isolated database before presenting an executable confirmation. A settings JSON export is not such a snapshot. Store snapshots outside public/static and attachment download paths with explicit retention and access controls. Do not introduce a cloud backup service or credentials implicitly.

Keep attachment bytes in quarantine throughout the recovery window, preserving object metadata and checksums. No synchronous `unlink` is permitted in bulk cleanup. Retention expiry/purge requires a separately reviewed operator workflow.

## Atomic execution and recovery

Use a per-tenant advisory transaction lock, lock membership and affected rows, and recheck both authorization and the preview digest. Persist an immutable intent audit, snapshot reference and idempotency key. Apply a reviewed, versioned delete plan in one transaction with tenant predicates and explicit child joins. Any dependency, digest, backup or audit error aborts without partial success. Do not catch and ignore individual delete failures.

A completed audit records counts and scope version, not customer payloads, passwords, tokens or attachment names. Restoration requires owner reauthentication, snapshot integrity/schema checks and a declared conflict policy; reject conflicts rather than overwrite newer data. Restore metadata and quarantined bytes before releasing restored records. Verify checksums and per-table counts.

## Acceptance gates (must pass before execution is implemented/enabled)

| Gate | Required synthetic test |
| --- | --- |
| Identity | Anonymous 401; member/admin 403; revoked owner rejected |
| Context | Two tenants; forged tenant, multiple memberships, tenant switch rejected |
| Confirmation | Missing/wrong origin, stale digest, expired/replayed token rejected |
| Snapshot | Missing, corrupted, inaccessible or failed-restore backup prevents deletion |
| Atomicity | Inject failure at every write boundary; all business rows remain unchanged |
| Isolation | Tenant B row hashes, attachment checksums and audit scope unchanged |
| Preservation | Authentication, memberships, MFA, general knowledge and existing audit survive |
| Recovery | Tenant A data and attachment hashes match the pre-cleanup snapshot |
| Concurrency | Only one execution; no cleanup/restore race or stale preview execution |

Current executed regression covers the implemented preview only: owner-only counts, no body exposure, ambiguous membership rejection, foreign-tenant exclusion and mutation methods unavailable. The deletion, backup and restore gates above remain unimplemented; do not report them as passing.

## Single-attachment deletion is a separate existing capability

`/api/native/files` deletes explicitly selected task attachments after existing task authorization, same-origin and payload-size checks. Its new persisted intent audit blocks deletion if audit insertion fails. Completion is audited separately. This route still performs physical deletion and is not a bulk-cleanup or recovery mechanism. Filesystem and PostgreSQL operations are not one atomic transaction; an I/O/completion-audit failure returns an error and the intent record supports investigation. Do not promise all-or-nothing multi-file removal or recovery.
