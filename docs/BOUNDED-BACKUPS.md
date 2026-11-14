# Bounded reads and backup transfers (local, not deployed)

The common checkout, purchase, document-detail and party-payment paths now select their relevant products and party history. Read-only bootstrap/list requests use SQL balances, history flags and repair reservation summaries. Compact row arrays retain global positions separately, including sparse historical tables. Financial writes retain the revision check and atomic delta commit. Supporting indexes cover party history, serial lookup and account transactions.

New owner-only backup transfers export a consistent row copy in small pages with SHA-256 verification. The browser writes JSONL, normally gzip-compressed (.karvio.gz). A supported browser can save directly to disk; the ordinary download retains the compressed file in memory. Existing small JSON backups remain supported.

Restore stages bounded pages separately from live tables and resumes uploads using a private receipt. Only a complete, validated hash chain can be queued. The background SQL worker validates types, row counts, owner credentials and references, makes a private recovery copy, then replaces business data atomically. Failed validation leaves original data unchanged. The receipt also retrieves completion after a lost response or session invalidation, preventing duplicate restore. Recovery copies appear in Settings > Database.

Limits: 256 MiB record data, 2 million records, 1 MiB per record; 512 MiB file/decompressed envelope. Legacy JSON restore remains limited to 16 MiB. Above these limits use a separately planned PostgreSQL recovery process. pg_cron is required for queued restores and cleanup; the migration installs the worker schedule. Recovery copies expire after configured retention; keep independent backups outside the project.

Validation records: verification/performance-v3. A fixture with 18,000 large audit rows (>16 MiB) transferred in 83 pages; largest RPC request 267,524 bytes. Native SQL tests cover rollback, staging, checksum failures, receipt replay, permissions and safety copies; the frontend stream helper gzip roundtrip also passed. Scoped reads matched seven original-engine responses; an approximately 23 MB fixture snapshot became 3,762 bytes for bootstrap and 23,512 bytes for checkout. Reserved serial stock and sparse global positions were preserved. These are synthetic test measurements, not a production latency benchmark.

Remaining architecture: dashboard and broad reports still use compatibility snapshots; a single party's history may still be large. The global revision/write lock remains. This patch does not convert text dates/JSON fields or normalize every table. Automatic Google Drive backup has not been added. No live project data or deployment was changed.

Verification commands: frontend/npm run test:performance; KARVIO_LARGE_ROWS=18000 node backend/test/bounded-transfers.mjs (from repository root); normal test, test:supabase, test:e2e and build.
