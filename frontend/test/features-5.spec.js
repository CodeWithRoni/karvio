import { test, expect } from '@playwright/test';

// Supplier rebates on Supplier Ledger Adjust: record one, see it in the ledger and the report, promised rebates, cancel with the admin password.
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
const openAdjust = async (page, name) => {
  await page.goto('/#/supplier-ledger-adjustment');
  await page.getByPlaceholder(/Search supplier/).fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).click();
  return page.getByRole('region', { name: 'General information' });
};

test('a supplier rebate (Supplier Ledger Adjust · Deduction) lowers what we owe without touching any account', async ({ page, request }) => {
  const { sup, pur } = await setup(request);
  const cashBefore = (await call(request, 'accounts.list')).reduce((a, x) => a + x.balance, 0);
  const form = await openAdjust(page, sup.name);
  await expect(form.getByLabel('Account')).toHaveCount(0);
  await expect(form.getByRole('radio', { name: /Deduction/ })).toBeChecked();
  const save = form.getByRole('button', { name: 'Save adjustment' });
  await form.getByLabel('Amount').fill('10000');
  await expect(save).toBeDisabled();
  await form.getByLabel('Purchase invoice').selectOption(pur.id);
  await form.getByLabel('Reference no').fill('CN-118');
  await form.getByLabel('Reason').fill('Credit note');
  await expect(form.getByLabel('Balance after')).toContainText('Tk 1,00,000 · we owe');
  await expect(form.getByLabel('Balance after')).toContainText('Tk 90,000 · we owe');
  await save.click();
  await expect(page.getByText(/SLA-\d+ saved · supplier balance now Tk 90,000 · we owe/)).toBeVisible();
  const row = page.getByRole('region', { name: 'Recent adjustments' }).locator('tbody tr').filter({ hasText: sup.name });
  await expect(row).toContainText('Invoice rebate');
  await expect(row).toContainText('Credit note · Ref: CN-118');
  expect((await call(request, 'accounts.list')).reduce((a, x) => a + x.balance, 0)).toBe(cashBefore);
  // the Payment ledger shows it too, but it is cancelled from the adjust page
  await page.goto(`/#/payment/${sup.id}`);
  await expect(page.getByRole('dialog', { name: sup.name, exact: true }).locator('tbody tr').filter({ hasText: 'Invoice rebate — Credit note' })).toContainText('90,000');
  await page.goto('/#/supplier-ledger-adjustment');
  await page.getByRole('region', { name: 'Recent adjustments' }).locator('tbody tr').filter({ hasText: sup.name }).getByRole('button', { name: 'Cancel' }).click();
  const rev = page.getByRole('dialog').last();
  await rev.locator('input[type=password]').fill('admin123');
  await rev.locator('input:not([type=password])').first().fill('Entered by mistake');
  await rev.getByRole('button', { name: /^Cancel adjustment/ }).click();
  await expect(page.getByRole('region', { name: 'Recent adjustments' }).locator('tbody tr').filter({ hasText: sup.name })).toHaveCount(0);
  expect((await call(request, 'suppliers.list')).find((s) => s.id === sup.id).balance).toBe(100000);
});

test('a promised rebate waits on the adjust page until it is received', async ({ page, request }) => {
  const { sup } = await setup(request);
  const form = await openAdjust(page, sup.name);
  await form.getByRole('tab', { name: 'Only promised' }).click();
  await form.getByLabel('Adjustment type').selectOption('target');
  await form.getByLabel('Amount').fill('4000');
  await form.getByLabel('Reason').fill('November target bonus');
  await form.getByRole('button', { name: 'Save as promised' }).click();
  const pend = page.getByRole('region', { name: 'Promised rebates' });
  await expect(pend).toContainText('November target bonus');
  expect((await call(request, 'suppliers.list')).find((s) => s.id === sup.id).balance).toBe(100000);
  await pend.getByRole('button', { name: new RegExp(`^Mark the .* rebate from ${sup.name} received`) }).click();
  await expect(form.getByLabel('Amount')).toHaveValue('4000');
  await expect(form).toContainText('Receiving a promised rebate');
  await form.getByRole('button', { name: 'Save received rebate' }).click();
  await expect(page.getByRole('region', { name: 'Promised rebates' }).getByText(sup.name)).toHaveCount(0);
  expect((await call(request, 'suppliers.list')).find((s) => s.id === sup.id).balance).toBe(96000);
  await page.goto('/#/reports?type=supplier_rebates');
  await expect(page.locator('.om-kpis')).toContainText('Rebates received');
  await expect(page.locator('tbody tr').filter({ hasText: sup.name }).first()).toContainText('Target bonus');
});

test('Pay supplier only pays: no refund and no rebate there any more', async ({ page, request }) => {
  const { sup } = await setup(request);
  await page.goto(`/#/payment/${sup.id}`);
  await page.getByRole('dialog', { name: sup.name, exact: true }).getByRole('button', { name: 'Pay supplier' }).click();
  const pay = page.getByRole('dialog', { name: /^Pay supplier/ });
  await expect(pay.getByLabel('Amount')).toBeVisible();
  await expect(pay.getByLabel('Type')).toHaveCount(0);
  await expect(pay.locator('.form')).not.toContainText(/refund|rebate/i);
});
