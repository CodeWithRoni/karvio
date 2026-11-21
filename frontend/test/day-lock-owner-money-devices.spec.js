import { test, expect } from '@playwright/test';

// Day lock after Day close, owner's money, slow-moving stock, devices & logins, invoice on WhatsApp.
const endpoint = 'http://localhost:8787';
let token, cash, today;
async function raw(request, action, payload = {}, t = token) { return (await request.post(endpoint, { data: { action, payload, token: t } })).json(); }
async function call(request, action, payload = {}) { const r = await raw(request, action, payload); expect(r.ok, r.error).toBe(true); return r.data; }
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123', device: 'Test runner' })).token;
  const b = await call(request, 'bootstrap'); cash = b.accounts[0].id; today = b.serverToday;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('a closed day is locked for that account until an admin reopens it', async ({ page, request }) => {
  const acc = await call(request, 'account.save', { name: `Lock ${Date.now()}`, type: 'cash', opening_balance: 500 });
  await call(request, 'dayclose.save', { account_id: acc.id, date: today, counted: 500, note: '' });
  const blocked = await raw(request, 'account.entry', { kind: 'deposit', account_id: acc.id, amount: 10, date: today });
  expect(blocked.error).toMatch(/is closed for Lock/);
  await page.goto('/#/cash-bank?tab=dayclose');
  await page.getByLabel('Account to close').selectOption(acc.id);
  await expect(page.getByText('Closed · locked', { exact: true })).toBeVisible();
  await expect(page.locator('.dc-lock')).toContainText('This day is locked');
  await page.getByRole('button', { name: 'Reopen the day' }).click();
  const dlg = page.getByRole('dialog', { name: /^Reopen Lock/ });
  await expect(dlg.getByRole('button', { name: 'Reopen the day' })).toBeDisabled();
  await dlg.getByLabel('Reason').fill('Missed a deposit');
  await dlg.getByLabel('Your password').fill('admin123');
  await dlg.getByRole('button', { name: 'Reopen the day' }).click();
  await expect(page.getByRole('button', { name: 'Close the day' })).toBeVisible();
  await expect(page.locator('.dc-hist')).toContainText('reopened by');
  await call(request, 'account.entry', { kind: 'deposit', account_id: acc.id, amount: 10, date: today });
});

test("owner's money lists what the owner put in and took out", async ({ page, request }) => {
  const before = await call(request, 'owner.money', {});
  await page.goto('/#/cash-bank');
  await page.getByRole('tab', { name: "Owner's money" }).click();
  await page.getByRole('button', { name: 'Owner put money in' }).click();
  const dlg = page.getByRole('dialog', { name: 'Deposit or withdraw' });
  await expect(dlg.getByLabel('Type')).toHaveValue('deposit');
  const note = `Capital ${Date.now()}`;
  await dlg.getByLabel('Amount').fill('125000');
  await dlg.getByLabel('Note').fill(note);
  await dlg.getByRole('button', { name: 'Save' }).click();
  const row = page.locator('.dc-hist tbody tr').filter({ hasText: note });
  await expect(row).toContainText('Put in');
  await expect(row).toContainText('+ Tk 1,25,000');
  const after = await call(request, 'owner.money', {});
  expect(after.invested - before.invested).toBe(125000);
  await call(request, 'reverse', { type: 'account', id: after.rows.find((r) => r.note === note).id, reason: 'test', password: 'admin123' });
});

test('slow-moving stock report shows the money tied up', async ({ page, request }) => {
  const sup = await call(request, 'supplier.save', { name: `Slow sup ${Date.now()}` });
  const p = await call(request, 'product.save', { name: `Slow item ${Date.now()}`, sale_price: 1500 });
  const old = new Date(Date.parse(today + 'T12:00:00Z') - 95 * 864e5).toISOString().slice(0, 10);
  await call(request, 'purchase.create', { supplier_id: sup.id, date: old, items: [{ product_id: p.id, qty: 3, cost: 1000, sale_price: 1500 }], payments: [] });
  await page.goto('/#/reports?type=slow_stock');
  await page.getByRole('tab', { name: '90 days', exact: true }).click();
  await expect(page.locator('.om-kpis')).toContainText('Money tied up');
  const row = page.locator('tbody tr').filter({ hasText: p.name });
  await expect(row).toContainText('Never sold');
  await expect(row).toContainText('3,000');
  await page.getByRole('tab', { name: '180 days', exact: true }).click();
  await expect(page.locator('tbody tr').filter({ hasText: p.name })).toHaveCount(0);
});

test('devices & logins: see signed-in devices and sign one out', async ({ page, request }) => {
  const device = `Test phone ${Date.now()}`;
  const other = (await call(request, 'login', { username: 'admin', password: 'admin123', device })).token;
  await raw(request, 'login', { username: 'admin', password: 'wrong-one', device });
  await page.goto('/#/users');
  await page.getByRole('tab', { name: 'Devices & logins' }).click();
  await expect(page.locator('.sess').first()).toContainText('this device');
  await expect(page.locator('.sess').nth(1)).toContainText('Wrong password');
  await page.getByRole('button', { name: `Sign out Harness`, exact: false }).first().waitFor({ state: 'attached', timeout: 1000 }).catch(() => {});
  await page.locator('.sess').first().locator('tr').filter({ hasText: device }).getByRole('button', { name: /^Sign out/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('.sess').first().locator('tr').filter({ hasText: device })).toHaveCount(0);
  expect((await raw(request, 'bootstrap', {}, other)).error).toMatch(/signed out by an admin/);
  expect((await raw(request, 'bootstrap')).ok).toBe(true);
});

test('send an invoice on WhatsApp with the number and link filled in', async ({ page, request }) => {
  const stamp = Date.now();
  const c = await call(request, 'customer.save', { name: `Wa ${stamp}`, phones: '017' + String(stamp).slice(-8) });
  const svc = await call(request, 'product.save', { name: `Wa svc ${stamp}`, service: true, sale_price: 100 });
  const s = await call(request, 'sale.create', { customer_id: c.id, items: [{ product_id: svc.id, qty: 1, price: 150000 }], payments: [{ account_id: (await call(request, 'account.save', { name: `Wa acc ${stamp}`, type: 'bank', opening_balance: 0 })).id, amount: 50000 }] });
  await page.addInitScript(() => { window.open = () => (window.__wa = { location: {}, close() {} }); });
  await page.goto('/#/sales');
  await page.getByText(s.sale.invoice_no, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Send on WhatsApp' }).click();
  await expect.poll(() => page.evaluate(() => window.__wa?.location?.href || '')).toContain('https://wa.me/88017' + String(stamp).slice(-8));
  const text = decodeURIComponent((await page.evaluate(() => window.__wa.location.href)).split('?text=')[1]);
  expect(text).toContain(`Wa ${stamp}`);
  expect(text).toContain(s.sale.invoice_no);
  expect(text).toContain('Total: Tk 1,50,000 · Paid: Tk 50,000 · Due: Tk 1,00,000');
  expect(text).toMatch(/#\/(i|invoice|s)\//);
});
