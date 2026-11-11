# Setup — Karvio 1.2.0

The complete current setup guide is [UPLOAD_GUIDE-বাংলা.md](UPLOAD_GUIDE-বাংলা.md).

The remaining fixes were approved for main publication and deployed as backend Version 42, building on main `b2cb6d7`. See FIXES-REVIEW.md and VERIFICATION.md. Build with `npm run build` (includes the asset check); generate or verify the transfer manifest with `node scripts/prepare-review.cjs` / `node scripts/prepare-review.cjs --check` from the repository root. Native installer publication is separate and has not been performed.

1. Back up your existing database yourself.
2. Replace the current Apps Script project Code.gs with backend/Code.gs; deploy a new version of the existing Web App. Do not reset the existing database or its administrator.
3. Update repository source files, or upload frontend/dist contents to static hosting.
4. Reload the app after publication. The upgrade does not reset user accounts or change passwords.
5. Override the API endpoint per device in Settings if needed.

Local web development: frontend → npm ci, npm test, npm run build, npm run dev.
Offline Electron: npm run desktop. Online Electron: npm run desktop:online.
Fresh standard installers use online mode. Existing offline shops retain offline mode and data; the login screen clearly labels the separate offline database. Explicit launch flags are `--online` and `--offline`. Portable offline builds use offline mode by default.
Do not mix offline and online data folders; there is no automatic sync.

Invoices created after this patch store their customer balance at issue time, independent of later collections or opening-balance edits. Legacy invoices without a saved balance show "Not recorded" instead of reconstructing an unreliable historical amount. The original invoice total and payment remain available.

POS drafts are isolated by user and API endpoint. Old shared `erp_pos_draft` data is left in browser storage but is not assigned automatically to any user. Review/export a legacy shared cart before clearing browser storage if it is still needed.

Repair parts are reserved while jobs remain open, including Completed/Failed jobs awaiting handover. Cancel a job or remove a part to release its reservation. Overbooked legacy jobs may need review before delivery. Cancelling a repair's invoice reopens the job as Completed and reserves the restored parts again.

Warranty replacements require a valid unexpired warranty. Stock replacements reduce net profit at cost until a vendor unit is restocked, when that cost is recovered in the restock period.
