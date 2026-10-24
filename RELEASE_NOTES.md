# Source distribution changes

Application snapshot: `594a5cf6c24015647f6705e36eb08c5fc7178e8f`.
Public predecessor: `ddeea3328d7cfb54afc009ae616863ca82817792`.

- Included application and engine/prompt implementation, tests, migration source, and
  development/build configuration. No private repository history is copied.
- Expanded the existing license to cover the included Engine/BABEL/prompt/strategy source;
  retained the existing commercial restrictions, free redistribution, service permissions,
  earlier-license protection, and third-party carveout.
- Removed external case records of unverified provenance, backup source, internal
  documents/evaluation artifacts, screenshots, deployment workflows, and production config.
  At that release, the demo seed endpoint was disabled; the later refinement below removes the legacy Demo interfaces entirely.
- Replaced the embedded demo credential and non-reserved example email identities; removed
  internal deployment endpoint defaults. Configuration templates contain names/descriptions
  and blank values. Operators supply their own settings.
- Preserved bundled font licenses and the previously published Supabase installer vendor
  SQL/license; the old limited Community installer is not the full application's installer.
- Added an independent PostgreSQL + pgvector backend, native cookie sessions, password
  recovery and TOTP MFA, tenant-aware query APIs, and private local-volume attachments.
  Supabase remains an optional legacy backend, not a native deployment requirement.
- Added a checksum-tracked fresh database baseline and repeatable knowledge import.
  The readable corpus includes 58 reviewed general knowledge/cultural summaries and
  eight generic strategy patterns. Embeddings are optional and generated only when an
  operator explicitly selects a compatible model; no model credentials are included.
- Native schema, authentication, query, storage and knowledge regression tests use
  isolated databases and fictional records. See SELF_HOSTING.md for installation and
  deployment-specific acceptance checks. Removed-demo and internal-document-dependent
  historical tests/tools are not a supported release validation suite.

Source availability does not include customer records, production vector exports, hosted API access,
external model licenses, trademark rights, or operational secrets.

## Original full-source release validation (267c3842)

The release candidate passed 920 unit tests across 164 files and a production Docker
build (including TypeScript). Real PostgreSQL checks covered 13 fresh migrations,
idempotent reapplication, 37 schema/authorization cases, query and knowledge
repositories, private attachments, seven authentication scenarios, and eight Engine
conflict/transaction rollback cases. Tests used fictional records and embedding stubs.

A fresh Compose database with zero application tables initialized all 13 migrations
and imported 58 readable knowledge entries plus eight strategy patterns. Browser
acceptance exercised first-owner setup, Horizon/accounts rendering, accounts/contacts/
opportunities/tasks CRUD, private attachment CRUD, cross-origin rejection, logout and
login. There were no page/query errors, unexpected 500/429 responses, or external
requests. After Compose down/up without deleting volumes, the session, CRM records,
attachment bytes and corpus counts persisted; bootstrap remained closed.

Reproduce the ordinary unit suite with:

```sh
npm ci
npx vitest run --exclude '**/*.integration.test.ts'
```

Database integration tests explicitly require disposable local test databases; see
the corresponding test files and `database/native/README.md`. Never point these at
production. Model semantic quality, paid providers, external mail/chat integrations,
existing production database upgrades, and unavailable external strategy datasets
are outside this validation. No production deployment or database access occurred.


## Public product refinement — 2026-10-24

- Removed legacy Demo routes, embedded sample datasets, sample-loading controls,
  fabricated role overrides and fixed-customer fallback narratives from the normal
  application. The official website's anonymous demonstration is a separate static
  artifact and is not included in this distribution.
- The public landing page now defaults to English and preserves explicit Chinese.
  Business content remains unchanged by UI translation; no DOM rewriting replaces
  customer text with generic English. Expanded both README introductions and the
  first-install configuration/backup/restore guide.
- Products and quotes use authenticated, tenant-scoped persisted catalog APIs.
  The account pool lists actual unassigned organization accounts. Native account
  transfer/claim/reclaim checks membership under lock and commits related ownership,
  history and audit changes in one transaction. Migration 120 adds handoff history
  fields. Unsupported automatic pool-rule execution and quotation sending are not
  presented as completed features.
- Updated Next.js, React, Vitest and MSAL and refreshed the third-party inventory.
  The revision's dependency audit reports zero known advisories at review time;
  this is a point-in-time result, not a security guarantee.
- This revision passed 920 unit tests in 164 files, TypeScript, and a new production
  Docker build. Five additional real-PostgreSQL account-transfer cases cover rollback,
  concurrent claim, reclaim, cross-organization access and membership revocation.
- An independent operator followed SELF_HOSTING.md in a fresh clone/candidate export
  and new Compose database: all 14 migrations and the 58 knowledge entries/eight
  strategy patterns loaded. First-owner setup, CRM and private attachments, cross-origin
  rejection, logout/login and browser rendering passed. Recreating the application
  preserved sessions, records and exact attachment bytes. No model keys or calls were
  used. A first build attempt exhausted the cloud executor's accumulated VFS cache;
  after clearing this task's obsolete build cache, the documented build succeeded.

The new checks do not claim live model quality, all external integrations, or a
production upgrade has been verified. The earlier 13-migration evidence above belongs
only to the original release, not this revision's 14-migration baseline.
