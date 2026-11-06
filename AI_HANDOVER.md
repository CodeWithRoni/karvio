# Karvio 1.0.6 — maintenance handover

## Work boundaries

Work locally first. Do not publish, push or write production Google Sheets without the user's explicit upload/update request. Preserve the ShopERP Offline application-data folder. Never distribute actual databases, backups, tokens or credentials. Tests use in-memory mocks or fresh OS temporary directories.

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

Default desktop data path remains ShopERP Offline, even though brand/app title is Karvio. The on-disk format/schemaVersion remains compatible, while business headers migrate by appending fields. Backup restore accepts validated legacy prefixes and missing newly introduced Units/InvoiceLinks; setup repairs/migrates them. Never seed test data into a user's real directory.

## Verification

frontend/npm test runs original suites plus finance integrity, recovery/access integrity, client reliability, persistence and legacy-upgrade checks. npm run test:e2e runs the main browser suite and five reliability regressions against localhost in-memory fixtures. npm run test:offline-ui runs Electron against a fresh temporary directory; SHOPERP_ELECTRON_EXECUTABLE may select an existing compatible Electron executable.

See VERIFICATION.md for the final recorded test counts and packaging checks. Google Apps Script production quotas, external SMS gateway delivery, physical printer hardware and native Mac/Linux/mobile installers are not simulated as real-device runs.
