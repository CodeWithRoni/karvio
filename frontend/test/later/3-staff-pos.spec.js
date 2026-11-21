import { test, expect } from '@playwright/test';

// Staff leaderboard report, the POS product price card, and editing a saved invoice from the POS.
const endpoint = 'http://localhost:8787';
let token, ids = {};
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap');
  const cash = boot.accounts[0].id, tag = Date.now().toString().slice(-6);
  const item = await call(request, 'product.save', { name: `Edit test mouse ${tag}`, sale_price: 550 });
  await call(request, 'purchase.create', { items: [{ product_id: item.id, qty: 40, cost: 400 }], payments: [{ account_id: cash, amount: 16000 }] });
  const cust = await call(request, 'customer.save', { name: `Edit Customer ${tag}`, phones: '0172' + tag + '0' });
  await call(request, 'sale.create', { customer_id: cust.id, items: [{ product_id: item.id, qty: 1, price: 520 }], payments: [] });
  const sale = await call(request, 'sale.create', { items: [{ product_id: item.id, qty: 2, price: 550 }], payments: [{ account_id: cash, amount: 1100 }] });
  ids = { item, cust, sale, tag, cash };
});
test.beforeEach(async ({ page }) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
  localStorage.removeItem('erp_pos_draft');
}, { endpoint, token }));

test('staff leaderboard and one person\'s report', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/#/reports?type=staff');
  await expect(page.getByRole('heading', { name: /Staff Leaderboard/ })).toBeVisible();
  await expect(page.locator('.sb-pod').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/staff-board.png' });
  await page.locator('.sb-pod').first().click();
  await expect(page.locator('.sd-head h2')).toBeVisible();
  await expect(page.locator('.sd-rank')).toContainText('#1');
  await expect(page.locator('.sd-kpis .card')).not.toHaveCount(0);
  await page.screenshot({ path: 'test-results/staff-detail.png' });
  for (const t of ['Day by day', 'Products', 'Customers', 'Payment methods']) { await page.getByRole('tab', { name: t, exact: true }).click(); await expect(page.locator('.dt tbody tr').first()).toBeVisible(); }
  await page.getByRole('button', { name: '← Leaderboard' }).click();
  await expect(page.getByRole('heading', { name: /Staff Leaderboard/ })).toBeVisible();
  expect(errs).toEqual([]);
});

test('POS: hovering a product shows its selling prices', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/pos');
  const search = page.getByRole('combobox', { name: 'Search product' });
  await search.fill(`Edit test mouse ${ids.tag}`);
  await page.locator('.psearch-list li').first().locator('.pn').hover();
  const card = page.locator('.ppc-pop .ppc');
  await expect(card).toContainText(`Edit test mouse ${ids.tag}`);
  await expect(card.locator('.ppc-box.last b')).toHaveText('550');
  await expect(card.locator('.ppc-box').nth(1).locator('b')).toHaveText('520');
  await expect(card.locator('.ppc-box.max b').first()).toHaveText('550');
  await card.screenshot({ path: 'test-results/pos-price-card.png' });
  await page.locator('.psearch-list li').first().click();
  await page.locator('.cart td.cn b').first().hover();
  await expect(page.locator('.ppc-pop .ppc')).toContainText('2ND LAST');
});

test('POS: invoice search box lists every invoice, searches by number, edits, clears', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/pos');
  const inv = page.getByRole('combobox', { name: 'Search invoice' });
  await inv.click();
  const list = page.locator('.inv-search .ri-list');
  await expect(list).toBeVisible();
  await expect(list.locator('li').first()).toContainText(ids.sale.sale.invoice_no);
  await expect(page.locator('.inv-search .ri-head')).toContainText('All invoices');
  await page.screenshot({ path: 'test-results/pos-invoice-search.png' });
  await inv.fill(ids.sale.sale.invoice_no.replace(/\D/g, '').slice(-3));
  await expect(list.locator('li').first()).toContainText(ids.sale.sale.invoice_no);
  await page.screenshot({ path: 'test-results/pos-invoice-search-typed.png' });
  // the product search on the right stays a product search
  await page.getByRole('combobox', { name: 'Search product' }).click();
  await expect(page.locator('.ri')).toHaveCount(0);
  await inv.fill(ids.sale.sale.invoice_no);
  await list.locator('li').first().click();
  await expect(page.locator('.inv-search.editing')).toBeVisible();
  await expect(inv).toHaveAttribute('placeholder', `✎ ${ids.sale.sale.invoice_no}`);
  await expect(page.locator('.pos-edit-banner')).toContainText(ids.sale.sale.invoice_no);
  await page.getByRole('spinbutton', { name: /Quantity/ }).first().fill('3');
  await page.getByRole('spinbutton', { name: 'Amount' }).first().fill('1650');
  await page.screenshot({ path: 'test-results/pos-editing.png' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByLabel('Admin password').fill('admin123');
  await page.getByLabel('Reason').fill('one more mouse');
  await page.locator('.modal').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.inv-search.editing')).toHaveCount(0);
  const d = await page.evaluate(async ({ endpoint, token, id }) => (await (await fetch(endpoint, { method: 'POST', body: JSON.stringify({ action: 'sale.detail', payload: { id }, token }) })).json()).data, { endpoint, token, id: ids.sale.sale.invoice_no });
  expect([d.sale.invoice_no, d.sale.total, d.items[0].qty]).toEqual([ids.sale.sale.invoice_no, 1650, 3]);
  // Open again, then Clear: nothing changes and the POS is empty
  await inv.fill(ids.sale.sale.invoice_no);
  await page.locator('.inv-search .ri-list li').first().click();
  await expect(page.locator('.inv-search.editing')).toBeVisible();
  await page.getByRole('button', { name: /Clear cart/ }).click();
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.locator('.inv-search.editing')).toHaveCount(0);
  await expect(inv).toHaveAttribute('placeholder', 'Search invoice');
  await expect(page.locator('.cart td.cn')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
});
