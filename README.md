# Karvio 1.0.6

Computer / IT / networking shop management and POS: React web/mobile UI, Google Apps Script + Sheets online backend, and Electron offline desktop with local persistent data.

Start with **[UPLOAD_GUIDE-বাংলা.md](UPLOAD_GUIDE-বাংলা.md)** for deployment order and local/offline usage. See **FIXES-1.0.6.md** for the fourteen review fixes and **VERIFICATION.md** for validation.

- Online backend source: `backend/Code.gs` (the single authoritative Apps Script file).
- Web source: `frontend/src/`; prebuilt static website: `frontend/dist/`.
- Offline desktop: `frontend/desktop/`, included backend resource, existing `ShopERP Offline` data directory preserved.
- Online desktop: explicit `npm run desktop:online`; mobile/Tauri use the online API.
- Test fixtures use local in-memory Sheets or isolated temporary folders, never production data.

```sh
cd frontend
npm ci
npm test
npm run build
npm run dev
```

Desktop: `npm run desktop` (offline by default). Browser tests: `npm run test:e2e`. Native SDK/toolchains are needed only for native builds.

Deploy the new backend before the new frontend. No deployment was performed while preparing this package. No customer database, session credentials or backups are included.
