# Documentation index

- [README](../README.md): product, current release and usage.
- [Production readiness](PRODUCTION-READINESS.md): current local changes, migration order, limits and remaining work.
- [Supabase setup](../SUPABASE-SETUP.md): backend setup.
- [Verification](../VERIFICATION.md): current validation only.
- [Changes](../CHANGES.md): current pending patch only.
- [AI handover](../AI_HANDOVER.md): concise continuation state.
- [Historical documents](archive/): past reviews and status notes; not current deployment instructions.

`backend/Code.gs` and `supabase/engine-overrides.txt` are authoritative. Generate hosted code with `node scripts/generate-supabase.cjs`, then release identity with `node scripts/generate-release.cjs`. The stale duplicate `backend/parts/*.gs` files were removed locally.

Built `frontend/dist` files are intentionally included in the prepared distribution so packaged desktop apps have assets. They are generated files, not an editable source of truth. CI rebuilds from source, tests it once, and publishes that exact artifact after backend verification. `.gitignore` prevents newly generated untracked files being added accidentally; it does not remove existing tracked files. A source archive may include the prepared build; a clean source checkout must rebuild before packaging.
