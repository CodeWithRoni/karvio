import { test, expect } from '@playwright/test';

// Pages were renamed; bookmarks with the old address (and their ?filters) still open the right page.
const endpoint = 'http://localhost:8787';
let token;
test.beforeAll(async ({ request }) => { token = (await (await request.post(endpoint, { data: { action: 'login', payload: { username: 'admin', password: 'admin123' } } })).json()).data.token; });

test('old page addresses open the renamed pages', async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
  const pages = [['stock?filter=low', 'products?filter=low'], ['pc-builder', 'quotation'], ['history', 'advanced-search'], ['prices', 'price-manager'], ['accounts', 'cash-bank']];
  for (const [from, to] of pages) {
    await page.goto('/#/' + from);
    await expect(page).toHaveURL(new RegExp('#/' + to.replace('?', '\\?') + '$'));
    await expect(page.locator('.page-head h1')).toBeVisible();
  }
});
