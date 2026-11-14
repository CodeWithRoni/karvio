# Karvio v1.2.4

Online-only installers for Windows x64, macOS Intel and Apple Silicon, Linux Debian/Ubuntu x64, Android and iOS. Includes the published fixes through d6bd873 and the bounded-read / verified backup-transfer improvements.

## Updates

- Common checkout, purchase, detail and payment paths read relevant data instead of every shop table. Read-only lists use SQL summaries; compact row positions and supporting indexes reduce memory use.
- Verified paged backup export with JSONL/gzip, resumable staged restore, atomic application, recovery copies and completion receipts. Legacy small JSON backups remain supported. See docs/BOUNDED-BACKUPS.md for limits.
- Includes the intervening accounting, report, stock, security, deployment and reliability corrections since v1.2.3.

## Downloads

| Platform | File |
| --- | --- |
| Windows x64 | Karvio-1.2.4-win-x64.exe |
| macOS Apple Silicon | Karvio-1.2.4-mac-arm64.dmg |
| macOS Intel | Karvio-1.2.4-mac-x64.dmg |
| Linux Debian/Ubuntu x64 | Karvio-1.2.4-linux-amd64.deb |
| Android | Karvio-1.2.4-android.apk |
| iOS | Karvio-1.2.4-ios-unsigned.ipa |

Use the existing online shop connection and login. Internet is required. Updating does not reset saved online shop data. Verify downloads against SHA256SUMS.txt.

Desktop installers are unsigned; macOS is not notarized. Android is debug-signed; if the key differs from an older installation, uninstall/reinstall may be necessary and local drafts may be lost. The iOS IPA is unsigned and must be signed before installation; this is not an App Store distribution.

The source baseline passed 151 browser tests, accounting suites, native PostgreSQL parity/transfer tests and build checks. Publication requires every native build to succeed. Installers have not been physically tested on every OS/device. Global write serialization and some broad report snapshots remain; see the performance documentation.
