const { _electron } = require('playwright');
const { expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-new-desktop-'));
let app;
(async () => {
  app = await _electron.launch({ executablePath: process.env.KARVIO_ELECTRON_EXECUTABLE || require('electron'), args: [path.resolve(__dirname, '..')], env: { ...process.env, KARVIO_DATA_DIR: dir, KARVIO_TEST_MODE: '1' }, timeout: 30000 });
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText('Online shop — sign in with your existing shop account.')).toBeVisible();
  if (await page.evaluate(() => Boolean(window.karvio?.offline))) throw new Error('Fresh standard desktop unexpectedly opened an offline database');
  if (fs.existsSync(path.join(dir, 'karvio.json'))) throw new Error('Fresh online desktop created an offline shop');
  console.log('Fresh standard desktop: online mode, existing shop sign-in, no offline database created');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
