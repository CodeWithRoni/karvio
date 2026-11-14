# Karvio 1.2.0 — local fix review

## Latest review: remaining findings (approved for publication)

Baseline: main `b2cb6d790fe8492cf477f0bf9f382f56d61dcfb6` and Apps Script Version 41. The owner approved main publication and Apps Script deployment. Backend Version 42 was successfully deployed on 11 November 2026 to the same Web App URL, after verifying saved editor contents against the tested source. This file accompanies the approved main publication. Earlier pending/approval notes below are historical.

| Remaining finding | Change |
|---|---|
| Standard installers unexpectedly offline | New standard desktop installations default online; existing offline data keeps offline mode, explicit flags work, and portable offline builds stay offline. Login explains the separate databases. Old distributed installers need replacement to receive the change. |
| Business invoice uses today's debt | New sales store an immutable balance-at-issue snapshot in one appended Sales column. Old invoices without a snapshot show "Not recorded", not a guessed historical balance. Later collections/opening edits do not rewrite new snapshots. |
| Warranty replacement loss missing | Net profit, dashboard and grouped reports deduct replacement cost, recovering it when a vendor unit is restocked. Existing recorded replacement costs are included. |
| Expired free replacements | A free replacement requires a warranty valid when the claim was received. A valid claim can still be fulfilled after expiry while being processed. Expired claims may be recorded but cannot issue a free stock unit. |
| Quote warranty lost in POS | The selected period (including none) is transferred, displayed and saved on the sale; an invoice-based per-sale warranty can override an otherwise unwarrantied product. |
| Quote overwrites POS cart | Existing cart replacement needs explicit confirmation; cancel preserves it. Failed draft storage prevents navigation. |
| Technician labelled Admin | Sidebar displays the actual Technician role. |
| Duplicate customer phones on edit | Editing checks normalized phone ownership, excluding the same customer, before writing. Existing explicit duplicate-creation policy is unchanged. |
| Case-sensitive duplicate serials | New purchase and vendor restock serials check existing spellings without changing historical serials; batch duplicate checks ignore capitalization. |
| Empty stock count becomes zero | Empty/invalid counts are rejected by both UI and server. An explicitly entered zero remains valid, subject to repair reservations. |
| Cancelled repair invoice leaves Delivered job | Reversal restores the job to Completed, clears the cancelled delivery link and reserves the restored parts for a new handover. |
| Repair parts not reserved | Open-job parts are reserved under the existing write lock; stock reductions and serial state changes cannot consume other jobs' parts. Own delivery excludes only its own reservation. Cancel/edit releases reservations. Stock lists show reserved and available quantities. Legacy overbooked jobs need review. |
| Early-morning print dates | Quotation, statement and invoice print dates use the shop day rather than UTC date slicing. |
| Expense/deposit dates from device clock | Shared date defaults use the server-derived shop day, including date ranges. |
| Shared POS draft | Drafts are scoped by shop endpoint and user ID. Legacy shared drafts remain untouched but are not assigned automatically to a user. |
| Outdated setup docs | Current setup/upload instructions identify 1.2.0 and distinguish published baseline from this local review. Historical 1.0.6 release records remain explicitly historical. |

The single appended `Sales.balance_snapshot` column uses existing append-only schema migration; old online and offline backups remain readable. No user accounts, passwords, business records or production data have been reset. Existing unknowable historical balances are not fabricated. No new native installer release has been published.

## Current follow-up: five financial fixes (approved for publication)

Base: main `9d9ebcb8e4e628b57d824e29995fdc135e44845a`. The owner approved publication to main and the existing Apps Script deployment. Backend Version 41 was successfully deployed on 11 November 2026, preserving the Web App URL and access settings. This file accompanies the approved main publication. Earlier pending-upload statements below describe historical review stages.

1. Statements sort entries by business date, then insertion order, before calculating opening/running balances. Backdated entries no longer contaminate opening balances with later transactions.
2. Returns use the server's cumulative rounded line allocation and earlier returned value. Walk-in refunds omit a client-calculated amount so the server refunds its exact canonical value.
3. Repair delivery requires POS permission because it creates invoices and can discount stock or collect money. Repairs-only staff can still manage jobs and mark work completed/failed, but cannot deliver sales or change part prices. Existing prices approved by authorized staff can be preserved.
4. Cancelling with an advance refund fails before any cash leaves if current customer credit cannot cover the full advance. Keeping credit is the default; a failed refund leaves the job open for review. Available credit remains the existing pooled customer credit model.
5. Public invoice links return canonical current invoice due, including subsequent payments/returns, while preserving original due separately and historical paid-at-sale values. Reopening/reloading the existing link fetches the updated amount; no new link is needed.

New isolated checks are in `frontend/test/financial-fixes.cjs`, included in `npm test`. No production business records or schema were changed. Existing historical bad entries are not rewritten by these fixes.

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
