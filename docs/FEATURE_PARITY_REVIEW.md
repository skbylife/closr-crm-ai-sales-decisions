# Product, quote, pool and data-management parity review

This change concerns the normal, editable self-hosted product. It adds no demonstration mode, fixtures, anonymous login or model invocation.

## Comparison baseline

The review compared the original application source snapshot `594a5cf6c24015647f6705e36eb08c5fc7178e8f` with public baseline `9aa0a7ce85073d5ab6a1a55a9d5bfc7a83cc86a9`. The separately supplied, sanitized production structure snapshot `2324840883eb80157be8e087ad9f6cbe14413912` matched the original hashes of the seven reviewed files. That limited comparison is not proof that every historical production file was identical.

| Area | Original behavior | Public baseline | Candidate / verification |
| --- | --- | --- | --- |
| Navigation | Full application sidebar | Retained | Sidebar and unrelated routes unchanged |
| Products | Table with description, SKU, price, category, active status and editing; sample catalog embedded in page | Real database CRUD, reduced card presentation, missing active-state controls | Table and active-state controls restored; existing catalog API persists status; missing status is labelled, not fabricated |
| Quotes | Table with account, opportunity, status, amount, expiry and deletion | Real draft creation/status persistence, reduced cards | Table restored, existing forms and persistence retained; no claim of line-item editing or sending |
| Pool | Cards with related-record counts, sample values/history, fixed quota/rule claims and local claim state | Real scoped pool and atomic native handoff | Cards retained with actual accessible contact/opportunity counts and values grouped by currency; latest reclaim owner/reason uses persisted history under the existing history permission; detail links/search/sort and guarded claim remain |
| Organization cleanup | Settings entry invoking a mixed seed/reset route; first-membership tenant selection and partial-delete risks | Route/entry removed | Settings entry restored as an explicitly read-only, owner-only inventory preview. Bulk deletion is **not implemented or enabled** |

Search and sorting are usability additions to the pool cards, not claims about the original pool layout. Pool amounts use `opportunities.value/currency`, grouped by currency without conversion. Missing/invalid valuation is counted separately. Latest reclaim data uses `ownership_transfers.from_user/to_user/reason` and current same-organization member display names. History uses the same permission check as the existing transfer-history endpoint; restricted, missing, and no-longer-current history are not fabricated from old embedded examples. Automatic recycling, quotas and cooldown rules are not implemented by this page and are labelled accordingly.

## Cleanup safety gap

`src/lib/get-org-id.ts` still resolves the first organization membership. This is insufficient for destructive organization-wide actions. The new `/api/organization/data-management` GET refuses ambiguous memberships and rechecks the sole membership's owner role. It returns counts for five named business categories only, with no record bodies or attachments. It exports no POST/PATCH/DELETE handler. This is inventory, not a full backup or proposed deletion scope.

Before restoring actual cleanup, implement and test explicit active-tenant selection, recent password/MFA reauthentication, single-use tenant-bound confirmation, verified recoverable encrypted tenant snapshots, an audited atomic delete allowlist, attachment quarantine and conflict-safe restoration. Preserve authentication, memberships, MFA, general BABEL knowledge and audit records. Do not restore the old seed/reset handler or treat an ordinary UI export as a complete backup. No real-tenant bulk deletion was performed in this change.

## Verification

- Targeted catalog/pool/management suite covers authentication, foreign-tenant rejection, product status validation/persistence, scoped pool counts, claim races/failure handling and preview owner/membership checks.
- TypeScript and production build are checked for this candidate.
- Browser acceptance uses a new local PostgreSQL + pgvector database and synthetic records only; model credentials and outbound model calls are not needed.
- English/Chinese tables, forms, pool search/sort/claim and settings preview are reviewed separately from the independent website Demo.

This checklist records bounded parity work; it does not certify every application feature or destructive recovery workflow.

---

## 中文说明

本次仅修复正常可编辑的自部署正式版，不加入 Demo 模式、匿名登录或演示数据。产品/报价恢复表格展示，产品启停状态真实持久化；公海保留真实认领接口，补充实际可见联系人/商机数量、详情跳转、搜索及排序。金额按真实商机币种分别汇总；前任负责人及回收原因读取权限允许的最新回收记录，缺失或受限均明确标注，不伪造额度与自动回收规则。

设置页恢复“组织数据清理”入口，但目前仅提供所有者专用的五类记录数量预览；多组织身份会被拒绝。清空执行仍未完成且保持禁用，因为当前组织解析仍取第一条成员关系。须完成明确租户选择、重新认证、可恢复备份、事务删除与恢复验证后，才能恢复真正的批量清理。此限制不是已完成的清空功能，也不会操作生产数据。

## Follow-up release gates

- Native attachment DELETE now rejects null/array request bodies as 400 and persists scoped intent before deleting bytes; failed intent audit prevents removal. Completion is separately audited. The existing route classifier recognizes the delegated storage audit implementation.
- Keep normal authenticated editable deployment; no Demo paths, fixtures or anonymous-mode switches are added.
- Run the catalog/pool, file HTTP boundary, file service and request-size suites; run the file PostgreSQL integration suite only against a disposable database named `closr_storage_test`.
- Build the candidate; inspect English/Chinese pool values and history using two synthetic tenants. Confirm ordinary members cannot obtain owner-restricted reclaim history.
- Scan changed files before publication. Preserve the previous commit and do not push until review is complete.
- Bulk cleanup remains design-only: see [ORGANIZATION_CLEANUP_DESIGN.md](ORGANIZATION_CLEANUP_DESIGN.md). Single-file physical deletion is not recoverable bulk cleanup and is not filesystem/database atomic.

## Pre-publication gate (2026-10-25)

Publication is on hold. The complete ordinary suite passed 931 tests; its 29 environment-gated tests were then run separately in six disposable PostgreSQL databases and all 29 passed. Attachment completion-audit failure retains a hidden tombstone for retry; bytes are not recoverable from the audit.

A fresh clone of the public GitHub repository was overlaid with the unpublished candidate patch for deployment validation. Private configuration initialized with Node 22. The documented corporate-CA Docker build installed dependencies but failed while preparing a build layer with `ResourceExhausted: no space left on device`. Candidate Compose startup, first-owner setup, persistence/restart and restore have therefore **not** passed this clean-install gate. Earlier deployment evidence is not a substitute.

The aggregate `verify:security` command also stops at a missing `docs/compliance/AUTH-ACCESS-CONTROLS.md`. Other legacy verifier references include missing compliance evidence/edge-protection documents, and the live MFA checker still targets `auth.mfa_factors` rather than native `auth.native_mfa`. These checks need a native-backend review; adding keywords to documentation is not evidence of security coverage.

This follow-up adds no migration or environment variable: it uses the existing file metadata/audit schema and database transaction helper. Normal authenticated operation is retained; bulk organization cleanup stays preview-only. The independent website Demo is outside this repository change.
