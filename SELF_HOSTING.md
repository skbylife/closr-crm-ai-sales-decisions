# Self-host Closr

Run the editable CRM with application-owned accounts, sessions and MFA, PostgreSQL 16 + pgvector, and private attachments on a Docker volume. No Supabase account/server, PostgREST, GoTrue, OIDC or S3 is required. The optional legacy Supabase code is not the installation path below. This distribution is the normal authenticated application, not the independent demonstration on the official website.

## Prerequisites and checkout

Install Git, Node.js **22**, Docker Engine or Docker Desktop with **Docker Compose v2**, and curl. Docker must be running and your user must have permission to use it. This guide uses a POSIX shell (Linux/macOS or WSL2). Check:

```sh
node --version
docker version
docker compose version
git clone https://github.com/skbylife/closr-crm-ai-sales-decisions.git
cd closr-crm-ai-sales-decisions
git rev-parse HEAD
```

Record that commit with your deployment. A starting **recommendation**, not a tested minimum, is 4 CPU cores, 8 GB RAM and 30 GB free disk for building and running a small installation; attachments, database growth, Docker layers and backups need additional space. Building requires access to container registries and npm. Application startup and the default knowledge import need no model account or model network access. For a corporate proxy/private CA, use the alternative build procedure below before starting Compose.

## Initialize and start

```sh
node scripts/native-init.mjs
```

This creates `.env.self-hosted` with a random database password and file mode 0600. It refuses to overwrite an existing file. Keep it private: it is excluded from Git and Docker builds. Do not copy real credentials into `.env.example`.

| Setting in `.env.self-hosted` | Required/default and use |
|---|---|
| `POSTGRES_PASSWORD` | Required; generated locally. Keep the generated hexadecimal value, which is safe inside the database URI. Changing this file does not change an existing database password. |
| `NEXT_PUBLIC_APP_URL` | Required actual browser origin; generated as `http://localhost:3000`. Include a nondefault port, no path. |
| `CLOSR_BIND_ADDRESS` | Default `127.0.0.1`; keep loopback with a same-host reverse proxy. |
| `CLOSR_PORT` | Default `3000`; host port, not container port. |
| `AI_PROVIDER` | Optional; Compose defaults to `disabled`. Leave disabled for initial verification. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_EMBEDDING_MODEL` | Optional operator-supplied provider settings; leave unset initially. See model configuration below. |

Compose supplies both backend selectors as `postgres`, `DATABASE_URL` pointing to its independent `db` service, `PG_SSL=false` on that private Docker network, and `/data/closr` storage paths. You do not need to create a separate database or add Supabase variables. `.env.example` documents additional optional integration variables, but Compose passes only variables explicitly listed in its environment map; adding an unsupported name to the env file alone does not pass it into the application.

For a different local port, edit both `CLOSR_PORT=3001` and `NEXT_PUBLIC_APP_URL=http://localhost:3001` before starting. For a new HTTPS installation you can instead initialize with `node scripts/native-init.mjs .env.self-hosted https://crm.example.com`; replace the reserved example domain with yours.

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up --build -d
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml ps -a
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml logs --tail=80 migrate app
curl --fail http://localhost:3000/api/health
```

Use your chosen port for curl. `db` and `app` should be healthy; `migrate` should exit with code 0 after applying migrations and importing knowledge. An exited successful migration container is normal. Wait for the first build/start to finish before opening the app.

Open `http://localhost:3000/setup` (or your configured origin). Create your workspace, first owner's email and password, then sign in. Setup closes after that owner exists. There is no shared login. Complete setup before making the installation publicly accessible. On a remote host, use a private SSH tunnel for initial localhost setup, or restrict your proxy to your IP until setup is complete.

### Verify without a model

Keep `AI_PROVIDER=disabled` and all model keys unset. Create a synthetic account, contact and task; upload a harmless text attachment and download it. Sign out/in, reload the records, then recreate the app container and verify the records and attachment remain:

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up -d --no-deps --force-recreate app
```

Use only fictional data for this check. AI generation is unavailable with AI disabled; it is not a failed database installation. See [release notes](RELEASE_NOTES.md) for recorded validation scope, not a guarantee that every optional external integration works in your environment.

## Domain and HTTPS

Place your own TLS-terminating reverse proxy on the same host, forwarding to `http://127.0.0.1:3000`. Obtain a certificate for your domain and allow public traffic only to the proxy's HTTPS port. Preserve the original `Host` and set trusted forwarded protocol/host headers. Configure `NEXT_PUBLIC_APP_URL=https://crm.example.com` to your real origin, then recreate the app (`up -d --no-deps --force-recreate app` with the same Compose flags). Same-origin checks reject mismatched origins. Do not expose PostgreSQL; Compose publishes no database port. A containerized proxy needs an explicitly configured shared network/upstream rather than assuming its own localhost reaches Closr.

