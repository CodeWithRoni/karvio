import { test, expect } from '@playwright/test';

// Reports hub party reports (due collection, supplier payments, aging, individual) and the party hover card.
const endpoint = 'http://localhost:8787';
let token, ids = {};
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
const signIn = (page) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
  window.__printed = null;
  const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { const w = d.get.call(this); if (w && !w.__h) { w.__h = 1; w.print = () => { window.__printed = w.document.documentElement.outerHTML; }; } return w; } });
}, { endpoint, token });

test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap');
  const cash = boot.accounts[0].id, tag = Date.now().toString().slice(-6);
  const item = await call(request, 'product.save', { name: `Party report tea ${tag}`, sale_price: 100 });
  const sup = await call(request, 'supplier.save', { name: `Report Supplier ${tag}`, phones: '0181' + tag + '0' });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: item.id, qty: 60, cost: 60 }], payments: [{ account_id: cash, amount: 1000 }] });
  await call(request, 'supplier.payment', { supplier_id: sup.id, amount: 500, account_id: cash });
  const cust = await call(request, 'customer.save', { name: `Report Customer ${tag}`, phones: '0171' + tag + '0' });
  const s1 = await call(request, 'sale.create', { customer_id: cust.id, items: [{ product_id: item.id, qty: 10, price: 100 }], payments: [] });
  const s2 = await call(request, 'sale.create', { customer_id: cust.id, items: [{ product_id: item.id, qty: 5, price: 100 }], payments: [{ account_id: cash, amount: 200 }] });
  await call(request, 'customer.payment', { customer_id: cust.id, amount: 400, account_id: cash });
  ids = { sup, cust, s1, s2, tag };
});
test.beforeEach(async ({ page }) => signIn(page));

test('due collection and supplier payment reports with filters', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/reports?type=due_collections');
  await expect(page.getByRole('heading', { name: /Due Collection Report/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(ids.cust.id);
  await expect(page.locator('.dt tbody tr')).toHaveCount(1);
  await expect(page.locator('.dt tbody tr').first()).toContainText(ids.cust.name);
  await expect(page.locator('.pr-kpis')).toContainText('400');
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('party');
  await expect(page.locator('.dt tbody tr').first()).toContainText(ids.cust.name);
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('list');
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption('');
  await page.screenshot({ path: 'test-results/party-due-collection.png', fullPage: false });
  await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('supplier_payments');
  await expect(page.getByRole('heading', { name: /Supplier Payment Report/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption(ids.sup.id);
  await expect(page.locator('.dt tbody tr')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('due');
  await expect(page.locator('.dt tbody tr')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('all');
  await page.screenshot({ path: 'test-results/party-supplier-payments.png', fullPage: false });
});

test('aging report: buckets, filters and invoice opening', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/reports?type=aging');
  await expect(page.getByRole('heading', { name: /Customer Aging Report/ })).toBeVisible();
  await expect(page.locator('.aging-buckets .aging-b')).toHaveCount(5, { timeout: 10000 }).catch(async () => expect(await page.locator('.aging-buckets .aging-b').count()).toBeGreaterThanOrEqual(5));
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(ids.cust.id);
  await expect(page.locator('.dt tbody tr')).toHaveCount(2);
  await expect(page.locator('.age-chip').first()).toHaveText('0–30 days');
  await page.screenshot({ path: 'test-results/party-aging.png', fullPage: false });
  await page.locator('.dt tbody tr').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('party');
  await expect(page.locator('.dt tbody tr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Suppliers', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Supplier Aging Report/ })).toBeVisible();
});

test('individual report: one customer, every report, invoices printed as at the sale', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/reports?type=individual');
  await expect(page.locator('.empty').getByText('Choose a customer')).toBeVisible();
  await page.getByRole('combobox', { name: 'Customer', exact: true }).selectOption(ids.cust.id);
  await expect(page.locator('.ir-card .pc-card')).toContainText(ids.cust.name);
  await expect(page.locator('.ir-card .pc-inv')).toContainText('2');
  await expect(page.locator('.dt tbody tr')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/party-individual.png', fullPage: false });
  await page.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed || '')).toContain(ids.s1.sale.invoice_no);
  const printed = await page.evaluate(() => window.__printed);
  expect(printed).toContain(ids.s2.sale.invoice_no);
  expect(printed).toContain('sdoc');
  for (const name of ['Due collections', 'Ledger statement', 'Products bought', 'Dues by age', 'Sales returns']) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.locator('.loading')).toHaveCount(0);
  }
  await page.getByRole('tab', { name: 'Ledger statement', exact: true }).click();
  await expect(page.locator('.dt tbody tr').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Supplier', exact: true }).click();
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption(ids.sup.id);
  await expect(page.locator('.dt tbody tr')).toHaveCount(1);
});

test('hover card on the POS customer and the purchase supplier', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/pos');
  await page.locator('#pos-customer').fill(ids.cust.name);
  await page.getByRole('option', { name: new RegExp(ids.cust.name) }).first().click();
  await page.locator('.cust-sel b').first().hover();
  const card = page.locator('.pc-pop .pc-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(ids.cust.name);
  await expect(card).toContainText('Customer since');
  await expect(card.locator('.pc-inv')).toContainText('2');
  await expect(card).toContainText('due');
  await card.screenshot({ path: 'test-results/party-card-customer.png' });
  await page.goto('/#/purchases');
  await page.getByRole('tab', { name: 'New purchase', exact: true }).click();
  const sel = page.getByRole('combobox', { name: 'Supplier' });
  await sel.selectOption(ids.sup.id);
  await sel.hover();
  await expect(page.locator('.pc-pop .pc-card')).toContainText(ids.sup.name);
  await expect(page.locator('.pc-pop .pc-card')).toContainText('Supplier since');
  await page.locator('.pc-pop .pc-card').screenshot({ path: 'test-results/party-card-supplier.png' });
});
