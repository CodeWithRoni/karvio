Owner authorized publication of the three invoice/quotation audit fixes on 14 November 2026. Deployment verification follows. No database or backend rule changes.

# Three invoice/quotation audit fixes — LOCAL ONLY, 14 November 2026

Baseline main `511bfad48c3df0c5982003385ad019b21a41581f`, live API51. No push, deployment, backend/schema change, production reset or historical transaction rewrite. Older notes below are historical.

```json
{
  "baseCommit": "511bfad48c3df0c5982003385ad019b21a41581f",
  "regularRegression": "passed",
  "hostedRegression": "passed",
  "fullEdgeBrowserTests": 142,
  "newInvoiceTransferBrowserTests": 3,
  "productionBuild": "passed",
  "backendAndSupabaseUnchanged": true,
  "schemaMigration": false,
  "productionReset": false,
  "published": false,
  "nativeInstallersRebuilt": false
}
```

- Quotation transfer validates the discount against only the products sent to POS before replacing a draft. An excessive discount is rejected. When typed parts are omitted and a valid discount remains, the user reviews the changed total and explicitly confirms retaining that discount; cancellation preserves the existing cart.
- Invoice line rates preserve the supported four decimals on thermal receipts, all A4 templates, customer invoice pages, invoice details and return documents. Currency totals retain their existing rounding; the Business template retains its two-decimal minimum for rates.
- The private router fallback preserves valid public invoice/quotation hashes while the public-view listener switches screens. Same-tab links, Back/Forward, expired quotation handling and ordinary unknown-route fallback are tested.

Evidence: verification/audit-nov14-third/{fix-browser.log,full-browser.log,fix-regular.log,fix-hosted.log,fix-build.log}. Maintained browser regressions: frontend/test/invoice-transfer-followup.spec.js. Backend and all Supabase source/schema files are unchanged from the published package.

Owner authorized publication of the three report audit fixes on 14 November 2026. Deployment verification follows. No database schema/data edits.

# Three report audit fixes — LOCAL ONLY, 14 November 2026

Baseline main `45dcc45ed5bec8abe2b5138896150cbe2d1b6cf4`, live API49. No push, deployment, schema migration/reset or historical transaction rewrite. Older publication notes below are historical.

```json
{
  "baseCommit": "45dcc45ed5bec8abe2b5138896150cbe2d1b6cf4",
  "regularRegression": "passed",
  "hostedRegression": "passed",
  "reportFollowupRegression": "passed",
  "fullEdgeBrowserTests": 139,
  "newReportBrowserTests": 2,
  "productionBuild": "passed",
  "schemaMigration": false,
  "productionReset": false,
  "published": false,
  "nativeInstallersRebuilt": false
}
```

- Report table search recalculates totals from matching rows; Excel/PDF/print reuse the same matching totals. Clearing search restores full report totals; selected exports retain their own totals.
- Product profit and Product-wise sales use cumulative allocations of each invoice’s currency COGS. Profit return costs similarly reconcile with currency return profit, including returns outside the original sale period. Product Profit keeps its documented before-invoice-discount convention.
- Daily Counts quantities are grouped by unit. Profit by product displays Unit and separates sold/returned quantity totals; search and selected exports use the same unit-aware aggregation. Return-only periods inherit units from the original sale lines.

Evidence: verification/audit-nov14-second/{fix-runtime.log,fix-regular.log,final-hosted.log,fix-browser.log,full-browser.log,fix-build.log}. New maintained tests: backend/test/report-followup.mjs and frontend/test/report-followup.spec.js.

Publication authorized by owner on 14 November 2026. These four fixes are being published from baseline 62925e3; deployment verification follows. No schema or business-data edits.

# Four audit fixes — LOCAL ONLY, 14 November 2026

Baseline main `62925e3b04ded236ed64730701e5987f32893970`, live API47. The following changes are not published. No database migration or historical transaction rewrite. Older notes below are historical.

