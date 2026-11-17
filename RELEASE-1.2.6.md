# Karvio v1.2.6

Online-only installers for Windows x64, macOS Intel and Apple Silicon, Linux Debian/Ubuntu x64, Android and iOS. Includes every published change since v1.2.5.

## New

- **Professional look:** new dashboard with Live balances, a folding side menu, loading and empty states, browser tab shows the open page name, no full-screen flicker when a page opens for the first time.
- **Day close** with a day lock (reopen by an admin), **Profit & loss** and **Balance sheet**, **Owner's money**, **Devices & logins**.
- **Collection** and **Payment** pages for customer dues and supplier payments, with a next payment date and a dashboard reminder; Customers and Suppliers are plain directories.
- **Party Ledger Adjust** (admin): Customer / Supplier Ledger Adjust (additions and deductions with reason; supplier rebates, also promised; customer write-offs in the profit report) and Customer / Supplier Ledger Report (full ledger with items, serials and dues by age; paper statement on Print / PDF, Excel, WhatsApp).
- **Service** jobs: service list, jobs given to technicians with reserved products and SMS, Work done with SMS to the admin / manager, complete with used and returned products and an invoice.
- **Quotation:** PC builder and CC Camera tabs; customer name and phone required; red Clear; saved quotations kept on the server for every user and device until deleted.
- Product import / export, price list, POS hold, activity log, monthly expenses, supplier prices, daily summary SMS, slow-moving stock report, invoice on WhatsApp, shop logo and invoice QR, due reminder SMS.
- Bangladeshi number format (lakh commas) on invoices and SMS; dates read like 15 Nov 2026.

## Changed

- Pay supplier only pays and Collect payment only collects (supplier refund, rebate and returning a customer's advance moved out or removed).
- New permission "Service jobs", on by default for managers and technicians.

## Downloads

| Platform | File |
| --- | --- |
| Windows x64 | Karvio-1.2.6-win-x64.exe |
| macOS Apple Silicon | Karvio-1.2.6-mac-arm64.dmg |
| macOS Intel | Karvio-1.2.6-mac-x64.dmg |
| Linux Debian/Ubuntu x64 | Karvio-1.2.6-linux-amd64.deb |
| Android | Karvio-1.2.6-android.apk |
| iOS | Karvio-1.2.6-ios-unsigned.ipa |

Use the existing online shop connection and login. Internet is required. Updating does not reset saved online shop data. Verify downloads against SHA256SUMS.txt.

Desktop installers are unsigned; macOS is not notarized. Android is debug-signed; if the key differs from an older installation, uninstall/reinstall may be necessary and local drafts may be lost. The iOS file is unsigned: sign it with your Apple ID / developer account before installing.

The source passed the business-rule, database and performance test suites and 191 browser tests before release.
