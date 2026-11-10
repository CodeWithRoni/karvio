import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works on any static host AND inside Tauri / Electron (file://)
export default defineConfig({
  plugins: [react(), {
    name: 'disable-editor-launch',
    configureServer(server) {
      // Karvio does not need Vite's editor-launch endpoint. Keep it unreachable,
      // including encoded paths, while staying on the current dependency majors.
      server.middlewares.use((req, res, next) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { res.statusCode = 400; res.end('Invalid path'); return; }
        if (pathname.split('/').includes('__open-in-editor')) { res.statusCode = 403; res.end('Editor launch is disabled'); return; }
        next();
      });
    }
  }],
  server: { host: '127.0.0.1', cors: false, fs: { strict: true } },
  base: './',
  build: { chunkSizeWarningLimit: 1500 }
});
