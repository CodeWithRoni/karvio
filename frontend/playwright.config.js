import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test', timeout: 45000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5178', channel: process.env.KARVIO_BROWSER_CHANNEL || 'msedge', headless: true, trace: 'retain-on-failure' },
  // test/later/ runs after everything else, in file order (1-…, 2-…): once branches are added they stay on for the shop,
  // so those tests come last. Run one of them alone with --no-deps.
  projects: [
    { name: 'main', testIgnore: /later[\\/]/ },
    { name: 'later', testMatch: /later[\\/].*\.spec\.js$/, dependencies: ['main'] }
  ],
  webServer: [
    { command: 'node ../backend/test/server.js', url: 'http://localhost:8787', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort', url: 'http://127.0.0.1:5178', reuseExistingServer: false }
  ]
});
