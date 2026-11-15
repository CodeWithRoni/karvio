# Current state — 15 November 2026

Published: v1.2.5 (main b63d074). Pending, not pushed: branch ui-pro-1 — professional look, Day close, Profit & loss / Balance sheet, shop logo and invoice QR (first entry in CHANGES.md).

Day close records live in AuditLog (action 'day_close', JSON detail) so no table or migration was needed; a counted difference is booked as an ordinary 'manual' deposit/withdrawal. The shop logo is a small data URL in Settings (shop_logo, max ~200 KB, validated server-side). The QR code library is vendored (frontend/src/lib/vendor/qrcode.mjs, MIT) because npm install is blocked locally by the xlsx CDN.

Rules from the owner: reply in Bangla; change nothing without permission; push or deploy only when the owner says so. Deploy order (deploy.yml): tests → migrations → Edge function → Pages. Every new database function must keep working with the previous Edge build for that minute. Tests call the database as service_role (backend/test/pg-harness.mjs), so missing grants fail in tests.

After changing which tables an action uses, run `node scripts/trace-table-hints.mjs` (regenerates TABLE_HINTS / APPEND_HINTS / PRIVATE_HINTS). After editing backend/Code.gs, run `node scripts/generate-supabase.cjs` (restore supabase/functions/karvio-api/release.mjs afterwards; CI stamps it).

Known remaining work: dashboard whole-history computation (SQL port), global write lock, signed Android release build, react-router upgrade, decimal rounding in round_. Off-site Google Drive backup is ready on branch offsite-backup-later.

# Current publication — bounded reads and backups

Owner authorized push on 15 November 2026. Baseline main 4d1bd6a264dc3f8ea4e7869c352285c3147bcac4 / Edge v59. Two migrations add private transfer staging/worker/cleanup and compact request-scoped snapshots/indexes. Existing business rows are not rewritten during migration. Backend-first CI applies migrations and verifies exact Edge build before Pages publication.

See docs/BOUNDED-BACKUPS.md and VERIFICATION.md. Scope/global-lock/report limitations remain explicit. No native release or Google Drive automation. One-time approved Drive backup exists from the previous task. Never publish verification/ user databases or credentials.
