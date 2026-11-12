Owner authorized publishing POS previous-due collection and separate CP receipts. Supabase API version19 is ACTIVE; all deployed files match tested source, and read-only ping confirms saleDuePayment support. Frontend publication follows. No migration, reset or business-data edit. Earlier local-only notes are historical.

## POS separate previous-due collection — LOCAL ONLY

Requested POS checkbox and independent due-payment receipts implemented locally. Baseline main:d6bdb7f619203cb6e15f418e94a9d19fc14c9437. No push, live API deployment, database migration, production reset or business-data edit. Deploy tested backend BEFORE frontend when authorized; earlier status notes below are historical.

- Positive customer debt offers Make previous due payment. The separate split-account section starts blank, is optional, clears on customer change/uncheck/reset, and supports refreshing customer balance. It never consumes sale change automatically. Sale payments, credit and refund limits remain separate.
- sale.create validates previous_due_payments and expected_previous_due, active accounts, positive current debt, no overpayment, finite amounts, stale balance and customers permission alongside pos. UI requires saleDuePayment capability and customers permission. Bootstrap and Supabase ping advertise the capability.
- Independent customerPayment_ CP receipts are inserted BEFORE the sale's ledger entry within its one atomic, idempotent request. The frozen invoice balance snapshot reflects the previous-debt payment; purchase/sale payment amounts are not combined. Errors roll back every financial/stock row, and replay cannot collect twice.
- Return/cancellation of the sale cannot void the CP payment refs. In particular, a partially paid sale cannot refund old-debt cash as invoice cash. CP receipts remain visible in the customer ledger and independently cancellable only via the existing authorized payment reversal.
- Sale completed shows CP receipt numbers and Print due payment receipt; split accounts print one separate money receipt listing the CP numbers and account amounts. Complete & print also retains this receipt action after printing the sale. Customer ledger payment rows offer Print receipt for later reprints even after sale cancellation/return; dated reprints use the payment date.

Validation: full regular suite passed; complete Supabase gateway/earlier financial suites/new pos-due-payment.mjs passed, including atomic split accounts, replay, original debt allocation/snapshot, cancel/full return/partial-payment refund cap, blank defaults and invalid/stale/permission rollback. All88 Microsoft Edge browser workflows passed, including separate receipt printing/reprinting after cancellation, full return retention, blank toggle and stale refresh. Final production build/assets passed. All financial test data was local and isolated.

```json
{
  "scope": "POS optional previous due collection with independent CP receipts",
  "deployment": "owner-authorized publication; API version19 verified before frontend",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "allBackendRegressions": "passed",
  "posDuePaymentRegression": "passed including partial-return cash cap and independent receipts",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 88,
    "failed": 0
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false,
  "productionResetPerformed": false
}
```

Owner authorized publishing purchase previous-due payments. Supabase API version17 is ACTIVE; all source files match the tested build and read-only ping confirms purchaseDuePayment support. Frontend publication follows. No schema migration, data reset or business-data edit. Earlier local-only notes are historical.

## Purchase form: optional previous supplier due payment — LOCAL ONLY

Implemented without publication. Baseline main:0745837777e37ebe4aaa76956d33b42a7bdd5e08. No live business rows, database schema, migrations, API deployment or reset changed. Publish backend BEFORE frontend when owner requests deployment.

- A positive previous supplier balance offers Make due payment to the supplier. Checking opens the existing split-payment design directly below previous due. Empty/zero amounts or an unchecked section do not settle any old debt. Supplier changes and unchecking clear payment drafts.
- Current invoice payments and previous-due payments remain separate. Combined supplier payable subtracts both; the preview also shows previous due payment and remaining old due. Previous payment amounts are rounded per line to match server accounting. A Refresh supplier balance control preserves purchase inputs.
- purchase.create accepts previous_due_payments and expected_previous_due. It validates active accounts, non-negative finite amounts, supplier permission in addition to purchase permission, current balance and no overpayment of old due. A changed balance fails with refresh instructions. All writes share one transaction and one replay receipt: no partial purchase/payment and no duplicate payment on retry.
- Old due payments use ordinary separate SupplierLedger / AccountTxns payment receipts, with the purchase number in their note. They do not inflate purchase.paid or change its original due. Cancelling the new purchase retains those independent supplier payment receipts, which can be reviewed/cancelled using the existing supplier-payment workflow.
- Bootstrap and Supabase ping advertise purchaseDuePayment support. The frontend only offers the option with that capability and supplier-payment permission, so an older API cannot silently ignore a payment selected in this UI. Existing purchase requests remain compatible. No new tables or columns.

Validation: complete regular suite passed; complete Supabase suite and purchase-due-payment.mjs passed (split accounts, allocation, rollback, stale/invalid/overpayment rejection, permission, blank option, idempotent replay and independent cancellation). All84 Microsoft Edge browser workflows passed, including four new purchase due-payment/blank/supplier-change-refresh/rounding cases. Final production build and assets passed. All financial tests ran against isolated local data, never the production shop.

```json
{
  "scope": "optional atomic previous-supplier-due payment in New purchase",
  "deployment": "owner-authorized publication; API version17 verified before frontend",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "allBackendRegressions": "passed",
  "purchaseDuePaymentRegression": "passed",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 84,
    "failed": 0
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false,
  "productionResetPerformed": false
}
```

