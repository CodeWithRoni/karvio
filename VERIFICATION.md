# Karvio 1.2.0 — local patch verification

## Fresh Supabase backend — current follow-up

Owner-approved publication: Edge karvio-api version 5 deployed; public ping reports backend=supabase and requiresSetup=false. Local migration filenames match all four hosted versions. Added a private pg_cron daily snapshot at 02:00 Dhaka, default 30-day retention, configurable from Database settings. Ran one snapshot successfully; verified active schedule, snapshot count and unchanged owner/sales counts (1/0). Hosted security advisor has no WARN/ERROR findings. Final local regular suite passed 1,343 assertions; Supabase suite passed 63; final complete Edge suite passed all 54 together (1.0 minute), after sidebar and backup UI updates. Production build/assets passed. Main push and GitHub Pages pipeline are authorized; no production financial test data or SMS was created.

Sidebar icon review (local only): replaced all five group dots with semantic native SVG section icons and added a matching outline icon to every module link, including Repairs and the new Service placeholder. One consistent stroke family supports current-color active/hover accents, slight hover feedback and reduced-motion preference; icons are decorative and hidden from accessibility names so existing labels/shortcuts remain usable. No icon package, remote font or network dependency added. Build/assets passed. Four existing browser checks passed for all module routes, mobile fit, menu hide/show and Advance Search placement. The all-routes check was expanded to include Repairs and Service and passed separately; desktop screenshot reviewed. No deployment/push performed. The last full 54-case pass predates this visual change; only these relevant navigation checks were repeated.

Input wheel review (local only): added an App-level passive capture listener covering focused number/range/date/time/datetime-local/month/week inputs and closed select controls, including lazy pages and modal portals. Wheel stepping is stopped by blurring the focused stepped control before its default action, without cancelling the wheel event; text/textarea focus and scroll propagation remain normal. Existing per-field noWheel handlers remain. New real mouse-wheel tests passed for the reported custom warranty days, low-stock input, dynamically inserted native controls (without local handlers), dropdown keyboard changes, decimal typing and scrolling while a text field keeps focus. No business data migration or deployment was performed. Frontend build/asset verification passed.

Latest complete Edge run: all 54 browser cases passed together (1.0 minute), including the two new global wheel regressions, existing POS quantity wheel check and corrected collection-reminder selectors. Initial new tests needed accessible-label/heading selector corrections; no workaround changed the input values being tested. Source inventory found no other wheel-based increment/decrement handlers. These results supersede earlier grouped browser counts below.

Repair dashboard review (local only): Repairs opens eight received-date cards: Today, This week, This Month, Last Month, Last 3 Months, Last 6 Months, This Year, Last Year. Each shows current Received/Pending, Completed/Complete and Failed counts. Card title/footer opens all jobs for that period, while clicking a count applies that status; row click opens the existing job details. Clock and main-dashboard period controls are not included. Week starts Saturday, rolling 3/6 calendar months include the current month, and server shop date is supplied by the new `repairs.meta.today` field. Delivered/Cancelled remain in period lists but do not inflate the three current-status counts. Lists and counts auto-refresh and year/leap-month boundaries are covered by 15 new assertions. Deploy the regenerated backend before this frontend when publication is approved; this repair change has not been deployed.

Repair validation: regular ERP suite passed 1,343 checks; Supabase compatibility passed 55. Focused repair/access/delivery/cancel browser run passed 10/10. Full 52-case run passed 51; its remaining collection-reminder test used a selector shared with repair alerts and was scoped to the named Collection reminders region. Both the new repair dashboard test and that corrected reminder test then passed together (2/2), including coexistence of a completed-repair alert. Thus 52 distinct browser cases have passing results, grouped across runs. Build/import/font/icon checks passed. Reviewed the desktop preview image and verified mobile width. No real job/customer/account data was written.

SMS settings review (local only; owner asked to wait before live publication): removed both MRAM preset options; retained OneCodeSoft, BulkSMSBD, Generic JSON POST and Generic form POST. Saved legacy/custom configurations are not silently erased. Added guided request-field mapping for simple JSON/form payloads, masked/revealable API key, expandable advanced method/body/headers, HTTPS/placeholder/JSON validation, unsaved-change guard for test sends, phone validation, sale/repair/technician preview and refreshed delivery logs. A queued test result is shown as queued rather than "sent". Structured/numeric JSON bodies remain in advanced editing instead of being silently converted. Test uses an intercepted SMS response; no real provider was contacted. Regular suite passed (1,328 reported checks, including 14 preset and 10 mapping checks); all 51 Edge browser cases passed in 57.3 seconds, including custom mapping persistence, queued result and mobile overflow. Production build/assets passed. This SMS change was not pushed or deployed.

