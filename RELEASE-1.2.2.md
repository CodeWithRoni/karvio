# Karvio v1.2.2

Online-only installers for Windows x64, macOS Intel and Apple Silicon, Linux Debian/Ubuntu x64, Android and iOS.

## Included updates

- Separate previous-due collection in POS with CP receipts and later reprinting. Sale cancellation/return preserves independent due payments.
- Optional previous supplier due payment during purchase entry, with split accounts and independent payment records.
- Filter/search-aware stock totals: stock, reserved, available, inventory cost and retail value. Quantity totals align under their columns; pcs-only totals use plain numbers.
- Accounting and stock corrections: exact return rounding, current invoice due, discount allocation in product sales reports, warranty cost/cancellation protection and closed-opening balance guards.
- Complete statement, expense, return and warranty lists/exports; safe retry and rollback protections.
- Retained transaction history for used products, customers/suppliers, accounts and expense categories.
- Repair dashboards, navigation and SMS settings improvements, scoped drafts/quotations and correct shop-day dates.
- README rewritten for the current Supabase backend and online-only applications.

## Install and upgrade

Use the same online shop login on every platform. Internet access is required; there is no offline database mode. Updating the app does not reset shop data or import old local databases. SHA256SUMS.txt accompanies the downloads.

- Windows: run the .exe installer.
- macOS: choose arm64 for Apple Silicon or x64 for Intel. Builds are unsigned and not notarized.
- Linux: install the amd64 .deb with your package manager.
- Android: sideload the debug-signed .apk.
- iOS: the .ipa is unsigned and must be signed before installation; it is not an App Store distribution.

All platform builds must succeed before this release is published. The latest ERP code has passed the regular/hosted accounting suites and 88 browser workflows; the release commit is also checked by CI.