Owner authorized publishing stock footer alignment. Frontend-only publication in progress; no API deployment, database migration or data reset. Earlier local-only notes are historical.

## Stock total alignment — LOCAL ONLY

Single-unit pcs totals now display plain numbers, aligned right under Stock, Reserved for repairs and Available to sell. Mixed-unit totals retain explicit units to avoid combining incompatible quantities. Selected Excel exports keep pcs totals numeric. No calculation, backend or live data change. Two focused stock browser tests passed (including right-alignment checks), and production build/assets passed. Full80-browser validation below belongs to the preceding stock-total implementation. Not pushed or deployed.

```json
{
  "scope": "plain numeric pcs stock footer totals and alignment",
  "deployment": "owner-authorized frontend publication; no API or database changes",
  "focusedBrowser": {
    "passed": 2,
    "failed": 0
  },
  "productionBuild": "passed",
  "backendChanged": false,
  "schemaMigrationRequired": false
}
```

Owner authorized publishing filtered stock totals. Frontend-only publication in progress; no API deployment, database migration or business-data reset. Earlier local-only notes below record pre-publication validation.

## Filtered stock totals — LOCAL ONLY

Requested stock explorer totals are implemented; not pushed or deployed. Baseline main is fedc4134f4489132e3c96b574fe7405a6c8d391b. No backend, API, database schema or business-data change is required. Earlier publication/local-only notes below are historical.

- Footer totals follow product group/category/brand/exact quantity/low-stock/inactive filters AND table search, across all pages.
- Stock, reserved and available quantities are grouped by selling unit (pcs/meter/etc. are never added as one quantity); service products are excluded.
- Cost and Stock value totals use stock times unit cost. Price total uses stock times selling price, including reserved inventory. The existing unit cost/price cells stay unchanged. Cost totals remain hidden without cost permission.
- DataTable supports per-column total functions for the filtered footer and selected-row exports. Excel preserves numeric money totals and unit-qualified quantities; PDF/print preserve text totals instead of formatting them as zero.
- A short note explains calculation and scope. Selection affects exported totals; the on-screen footer still describes all matching rows.

Validation: full regular regression suite passed; all80 Microsoft Edge browser tests passed, including new mixed-unit/filter/search/selected-Excel and 101-row pagination/cost-permission cases; final production build/assets passed. Tests used only the local test server and mocked fixtures. No production reset or live data edit.

```json
{
  "scope": "filtered stock quantity and weighted inventory price totals",
  "deployment": "owner-authorized frontend publication; no API or database changes required",
  "regularSuite": "passed",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 80,
    "failed": 0
  },
  "productionBuild": "passed",
  "backendChanged": false,
  "schemaMigrationRequired": false,
  "productionResetPerformed": false
}
```

Owner authorized publication of the eight follow-up fixes. Supabase API version15 is ACTIVE, all deployed files match tested source, and public ping passed. Frontend main/Pages publication follows. No schema migration or business-data reset. Earlier local-only notes are historical.

## Eight follow-up audit fixes — 12 November 2026 — LOCAL ONLY

All eight latest requested corrections are implemented and tested locally. No push, API deployment, schema migration or production data reset was performed. Live baseline is main e25449d8d9ee30bc1611d7d0457fe19c17e96b74 and Supabase version13. Older publication/local-only notes below are historical.

1. Reports hub Product-wise Sales allocates invoice discounts to each line using the existing exact net allocation. Revenue and profit reconcile with invoices, including cent remainders. The Profit page's separately labeled pre-discount product breakdown remains as documented.
2. Cancellation of invoices with stock warranty replacement history is rejected, including delivered and vendor-restocked claims. This preserves the replacement cost and vendor recovery history instead of allowing a financially inconsistent reversal. Ordinary invoices remain cancellable. This is a dependency guard, not an automatic warranty reversal or a rewrite of earlier records.
3. Any opening balance change (customer/supplier/account, including nonzero new openings) is rejected while books are closed; reopen explicitly to change it. Unchanged openings and ordinary profile edits still work. UI disables opening inputs and explains why. Failed requests roll back the whole profile update.
4. Party statement exports use batches of300 and validate count, identity and order before creating a file. Oversized direct API calls, missing IDs and duplicate IDs fail explicitly instead of truncating or skipping records.
5. Expense list returns all matching rows for table totals/export; category/date/status filtering remains.
6. Sales return, purchase return and warranty lists likewise return all matches instead of silently dropping rows above500.
7. Price Quick fill targets the same first500 visible rows that render in the table. The button states500 shown; hidden matches keep their original prices.
8. Saving a quotation uses the server-adjusted shop day. A browser test at01:30 Bangladesh time confirms the new day is stored despite the previous UTC date.

Validation: complete regular suite passed; complete Supabase backend suite including final-audit-fixes.mjs passed; client export regressions passed; all78 Edge browser workflows passed; production build and generated assets verified. Backend tests use only isolated in-memory data. Browser reset/restore tests target only the local test server. No live business records were read or changed.

```json
{
  "scope": "eight follow-up audit fixes: reporting, warranty cancellation, closed openings, complete lists/exports, visible price fill and shop-day quotations",
  "deployment": "owner-authorized publication; API version15 verified; frontend publication in progress",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "allPriorBackendRegressions": "passed",
  "finalAuditBackend": "passed including rollback and valid operations",
  "clientExportChecks": "37 follow-up checks passed, including complete 601-party batches and incomplete-response rejection",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 78,
    "failed": 0
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false,
  "productionResetPerformed": false
}
```

