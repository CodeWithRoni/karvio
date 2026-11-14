# Current publication — bounded reads and backups

Owner authorized push on 15 November 2026. Baseline main 4d1bd6a264dc3f8ea4e7869c352285c3147bcac4 / Edge v59. Two migrations add private transfer staging/worker/cleanup and compact request-scoped snapshots/indexes. Existing business rows are not rewritten during migration. Backend-first CI applies migrations and verifies exact Edge build before Pages publication.

See docs/BOUNDED-BACKUPS.md and VERIFICATION.md. Scope/global-lock/report limitations remain explicit. No native release or Google Drive automation. One-time approved Drive backup exists from the previous task. Never publish verification/ user databases or credentials.
