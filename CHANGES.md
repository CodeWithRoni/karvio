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