Owner authorized live publication on 12 November 2026. Supabase API version 13 deployed and source verified; public ping passed. No schema migration, production reset or business-data edit. Earlier local-only status below records pre-publication validation.

## Local history-retention rules — 12 November 2026 (NOT DEPLOYED)

```json
{
  "scope": "used products/accounts/expenses history retention and fresh owner reset",
  "deployment": "owner-authorized publication; API version 13 verified; frontend publication in progress",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "allPriorAuditRegressions": "passed",
  "historyRetentionRegression": "passed, including settings bypass guard and local reset",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 75,
    "failed": 0
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false,
  "productionResetPerformed": false
}
```

Owner requested preserving used products, accounts and expenses until explicit database reset. No reset, production business-data change, deployment or push was performed. Live baseline remains main eb576760ad3e0726f1c6f8c16022ea0eae542b02 and Supabase API version 11.

- Product Delete now fails instead of silently deactivating a used product. A cached productUsageIndex_ covers purchases/sales/returns/serials/events/claims/repair parts, including cancelled history. products.list exposes has_history and the Edit form disables Delete for history or nonzero stock. Active remains the separate way to stop using a product. The existing product.history endpoint is unchanged.
- Cash/bank/MFS accounts already have no delete route. accounts.list now exposes history, including voided AccountTxns and cancelled expenses; used-account Edit explains retention and offers Active off. Account rows/transactions remain present when deactivated.
- Expense cancellation keeps its row and voids linked cash movement as before. Used expense category names cannot be removed/renamed through expense.categories or the generic settings.save path; the UI loads usage and disables those actions, including after cancellation. Unused categories can still be managed. Canonical case/spacing matching prevents bypass; pre-existing unconfigured legacy category names do not block unrelated settings changes.
- Owner-only, password/RESET-confirmed reset remains the maintenance path to a fresh database. A local in-memory test confirms old products, custom accounts, expenses, ledgers and business history clear, while the owner remains and a new zero-balance Cash account is created. Default keep_settings/keep_users are false; the existing optional retention checkboxes remain explicit user choices. No production reset was run.

Validation: full regular regression suite passed; Supabase gateway (63 checks), all earlier audit suites and backend/test/history-retention.mjs passed; full Edge browser suite 75/75 passed; final production build/assets passed. No schema migration is required.

Latest owner instruction authorizes publishing all pending follow-up fixes and transaction-history deletion protection. Supabase API version 11 is ACTIVE; all six deployed files match tested source, and public ping is healthy. No schema or business-data migration was performed. Earlier local-only notes below are historical for this publication.

## Latest local deletion protection — not published

```json
{
  "scope": "follow-up fixes plus explicit transaction-history deletion protection",
  "deployment": "owner-authorized publication; API version 11 deployed and verified; no business-data migration",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "allAuditBackendRegressions": "passed including voided/cancelled and combined-profile history",
  "latestFocusedBrowser": {
    "passed": 6,
    "failed": 0
  },
  "priorFullBrowser": {
    "passed": 71,
    "failed": 0,
    "before": "latest shared-history metadata and Delete-button refinement"
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false
}
```

Owner explicitly requested preventing any customer/supplier with transaction history from being deleted. A shared indexed history check now drives both API has_history metadata and the server delete guard, including cancelled invoices/voided payments, jobs/claims, and a combined profile's linked side. Delete is disabled in the directory detail even at zero balance when history exists. The explanatory note points to Inactive. Unused zero-balance profiles remain deletable. No live data or deployment changed.

Validation for this latest change: full regular suite passed; Supabase gateway and all three audit regression groups passed (including new zero-balance voided-payment/cancelled-invoice and combined-profile cases); focused browser suite 6/6 passed; final production build/assets passed. Earlier full 71-browser run below predates only this last history-metadata/button refinement.

## Local follow-up fixes F01–F10 — not pushed or deployed

```json
{
  "scope": "follow-up F01-F10 plus Sales report ownership, retaining B01-B19 fixes",
  "deployment": "local only; no push, API deployment or live data change",
  "regularSuite": "passed, including 30 new client checks",
  "supabaseGatewayChecks": 63,
  "followupBackendRegressions": "passed with denied-write rollback and legacy compatibility checks",
  "priorAuditRegressions": "passed",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 71,
    "failed": 0
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false,
  "legacyWarranty": "unique historical line inferred; ambiguous claims require review",
  "previouslyDeletedParties": "not automatically reconstructed"
}
```

Latest owner request authorizes fixing the follow-up audit, including Sales report ownership consistency. Current live baseline remains main fd4a920fb8cd3f2eed0380b780f69f8b1a26069e / Supabase API version 9. No production reads of business data, writes, resets, deployments or GitHub pushes were performed for these fixes. Earlier publication notes below refer to the previous release.

