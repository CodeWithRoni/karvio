# 20 November 2026 (2) — Wholesale prices, scrollbars, smoother menu

- POS: switching Retail ⇄ Wholesale re-prices every line in the cart. A product without a wholesale price shows "Price Not Set" (red) and the sale waits until a price is typed; quick picks show "Price Not Set" too.
- Karvio's own thin, rounded scrollbars in the theme colours everywhere (the side menu's bar shows only on hover).
- Side menu: one smooth slide between full and slim (64px). Icons never move — they already sit on the slim menu's centre line — names fade out first when closing and in last when opening. New round toggle with a chevron on the menu edge.
- Side menu (BikriPro technique): the menu is fixed on the left and its width animates (300ms ease-in-out) while the page's left padding animates with the same timing, so both move together; names fade and slide 8px left; round toggle half outside the menu edge with panel open / close icons that nudge on hover; in the slim menu a dark name tip appears beside the hovered icon. Branch shown as a plain row like Dashboard.
- Test: browser pos-wholesale.

# 20 November 2026 — Return / exchange with serial items

- Typing a return quantity for a serial item now ticks that many of its serials (the ones still with the customer); "All" / "Clear" pick every serial at once; the chips can still be changed by hand. Before, the serials stayed unticked, the server refused the exchange ("Select 3 serial number(s)…"), the dialog stayed open and no customer credit was made.
- The dialog says which serials are missing before saving, for returns and exchanges.
- Sale detail lists the serials still returnable on each line (serials_left), worked out from the active returns it already reads (no extra serial-table read on Supabase).
- Purchases list hides the old copy of an edited purchase (<number>-E1), like edited invoices.
- Tests: backend features-15 (exchange with surplus kept as credit), browser sale-exchange.

# 19 November 2026 (7) — POS cost peek, warranty chip, slim menu

- POS warranty: one chip per line — shield (green for a year or more, violet for less, grey for none), the period picker and INVOICED / SERIAL (no end-date text); the chip sits on its own line under the stock.
- Side menu: the hide button sits on the line between the menu and the page; it narrows the menu to icons (names on hover) with a sliding animation, and widens it back. Remembered per browser; phones keep the drawer.
- POS: the tick box beside "Cost" is gone. Each line shows "Show" under Cost; it opens that product's cost with "Hide" under it. Works the same on phones (COST label, then Show / Hide).

# 19 November 2026 (6) — Main Branch

- Side menu: the working branch shows as a "Working in <branch>" badge (Main tag for the Main Branch). Users who may work in any branch change it from a dropdown inside the badge; staff fixed to a branch see only its name.
- Adding the first branch turns the shop as it is today into the "Main Branch" (with all its stock and history) and adds the new branch beside it.
- The Main Branch is marked "Main", always listed first (menu picker, sign-in, reports) and cannot be closed; it can be renamed.
- Live shop: the existing branch "Showroom - 1" was renamed "Main Branch" (address and phone kept).

# 19 November 2026 (5) — Branch in the user form

- Sign-in screen: when branches are on, pick the branch to work in (list from Settings → Branches; the first is the main branch). Staff fixed to a branch can only sign in to their own branch.
- Branch transfer: with only one open branch, Send stock says to add the other branch in Settings → Branches instead of showing an empty list.
- Names and usernames are shown with a capital first letter (user list, menu, sales list, invoice and receipt "Served by"); new and edited user names are saved that way. Sign-in ignores capital letters in the username (as before).
- Users & roles: when branches are on, an admin chooses the branch (or Any branch) while adding or editing a user; the user list has a Branch column. Settings → Branches still assigns users too — both places change the same setting.
- Notes: the reminder date and time use the ERP calendar and time picker; the "Write your note" hint starts at the left.
- Dashboard: leaderboard, top sellers, low stock and sales below cost cards at one shorter fixed height.

# 19 November 2026 (4) — Notes editor, purchase edit, product form, layout

