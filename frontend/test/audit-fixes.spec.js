import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const endpoint = 'http://localhost:8787';
let token, cash, product;
const name = `Audit reload service ${randomUUID().slice(0, 8)}`;
async function call(request, action, payload = {}) {
  const response = await request.post(endpoint, { data: { action, payload, token, request_id: randomUUID() } });
  const body = await response.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  cash = (await call(request, 'bootstrap')).accounts[0];
  product = await call(request, 'product.save', { name, service: true, sale_price: 100 });
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
  }, { endpoint, token });
});

test('the development server cannot launch an editor', async ({ request }) => {
  for (const url of ['/__open-in-editor?file=fixture.txt', '/%5f%5fopen-in-editor?file=fixture.txt']) {
    const response = await request.get(url);
    expect(response.status()).toBe(403);
    expect(await response.text()).toContain('Editor launch is disabled');
  }
});

test('a lost save response survives page reload without a second invoice', async ({ page, request }) => {
  await page.goto('/#/pos');
  await page.getByRole('combobox', { name: 'Search product' }).fill(name);
  await page.getByRole('option').filter({ hasText: name }).click();
  let intercepted = 0;
  const loseReplies = async route => {
    if (route.request().postDataJSON().action !== 'sale.create') return route.continue();
    intercepted++;
    await route.fetch(); // commit to the isolated server, then lose only the acknowledgement
    await route.abort('connectionreset');
  };
  await page.route(endpoint, loseReplies);
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.locator('.toast-err')).toContainText('Could not confirm the server result');
  expect(intercepted).toBe(2);
  expect((await call(request, 'sales.list', { q: name })).length).toBe(1);
  await page.unroute(endpoint, loseReplies);
  await page.reload();
  await expect(page.locator('.cart')).toContainText(name);
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sale completed' })).toBeVisible();
  expect((await call(request, 'sales.list', { q: name })).length).toBe(1);
});

test('the customer invoice counts an advance once', async ({ page, request }) => {
  const customer = await call(request, 'customer.save', { name: 'Audit advance customer', opening_balance: -20 });
  const invoice = await call(request, 'sale.create', {
    customer_id: customer.id, items: [{ product_id: product.id, qty: 1, price: 100 }],
    payments: [{ account_id: cash.id, amount: 80 }], credit_used: 20, send_sms: false
  });
  const link = await call(request, 'sale.link', { id: invoice.sale.id });
  await page.goto('/' + new URL(link.url).hash);
  const paid = page.locator('.pubinv-tot').getByText('Paid now', { exact: true }).locator('..');
  await expect(paid).toContainText('100');
  await expect(paid).not.toContainText('120');
});

test('the same customer link reflects a later collection', async ({ page, request }) => {
  const customer = await call(request, 'customer.save', { name: 'Later collection customer' });
  const invoice = await call(request, 'sale.create', {
    customer_id: customer.id, items: [{ product_id: product.id, qty: 1, price: 100 }], payments: []
  });
  const link = await call(request, 'sale.link', { id: invoice.sale.id });
  await page.goto('/' + new URL(link.url).hash);
  await expect(page.locator('.pubinv-tot .due')).toContainText('100');
  await call(request, 'customer.payment', { customer_id: customer.id, amount: 40, account_id: cash.id });
  await page.reload();
  await expect(page.locator('.pubinv-tot .due')).toContainText('60');
  await call(request, 'customer.payment', { customer_id: customer.id, amount: 60, account_id: cash.id });
  await page.reload();
  await expect(page.locator('.pubinv-tot')).toBeVisible();
  await expect(page.locator('.pubinv-tot .due')).toHaveCount(0);
});

test('repairs-only staff can complete work but cannot deliver a sale', async ({ page, request }) => {
  const username = 'tech' + randomUUID().slice(0, 8);
  await call(request, 'user.save', { name: 'Restricted technician', username, password: 'techpass12', role: 'technician', phone: '01722223333' });
  const job = await call(request, 'repair.save', { customer_name: 'Restricted repair', phone: '01744445555', device: 'PC', problem: 'Test' });
  const login = await call(request, 'login', { username, password: 'techpass12' });
  await page.addInitScript(t => localStorage.setItem('erp_token', t), login.token);
  await page.goto('/#/repairs');
  await expect(page.locator('.who .muted')).toHaveText('Technician');
  await page.getByRole('button',{name:'All repair jobs',exact:true}).click();
  await page.locator('table').getByText(job.job_no).click();
  const dialog = page.getByRole('dialog', { name: `Repair job ${job.job_no}` });
  await expect(dialog.getByRole('button', { name: 'Mark completed', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Deliver', exact: true })).toHaveCount(0);
});

