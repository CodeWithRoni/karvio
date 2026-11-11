# Karvio fresh Supabase backend — 11 November 2026

## Owner-approved production release

The owner approved main publication and live deployment of all collected changes. Edge `karvio-api` version 5 is deployed, including the shop date required by the repair dashboard. The first owner account was created by the user; its credentials and all business data are preserved. The frontend's built-in endpoint is Supabase. Historical setup/pending notes below describe earlier stages.

All four local migration versions now match the hosted migration history, avoiding replay of already-created tables when the GitHub integration deploys main. PostgreSQL pg_cron runs a private safety snapshot daily at 02:00 Dhaka with 30-day default retention. The first snapshot was created and verified; Settings → Database can disable it or change retention. Private in-project snapshots also exist before restore/reset. These snapshots live in the same project; keep downloaded exports outside the project as well. No legacy Google Sheet data was imported or reset.

Publication validation: 1,343 regular assertions and 63 Supabase adapter checks passed; all 54 browser cases passed together. Production build/assets passed. Security advisor has no WARN/ERROR findings, only intentional deny-all RLS INFO findings. No real SMS or test sale was sent to the shop.

Project: `svqhlotlzgmwjneuphpe`, **Karvio's Org**, Singapore. GearGrid and the current Apps Script shop were not changed.

API: `https://svqhlotlzgmwjneuphpe.supabase.co/functions/v1/karvio-api`

## First owner

The database has no old records, sample products, brands, categories or default admin password. The private owner-setup page is outside this repository. Open that local page and choose your name and a password of at least 12 characters. The username is `admin`. Do not send the password in chat or commit the setup page. The one-time setup key is invalidated by the same transaction that creates the owner.

Once initialized, connect the ERP using **Change API connection** and the API address above. This release defaults the frontend to Supabase. The initial-owner wizard is shown only when connected to a fresh uninitialized Supabase endpoint. Cash, the base Pieces unit and editable shop settings are initialized; optional Feet/Meter units and warranty periods are not seeded; business master data and transactions remain empty.

## Storage and authorization

29 named PostgreSQL business tables follow `backend/Code.gs`. `Categories.parent_id` represents groups/categories; shop details remain in Settings. Numeric and boolean fields keep their types. Dates and JSON-bearing columns retain their original text representation for ERP/backup compatibility. `_position` preserves stable row addresses used by the existing engine. Referential/business validation remains in the existing ERP rules rather than new foreign keys that could break reset/restore or optional references.

Every table has RLS enabled. Browser roles have no table or storage-RPC grants and no permissive policies. The security advisor's informational **RLS Enabled No Policy** notices are intentional denial of direct client access. The gateway retains Karvio's username/password roles, work-hour restrictions, permission checks and credential-bound sessions. It does not create Supabase Auth accounts. PBKDF2-SHA256 uses 600,000 iterations; server credentials remain in Supabase's injected Edge environment. Never put service-role keys in the frontend.

`karvio_private` contains runtime metadata, durable receipt sheets/sessions, safety backups, rate-limit counters and the SMS outbox. RPCs run as SECURITY INVOKER and are service-role-only. The optional Supabase automatic-RLS event trigger's public EXECUTE grants were revoked after the security advisor reported them.

## Transaction and capacity limits

This compatibility implementation runs the tested ERP rules against a consistent PostgreSQL snapshot, then commits changed tables plus receipts and sessions in one database transaction. A global revision rejects stale writes and retries computation. Business failures discard staged changes. A lost commit reply is uncertain and must retain the original request ID; never create a new money request to work around that error.

For compatibility, requests currently load all business tables; changed tables are replaced transactionally. This is a correctness-first bridge for the fresh shop, not a tested high-volume SQL-native implementation. Large histories and many simultaneous counters require load testing and incremental SQL storage before claiming production capacity. Request bodies are limited to 8 MB, and the gateway applies a 180-request/minute IP bucket plus existing username login throttling. Manual SQL/table-editor writes bypass the gateway's revision protocol and must not be made during shop operation.

## Backups and SMS

Database export/restore/reset use the existing ERP format. Before reset/restore, an additional private SQL safety snapshot is saved atomically. Daily backups now use private Supabase snapshots rather than Google Drive. A fixed pg_cron job runs at 02:00 Dhaka and reads the owner-configured enabled/retention settings. Download regular exports outside the project too. No migration of old accounts/password formats is promised: this project deliberately starts fresh.

SMS jobs are committed with the business transaction, then claimed once by the Edge background worker. Logs distinguish queued/sent/failed/unknown. A claimed message with a lost reply is never automatically resent. A crash before claiming leaves it queued until another successful request dispatches the worker. The SMS gateway must use public HTTPS without redirects. Real provider delivery has not been tested or enabled; no real SMS was sent during verification.

## Recorded checks

Owner-setup follow-up: the first real browser setup was blocked by PostgREST's safeupdate rule because the table replacement DELETE had no WHERE clause. No owner/business rows committed. Migration `karvio_scoped_table_replacement` now scopes deletion to valid ERP `_position >= 2` rows without disabling safeupdate. The hosted transaction test checks the installed function's row scope; the actual protected-library LOAD is restricted by Supabase and is not used by this test. User retry of the original setup page is required to confirm first-owner creation through HTTP. The earlier SQL-console test did not reproduce the HTTP session's loaded safeupdate module.

- Existing ERP regression suite: 1,324 assertions passed.
- Supabase compatibility suite: see `npm run test:supabase` for current assertion count; covers setup, session reconstruction, master data, purchases, sales, stock, returns, stale-revision retry, request replay, failed-write rollback, SMS queue/worker and restore.
- Hosted PostgreSQL transaction test passed: first-owner creation/key consumption, stale revision rejection, invalid typed-row rollback and rate limit. The test transaction was rolled back; no fixture shop data remains.
- Existing 48 browser cases passed; new owner-wizard browser case passed separately (49 distinct cases).
- Production frontend build and asset validation passed. This local build has not replaced the public site.
- Hosted API ping passed and returned `backend:supabase`, `requiresSetup:true`.
- Hosted security advisor: no warning/error findings; 33 intentional informational deny-all RLS notices.

## Rebuilding

`backend/Code.gs` remains the authoritative business-rule source. After any change, run `node scripts/generate-supabase.cjs`, `npm run test:supabase` in frontend, the regular ERP/browser suites and rebuild. The generated static engine uses no eval/vm in Edge. Do not hand-edit engine.mjs. Applied SQL migration files are historical: after initial provisioning, create a new migration with the Supabase CLI for subsequent schema changes rather than editing/reapplying the initial migration. Deploy all relative function modules together. Setup tokens, local owner pages, service keys and private exports must remain outside source control.
