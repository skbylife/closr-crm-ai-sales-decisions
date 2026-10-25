# Destructive Action Policy

## Current Enforced Controls

Native data mutations require a verified session and execute under request-scoped RLS. Resource-specific APIs separately check membership/ownership/admin permissions. `verify-destructive-route-classification.mjs` inventories explicit DELETE handlers and checks audit wiring. It does not cover every POST-based mutation or prove correct runtime scoping.

Task attachment deletion checks current task access and logical paths. A durable intent must succeed before filesystem removal; completion audit and metadata removal share a database transaction. If completion fails, a hidden tombstone permits retry. File bytes are already gone and cannot be recovered from the audit. Batch filesystem removal is not transactional.

Organization cleanup is GET-only owner inventory and rejects ambiguous memberships. No bulk-delete endpoint is implemented. See [cleanup design](../ORGANIZATION_CLEANUP_DESIGN.md) for unmet reauthentication, tenant confirmation, snapshot and recovery requirements.

## Release Gate

Use synthetic data for negative tenant/role tests, audit failures and retry tests. Reject malformed removal bodies. Preserve backups before operator-authorized real deletion. Passing a route classifier is not authorization for a destructive production action and does not prove recoverability.