Master-list selection follow-up: added per-item/select-all-shown checkboxes to all five master panels. Export uses marked records when selected; with none marked, existing export-all behavior remains. Bulk delete uses one products-permission, idempotent transaction (1–200 IDs); an in-use item rejects the entire batch. Export/import/demo and rename/delete use icons with accessible names/tooltips. Built-in frontend API now points to Karvio Supabase; explicitly saved per-device endpoints still take precedence. Supabase Edge version 4 deployed for the new bulk action. Local frontend publication is pending owner review. Existing 1,324 assertions plus 55 Supabase assertions passed; all 50 browser cases passed together in 55.0 seconds. Build/assets passed after responsive header wrapping.

Fresh-default follow-up: owner requested removal of all seven seeded warranty periods and optional Feet/Meter selling units (Pieces was not marked). Confirmed no products/sale items/purchase items referenced them, saved a private safety snapshot, removed only matching seeded records under the runtime lock and advanced revision. The Supabase-only engine no longer seeds warranty periods and uses only the base Pieces unit on setup/reset; bootstrap also cannot repopulate Feet/Meter. Adapter suite now passes 50 checks, including four fresh-default checks. Edge version 3 deployed. Existing owner account and credentials were preserved.

Owner-setup correction: the first real HTTP setup failed with `DELETE requires a WHERE clause`; no account was created (Users=0/revision=0). The compatibility commit now deletes only valid `_position >= 2` rows, leaving Supabase safeupdate enabled. Added an installed-function row-scope regression to the hosted transaction fixture. The prior SQL-console test did not reproduce PostgREST's loaded safeupdate module. Loading that protected library from the console was denied, so no claim is made that the console test is an HTTP-equivalent test. Actual owner setup remains a user-password handoff.

11 November 2026: the separate Karvio project has 29 business tables and four private tables, with RLS and service-role-only storage RPCs. Edge `karvio-api` version 2 is deployed; public ping passed. Hosted SQL initialization/CAS/typed-row rollback/rate-limit checks passed inside a rolled-back transaction. Final read: Users=0, Products=0, Sales=0, revision=0, one-time owner setup ready. No old data or known default password was inserted. Security advisors have no WARN/ERROR findings; 33 informational no-policy RLS notices reflect intentional direct-client denial. See SUPABASE-SETUP.md for implementation limits, including full-snapshot capacity and unavailable Google Drive scheduling.

The existing 1,324 assertions passed again; 46 additional Supabase adapter assertions passed. Existing 48 Edge browser cases passed together in 53.7 seconds; the new setup-wizard case passed separately. Frontend build/import/font/icon validation passed. A restricted temporary-file rename initially blocked the offline tests; the full suite then passed with permission to use its disposable temporary database. Real customer data, real SMS delivery, production load and post-owner end-to-end hosted money flows have not been exercised. The main website has not been switched, and no GitHub push was made for this follow-up.

Earlier verification notes below describe the already deployed Apps Script release.

Date: 11 November 2026 (Asia/Dhaka). Remaining-fixes base: main `b2cb6d790fe8492cf477f0bf9f382f56d61dcfb6`. The owner approved main publication and Apps Script deployment. Backend Version 42 was successfully deployed on 11 November 2026 to the existing Web App URL; saved code matched the tested source. The append-only invoice snapshot column is initialized by normal schema handling, without a reset/setup run. No production transaction or historical balance rewrite was performed. Earlier publication notes below describe prior stages. The original 1.0.6 record remains in VERIFICATION-1.0.6.md.

## Recorded results

Latest remaining-fixes review adds 51 isolated assertions, plus a browser test for preserving quote warranty and confirming cart replacement. The actual Electron offline UI passed restart persistence, stock/accounts, Bengali PDF, backup/restore and zero internet requests. A fresh standard Electron start passed online-mode/sign-in/no-offline-database checks. Windows Electron was exercised; newly packaged Windows/macOS/Linux installers have not been built or published in this review.

Final current run: `npm test` passed all 1,324 assertions; the complete 48-case Edge browser suite passed together in 57.0 seconds. Production frontend build and entry/import/font/icon validation passed. Transfer inventory/checksums were regenerated and verified. No local test used the shop's actual database.

Regressions include reserved quantities/serials, blocked writes rolling back without a stray invoice, own-job delivery, reversal/reopening/re-reservation, reservation release, empty count rejection, normalized duplicate phones/serials, stable invoice snapshots, legacy snapshot-column backup restore preserving an invoice, warranty cost loss/recovery, expired claim rejection, per-sale quote warranty, draft isolation, shop-day print output and desktop mode selection. Legacy invoices without stored balances explicitly show "Not recorded".

