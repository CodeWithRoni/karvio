import { test, expect } from '@playwright/test';
const endpoint = 'http://localhost:8787';
// Menu card above Money & Reports with two admin-only pages (the pages themselves are placeholders for now).
test('Party Ledger Adjustment menu card sits above Money & Reports and opens its two pages', async ({ page, request }) => {
  const token = (await (await request.post(endpoint, { data: { action: 'login', payload: { username: 'admin', password: 'admin123' } } })).json()).data.token;
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto('/#/');
  const titles = await page.locator('.nav-card .nav-group').allInnerTexts();
  const at = titles.findIndex((t) => /party ledger adjustment/i.test(t));
  expect(at).toBeGreaterThan(-1);
  expect(titles[at + 1]).toMatch(/money & reports/i);
  const card = page.locator('.nav-card', { hasText: 'Party Ledger Adjustment' });
  await expect(card.getByRole('link')).toHaveCount(2);
  await card.getByRole('link', { name: 'Customer Ledger Adjustment' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Customer Ledger Adjustment');
  await card.getByRole('link', { name: 'Supplier Ledger Adjustment' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Supplier Ledger Adjustment');
});
