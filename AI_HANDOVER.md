# Karvio ERP — Complete Handover (A to Z)

> **বাংলায় সংক্ষেপে (মালিকের জন্য):** এই ফাইলটা Karvio ERP প্রজেক্টের সম্পূর্ণ বিবরণ।
> এতে আছে প্রজেক্টটা কী, কোথায় কী আছে, কীভাবে কাজ করে, কী কী feature আছে, কীভাবে test,
> deploy আর release করতে হয়, আর এখন পর্যন্ত কী কী করা হয়েছে। অন্য কোনো AI-কে এই ZIP বা
> শুধু এই ফাইলটা দিলেই সে প্রজেক্টটা বুঝে আগের মতো কাজ চালিয়ে যেতে পারবে। AI-এর জন্য নির্দেশনা
> ইংরেজিতে লেখা, কারণ বেশিরভাগ AI ইংরেজিতে সবচেয়ে নির্ভুলভাবে পড়ে।

---

## 0. Read this first (instructions for the AI taking over)

You are continuing work on **Karvio**: a production ERP / POS used every day by a real computer and IT shop in Bangladesh, "COMPUTER PLUS". Real money and stock depend on it, so mistakes are costly.

### 0.1 How the owner wants you to work

1. **Always reply in Bangla.** The owner is Bangladeshi and asked for every answer in Bangla. Keep code, file names and button labels in English.
2. **Take your time and do not make mistakes.** The owner's words: *"Tumi somoy niye kaaz koro kintu vul korbe na"* (take your time, but don't get it wrong). Before saying something is done:
   - test it, including hidden states such as a closed or open menu, a phone screen, an empty list, an expired session or a different role;
   - add a regression test for every bug you fix;
   - prove the test fails on the old code when that is practical.
3. **Never create a new GitHub release unless the owner asks.** By default, only push code to `main` (the website updates by itself) and redeploy the Apps Script backend when the backend changes. Do not run the "Build Karvio apps" workflow on your own.
4. **Keep everything online.** Do not leave files on the owner's computer. When the owner asks for a ZIP, produce a fresh ZIP of the latest code.
5. **Database layout:** if the Google Sheet layout needs to change, you make the change. Add columns at the end through `SCHEMA` in `Code.gs` (see §4.1). Never reorder or delete existing columns.
6. **Security and secrets:**
   - Never type the owner's passwords.
   - The owner clicks Google/GitHub "Allow" screens and anything public themselves.
   - Never repeat API keys you see in screenshots.
   - Keep the owner's email address out of commands and commits.
   - Git identity: `CodeWithRoni` / `CodeWithRoni@users.noreply.github.com`.
7. **Explaining your work:** say what changed in plain Bangla, list the steps the owner must do (for example "Ctrl+F5"), and be honest about what was not tested. Typical gaps are a real SMS gateway, a real thermal printer and a real iPhone.

### 0.2 Key links and IDs

| What | Value |
|---|---|
| Live web app | https://codewithroni.github.io/shop-erp/ |
| GitHub repo | https://github.com/CodeWithRoni/shop-erp (branch `main`) |
| Releases (installers) | https://github.com/CodeWithRoni/shop-erp/releases (latest **v1.0.5**) |
| Google Sheet (database) | ID `1r7WI5GNHtppUCtCu_rZUmvfum92i0HZdK298Z4uZH7w` |
| Apps Script project | https://script.google.com/home/projects/1pTAiwip7zlzZELB_AJlLr_RgsDIKQvHXdBDqqw7AjvNOHrN9EE5C9cku/edit |
| Web App (API) URL — never changes | https://script.google.com/macros/s/AKfycbxG_OORWKQAVW8S4Oxf3LoQ3Pukazszssd5gNimviRr9qLwjriURhsaw8CyoW_LDB4wlg/exec |
| Apps Script deployment version | **28** (Nov 6, 2026), backend `APP_VERSION = '1.0.5'` |
| Default login (fresh database only) | `admin` / `admin123` (the owner has changed it) |
| Shop | COMPUTER PLUS (Bangladesh, time zone Asia/Dhaka, currency Tk) |

---

## 1. What Karvio is

Karvio is a shop-management and POS system for a computer, IT accessories and networking retail/wholesale shop. It handles:
- selling, with barcode and serial-number scanning;
- buying from suppliers;
- stock, with serial-number tracking and weighted-average costing;
- customer dues ("Bakir Khata");
- supplier payables;
- cash, bank and MFS (bKash / Nagad) accounts;
- expenses and warranty claims;
- a PC builder with quotations;
- reports;
- SMS to customers;
- barcode label printing.

It runs:
- as a website (GitHub Pages);
- as a Windows, macOS and Linux desktop app (Electron);
- as an Android app (APK) and an iOS app (unsigned IPA), both through Capacitor.

All of them talk to one backend.

```
 ┌───────────────────────────┐        POST text/plain JSON         ┌──────────────────────────────┐
 │  React 18 + Vite frontend  │  ─────────────────────────────────▶ │ Google Apps Script Web App    │
 │  (web / Electron /         │   { action, token, payload }        │ backend/Code.gs  (doPost)     │
 │   Capacitor Android/iOS)   │ ◀───────────────────────────────── │ router → handler → Sheets     │
 └───────────────────────────┘   { ok:true, data } | { ok:false,    └──────────────┬───────────────┘
                                    error, auth }                                  │ SpreadsheetApp
                                                                    ┌──────────────▼───────────────┐
                                                                    │ Google Sheet = database       │
                                                                    │ one tab per table (SCHEMA)    │
                                                                    └──────────────────────────────┘
```

