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
