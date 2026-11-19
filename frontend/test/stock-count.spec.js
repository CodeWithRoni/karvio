import { test, expect } from '@playwright/test';

// Stock count: start, scan and type counts, see short / over, apply in one step, see it in past counts.
const endpoint = 'http://localhost:8787';
let token;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => { token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token; });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); if (!sessionStorage.getItem('sc-started')) { localStorage.removeItem('karvio_stock_count'); sessionStorage.setItem('sc-started', '1'); } }, { endpoint, token });
});

test('count the shelf by scanning, see the short items and fix the stock in one click', async ({ page, request }) => {
  const stamp = Date.now();
  const a = await call(request, 'product.save', { name: `Count mouse ${stamp}`, sale_price: 500, barcode: `CM${stamp}` });
  const b = await call(request, 'product.save', { name: `Count pad ${stamp}`, sale_price: 200 });
  const sup = await call(request, 'supplier.save', { name: `Count supplier ${stamp}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: a.id, qty: 5, cost: 300, sale_price: 500 }, { product_id: b.id, qty: 4, cost: 100, sale_price: 200 }], payments: [] });
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.goto('/#/stock-count');
  await expect(page.locator('.nav-card', { hasText: 'Stock' }).getByRole('link', { name: /Stock count/ })).toBeVisible();
  await page.getByRole('button', { name: '▶ Start counting' }).click();
  const scan = page.getByPlaceholder(/Scan a barcode or serial/);
  for (let i = 0; i < 3; i++) { await scan.fill(`CM${stamp}`); await scan.press('Enter'); }
  const rowA = page.locator('.sc-table tr', { hasText: a.name });
  await expect(rowA.getByLabel(`Counted ${a.name}`)).toHaveValue('3');
  await expect(rowA).toContainText('-2');
  await page.locator('.sc-table tr', { hasText: b.name }).getByLabel(`Counted ${b.name}`).fill('4');
  await page.getByRole('tab', { name: 'Short' }).click();
  await expect(page.locator('.sc-table')).toContainText(a.name);
  await expect(page.locator('.sc-table')).not.toContainText(b.name);
  // the count is kept on this device: a reload keeps it
  await page.reload();
  await expect(page.locator('.sc-table tr', { hasText: a.name }).getByLabel(`Counted ${a.name}`)).toHaveValue('3');
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByRole('button', { name: /Apply count · fix 1/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply the count' }).click();
  await expect(page.getByRole('tab', { name: 'Past counts', selected: true })).toBeVisible();
  await expect(page.locator('.dc-hist')).toContainText(`Stock count`);
  const prods = await call(request, 'products.list');
  expect(prods.find((p) => p.id === a.id).stock).toBe(3);
  expect(prods.find((p) => p.id === b.id).stock).toBe(4);
});
