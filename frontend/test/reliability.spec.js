import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const endpoint = 'http://localhost:8787';
let token, product, supplier, cash, serverToday;
const fixture = randomUUID().slice(0, 8);
async function call(request, action, payload = {}) {
  const result = await request.post(endpoint, { data: { action, payload, token, request_id: randomUUID() } });
  const body = await result.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
const nextDay = (day, count) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); };

test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap');
  cash = boot.accounts[0]; serverToday = boot.serverToday;
  supplier = await call(request, 'supplier.save', { name: `Reliability fixture supplier ${fixture}` });
  product = await call(request, 'product.save', { name: `Reliability fixture keyboard ${fixture}`, barcode: `RELIABILITY-${fixture}`, unit: 'pcs', sale_price: 30 });
  await call(request, 'purchase.create', { supplier_id: supplier.id, items: [{ product_id: product.id, qty: 20, cost: 10 }], payments: [] });
  await call(request, 'sale.create', { items: [{ product_id: product.id, qty: 1, price: 30 }], payments: [{ account_id: cash.id, amount: 30 }] });
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
  }, { endpoint, token });
});

test('sorting an invoice report survives a change to daily and expense columns', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/reports');
  await page.getByRole('button', { name: 'Invoice', exact: true }).click();
  const field = (name) => page.locator('.field').filter({ has: page.locator('.field-label').filter({ hasText: new RegExp(`^${name}$`) }) }).locator('select');
  await field('View').selectOption('daily');
  await expect(page.locator('h2')).toContainText('Sales');
  await expect(page.getByRole('button', { name: 'Date', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Date', exact: true }).click();
  await field('Report').selectOption('expenses');
  await expect(page.locator('h2')).toContainText('Expenses');
  await expect(page.getByRole('button', { name: 'Category', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a pending purchase remains disabled and rapid clicks add stock only once', async ({ page, request }) => {
  const before = (await call(request, 'bootstrap')).products.find((p) => p.id === product.id).stock;
  const purchasesBefore = (await call(request, 'purchases.list', { supplier_id: supplier.id, page: 1 })).total;
  await page.goto('/#/purchases');
  await page.getByRole('tab', { name: 'New purchase', exact: true }).click();
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption(supplier.id);
  const search = page.getByRole('combobox', { name: 'Search product', exact: true });
  await search.fill(product.barcode); await search.press('Enter');
  await page.getByLabel(`Unit cost for ${product.name}`, { exact: true }).fill('10');
  await expect(page.locator('.last-buy').first()).not.toContainText('Last purchase: …');
  let count = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route(endpoint, async (route) => {
    if (route.request().postDataJSON().action !== 'purchase.create') return route.continue();
    count++; await gate; return route.continue();
  });
  try {
    const save = page.getByRole('button', { name: 'Save purchase', exact: true });
    await save.evaluate((el) => { el.click(); el.click(); });
    await expect.poll(() => count).toBe(1);
    await expect(save).toBeDisabled();
    await save.dispatchEvent('click');
    await expect.poll(() => count).toBe(1);
    release();
    await expect.poll(async () => (await call(request, 'purchases.list', { supplier_id: supplier.id, page: 1 })).total).toBe(purchasesBefore + 1);
    expect((await call(request, 'bootstrap')).products.find((p) => p.id === product.id).stock).toBe(before + 1);
  } finally { release(); }
});

for (const key of ['F9', 'F10']) {
  test(`${key} uses the last edited next-payment date and rejects a second key while saving`, async ({ page, request }) => {
    const customer = await call(request, 'customer.save', { name: `Reliability ${key} customer ${fixture}` });
    await page.goto('/#/pos');
    const search = page.getByRole('combobox', { name: 'Search product' });
    await search.fill(product.barcode); await search.press('Enter');
    await page.locator('#pos-customer').fill(customer.name);
    await page.getByRole('option', { name: new RegExp(customer.name) }).first().click();
    const date = page.getByLabel('Next payment date', { exact: true });
    await date.fill(nextDay(serverToday, 1));
    // This date-only edit was missing from the old hotkey closure.
    await date.fill(nextDay(serverToday, 2));
    const bodies = []; let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(endpoint, async (route) => {
      const data = route.request().postDataJSON();
      if (data.action !== 'sale.create') return route.continue();
      bodies.push(data); await gate; return route.continue();
    });
    try {
      await page.keyboard.press(key);
      await expect.poll(() => bodies.length).toBe(1);
      await page.keyboard.press(key);
      await expect.poll(() => bodies.length).toBe(1);
      expect(bodies[0].payload.next_payment_date).toBe(nextDay(serverToday, 2));
      expect(bodies[0].request_id).toBeTruthy();
      release();
      await expect(page.locator('.cart tbody')).not.toContainText(product.name);
      const sales = await call(request, 'sales.list', { customer_id: customer.id });
      const invoice = (Array.isArray(sales) ? sales : sales.rows).find((s) => s.customer_id === customer.id);
      expect(invoice).toBeTruthy();
      expect((await call(request, 'sale.detail', { id: invoice.id })).sale.next_payment_date).toBe(nextDay(serverToday, 2));
    } finally { release(); }
  });
}

test('a committed purchase with a lost response retries with one request ID and one invoice', async ({ page, request }) => {
  const before = (await call(request, 'bootstrap')).products.find((p) => p.id === product.id).stock;
  const purchasesBefore = (await call(request, 'purchases.list', { supplier_id: supplier.id, page: 1 })).total;
  await page.goto('/#/purchases');
  await page.getByRole('tab', { name: 'New purchase', exact: true }).click();
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption(supplier.id);
  const search = page.getByRole('combobox', { name: 'Search product', exact: true });
  await search.fill(product.barcode); await search.press('Enter');
  await page.getByLabel(`Unit cost for ${product.name}`, { exact: true }).fill('10');
  await expect(page.locator('.last-buy').first()).not.toContainText('Last purchase: …');
  const ids = [];
  await page.route(endpoint, async (route) => {
    const data = route.request().postDataJSON();
    if (data.action !== 'purchase.create') return route.continue();
    ids.push(data.request_id);
    if (ids.length === 1) {
      await route.fetch(); // The server commits, but the browser does not receive its reply.
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Save purchase', exact: true }).click();
  await expect.poll(() => ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
  await expect.poll(async () => (await call(request, 'purchases.list', { supplier_id: supplier.id, page: 1 })).total).toBe(purchasesBefore + 1);
  expect((await call(request, 'bootstrap')).products.find((p) => p.id === product.id).stock).toBe(before + 1);
});
