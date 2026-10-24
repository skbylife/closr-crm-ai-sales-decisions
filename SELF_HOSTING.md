# Run Closr on your own PostgreSQL database

The default self-hosted stack is the Closr application plus PostgreSQL 16 with pgvector.
It needs no Supabase account, Supabase server, PostgREST, GoTrue, OIDC, or S3 service.
Supabase is retained only as an optional legacy backend in the source.

## First installation

Install Docker with Compose v2 and Node.js 22+ (Node is used once to generate local settings).
In a fresh checkout:

```sh
node scripts/native-init.mjs
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up --build -d
```

Open `http://localhost:3000/setup`, choose your workspace name and first owner's email
and password, then sign in to the CRM. Initialization closes after the first owner is
created. There is no shared demo login. The private `.env.self-hosted` file is generated
locally with a unique database password, mode 0600, and is excluded from Git and Docker
build context. Do not publish that file.

The application binds to `127.0.0.1` by default. Complete initial setup before exposing
it through your own HTTPS reverse proxy. Set `NEXT_PUBLIC_APP_URL` in the private env
file to your actual origin; same-origin checks deliberately reject a different origin.
Change `CLOSR_PORT` if necessary. For an HTTPS proxy on the same host, retain the loopback
binding. Proxy forwarded headers must be set by your trusted proxy.

Compose first waits for PostgreSQL health, runs the reviewed native migrations, and
imports the readable general-knowledge corpus. Only then does the app start. Migration
checksums and an advisory lock prevent partial/repeated upgrades; do not edit already
applied migrations. The legacy `supabase/` and `src/lib/migrations/` paths are retained
as historical/compatibility source, not the new installation sequence.

This baseline is for a fresh database. It is not an automatic migration of an existing
Supabase production database or legacy personal records with no organization. Plan and
test any existing-data migration separately; native record tenant identifiers are immutable.

## Data, accounts, files and recovery

The `database` volume holds PostgreSQL data. The `application-data` volume holds private
attachments and the encrypted-MFA key file. Back up both volumes and your local settings.
Losing the MFA key file prevents decrypting enrolled factors. Do not copy customer data,
backup files, or credentials into a public repository.

Native sessions use an HttpOnly cookie; opaque tokens are hashed in the database.
Configure authenticator-based two-factor authentication in Settings. Invitations can
be copied and delivered by your own administrator; a hosted mail provider is optional.

Password recovery does not require an external mail service. After verifying the user's
identity, an authorized deployment operator runs:

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml exec app node src/lib/native-auth/recovery-cli.mjs user@example.invalid
```

Give that user the resulting single-use link securely. It expires after 15 minutes and
revokes their old sessions when used; recovery does not disable MFA. The link is printed
only to the operator's terminal, never by a public recovery API. The normal forgot-password
page explains this operator-assisted procedure.

Attachments are stored on the application volume and fetched through authenticated,
organization/task-authorized URLs, even though the compatibility method is named
`getPublicUrl`. Native refresh uses staggered polling and cross-tab invalidation.

## Knowledge and embeddings

`data/knowledge/general-knowledge.json` contains 58 readable entries: 52 general sales
and strategy notes plus six cultural profiles. Eight generic strategy patterns are also
imported into the strategy-case table. Each entry includes provenance, content hash,
classification and license metadata. Read the corpus README and review ledger for the
specific edits and limitations. No production customer records or personal profiles
are included. A separate historical `babel-strategy-cases.json` was not available in
GitHub; the distributed corpus is not claimed to be a complete production database export.

The default importer does not contact a model provider and requires no API key. Keyword
retrieval works before embeddings exist. To generate embeddings intentionally, configure
your own `AI_BASE_URL`, `AI_API_KEY`, and `AI_EMBEDDING_MODEL` in private runtime settings,
then run `node scripts/native-knowledge-import.mjs --embed` inside the application
container with those settings. This explicit step can incur your provider's costs.
The provider must return 1536-dimensional vectors. Model identifiers are stored and
matched at query time; do not mix vectors from different models. Rebuild embeddings
consistently when changing models. Test-only deterministic embeddings verify storage and
ranking, not semantic quality, and are never imported by normal startup.

The default Compose configuration disables AI. Optional model/chat/integration settings
must be supplied by the operator; this repository grants no access to hosted services.

## Local development and verification

For a local app process, set `CLOSR_DATABASE_BACKEND=postgres`,
`NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=postgres`, `DATABASE_URL`, `PG_SSL=false` for a local
non-TLS database, and your `NEXT_PUBLIC_APP_URL`. Run `npm ci`,
`node scripts/native-startup.mjs`, then `npm run dev`.

`database/native/` is the fresh PostgreSQL baseline. The migration and component tests
cover it directly; see `RELEASE_NOTES.md` for current whole-application validation status.
No production migration or deployment is part of publishing this source.

### Builds behind a corporate TLS proxy

Docker supports standard `HTTP_PROXY` / `HTTPS_PROXY` build arguments. If your proxy
uses a private certificate authority, pass its public CA bundle as BuildKit secret
`build_ca` (`docker build --secret id=build_ca,src=/path/to/ca.pem ...`). The optional
secret is used only during package installation and is not copied into the image.
Do not put proxy passwords or private certificates in this repository.
