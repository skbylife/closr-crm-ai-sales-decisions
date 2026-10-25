# Backup And Restore Evidence Record

## Required Evidence

A recovery set consists of a consistent PostgreSQL dump, the entire application-data volume (including the MFA encryption key), private env configuration and exact source/image identity. Restrict and encrypt this set. Source code and audit logs alone cannot restore deleted attachments. Follow the stop/dump/archive/start and new-empty-installation restore commands in [self-hosting](../../SELF_HOSTING.md).

Record UTC date, source commit, image digest, PostgreSQL/pgvector version, backup hashes, clean destination identity, every command exit status and verification outcome. Test records, attachment byte equality, normal login, MFA and tenant rejection. Never publish recovery secrets or real customer samples with the record.

## Restore Drill Log

This repository does not contain an operator's production restore attestation. Development checks use isolated synthetic databases. On 2026-10-25, the candidate was backed up and restored into new isolated Compose volumes. The drill verified business records, exact attachment bytes, restored MFA key/factor compatibility, rejection of password-only login and successful TOTP login. It exposed and corrected the missing cluster-role restore prerequisite and the application restart command. This used only one synthetic owner and synthetic records, not a production recovery set. Exact source/image identities and command results belong in the associated release report; the release report must state the actual restore outcome separately. Each production operator must run and retain its own drill before depending on backups; recovery time and recovery point objectives are not guaranteed here.
