Owner authorized publishing purchase previous-due payments. Supabase API version17 is ACTIVE; all source files match the tested build and read-only ping confirms purchaseDuePayment support. Frontend publication follows. No schema migration, data reset or business-data edit. Earlier local-only notes are historical.

## Purchase form: optional previous supplier due payment — LOCAL ONLY

Implemented without publication. Baseline main:0745837777e37ebe4aaa76956d33b42a7bdd5e08. No live business rows, database schema, migrations, API deployment or reset changed. Publish backend BEFORE frontend when owner requests deployment.

- A positive previous supplier balance offers Make due payment to the supplier. Checking opens the existing split-payment design directly below previous due. Empty/zero amounts or an unchecked section do not settle any old debt. Supplier changes and unchecking clear payment drafts.
- Current invoice payments and previous-due payments remain separate. Combined supplier payable subtracts both; the preview also shows previous due payment and remaining old due. Previous payment amounts are rounded per line to match server accounting. A Refresh supplier balance control preserves purchase inputs.
- purchase.create accepts previous_due_payments and expected_previous_due. It validates active accounts, non-negative finite amounts, supplier permission in addition to purchase permission, current balance and no overpayment of old due. A changed balance fails with refresh instructions. All writes share one transaction and one replay receipt: no partial purchase/payment and no duplicate payment on retry.
- Old due payments use ordinary separate SupplierLedger / AccountTxns payment receipts, with the purchase number in their note. They do not inflate purchase.paid or change its original due. Cancelling the new purchase retains those independent supplier payment receipts, which can be reviewed/cancelled using the existing supplier-payment workflow.
- Bootstrap and Supabase ping advertise purchaseDuePayment support. The frontend only offers the option with that capability and supplier-payment permission, so an older API cannot silently ignore a payment selected in this UI. Existing purchase requests remain compatible. No new tables or columns.

Validation: complete regular suite passed; complete Supabase suite and purchase-due-payment.mjs passed (split accounts, allocation, rollback, stale/invalid/overpayment rejection, permission, blank option, idempotent replay and independent cancellation). All84 Microsoft Edge browser workflows passed, including four new purchase due-payment/blank/supplier-change-refresh/rounding cases. Final production build and assets passed. All financial tests ran against isolated local data, never the production shop.

Owner authorized publishing stock footer alignment. Frontend-only publication in progress; no API deployment, database migration or data reset. Earlier local-only notes are historical.

## Stock total alignment — LOCAL ONLY

Single-unit pcs totals now display plain numbers, aligned right under Stock, Reserved for repairs and Available to sell. Mixed-unit totals retain explicit units to avoid combining incompatible quantities. Selected Excel exports keep pcs totals numeric. No calculation, backend or live data change. Two focused stock browser tests passed (including right-alignment checks), and production build/assets passed. Full80-browser validation below belongs to the preceding stock-total implementation. Not pushed or deployed.

Owner authorized publishing filtered stock totals. Frontend-only publication in progress; no API deployment, database migration or business-data reset. Earlier local-only notes below record pre-publication validation.

## Filtered stock totals — LOCAL ONLY

Requested stock explorer totals are implemented; not pushed or deployed. Baseline main is fedc4134f4489132e3c96b574fe7405a6c8d391b. No backend, API, database schema or business-data change is required. Earlier publication/local-only notes below are historical.

- Footer totals follow product group/category/brand/exact quantity/low-stock/inactive filters AND table search, across all pages.
- Stock, reserved and available quantities are grouped by selling unit (pcs/meter/etc. are never added as one quantity); service products are excluded.
- Cost and Stock value totals use stock times unit cost. Price total uses stock times selling price, including reserved inventory. The existing unit cost/price cells stay unchanged. Cost totals remain hidden without cost permission.
- DataTable supports per-column total functions for the filtered footer and selected-row exports. Excel preserves numeric money totals and unit-qualified quantities; PDF/print preserve text totals instead of formatting them as zero.
- A short note explains calculation and scope. Selection affects exported totals; the on-screen footer still describes all matching rows.

