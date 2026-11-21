# Documentation index

- [README](../README.md): product, current release and usage.
- [Supabase setup](../SUPABASE-SETUP.md): backend setup.
- [Bounded reads and backups](BOUNDED-BACKUPS.md): backup/restore transfer design and limits.
- [Changes](../CHANGES.md): latest changes.

`backend/engine.js` and `supabase/engine-overrides.txt` are authoritative. Generate hosted code with `node scripts/generate-supabase.cjs`, then release identity with `node scripts/generate-release.cjs`.

`frontend/dist` is not kept in the repository: deploy and release workflows build it from source, test it and publish that exact build. Run `npm run build` in `frontend` before packaging locally. Older documents and reviews are in the git history.
