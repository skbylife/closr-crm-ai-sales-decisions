# Native account and session implementation

The PostgreSQL backend owns authentication. No Supabase Auth/GoTrue endpoint is called.

- Passwords use per-password random salts and scrypt. New passwords require 12–256 characters.
- Seven-day sessions use 256-bit random opaque cookies with HttpOnly, SameSite=Lax,
  and Secure on HTTPS. Only SHA-256 token hashes are stored. Cookie responses are not cached.
- Mutating HTTP operations require an exact same-origin Origin header. Auth attempt counters
  are database-backed, so restarting an app process does not reset throttling.
- Setup creates the first account, organization and owner membership in one transaction,
  guarded by an advisory lock. It permanently closes once an account exists. Bind a fresh
  installation to loopback or a trusted network until setup is complete.
- Enrolling TOTP requires a signed-in session. Verification consumes a short-lived challenge,
  persists failed attempts, rejects reused time counters and revokes other sessions. Password
  login requires a code when a verified factor exists. There is no password-only MFA bypass.
- TOTP secrets are AES-256-GCM encrypted. A random 32-byte key is created once, with 0600
  permissions, under `CLOSR_DATA_DIR/auth-encryption.key` (default `/data/closr`). Persist and
  back up this volume together with the database; loss of this key prevents TOTP verification.
  Enrollment returns the secret only to its authenticated enrolling user for authenticator setup.
- The initial implementation supports manual TOTP secret entry without sending any secret
  to a remote QR-code service.

## Operator-assisted password recovery

No SMTP delivery is silently assumed. An authorized operator runs inside the application
container, with its normal database configuration:

```sh
node src/lib/native-auth/recovery-cli.mjs user@example.invalid
```

The command returns a single-use recovery URL to the operator's terminal. The operator
must verify the person's identity and deliver that link privately. The database stores only
its hash; it expires after 15 minutes. A new link invalidates previous unused links. The link
uses a URL fragment to avoid putting the token into HTTP request/access logs. Completing
recovery revokes all sessions and requires normal login; existing MFA is retained.
The public recovery-request endpoint never returns a recovery token or reveals whether
an account exists. No email is claimed to have been sent.

## Compatibility boundary

`browser.ts` offers an auth-shaped client for existing UI code. `server.ts` offers user
and session lookups plus server-only admin operations for already authorized application
handlers. Admin methods are not reachable through `/api/native/auth`. Compatibility
`access_token`/`refresh_token` fields contain a non-secret marker, not the HttpOnly token.
Passing tokens to `setSession` cannot create or switch an identity. Native accounts do not
use Supabase OAuth callback codes; existing external CRM integration OAuth remains separate.
