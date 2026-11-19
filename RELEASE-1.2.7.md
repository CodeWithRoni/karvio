# Karvio v1.2.7

Online-only installers for Windows x64, macOS Intel and Apple Silicon, Linux Debian/Ubuntu x64, Android and iOS. Includes every published change since v1.2.6.

## New

- **Branches:** Main Branch plus as many branches as you need; users and accounts per branch; stock moves with Branch transfer; Branch report. Pick the branch on the sign-in screen; the menu shows a "Working in" badge (with a dropdown for users who may work in any branch). A branch can be chosen while adding or editing a user.
- **Shift & day close** with counted cash, X / Z report and an optional POS lock; **Day book**; **Stock count** by scanning.
- **Online orders** from Facebook, website or phone, booked with Steadfast, Pathao or RedX (courier keys in Settings → Courier), cash on delivery and returns.
- **Invoice edit** and **Purchase edit** (yellow Edit beside Cancel): same number and date; stock, serials, payments and dues follow.
- **Dashboard:** Sales below cost card and report; **Notes** with a formatting editor, priority, status and reminder pop-ups.
- **SMS settings:** one card per SMS with its own switch, message and preview.
- Saved quotations are included in the database backup.

## Changed

- Side menu reorganised into cards; page names in Title Case.
- Add product needs Product group, Category, Brand, SKU / model and Selling unit for stock products.
- Names and usernames show with a capital first letter; sign-in ignores capital letters in the username.
- Cancelling an invoice from an earlier day books a refund today, so the shift and day close match the cash given back.

## Downloads

| Platform | File |
| --- | --- |
| Windows x64 | Karvio-1.2.7-win-x64.exe |
| macOS Apple Silicon | Karvio-1.2.7-mac-arm64.dmg |
| macOS Intel | Karvio-1.2.7-mac-x64.dmg |
| Linux Debian/Ubuntu x64 | Karvio-1.2.7-linux-amd64.deb |
| Android | Karvio-1.2.7-android.apk |
| iOS | Karvio-1.2.7-ios-unsigned.ipa |

Use the existing online shop connection and login. Internet is required. Updating does not reset saved online shop data. Verify downloads against SHA256SUMS.txt.

Desktop installers are unsigned; macOS is not notarized. Android is debug-signed; if the key differs from an older installation, uninstall/reinstall may be necessary and local drafts may be lost. The iOS file is unsigned: sign it with your Apple ID / developer account before installing.

The source passed the business-rule, database and performance test suites and 203 browser tests before release.