- **No other server exists.** The Google Sheet is the database, and Apps Script is the API.
- **Why `text/plain`:** requests are sent as `Content-Type: text/plain`. That avoids the CORS preflight, which Apps Script cannot answer.
- **Who can call the Web App:** it runs as the owner ("Execute as: Me") with access "Anyone". Security comes from Karvio's own login:
  - passwords are hashed with SHA-256 and a salt;
  - every request carries a session token, kept in CacheService for 6 hours on a sliding window;
  - every request is checked against role permissions.

---

## 2. Repository map

```
shop-erp/
├── AI_HANDOVER.md            ← this file
├── README.md                 short intro
├── SETUP.md                  full setup guide in Bangla (new sheet → Apps Script → deploy → app)
├── CHANGES.md                release notes of 1.0.1 / 1.0.2 (Bangla)
├── .github/workflows/
│   ├── deploy.yml            on every push to main: build frontend → publish dist to gh-pages (= live site)
│   └── release.yml           MANUAL ONLY ("Build Karvio apps"): .exe .dmg(x64+arm64) .deb .apk .ipa → GitHub release v<package.json version>
├── backend/
│   ├── Code.gs               ★ THE backend. Single source of truth. Paste this whole file into Apps Script.
│   ├── appsscript.json       manifest (time zone Asia/Dhaka, V8)
│   ├── parts/*.gs            OLD split copy from the first day — OUTDATED, NOT USED. Do not edit; Code.gs wins.
│   └── test/                 offline tests (Node + vm sandbox that mocks Google services)
│       ├── simulate.js       harness + 152-check business scenario (also the harness other tests reuse)
│       ├── server.js         local mock API on http://localhost:8787 (in-memory sheet, admin/admin123)
│       ├── valuation.js · categories.cjs · service.cjs · dues-returns.cjs · barcodes.cjs
│       ├── access-hours.cjs · supplier-invoice.cjs · invoice-links.cjs
│       └── live.cjs          read-only smoke test against the live API (npm run verify:live)
├── verification/             old evidence files (PDF/PNG/XLSX) from early checks
└── frontend/
    ├── index.html            viewport-fit=cover (needed for phone safe areas)
    ├── package.json          version (source of the release tag), scripts, electron-builder config
    ├── capacitor.config.json appId com.karvio.erp; SystemBars insetsHandling css; iOS contentInset never
    ├── playwright.config.js  e2e config (uses msedge channel on Windows — see §7)
    ├── desktop/main.cjs      Electron window (loads dist/index.html)
    ├── src-tauri/            optional Tauri desktop build (not used by CI)
    ├── branding/             icons for every platform; scripts/native-icons.mjs copies them into native projects
    ├── public/               favicon, PWA manifest, logos
    ├── test/
    │   ├── shop.spec.js      Playwright end-to-end tests (21 tests)
    │   └── sms-presets.mjs   unit test for SMS preset detection
    └── src/
        ├── main.jsx · App.jsx (routes, public invoice route, guards)
        ├── config.js         DEFAULT_API_URL (built-in Web App URL; per-device override in Settings → API connection)
        ├── lib/              api, store, format, export, receipt, salesDocs, purchaseDocs, partyDocs,
        │                     labels, smsPresets, dashboardCards, compat
        ├── components/       Layout (side menu), ui (primitives), widgets (ProductSearch, PaymentSplit…),
        │                     DataTable, MasterData, PartyPage, DashboardExtras, LiveClock, NativeShell
        └── pages/            one file per screen (see §5.3)
```

---

## 3. Quick start for a developer or AI

```bash
git clone https://github.com/CodeWithRoni/shop-erp.git
cd shop-erp/frontend
npm ci
npm run build                  # production build into dist/
npm test                       # all offline backend tests + SMS preset unit test (444 checks)
node ../backend/test/server.js # mock API on :8787  (in another terminal)
npm run dev                    # http://localhost:5173 → Settings/API: http://localhost:8787 → admin/admin123
npx playwright test            # e2e (see §7.3 for the browser setting)
```

Node 22 is used in CI.

---

## 4. Backend (`backend/Code.gs`) in depth

The file is about 2,430 lines, divided into numbered sections (search for `*  N.`):

| # | Section |
|---|---|
| 1 | Database layer |
| 2 | Setup |
| 3 | Auth and permissions (including working hours) |
| 4 | Balances and shared helpers |
| 5 | Master data |
| 6 | Products |
| 7 | Customers and suppliers |
| 8 | Accounts |
| 9 | Users and settings |
| 10 | SMS gateway |
| 10b | Customer invoice links |
| 11 | Bootstrap |
| 12 | Purchases |
| 13 | Sales |
| 14 | Sales return / exchange |
| 15 | Purchase return |
| 16 | Payments and expenses |
| 17 | Reversal / cancellation |
| 18 | Warranty claims |
| 19 | Item history (Advance Search) |
| 20 | Dashboard |
| 21 | Reports hub |
| 22 | API router |

### 4.1 Data layer (how the Sheet is used)

- **`SCHEMA`** defines one tab per table, with columns as `name` or `name:type`. Types are `s` (text, the default), `n` (number) and `b` (boolean). The first column is always `id`, a 12-character random id from `uid_()`, except in `Settings`, which uses `key,value`.
- **`sheet_(name)`** creates a missing tab with bold, frozen headers and text-formatted string columns. If `SCHEMA` lists more columns than the tab has, it **appends the new columns at the end** and formats new text columns as plain text (`@`). This stops `"09:30"` or `"00123"` from becoming a time or a number. **This is how you change the database layout: add new columns at the end of the SCHEMA string.** No migration step is needed. Never insert columns in the middle and never rename them, or `sheet_` will fail with "Unexpected column".
- **Read and write helpers:**
  - `all_(name)` reads the whole tab into objects (typed by `cast_`), each with a `_row` number. Results are cached per request in `_mem`.
  - `insert_(name, obj)` and `insertMany_` append rows and return the record with its `id`.
  - `update_(name, id, patch)` updates one row.
  - `remove_(name, id)` deletes a row.
  - `indexBy_` builds a lookup by id.
  - Other helpers: `sum_`, `round_`, `num_`.