- F01/F06: unused zero-balance parties can still be deleted. Financial/job history prevents permanent deletion and points to Inactive; open repairs have an explicit guard. Payment cancellation also rejects a pre-existing missing party instead of creating invisible debt. Records already deleted in a live database are not reconstructed or migrated by this local patch.
- F02: serial tracking cannot be switched off after serial history exists, even at stock zero; unused serial products remain editable.
- F03: new warranty claims retain the exact validated sale_item_id in the immutable first claim-log entry (existing JSON log column). Replacement checks only that line. Legacy claims infer a line only when unique by serial or warranty expiry; ambiguous legacy claims stop for review instead of guessing. No schema migration/backfill is required.
- F04: public API adds paid_now/net_total/returned_total/live_invoice while retaining historical paid/paid_at_sale/original_due. Public view and print/PDF use live amounts; staff invoices keep frozen balances. Public document shop/template/note are passed directly to the renderer, without changing shared staff settings. Active returns are shown separately so net amount, paid and due reconcile.
- F05: stocked products cannot be deleted. Explicit stock adjustments write off inventory; zero-stock products with event/job/claim history are deactivated, preserving the audit trail.
- F07: return table totals, selected summary exports and all-status Sales/Purchase Return reports count active financial rows only. Cancelled documents remain visible.
- F08: selected purchase documents load in checked batches of 200; oversized server requests fail explicitly rather than truncate. The browser export of 201 selected invoices and helper batching of 501 documents are covered.
- F09: Purchase Reports show Due at purchase and Due now for invoice, daily, monthly and yearly groups, including totals.
- F10: one quotation calculator validates quantity/price/discount and rounds invoice lines consistently. Invalid discount disables save/POS/print, and the print helper also refuses invalid totals. Corrected valid quotations remain usable.
- Sales report permission: invoice and grouped Sales reports honor sales.all just like invoice details; an own-sales reporter cannot select another staff member via user_id. Other shop-wide dashboard/report permissions are not redefined by this patch.

Validation: full regular suite including 30 new client checks passed; Supabase gateway (63 checks), original B01–B19 regressions and new follow-up backend regressions passed; focused 5-case browser suite passed; production build/assets passed. Full Edge browser suite: 71/71 passed, including all 66 prior browser workflows and five new follow-up cases.

Owner authorized publication of all 19 audit fixes. Supabase karvio-api version 9 is ACTIVE; deployed sources match all six tested local files; public ping is healthy and advertises chunked restore. No schema/data migration performed. Main push and CI/Pages verification are in progress. Earlier local-only notes below are historical.

## Local remaining audit fixes — 11 November 2026 (NOT DEPLOYED)

```json
{
  "scope": "audit B01-B19 combined local fixes",
  "deployment": "Supabase API version 9 deployed; main publication owner-authorized; no production data changes",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "urgentRegressions": "all nine passed",
  "remainingBackendRegressions": "passed, including actual >8 MiB restore",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 66,
    "failed": 0
  },
  "build": "passed",
  "schemaMigrationRequired": false,
  "restoreLimitMiB": 16,
  "legacyCredentials": "incompatible legacy password backups refused safely; no credential conversion"
}
```

Audit B10–B19 implemented locally on top of the unpublished B01–B09 fixes. No GitHub push, hosted deployment or live database mutation performed. Existing business records and schema are unchanged.

- B10: refuse serial-tracking activation when nonserial stock OR nonserial purchase/sale history exists (past returns could otherwise recreate untracked stock). An unused zero-stock product may enable tracking.
- B11: Sales table totals and summary exports sum active invoices only; cancelled documents remain visible with their original amounts. Filtering and selected summary totals use the same rule.
- B12: purchase detail supplies cumulative net_total/returned_qty/returned_value; purchase-return UI uses the same allocation as sales/server, including partial prior returns. Refund 66.66 now agrees with the server.
- B13: sales.list returns every matching invoice unless a caller explicitly requests a limit. Sales detail requests above 200 are rejected explicitly; frontend fetches selected documents in complete batches of 200 and verifies IDs/counts before producing any export.
- B14: supplier invoice due_now is allocated from live nonvoid ledger entries, with FIFO payments and own-invoice return credits. Purchase list/detail/Excel/print distinguish Due at purchase and Due now; historical due stays unchanged.
- B15: reset/restore clear namespaced POS drafts and quotes for all users of the current endpoint, preserving other endpoints. Legacy unscoped keys are removed. Storage access failures are reported after confirmed database success.
- B16: quotations are scoped to authenticated user plus API endpoint; legacy shared quotes are not automatically assigned to a user. Existing 30-quote device limit remains.
- B17: Supabase-only owner/password-gated staged restore supports backup files up to 16 MiB using 128 Ki-character chunks. Per-request 8 MiB transport guard remains. Stages persist in existing private server metadata cache, expire after 30 minutes, verify size/full SHA-256 and ordinary backup checksum/credential checks, and restore atomically with the existing safety snapshot. Partial uploads never change business rows. Duplicate chunks are safe; conflicting chunks fail. Completion receipt prevents duplicate restores after lost responses. The browser stores only upload ID/hash/expiry in sessionStorage and can resume/check completion, including UTF-8/surrogate boundaries. Files over 16 MiB are refused explicitly; unlimited restore is not implemented.
- B18: full-height online-app wrapper restores the viewport height chain, independent main/sidebar scrolling and reachable Sign out. Online blocking remains in place.
- B19: product.save preserves entered name whitespace while rejecting blank names; duplicate-name canonical comparison stays unchanged. Product preview and saved description suffix now match.

