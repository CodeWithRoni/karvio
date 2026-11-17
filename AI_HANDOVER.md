# Current state — 15 November 2026

Published: v1.2.6 (main, tag v1.2.6) with everything in CHANGES.md through the Quotation CC Camera tab. Release notes: RELEASE-1.2.6.md.

Date boxes use components/DateInput.jsx (text field + portal calendar; value yyyy-mm-dd; onChange gets {target:{value}}) — do not add new <input type="date">. Due reminder SMS: action customer.remind, template in Settings 'sms_due_template'. SMS amounts go through smsAmt_ (lakh commas).

Day lock: acctTxn_ and voidRefs_('AccountTxns') call dayLockCheck_ (Settings 'day_close_locks' {account id: [dates]}, rebuilt by dayLocksRebuild_ after every close / reopen). Sessions: script properties 'karvio_sessions' and 'karvio_login_log'; failed logins in cache 'karvio_login_fails' because a failed request rolls properties back. Owner's money = ref_type 'manual' entries except Day close cash-count corrections (isCashCount_).

Service jobs (pages/Service.jsx, section 10c of Code.gs) live in the Repairs table with job_no 'SRV-…' (isServiceJob_): device = service type name, serial = type id, problem = work details, accessories = work address; statuses Pending / Work done / Completed / Cancelled; repairOpen_ handles both kinds so reservations work for both; repair actions and lists skip service rows. Service types: Settings 'service_types'. Role settings now save 'known' (list of permissions); PERMS_ADDED_LATER get their defaults in shops that saved roles before. Party Ledger Adjust (admin only, pages/LedgerAdjustment.jsx, LedgerReport.jsx, lib/ledgerDocs.js): ledgerAdjust_ writes type 'adjust' rows (ref_id = invoice id or a fresh id, note '<Type label> — <reason> · Ref: <ref>', see ADJUST_TYPES) except supplier deductions, which go through supplierRebate_ (type 'rebate', SLA- numbers). Customer 'adjust' credits are write-offs: net profit subtracts writeoffTotal_. saleOpenDues_ / purchaseOpenDues_ apply an adjustment to its own invoice first. ledgerReport_ serves both report pages. Supplier rebates: SupplierLedger rows of type 'rebate' (debit = amount, ref_id = linked purchase id or a fresh id, note = '<Kind label> — <reason>', see REBATE_KINDS); net profit everywhere adds rebateTotal_(from, to); promised ones wait in Settings 'rebates_pending'. Do not wrap <Tabs> in <Field> (a label names its first button after the whole label).

components/PartyPage.jsx has two modes: "directory" (pages Customers, Suppliers: no money) and "money" (pages Collection, Payment: balances, ledger, payments, reminders; Pay supplier has only the pay type, Collect payment only the collect type). Link to dues with /collection/:id and /payment/:id.

Monthly expense templates live in Settings 'recurring_expenses' (JSON; each keeps done {YYYY-MM: expense id} and since; status lists missed months up to 12 back); the daily summary's last send date in 'daily_summary_last'.

Day close records live in AuditLog (action 'day_close', JSON detail) so no table or migration was needed; a counted difference is booked as an ordinary 'manual' deposit/withdrawal. The shop logo is a small data URL in Settings (shop_logo, max ~200 KB, validated server-side). The QR code library is vendored (frontend/src/lib/vendor/qrcode.mjs, MIT) because npm install is blocked locally by the xlsx CDN.

Rules from the owner: reply in Bangla; change nothing without permission; push or deploy only when the owner says so. Deploy order (deploy.yml): tests → migrations → Edge function → Pages. Every new database function must keep working with the previous Edge build for that minute. Tests call the database as service_role (backend/test/pg-harness.mjs), so missing grants fail in tests.

After changing which tables an action uses, run `node scripts/trace-table-hints.mjs` (regenerates TABLE_HINTS / APPEND_HINTS / PRIVATE_HINTS). After editing backend/Code.gs, run `node scripts/generate-supabase.cjs` (restore supabase/functions/karvio-api/release.mjs afterwards; CI stamps it).

Known remaining work: dashboard whole-history computation (SQL port), global write lock, signed Android release build, react-router upgrade, decimal rounding in round_. Off-site Google Drive backup is ready on branch offsite-backup-later.

# Current publication — bounded reads and backups

Owner authorized push on 15 November 2026. Baseline main 4d1bd6a264dc3f8ea4e7869c352285c3147bcac4 / Edge v59. Two migrations add private transfer staging/worker/cleanup and compact request-scoped snapshots/indexes. Existing business rows are not rewritten during migration. Backend-first CI applies migrations and verifies exact Edge build before Pages publication.

See docs/BOUNDED-BACKUPS.md and VERIFICATION.md. Scope/global-lock/report limitations remain explicit. No native release or Google Drive automation. One-time approved Drive backup exists from the previous task. Never publish verification/ user databases or credentials.