## Knowledge and optional models

Startup imports [58 readable knowledge entries](data/knowledge/README.md): 52 methodology notes and six cultural profiles. Eight generic strategy patterns also populate the strategy-case table. Provenance, hashes, classification and licensing notes accompany the corpus. No customer records or production vectors are included. The historical external `babel-strategy-cases.json` was absent from GitHub; this is not a complete production database export.

The normal importer makes no model calls. Keyword retrieval works without embeddings. To enable an operator-owned OpenAI-compatible provider, add your own settings to the private env file. The following are **placeholders, not working credentials**:

```dotenv
AI_PROVIDER=customer-openai-compatible
AI_BASE_URL=https://YOUR_PROVIDER_HOST/v1
AI_API_KEY=REPLACE_WITH_YOUR_OWN_KEY
AI_MODEL=REPLACE_WITH_YOUR_CHAT_MODEL
AI_EMBEDDING_MODEL=REPLACE_WITH_YOUR_1536_DIMENSION_EMBEDDING_MODEL
```

The base URL must match your provider's API prefix; the application appends `/chat/completions` or `/embeddings`. Use a provider/model supporting the required responses. Review its data handling before sending customer content. A local provider runs separately; `localhost` inside the app container refers to that container, not the host. Model hosting is not included in Compose.

After editing the env file, recreate the app with the command above; `restart` alone does not reload environment settings. To deliberately generate embeddings, run:

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml exec app node scripts/native-knowledge-import.mjs --embed
```

This explicit command sends the general corpus to your provider and may incur charges. It requires a provider returning **1536-dimensional** vectors. The stored model identifier must match retrieval; rebuild the corpus consistently when changing embedding models. Test-only deterministic embeddings prove storage/ranking mechanics, not semantic quality, and are not imported by normal startup. No real model invocation is needed for the initial deployment check.

## Accounts, MFA and recovery

Enable authenticator-based MFA in Settings. Sessions use HttpOnly cookies and database-hashed opaque tokens. Administrators can copy invitation links and deliver them securely without a hosted mail provider.

Password recovery is operator-assisted. After verifying the user's identity, an authorized operator runs the following, replacing the example address with that user's email:

```sh
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml exec app node src/lib/native-auth/recovery-cli.mjs user@example.invalid
```

Deliver the printed single-use link securely. It expires after 15 minutes and revokes prior sessions when used; it does not disable MFA. Never paste this link into a public issue. Attachments require authenticated organization/task access, even though a compatibility method is called `getPublicUrl`. Native refresh uses polling and cross-tab invalidation.

## Back up and restore

The named `database` volume contains PostgreSQL data; `application-data` contains attachments and the MFA encryption key. Back up the database, the **entire** application-data volume and `.env.self-hosted` as one recovery set. Losing the MFA key prevents decrypting enrolled factors. Keep backups encrypted, access-restricted and outside the repository. Do not use `down -v` on an installation you intend to keep.

These commands use the existing Compose project, pause application writes, and write to a new private directory outside the checkout. Run them from the checkout. Define this shell helper for the commands in this section:

```sh
dc() { docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml "$@"; }
umask 077
BACKUP_DIR="$(mktemp -d ../closr-backup.XXXXXX)"
dc stop app
dc exec -T db pg_dump -U closr -d closr -Fc > "$BACKUP_DIR/database.dump"
dc run --rm --no-deps -T --user root --entrypoint tar app -C /data/closr -czf - . > "$BACKUP_DIR/application-data.tar.gz"
cp .env.self-hosted "$BACKUP_DIR/env.self-hosted"
git rev-parse HEAD > "$BACKUP_DIR/source-commit.txt"
dc start app
```

Check every command succeeded and test restoration on an isolated host before relying on a backup. A plain copy of a running PostgreSQL volume is not an equivalent consistent database backup.

For disaster recovery, use a **new, empty installation** of the recorded source commit, with the same Compose project name and no existing volumes. Set `BACKUP_DIR` to the absolute directory containing the backup. Build that version’s app image using `dc build` below, or the proxy build alternative (build only; postpone its `up` command until after restoration). Do not initialize or start the app/migration service before restoring:

```sh
cp "$BACKUP_DIR/env.self-hosted" .env.self-hosted
chmod 600 .env.self-hosted
dc build
dc up -d --wait db
dc exec -T db pg_restore -U closr -d closr --exit-on-error < "$BACKUP_DIR/database.dump"
dc run --rm --no-deps -T --user root --entrypoint tar app -C /data/closr -xzf - < "$BACKUP_DIR/application-data.tar.gz"
dc up -d --no-build
```

Define `dc` again in a new shell. Restore preserves the archive's file ownership for the image's `node` user. Test sign-in, MFA, records and attachment download. These restore commands intentionally do not drop or overwrite an existing database; an existing-volume restore needs a separately reviewed recovery plan. If the hostname changes, update the origin before starting. Never expose a test restore containing customer data publicly.

## Upgrade

Record the current commit and take a complete backup first. Read release notes, fetch the repository and checkout the release commit you chose; keep your private env file and named volumes. Stop the app during migrations, rebuild, then run the new migration service explicitly:

```sh
dc stop app
dc build
dc run --rm migrate
dc up -d --no-build
dc ps -a
```

Use the proxy build alternative instead of `dc build` if applicable. Stop on any failed command; do not restart an old image against an unsuccessfully upgraded schema. Migrations use checksums, transactions and an advisory lock; never edit applied SQL or delete the migration ledger to bypass a mismatch. Rollback may require restoring the whole previous backup with its original code, not merely checking out older code.

This baseline targets fresh databases. Existing Supabase databases and legacy personal records with NULL organization IDs require a separate, tested operator migration of related records. Native tenant identifiers are immutable; joining an organization does not automatically migrate such old data.

## Builds behind a corporate TLS proxy

Use this alternative when Docker's configuration directory is read-only, the network requires an explicit proxy, or npm requires your corporate public CA. Obtain the trusted **public CA bundle** from your administrator and place it outside the repository. The Docker daemon must independently trust the registry's TLS chain and have registry connectivity; the build secret below only configures Node/npm inside build steps.

Keep any required proxy credentials in your private shell environment. Set `HTTP_PROXY`/`HTTPS_PROXY` and `NO_PROXY` according to your network administrator. Include local/private Docker traffic in the appropriate exclusions. Then, from the checkout:

```sh
export DOCKER_CONFIG="$(mktemp -d /tmp/closr-docker-config.XXXXXX)"
chmod 700 "$DOCKER_CONFIG"
# Replace this with the administrator-provided public CA bundle path.
BUILD_CA=/absolute/path/to/corporate-public-ca.pem
DOCKER_BUILDKIT=1 docker build \
  --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  --build-arg NEXT_PUBLIC_CLOSR_DATABASE_BACKEND=postgres \
  --secret "id=build_ca,src=$BUILD_CA" \
  --tag closr:self-hosted .
