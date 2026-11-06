# Karvio 1.0.6 — fixes

This release fixes the fourteen findings in the review of the 1.0.5 ZIP and adds the local desktop runtime to the complete source package.

1. Return validation rejects repeated line IDs, repeated serials and fractional piece quantities; aggregate available stock is validated across lines.
2. Business writes are staged, durably journaled and committed under a script lock. Interrupted writes are recovered before subsequent API reads/writes. Uncertain outcomes retain the request identity.
3. Busy buttons and synchronous submit guards prevent double submission; request receipts make retries of the same write idempotent.
4. Supplier-return cancellation checks serial record identities and subsequent stock movements before restoring stock.
5. History applies cost redaction and sales ownership filtering across invoice, barcode and serial search branches. Custom SMS authorization headers are redacted from unprivileged settings/bootstrap.
6. Sale cancellation restores historical inventory value as well as quantity, including serial cost synchronization.
7. Purchase returns and return cancellations update remaining inventory value; invalid dependent reversals are rejected before mutation.
8. New purchase discounts are allocated into inventory cost and partial return values with consistent rounding. Legacy purchases retain historical recorded costing rather than silently rewriting prior profits.
9. Literal SMS header credentials are hidden from staff without settings permission.
10. Password changes/resets revoke old credentials' sessions. Existing sessions must sign in after upgrading; own password change returns to login.
11. Combined customer/supplier permission checks occur before inserting or updating records.
12. DataTable discards sort keys missing from a changed report schema; report switching no longer crashes.
13. POS hotkeys invoke current checkout state, including Next payment date; checkout also has a synchronous guard.
14. Native icon preparation uses decoded filesystem URLs and works with Windows, spaces and non-Latin paths.

Offline Electron defaults to the established ShopERP Offline data directory, preserving saved records across branding updates. The browser/mobile/Tauri editions retain online API behavior. Online and offline databases are intentionally separate.

No GitHub push, website/Apps Script deployment, Google Sheet edit or production test transaction was performed while preparing this release. The included initial admin password is the documented fresh-install default, not a copy of any user's stored credentials.
