import { test, expect } from '@playwright/test';

// Repairs page: new job with a new customer, a part from stock and an advance; mark ready; deliver with an invoice; cancel.
const endpoint = 'http://localhost:8787';
let token, paste, cash;
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap');
  cash = boot.accounts[0];
  paste = boot.products.find((p) => p.barcode === 'RPR-PASTE-1');
  if (!paste) {
    paste = await call(request, 'product.save', { name: 'RPR Thermal paste', barcode: 'RPR-PASTE-1', sale_price: 150 });
    await call(request, 'purchase.create', { items: [{ product_id: paste.id, qty: 10, cost: 80 }], payments: [{ account_id: cash.id, amount: 800 }] });
  }
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
  }, { endpoint, token });
});

test('repair job: receive, mark ready, deliver with an invoice', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/customers');
  // the menu item sits right under Customers & Dues
  const links = await page.locator('nav a').allTextContents();
  const i = links.findIndex((t) => t.includes('Customers & Dues'));
  expect(links[i + 1]).toContain('Repairs');
  await page.locator('nav a', { hasText: 'Repairs' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Repairs');

  const stock0 = (await call(request, 'products.list')).find((p) => p.id === paste.id).stock;
  const cash0 = (await call(request, 'accounts.list')).find((a) => a.id === cash.id).balance;

  await page.getByRole('button', { name: 'New repair job' }).click();
  const dlg = page.getByRole('dialog', { name: 'New repair job' });
  await dlg.getByLabel('Or new customer name').fill('Repair Test Customer');
  await dlg.getByLabel('Phone').fill('01555000111');
  await dlg.getByLabel('Device').fill('Dell Inspiron laptop');
  await dlg.getByLabel('Problem').fill('Overheating and shutdown');
  await dlg.getByLabel('Received with').fill('Charger');
  await dlg.getByLabel('Technician').selectOption({ label: 'Administrator' });
  await dlg.getByLabel('Repair charge').fill('700');
  await dlg.getByRole('combobox', { name: 'Search product' }).fill('RPR Thermal');
  await dlg.getByRole('option', { name: /RPR Thermal paste/ }).click();
  await expect(dlg.getByLabel('Price of RPR Thermal paste')).toHaveValue('150');
  await expect(dlg.locator('.totals .grand')).toContainText('850');
  await dlg.getByLabel('Advance received').fill('300');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();

  // the new job opens in its detail
  const det = page.getByRole('dialog', { name: /^Repair job JOB-/ });
  await expect(det).toContainText('Repair Test Customer');
  await expect(det).toContainText('Received');
  await expect(det.locator('.kv')).toContainText('Technician');
  await expect(det.locator('.kv')).toContainText('Administrator');
  await expect(det.locator('.kv')).toContainText('550'); // due = 850 − 300
  const jobNo = (await det.getAttribute('aria-label')).replace('Repair job ', '');
  expect((await call(request, 'accounts.list')).find((a) => a.id === cash.id).balance).toBeCloseTo(cash0 + 300, 2);
  expect((await call(request, 'products.list')).find((p) => p.id === paste.id).stock).toBe(stock0); // not yet taken

  await det.getByRole('button', { name: 'Mark ready' }).click();
  await expect(det.locator('.kv')).toContainText('Ready');

  await det.getByRole('button', { name: 'Deliver', exact: true }).click();
  const dv = page.getByRole('dialog', { name: `Deliver ${jobNo}` });
  await expect(dv.getByLabel(/Amount received/)).toHaveValue('550');
  await dv.getByRole('button', { name: 'Deliver', exact: true }).click();
  const after = page.getByRole('dialog', { name: `Repair job ${jobNo}` });
  await expect(after.locator('.kv')).toContainText('Delivered');
  await expect(after.locator('.kv')).toContainText('Invoice');

  const job = (await call(request, 'repairs.list', { q: jobNo }))[0];
  const inv = await call(request, 'sale.detail', { id: job.sale_id });
  expect(inv.items.map((x) => [x.name, x.qty, x.price])).toEqual([['RPR Thermal paste', 1, 150], ['Repair service', 1, 700]]);
  expect([inv.sale.total, inv.sale.credit_used, inv.sale.due]).toEqual([850, 300, 0]);
  expect((await call(request, 'products.list')).find((p) => p.id === paste.id).stock).toBe(stock0 - 1);
  expect((await call(request, 'accounts.list')).find((a) => a.id === cash.id).balance).toBeCloseTo(cash0 + 850, 2);
  await after.getByRole('button', { name: 'Close' }).click();

  // Delivered tab lists it; Open does not
  await page.locator('.filters').getByRole('tab', { name: 'Delivered' }).click();
  await expect(page.locator('table')).toContainText(jobNo);
  await page.locator('.filters').getByRole('tab', { name: 'Open' }).click();
  await expect(page.locator('table')).not.toContainText(jobNo);
  expect(errors).toEqual([]);
});

test('repair job: cancel and give the advance back', async ({ page, request }) => {
  const made = await call(request, 'repair.save', { customer_name: 'Cancel Test', phone: '01555000222', device: 'Printer', problem: 'Jam', advance: 200, account_id: cash.id });
  const cash0 = (await call(request, 'accounts.list')).find((a) => a.id === cash.id).balance;
  await page.goto('/#/repairs');
  await page.locator('table').getByText(made.job_no).click();
  const det = page.getByRole('dialog', { name: `Repair job ${made.job_no}` });
  await det.getByRole('button', { name: 'Cancel job' }).click();
  const c = page.getByRole('dialog', { name: `Cancel ${made.job_no}` });
  await expect(c.getByRole('button', { name: 'Cancel job' })).toBeDisabled();
  await c.getByLabel('Why is it cancelled?').fill('Customer took it back');
  await expect(c.getByLabel('Give it back to the customer now')).toBeChecked();
  await c.getByRole('button', { name: 'Cancel job' }).click();
  await expect(page.getByRole('dialog', { name: `Repair job ${made.job_no}` }).locator('.kv')).toContainText('Cancelled');
  expect((await call(request, 'accounts.list')).find((a) => a.id === cash.id).balance).toBeCloseTo(cash0 - 200, 2);
});