Validation: full regular regression suite passed; all80 Microsoft Edge browser tests passed, including new mixed-unit/filter/search/selected-Excel and 101-row pagination/cost-permission cases; final production build/assets passed. Tests used only the local test server and mocked fixtures. No production reset or live data edit.

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

Owner authorized live publication on 12 November 2026. Supabase API version 13 deployed and source verified; public ping passed. No schema migration, production reset or business-data edit. Earlier local-only status below records pre-publication validation.

## Local history-retention rules — 12 November 2026 (NOT DEPLOYED)

Owner requested preserving used products, accounts and expenses until explicit database reset. No reset, production business-data change, deployment or push was performed. Live baseline remains main eb576760ad3e0726f1c6f8c16022ea0eae542b02 and Supabase API version 11.

- Product Delete now fails instead of silently deactivating a used product. A cached productUsageIndex_ covers purchases/sales/returns/serials/events/claims/repair parts, including cancelled history. products.list exposes has_history and the Edit form disables Delete for history or nonzero stock. Active remains the separate way to stop using a product. The existing product.history endpoint is unchanged.
- Cash/bank/MFS accounts already have no delete route. accounts.list now exposes history, including voided AccountTxns and cancelled expenses; used-account Edit explains retention and offers Active off. Account rows/transactions remain present when deactivated.
- Expense cancellation keeps its row and voids linked cash movement as before. Used expense category names cannot be removed/renamed through expense.categories or the generic settings.save path; the UI loads usage and disables those actions, including after cancellation. Unused categories can still be managed. Canonical case/spacing matching prevents bypass; pre-existing unconfigured legacy category names do not block unrelated settings changes.
- Owner-only, password/RESET-confirmed reset remains the maintenance path to a fresh database. A local in-memory test confirms old products, custom accounts, expenses, ledgers and business history clear, while the owner remains and a new zero-balance Cash account is created. Default keep_settings/keep_users are false; the existing optional retention checkboxes remain explicit user choices. No production reset was run.

Validation: full regular regression suite passed; Supabase gateway (63 checks), all earlier audit suites and backend/test/history-retention.mjs passed; full Edge browser suite 75/75 passed; final production build/assets passed. No schema migration is required.

Latest owner instruction authorizes publishing all pending follow-up fixes and transaction-history deletion protection. Supabase API version 11 is ACTIVE; all six deployed files match tested source, and public ping is healthy. No schema or business-data migration was performed. Earlier local-only notes below are historical for this publication.

## Latest local deletion protection — not published

Owner explicitly requested preventing any customer/supplier with transaction history from being deleted. A shared indexed history check now drives both API has_history metadata and the server delete guard, including cancelled invoices/voided payments, jobs/claims, and a combined profile's linked side. Delete is disabled in the directory detail even at zero balance when history exists. The explanatory note points to Inactive. Unused zero-balance profiles remain deletable. No live data or deployment changed.

Validation for this latest change: full regular suite passed; Supabase gateway and all three audit regression groups passed (including new zero-balance voided-payment/cancelled-invoice and combined-profile cases); focused browser suite 6/6 passed; final production build/assets passed. Earlier full 71-browser run below predates only this last history-metadata/button refinement.

## Local follow-up fixes F01–F10 — not pushed or deployed

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

# Fresh Supabase work — 11 November 2026

Current authorized release: owner requested pushing all accumulated corrections. Naming backend now preserves entered description whitespace on save (removed trim, retained 500-character bound); no existing records renamed or migrated. Four migrations already match hosted history; schema/data reset is unnecessary. Full 56-case browser run passed; final save/reload naming + category-isolation pair passed after backend whitespace correction. Naming fixture removes its sample records so later category tests remain independent. Earlier no-push notes below are historical for this authorization.

LATEST AUTHORIZATION: owner now explicitly requested publishing ALL accumulated changes and necessary database work. This overrides earlier no-push notes below. Release includes single-line sidebar, Suppliers & Dues/Purchases & Returns labels, always-visible Repair filters/list beneath cards, total-business Dashboard with New Service/New Repair shortcuts, corrected import/export icons, and brand-first names with ' #Description' suffix. Four hosted migrations already match local files; no new database schema or data migration is needed. Existing owner/backup schedule/RLS verified. Publish on top of a8bd19c5 and verify CI/Pages/live assets; preserve all current business data.

