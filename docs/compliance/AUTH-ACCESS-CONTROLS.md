# Authentication and access controls

This document describes implementation and verification, not a security certification.

## Native PostgreSQL deployment

The documented self-hosting path uses application-owned authentication in `src/lib/native-auth/service.ts`. Passwords use scrypt; sessions are random opaque tokens whose hashes are stored in `auth.native_sessions`. Cookies are HTTP-only and SameSite=Lax, with Secure enabled for HTTPS origins. Mutation handlers enforce the configured origin. Login attempts have database-backed rate limits. Initial setup uses an advisory transaction lock so two requests cannot create two initial owners. Complete setup while the service is private.

MFA factors are stored in **auth.native_mfa**, with encrypted TOTP secrets and replay-counter checks. Native verified MFA changes invalidate lower-assurance sessions. Recovery tokens are single-use and expire; password recovery revokes sessions and does not bypass verified MFA. Back up the private application volume containing the encryption key with the database. See `SELF_HOSTING.md` for operator recovery; do not share recovery links publicly.

The optional legacy Supabase implementation uses **auth.mfa_factors**. It is not required by native deployment. `scripts/verify-mfa-posture-controls.mjs` selects the correct factor table from the same backend selector as the application; selecting a backend is not permission to connect to a production database.

## MFA Posture Gate

Owner/Admin users should enroll through **Settings > Security**. `/api/security/mfa-posture` requires authenticated admin access and summarizes privileged members' verified factors. This is a posture report, not automatic global MFA enforcement. A new private installation initially has an owner without an enrolled factor; a live posture gate must fail until enrollment is complete.

Run `node scripts/verify-mfa-posture-controls.mjs` for source/document checks. For live checks explicitly provide the intended database and backend; use isolated synthetic databases during development. The verifier must reject privileged users lacking a verified factor. Native authentication integration tests exercise enrollment, challenge/verification, replay rejection, lower-assurance session rejection and recovery. Static marker checks alone do not establish those properties.

## Tenant and resource access

Browser database requests execute under `closr_app` with transaction-local, server-verified identity; `database/native/030-rls.sql` and subsequent migrations enforce tenant and resource scope. Server service connections bypass that role and therefore require explicit API authorization. Task attachments re-read membership and task access, validate logical paths, and never serve arbitrary filesystem paths. General knowledge is intentionally readable under its documented shared-knowledge policy; customer rows are not general knowledge.

`get-org-id.ts` still selects the first membership. Organization-wide cleanup therefore rejects multiple memberships and remains **preview-only**. Do not enable destructive cleanup based on this implicit selection. See `docs/ORGANIZATION_CLEANUP_DESIGN.md`.

## Audit coverage and limits

The authenticated auth-event endpoint accepts a fixed event vocabulary including `login_success`, `logout`, `password_reset_completed`, `mfa_enabled` and `mfa_disabled`. Some UI events use the compatibility audit helper, which is best-effort; client-originated event reporting is not tamper-proof evidence of every authentication attempt. Native recovery writes its completion event server-side. **Generic failed login** responses avoid disclosing whether an email exists, but do not imply a durable audit record for every rejected login.

Attachment removal persists an intent before touching bytes; failed intent persistence blocks removal. Final audit and metadata removal share a database transaction. A finalization failure leaves a hidden tombstone for retry, not recoverable file bytes. Batch file removal is not filesystem/database atomic. Bulk organization deletion is unavailable.

Evidence: native auth service/handler/crypto integration and unit tests; native query, handoff, knowledge and attachment PostgreSQL integration suites; attachment DELETE boundary tests; catalog/management permission tests. Run them against disposable databases, never infer a production posture from a passing local suite.