No new migration is required: staged upload data uses already-private metadata/cache and the existing revision compare-and-swap commit. Regenerate hosted engine from Code.gs + engine-overrides.txt, without --schema. Future owner-authorized deployment must update the hosted backend before the frontend; older backends explicitly report missing large-restore support.

Local checks: complete regular suite passed; hosted gateway 63 checks plus B01–B09 and remaining-audit regressions passed; actual >8 MiB backup successfully staged/restored in the local hosted runtime; production build/assets passed. Full Edge browser suite: 66/66 passed, including 7 remaining-audit cases and updated quotation/naming regressions.

## Local urgent fixes — 11 November 2026 (NOT DEPLOYED)

```json
{
  "scope": "audit B01-B09 urgent fixes only",
  "deployment": "local only; no production changes",
  "regularSuite": "passed",
  "supabaseGatewayChecks": 63,
  "urgentRegressions": "all nine passed; denied writes leave business rows unchanged",
  "browser": {
    "engine": "Microsoft Edge",
    "passed": 59,
    "failed": 0
  },
  "productionBuild": "passed",
  "schemaMigrationRequired": false,
  "legacyBackup": "incompatible credentials safely refused; no legacy password conversion"
}
```

Owner requested fixing audit B01–B09 only. No GitHub push, release, hosted function deployment or production database mutation is authorized/performed in this fix turn. Preserve the remaining audit findings for separate work.

- B01: serial matching prioritizes any live/non-returned serial over older supplier-return records; repurchase can no longer admit duplicate live serials.
- B02: invoice open dues allocate active ledger debits/credits rather than stale saved due/advance fields; voided advance receipts reopen invoice debt, including public invoice links.
- B03: repair cash refunds require Customers permission server-side; repairs-only UI disables refund while retaining cancellation with credit kept.
- B04: sales-return creation and listing enforce the original invoice owner unless sales.all is granted. Route explicitly forwards the authenticated user.
- B05: stock/service warranty replacement rejects fully returned products on the original invoice; valid partial returns retain eligibility.
- B06: Inventory/Service type changes are refused once purchase/sale history exists, preserving historical stock semantics. Unused products can still change type.
- B07: hosted restore preflight rejects legacy/malformed credential hashes before any replacement. Compatible Supabase backups still restore. This prevents data replacement followed by owner lockout; it DOES NOT convert/import legacy password hashes.
- B08: account ledger sorts chronologically with stable row ties, calculates range opening/closing, and exposes current_balance separately. UI labels range balances separately from current funds.
- B09: repair output exposes available_advance; delivery fetches fresh job/credit before initializing payment, sends expected_credit, and server rejects changed/stale advance before any sale/stock write. Old clients cannot silently deliver using spent advance.

Backend source: backend/Code.gs; hosted override: supabase/engine-overrides.txt. Regenerate via node scripts/generate-supabase.cjs (without --schema). No schema change or migration is needed. On a future authorized deployment, deploy backend before frontend and refresh clients. No historical records are rewritten by these changes.

Validation: npm test passed; npm run test:supabase passed (63 gateway checks plus new backend/test/urgent-fixes.mjs covering all nine scenarios, public due, failed-write rollback and allowed operations); production build/assets passed. Full Microsoft Edge browser suite: 59/59 passed (including spent-advance delivery and restricted-technician refund UI).

Online-only release (owner authorized publication): desktop always uses online profile; offline runtime and backend excluded from installer; legacy offline bridge rejected; disconnected browser blocked with form retained. No database changes or data deletion. Build, npm test and connection-loss browser regression passed. Old downloaded installers require replacement.

# Karvio 1.2.0 — local patch verification

## Fresh Supabase backend — current follow-up

Current owner-approved publication: includes all pending sidebar/label, Repair filters, Dashboard overview/shortcut, import/export icon and product naming changes. Four hosted/local migrations match; RLS and daily backup schedule verified active, owner preserved. Full 56-case browser suite passed together after fixture isolation correction. A final two-case naming-save/category pair passed after preserving description whitespace in backend storage (future saves only; no historical rewrite). Regular 1,343 and Supabase 63 assertions passed; build/assets passed. No production test records or SMS were created.