docker compose --env-file .env.self-hosted -f docker-compose.self-hosted.yml up -d --no-build
```

The image tag is the exact one used by both `migrate` and `app`. `--no-build` is essential here: ordinary Compose builds do not supply the `build_ca` secret. If no private CA is needed, omit the `--secret` argument. Docker's standard proxy build arguments are passed from your environment; do not put proxy values into Dockerfile layers or source files. The optional BuildKit secret is read only during npm installation and is not copied into the final image. Do not disable TLS verification. A fresh `DOCKER_CONFIG` has no existing registry login; authenticate there if your registry requires it. Keep this setting active for subsequent Docker commands in that shell.

## Troubleshooting

| Symptom | Action |
|---|---|
| Cannot connect to Docker / permission denied | Start Docker and fix your user's daemon access; a read-only Docker config can use the temporary directory above. |
| npm/registry certificate or proxy errors | Follow the proxy build alternative; check daemon registry trust separately. Do not set `strict-ssl=false` or disable TLS. |
| Port already in use | Change both host port and browser origin; recreate the app. |
| `db` unhealthy or authentication failed | Read `dc logs --tail=80 db`; check disk space and that the private password matches the initialized volume. Do not regenerate credentials over an existing database. |
| `migrate` exits nonzero / app does not start | Read `dc logs --tail=100 migrate`; retain volumes, investigate the actual error or checksum mismatch before retrying. |
| Login/setup rejects origin | Match the browser URL, `NEXT_PUBLIC_APP_URL`, and trusted proxy headers; recreate after env changes. |
| Setup already completed | Sign in with the existing owner or use operator recovery; setup cannot create a second initial owner. |
| AI unavailable / embedding dimension error | Default AI is disabled. Check explicit provider/model configuration and 1536 dimensions only when choosing to enable it. |
| Attachments or MFA unavailable after restore | Restore the full application-data archive paired with that database, including the encryption key and ownership. |

Before reporting a problem, record the source commit, Docker/Compose versions and failing step. Share only redacted logs; env files, recovery links, session cookies, database dumps and attachments are private.
