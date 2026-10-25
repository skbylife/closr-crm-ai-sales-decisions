# Enterprise Compliance Evidence Matrix

## Evidence Matrix

| Control | Implementation | Executable evidence | Limit |
|---|---|---|---|
| Native authentication | `src/lib/native-auth/service.ts`, `handler.ts`, `crypto.ts` | Native auth unit/request tests and `service.integration.test.ts` | Tests use synthetic identities; not production certification |
| MFA and privileged auth posture | `/api/security/mfa-posture`, native `auth.native_mfa`; legacy `auth.mfa_factors` | `verify-mfa-posture-controls.mjs`, native auth integration tests; live negative/positive posture checks | Static checks do not prove enrollment; new owner must enroll |
| Tenant/resource isolation | `native-db/executor.ts`, native RLS migrations, API guards | Native query/handoff/knowledge integration tests; catalog and management tests; live RLS verifier | Service connections require independent API scope; shared general knowledge is deliberate |
| Task attachments | `native-storage/server.ts`, policy/request helpers | File HTTP/service tests and PostgreSQL fault injection | Physical deletion is not recoverable from audits; batch is not atomic |
| Auth event reporting | Auth audit route/client and compatibility helper | `verify-auth-audit-controls.mjs` plus request tests | Some reporting is client-driven and best-effort |
| Rate limiting, WAF, and monitoring | Proxy quotas, health route, error monitor, response headers | `npm run verify:production-controls`; rate-limit/proxy tests | External WAF/TLS/alert systems require operator evidence |
| Bulk cleanup | Owner-only inventory preview | Catalog/management rejection tests | No bulk deletion/restore endpoint; recovery design is not implementation |
| Release hygiene | Tracked-source scan and documented checkout/build | Exact commit, scan triage, build/test logs, clean Compose verification | A failed or skipped deployment check cannot be replaced by prior-version evidence |

For native verification set `CLOSR_DATABASE_BACKEND=postgres`. Live checks need an explicitly chosen database; never point them at a real tenant merely to obtain a passing report. Tests requiring a disposable database enforce their own test-name guards. Keep resulting logs free of credentials and real customer payloads.

## Required Before Formal Enterprise Production Use

Review the [go-live checklist](ENTERPRISE-GO-LIVE-CHECKLIST.md), actual external controls and a complete recovery drill. Source markers and synthetic tests do not certify a customer environment. Keep live-data approvals and legal/provider commitments separate from source publication.
