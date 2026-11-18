import { test, expect } from '@playwright/test';
const endpoint = 'http://localhost:8787';
// Party Ledger menu card above Money & Reports with four admin-only pages: Customer / Supplier Ledger Report, then Adjust.
test('Party Ledger menu card sits above Money & Reports and opens its four pages', async ({ page, request }) => {
  const token = (await (await request.post(endpoint, { data: { action: 'login', payload: { username: 'admin', password: 'admin123' } } })).json()).data.token;
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.goto('/#/');
  const titles = await page.locator('.nav-card .nav-group').allInnerTexts();
  const at = titles.findIndex((t) => /^party ledger$/i.test(t));
  expect(at).toBeGreaterThan(-1);
  expect(titles[at + 1]).toMatch(/money & reports/i);
  const card = page.locator('.nav-card', { hasText: 'Party Ledger' });
  await expect(card.getByRole('link')).toHaveCount(4);
  expect((await card.getByRole('link').allInnerTexts()).map((t) => t.split('\n')[0].trim())).toEqual(['Customer Ledger Report', 'Supplier Ledger Report', 'Customer Ledger Adjust', 'Supplier Ledger Adjust']);
  await card.getByRole('link', { name: 'Customer Ledger Adjust' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Customer Ledger Adjust');
  await card.getByRole('link', { name: 'Supplier Ledger Adjust' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Supplier Ledger Adjust');
  for (const name of ['Customer Ledger Report', 'Supplier Ledger Report']) {
    await card.getByRole('link', { name }).click();
    await expect(page.locator('.page-head h1')).toHaveText(name);
  }
});

async function signIn(page, request, username = 'admin', password = 'admin123') {
  const r = await (await request.post(endpoint, { data: { action: 'login', payload: { username, password } } })).json();
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token: r.data.token });
  return r.data.token;
}
const callAs = (request, token) => async (action, payload = {}) => { const r = await (await request.post(endpoint, { data: { action, payload, token } })).json(); expect(r.ok, r.error).toBe(true); return r.data; };

test('customer write-off from Customer Ledger Adjust, then the full ledger with print, PDF and Excel', async ({ page, request }) => {
  const token = await signIn(page, request), call = callAs(request, token);
  const stamp = Date.now(), cash = (await call('bootstrap')).accounts[0].id;
  const svc = await call('product.save', { name: `Ledger svc ${stamp}`, service: true, sale_price: 100 });
  const c = await call('customer.save', { name: `Ledger cust ${stamp}`, phones: '01819556677' });
  const sale = (await call('sale.create', { customer_id: c.id, items: [{ product_id: svc.id, qty: 1, price: 10250 }], payments: [] })).sale;
  await call('customer.payment', { customer_id: c.id, account_id: cash, amount: 5000 });
  await call('customer.payment', { customer_id: c.id, account_id: cash, amount: 5200 });

  await page.goto('/#/customer-ledger-adjustment');
  const form = page.getByRole('region', { name: 'General information' });
  await page.getByPlaceholder(/Search customer/).fill(c.name);
  await page.getByRole('option', { name: new RegExp(c.name) }).click();
  await form.getByLabel('Sale invoice').selectOption(sale.id);
  await form.getByRole('button', { name: /Whole invoice due/ }).click();
  await expect(form.getByLabel('Amount')).toHaveValue('50');
  await form.getByLabel('Amount').fill('60');
  await expect(form).toContainText('has only Tk 50 still due');
  await expect(form.getByRole('button', { name: 'Save adjustment' })).toBeDisabled();
  await form.getByLabel('Amount').fill('50');
  await form.getByLabel('Reason').fill('Asked to leave the last 50');
  await expect(form.getByLabel('Balance after')).toContainText('0 · settled');
  await form.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.getByText(/CLA-\d+ saved · customer balance now Tk 0/)).toBeVisible();

  await page.getByRole('button', { name: 'Customer Ledger Report' }).click();
  await expect(page).toHaveURL(new RegExp(`customer-ledger-report\\?party=${c.id}`));
  const led = page.locator('.lr-list');
  await expect(led.locator('tbody tr').filter({ hasText: 'Leftover due written off' })).toContainText('Asked to leave the last 50');
  await expect(led.locator('tbody tr.tot')).toContainText('10,250');
  await expect(page.getByLabel('Totals')).toContainText('Closing');
  await page.getByLabel('Entry type').selectOption('payment');
  await expect(led.locator('tbody tr').filter({ hasText: 'COLLECTION' })).toHaveCount(2);
  await page.getByLabel('Entry type').selectOption('all');
  // invoice number opens the invoice
  await led.getByRole('button', { name: sale.invoice_no }).click();
  await expect(page.getByRole('dialog', { name: /Sale invoice/ })).toBeVisible();
  await page.keyboard.press('Escape');
  // Print opens the paper statement; PDF and Excel download
  await page.evaluate(() => { window.__printed = ''; const orig = HTMLIFrameElement.prototype; const w = Object.getOwnPropertyDescriptor(orig, 'contentWindow'); Object.defineProperty(orig, 'contentWindow', { get() { const cw = w.get.call(this); if (cw) cw.print = () => { window.__printed = cw.document.body.innerText; }; return cw; } }); });
  await page.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toContain('CUSTOMER LEDGER STATEMENT');
  expect(await page.evaluate(() => window.__printed)).toContain('Leftover due written off');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^customer-ledger-ledger-cust-\d+-.*\.pdf$/);
  const [xls] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()]);
  expect(xls.suggestedFilename()).toMatch(/\.xlsx$/);
  // back to every customer
  await page.getByRole('button', { name: '← All customers' }).click();
  await page.getByRole('button', { name: 'All time' }).click();
  await page.getByLabel('Hide zero balance').uncheck();
  await page.getByPlaceholder('Search this table').fill(c.name); // other tests' customers fill the first page in a full run
  await expect(page.locator('tbody tr').filter({ hasText: c.name })).toContainText('10,250');
});

test('staff without admin do not see Party Ledger and cannot open its pages', async ({ page, request }) => {
  const admin = callAs(request, (await (await request.post(endpoint, { data: { action: 'login', payload: { username: 'admin', password: 'admin123' } } })).json()).data.token);
  const u = `ledgermgr${Date.now() % 100000}`;
  await admin('user.save', { name: 'Ledger manager', username: u, role: 'manager', password: 'ledger-pass-123' });
  await signIn(page, request, u, 'ledger-pass-123');
  await page.goto('/#/');
  await expect(page.locator('nav a', { hasText: 'Dashboard' })).toBeVisible();
  await expect(page.locator('.nav-card', { hasText: 'Party Ledger' })).toHaveCount(0);
  await page.goto('/#/supplier-ledger-report');
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});
