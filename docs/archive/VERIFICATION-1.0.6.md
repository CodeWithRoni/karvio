# Karvio 1.0.6 — verification record

Date: 6 November 2026 (Asia/Dhaka). Baseline input: Karvio-v1.0.5-complete.zip.

Input ZIP SHA-256: `6a4cff5ce2bdef5447d43e5bace95ac3a97830aa7e44e76b3a53eeacb0081863`.

## Automated checks

| Suite | Passed checks |
|---|---:|
| Original scenario | 152 |
| Valuation | 18 |
| Product groups/categories | 22 |
| Services | 44 |
| Dues/returns/dashboard | 63 |
| Barcodes | 22 |
| Working hours | 47 |
| Supplier invoice | 15 |
| Public invoice links | 41 |
| SMS presets | 20 |
| New finance integrity | 60 |
| New journal/recovery/idempotency/access | 56 |
| New frontend/API/native-path reliability | 49 |
| Persistent local database | 31 |
| Offline restart/idempotency/legacy migration | 14 |
| **Total** | **654** |

All passed in the final integrated `npm test` run after the SMS uncertainty/link-preservation fix. The purchase-discount scenario's old expected profit was corrected from 1450 to 1482.14 to match net allocated purchase cost; it was not deleted or weakened. Other original test expectations remain intact.

Production `npm run build` passed. The full browser suite passed **26 tests**, including five new real-browser regressions for report switching, one-save-only purchase, F9/F10 latest payment date and duplicate-key protection, and committed-purchase response-loss replay. Browser tests used Microsoft Edge and a local in-memory API.

The Electron offline UI run passed restart persistence, stock/account balances, Bengali PDF export and backup/restore. It passed against both the source desktop and an electron-builder packaged Windows app with the bundled backend resource. Internet was disabled and **zero internet requests** were observed in both runs. Tests used isolated temporary application-data directories, never the user's actual ShopERP Offline folder. The local packaging smoke test used the existing compatible Electron distribution and skipped executable resource editing/signing; installers are built separately by the documented commands.

## Failure scenarios exercised

- Duplicate return lines/serials, fractional pieces, shared-product stock limits.
- Purchase discounts, partial refunds, weighted cost restoration, serial reuse/reversal dependencies and legacy costing.
- Physical sheet write errors, interrupted PREPARED transaction recovery, interrupted recovery blocking reads, lost COMMITTED acknowledgement, partial receipt archival and large journal chunking.
- Lost HTTP responses with same-request replay, unsupported old backend retry gating, concurrent submit guards and offline IPC.
- Hidden-cost/history access, header secrets, password revocation, failed combined-customer writes.
- SMS after durable financial commit, no resend on replay, and invoice-link retention when delivery/logging is uncertain.
- Old offline header prefixes/missing newer tables, restart idempotency and invalid-backup rejection without replacing saved records.
- Native icon copying with Windows/space/Bengali path fixtures.

## Scope and limits

All transactions were synthetic fixtures. No production Google Sheet, Apps Script deployment, real SMS gateway, running user application or actual user database was modified. The original input ZIP is retained unchanged.

The package includes source and the tested prebuilt website. Android/iOS/macOS/Linux installers, device signing, external SMS delivery, physical thermal printing, production quotas/load and manual edits to Google Sheets were not claimed as real-device/production validations. SMS delivery is at-most-once for a financial request; an interrupted dispatch may remain unconfirmed and must be checked at the gateway before resending.

The release archive excludes node_modules, generated test reports/downloads, release build directories, obsolete backend/parts, user databases/backups, credentials and local environment files. SHA256SUMS.txt records the included source/build artifacts for transfer verification.
