# Karvio ERP

Online shop management and point of sale for computer, IT, electronics and networking businesses.

**Current release: [v1.2.3](https://github.com/CodeWithRoni/karvio/releases/tag/v1.2.3)** · [Open web app](https://codewithroni.github.io/karvio/) · [All downloads](https://github.com/CodeWithRoni/karvio/releases/latest)

## Online only

The web, desktop and mobile apps connect to the same online shop through the Supabase API. Internet access and an existing shop account are required. There is no offline sales mode, local shop database or automatic import of old offline data. Older local databases are left untouched.

The current online backend is **Supabase Edge Functions + PostgreSQL**. Google Sheets / Apps Script and offline-runtime files remain in the repository for compatibility/history and regression tests; they are not the active production database.

## Downloads

| Platform | File | Installation |
| --- | --- | --- |
| Windows x64 | Karvio-1.2.3-win-x64.exe | Run the installer. |
| macOS Apple Silicon | Karvio-1.2.3-mac-arm64.dmg | Open the disk image and move Karvio to Applications. |
| macOS Intel | Karvio-1.2.3-mac-x64.dmg | Open the disk image and move Karvio to Applications. |
| Linux x64, Debian/Ubuntu | Karvio-1.2.3-linux-amd64.deb | Install with your package manager. |
| Android | Karvio-1.2.3-android.apk | Sideload the APK; it is debug-signed. |
| iOS | Karvio-1.2.3-ios-unsigned.ipa | Sign with your Apple ID / developer account before installing. |

Download installers from the [release page](https://github.com/CodeWithRoni/karvio/releases/tag/v1.2.3). SHA256SUMS.txt lists file checksums. Desktop binaries are unsigned; macOS builds are not notarized. The iOS file is not an App Store or directly installable signed distribution. Linux packaging currently targets Debian-based x64 systems.

## What is included

- **POS and sales:** barcode/serial/name search, retail/wholesale prices, split payments, customer advance, invoices, thermal receipts, returns and authorized cancellation.
- **Separate due collection:** POS can collect previous customer due with independent CP money receipts. Purchase entry can separately pay previous supplier due. Returning/cancelling the new invoice preserves those independent payments.
- **Products and stock:** product groups, categories, brands, warranty periods, units, serial tracking and repair reservations. Filtered totals show stock, reserved and available quantities plus weighted cost/retail values; different selling units are kept separate.
- **Purchases and suppliers:** supplier invoice numbers, split payments, current and historical due, purchase returns and supplier statements.
- **Customers and accounts:** customer statements, due receipts, cash/bank/MFS ledgers, transfers, deposits and withdrawals.
- **Repairs and warranty:** job cards, technician assignment, status dashboards, parts, advance, delivery invoices and warranty replacement/vendor recovery records.
- **Reports:** business dashboard, profit, expenses, stock and transaction reports with Excel/PDF/print exports.
- **Administration:** role permissions, working hours, shop/invoice settings, configurable SMS gateway, backups/restore and owner-only reset. Used products, parties, accounts and expense history are retained; closed books protect opening balances.

The **Service** menu is currently a placeholder for future work, not a completed service-management workflow.

Mobile/tablet camera scanning is available in POS, purchase product/serial entry and Advance Search. Desktop devices keep keyboard/scanner entry. Camera permission is required; frames are decoded locally. Purchase product names now use the full card width on phones/tablets.

Read [v1.2.3 release notes](RELEASE-1.2.3.md) for the latest corrections.

## Sign in and setup

Use the same online credentials on every platform. The fresh Supabase shop is initialized with an owner-chosen password; there is **no default online password**. Configure a different shop endpoint through **Settings → API connection** when needed.

See [SUPABASE-SETUP.md](SUPABASE-SETUP.md) for the authoritative online architecture, fresh setup, private backups and deployment. Follow current Supabase setup rather than legacy Google Sheets/offline instructions in historical documents. Installing a new app version does not reset the online shop.

## Development

Use Node.js 22 and npm. Point development at an isolated API/test shop for sample transactions; the built-in default endpoint is the production Karvio shop.

```sh
git clone https://github.com/CodeWithRoni/karvio.git
cd karvio/frontend
npm ci
npm run dev
```

| Command (from frontend) | Purpose |
| --- | --- |
| npm test | Business-rule and client regressions |
| npm run test:supabase | Hosted transactional gateway and accounting regressions |
| npm run test:e2e | Browser workflows against the local test server |
| npm run build | Production frontend plus asset verification |
| npm run desktop | Start the online Electron app |
| npm run desktop:build:win | Windows installer |
| npm run desktop:build:mac | macOS disk images |
| npm run desktop:build:linux | Debian package |

Browser tests use Microsoft Edge locally by default. CI installs Chromium and sets KARVIO_BROWSER_CHANNEL=chromium. Financial regression fixtures are isolated from the live shop. See [VERIFICATION.md](VERIFICATION.md) for recorded checks.

## Repository map

- frontend/src — React UI, API transport and document/export rendering.
- frontend/desktop — online Electron wrapper; legacy test runtimes are not shipped as offline features.
- frontend/src-tauri — alternative native wrapper configuration.
- backend/Code.gs — authoritative ERP business rules and legacy Apps Script adapter.
- supabase/functions/karvio-api — generated business engine and hosted gateway/runtime.
- supabase/migrations — versioned PostgreSQL schema and private transactional storage.
- backend/test and frontend/test — accounting, access, recovery and browser regressions.
- .github/workflows — Pages deployment and installers for all listed platforms.

After editing business rules, regenerate the hosted engine with node scripts/generate-supabase.cjs. Applied database migrations remain immutable. Backend/API changes must be deployed before a frontend feature that depends on them.

## Release process

The Build Karvio apps workflow builds all desktop/mobile targets. It can run manually, on a version tag, or from a release/* branch. A release is published only when every platform build succeeds; installers and their checksums are attached together. Main also runs the complete test/build/browser checks before publishing GitHub Pages.

Keep credentials and production backups out of the repository. Database reset and restore are explicit owner operations, separate from application upgrades.
