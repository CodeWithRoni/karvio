# Documentation index

- [README](../README.md): product, current release and usage.
- [Supabase setup](../SUPABASE-SETUP.md): backend setup.
- [Bounded reads and backups](BOUNDED-BACKUPS.md): backup/restore transfer design and limits.
- [Verification](../VERIFICATION.md): recorded checks.
- [Changes](../CHANGES.md): latest changes.
- [AI handover](../AI_HANDOVER.md): concise continuation state.

`backend/Code.gs` and `supabase/engine-overrides.txt` are authoritative. Generate hosted code with `node scripts/generate-supabase.cjs`, then release identity with `node scripts/generate-release.cjs`.

`frontend/dist` is not kept in the repository: deploy and release workflows build it from source, test it and publish that exact build. Run `npm run build` in `frontend` before packaging locally. Older documents and reviews are in the git history.