Latest local label adjustment: sidebar Suppliers renamed to Suppliers & Dues to match Customers & Dues. Route, permissions and supplier functionality unchanged. Still no further push authorized.

LATEST naming correction: user clarified the separator is ' #' (one space BEFORE #, no automatic space AFTER). Append the raw nonblank description, preserving any user-entered leading space. Thus Model #Description by default. This supersedes the immediately preceding no-surrounding-space instruction. Still local only; no push authorized.

Latest LOCAL-ONLY naming correction supersedes the spaced suffix below: concatenate base + '#' + the description exactly as entered, with no automatic surrounding spaces. User-entered leading/trailing spaces in a nonblank description are preserved; whitespace-only description adds no suffix. Browser regression and build passed; updated product-naming-review.png screenshot. Still no push authorized.

LOCAL-ONLY product naming: same ProductForm layout; automatic name now Brand + Group + Category + Model + optional " # " + short description. Description whitespace is normalized only in the name; original description content is retained. Changing/clearing description replaces/removes its suffix rather than duplicating it, including manually typed names when description is edited. Existing stored product names are not automatically rewritten. A dedicated form browser check passed; screenshot verification/product-naming-review.png uses fixtures. Build/assets passed. Owner has not authorized another push.

LOCAL-ONLY master toolbar follow-up: replaced download/upload visuals with document-arrow export (outward/up-right) and import (inward/down-left) icons in all five panels. Export still opens Excel/PDF/Print; Import still opens the file chooser. Tooltip/accessibility labels remain clear. Relevant real-browser export/download, import chooser and selection/delete test passed; screenshot verification/master-import-export-icons-review.png reviewed with fixtures. Build/assets passed. No push/deployment; owner requires another explicit instruction.

LOCAL-ONLY dashboard header follow-up: removed the top Today/This month/All time selector and replaced it with static Total Business Overview; top summary now consistently uses d.total. Other history/leaderboard ranges remain. Action order is Refresh, New Service, New Repair, New sale (repair/service follow Repairs permission). New Repair uses /repairs?new=1 to open the existing new-job form and immediately consumes that query parameter; New Service opens the placeholder because its workflow is not yet specified. Dashboard screenshot verification/dashboard-overview-actions-review.png uses fixture data. Two relevant browser checks passed for shortcut behavior, totals refresh and mobile width. Owner still explicitly forbids push/deployment without another instruction.

LOCAL-ONLY repair follow-up: keep the eight dashboard cards visible and restore the full legacy job list directly underneath. Status tabs, technician selector, search and exports remain; added received-period selector and Reset filters. Card clicks set the matching list filters and scroll to the list without hiding the dashboard. New design screenshot: verification/repair-dashboard-filters-review.png (test fixtures only). Relevant repair/access/delivery/cancel tests and build passed. Owner explicitly says no push until further instruction; do not deploy this or the pending one-line-sidebar change.

LATEST OWNER INSTRUCTION: do not push/deploy further changes unless the owner asks again. The preceding Supabase/UI release is already live at main a8bd19c5e8e5d6bcc39320fc9f28a1a3c4fa70c7 (Edge auto-deployed version 6; both GitHub/Pages runs successful; 63 live files matched). New LOCAL-ONLY follow-up widens desktop sidebar 232→264px, balances link spacing, and keeps module names on one line with full-name tooltips. No API/database changes. Verify current names fit without truncation before any later publication.

## Latest authorization and release preparation

Owner explicitly approved live main publication and necessary database updates. This supersedes all earlier “do not publish / pending” notes below. Edge karvio-api version 5 is now active with repair shop date, fresh defaults, bulk delete and scheduled-backup controls. Daily pg_cron backup enabled at 02:00 Dhaka; first private snapshot verified. Owner account/business data preserved; no production test transactions. Local migration filenames were reconciled to hosted versions 20261111071516, 20261111071710, 20261111072742 and 20261111083657. Do not recreate these migrations. Current release includes all accumulated master-list, SMS, repair dashboard, Service placeholder, wheel-guard and semantic-sidebar changes. CI runs regular, Supabase and browser tests before GitHub Pages publication. Main publication is being carried out under this approval; previous status paragraphs are historical.

Pending sidebar polish: semantic native SVG icons now replace the five glowing group dots, and each module has a distinct icon (including wrench Repairs/headset Service). Accessible link names, routes, permissions and shortcuts remain the same. Hover/current-color accents and reduced-motion support are CSS-only; no dependency added. Navigation/mobile/toggle checks and build passed. Still collect remaining owner changes; no push/deployment for this visual update.

Pending wheel fix: App installs one passive capture-phase document wheel guard. Focused native number/range/date/time/datetime/month/week inputs and closed select controls blur before wheel stepping, preserving page scrolling; text/textarea fields and keyboard entry keep normal behavior. Covers lazy routes and portal dialogs including the reported custom warranty days. Two new real-wheel browser regressions cover the product modal and dynamically inserted future native fields, dropdown keyboard selection, text focus and scroll propagation. No deployment/push performed. Keep prior local noWheel handlers for compatibility.

Latest small addition: Service sidebar item immediately below Repairs, with /service placeholder page. It temporarily follows Repairs visibility/route permission; no database, actions or service workflow added. Owner will describe its function later. Still no push/deployment authorized until remaining changes are collected.

Latest owner instruction: additional UI changes are being collected; DO NOT push/live-publish until they finish providing changes. Pending local work now includes master-list selection/icon buttons/default Supabase URL and SMS gateway polish. SMS presets retain only OneCodeSoft/BulkSMSBD/Generic JSON/Generic form; MRAM options removed. New field builder, configuration validation, message previews, guarded test send and queued/failed/unknown status are tested locally. All 51 browser cases passed; no real SMS sent or SMS changes deployed. See the newest VERIFICATION.md entry. The initial owner account has now been created by the user; earlier "setup pending" text below is historical.

Pending repair dashboard: Repairs now opens eight calendar cards with Pending/Complete/Failed counts; title/footer opens all period jobs and each count opens that status. Existing job forms/details/deep links/delivery/cancel remain. Received-date cohorts use `repairs.meta.today` (new backend field); Saturday starts the week and rolling 3/6 calendar months include the current month. Delivered/Cancelled are in period lists but excluded from the three current-status counts, as explained in the UI. IMPORTANT: regenerate/deploy the current Supabase engine before publishing this frontend when the owner finally approves; deployed Edge version 4 does not yet return the new `today` field. The regenerated source is local only; no deployment was made for this repair change. All repair tests use fixture data, not the real shop.

Before eventual main push, verify local migration version filenames match hosted Supabase migration history (MCP apply_migration assigns hosted versions). The connected GitHub integration has automatic production deployment enabled; reconcile history before allowing it to replay already-applied schema DDL.

See SUPABASE-SETUP.md. A new empty backend has been provisioned ONLY in Karvio's Org / project svqhlotlzgmwjneuphpe. The 29 business tables and service-role-only RPCs are deployed; Edge karvio-api version 4 is active. Owner setup is pending the user's chosen password; Users/Products/Sales remained empty and revision 0 after rolled-back hosted tests. The private one-time owner setup HTML is outside this repository in the attached visualizations folder; never publish/read its key into chat. The live website still defaults to the existing Apps Script backend. No GitHub push or live frontend cutover was performed for this migration. Local frontend build now includes the optional Supabase owner wizard. Google Drive automatic backup scheduling needs a separate Supabase replacement before production cutover; see documented capacity and SMS boundaries. Do not confuse this work with the earlier completed Apps Script fixes below.

# Current state — Karvio 1.2.0

The owner approved main publication of the remaining fixes. Backend Version 42 was successfully deployed to the existing URL, building on main b2cb6d7. See FIXES-REVIEW.md and VERIFICATION.md. Native installers have not been published. Any older deployment/pending-status notes below are historical.

# Karvio 1.2.0 — maintenance handover

## Local review patch — 11 November 2026 (awaiting approval)

See FIXES-REVIEW.md and VERIFICATION.md. No push/deployment is authorized yet. Online reset/restore now use a full-table before-image plan in the existing transaction journal; PREPARED recovery restores business tables and request receipts, clears appended rows and blocks reads while storage remains unavailable. Offline whole-file persistence is unchanged. Never deploy an older backend that cannot recognize these maintenance snapshots while recovery is pending.

Unconfirmed client write IDs persist as opaque fingerprints and timestamps (no raw request payload/password/token in the pending-write record), scoped to endpoint and user. They survive reload/re-login; after six days automatic replay is blocked because server receipts are retained for seven days. Old backends without idempotency support cannot replay an uncertain write. Do not delete browser storage before reconciling an unconfirmed money transaction.

The dedicated sales.return permission still authorizes the existing global return workflow; this patch does not change that business policy. Product price history no longer exposes other staff invoices without sales.all. Cost sanitization includes serialized replacement data. Full report aggregation is separate from bounded list responses. Restore accepts missing legacy Repairs tables. Dependency major upgrades remain deferred by the user's constraint; npm advisories are not claimed resolved.

## Work boundaries

Work locally first. Do not publish, push or write production Google Sheets without the user's explicit upload/update request. Preserve the Karvio Offline application-data folder (older installs had `ShopERP Offline`; `desktop/data-folder.cjs` moves it on first start). Never distribute actual databases, backups, tokens or credentials. Tests use in-memory mocks or fresh OS temporary directories.

## Authoritative code

- backend/Code.gs is the only deployed Apps Script source. Obsolete backend/parts are omitted from the release archive.
- frontend/src is the React application; lib/api.js selects local desktop IPC or online API.
- frontend/desktop contains offline runtime, restricted Electron shell and isolated preload. The online flag --online deliberately selects a separate profile.
- frontend/dist is the tested prebuilt website. Any UI change requires rebuilding before release.

## Transaction protocol

API requests carry action,payload,token,request_id. Discover apiCapabilities on ping/bootstrap before retrying ambiguous writes against an older server. Receipts bind request ID to user/action/payload hash. Retrying a committed request returns its original result instead of changing stock/accounts again.

All API requests take the script lock and recover a previous transaction before exposing business data. Business writes stage row before/after images; no business row is applied until a checksummed chunked plan is durably PREPARED. PREPARED recovery reapplies before-images. COMMITTED recovery preserves data and archives the receipt. Complete receipt footers follow flushed chunks. Tombstones preserve row addresses. Private journal/receipt sheets are runtime data, outside the business SCHEMA; never delete them or commit exports of them.

Sheets are not a transactional SQL database. The recovery protocol covers API-controlled writes; direct manual spreadsheet edits bypass the lock and are outside that protocol. Recovery may need the next successful request after a quota/service outage. If recovery cannot complete, subsequent requests fail closed rather than expose half-written records.

## SMS boundary

Sale SMS jobs run after financial commit and receipt. Delivery is at-most-once for a money request; a process interruption between commit and dispatch can leave the SMS unsent or unconfirmed. Replaying the invoice does not automatically send again because an arbitrary SMS gateway has no guaranteed idempotency. Inspect the gateway/log before any manual resend. SMS log failure cannot roll back or misreport the financial commit.

## Inventory

PurchaseReturnItems gains only an append-only valuation column. PurchaseItems uses its existing valuation JSON for inventory_cost/cost_version. New purchases allocate invoice discount into inventory cost; historical rows retain actually recorded old costs. Customer/supplier partial returns allocate cumulative amounts to avoid cent drift. Every serial reversal validates current row identity/status and later dependencies. Invalid historical cost-layer removal is rejected before mutation.

## Offline compatibility

Desktop data path is `Karvio Offline` with data file `karvio.json` (format `Karvio Offline`). An older `ShopERP Offline` folder is renamed on first start (never copied or deleted; if busy, the old folder is used until the next start), `shop-erp.json` is renamed in place, and data files / backups with the old format `ShopERP Offline` are still read and restored (test: backend/test/offline-rename.cjs). The on-disk schemaVersion remains compatible, while business headers migrate by appending fields. Backup restore accepts validated legacy prefixes and missing newly introduced Units/InvoiceLinks; setup repairs/migrates them. Never seed test data into a user's real directory.

## Verification

frontend/npm test runs original suites plus finance integrity, recovery/access integrity, client reliability, persistence and legacy-upgrade checks. npm run test:e2e runs the main browser suite and five reliability regressions against localhost in-memory fixtures. npm run test:offline-ui runs Electron against a fresh temporary directory; KARVIO_ELECTRON_EXECUTABLE may select an existing compatible Electron executable.

See VERIFICATION.md for the final recorded test counts and packaging checks. Google Apps Script production quotas, external SMS gateway delivery, physical printer hardware and native Mac/Linux/mobile installers are not simulated as real-device runs.

## Added after 1.0.6 (same version number, no new release)

- POS serial products: quantity = number of serials picked (no typed quantity). The picker accepts any number of serials by click or scanner (Enter), and scanning a serial in the main POS search adds it to the line. Old drafts are normalised (`want` keeps the planned count). Quantity boxes everywhere use `noWheel` (ui.jsx) so the mouse wheel cannot change them.
- Profit: `profit.report` (reports + cost) and `profitSummary_`; page `/profit` (Money & Reports, above Expenses). Dashboard `profit` row (today, this week, this month, last 6 months; net and gross) under Live balances, toggle key `profit_card`. Gross = Σ sale.profit − Σ(return.total − return.cost); net = gross − expenses.
- Database reset: route `database.reset`, Settings → Database reset. Only the built-in Administrator account (username `admin`, role admin; `isOwner_`, `user.owner`) sees and can run it; password + typing RESET required. It first makes `ss.copy('Karvio backup before reset …')` (fails closed if the copy fails), empties every SCHEMA table and the private journal/receipt sheets, keeps the Administrator (same password) and optionally other users / settings (never `seq_*`), then runs `setupDatabase()`. Other admins cannot edit, rename or re-password the Administrator account, and nobody else can take the username `admin`.
- Tests: backend/test/reset-profit.cjs (in `npm test`), frontend/test/zz-serial-profit-reset.spec.js (runs last; it resets the in-memory test database).
- Database backup / restore (after 1.0.7): Settings → Database (Administrator account only) shows `database.info` (row counts, last backup / restore), `database.export` (JSON file `Karvio database backup` v1 with every SCHEMA table, counts and `checksum` = hash_('karvio-backup-v1', JSON of tables); records `last_backup_at`) and `database.restore` (password + typing RESTORE; `checkBackup_` validates format, version, checksum, tables, columns (older backups with fewer columns are padded), rows, unique IDs and an active Administrator before anything changes; then a Drive safety copy, `wipeAll_`, write rows, `setupDatabase()`; `signed_out` tells the app to sign in again when the backup's Administrator password differs). Tests: backend/test/backup-restore.cjs and the backup test in zz-serial-profit-reset.spec.js.
- Advance Search cards (after 1.0.9): `history` now also returns `cards` (products, purchases, sales, sreturns, preturns, claims — newest first, up to 100 each, with `total` and explanatory `notes`) for a serial, a product (also by part of its name: kind `choose`, then `product_id`), a sale invoice and a purchase invoice. Serial lines count only the matching serials; products without serials follow by date (sales since a purchase / the last purchase before a sale, counted as what that invoice sold). `history.doc {type: sale|purchase|sreturn|preturn|claim, id}` opens one document (permissions pos / purchase / sales.return / purchase / warranty, own sales only without sales.all, costs stripped without cost). The UI (components/DocViewer.jsx) shows the sale invoice with `invoiceHtml()` — the same HTML printInvoice prints (paper and template from Settings) — and has new sales / purchase return documents (salesDocs.salesReturnHtml, purchaseDocs.purchaseReturnHtml). Tests: backend/test/history-cards.cjs, frontend/test/history-cards.spec.js.