```json
{
  "baseCommit": "62925e3b04ded236ed64730701e5987f32893970",
  "regularRegression": "passed",
  "hostedRegression": "passed",
  "nov14AuditRegression": "passed",
  "targetedBrowserTests": 1,
  "productionBuild": "passed",
  "schemaMigration": false,
  "productionReset": false,
  "published": false,
  "nativeInstallersRebuilt": false
}
```

Sale rates above four decimals are rejected atomically; warranty claims match their invoice line (legacy unlinked claims remain conservative); Top selling group aggregates include all products; sales quantities remain separated by unit, including selected exports. Evidence: verification/audit-2026-11-14/fix-{regular,hosted,browser,build}.log and fixes.log.

# Unreleased — five Stock Summary audit corrections (LOCAL ONLY)

- Replay nonserial stock movements for receipt provenance. Positive stock adjustments, untracked legacy stock and vendor-recovered units remain unknown instead of reviving exhausted receipts. Sale/return cancellation and supplier returns restore/remove the appropriate estimated provenance. Serial linkage stays exact.
- Top selling product/group revenue and profit now use allocated invoice discounts, actual return values and reconciled currency COGS.
- Reject purchase unit costs beyond four decimal places (or below 0.0001) before posting; the form preserves the input and explains how to correct it.
- Purchase-lot summary quantities follow filtered lots and are labeled accordingly; unassignable lot-level reservations are not displayed as zero availability.
- Stock valuation totals aggregate unrounded values, consistently across product/group views and selected exports. Fractional-paisa row values are displayed/exported with adequate precision; currency totals round once.

No push/deployment, database migration/reset or rewrite of historical transactions. Previous source is published at 044931d6fc391676e28319d0491861602363297c.

# Unreleased — Product Summary and stock reports (local only)

- Dashboard Product Summary beneath Stock summary: current stock over 3/6/12 calendar months, supplier warranty ending within 30 days, expired and not set, with quantities kept separate by unit. Cards open the matching report filter.
- Reports Hub Stock summary: product/group/category/purchase-lot views; group/category/brand/product, age, no-net-sales, in/out-of-stock, reserved, unknown age and supplier-warranty filters. Cost remains permission protected; Excel/PDF/print use the full filtered table.
- Supplier warranty is an explicit expiry on each purchase line. New purchases accept it; existing active purchases can update only the warranty metadata without changing valuation, quantities or payments. Unknown dates are never inferred from customer warranty.
- Serial stock lots use exact purchase linkage; nonserial remaining lots use an explicitly disclosed FIFO estimate. Untracked stock is unknown; overlapping age thresholds are explained and mixed units are not added together.
- Top selling products/groups add 3-month and 6-month periods including the current calendar month, net of returns and excluding cancelled sales.

All previous seven audit fixes remain pending locally. No push, deployment, schema change, reset or live-data edit.

# Unreleased — seven deep-audit fixes (local only, 13 November 2026)

- Preserve four-decimal POS quantities when the same product is added again.
- Limit customer advance refunds to current available credit on the server and in the payment dialog; use live balance with statement date filters.
- Reconcile invoice profit with currency cost/total, including older invoices on read. Allocate return currency cost cumulatively; retain four-decimal line cost for inventory restoration.
- Permit zero-total sale/purchase returns and exchanges when an item is selected.
- Preserve quotation unit-price precision and print stored public-quote totals, including older links.
- Print customer and previous-due receipt dates from their ledger entries.
- Scan the latest serial lifecycle when no in-stock copy remains.

No push, deployment, schema migration, reset or live business-data modification. Existing historical data is not rewritten.

# Unreleased — five post-release audit fixes (local only)

- Correct nonserial replacement-return cost, per-line POS/purchase rounding, four-decimal inventory precision, inactive account posting and hidden previous-due drafts after balance refresh.
- All92 browser tests and the regular/hosted regression suites passed locally. No push/deployment or live-data migration performed.

# Karvio 1.2.2

See [release notes](RELEASE-1.2.2.md) for the current online-only release. Entries below describe earlier development snapshots and releases.

# Unreleased — local review fixes (11 November 2026)

