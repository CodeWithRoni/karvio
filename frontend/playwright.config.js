import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5178', channel: 'msedge', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node ../backend/test/server.js', url: 'http://localhost:8787', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort', url: 'http://127.0.0.1:5178', reuseExistingServer: false }
  ]
});
