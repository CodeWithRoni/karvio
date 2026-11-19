import { test, expect } from '@playwright/test';
// Wholesale tab: every cart line takes its wholesale price; no wholesale price → "Price Not Set" and the sale waits.
const endpoint = 'http://localhost:8787';
let token, cash;
const call = async (request, action, payload = {}) => { const b = await (await request.post(endpoint, { data: { action, payload, token } })).json(); expect(b.ok, b.error).toBe(true); return b.data; };
test.beforeAll(async ({ request }) => { token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token; cash = (await call(request, 'bootstrap')).accounts[0].id; });
test('wholesale prices follow the tab, missing ones block the sale', async ({ page, request }) => {
  const st = Date.now();
  const a = await call(request, 'product.save', { name: `WS Router ${st}`, sale_price: 5500, wholesale_price: 5200 });
  const b = await call(request, 'product.save', { name: `WS Mouse ${st}`, sale_price: 550 });
  await call(request, 'purchase.create', { items: [{ product_id: a.id, qty: 5, cost: 5000 }, { product_id: b.id, qty: 5, cost: 400 }], payments: [{ account_id: cash, amount: 27000 }] });
  await page.addInitScript(({ endpoint, token }) => { try { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); } catch { /* about:blank */ } }, { endpoint, token });
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/#/pos');
  for (const n of [a.name, b.name]) { await page.getByRole('combobox', { name: 'Search product' }).fill(n); await page.keyboard.press('Enter'); await expect(page.locator('.cart tbody tr', { hasText: n })).toBeVisible(); }
  const price = (n) => page.locator('.cart tbody tr', { hasText: n }).getByLabel('Unit price');
  await expect(price(a.name)).toHaveValue('5500');
  await page.getByRole('tab', { name: 'Wholesale' }).click();
  await expect(price(a.name)).toHaveValue('5200');
  await expect(price(b.name)).toHaveValue('');
  await expect(price(b.name)).toHaveAttribute('placeholder', 'Price Not Set');
  await expect(page.getByText(`Wholesale price not set for ${b.name}`)).toBeVisible();
  await page.getByRole('tab', { name: 'Retail' }).click();
  await expect(price(a.name)).toHaveValue('5500');
  await expect(price(b.name)).toHaveValue('550');
});
