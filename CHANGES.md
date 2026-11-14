# 15 November 2026 — bounded reads and backup transfers

Common requests read relevant party/product history; read-only lists use SQL summaries. Private paged JSONL/gzip export and staged resumable restore add checksums, recovery copies and completion receipts. Supporting indexes and compact global row positions reduce memory use. See docs/BOUNDED-BACKUPS.md for tested limits and remaining work.

# Pending production-hardening patch

Owner authorized publication of this prepared patch; rollout completion is recorded by GitHub Actions. No native release. See [implemented changes and remaining work](docs/PRODUCTION-READINESS.md).

The three UI state fixes were already published in 944cf5589ad7d3a76d06536dad55214d955f8f83. This pending patch is separate. Older changes are in [the archive](docs/archive/CHANGES-before-2026-11-14.md).
