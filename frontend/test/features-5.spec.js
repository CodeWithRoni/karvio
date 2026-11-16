import { test, expect } from '@playwright/test';

// Supplier rebates: record one from Pay supplier, see it in the ledger and the report, promised rebates, void with the admin password.
const endpoint = 'http://localhost:8787';
let token, today;
async function raw(request, action, payload = {}) { return (await request.post(endpoint, { data: { action, payload, token } })).json(); }
async function call(request, action, payload = {}) { const r = await raw(request, action, payload); expect(r.ok, r.error).toBe(true); return r.data; }
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123', device: 'Test runner' })).token;
  today = (await call(request, 'bootstrap')).serverToday;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});
async function setup(request) {
  const stamp = Date.now();
  const sup = await call(request, 'supplier.save', { name: `Rebate sup ${stamp}` });
  const prod = await call(request, 'product.save', { name: `Rebate item ${stamp}`, sale_price: 1500 });
  const pur = (await call(request, 'purchase.create', { supplier_id: sup.id, date: today, items: [{ product_id: prod.id, qty: 100, cost: 1000, sale_price: 1500 }], payments: [] })).purchase;
  return { stamp, sup, pur };
}
const openSupplier = async (page, name) => {
  await page.goto('/#/suppliers');
  await page.getByLabel('Search suppliers').fill(name);
  await page.getByText(name, { exact: true }).first().click();
  return page.getByRole('dialog', { name });
};

test('a supplier rebate lowers what we owe without touching any account', async ({ page, request }) => {
  const { sup, pur } = await setup(request);
  const cashBefore = (await call(request, 'accounts.list')).reduce((a, x) => a + x.balance, 0);
  const dlg = await openSupplier(page, sup.name);
  await dlg.getByRole('button', { name: 'Pay supplier' }).click();
  await page.getByRole('dialog', { name: /^Pay supplier/ }).getByLabel('Type').selectOption('rebate');
  const rb = page.getByRole('dialog', { name: /^Supplier rebate/ });
  await expect(rb.getByLabel('Account')).toHaveCount(0);
  const save = rb.getByRole('button', { name: 'Save rebate' });
  await rb.getByLabel('Rebate amount').fill('10000');
  await expect(save).toBeDisabled();
  await rb.getByLabel('For which purchase (optional)').selectOption(pur.id);
  await rb.getByLabel('Reason').fill('Credit note CN-118');
  await expect(rb.locator('.rb-preview')).toContainText('Tk 1,00,000 · we owe');
  await expect(rb.locator('.rb-preview')).toContainText('Tk 90,000 · we owe');
  await save.click();
  await expect(page.getByText('Rebate of Tk 10,000 recorded')).toBeVisible();
  const row = dlg.locator('tbody tr').filter({ hasText: 'Invoice rebate — Credit note CN-118' });
  await expect(row).toContainText('90,000');
  expect((await call(request, 'accounts.list')).reduce((a, x) => a + x.balance, 0)).toBe(cashBefore);
  // void: admin password and a reason
  await row.getByRole('button', { name: 'Void' }).click();
  const rev = page.getByRole('dialog').last();
  await rev.locator('input[type=password]').fill('admin123');
  await rev.locator('textarea, input:not([type=password])').first().fill('Entered by mistake');
  await rev.getByRole('button', { name: /Cancel|Void|Confirm/ }).last().click();
  await expect(dlg.locator('tbody tr').filter({ hasText: 'Invoice rebate — Credit note CN-118' })).toHaveCount(0);
  expect((await call(request, 'suppliers.list')).find((s) => s.id === sup.id).balance).toBe(100000);
});

test('a promised rebate waits on the supplier until it is received', async ({ page, request }) => {
  const { sup } = await setup(request);
  let dlg = await openSupplier(page, sup.name);
  await dlg.getByRole('button', { name: 'Pay supplier' }).click();
  await page.getByRole('dialog', { name: /^Pay supplier/ }).getByLabel('Type').selectOption('rebate');
  const rb = page.getByRole('dialog', { name: /^Supplier rebate/ });
  await rb.getByRole('tab', { name: 'Not yet — only promised' }).click();
  await rb.getByLabel('Kind of rebate').selectOption('target');
  await rb.getByLabel('Rebate amount').fill('4000');
  await rb.getByLabel('Reason').fill('November target bonus');
  await rb.getByRole('button', { name: 'Save as promised' }).click();
  const pend = dlg.getByRole('region', { name: 'Promised rebates' });
  await expect(pend).toContainText('Tk 4,000 · November target bonus');
  expect((await call(request, 'suppliers.list')).find((s) => s.id === sup.id).balance).toBe(100000);
  await pend.getByRole('button', { name: /^Mark the/ }).click();
  const got = page.getByRole('dialog', { name: /^Receive promised rebate/ });
  await expect(got.getByLabel('Rebate amount')).toHaveValue('4000');
  await got.getByRole('button', { name: 'Save rebate' }).click();
  await expect(dlg.getByRole('region', { name: 'Promised rebates' })).toHaveCount(0);
  await expect(dlg.locator('tbody tr').filter({ hasText: 'Target bonus — November target bonus' })).toContainText('96,000');
  await page.goto('/#/reports?type=supplier_rebates');
  await expect(page.locator('.om-kpis')).toContainText('Rebates received');
  await expect(page.locator('tbody tr').filter({ hasText: sup.name }).first()).toContainText('Target bonus');
});
