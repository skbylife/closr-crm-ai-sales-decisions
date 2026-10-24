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
  The demo seed endpoint is disabled; dataset processing interfaces remain available.
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

## Native deployment validation

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