- Dashboard notes: a new editor with a title, a formatting toolbar (bold, italic, underline, strike, heading, lists, quote, link, clear, undo, redo), date, Open / Closed status, Normal / Important / Urgent priority and a reminder switch; Ctrl + Enter saves, Esc closes. Each note has Edit, Close / Open again and Delete (with a confirm). Only simple formatting is kept; older plain notes still work.
- Purchases: a yellow Edit button beside Cancel purchase. The purchase keeps its number, date and entry user; items, quantities, costs, serials, supplier warranty dates, supplier, supplier invoice, discount and payments can change. Stock, serials, payments and the supplier's due are corrected; the old version stays as <number>-E1 (cancelled). Same rules as cancelling: admin password, no return to the supplier, and its stock not yet sold, returned or adjusted.
- Purchase view: "Set supplier warranty" shows only on lines that have no supplier warranty yet.
- Add product: Product group, Category, Brand, SKU / model and Selling unit are required (red *) for a stock product, so a product can no longer be added with only its group name. Services, edits and imports are unchanged.
- Side menu names in Title Case; SMS settings and Courier settings cards are one fixed size.
- Tests: backend features-15, browser purchase-edit.

# 19 November 2026 (3) — Bug fixes from the full check

- An invoice cancelled from Sales also cancels its online order (no "courier paid" or return afterwards; old stuck orders show as cancelled).
- Editing an online order's invoice updates the order: products, delivery charge, discount, total and cash on delivery.
- Cancelling an invoice paid on an earlier day, or before the drawer's open shift began, books a refund today ("Cancelled invoices refunded") instead of erasing the old entry, so the shift, day close and day book match the cash handed back. Money taken today during the shift is voided as before. Invoice edit keeps the old behaviour.
- Branches: cancelling or editing an invoice from another branch keeps the stock and the invoice in the invoice's own branch.
- Messages point to the new places (Shift & day close → Day close, SMS gateway, SMS settings).
- Online orders refuse a product price of 0.
- Test: backend features-14.

# 19 November 2026 (2) — Sales below cost, notes, SMS settings, invoice edit

- **Sales below cost** on the dashboard (4th card in the leaderboard row; Today / 1 week / 1 month / 6 months) and in the Reports hub ("Sales below cost"): invoice lines sold for less than their cost after the invoice discount, with the loss. Needs the cost permission.
- **Notes** button left of Refresh: each user's own notes with a reminder date/time and colour; due reminders pop up on the dashboard with Done, 1 hour later, Tomorrow, New date, Edit and Dismiss.
- **SMS settings** tab after SMS gateway: one card per SMS (sale, due reminder, quotation, repair completed, repair technician, service technician, service done, daily summary, WhatsApp message) with its own switch, message and preview. SMS gateway keeps only the gateway (main switch, provider, keys, test, log). Every switch starts on, so nothing changes until turned off.
- **Invoice edit**: yellow Edit next to Cancel invoice (cancel permission + admin password). Items, quantities, prices, serials, discount, payments, customer and note can change; the invoice keeps its number, date and seller; stock, serials, money and the customer's due follow. The old version is kept cancelled as <number>-E1 (hidden from the sales list) and the activity log has before/after. Not for invoices with returns, warranty claims or repair/service jobs.
- Tests: backend features-13; browser dash-notes-edit; SMS, dashboard and online-order tests follow the changes.

# 19 November 2026 — Shift & day close, Day book, Stock count, Online orders, Branches

