# Destructive Route Classification

## Current Classification

The authoritative explicit DELETE inventory is the `classifiedDeleteRoutes` map in `scripts/verify-destructive-route-classification.mjs`. It currently covers 19 routes: task files, account knowledge, channels, comments, integration connections, invites, leads, dashboard configuration, organization members/teams, opportunity roles, play relationships, pursuit team/member links, RFPs/competitors/documents/milestones and strategic plays.

These span resource-scoped deletion, organization collaboration and administrator operations. The native file route delegates durable audit behavior to `native-storage/server.ts`; the other listed handlers use the compliance audit helper. Organization bulk cleanup has no DELETE route. Generic data POST mutations are outside this textual DELETE inventory and require executor/RLS tests.

## Verification

Run `node scripts/verify-destructive-route-classification.mjs`; unclassified handlers, stale entries or missing audit wiring fail. Then run endpoint permission tests and disposable PostgreSQL integration tests. A source inventory cannot establish authorization correctness, failure atomicity or recovery; retain those separate test results and the limitations in [destructive policy](DESTRUCTIVE-ACTION-POLICY.md).
