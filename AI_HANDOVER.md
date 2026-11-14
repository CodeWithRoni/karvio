# Current work — local production hardening

Baseline main: 944cf5589ad7d3a76d06536dad55214d955f8f83; live Edge v57. Owner now explicitly authorized push/deployment of the prepared patch. Follow the backend-first pipeline and verify migration/Edge/Pages results. No historical data rewrite or native release.

Read docs/PRODUCTION-READINESS.md first. Implemented: administrator confirmation lockout, 12-character new credential policy, backend-first gated deployment/build identity, protocol 2 row deltas, copy-on-write runtime, lightweight ping and five scoped flows, header-independent request limits, backup retention for every reason, four deferred foreign keys, version/CSP/legacy-code/docs cleanup.

IMPORTANT: full bounded business queries, replacement of global revision serialization, native date/JSONB normalization and off-project backup configuration remain incomplete. Do not claim the whole architecture issue is fixed. Owner selected Google Drive; a private Karvio backups folder was created (details in production-readiness doc), but server authorization/scheduling is NOT configured. Both migrations passed a de-identified recovery-copy rehearsal; live orphan preflight counts were zero. see verification/production-fixes logs.

Source: backend/Code.gs + supabase/engine-overrides.txt. Regenerate engine and release identity after source changes. Deployment now applies migrations before Edge and publishes frontend only after exact backend revision confirmation. Historical notes moved to docs/archive/.