- Restore/reset keep a durable full-table recovery snapshot before changing online records; failed recovery blocks reads until it can finish.
- Unconfirmed write IDs survive reload and session renewal; unsafe retries after the receipt lifetime or against old backends are refused.
- Linked supplier edits require customer permission; product history respects sales visibility, and nested warranty replacement costs stay private.
- Collection reminders use the invoice's current due allocation. Full expense/return/warranty reports no longer inherit UI row limits.
- Public/business invoices count an advance once. Native offline backups from before Repairs existed can be restored.
- Complete frontend build regenerated and checked for missing local assets. Packaging runs the same build check.
- Release publication requires every platform to succeed; Pages checks browser workflows before publication.
- Existing dependency major versions, layout, business modules and database schema are retained. Remaining npm advisories require separate approval for dependency migration. The development editor-launch endpoint is disabled.
- This patch has not been pushed or deployed; publication requires the owner's approval.

# Karvio 1.2.0

## Repairs (নতুন module)

- Customers & Dues এর নিচে নতুন "Repairs" menu: দোকানে আসা repair কাজের job card (job slip print, device, সমস্যা, advance)।
- Advance টাকা customer এর account এ জমা হয়; delivery তে stock থেকে parts আর "Repair service" নিয়ে invoice হয়, advance বাকি থেকে কাটা যায়।
- Status: Received → Completed / Failed → Delivered (বা Cancelled)। Completed হলে customer কে SMS যায়; Failed এ যায় না।
- Failed দিতে technician এর report লিখতে হয়।
- নতুন "Repairs" permission।

## Technician

- Users & Roles এ নতুন "Technician" role, মোবাইল নম্বরসহ।
- Repair job এ technician assign করলে তার নম্বরে SMS যায় (Settings → "Technician job message" এ লেখা বদলানো যায়)।
- কোনো job Completed বা Failed হলে admin এর Dashboard এ alert আসে; "Seen" চাপলে সরে যায়।

## PC Builder ও Quotation

- প্রতিটা part এর নিচে হাতে লিখে part দেওয়ার ঘর (stock এ না থাকলেও)।
- Quotation বানানোর সময় প্রতিটা part এর warranty বেছে দেওয়া যায়; প্রিন্টে customer দেখতে পায়।

## Barcode label

- Brand/warranty/SKU লাইন, barcode নম্বর আর দামের লেখা বড় ও হালকা bold — প্রিন্টে পরিষ্কার পড়া যায়।

## Deploy

নতুন `backend/Code.gs` দিয়ে Apps Script editor থেকে একবার `setupDatabase` চালান, তারপর web app এর নতুন version deploy করুন।

# Karvio 1.1.0

## টাকা ও হিসাব

- Invoice এ এখন "Due at sale" (বিক্রির সময়ের বাকি) আর "Due now" (এখনকার বাকি) দুটোই দেখায়। Customer payment, return আর advance বর্তমান বাকি থেকে কাটা হয়। "শুধু বাকি" তালিকা আর sales report এও "Due now" আছে।
- বাকিতে বেচা জিনিস ফেরত এলে ফেরতের মূল্য আগে ওই invoice এর বাকি শোধ করে। নগদ ফেরত দেওয়া যায় শুধু customer যতটুকু আসলে দিয়েছে ততটুকু।
- Stock adjust এ কমানো বা বাড়ানো মাল কেনা দামে net profit এ যোগ বা বিয়োগ হয় (Profit page, dashboard, daily report)।
- Deposit, withdrawal আর transfer এখন account ledger থেকে বাতিল করা যায়। Transfer বাতিল করলে দুই account থেকেই বাতিল হয়।
- Customer, supplier আর account এর opening balance বদলালে আগের আর নতুন অঙ্ক audit log এ ওঠে।

## তারিখ ও মাস বন্ধ

- ভুল বা ভবিষ্যতের তারিখ save হয় না।
- Settings → Close books (শুধু admin): নির্দিষ্ট দিন পর্যন্ত হিসাব বন্ধ করা যায়। বন্ধ দিনের entry বা cancel হয় না।

## নিরাপত্তা

