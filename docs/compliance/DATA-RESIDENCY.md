# Data Residency Statement

## Deployment Lines

The documented native deployment stores PostgreSQL data in the `database` volume and files plus the MFA encryption key in `application-data`. Docker's host and backup destinations determine their physical region. The software does not choose or guarantee a jurisdiction. Legacy Supabase code is optional, not required for this installation.

## Environment Isolation

Use distinct Compose project names, env files, host ports and volumes for independent installations. The database has no published host port in the supplied Compose file. Keep the app loopback-bound behind a trusted HTTPS proxy, and complete first-owner setup before opening access. Shared host administrators can access volumes; Docker project separation is not protection against a hostile host administrator.

Optional AI, mail/calendar or error monitoring can transfer data outside the database region. Record actual endpoints and backup locations and review them before activation. The separate website Demo is not part of this repository's deployment and must never supply production credentials or customer records to a self-hosted instance.
