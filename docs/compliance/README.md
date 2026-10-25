# Closr Enterprise Compliance Evidence Packet

## Customer Review Scope

These documents describe controls, evidence and known limits. They are not legal or regulatory attestations.

## Document Index

- [Authentication, MFA and tenant access](AUTH-ACCESS-CONTROLS.md)
- [Edge and monitoring controls](EDGE-PROTECTION-MONITORING.md)
- [Evidence matrix](EVIDENCE-MATRIX.md)
- [Organization cleanup design](../ORGANIZATION_CLEANUP_DESIGN.md)

Use `CLOSR_DATABASE_BACKEND=postgres npm run verify:security` for the native path. Without a database URL, live MFA/RLS checks explicitly skip and only source/document checks run. `npm run verify:production-controls` checks application wiring and, for recognized enterprise targets, required operator configuration. Neither command provisions or verifies an external WAF/monitoring service.

A deployable release also needs full tests, explicit disposable-database integration tests, a successful clean documented installation, owner/MFA and tenant checks, attachment persistence, and backup/restore evidence. Record exact commits and all failed/skipped checks. See [self-hosting](../../SELF_HOSTING.md); keep first setup private and model keys unset during initial verification.

- [Dpa Summary](DPA-SUMMARY.md)
- [Subprocessors](SUBPROCESSORS.md)
- [Ai Data Processing Addendum](AI-DATA-PROCESSING-ADDENDUM.md)
- [Ai Provider Byom](AI-PROVIDER-BYOM.md)
- [Data Residency](DATA-RESIDENCY.md)
- [Incident Response](INCIDENT-RESPONSE.md)
- [Retention Schedule](RETENTION-SCHEDULE.md)
- [Backup Restore Record](BACKUP-RESTORE-RECORD.md)
- [Destructive Action Policy](DESTRUCTIVE-ACTION-POLICY.md)
- [Audit Controls](AUDIT-CONTROLS.md)
- [Destructive Route Classification](DESTRUCTIVE-ROUTE-CLASSIFICATION.md)
- [Enterprise Go Live Checklist](ENTERPRISE-GO-LIVE-CHECKLIST.md)
