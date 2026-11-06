# Setup — Karvio 1.0.6

The complete current setup guide is [UPLOAD_GUIDE-বাংলা.md](UPLOAD_GUIDE-বাংলা.md).

1. Back up your existing database yourself.
2. Replace the current Apps Script project Code.gs with backend/Code.gs; deploy a new version of the existing Web App. Do not reset the existing database or its administrator.
3. Update repository source files, or upload frontend/dist contents to static hosting.
4. Sign in again; old credential sessions are invalidated by this upgrade.
5. Override the API endpoint per device in Settings if needed.

Local web development: frontend → npm ci, npm test, npm run build, npm run dev.
Offline Electron: npm run desktop. Online Electron: npm run desktop:online.
Do not mix offline and online data folders; there is no automatic sync.