Latest separator clarification: product description now uses ' #' before the raw description (space before #, none added after). Model #Description is the default. User-entered leading description spaces remain intentional. Updated browser case verifies the corrected format, replacement/clearing and custom names. No push/deployment.

LOCAL-ONLY # spacing correction: description suffix now uses '#' directly with no inserted spaces; description text retains user-entered whitespace. Tests passed for no space, explicit leading space, whitespace-only/empty description, replacement and manual base names. Build/assets passed; screenshot updated. No push/deployment.

LOCAL-ONLY product naming correction: preserved field positions, moved Brand to the start of generated names, and append nonblank short description as " # description". Changing/clearing description updates/removes that suffix; manual base names remain manual and can receive the suffix. No bulk/historical rename or backend/database change. One focused browser check passed for brand-first naming, suffix replacement/removal and custom names; screenshot reviewed with test data. Build/assets passed. No deployment/push performed.

LOCAL-ONLY import/export icon correction: all five master panels use distinct outward document-arrow Export and inward document-arrow Import SVGs, rather than ambiguous download/upload arrows. Existing handlers are preserved. The master-selection browser check now confirms Import opens the file chooser, Export produces the selected-only spreadsheet and bulk deletion still works; passed 1/1. Build/assets passed and requested screenshot captured with test data. No API/database change or deployment performed.

LOCAL-ONLY dashboard header review: replaced the top period selector with Total Business Overview and use all-time totals for the summary. Added New Service and New Repair immediately before New sale; repair opens the existing create-job modal directly and Service opens its pending-workflow page. Existing permission checks retained. History and leaderboard period controls are unchanged. New shortcut/mobile check and updated totals auto-refresh test passed together (2/2); desktop screenshot reviewed using test data. No API/database migration or deployment. Production build/assets passed.

LOCAL-ONLY repair filter restoration: dashboard cards and the legacy filtered job table are now visible together. Restored Open/Received/Completed/Failed/Delivered/Cancelled/All tabs, technician filter, table search and existing exports below the cards. Added received-period selector and Reset filters; card drilldown synchronizes list state and scrolls to it without removing the dashboard. Existing job dialogs/actions remain unchanged. Ten focused repair/access/delivery/cancel browser cases passed; the final dashboard case and production build/assets also passed after final layout cleanup. Desktop screenshot with mock data reviewed. No API/database change or deployment performed.

LOCAL-ONLY follow-up after published commit a8bd19c5: owner asked not to push without another instruction. Sidebar width increased to 264px and row gaps/padding balanced so existing module names stay on one line with icons and shortcuts. Full labels retain hover tooltips. Desktop check verified no current label is truncated; all-routes, 390px mobile-fit and menu-toggle browser checks passed (3/3). Production build/assets passed. No deployment/API/database change for this follow-up. The earlier 54-case release result below is historical; only the relevant navigation checks were rerun for this spacing change.

Owner-approved publication: Edge karvio-api version 5 deployed; public ping reports backend=supabase and requiresSetup=false. Local migration filenames match all four hosted versions. Added a private pg_cron daily snapshot at 02:00 Dhaka, default 30-day retention, configurable from Database settings. Ran one snapshot successfully; verified active schedule, snapshot count and unchanged owner/sales counts (1/0). Hosted security advisor has no WARN/ERROR findings. Final local regular suite passed 1,343 assertions; Supabase suite passed 63; final complete Edge suite passed all 54 together (1.0 minute), after sidebar and backup UI updates. Production build/assets passed. Main push and GitHub Pages pipeline are authorized; no production financial test data or SMS was created.

Sidebar icon review (local only): replaced all five group dots with semantic native SVG section icons and added a matching outline icon to every module link, including Repairs and the new Service placeholder. One consistent stroke family supports current-color active/hover accents, slight hover feedback and reduced-motion preference; icons are decorative and hidden from accessibility names so existing labels/shortcuts remain usable. No icon package, remote font or network dependency added. Build/assets passed. Four existing browser checks passed for all module routes, mobile fit, menu hide/show and Advance Search placement. The all-routes check was expanded to include Repairs and Service and passed separately; desktop screenshot reviewed. No deployment/push performed. The last full 54-case pass predates this visual change; only these relevant navigation checks were repeated.

Input wheel review (local only): added an App-level passive capture listener covering focused number/range/date/time/datetime-local/month/week inputs and closed select controls, including lazy pages and modal portals. Wheel stepping is stopped by blurring the focused stepped control before its default action, without cancelling the wheel event; text/textarea focus and scroll propagation remain normal. Existing per-field noWheel handlers remain. New real mouse-wheel tests passed for the reported custom warranty days, low-stock input, dynamically inserted native controls (without local handlers), dropdown keyboard changes, decimal typing and scrolling while a text field keeps focus. No business data migration or deployment was performed. Frontend build/asset verification passed.

Latest complete Edge run: all 54 browser cases passed together (1.0 minute), including the two new global wheel regressions, existing POS quantity wheel check and corrected collection-reminder selectors. Initial new tests needed accessible-label/heading selector corrections; no workaround changed the input values being tested. Source inventory found no other wheel-based increment/decrement handlers. These results supersede earlier grouped browser counts below.

Repair dashboard review (local only): Repairs opens eight received-date cards: Today, This week, This Month, Last Month, Last 3 Months, Last 6 Months, This Year, Last Year. Each shows current Received/Pending, Completed/Complete and Failed counts. Card title/footer opens all jobs for that period, while clicking a count applies that status; row click opens the existing job details. Clock and main-dashboard period controls are not included. Week starts Saturday, rolling 3/6 calendar months include the current month, and server shop date is supplied by the new `repairs.meta.today` field. Delivered/Cancelled remain in period lists but do not inflate the three current-status counts. Lists and counts auto-refresh and year/leap-month boundaries are covered by 15 new assertions. Deploy the regenerated backend before this frontend when publication is approved; this repair change has not been deployed.

Repair validation: regular ERP suite passed 1,343 checks; Supabase compatibility passed 55. Focused repair/access/delivery/cancel browser run passed 10/10. Full 52-case run passed 51; its remaining collection-reminder test used a selector shared with repair alerts and was scoped to the named Collection reminders region. Both the new repair dashboard test and that corrected reminder test then passed together (2/2), including coexistence of a completed-repair alert. Thus 52 distinct browser cases have passing results, grouped across runs. Build/import/font/icon checks passed. Reviewed the desktop preview image and verified mobile width. No real job/customer/account data was written.

SMS settings review (local only; owner asked to wait before live publication): removed both MRAM preset options; retained OneCodeSoft, BulkSMSBD, Generic JSON POST and Generic form POST. Saved legacy/custom configurations are not silently erased. Added guided request-field mapping for simple JSON/form payloads, masked/revealable API key, expandable advanced method/body/headers, HTTPS/placeholder/JSON validation, unsaved-change guard for test sends, phone validation, sale/repair/technician preview and refreshed delivery logs. A queued test result is shown as queued rather than "sent". Structured/numeric JSON bodies remain in advanced editing instead of being silently converted. Test uses an intercepted SMS response; no real provider was contacted. Regular suite passed (1,328 reported checks, including 14 preset and 10 mapping checks); all 51 Edge browser cases passed in 57.3 seconds, including custom mapping persistence, queued result and mobile overflow. Production build/assets passed. This SMS change was not pushed or deployed.

Master-list selection follow-up: added per-item/select-all-shown checkboxes to all five master panels. Export uses marked records when selected; with none marked, existing export-all behavior remains. Bulk delete uses one products-permission, idempotent transaction (1–200 IDs); an in-use item rejects the entire batch. Export/import/demo and rename/delete use icons with accessible names/tooltips. Built-in frontend API now points to Karvio Supabase; explicitly saved per-device endpoints still take precedence. Supabase Edge version 4 deployed for the new bulk action. Local frontend publication is pending owner review. Existing 1,324 assertions plus 55 Supabase assertions passed; all 50 browser cases passed together in 55.0 seconds. Build/assets passed after responsive header wrapping.

Fresh-default follow-up: owner requested removal of all seven seeded warranty periods and optional Feet/Meter selling units (Pieces was not marked). Confirmed no products/sale items/purchase items referenced them, saved a private safety snapshot, removed only matching seeded records under the runtime lock and advanced revision. The Supabase-only engine no longer seeds warranty periods and uses only the base Pieces unit on setup/reset; bootstrap also cannot repopulate Feet/Meter. Adapter suite now passes 50 checks, including four fresh-default checks. Edge version 3 deployed. Existing owner account and credentials were preserved.

Owner-setup correction: the first real HTTP setup failed with `DELETE requires a WHERE clause`; no account was created (Users=0/revision=0). The compatibility commit now deletes only valid `_position >= 2` rows, leaving Supabase safeupdate enabled. Added an installed-function row-scope regression to the hosted transaction fixture. The prior SQL-console test did not reproduce PostgREST's loaded safeupdate module. Loading that protected library from the console was denied, so no claim is made that the console test is an HTTP-equivalent test. Actual owner setup remains a user-password handoff.

11 November 2026: the separate Karvio project has 29 business tables and four private tables, with RLS and service-role-only storage RPCs. Edge `karvio-api` version 2 is deployed; public ping passed. Hosted SQL initialization/CAS/typed-row rollback/rate-limit checks passed inside a rolled-back transaction. Final read: Users=0, Products=0, Sales=0, revision=0, one-time owner setup ready. No old data or known default password was inserted. Security advisors have no WARN/ERROR findings; 33 informational no-policy RLS notices reflect intentional direct-client denial. See SUPABASE-SETUP.md for implementation limits, including full-snapshot capacity and unavailable Google Drive scheduling.

The existing 1,324 assertions passed again; 46 additional Supabase adapter assertions passed. Existing 48 Edge browser cases passed together in 53.7 seconds; the new setup-wizard case passed separately. Frontend build/import/font/icon validation passed. A restricted temporary-file rename initially blocked the offline tests; the full suite then passed with permission to use its disposable temporary database. Real customer data, real SMS delivery, production load and post-owner end-to-end hosted money flows have not been exercised. The main website has not been switched, and no GitHub push was made for this follow-up.

Earlier verification notes below describe the already deployed Apps Script release.

Date: 11 November 2026 (Asia/Dhaka). Remaining-fixes base: main `b2cb6d790fe8492cf477f0bf9f382f56d61dcfb6`. The owner approved main publication and Apps Script deployment. Backend Version 42 was successfully deployed on 11 November 2026 to the existing Web App URL; saved code matched the tested source. The append-only invoice snapshot column is initialized by normal schema handling, without a reset/setup run. No production transaction or historical balance rewrite was performed. Earlier publication notes below describe prior stages. The original 1.0.6 record remains in VERIFICATION-1.0.6.md.

## Recorded results

Latest remaining-fixes review adds 51 isolated assertions, plus a browser test for preserving quote warranty and confirming cart replacement. The actual Electron offline UI passed restart persistence, stock/accounts, Bengali PDF, backup/restore and zero internet requests. A fresh standard Electron start passed online-mode/sign-in/no-offline-database checks. Windows Electron was exercised; newly packaged Windows/macOS/Linux installers have not been built or published in this review.

Final current run: `npm test` passed all 1,324 assertions; the complete 48-case Edge browser suite passed together in 57.0 seconds. Production frontend build and entry/import/font/icon validation passed. Transfer inventory/checksums were regenerated and verified. No local test used the shop's actual database.

Regressions include reserved quantities/serials, blocked writes rolling back without a stray invoice, own-job delivery, reversal/reopening/re-reservation, reservation release, empty count rejection, normalized duplicate phones/serials, stable invoice snapshots, legacy snapshot-column backup restore preserving an invoice, warranty cost loss/recovery, expired claim rejection, per-sale quote warranty, draft isolation, shop-day print output and desktop mode selection. Legacy invoices without stored balances explicitly show "Not recorded".

Publication follow-up: the first combined CI run passed 46/47 browser cases. A pre-existing repair test assumed there was exactly one technician; the new permission test legitimately added another. The repair dropdown test now compares all options against all active Technician-role users, preserving its role-filter check. The audit and repair files passed together (9/9 locally). The public production health check also passed (`Live Karvio API verified: 1.2.0`); it performs no business writes.

Current five-fix follow-up: `npm test` passed (1,273 assertions including 39 new financial regressions). The existing 45 Edge browser tests passed in 54.0 seconds. The updated audit browser file then passed all five tests, including two new tests, for 47 distinct passing browser cases. `npm run build` and its asset validation passed. Tests used mocked Google services and disposable local databases; no production transactions were performed. The first restricted browser-server attempt was stopped, then the local browser suite completed successfully with the required process permissions.

New cases cover backdated supplier balances, exact discounted line/partial-return refunds, technician price/delivery denials without stock changes, authorized repair delivery, spent-advance refund rejection without cash/job mutation, safe cancellation, valid refunds and duplicate-cancel rejection, and partial/full subsequent payments through the same public link. These changes do not correct historical records automatically.

```json
{
  "automatedChecks": 1406,
  "supabaseAdapterChecks": 63,
  "hostedSqlTransactionTest": "passed; rolled back; no shop test records retained",
  "browserTests": 56,
  "browserRunGrouping": "all 56 together; final naming persistence pair also passed",
  "supabaseBackend": "deployed; owner password setup pending; current live frontend unchanged",
  "browser": "Microsoft Edge",
  "frontendBuild": "passed",
  "buildAssets": "passed",
  "dependencyAdvisories": { "high": 1, "moderate": 9, "majorUpgrades": "deferred per owner constraint" },
  "nativeInstallers": "not packaged; Electron online and offline source-app smoke checks passed",
  "productionDataAccess": false
}
```

- `npm test`: all original 1,172 reported checks plus 62 new checks passed. These are assertion counts, not 1,234 independent end-to-end tests. New backend checks: 34; legacy offline restore: 3; client recovery/invoice display: 25.
- `npm run test:e2e`: 45 browser tests passed (the existing 42 plus three new tests). Edge run took 51.2 seconds. Added checks cover blocked dev editor launch, real-page reload after lost sale acknowledgements, and advance-paid public invoices.
- `npm run build`: successful; the built entry, local JS/CSS imports, fonts and manifest icons passed the new asset validator. The regenerated dist is included in the local package.
- Both GitHub workflow YAML files parse successfully. Chromium selection is supported for CI; the CI jobs themselves have not been executed remotely.
- Local checks used Node.js v26.13.0, npm 11.20.0, temporary data directories and isolated mocked Google services. CI remains configured for Node.js 22.

## New failure cases verified

- A valid restore fails while writing, then every previous business table and request receipt is restored.
- A larger restore appends rows before failing; recovery also removes those appended rows.
- A reset fails while re-creating defaults and the old shop records are restored.
- A storage outage interrupts both maintenance and rollback. Reads remain blocked; a fresh execution recovers the full prior database before authentication/read.
- A COMMITTED write succeeds but its acknowledgement is lost. The complete restored database remains committed.
- A lost sale acknowledgement survives page reload and session renewal with one invoice and the original request ID.
- A write is blocked before transmission if its pending ID cannot be stored. Failed local confirmation cleanup is finished by replay without another charge.
- An uncertain request is not replayed after the safe receipt lifetime or against an unsupported old backend.
- Linked supplier/customer permissions, other-staff price history, nested warranty response costs, opening-debt reminders, 1,001 expenses and 501 return/report boundaries are checked.
- Public and business invoice renderers show 100 paid for a total of 100 comprising cash 80 and advance 20.
- Offline backup restore migrates missing Repairs/Units/InvoiceLinks and preserves the product across a restart.

## Scope and remaining limits

No push, remote release, deployment, production login, business-data access, real SMS or production database modification took place. No actual user's offline data directory was used. Native installers, Electron GUI, mobile devices, physical printers, real Google Sheets quotas/formula execution and cloud-trigger behavior were not tested as real-device/production runs.

Dependency majors remain unchanged as requested. Current npm audit still flags 10 package entries (1 high and 9 moderate, including indirect overlap). Disabling Vite editor launch, loopback binding and CORS restrictions are limited local-development mitigations; the advisories are not claimed fully resolved. Authentication migration and other major architectural changes are deferred.

## Transfer integrity

From the repository root, run `node scripts/prepare-review.cjs`, then `node scripts/prepare-review.cjs --check`. The manifest records this local file set and these verification results. SHA256SUMS.txt covers every listed payload file except itself, including the manifest. Legacy backend/parts, dependencies, test outputs, credentials and user databases/backups are excluded from the transfer package.

Approval is required before any upload. Deploy the authoritative backend first, then frontend. Pushing main triggers Pages publication, so it must not be treated as a harmless staging step.
