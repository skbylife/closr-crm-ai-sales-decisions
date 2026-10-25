# Enterprise Go-Live Checklist

## Required Technical Gates

Bind evidence to the exact source/image. Run ordinary tests, gated PostgreSQL suites, native security checks with a live isolated database, dependency/secret review, clean documented install and a recovery drill. Record failures/skips explicitly. Confirm disabled AI works without keys, initial setup is closed, and privileged users enroll MFA. Verify tenant and attachment access negatively, not only a successful health response.

## Required Customer-Specific Approvals

The deploying organization must approve data purposes, provider/hosting choices, retention, access roles and recovery objectives. These documentation checks do not approve contracts, legal compliance or a deployment on anyone's behalf. Bulk cleanup remains unavailable; do not advertise it as an enabled capability.

## Required Environment Evidence

Record private configuration ownership, source/image hashes, TLS/proxy boundaries, monitoring recipients, backup destination and restore outcome. Verify actual external controls; environment flags are not evidence of a deployed WAF or an operational incident team. Keep credentials and personal data out of release reports.

## Release Gate

`verify:compliance-evidence` checks document presence/structure only. `verify:security` includes source checks and live checks only when a database URL is supplied. Passing either is not compliance certification or a blanket production go-live decision. The operator must assess remaining gaps and record approval for its own environment; development source publication does not deploy a production system.
