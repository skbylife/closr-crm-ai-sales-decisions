# Closr Community

A local workspace for sales planning.

[简体中文](README.zh-CN.md)

Create plans, track their status, and return to your work after restarting the
app. Closr Community is the public, source-available part of Closr. This early
preview focuses on a local, manual planning workflow.

- Create a plan from scratch or start with a follow-up or meeting template.
- View plans, mark them complete, terminate them, or reopen them.
- Keep plans through a stop/resume cycle, and delete them when no longer needed.

The interface is currently Chinese. This is a single-user, single-organization
preview with one synthetic account. It has no account creation UI, invitations,
Salesforce connector, SSO, billing, or commercial AI. Use synthetic data only.

## Validation and supported scope

This source distribution supports an experimental, single-user,
single-organization local Community workflow with synthetic data. On Apple
Silicon macOS, the corresponding executable source and installer have passed
fresh local Auth/PostgreSQL setup, real browser login, manual plan creation,
read-back, status changes, deletion, stop/resume with persisted data, and run
destruction. The final archive was also unpacked into a new isolated directory
and its README quickstart and lifecycle were exercised with real browser checks. The exact source package baseline also
passed normal npm installation from the official registry using an empty cache,
TypeScript checking, and a production build in a fresh directory.

Those checks used the same host and isolated loopback ports. They do not establish
compatibility with a second clean machine, Linux, existing customer databases,
or the private Engine.
This is not a production-support commitment. Do not expose the preview to an
untrusted network or put real customer data in its disposable test database.

## Requirements

- Apple Silicon macOS host with a **local** Docker Desktop. This is the only
  combination that has been tested. The installer only uses the local socket
  `/var/run/docker.sock` and a `docker` CLI at `/usr/local/bin/docker`,
  `/opt/homebrew/bin/docker` or `/usr/bin/docker`. Remote Docker hosts and
  Docker contexts are not used.
- `/usr/bin/curl` (the installer talks to the local Docker API with it).
- Node.js >=20.9.0 and npm (the build is locked to Next 16.2.6).
- At least 4 GiB of free disk space on the checkout's volume; the installer
  refuses to start below that.
- The three service images below, already pulled locally for `linux/arm64`.

No other platform is claimed. Linux hosts (including linux-arm64 with Docker
Engine) are untested and unsupported, even though the images themselves are
`linux/arm64`.

## Images: pull manually, then verify

The installer **never pulls images**. Pull these exact immutable image digests yourself:

```sh
docker pull --platform linux/arm64 public.ecr.aws/supabase/postgres@sha256:3b3484fdb09164d84c785314a0732a4abc33100f2726166b6458cb7f244f18e0
docker pull --platform linux/arm64 public.ecr.aws/supabase/gotrue@sha256:994d932f081033c7ea4ed766ab73169d16930a12244767d0468d1f8f697d0a6a
docker pull --platform linux/arm64 public.ecr.aws/supabase/postgrest@sha256:146be673e7821e86908cbf7fce1e6c7a7451c7975ef2058368bc494de551b87c
```

Then run:

```sh
node installer/cli.mjs image-check
```

`image-check` inspects the required images in the local Docker daemon and checks
their expected platform and pinned image IDs. It never pulls images and
rejects missing or mismatched local images.

## Quickstart (Engine off, manual / basic-template workflow)

From a fresh checkout:

```sh
npm ci
npm run typecheck
node installer/cli.mjs image-check
```

`up` refuses to run while any `.env.local` exists in the checkout (a file,
directory or symlink, including a dangling symlink), and it checks this
**before** creating a run. A `.env.local` from an earlier run will not match the
new run's keys, so move it aside yourself first, to a name that is not already
in use, and keep the moved copy private:

```sh
if [ -e .env.local ] || [ -L .env.local ]; then mv -n .env.local ".env.local.old-$(date +%Y%m%d%H%M%S)"; fi
```

Then create the run using the ports exercised in the final acceptance check
(API 55441, web 55442). Both ports must be free:

