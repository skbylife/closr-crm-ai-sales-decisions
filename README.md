# Closr — source-available application and engines

This distribution includes the Closr application, BABEL engine, strategic-play engine,
prompt builders, API routes, and database schema/migration source. It replaces the
earlier limited Community preview. Read [the self-hosting guide](SELF_HOSTING.md).

Copyright 2026 Zhaocheng Liu. The [Closr Source-Available License](LICENSE) permits
personal and internal business self-hosting and modification. It prohibits selling
the software, paid software licenses, and paid third-party hosted/managed/white-label
access, including subscriptions, unless separately licensed by the copyright holder.
Free redistribution and the independent installation/support/consulting services in
Section 3 remain permitted. There is no automatic future conversion to an unrestricted
license. This is **source-available**, not OSI-approved open source.

Third-party materials retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The default self-hosted backend uses PostgreSQL + pgvector, application-owned accounts/MFA,
and a Docker volume for attachments; no Supabase account or services are required.
No production configuration, private Git history, customer database, private embeddings,
internal customer evaluation corpus, or model API credentials are included. Bundled case/sample
records are deliberately omitted; the application starts without those records and
the bundled demo-seed endpoint returns HTTP 410. Supply your own authorized data.

The readable general-knowledge corpus includes 58 entries with provenance and an optional
embedding rebuild script. Native fresh-install migrations are in `database/native/`;
historical migration paths remain for legacy deployments. See [release notes](RELEASE_NOTES.md)
for the exact changes and validation limits.
