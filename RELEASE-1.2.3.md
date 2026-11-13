# Karvio v1.2.3

Online-only installers for Windows x64, macOS Intel and Apple Silicon, Linux Debian/Ubuntu x64, Android and iOS. Includes the current published ERP fixes and mobile improvements.

## Included updates

- Phone/tablet camera scanning in POS product/serial search, purchase product search, purchase serial entry and Advance Search. Rear camera is preferred, one scan enters one code, and camera tracks stop after success/cancel. Frames are decoded locally; no photo is saved or uploaded. Desktop devices keep normal keyboard/scanner input.
- Android camera permission and iOS camera usage description included in these new builds. The browser/device asks for camera access; typing remains available if access is denied.
- Mobile/tablet Purchase cards give product names and purchase history the full width, with labeled quantity/prices and accessible serial entry below.
- Return cost data is hidden from staff without Cost permission; restricted payment roles can select active accounts without receiving account balances.
- Repair totals use the same rounded lines as invoices, Exchange payments reflect actual available credit after old dues, and returns preserve supported four-decimal quantities.
- Includes the intervening Exchange, expense editing/filtering, quotation SMS links, print-layout, pagination, dropdown, serial/unit and date fixes since v1.2.2.

## Install and upgrade

Use your existing online shop URL and login. Internet access is required. Installing an update does not reset the online database. SHA256SUMS.txt accompanies the downloads.

| Platform | Download |
| --- | --- |
| Windows x64 | Karvio-1.2.3-win-x64.exe |
| macOS Apple Silicon | Karvio-1.2.3-mac-arm64.dmg |
| macOS Intel | Karvio-1.2.3-mac-x64.dmg |
| Linux Debian/Ubuntu x64 | Karvio-1.2.3-linux-amd64.deb |
| Android | Karvio-1.2.3-android.apk |
| iOS | Karvio-1.2.3-ios-unsigned.ipa |

Desktop builds are unsigned; macOS builds are not notarized. Android is debug-signed and may require uninstall/reinstall if its signing key differs from an earlier build; local drafts can be lost on uninstall, while saved online shop data remains. The iOS IPA is unsigned: it must be signed before installation and is not an App Store release.

Validation: the source application passed 121 browser workflows and regular/hosted accounting tests before this packaging update. This release is published only when every native build succeeds. Physical-camera behavior depends on the device, permissions, focus and lighting; hardware testing has not been performed on every platform.
