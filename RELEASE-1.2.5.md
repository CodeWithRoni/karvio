# Karvio v1.2.5

Online-only installers for Windows x64, macOS Intel and Apple Silicon, Linux Debian/Ubuntu x64, Android and iOS. Includes every published fix through 909c89c.

## Updates

- Faster, lighter server: each action reads only the tables it needs, private settings are stored as rows, repeated reads are cached and log-only saves no longer read the whole log.
- Simpler Database page: plain Backup (download) and Import (one button). The automatic daily backup is switched off; backups have no password.
- Fairer request limits: sign-in and public invoice/quotation links have their own limits, so they never slow down signed-in counters.
- Purchase staff can refresh the supplier list; a supplier return cannot be saved twice when a refresh fails.
- A purchase without a supplier is refunded in full when returned.
- Unique quotation numbers (date and time based).
- Barcodes and SKUs are unique together and ignore capital letters; older duplicates never block editing.
- New expenses use a category from the expense category list.
- Product-wise sales and Daily summary reports show only your own sales unless you may view other staff's sales.
- Negative or non-numeric payment amounts are refused; the app's own confirm dialog replaces browser pop-ups.
- Unused files removed from the repository.

## Downloads

| Platform | File |
| --- | --- |
| Windows x64 | Karvio-1.2.5-win-x64.exe |
| macOS Apple Silicon | Karvio-1.2.5-mac-arm64.dmg |
| macOS Intel | Karvio-1.2.5-mac-x64.dmg |
| Linux Debian/Ubuntu x64 | Karvio-1.2.5-linux-amd64.deb |
| Android | Karvio-1.2.5-android.apk |
| iOS | Karvio-1.2.5-ios-unsigned.ipa |

Use the existing online shop connection and login. Internet is required. Updating does not reset saved online shop data. Verify downloads against SHA256SUMS.txt.

Desktop installers are unsigned; macOS is not notarized. Android is debug-signed; if the key differs from an older installation, uninstall/reinstall may be necessary and local drafts may be lost. The iOS IPA is unsigned and must be signed before installation; this is not an App Store distribution.

The source baseline passed 151 browser tests, accounting suites, native PostgreSQL parity/transfer tests and build checks. Publication requires every native build to succeed. Installers have not been physically tested on every OS/device. Global write serialization and some broad report snapshots remain; see the performance documentation.