```sh
node installer/cli.mjs up --ports 55441 55442
```

`up` creates a new private run directory under `.closr-local/` (mode 0700,
private files mode 0600), creates one internal Docker network, one data volume
and three containers with **no published host ports**, applies the two
Community migrations once, and prints the absolute `runtimeDir`. Use that path
in the next steps.

Create the first (owner) user. This command temporarily binds its own
loopback-only proxy on `127.0.0.1:55441`, so run it **before** `serve-api`:

```sh
node installer/cli.mjs first-user /absolute/path/printed/by/up
```

The existing migration trigger gives this first user the
`Closr Community Preview` organization and one sample account (`示例客户`).
The generated owner email (`…@example.invalid`) and password are stored in
`<runtimeDir>/users.json` (mode 0600). Read them locally; do not paste or share
them.

Start the long-lived loopback API proxy (keep this terminal open):

```sh
node installer/cli.mjs serve-api /absolute/path/printed/by/up
```

In another terminal, after `up` succeeds, load only this run's generated
`app.env` into the Next process environment. Keep `.env.local` absent; there is
no need to persist a second copy of the service-role key. Do not print, paste
or commit the values. The generated file is mode 0600 and both Engine settings
remain disabled.

```sh
set -a
. /absolute/path/printed/by/up/app.env
set +a
npm run dev -- -p 55442
```

Stop that Next process before destroying the run. The exported values stay in
this terminal until it exits; use a fresh terminal for another run. The command above serves Next on `127.0.0.1:55442` only. The login page reads the public URL
and anon key when requested, so a production build can be made before the run
exists; the service-role key stays on the server.

### Log in and create a plan

1. Open `http://127.0.0.1:55442` and sign in (`登录`) with the owner email and
   password from `users.json`. Public sign-up is disabled.
2. Open the sample account `示例客户` from the accounts list (`客户`).
3. Choose `新建手动计划` (new manual plan). Pick one of the two basic templates
   (`基础模板`: `客户跟进` follow-up or `会议安排` meeting) or `自行填写` to write
   your own, adjust the goal, success criteria and first step, then save
   (`保存手动计划`).
4. Reload the page to confirm the plan reads back, then change its status with
   `标记完成` (complete), `终止计划` (terminate) or `重新打开` (reopen).

5. Stop both terminal processes with Ctrl-C, run `stop` and then `resume` as
   described below, restart `serve-api` and the web command with the same
   `app.env`, and log in again. Confirm the plan and its status remain.
6. Delete the plan with the delete action and confirmation, then reload to
   confirm it is gone.

The first user owns the preview organization while that user exists; later
users receive no membership. If the owner is deleted, the next new user can
become the owner. This disposable setup is not a multi-user deployment.

## Lifecycle

```sh
node installer/cli.mjs status  /absolute/path/printed/by/up
node installer/cli.mjs stop    /absolute/path/printed/by/up
node installer/cli.mjs resume  /absolute/path/printed/by/up
node installer/cli.mjs destroy /absolute/path/printed/by/up
```

Each lifecycle command requires the absolute `runtimeDir` printed by `up`.

`stop` and `destroy` refuse to change anything in Docker while port
`127.0.0.1:55441` is in use, including by this run's own `serve-api`. Before
either command, press Ctrl-C in both the `serve-api` and web terminals and wait
for them to exit. If the command
still reports the port as occupied, identify the listener; stop it only if it belongs to this run.
Do not bypass the check or stop unrelated services.

- `status` inspects the run-owned containers and reports their state, whether
  migrations completed and whether the first user was created.
- `stop` stops the containers; the database volume and run directory are
  **preserved**. Ctrl-C `serve-api` first (see above).
- `resume` restarts a completed, stopped run with its data intact. Start
  `serve-api` and the web command again using the same run’s `app.env`.
