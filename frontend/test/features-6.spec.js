import { test, expect } from '@playwright/test';

// Customers / Suppliers are plain directories; dues, ledgers and payments live under Collection / Payment.
const endpoint = 'http://localhost:8787';
let token, today;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123', device: 'Test runner' })).token;
  today = (await call(request, 'bootstrap')).serverToday;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('Customers is a directory; Collection shows the dues and takes the payment', async ({ page, request }) => {
  const stamp = Date.now();
  const svc = await call(request, 'product.save', { name: `Coll svc ${stamp}`, service: true, sale_price: 100 });
  const owes = await call(request, 'customer.save', { name: `Coll owes ${stamp}`, phones: '017' + String(stamp).slice(-8) });
  const clear = await call(request, 'customer.save', { name: `Coll clear ${stamp}`, phones: '018' + String(stamp).slice(-8) });
  await call(request, 'sale.create', { customer_id: owes.id, items: [{ product_id: svc.id, qty: 1, price: 2500 }], payments: [] });

  await page.goto('/#/customers');
  await expect(page.locator('.page-head h1')).toHaveText('Customers');
  const menu = (await page.locator('nav a').allTextContents()).map((t) => t.replace(/Alt.*$/, '').trim());
  for (const name of ['Customers', 'Collection', 'Payment', 'Suppliers']) expect(menu).toContain(name);
  expect(menu).not.toContain('Customers & dues');
  await expect(page.getByRole('tab', { name: 'With dues' })).toHaveCount(0);
  await page.getByLabel('Search customers').fill(`Coll ${stamp}`);
  await expect(page.locator('.pl-table thead')).not.toContainText(/Due|Balance/);
  await expect(page.locator('.pl-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.pl-table tbody')).not.toContainText('2,500');
  await page.getByText(owes.name, { exact: true }).click();
  const profile = page.getByRole('dialog', { name: owes.name });
  await expect(profile.getByRole('button', { name: 'Edit details' })).toBeVisible();
  await expect(profile.getByRole('button', { name: 'Collect payment' })).toHaveCount(0);
  await expect(profile).not.toContainText('2,500');
  await profile.getByRole('button', { name: 'Open in Collection' }).click();

  await expect(page).toHaveURL(new RegExp(`#/collection/${owes.id}$`));
  await expect(page.locator('.page-head h1')).toHaveText('Collection');
  const ledger = page.getByRole('dialog', { name: owes.name, exact: true });
  await expect(ledger).toContainText('Tk 2,500 (customer owes)');
  await expect(ledger.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
  await ledger.getByRole('button', { name: 'Collect payment' }).click();
  const pay = page.getByRole('dialog', { name: /^Collect payment/ });
  await pay.getByLabel('Amount').fill('1000');
  await pay.getByRole('button', { name: /Save/ }).click();
  await expect(ledger).toContainText('Tk 1,500 (customer owes)');
  await ledger.getByRole('button', { name: 'Close' }).click().catch(() => page.keyboard.press('Escape'));

  // Collection opens on the people who owe; the others are under All
  await page.goto('/#/collection');
  await page.getByLabel('Search customers').fill(`Coll ${stamp}`);
  await expect(page.locator('.pl-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.pl-table tbody tr')).toContainText('1,500');
  await page.getByRole('tab', { name: 'All', exact: true }).click();
  await page.getByLabel('Search customers').fill(`Coll ${stamp}`);
  await expect(page.locator('.pl-table tbody tr')).toHaveCount(2);
  expect(clear.id).toBeTruthy();
});

test('Suppliers is a directory; Payment shows what we owe and pays it', async ({ page, request }) => {
  const stamp = Date.now();
  const sup = await call(request, 'supplier.save', { name: `Pay sup ${stamp}` });
  const prod = await call(request, 'product.save', { name: `Pay item ${stamp}`, sale_price: 150 });
  await call(request, 'purchase.create', { supplier_id: sup.id, date: today, items: [{ product_id: prod.id, qty: 10, cost: 100, sale_price: 150 }], payments: [] });
  await page.goto('/#/suppliers');
  await expect(page.locator('.page-head h1')).toHaveText('Suppliers');
  await page.getByLabel('Search suppliers').fill(sup.name);
  await expect(page.locator('.pl-table thead')).not.toContainText(/We owe|Balance/);
  await page.getByText(sup.name, { exact: true }).click();
  await expect(page.getByRole('dialog', { name: sup.name }).getByRole('button', { name: 'Pay supplier' })).toHaveCount(0);
  await page.getByRole('dialog', { name: sup.name }).getByRole('button', { name: 'Open in Payment' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Payment');
  const ledger = page.getByRole('dialog', { name: sup.name, exact: true });
  await expect(ledger).toContainText('Tk 1,000 (we owe)');
  await ledger.getByRole('button', { name: 'Pay supplier' }).click();
  const pay = page.getByRole('dialog', { name: /^Pay supplier/ });
  await pay.getByLabel('Amount').fill('400');
  await pay.getByRole('button', { name: /Save/ }).click();
  await expect(ledger).toContainText('Tk 600 (we owe)');
  await page.goto('/#/payment');
  await page.getByLabel('Search suppliers').fill(sup.name);
  await expect(page.locator('.pl-table tbody tr')).toContainText('600');
});

test('a part payment asks for the next payment date and reminds on the dashboard that day', async ({ page, request }) => {
  const stamp = Date.now();
  const svc = await call(request, 'product.save', { name: `Next svc ${stamp}`, service: true, sale_price: 100 });
  const c = await call(request, 'customer.save', { name: `Next pay ${stamp}`, phones: '016' + String(stamp).slice(-8) });
  await call(request, 'sale.create', { customer_id: c.id, items: [{ product_id: svc.id, qty: 1, price: 5000 }], payments: [] });
  await page.goto(`/#/collection/${c.id}`);
  const ledger = page.getByRole('dialog', { name: c.name, exact: true });
  await ledger.getByRole('button', { name: 'Collect payment' }).click();
  const pay = page.getByRole('dialog', { name: /^Collect payment/ });
  await expect(pay.getByLabel('Next payment date')).toHaveCount(0); // full amount is filled in first
  await pay.getByLabel('Amount').fill('2000');
  await expect(pay.locator('.next-due')).toContainText('Tk 3,000 will still be due');
  await pay.getByLabel('Next payment date').click();
  await page.getByRole('dialog', { name: 'Choose a date' }).getByRole('button', { name: 'Today', exact: true }).click();
  await pay.getByLabel('Print money receipt').uncheck();
  await pay.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText(/Payment recorded · reminder set for/)).toBeVisible();
  await expect(ledger.getByRole('region', { name: 'Promised payment' })).toContainText('due now');
  await page.goto('/#/');
  const row = page.locator('#reminders .rem-row').filter({ hasText: c.name });
  await expect(row).toContainText('Payment due today');
  await expect(row).toContainText('Tk 3,000');
  await expect(row).toContainText('rest of the due');
  await row.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('#reminders .rem-row').filter({ hasText: c.name })).toHaveCount(0);
});

test('editing a customer from the directory closes the profile window first', async ({ page, request }) => {
  const c = await call(request, 'customer.save', { name: `Edit me ${Date.now()}`, phones: '015' + String(Date.now()).slice(-8) });
  await page.goto(`/#/customers/${c.id}`);
  await page.getByRole('dialog', { name: c.name, exact: true }).getByRole('button', { name: 'Edit details' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const form = page.getByRole('dialog', { name: `Edit ${c.name}` });
  await form.getByLabel('Note').fill('VIP');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog', { name: c.name, exact: true })).toContainText('VIP');
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test('switching the pay-supplier type to rebate and back does not replay the opening animation', async ({ page, request }) => {
  const sup = await call(request, 'supplier.save', { name: `Flick sup ${Date.now()}` });
  await page.goto(`/#/payment/${sup.id}`);
  await page.getByRole('dialog', { name: sup.name, exact: true }).getByRole('button', { name: 'Pay supplier' }).click();
  await expect(page.locator('.modal-bg').last()).not.toHaveClass(/instant/);
  await page.getByRole('dialog', { name: /^Pay supplier/ }).getByLabel('Type').selectOption('rebate');
  await expect(page.getByRole('dialog', { name: /^Supplier rebate/ })).toBeVisible();
  await expect(page.locator('.modal-bg').last()).toHaveClass(/instant/);
  await page.getByRole('dialog', { name: /^Supplier rebate/ }).getByLabel('Type').selectOption('pay');
  await expect(page.getByRole('dialog', { name: /^Pay supplier/ })).toBeVisible();
  await expect(page.locator('.modal-bg').last()).toHaveClass(/instant/);
});

test('stock report: click a product without supplier warranty to open its purchase and set the date', async ({ page, request }) => {
  const stamp = Date.now();
  const sup = await call(request, 'supplier.save', { name: `Warr sup ${stamp}` });
  const p = await call(request, 'product.save', { name: `Warr item ${stamp}`, sale_price: 150 });
  const other = await call(request, 'product.save', { name: `Warr other ${stamp}`, sale_price: 90 });
  const pur = (await call(request, 'purchase.create', { supplier_id: sup.id, date: today, items: [{ product_id: p.id, qty: 5, cost: 100, sale_price: 150 }, { product_id: other.id, qty: 2, cost: 50, sale_price: 90 }], payments: [] })).purchase;
  await page.goto('/#/reports?type=stock_summary&filter=warranty_unknown');
  await page.getByPlaceholder(/Search/).first().fill(p.name);
  await page.locator('tbody tr').filter({ hasText: p.name }).first().click();
  // one purchase behind this stock: the full purchase window opens, with every item of that invoice
  const dlg = page.getByRole('dialog', { name: `Purchase ${pur.invoice_no}` });
  await expect(dlg).toContainText(other.name);
  await dlg.locator('tr').filter({ hasText: p.name }).getByRole('button', { name: 'Set supplier warranty' }).click();
  const w = page.getByRole('dialog', { name: 'Supplier warranty expiry' });
  await w.locator('.dinput input').fill('15/11/2030'); await w.locator('.dinput input').blur();
  await w.getByRole('button', { name: 'Save warranty date' }).click();
  await expect(dlg).toContainText('Supplier warranty: 15 Nov 2030');
  expect((await call(request, 'purchase.detail', { id: pur.id })).items[0].supplier_warranty_expiry).toBe('2030-11-15');
  await dlg.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('tbody tr').filter({ hasText: p.name })).toHaveCount(0);
  // two purchases behind one product: choose which purchase to open
  const pur2 = (await call(request, 'purchase.create', { supplier_id: sup.id, date: today, items: [{ product_id: other.id, qty: 3, cost: 50, sale_price: 90 }], payments: [] })).purchase;
  await page.reload();
  await page.getByPlaceholder(/Search/).first().fill(other.name);
  await page.locator('tbody tr').filter({ hasText: other.name }).first().click();
  const pick = page.getByRole('dialog', { name: `Supplier warranty not set — ${other.name}` });
  await expect(pick).toContainText(pur.invoice_no);
  await pick.getByRole('button', { name: `Open purchase ${pur2.invoice_no}` }).click();
  await expect(page.getByRole('dialog', { name: `Purchase ${pur2.invoice_no}` })).toBeVisible();
});
