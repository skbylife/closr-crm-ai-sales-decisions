# Incident Response Summary

This is a self-hosted operator runbook, not a promise of a managed response team or response-time SLA.

## Severity Levels

Treat suspected cross-tenant disclosure, credential compromise or destructive compromise as critical. Treat authentication/availability failures and failed restore verification as high priority; preserve context before classifying less urgent defects. Assign a responsible operator and record UTC timestamps, affected commit, environment and scope without copying customer payloads into public issues.

Contain affected traffic at the operator-controlled proxy, preserve restricted logs and snapshots, and investigate sessions, memberships, audit events and provider activity. Credential revocation/rotation and service isolation require an authorized operator; do not silently rotate production keys during a source audit. Audit records are not an immutable forensic ledger and may be incomplete.

## Customer Notification

The deploying organization must determine notification recipients, timing and applicable obligations with its responsible security/legal team. This repository provides no universal notification deadline. Communicate verified impact, containment, unresolved uncertainty and next update time. Use a reviewed disclosure channel rather than posting exploit details or customer data publicly.

Restore only from a verified recovery set, retest tenant/auth controls, and record root cause and corrective actions. A healthy HTTP endpoint alone does not close an incident.
