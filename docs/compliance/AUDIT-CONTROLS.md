# Audit Controls

## Current Enforced Audit Events

Resource DELETE routes call `recordComplianceAudit`; task attachments persist `attachment_delete_started` before bytes are touched and `attachment_delete_completed` with final metadata removal. Native password recovery records completion server-side. The auth audit endpoint validates an event vocabulary; some events are sent by UI code and the compatibility audit helper is best-effort.

Audit rows are ordinary PostgreSQL data, not an independently immutable archive. A success marker in source does not prove every execution records an event. Missing events may reflect failure, client reporting or incomplete coverage. Restrict database administrator access and separately protect exported evidence if your policy requires tamper resistance.

## Release Gate

Run auth audit checks and attachment failure-injection integration tests. Verify failed intent prevents removal and failed completion leaves retry metadata. Review payload minimization and external error logs; never include passwords, session tokens, model keys or raw customer bodies merely to improve diagnostics. Review non-DELETE mutation coverage separately from the explicit DELETE inventory.
