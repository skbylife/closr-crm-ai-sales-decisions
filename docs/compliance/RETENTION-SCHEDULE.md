# Data Retention Schedule

## Retention Matrix

| Data | Current behavior | Operator responsibility |
|---|---|---|
| Business records and attachments | Retained until authorized application/operator action; no universal time-based purge | Set an approved schedule and verify deletion/export scope |
| Sessions, challenges and recovery | Validity is checked by native auth; expiry is not proof of physical erasure | Review maintenance and retained auth rows |
| Audit and AI invocation logs | Database records; no immutable archive or universal retention scheduler | Restrict access, define retention and protect required evidence |
| Backups | Independent copies outside live deletion | Encrypt, expire and test recovery according to policy |
| Provider copies | Outside local control | Verify provider contract/settings and deletion mechanism |

## Deletion And Export

Single-file deletion physically removes bytes; its audit is not a backup. Completion failure retains hidden metadata for retry and does not restore the file. Business exports are not complete system recovery sets. Organization cleanup is an owner-only inventory preview; it cannot execute bulk erasure. Do not promise a complete data-subject erasure workflow based on that screen.

Use the database, full application-data volume and env backup procedure in [self-hosting](../../SELF_HOSTING.md). Review related records, external services and backups when determining deletion scope; never run destructive ad-hoc SQL against a real tenant as a release test.