- Admin বানানো, admin account বদলানো আর role permission বদলানো এখন শুধু admin পারে।
- `cost` permission না থাকলে report, return তালিকা আর top products এ cost বা profit পাঠানো হয় না।
- Password hash এখন ২০০০ বার করা হয়; পুরোনো hash প্রথম login এ নিজে থেকে নতুন হয়। একই username এ ৫ বার ভুল password দিলে ১৫ মিনিট বন্ধ।
- `ping` আর `login` script lock ছাড়া চলে; বাইরের public request lock এর জন্য সর্বোচ্চ ৫ সেকেন্ড অপেক্ষা করে।
- একই phone নম্বরে দ্বিতীয় customer বানানো যায় না (যেকোনো format এ)।
- jsPDF 4, jspdf-autotable 5, SheetJS (xlsx) 0.20.3 — পুরোনো library এর নিরাপত্তা সমস্যা ঠিক।

## Warranty

- Cancel হওয়া invoice বা ফেরত আসা জিনিসে claim নেওয়া যায় না।
- "Replaced" করলে stock থেকে একটা unit কমে; serial হলে invoice এ নতুন serial বসে, নষ্টটা "faulty" থাকে। Supplier ভালো unit পাঠালে "Put it back in stock" দিয়ে stock এ ফেরত।

## Backup ও গতি

- Settings → Database → Automatic daily backup: রোজ রাতে Google Drive এর "Karvio backups" folder এ copy, পুরোনো copy নিজে থেকে trash এ।
- পুরোনো request receipt রোজ মুছে যায়, তাই sale save দীর্ঘদিন পরেও দ্রুত থাকে।
- Offline app: প্রতিটা request এ পুরো database copy হয় না; রোজকার backup এর শেষ ৩০টা থাকে।

## Deploy

নতুন `backend/Code.gs` দিয়ে Apps Script editor থেকে একবার `setupDatabase` চালান (Drive আর trigger এর নতুন permission Allow করুন), তারপর web app এর নতুন version deploy করুন।

# Karvio 1.0.6

See FIXES-1.0.6.md, VERIFICATION.md and UPLOAD_GUIDE-বাংলা.md for this release. The full fourteen-finding review has been addressed; offline Electron support is included.

# Karvio 1.0.2 (earlier name: ShopERP)

## Product groups ও categories

- চারটি আলাদা কার্ড: Product groups, Categories, Brands, Warranty periods। Product groups-এ PROCESSOR-এর মতো গ্রুপ তৈরি করুন। Categories-এ গ্রুপ বেছে INTEL বা AMD যোগ করুন।
- গ্রুপ বাছাই ছাড়া category তৈরি করা যায় না। একই গ্রুপে একই category নাম দ্বিতীয়বার যোগ করা যায় না; আলাদা গ্রুপে একই নাম ব্যবহার করা যায়।
- আগে রাখা main category এখন Product group হিসেবে এবং তার sub-category এখন Category হিসেবে দেখা যায়। বিদ্যমান ID, পণ্যের সম্পর্ক ও stock history বদলায় না; কোনো database reset প্রয়োজন নেই।
- Add product, stock filter ও export-এ Product group / Category নাম ব্যবহার করা হয়। PC builder-ও group অনুযায়ী পণ্য খুঁজে পায়।
- ব্যবহৃত group বা category মুছে ফেলা যায় না।

## আগের 1.0.1 সংশোধন

## সংশোধন