Publication follow-up: the first combined CI run passed 46/47 browser cases. A pre-existing repair test assumed there was exactly one technician; the new permission test legitimately added another. The repair dropdown test now compares all options against all active Technician-role users, preserving its role-filter check. The audit and repair files passed together (9/9 locally). The public production health check also passed (`Live Karvio API verified: 1.2.0`); it performs no business writes.

Current five-fix follow-up: `npm test` passed (1,273 assertions including 39 new financial regressions). The existing 45 Edge browser tests passed in 54.0 seconds. The updated audit browser file then passed all five tests, including two new tests, for 47 distinct passing browser cases. `npm run build` and its asset validation passed. Tests used mocked Google services and disposable local databases; no production transactions were performed. The first restricted browser-server attempt was stopped, then the local browser suite completed successfully with the required process permissions.

New cases cover backdated supplier balances, exact discounted line/partial-return refunds, technician price/delivery denials without stock changes, authorized repair delivery, spent-advance refund rejection without cash/job mutation, safe cancellation, valid refunds and duplicate-cancel rejection, and partial/full subsequent payments through the same public link. These changes do not correct historical records automatically.

```json
{
  "automatedChecks": 1406,
  "supabaseAdapterChecks": 63,
  "hostedSqlTransactionTest": "passed; rolled back; no shop test records retained",
  "browserTests": 54,
  "browserRunGrouping": "all 54 together",
  "supabaseBackend": "deployed; owner password setup pending; current live frontend unchanged",
  "browser": "Microsoft Edge",
  "frontendBuild": "passed",
  "buildAssets": "passed",
  "dependencyAdvisories": { "high": 1, "moderate": 9, "majorUpgrades": "deferred per owner constraint" },
  "nativeInstallers": "not packaged; Electron online and offline source-app smoke checks passed",
  "productionDataAccess": false
}
```

- `npm test`: all original 1,172 reported checks plus 62 new checks passed. These are assertion counts, not 1,234 independent end-to-end tests. New backend checks: 34; legacy offline restore: 3; client recovery/invoice display: 25.
- `npm run test:e2e`: 45 browser tests passed (the existing 42 plus three new tests). Edge run took 51.2 seconds. Added checks cover blocked dev editor launch, real-page reload after lost sale acknowledgements, and advance-paid public invoices.
- `npm run build`: successful; the built entry, local JS/CSS imports, fonts and manifest icons passed the new asset validator. The regenerated dist is included in the local package.
- Both GitHub workflow YAML files parse successfully. Chromium selection is supported for CI; the CI jobs themselves have not been executed remotely.
- Local checks used Node.js v26.13.0, npm 11.20.0, temporary data directories and isolated mocked Google services. CI remains configured for Node.js 22.

## New failure cases verified

- A valid restore fails while writing, then every previous business table and request receipt is restored.
- A larger restore appends rows before failing; recovery also removes those appended rows.
- A reset fails while re-creating defaults and the old shop records are restored.
- A storage outage interrupts both maintenance and rollback. Reads remain blocked; a fresh execution recovers the full prior database before authentication/read.
- A COMMITTED write succeeds but its acknowledgement is lost. The complete restored database remains committed.
- A lost sale acknowledgement survives page reload and session renewal with one invoice and the original request ID.
- A write is blocked before transmission if its pending ID cannot be stored. Failed local confirmation cleanup is finished by replay without another charge.
- An uncertain request is not replayed after the safe receipt lifetime or against an unsupported old backend.
- Linked supplier/customer permissions, other-staff price history, nested warranty response costs, opening-debt reminders, 1,001 expenses and 501 return/report boundaries are checked.
- Public and business invoice renderers show 100 paid for a total of 100 comprising cash 80 and advance 20.
- Offline backup restore migrates missing Repairs/Units/InvoiceLinks and preserves the product across a restart.

## Scope and remaining limits

No push, remote release, deployment, production login, business-data access, real SMS or production database modification took place. No actual user's offline data directory was used. Native installers, Electron GUI, mobile devices, physical printers, real Google Sheets quotas/formula execution and cloud-trigger behavior were not tested as real-device/production runs.

Dependency majors remain unchanged as requested. Current npm audit still flags 10 package entries (1 high and 9 moderate, including indirect overlap). Disabling Vite editor launch, loopback binding and CORS restrictions are limited local-development mitigations; the advisories are not claimed fully resolved. Authentication migration and other major architectural changes are deferred.

## Transfer integrity

From the repository root, run `node scripts/prepare-review.cjs`, then `node scripts/prepare-review.cjs --check`. The manifest records this local file set and these verification results. SHA256SUMS.txt covers every listed payload file except itself, including the manifest. Legacy backend/parts, dependencies, test outputs, credentials and user databases/backups are excluded from the transfer package.

Approval is required before any upload. Deploy the authoritative backend first, then frontend. Pushing main triggers Pages publication, so it must not be treated as a harmless staging step.