- `destroy` **permanently deletes** this run's data. Ctrl-C `serve-api` and
  `npm run dev` first (see above). It removes only resources
  it can verify as owned by this exact run (its three containers, its internal
  network and its `-pgdata` volume) and the installer's own files in the run
  directory. It stops with an error instead of deleting anything unexpected.
  Back up anything you need first. Images are not removed. Exit the shell
  that loaded this run's `app.env` before starting another run.

## Community and Engine

Community contains the public application and manual workflow. Engine is a
separate private server-side API; its implementation, proprietary prompts and
BABEL are excluded from this repository. Hosting an Engine separately does not
make this Community preview integrated with it.

The local quickstart keeps Engine disabled and does not invoke a model provider.
An operator-enabled integration can send user input and selected account context
to an Engine and its configured model provider. It requires separate access and
data-processing arrangements. We do not claim zero retention, exclusion from
training, a fixed processing region, or a compliance certification. Do not send
customer data through these experimental hooks.

### Access boundary

- Containers run on an internal Docker network with no published ports. The
  only host listener for the stack is the loopback proxy on `127.0.0.1:55441`,
  which forwards just the Auth and REST routes Community uses and rejects
  browser requests carrying the service-role key. The quickstart command binds to
  `127.0.0.1:55442`.
- The two migrations are only for a **fresh, disposable preview database**.
  They must **never** be applied to an existing Closr or multi-tenant database.
  The installer applies them once per run and refuses to replay them. Do not add
  real customer data.
- The preview schema enables RLS and gives browser roles no direct table access.
  After `getUser()`, the server uses its service-role client to resolve membership
  and applies organization/account checks before returning account data or
  reading and writing plans. It allows one membership for the one preview
  organization; later Auth users lack membership while its owner remains.
- The dynamic login page passes only the public API URL and anon key to
  the browser. Never pass the service-role key as a page prop. Keep `app.env`
  and the run directory private.

`CLOSR_ENABLE_ENGINE_PREVIEW=true` plus a private HTTPS `CLOSR_ENGINE_URL` is an
**operator-only integration hook**, not a working Engine installation. A private
service must independently verify the user token and stored tenant/account
authorization before any use. With the flag false or URL absent, the route
returns `engine_not_configured` and manual plans remain available.

A separate `CLOSR_ENABLE_FULL_ENGINE` / `CLOSR_FULL_ENGINE_URL` hook is also
disabled by default. It forwards a bounded goal request through the Community
server and accepts only a scoped display result; it does **not** save a plan.
Enabling this hook in this preview is unsupported. Its public contract contains
no BABEL prompts, rule implementation, source records or provider credentials.

The supported Community preview capability is manual planning with the two
basic templates. Neither optional Engine hook is part of the local quickstart.
Ranking, replanning, similar-case retrieval, Salesforce, SSO and billing are not
offered by this preview.

## Feedback

Report reproducible problems or share workflow feedback in
[GitHub Issues](https://github.com/skbylife/closr-crm-ai-sales-decisions/issues).
Include what you did, what you expected, what happened, and your macOS, Node and
Docker versions. Redact credentials and customer data from logs and screenshots.

## License

Copyright 2026 Zhaocheng Liu.

The Closr Community Source-Available License permits personal use,
company-internal self-hosting and modification, including internal commercial
use. It permits independent paid installation and maintenance services for a
customer-controlled deployment, provided fees do not purchase software rights
or hosted access and the customer can continue operating without those services.

Resale of copies or software rights, paid SaaS and paid white-label services
are prohibited without a separate written license. Rebranding, bundling fees,
or calling hosted access a maintenance service does not bypass the restriction.
Free redistribution must retain the license, attribution and change notices.
See [LICENSE](LICENSE) for the full terms. This is a custom source-available license,
not an OSI-approved open-source license.

Third-party packages and vendored Supabase CLI SQL keep their original licenses;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Any existing valid separately granted licenses are not revoked by this license.

The private Engine, BABEL, proprietary prompts and strategy implementation are
excluded. This Community license does not license the complete private Closr
repository or grant access to a hosted Engine service. Container images, installed
dependencies and binaries are not included in this source-only candidate;
future distribution must retain their applicable notices and license texts.