- ক্রয় করার আগে ও পরে স্টক ও গড় ক্রয়মূল্য সংরক্ষণ করা হয়। ক্রয় বাতিল করলে সেই মূল্যের পরিবর্তনও ফেরত আসে। একই পণ্য একাধিক লাইনে থাকলেও সঠিকভাবে ফেরত আসে।
- পরের বিক্রি, supplier return বা manual stock adjustment-এর ওপর নির্ভরশীল পুরোনো ক্রয় বাতিল করে লাভের হিসাব নষ্ট করা ঠেকানো হয়।
- পুরোনো PurchaseItems শিটে শেষের দিকে `valuation` কলাম যোগ হয়; আগের ডেটা মুছে ফেলা বা database reset করা লাগে না। পুরোনো ক্রয়ে snapshot না থাকলে স্টকের বর্তমান মূল্য থেকে ক্রয়ের মূল্য বাদ দিয়ে বাকি গড় মূল্য বের করা হয়।
- ড্যাশবোর্ড দৃশ্যমান থাকলে প্রতি ৩০ সেকেন্ডে এবং অ্যাপে ফিরে এলে আপডেট হয়। সাময়িক সংযোগ সমস্যা হলে আগের তথ্য রেখে সতর্কবার্তা দেখায়।
- লোকাল কপিতে অনুপস্থিত confirmation dialog যোগ করা হয়েছে। GitHub-এর পরের POS collection, delete button এবং অন্যান্য পরিবর্তনও কাজের কপিতে রাখা হয়েছে।
- বাংলা PDF-এ ব্রাউজারের বাংলা অক্ষর সাজানোর ব্যবস্থা ব্যবহার করা হয়; বড় রিপোর্টে একাধিক পৃষ্ঠা হয়। এই PDF-এ বাংলা অংশ ছবি হিসেবে থাকে। Latin রিপোর্টের text PDF আগের মতো থাকে।
- বাংলা/ইংরেজি ফন্ট অ্যাপের সঙ্গে থাকে। প্রিন্টের আগে বাংলা ফন্ট লোড হওয়া পর্যন্ত অপেক্ষা করা হয়।
- মোবাইল ফিল্টারের অস্বাভাবিক উচ্চতা ঠিক করা হয়েছে।
- Electron ও Tauri build dependency, platform build command এবং icon যোগ করা হয়েছে।

## চালানো

Frontend ফোল্ডারে:

সম্পূর্ণ web ও desktop development setup-এর জন্য Node.js 22.12 বা পরের সংস্করণ ব্যবহার করুন। GitHub Pages build-ও Node.js 22 ব্যবহার করে।

```sh
npm ci
npm run dev
```

Web build: `npm run build`। Windows installer: `npm run desktop:build:win`। Mac-এ DMG তৈরি করতে: `npm run desktop:build:mac`। এই Windows পিসিতে macOS installer চালিয়ে যাচাই করা হয়নি। Tauri বিকল্পটি Rust ও প্রয়োজনীয় Windows/macOS build tools চায়।

Electron packaging-এর নিয়ম: https://www.electron.build/v26/docs/nsis/
Tauri icon-এর নিয়ম: https://v2.tauri.app/develop/icons/

## পরীক্ষা

```sh
npm test
npm run test:e2e
npm run verify:live
```

অফলাইন পরীক্ষা: ১৫২টি পুরোনো + ১৮টি valuation + ২২টি product group/category check। ব্রাউজারের ৭টি পরীক্ষা: মূল স্ক্রিনগুলো, dashboard refresh ও error recovery, confirmation, বাংলা PDF/Excel ও দুই মাপের receipt document, মোবাইল, বড় বাংলা PDF এবং Group → Category → Product → Stock filter → PC builder। Browser test-এ Microsoft Edge ব্যবহার করা হয়।

সব fixture লেনদেন local in-memory mock server-এ চলে। Google Sheet-এ পরীক্ষার ক্রয়-বিক্রয় লেখা হয় না। SMS mock দিয়ে পরীক্ষা করা হয়েছে; বাস্তব SMS delivery এবং physical thermal printer আলাদাভাবে পরীক্ষা করতে হবে।

## Backend update ও rollback

নতুন Code.gs পুরোনো project-এ বসিয়ে **Manage deployments → Edit → New version → Deploy** করতে হবে; একই deployment রাখলে URL বদলায় না। `setupDatabase` পুনরায় চালানোর প্রয়োজন নেই। প্রয়োজনে Manage deployments থেকে আগের version বেছে rollback করা যায়। নতুন valuation কলাম রেখে দিতে হবে।

প্রথম কাজের কপি ERP 4 ফোল্ডারে; আগের ShopERP ফোল্ডারটি পরিবর্তন করা হয়নি।
