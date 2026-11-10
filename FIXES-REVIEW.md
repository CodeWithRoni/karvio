# Karvio 1.2.0 — local fix review

Prepared 11 November 2026 (Asia/Dhaka), from GitHub main `dbb74404bb3865f3093f6ee95463fa804d748863`. **Awaiting the owner's approval: nothing has been pushed or deployed.** The version stays 1.2.0; this is an unpublished patch, not a new announced release.

The layout, modules, business-table schema, existing records, online/offline separation and dependency major versions remain unchanged.

| Audit finding | Local result |
|---|---|
| F01: incomplete prebuilt website | Fresh complete dist generated; build/packaging verify local entry/import/font/icon references. |
| F02: interrupted online restore | Uses the existing durable journal for full-table before-images. Failed restore/reset rolls back; failed rollback blocks reads until recovery. Old receipts are restored too. |
| F03: duplicate invoice after reload | Unconfirmed request IDs survive reload/session renewal, contain no raw payload, and are replayed only with supported backends and within receipt retention. |
| F04: linked supplier permission | Existing combined party edits check customer permission before either record changes. |
| F05: other-staff sales visibility | Product history follows sales.all. The existing dedicated sales.return global workflow is preserved; changing that policy is outside this patch. |
| F06: nested warranty cost disclosure | List, create/update/restock, history and warranty report responses strip nested/serialized cost data for users without cost permission. Internal cost remains intact. |
| F07: missing due reminders | Reminders use canonical current invoice dues, including opening debt, advance and returns. |
| F08: report truncation | Full expense/return/warranty aggregation uses all matching records. Existing bounded UI lists remain bounded. |
| F09: advance counted twice | Public and business invoice paid values use the backend's already-inclusive amount. |
| F10: legacy offline restore | Backups without the later Repairs table are migrated on restore. |
| F11: stale release metadata | Current local package manifest/checksums generated from actual files. They are explicitly marked unpublished. |
| F12: dependency advisories | **Deferred major-version upgrades**, as requested. Current majors have no patched Vite 5 / Router 6 release available. No force fixes or blanket overrides were applied. Dev server binds to loopback by default, CORS is disabled, and editor launch is blocked as a limited mitigation. These measures do not clear every advisory. |

The release workflow now requires all platform builds to succeed, and Pages runs browser regressions before publishing. Default local browser remains Edge; CI can select installed Chromium using KARVIO_BROWSER_CHANNEL.

## Verification

See VERIFICATION.md. New tests use isolated in-memory services or temporary directories. No production user login, business-data read/write, SMS, installer publication or remote database operation was performed while preparing this patch.

## Approval and upload order

Review the source changes and checks first. Only after approval should backend/Code.gs be deployed as a new version of the existing Apps Script deployment, followed by the frontend update. A push to main triggers the repository's Pages deployment, so pushing main itself requires approval. Upload only authoritative Code.gs to Apps Script; legacy backend/parts must not be deployed alongside it.

Before any eventual upload, recheck the current remote head and preserve any newer user changes. Keep the local patch and original snapshot available until validation is complete. This checkout has no .git directory; no branch/commit has been created locally.

The patch does not migrate authentication, add Supabase, alter the established return policy, refactor the ERP, or upgrade dependency majors. Real Google quotas, formula execution, native installers and physical printers remain outside the synthetic test coverage.
