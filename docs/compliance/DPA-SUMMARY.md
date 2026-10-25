# Data Processing Addendum Summary

This is a technical scope summary for the self-hosted distribution, not an executed data-processing agreement or legal assurance. Publishing source does not appoint the maintainers to operate a customer's installation.

## Controller / Processor Positioning

The deploying organization selects purposes, users, hosting, backups and external integrations. It must determine the appropriate contractual roles for its hosting and model suppliers before processing personal data. There is no bundled managed database, support access or model account in the default Compose installation. Any future support access requires a separately approved scope and access expiration.

## Customer Data

Business records, contacts, messages, attachments, account credentials and MFA records reside in the operator's PostgreSQL and application-data volumes. Optional integrations and model calls can transmit selected content outside those volumes. The general knowledge corpus is distributed separately with provenance in `data/knowledge/README.md`; it is not a customer database export.

Follow [residency](DATA-RESIDENCY.md), [retention](RETENTION-SCHEDULE.md), and [AI processing](AI-DATA-PROCESSING-ADDENDUM.md). Before accepting real data, document access roles, approved purposes, recipients, retention and a tested restore plan. Do not treat this document as acceptance of customer-specific contractual obligations.
