import { test, expect } from '@playwright/test';
const endpoint = 'http://localhost:8787';
// Opening a page for the first time: the menu must stay on screen the whole time, even when the page's file is slow.
for (const preload of [false, true]) test(`menu never leaves the screen when a page opens (${preload ? 'after preload' : 'file still loading'})`, async ({ page, request }) => {
  const token = (await (await request.post(endpoint, { data: { action: 'login', payload: { username: 'admin', password: 'admin123' } } })).json()).data.token;
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token);
    window.__gone = 0; window.__ticks = 0;
    const watch = () => { window.__ticks++; const nav = document.querySelector('nav'); const shown = !!nav && nav.getClientRects().length > 0; if (window.__seen && !shown) window.__gone++; if (shown) window.__seen = true; requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
  }, { endpoint, token });
  if (!preload) await page.route(/pages\/(Purchases|Reports|Expenses|CashBank)\.jsx|assets\/(Purchases|Reports|Expenses|CashBank)-/, async (route) => { await new Promise((r) => setTimeout(r, 400)); route.continue(); });
  await page.goto('/#/');
  await expect(page.locator('nav a', { hasText: 'Dashboard' })).toBeVisible();
  if (preload) await page.waitForTimeout(6000);
  for (const name of ['Make Purchase', 'Reports Hub', 'Expenses', 'Cash, Bank & MFS']) {
    await page.locator('nav').getByRole('link', { name: new RegExp(`^${name}( Alt \\d)?$`) }).click(); // the name, maybe with its shortcut key
    await expect(page.locator('.page-head h1')).not.toHaveText('Dashboard');
    await page.waitForTimeout(300);
  }
  expect(await page.evaluate(() => window.__gone)).toBe(0);
  expect(await page.evaluate(() => window.__ticks)).toBeGreaterThan(30);
});