- **Dates and time zone:**
  - Dates are stored as `yyyy-MM-dd` and timestamps as `yyyy-MM-ddTHH:mm:ss`, both in **Asia/Dhaka**, via `today_()` and `now_()`.
  - `cast_` converts any Date that Sheets returns back into these strings.
  - The frontend must use the **server's** date (`shopDay(n)` in `store.js`), never the browser clock, because the computer's clock or time zone can be different.
- **Settings:** the key/value tab is read with `getSetting_(key, default)` and written with `setSetting_`. `settingsSave_` only accepts keys on its allow-list (see §4.9).
- **Locking:** write routes run inside `withLock_` (ScriptLock). It also runs `dailyLinkCleanup_()` once a day.
- **Errors:** `fail_('message')` throws. The router returns `{ok:false, error}`. Messages that start with `AUTH:` also set `auth:true`, and the frontend then signs the user out and shows the reason on the sign-in page.

### 4.2 Tables (current SCHEMA, 28 tabs)

| Tab | Purpose / notable columns |
|---|---|
| Users | `role` (admin/manager/sales), `active`, password `salt`+`password_hash`, **working hours** `access_limit, access_from, access_to, access_days` |
| Settings | key / value (see §4.9) |
| Accounts | cash / bank / MFS accounts, `opening_balance` |
| AccountTxns | every money movement: `direction` in/out, `ref_type/ref_id`, `voided` |
| Categories | `parent_id` empty = **Product group** (e.g. PROCESSOR); with parent = **Category** (e.g. INTEL) |
| Brands, WarrantyPeriods, Units | master lists (Units have `decimal` for meter/feet) |
| Products | `sku` (model), `barcode`, `category_id` (=group), `subcategory_id` (=category), `brand_id`, `unit`, `cost_price` (weighted average), `sale_price` (retail), `wholesale_price`, `stock`, `low_stock`, `has_warranty`, `warranty_type` (`serial`/`invoice`), `warranty_days`, `service` (non-inventory), `description` |
| SerialItems | one row per serial unit: `status` in_stock / sold / returned_supplier / cancelled…, `cost` per unit |
| Customers, Suppliers | `phones`, `addresses`/`address`, `opening_balance`, `link_id` (a party that is both customer and supplier) |
| Purchases, PurchaseItems | purchase invoices `PUR-xxxxxx`; **`supplier_invoice`** (supplier's own bill no.); item `valuation` = stock/average snapshot used to undo a purchase exactly |
| Sales, SaleItems | invoices `INV-xxxxxx`; `paid`, `credit_used` (advance), `due`, `cost`, `profit`, `payments` (JSON), **`next_payment_date`**; items carry warranty type/days/expiry and serials |
| SalesReturns, SalesReturnItems | returns/exchanges; item `valuation` snapshot (returned stock re-enters at original cost) |
| PurchaseReturns, PurchaseReturnItems | returns to supplier |
| Expenses | categories live in the Expenses module |
| CustomerLedger, SupplierLedger | debit/credit statements (sales, payments, returns, opening) with `voided` |
| WarrantyClaims | claim workflow with JSON `log` |
| ItemEvents | life-cycle timeline per serial / product (purchase, sale, return, claim…) used by Advance Search |
| SmsLog | every SMS attempt (invoice links are stored **masked**) |
| **InvoiceLinks** | `token_hash, sale_id, created_at, expires_at` — customer invoice links (only a hash of the key) |
| AuditLog | who did what (sales, reversals, settings, barcode assignment, invoice links…) |

### 4.3 Auth, roles, permissions, working hours

- **`login_`:**
  - checks the username and password;
  - then checks **working hours** (§4.3.1);
  - then issues a token: two UUIDs, stored in CacheService for 6 hours.
- **`authUser_(token)`** runs on every non-public request. It checks the session, then that the user is active, then working hours. If the hours are over, it **removes the session** and fails with an `AUTH:` message that states the hours. The frontend shows that message on the sign-in page (`authNote` in the store).
- **Roles:**
  - `admin` has everything (`['*']`).
  - `manager` and `sales` permissions are configurable in Users & Roles. They are saved in setting `role_perms` and default to `DEFAULT_ROLE_PERMS`.
  - Permission keys are listed in `PERMS`: `pos, sales.all, sales.return, purchase, products, cost, customers, suppliers, accounts, expenses, warranty, reports, cancel, users, settings`.
- **Costs stay hidden:** without `cost`, `stripCost_` removes cost, profit, cost_price and wholesale_price from responses.
- **Cancelling needs an admin password:** cancelling or reversing anything requires the `cancel` permission and an admin password, checked by `confirmAdmin_`.

#### 4.3.1 Staff working hours (v1.0.5)

- **Where it is set:** Users & Roles → edit user → **Limit working hours**, with From, To and day chips (Sat → Fri).
- **What is saved:**
  - `access_from` and `access_to` as `HH:mm`;
  - `access_days` as, for example, `sat,sun,mon,tue,wed,thu`, saved in Bangladesh week order.
- **Rule** (`accessAllowed_(u, clock)`):
  - Admins are never limited.
  - If `from < to`, access is allowed when `from ≤ now < to` and today is a working day.
  - If `from > to`, the shift runs past midnight. The early-morning part belongs to the previous day's shift.
- **Clock:** `clock_()` reads the shop clock (Dhaka). Tests set `CLOCK_OVERRIDE_`.
- **Robustness:** `hmMin_` also accepts a date-time string, in case the Sheet ever converted a time.

### 4.4 Router and API routes

- **Request:** `POST { action, token, payload }`.
- **Route definition:** `ROUTES[action] = r_(perm, fn, write)`. `perm: null` means any signed-in user, and `write` means the route runs under the lock. Public routes are `{ public: true, fn }`.

| Area | Routes (permission) |
|---|---|
| Public | `ping`, `login`, **`invoice.public`** (customer invoice link) |
| Session | `logout`, `password.change`, `bootstrap` (one call loads settings, products, accounts, customers, suppliers, masters, perms, `serverToday`) |
| Products | `products.list`, `product.save`/`product.delete`/`product.barcodes`/`stock.adjust`/`price.update` (products), `serials.list`, `serials.find`, `product.history` (pos or purchase) |
| Master data | `master.save` / `master.delete` / `master.import` (products) |
| Customers/Suppliers | `customers.list`, `customer.save`, `customer.quickAdd` (pos), `customer.statement(s)`, `customer.payment`, `customer.delete` (customers); `suppliers.list`, `supplier.save`, `supplier.statement(s)`, `supplier.payment`, `supplier.delete` (suppliers) |
| Accounts | `accounts.list`, `account.save`, `account.entry`, `account.ledger` (accounts) |
| Purchases | `purchase.create`, `purchase.detail`, `purchases.list` (paged, `q` searches PUR no., supplier invoice, supplier, note, items), `purchases.details`, `preturn.create`, `preturns.list` (purchase) |
| Sales | `sale.create`, `sale.detail`, `sales.details`, `sales.list`, `sale.promise` (next payment date), **`sale.link`** (customer link) (pos); `sreturn.create`, `sreturns.list` (sales.return) |
| Expenses | `expense.create`, `expense.categories`, `expenses.list` (expenses) |
| Cancel | `reverse` {type: sale/purchase/sreturn/preturn/cpay/spay/expense, id, reason, password} (cancel) |
| Warranty | `warranty.lookup`, `claim.create`, `claim.update`, `claims.list` (warranty) |
| Insight | `history` (Advance Search), `dashboard`, `reports` (reports) |
| Admin | `users.list`, `user.save`, `rolePerms.save` (users); `settings.get`, `settings.save` (settings); `sms.test`, `sms.log` (settings) |

### 4.5 Stock costing rules (important)

- **Non-serial items:** a weighted average.
  - On purchase: `new avg = (old stock × old avg + qty × cost) / (old stock + qty)`.
  - The purchase stores a `valuation` snapshot, so cancelling it restores the exact previous average.
  - Cancelling an old purchase is blocked when later sales, returns or adjustments depend on it.
- **Serial items:** each serial has its own `cost`. The product's `cost_price` is the average of the serials in stock, kept up to date by `syncSerialCost_`. This runs after purchases, sales, returns and reversals.
- **Sales returns:** returned units go back into stock **at their original purchase cost**, never at the sale price. Snapshots are stored in `SalesReturnItems.valuation`, and cancelling a return restores the previous cost.
- **Sale cost and profit:** the cost and profit of a sale are fixed at the time of sale.

### 4.6 Sales and purchases details

- **Sales:**
  - payments can be split across accounts;
  - customer advance (`credit_used`) can be used;
  - due goes to `CustomerLedger`;
  - warranty expiry is computed per line, and per-invoice custom warranty days are allowed;
  - serials are required for serial products;
  - **next payment date** (`next_payment_date`) is allowed only when there is a due;
  - walk-in sales never send SMS.
- **Collection reminders** (`collectionReminders_`) are dashboard items for promised payments that are due today or overdue. Customer payments are applied first-in-first-out, so a reminder **switches off by itself** once the invoice is paid.
- **Purchases:**
  - a supplier is required for credit purchases;
  - the retail price is required (prices come from purchases, not the product form);
  - **supplier invoice no.:**
    - stored separately from the note, up to 60 characters;
    - **duplicate guard** — the same supplier with the same number on an active purchase fails with `DUPLICATE_SUPPLIER_INVOICE: …`; the UI asks "Save anyway?" and resends with `allow_duplicate_invoice: true`;
    - shown on the supplier ledger note, in print, PDF and Excel, in the list search and in Advance Search.
- **Price history:** `productHistory_` returns the last 3 selling prices and the last purchase, with the average shown only with the `cost` permission.

### 4.7 SMS gateway

- **When it sends:** `sendSaleSms_` runs after a sale with a named customer, when `sms_enabled` is on and the POS SMS switch is on.
- **What is configurable:** method (GET or POST), URL, form or JSON body, optional request headers (`sms_headers`, one `Name: value` per line, for example `Authorization: Bearer {api_key}`) and number format (`8801…` or `01…`).
- **Placeholders:** `{api_key} {sender_id} {number} {message}`.
- **Message template placeholders:** `{name} {shop} {items} {invoice} {total} {paid} {due} {date} {link}`.
- **Presets** (frontend `lib/smsPresets.js`):
  - OneCodeSoft Bulk SMS API v3 — POST JSON with a Bearer header; the base URL must be pasted from the OneCodeSoft dashboard;
  - MRAM Technologies, text and Bangla/unicode — GET;
  - BulkSMSBD (GET);
  - Generic JSON POST;
  - Generic form POST.
- **Failure detection** (`smsReplyFailed_`): Bangladeshi gateways reply HTTP 200 even when they fail. Karvio treats these as failed:
  - a bare 4-digit code (MRAM: 1002 sender ID, 1003 API not found, 1007 balance, 1016 IP not allowed, 1019 purpose missing);
  - JSON `status:error` or `success:false`;
  - every recipient failed, blocked or spam;
  - error words.
- **Known issue:** MRAM's IP whitelist (code 1016) cannot work with Apps Script, because Google's IPs change. Ask the provider to remove the IP restriction, or use OneCodeSoft. The owner's last test with OneCodeSoft succeeded.

### 4.8 Customer invoice links (v1.0.5)

- **What happens:**
  - With `sms_invoice_link` on (the default), each sale SMS includes a link like `https://codewithroni.github.io/shop-erp/#/i/<22 random letters/digits>`.
  - If the template has no `{link}`, Karvio adds ` Invoice: <url>` at the end.
- **What is stored:** only `linkHash_(token)` (SHA-256), the sale id, the creation time and the expiry time (+15 days, `LINK_DAYS`).
- **Masking:** the SMS log keeps a masked link (`…#/i/Ab12…`).
- **Failed SMS:** if the SMS fails, the link row is deleted right away.
- **`invoice.public` (no sign-in):**
  - checks the format and the hash;
  - returns a **whitelisted** copy of the invoice: shop info, sale totals, items, warranty, payments by method name, customer name/phones/balance and returns;
  - never returns cost, profit, user ids, keys or the hash;
  - an expired or invalid link gives one generic message.
- **Deletion:** expired rows are deleted bottom-up (`cleanupLinks_`) at these moments:
  - when any link is opened;
  - when a new link is made;
  - once a day on the first save (`dailyLinkCleanup_` in `withLock_`, tracked with Script Property `links_cleaned`).

  No time-driven trigger is used, so no extra Google permission is needed.
- **Staff "Customer link" button:** Sales → invoice → `sale.link` makes a new link, copies it and offers WhatsApp.
- **Own domain:** setting `invoice_link_base` changes the link domain if Karvio is hosted elsewhere. Only `http(s)` values are accepted.

### 4.9 Settings keys

| Group | Keys |
|---|---|
| Shop | `shop_name`, `shop_phone`, `shop_tel`, `shop_email`, `shop_web`, `shop_social`, `shop_address`, `shop_footer`, `currency`, `invoice_prefix`, `low_stock_default` |
| Invoice | `invoice_template` (classic / modern / minimal / business), `invoice_paper` (A4, A5, 58, 80, custom), `invoice_custom_width`, `invoice_custom_height`, `invoice_note`, `receipt_width` |
| Dashboard | `dashboard_hidden` (JSON list of hidden card keys) |
| SMS | `sms_enabled`, `sms_method`, `sms_url`, `sms_body`, `sms_body_type`, `sms_api_key`, `sms_sender_id`, `sms_number_format`, `sms_template`, `sms_headers`, `sms_invoice_link`, `invoice_link_base` |
| Internal | `role_perms`, `expense_categories`, `seq_*` (invoice counters) |

The SMS key, URL, body and sender ID are hidden from users without the `settings` permission.

### 4.10 Barcodes (v1.0.3)

`product.barcodes` gives products that have no barcode a unique **EAN-13 code starting with 20**. GS1 reserves this range for in-store use, so it never clashes with manufacturer barcodes. Numbering continues after the highest existing shop code and skips any number already used as a barcode, SKU or serial. The POS search finds products by barcode, SKU, serial, name, model or brand.

---

## 5. Frontend (`frontend/src`) in depth

### 5.1 Stack

| Part | Version / note |
|---|---|
| React | 18 |
| Vite | 5 |
| Router | react-router-dom 6, using **HashRouter** so GitHub Pages works |
| State | zustand 5 |
| Fonts | Manrope (Latin), Hind Siliguri (Bangla), both bundled |
| Export | jsPDF + jspdf-autotable, html2canvas (Bangla PDFs are rendered as images: JPEG pages, about 10× smaller than PNG), xlsx |
| Barcodes | jsbarcode 3.11.6 |
| Phone apps | Capacitor 8 (`@capacitor/app` for the back button) |
| Desktop | Electron 45 + electron-builder |

### 5.2 Core libraries

- **`lib/api.js`:** `api(action, payload)` posts to `endpoint()`. The endpoint is the proxy URL if set, then the saved script URL, then `DEFAULT_API_URL`. On `auth` errors it clears the token and calls `onAuthLost(reason)`.
- **`lib/store.js`** (zustand) holds:
  - the session: `token`, `user`, `perms`, `can(perm)`;
  - data loaded by `boot()`: `settings`, `products`, `accounts`, `customers`, `suppliers`, master lists;
  - `refresh(...)`, `toast(msg, kind)`, the `theme` (dark/light) and `authNote` (why the last session ended);
  - **`shopDay(n)`**, which gives server-based dates.
- **`lib/format.js`:** `money`, `qty`, `fdate` (e.g. `6 Nov 2026`), `fdatetime`, `splitList`, `isDecimalUnit`.
- **`lib/export.js`:** `printHtml(html)` prints through a hidden iframe and waits for fonts. Also the table PDF/Excel export, `esc`, `printFonts` and `shopContacts`.
- **`lib/receipt.js`:** thermal receipts (58/80 mm) and the default invoice print per the template setting.
- **`lib/salesDocs.js`:** full sale invoices for print, PDF and Excel, including the **Business** A4 template. It has a letterhead, a grey bill bar, amount in words, a dues box, and a "Page X of Y" footer with "For Software: 01913354321".
- **`lib/purchaseDocs.js`:** purchase invoices for print, PDF and Excel, and the shared `pdfPages()`.
- **`lib/partyDocs.js`:** customer and supplier statements.
- **`lib/labels.js`:** barcode label engine.
  - Label sizes: roll sizes, A4 sheets and a custom size.
  - Bars are snapped to whole printer dots (203/300 dpi) so they scan, and `scanRisk` flags codes too dense for the label width.
  - Text is auto-fitted, and low-priority lines are dropped on tiny labels.
- **`lib/smsPresets.js`:** SMS presets plus `matchPreset()`, which shows the provider in use.
- **`lib/dashboardCards.js`:** the dashboard card catalogue, with on/off switches in Settings → Dashboard.

### 5.3 Screens (routes)

| Route | Page | Menu (group, Alt key) | Permission |
|---|---|---|---|
| `/history` | History.jsx — **Advance Search** (serial / barcode / INV / PUR / supplier invoice → full timeline) | Search, Alt+8 | any |
| `/` | Dashboard.jsx | Daily Work, Alt+1 | any (full view needs reports) |
| `/pos` | POS.jsx | Daily Work, Alt+2 | pos |
| `/sales`, `/sales/:id` | Sales.jsx — sales list, invoice detail, returns, Customer link | Daily Work, Alt+3 | pos |
| `/pc-builder` | PCBuilder.jsx — in-stock parts, CPU→board→RAM compatibility, quotations | Daily Work | pos |
| `/customers`, `/customers/:id` | Customers.jsx (PartyPage) — dues, payments, statements | Daily Work, Alt+4 | any (actions need customers) |
| `/stock` | Stock.jsx — products & stock explorer, master data | Stock, Alt+5 | any |
| `/barcodes` | Barcodes.jsx — barcode labels | Stock | any (creating barcodes needs products) |
| `/prices` | Prices.jsx — price manager | Stock | products |
| `/purchases` | Purchases.jsx — invoices, returns, new purchase | Stock, Alt+6 | purchase |
| `/suppliers`, `/suppliers/:id` | Suppliers.jsx | Stock | suppliers |
| `/warranty` | Warranty.jsx — claims | Stock, Alt+7 | warranty |
| `/accounts` | Accounts.jsx — Cash, Bank & MFS | Money & Reports | accounts |
| `/expenses` | Expenses.jsx | Money & Reports | expenses |
| `/reports` | Reports.jsx — sales, purchases, returns, daily counts, payment methods, product-wise sales, expenses, warranty status | Money & Reports, Alt+9 | reports |
| `/users` | Users.jsx — users, roles, permissions, working hours | Admin | users |
| `/settings` | Settings.jsx — Shop, Invoice, Dashboard, SMS gateway, API connection, My password | Admin | settings (API and password tabs for all) |
| `#/i/<key>` | PublicInvoice.jsx — **customer invoice page, no sign-in** (handled in App.jsx before the login check) | — | public |

### 5.4 Layout and mobile behaviour

- **Side menu (`components/Layout.jsx`):**
  - each group sits in its own coloured card;
  - a **door button** hides or shows the menu, remembered in `localStorage karvio_nav_hidden` (`.shell.nav-hidden` uses `grid-template-columns: minmax(0,1fr)` — a past bug left a 0-width column);
  - on phones (≤860px) it becomes a drawer: Esc closes it, and the background does not scroll.
- **Safe areas:**
  - `:root` defines `--sat/--sab/--sal/--sar` from Capacitor's `--safe-area-inset-*`, with `env()` as the fallback;
  - `body` is padded by them;
  - fixed elements (drawer, modals, toasts, door button) add them too;
  - a status-bar strip uses the panel colour.
- **POS on phones (≤640px):** each cart line becomes a card with Qty / Price / Amount, and keyboard hints are hidden.
- **`components/NativeShell.jsx`:**
  - Android back button order: close a dialog or the menu (by sending Escape) → go back a page → on the Dashboard show the animated **"Exit Karvio?"** sheet (Stay / Exit; back again = stay);
  - status-bar icons follow the theme;
  - `window.__karvioBack` lets tests press "back".

---

## 6. Feature catalogue (what the shop can do)

### 6.1 Selling (POS)
- **Finding products:** search by name, model, brand, barcode or **scanned serial** (F2). Retail and wholesale price modes.
- **Prices:**
  - each line shows the **last 3 selling prices** as chips (click to use one);
  - a cost peek shows the last purchase price and the average (needs the `cost` permission);
  - an out-of-stock product shows its prices in a dialog.
- **Serials and warranty:** serial chips per line; custom warranty days per line.
- **Payment and customer:**
  - split payment (cash / bank / MFS);
  - customer search by name, phone or address, with their previous due shown;
  - quick-add customer;
  - "Collected balance";
  - advance use;
  - **next payment date** for due sales (chips: 3 days / 1 week / 15 days / 1 month).
- **Finishing and printing:**
  - an SMS switch;
  - F9 completes the sale; F10 completes and prints, going **straight to the print dialog**;
  - receipts at 58/80 mm, A4/A5, a custom size, and the Business A4 template.
- **Walk-in sale:** "CASH" plus the shop's telephone number on the invoice.

### 6.2 Sales & Returns
- Invoice list, filters, tick-to-export (Excel / PDF / Print), invoice detail.
- Return or exchange, at the original cost.
- Cancel with an admin password.
- **Customer link.**

### 6.3 Customers & Dues and Suppliers
- **Lists:** paged 10 at a time, with search and multi-select export of details plus the ledger.
- **Money:** due collection and supplier payments, both first-in-first-out; statements (print / PDF / Excel); opening balances.
- **Combined party:** one party can be both a customer and a supplier (`link_id`).
- **Deleting:** allowed only at a zero balance.

### 6.4 Stock
- **Products & Stock:** a stock explorer with group, category and brand filters and exports, plus master data:
  - product groups → categories, brands, warranty periods and units, shown as equal-size cards with import/export demo files;
  - the product form auto-names products from group, category, brand and model, blocks duplicate names, and supports service items.
- **Barcode Labels:**
  - adding products: search or scan, add a whole group or brand, or **add from a purchase** (one label per unit; serial products get one label per serial);
  - creating missing barcodes: shop EAN-13 codes starting with 20;
  - label size: label-printer rolls (38×25, 40×30, 50×25, 50×30, 60×40, 30×20, 2-up, 3-up) and A4 sheets (65/40/24/21), with custom sizes, start position and 203/300 dpi;
  - what to show: shop name, product name, brand, warranty, SKU, barcode number, price (retail / wholesale / both, with "Price"/"MRP"), an extra line and a cutting border;
  - a live preview.
- **Price Manager:** retail and wholesale prices.
- **Purchases:**
  - **entering a purchase:**
    - supplier first, with their previous balance shown;
    - serial chips by scanning;
    - the **last purchase price** per line with a ▲/▼ change badge and the **new average**;
    - the cost is prefilled from the last purchase;
  - **supplier invoice no.** with the duplicate warning;
  - **the list:** search, supplier filter, dates, 10 per page, multi-select export;
  - returns to the supplier; "Print barcode labels" from a purchase.
- **Suppliers.**
- **Warranty Claims:** look up by serial or invoice, the claim workflow (sent to vendor, ready, delivered…) and documents.

### 6.5 Money & Reports
- **Cash, Bank & MFS:** accounts, transfers and manual entries, account ledger.
- **Expenses:** with categories.
- **Reports Hub:** sales, purchases, sales returns, purchase returns, daily counts, payment methods, product-wise sales, expenses and warranty status, with Excel / PDF / print. PDFs are Bangla-safe and paginated.
- **Dashboard** (every card can be switched on or off in Settings → Dashboard):
  - collection reminders;
  - the main figures: sales, returns, purchases, purchase returns, expenses, gross and net profit, new dues, receivable and payable;
  - sales history cards: this week (Sat–Fri), this month, last month, last 6 months, this year, last year;
  - matching history rows for returns, purchases, purchase returns, expenses, gross and net profit, receivable and payable;
  - stock summary: products, in stock / out of stock, cost value, retail value, expected profit;
  - live balances;
  - a 14-day chart (full width);
  - a row of 3 equal cards: staff leaderboard, top selling products/groups (Today / Month / All) and low stock;
  - a live clock on desktop;
  - automatic refresh every 30 seconds.

### 6.6 Admin
- **Users & Roles:** users, role permissions, **working hours**.
- **Settings:**
  - Shop: name, phone, tel, email, web, social, address;
  - Invoice: template, paper and note;
  - Dashboard: which cards to show;
  - SMS gateway: presets, headers, template, invoice link, test and log;
  - API connection, My password.

### 6.7 Platforms
- Web (any browser).
- Windows `.exe`, macOS `.dmg` (Intel and Apple Silicon) and Linux `.deb`, all Electron.
- Android `.apk` with safe areas, back button and exit confirmation.
- iOS `.ipa`, unsigned — it must be sideloaded and is untested on a real iPhone.

---

## 7. Testing

### 7.1 Offline backend tests (`npm test` in `frontend/`)

| File | Checks | Covers |
|---|---|---|
| simulate.js | 152 | full business scenario (setup, auth, products, purchase, sale, returns, payments, reversal, reports…) |
| valuation.js | 18 | weighted average and purchase-cancel valuation |
| categories.cjs | 22 | product groups and categories |
| service.cjs | 44 | service (non-inventory) items |
| dues-returns.cjs | 63 | return costing, serial averaging, collection reminders, stock summary, top products, price history, SMS reply detection |
| barcodes.cjs | 22 | shop EAN-13 assignment |
| access-hours.cjs | 47 | working hours: rule, overnight shifts, saving, sign-in, mid-session sign-out, admins |
| supplier-invoice.cjs | 15 | supplier invoice field, duplicates, search, statement, Advance Search |
| invoice-links.cjs | 41 | link in SMS, hash only, masked log, public view without leaks, expiry and deletion, daily clean-up, failed SMS, settings, permissions |
| frontend/test/sms-presets.mjs | 20 | preset detection |

**How the harness works:** `simulate.js` mocks SpreadsheetApp, CacheService, LockService, PropertiesService, UrlFetchApp and Utilities. It runs `Code.gs` inside a Node `vm` sandbox, and the part before `/* ---------------- scenario ---------------- */` is the reusable harness. Other test files `eval(harness + scenario)`.

**Conventions for new tests:**
- The harness already defines `eq`, `ok`, `call` and `sandbox`, so new tests use `same`, `truthy`, `Q` and `QF`.
- The scenario sits inside a template literal, so **escape backslashes twice**.
- Compare objects from the sandbox with JSON (cross-realm `deepEqual` fails).
- Set the clock with `CLOCK_OVERRIDE_`.

### 7.2 Mock API

`node backend/test/server.js` starts the whole backend in memory on port 8787, with `admin/admin123`. `GET /__fetchlog` shows what the mock SMS gateway was asked to send. **Never run test transactions against the live Google Sheet.**

### 7.3 End-to-end tests (Playwright, `frontend/test/shop.spec.js`, 21 tests)

**What they cover:**
- every screen loads;
- dashboard refresh;
- Bangla PDF/Excel and receipts;
- the 390px phone layout;
- product groups;
- the price manager;
- door hide/show;
- due-sale reminders;
- POS price history;
- dashboard stock and top products;
- purchase last price and average;
- the Advance Search card;
- the SMS preset box;
- the 3-card dashboard row;
- barcode labels;
- the phone app (safe areas, POS cards, back button, exit sheet);
- supplier invoice;
- working hours;
- the customer invoice link.

**Browser setting:** the repo config uses `channel: 'msedge'` (the owner's Windows PC). On Linux or CI, copy the config and replace that with `launchOptions: { executablePath: '<chromium path>' }`, then run `npx playwright test -c <copy>`. Delete the copy afterwards.

**What they do:** the tests start the mock API and `vite dev` on port 5178 themselves. They inject `erp_api_config` and `erp_token` into localStorage, and capture print HTML by hooking `HTMLIFrameElement.contentWindow.print`.

### 7.4 Live smoke test

`npm run verify:live` runs read-only checks against the real API.

---

## 8. Build, deploy, release

### 8.1 Website

Push to `main`. The `deploy.yml` workflow builds the app and force-pushes `dist` to the `gh-pages` branch. The site is live in about a minute; the owner presses **Ctrl+F5**.

### 8.2 Backend (Apps Script)

Do this every time `Code.gs` changes:

1. Open the Apps Script project and replace the whole `Code.gs` with the repo file. Tip: in the editor's browser console, fetch the raw file from GitHub at the commit SHA, then run `monaco.editor.getModels().find(m => m.uri.toString().endsWith('file_1.js')).setValue(src)`.
2. **Save**, then reload and check the saved text.
3. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy → Done.** Never create a *new deployment*, because that changes the URL.
4. Check it: `POST {"action":"ping"}` returns the new `version`.

You do not need to run `setupDatabase` again, because new columns and tabs are created on first use. Rollback means choosing an older version in Manage deployments.

### 8.3 App installers (ONLY when the owner asks)

1. Bump the version in **5 places**:
   - `frontend/package.json`;
   - `frontend/package-lock.json` (2 top entries);
   - `frontend/src-tauri/Cargo.toml`;
   - `frontend/src-tauri/tauri.conf.json`;
   - `backend/Code.gs` → `APP_VERSION`.
2. Commit, push and redeploy the backend.
3. Run the workflow manually: `gh api -X POST repos/CodeWithRoni/shop-erp/actions/workflows/release.yml/dispatches -f ref=main`. It creates the tag `v<version>` and the release with all 6 files.

Pushing tags from the AI session was blocked by the proxy. That is why the release is started through the workflow, which creates the tag itself.

---

## 9. History of the work (what was done and how)

### 9.1 v1.0.0 to v1.0.2 (Nov 5, 2026)

- **Starting point:** the initial ShopERP was built: Apps Script with Sheets, and React. It was renamed **Karvio**, given icons, and set up with builds for every platform.
- **Products and master data:**
  - separate product groups and categories;
  - master data cards with import/export;
  - the units list;
  - service items;
  - automatic product names.
- **Purchases:**
  - valuation snapshots so cancelling a purchase is exact;
  - the price manager (prices come from purchases);
  - the new-purchase flow: supplier first, serial chips.
- **POS:**
  - cost column;
  - live customer search;
  - SMS switch;
  - Clear cart;
  - PC builder compatibility.
- **Lists and documents:**
  - tick-to-export on every table;
  - full invoice and claim documents;
  - paged parties;
  - combined customer + supplier.
- **Dashboard:** receivable and payable, a live clock, automatic refresh.
- **Other:**
  - Bangla PDF pagination;
  - delete confirmations;
  - the "Cash" account name;
  - Advance Search (renamed from Item history).

### 9.2 v1.0.2 to v1.0.3 (Nov 5–6)

- **Settings:**
  - choose dashboard cards;
  - invoice template, paper and note;
  - shop tel/email/web/social;
  - custom paper width and height.
- **Invoices:** the Business A4 template, with grey colours forced on and the browser's header/footer suppressed.
- **POS:**
  - custom warranty days;
  - serial scan;
  - CASH for walk-in sales;
  - Complete & Print opens the print dialog directly;
  - the price history chips;
  - out-of-stock price lookup.
- **Dashboard:** period history cards and rows; aligned chart and leaderboard; 3 equal cards per row.
- **Side menu:** cards and the door button. A bug where the hidden menu left the page blank was fixed, with a regression test.
- **Dues and costing:**
  - next payment date and collection reminders;
  - stock summary and top products;
  - sales returns at the original cost;
  - serial average costing;
  - the purchase last-price and average display.
- **SMS:** MRAM presets and error codes; OneCodeSoft v3 preset with request headers; the preset box shows the provider in use, with only real providers in the list.
- **Barcode Labels** module.

### 9.3 v1.0.4 (Nov 6)

Phone app fixes:
- status bar and gesture bar overlap;
- the POS cart going off the screen (now cards);
- the Android back button closing the app (it now goes back, then asks with an animated "Exit Karvio?" sheet).

### 9.4 v1.0.5 (Nov 6)

- **Staff working hours.**
- **Supplier invoice no.** on purchases.
- **Customer invoice link** in the sale SMS: 15 days, then deleted; public invoice page with a PDF download; Customer link button.
- New text columns are kept as plain text.
- PDFs are about 40× smaller.

**Current deployed state:**
- Pages: the latest commit on `main`;
- Apps Script: version 28;
- releases: v1.0.3, v1.0.4 and v1.0.5.

---

## 10. Gotchas, limits, ideas

**Code and repository:**
- `backend/parts/` is **outdated**. Edit only `Code.gs`.
- Never run fixture or test sales against the live sheet. Use the mock server.
- **Sheet limits:** Apps Script and Sheets are fine for one shop. Every request reads whole tabs, cached per request. If a tab grows past roughly 50k rows, consider archiving old years.

**Dates and links:**
- The browser date can differ from the server date. Always use `shopDay()` and `serverToday`.
- Invoice links stop working exactly at expiry. Their rows are removed on the next open, link creation or the first save of the day.

**SMS:**
- Bangla SMS take 70 characters per part, and an invoice link adds about 66 characters. The SMS settings preview shows the part count.
- MRAM's IP whitelist (1016) is incompatible with Apps Script.

**Not yet tested on real hardware:** the iOS app (unsigned IPA, never run on a real iPhone), real thermal or label printers, and real SMS delivery of the invoice link.

**Permissions this AI session lacked:** the release-notes body could not be edited, and tags could not be pushed. GitHub GraphQL was blocked, so the REST API was used.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| Bakir Khata | customer dues book (receivable) |
| MFS | mobile financial services (bKash, Nagad, Rocket) |
| Walk-in / CASH | sale without a named customer |
| Product group / Category | two-level catalogue (e.g. PROCESSOR → INTEL) |
| Serial product | warranty tracked per serial number (`warranty_type = serial`); invoice-based warranty = keep the invoice |
| INV- / PUR- | sale invoice (prefix from setting `invoice_prefix`) / purchase invoice |
| SR- / PR- | sales return / purchase return |
| CP- / SP- / WC- | customer payment / supplier payment / warranty claim |
| Shop barcode | EAN-13 starting with 20 made by Karvio |