- **Shift & day close** (Money & Reports): open a shift with the counted drawer cash (notes and coins), close it by counting; expected = opening + money in − out of that drawer since opening (per cashier, or one shared shift per drawer — Settings → Shift). Short/over needs a note; the balance can be corrected. X-report / Z-report. "Open a shift before selling" locks the POS until a shift is open. Day close moved here as a tab (old links redirect).
- **Day book** (Money & Reports): every money entry of the chosen days, opening and closing balance per account, running balance, and the business of those days (sales, returns, purchases, expenses, collections, gross profit).
- **Stock count** (Stock): scan or type what is on the shelf; short / over / not counted; serial products show missing and unknown serials; one click fixes the stock (value into profit like a stock adjustment). Sales during the count are allowed. Past counts are kept and printable.
- **Online orders** (Sales): Facebook / website / phone orders → confirm (invoice, stock out, customer from the phone, advance into an account) → send with Steadfast, Pathao or RedX through their API, or any courier by hand → check status → courier paid (COD collected, courier charge as an expense) or parcel came back (full return to stock). Courier keys in Settings → Courier; staff never receive them. On Supabase the Edge gateway sends the courier request (courier.prepare / courier.finish run only inside it).
- **Branches**: Settings → Branches (first branch takes today's stock); users and accounts per branch; working-branch picker in the menu; every stock change lands in the working branch; serials sell only where they are; Branch transfer (on the way → take it in / cancel); Branch report with all branches side by side. Staff fixed to a branch see only its invoices, purchases, returns, expenses and accounts.
- Backups: online orders and branch data travel in both backup formats (migrations 20261119120000, 20261119150000); older backups still restore and keep today's orders and branch data.
- Tests: backend features-10, features-11, features-12, bounded-transfers; browser shifts, daybook, stock-count, online-orders, zzz-branches.

# 18 November 2026 — Side menu reorganised

- Menu cards, top to bottom: Home (Dashboard, Advanced search) · Sales (Point of sale, Sales & returns, Quotation, Customers, Collection) · Purchase (Purchases & returns, Suppliers, Payment) · Stock (Products & stock, Price manager, Barcode labels) · Service & Warranty (Repairs, Service, Warranty claims) · Party Ledger (Customer / Supplier Ledger Report, then Customer / Supplier Ledger Adjust) · Money & Reports (Cash, bank & MFS, Expenses, Profit, Reports hub) · Admin (Users & roles, Activity log, Settings).
- New cards Purchase (violet) and Service & Warranty (pink) have their own icons. Pages, Alt shortcuts and permissions are unchanged.
- Tests: shop.spec.js checks every card and its pages in order; party-ledger-adjustment.spec.js and ui-pro.spec.js follow the new cards.

# 18 November 2026 — Saved quotations in the database backup

- Download Backup now includes the saved quotations. Streamed backup (Supabase): an extra section "SavedQuotes" after the 29 business tables (migration 20261118052545_karvio_backup_saved_quotes.sql); the safety copy before a restore includes them too. JSON backup: `saved_quotes` rows with their own `quotes_checksum`.
- Restore puts back exactly the quotations in the file. A backup made before this change (no quotations in it) still restores, and today's saved quotations are kept instead of being cleared.
- Settings → Database shows "Saved quotes" with the other tables.
- Tests: bounded-transfers.mjs (streamed backup with quotations, older backup keeps them), features-9.mjs (JSON backup, edited file refused, older backup).

# 18 November 2026 — Quotation: CC Camera tab

- PC builder & quotes is now "Quotation" (menu and page title) with two tabs: PC builder (as before) and CC Camera. CC Camera rows, in order: DVR / NVR, Bullet Camera, Dome Camera, HDD (Hard Disk Drive), Monitor, Video Balun, Adapter, POE Switch, UTP Cable, Power/AC Cable, Junction Box, Camera Stand, Server Rack, Accessories, Wall Mount, Giga Switch, then "+ Add another part". Each row lists in-stock products whose name or category has its word (dvr/nvr/xvr, bullet, dome, hdd/hard disk, monitor, balun, adapter, poe, utp/cat6, power cable/ac cable, junction, stand, rack, accessor, wall mount, giga). The quote title starts as "CC Camera setup".
- Each tab keeps its own quote while switching. Saved quotes remember their tab and reopen in it. Print / PDF, Send to customer and Send to POS work the same for both.
- Customer name and phone (a mobile number, 01XXXXXXXXX) are required, marked with a red *, before a quotation is saved, printed or sent to the customer; the missing field turns red with a message. Send to POS does not need them (the customer is chosen at the POS).
- "Start over" is now a red "Clear" button with an icon; it asks first, then clears the parts, the customer and the notes of that tab (saved quotations stay).
- "Save quote" is now "Save quotation". Next to it, "See Saved Quotations" (with a count) opens every saved quotation: search by customer, phone or title, filter PC builder / CC Camera, who saved it, Open, Print or Delete (asks first). The saved list no longer sits under the form.
- Saved quotations are now kept on the server (private sheet __KarvioSavedQuotes; actions quotes.list, quote.save, quote.delete, POS permission): every user sees them on every device and they stay until someone deletes them. An opened quotation is updated in place with "Save changes". Quotations saved earlier in a browser are moved to the server the first time the page opens there. Note: database backups (Settings → Database) hold the business tables, not these saved quotations.
- Tests: backend/test/features-9.mjs (12 checks); pc-builder.spec.js (CC Camera rows, separate drafts, required customer, Clear, saved quotations window, update and delete); older quotation tests now fill in the customer and read saved quotations from the server.

# 18 November 2026 — Service jobs

- Service page (field work — CC camera installation, new internet connection …), replacing the empty placeholder.
  - Service list (admin only): the kinds of work with a usual charge; switch one off, or delete it while it has no jobs.
  - New service (admin / manager): saved or new customer (name, phone, address), service, work details, work address (filled from the customer), technician, service charge and the products the technician takes from stock (serial numbers picked for serial items). It starts Pending and the products stay reserved: they cannot be sold or taken for another job.
  - The technician gets an SMS with the job, the customer, phone number and address (Settings → SMS: "Service job message").
  - Technicians see only their own jobs and press Work done (with an optional note); an SMS goes to the numbers in Settings → SMS → "Service done SMS goes to" ("Service done message"). The dashboard shows "Service jobs done — complete & invoice".
  - Complete & invoice (admin / manager with POS): tick the serials used and type the quantity used; what came back goes back to stock. A normal sale invoice is made for the products used plus the service charge (discount, payment, due and next payment date as usual), and can be printed. Cancelling that invoice puts the job back to Work done.
  - Cancel service frees the products.
- New permission "Service jobs", on by default for managers and technicians (also in shops that saved their role settings before; later saves keep the admin's choice).
- Server: actions services.meta, services.list, service.get, service.save, service.status, service.complete, service.cancel, service.type.save, service.type.delete. Service jobs are kept in the Repairs table with numbers SRV-… and are not shown under Repairs.
- Tests: backend/test/features-8.mjs (40 checks); service-jobs.spec.js; repairs.cjs now expects technicians to have Service too.

# 17 November 2026 — Party Ledger Adjust and Ledger Report

- Customer Ledger Adjust / Supplier Ledger Adjust (admin only): Addition or Deduction on a customer's or supplier's ledger, with type, amount, date, optional invoice, reference no and a required reason. No money moves. Numbers CLA-… / SLA-…. A preview shows the balance (and the chosen invoice's due) before and after. Recent adjustments list with who saved them; Cancel needs the admin password (reverse types cadjust / sadjust).
  - Supplier Deduction = rebate (Invoice rebate, Target bonus, Price protection, Cash payment discount, Other rebate), received now or only promised; promised rebates are listed on the page with Mark received / Drop, and the dashboard reminder opens this page for admins. New rebates are numbered SLA-… (old ones keep RB-…).
  - Customer Deduction (leftover due written off, late discount, bad debt, other) cannot be more than the customer owes or the chosen invoice's due; "Whole invoice due" fills it in. It counts as "Customer dues written off" in the profit report, profit & loss and dashboard net profit. Additions only correct the balance.
  - An adjustment chosen for an invoice settles (or raises) that invoice's due first.
- Collection: Collect payment only collects now — "Pay to customer (return advance)" is gone. Old return-advance rows stay in the ledgers.
- Payment: Pay supplier only pays now — "Receive from supplier (refund)" and the rebate type are gone, and so are the promised rebates in the supplier's ledger window (all of it is under Supplier Ledger Adjust). Old refund and rebate rows stay in the ledgers.
- Customer Ledger Report / Supplier Ledger Report (admin only): with nobody chosen, every party in the period (opening, sales or purchases, paid + returns, adjusted, closing, oldest due); with one chosen, the full ledger in the app's style — each invoice with its items and serial numbers, the account money went through, adjustments with reason and who saved them, running balance, dues by age. Filters: period (today, this month, last month, this year, all time, custom), entry type, account, invoice / voucher no, items / serials / only invoices with due, hide zero balance, only overdue. Print and PDF give a paper statement with the shop header; Excel; WhatsApp sends the balance message.
- Names shortened: Party Ledger Adjust, Customer Ledger Adjust, Supplier Ledger Adjust (menu and page titles; the page addresses stay the same). Menu card titles always stay on one line.
- Server: actions adjust.options, adjust.list, ledger.adjust, ledger.report (all admin only).
- Tests: backend/test/features-7.mjs (41 checks); party-ledger-adjustment.spec.js; features-5.spec.js now records rebates on Supplier Ledger Adjust; two older tests search their table so rows from other tests cannot push them off the first page.

# 17 November 2026 — Party Ledger Adjustment menu card

- Side menu: a new card "Party Ledger Adjustment" above Money & Reports with two pages, Customer Ledger Adjustment (/customer-ledger-adjustment) and Supplier Ledger Adjustment (/supplier-ledger-adjustment). Admin only. The pages are placeholders ("Coming soon"); the adjustment itself is not built yet.
- Tests: party-ledger-adjustment.spec.js.

# 17 November 2026 — no full-screen flicker when a page opens for the first time

- Opening a page for the first time replaced the whole screen (menu included) with the loading placeholder for a moment, because the page's file was still being fetched. The placeholder now sits inside the content area only (Layout.jsx), the previous page stays until the new one is ready (`v7_startTransition` on the router), and after sign-in the page files are fetched quietly in the background (skipped when the browser's data-saver is on).
- Tests: page-open-no-flicker.spec.js (two browser tests; both fail on the old code).

# 17 November 2026 — three fixes (pending push)

- Pay supplier: switching the type to Rebate and back swapped one window for another and replayed the opening animation (a visible flicker). A window that replaces another now appears at once (Modal `instant`).
- Customers / Suppliers: Edit details opened the form with the profile window still on screen over it. The profile now closes while the form is open and returns after saving.
- Stock summary report (the dashboard's "Supplier warranty not set" tile opens it): clicking a product opens its purchase (the same window as on the Purchases page) so the supplier warranty can be set for any item of that invoice; when stock comes from several purchases a short list asks which one to open (needs the Purchases permission). Stock rows carry unset_lots.
- Tests: three more browser tests in features-6.spec.js.

# 17 November 2026 — Collection and Payment pages; purchase detail layout (pending push)

- Daily work has two new pages. Collection (/collection, Customers permission): customer dues, ledger, collecting payments, returning an advance, due reminders, statements. Payment (/payment, Suppliers permission): what we owe, ledger, paying suppliers, refunds, rebates and promised rebates. Both open on the people with a balance (tabs: With dues / Payable, Advance, All).
- Customers and Suppliers are now plain directories: name, phones, address, All / Inactive, add, edit, delete. No balance column, ledger or payment button; a profile window has "Open in Collection" / "Open in Payment". Menu labels are "Customers" and "Suppliers". Dashboard Receivable / Payable and the reminder links go to the new pages.
- Purchase detail: the item name has its own wide column and the serial numbers sit under the item in a short scrolling box with their count, so 100 serials no longer stretch the window.
- Collecting less than a customer owes asks for an optional next payment date for the rest. On that day a reminder for everything the customer still owes appears under Collection reminders on the dashboard (Collect / New date / Dismiss); the date also shows in the Collection list and ledger. A later collection with a new date moves it, one without a date or a full payment clears it. Kept in Settings 'customer_promises'; action customer.promise; customer.payment takes next_payment_date.
- Tests: backend/test/features-6.mjs (13 checks), frontend/test/features-6.spec.js (3 browser tests); older tests follow the new pages.

# 16 November 2026 — supplier rebates (pending push)

- Pay supplier has a third type, "Rebate / discount from supplier (no money moves)": it lowers what we owe, asks for no account, and never changes Cash, bank or MFS or any product cost. Kinds: invoice rebate, target bonus, price protection, cash payment discount, other. A reason is required; an optional purchase links the rebate to that invoice (shown on the purchase; its own due falls first). Ledger row type 'rebate', numbers RB-000001…; action supplier.rebate.
- Rebates count as other income: "Supplier rebates" in the Profit page, the profit timeline, Profit & loss ("Other income: supplier rebates") and the dashboard net profit.
- Promised rebates (not received yet) are only reminders (Settings 'rebates_pending'): listed on the supplier with Mark received / Drop, counted on the dashboard, shown in the report. Actions rebate.promise, rebate.promise.cancel, rebate.options.
- Reports hub → Supplier rebates: received and promised rebates with totals by supplier and by kind.
- Safety: every rebate, promise and drop is written to the activity log; a rebate is cancelled with Void (admin password and reason, reverse type 'rebate'); a purchase with a rebate cannot be cancelled until the rebate is voided.
- Tabs inside a form label were named after the whole label (slow-stock days); they now sit beside the label.
- Tests: backend/test/features-5.mjs (35 checks), frontend/test/features-5.spec.js (2 browser tests).

# 16 November 2026 — five features (pending push)

- Slow-moving stock (Reports hub, needs cost permission): products in stock with no sale for 30/60/90/180/365 days (never-sold ones count from the day they arrived), value at cost, last supplier, money tied up and its share of all stock. Report type slow_stock.
- Owner's money (Cash, bank & MFS → Owner's money): what the owner put in and took out (the existing deposit / withdraw entries, without Day close cash-count corrections), running net invested, period totals and the period's net profit. Action owner.money. The balance sheet splits equity into "Owner's money put in, less taken out" and "Profit kept in the shop and opening balances".
- Day close locks the day: after an account's day is closed, money dated that day cannot be added, changed or cancelled in that account (sales, payments, expenses, transfers, cancellations) until an admin reopens it with the admin password and a reason (dayclose.reopen; history keeps the count, marked reopened). Closed days live in Settings 'day_close_locks'; Settings → Close books has the switch 'day_close_lock' (on by default).
- Send on WhatsApp (sale detail and the POS "sale saved" window): opens WhatsApp for the customer's number with the invoice message and the customer link filled in — no WhatsApp API. Wording in Settings → SMS ('whatsapp_template'). The due reminder window has a per-customer WhatsApp link too.
- Devices & logins (Users & roles): devices signed in now with last activity, sign one or all others out (their next request is refused), and the login history with wrong-password attempts. Sign-in sends a device name. Kept in script properties (sessions, log) and the cache (failed attempts); actions sessions.list / sessions.revoke.
- Tests: backend/test/features-4.mjs (33 checks), frontend/test/features-4.spec.js (5 browser tests).

# 16 November 2026 — review fixes (pending push)

- Monthly expenses: a month that was never recorded no longer disappears when the next month starts. Up to 12 earlier months show as "Not recorded for Oct 2026" with their own Record button (date in that month or later; defaults to that month's due day unless the books are closed). They count in the "due" badge and on the dashboard. Each line keeps the months it was recorded for (done) and the month it started (since; older lists use the first save in the activity log). A paused line switched back on counts from that month. expense.recurring.record takes an optional month.
- Date fields: while typing, a date is applied only once it is whole (4-digit year or yyyy-mm-dd), so "1/1" on the way to "15/11/2026" no longer reloads lists; shorter forms (15/11, 15 Nov) are applied on leaving the field or with Enter (the first Enter applies the date, the next submits the form).
- Customers & dues: "Send due reminder (n)" counts only the ticked customers under the open tab — the same people the reminder window lists.
- Tests: features-3.mjs now 23 checks (missed months); features-3.spec.js adds 2 browser tests.

# 15 November 2026 — Bangladeshi number and date format, due reminder SMS (pending push)

- Lakh commas everywhere: the A4 business invoice (unit prices and line totals) now prints 1,25,000.00 instead of 125,000.00, like the rest of the app. Taka amounts in sale, repair and quotation SMS read 1,25,000 instead of 125000.
- Date fields: every date box (filters, expenses, purchases, day close, next payment date, books lock, supplier warranty…) shows "15 Nov 2026" whatever the computer's language, with the shop's own calendar (month arrows, Today, Yesterday, Clear; days outside the allowed range disabled). Typing works: 15/11/2026, 15-11-26, 15 Nov 2026, 2026-11-15; ↑ / ↓ move one day. New component DateInput (value stays yyyy-mm-dd).
- Customers & dues: tick customers and "Send due reminder" — one SMS each with {name}, {due}, {shop}, {shop_phone}; every customer's own message is previewed first; customers with nothing due or no phone are skipped; the wording used is kept for next time (setting sms_due_template). Needs the customers permission and the SMS gateway. New action customer.remind (at most 200 at a time; activity log "due_reminder").
- Tests: backend/test/features-3.mjs (11 checks), frontend/test/features-3.spec.js (3 browser tests); repairs.cjs, shop.spec.js and stock-summary.spec.js follow the new formats.

# 15 November 2026 — evening fixes (pending push)

- Invoice: the note now sits right under the QR code (business and other A4 templates) instead of a narrow column.
- Dashboard: the sales chart covers the last 30 days (every other day labelled, months named on the 1st). The Profit card adds "This month at a glance" (where sales went: cost of goods, expenses, net profit; gross and net margin, invoices, average invoice). Live balances lists accounts with money first and folds accounts holding Tk 0 into one line.
- Cash, bank & MFS: unused accounts (no transactions, no opening balance, not on any expense, return or monthly expense) can be deleted — tick rows and "Delete selected", or "Delete account" in the account's window. Accounts with history still can only be made inactive. New action account.delete (all or nothing).
- Shop logo: recommended size shown (wide about 600 × 200 px, or square at least 300 × 300 px; PNG with transparent background), shrunk to fit 480 × 160 px, previewed on white as it prints.

# 15 November 2026 — features 2 (pending push)

- Products from Excel (Products & stock → Import / Export): download a template, check the file first (new / update / problems per row; nothing saved), then import every row in one save. Rows match existing products by barcode, SKU or name; empty cells keep current values; missing product groups, categories and brands are created; stock is never imported. Export writes all products in the same layout.
- Price list (Products & stock → Price list): choose groups, categories and brands, retail and/or wholesale, warranty and stock columns; print, save as PDF (with the shop logo) or Excel.
- POS: Hold (F7) puts a sale aside and starts a fresh cart; "Held" lists up to 20 held sales on this computer to resume or remove. Stock is not reserved by a held sale.
- Admin → Activity log: who did what and when (sales, returns, cancellations, price and stock changes, settings, day close…), with date, staff, type and text filters (needs "Users & roles").
- Expenses → Monthly expenses: rent, salaries, bills set up once; each comes due on its day (1–28), is recorded with one click (amount and date editable) and shows on the dashboard's "Needs attention". Cancelling the recorded expense makes it due again.
- Supplier prices: Reports hub → Supplier prices (per product and supplier: times bought, last / lowest / average cost, cheapest marked; needs cost permission), and the new-purchase form shows the cheapest supplier's last price.
- Daily summary SMS to the owner (Settings → SMS): today's sales, profit, expenses, dues and cash to up to 3 numbers at a chosen evening hour, plus "Send now". On Supabase a pg_cron job (every 15 minutes, 17:00–23:45 Dhaka) calls the Edge function with a one-time code; migration 20261115120000_karvio_daily_summary adds pg_net, the code table and the endpoint record. The Edge function records its own address on start-up.
- Server actions: products.import.check, products.import, audit.list, expense.recurring, expense.recurring.save, expense.recurring.record, supplier.prices, summary.preview, summary.send, summary.tick (scheduler only).
- Tests: backend/test/features-2.mjs (35 checks), frontend/test/features-2.spec.js (6 browser tests).

# 15 November 2026 — professional look, day close and financial statements (pending push)

- Dashboard redesigned: Today / This month / All time overview (remembered per browser) with "vs yesterday" changes, a secondary figures row, a 14-day sales and profit chart, a "Needs attention" list, one History card with tabs (sales, returns, purchases, expenses, profits, receivable, payable), Profit beside Live balances, ranked leaderboard / best sellers / low stock with bars, and an "Inventory health" card. Every card can still be hidden in Settings → Dashboard. The big clock is now a small time next to the date. Collection reminders and repair results sit side by side.
- Menu: sentence-case labels ("Point of sale", "Advanced search"…), groups fold away (remembered per browser; the group of the open page always stays open), Alt shortcuts show on hover, focus or while Alt is held.
- Empty states with an icon, a line of help and buttons; tables show grey placeholder rows while loading; disabled buttons look plainly unavailable while saving buttons keep their colour.
- POS "Quick add" on an empty cart: best sellers of the last 60 days (own sales for staff without "View sales made by other staff"), recent products and favourites on this computer.
- New: Cash, bank & MFS → Day close: count notes and coins, compare with opening + the day's money in and out, a note is required for any difference, optional balance correction, Z-report printing and a list of previous closings (needs "Bank / MFS / cash accounts").
- New reports (need "See cost price & profit margins"): Profit & loss with the previous period for comparison, and Balance sheet (assets = liabilities + equity), with Excel / PDF / Print.
- Shop logo (Settings → Shop) on invoices, receipts, the menu and the sign-in screen; the sign-in screen shows the shop's name and logo after the first sign-in on that device. Invoices and receipts can print a QR code with the invoice number (Settings → Invoice), which the shop's scanner finds in Advanced search.
- Server actions: dayclose.get, dayclose.save, report.pnl, report.balance, pos.picks; dashboard adds yesterday's figures and repairs waiting for pickup. No database migration.
- Tests: backend/test/day-close-statements.mjs (31 checks), frontend/test/ui-pro.spec.js (7 browser tests); older tests updated for the new labels and layout.

# 15 November 2026 — second full review fixes (pending push)

- Purchase staff (Purchase permission without Suppliers) can refresh the supplier list again; they already got it at sign-in. Opening balances stay hidden.
- Supplier return: the dialog closes as soon as the return is saved, even if the list refresh after it fails, so it cannot be saved twice. Customer/supplier form refresh errors no longer surface as unhandled errors.
- A purchase without a supplier must be refunded in full when returned (an unrefunded part had no ledger to go to), same as a cash sales return.
- Quotation numbers use the date, time and two random digits (`Q-` + 14 digits); the old 7-digit clock suffix repeated every few hours.
- Barcodes and SKUs are unique together and ignore capital letters (a barcode can no longer equal another product's SKU). Only new or changed codes are checked, so older duplicates never block editing.
- New expenses need a category from the expense category list (as editing already did) and are saved with the list's spelling.
- Product-wise sales and Daily summary reports respect "View sales made by other staff", like the Sales report.
- Native browser confirm boxes (clear cart shortcut, delete product) replaced with the app's confirm dialog.
- Release workflow: business-rule, database and performance tests run once before any installer is built.
- Test: backend/test/review-fixes-2.mjs.

# 15 November 2026 — repository cleanup (pending push)

Removed files no build, deploy or test uses: the committed `frontend/dist` build (workflows build it), the Tauri wrapper (`frontend/src-tauri`, its scripts and `@tauri-apps/cli`), the retired offline desktop pieces and their tests (`data-folder.cjs`, `preload.cjs`, `offline*.cjs`, two unused UI checks, `supabase-sql.mjs`), Apps Script `appsscript.json`, old Google Sheets setup guides (`SETUP.md`, `UPLOAD_GUIDE-বাংলা.md`), old release notes 1.2.2/1.2.3, `docs/archive`, `docs/PRODUCTION-READINESS.md` and the hand-off checksum files (`SHA256SUMS.txt`, `RELEASE-MANIFEST.json`, `scripts/prepare-review.cjs`). The Code.gs test runner moved from `frontend/desktop/offline-runtime.cjs` to `backend/test/gs-runtime.cjs`. Everything remains in the git history.

# 15 November 2026 — review fixes (pending push)

- Request limits: requests without a session use their own buckets (sign-in 60/min, public invoice/quotation links 300/min, other 120/min) and never count against the shop's 900/min, so an anonymous flood cannot block signed-in counters. Migration karvio_request_limit_buckets; the one-argument function stays for the previous Edge build.
- Edge errors log their cause (type, database code and message; never payload or token) in the karvio_request line and console.
- The app retries `purchase.warranty` and `repair.seen` with the same request ID like every other write (test: write-actions.mjs).
- `constructor`, `toString` and other inherited names are "Unknown action" instead of an uncertain server error.
- Sale and purchase payment lines: negative or non-numeric amounts are refused (they were silently dropped); blank lines are still skipped.
- Docs brought up to date.
- Not changed: decimal rounding (round_), react-router major upgrade, signed Android release build (needs the owner's signing key).

# 15 November 2026 — database performance (published)

- Narrow reads: sales list, statements, sales-return list and reports read only the rows or tables they use (TABLE_HINTS / APPEND_HINTS generated by scripts/trace-table-hints.mjs; a read of anything not loaded re-runs the request with it, so answers cannot change).
- Reads no longer save (jsonb key order made every read look like a change).
- Private sheets (journal, request receipts, quotation links) stored as rows; the previous Edge build stays safe during deploy.
- Dashboard / report / profit answers reused until the shop changes (read cache).
- Saves that only add an AuditLog / ItemEvents / SmsLog row read only the last row position.
- Short random backoff when counters save at the same moment; one karvio_request log line per notable request.
- Settings → Database: simple Backup / Import cards; the nightly in-database snapshot was turned off.
- Migrations: table_scoped_reads, private_rows, read_cache, stop_daily_backup, private_table_grants (service_role grants missing in the first push made sign-in and every request fail for a few minutes after the deploy; fixed live, then recorded).
- Load test (20k sales): sales list 6.9 s → 0.19 s, customer statement 6.6 s → 4 ms, expense report 6.5 s → 0.12 s. Dashboard still about 6.5 s when not cached.

# 15 November 2026 — bounded reads and backup transfers

Common requests read relevant party/product history; read-only lists use SQL summaries. Private paged JSONL/gzip export and staged resumable restore add checksums, recovery copies and completion receipts. Supporting indexes and compact global row positions reduce memory use. See docs/BOUNDED-BACKUPS.md for tested limits and remaining work.

# Pending production-hardening patch

Owner authorized publication of this prepared patch; rollout completion is recorded by GitHub Actions. No native release. Details are in the git history.

The three UI state fixes were already published in 944cf5589ad7d3a76d06536dad55214d955f8f83. This pending patch is separate. Older changes are in the git history.
