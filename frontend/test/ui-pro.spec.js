import { test, expect } from '@playwright/test';

// The professional-look release: sidebar folding, dashboard, empty states, POS quick add, day close,
// financial statements, shop logo on the menu and sign-in screen, and the invoice QR code.
const endpoint = 'http://localhost:8787';
let token, cash;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  cash = (await call(request, 'bootstrap')).accounts[0].id;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); }, { endpoint, token });
});

test('menu groups fold away, stay folded after a reload, and shortcuts show on hover', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/#/');
  const stock = page.locator('.nav-card', { hasText: 'Stock' });
  await expect(stock.getByRole('link', { name: /Products & stock/ })).toBeVisible();
  await stock.getByRole('button', { name: 'Stock menu group' }).click();
  await expect(stock.getByRole('link')).toHaveCount(0);
  await expect(stock.locator('.nav-count')).toHaveText('4');
  await page.reload();
  await expect(page.locator('.nav-card', { hasText: 'Stock' }).getByRole('link')).toHaveCount(0);
  // The group of the open page never stays folded.
  await page.goto('/#/stock');
  await expect(page.locator('.nav-card', { hasText: 'Stock' }).getByRole('link', { name: /Products & stock/ })).toBeVisible();
  await page.locator('.nav-card', { hasText: 'Stock' }).getByRole('button', { name: 'Stock menu group' }).click(); // unfold for later tests
  const pos = page.getByRole('link', { name: /Point of sale/ });
  await expect(pos.locator('kbd')).toHaveCSS('opacity', '0');
  await pos.hover();
  await expect(pos.locator('kbd')).toHaveCSS('opacity', '1');
});

test('dashboard: needs attention, history tabs and the sales chart', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/');
  const att = page.locator('.attention');
  await expect(att.getByRole('link', { name: /Low stock items/ })).toBeVisible();
  await expect(page.locator('.sales-chart svg')).toBeVisible();
  const hist = page.locator('.dash-history');
  await hist.getByRole('tab', { name: 'Expenses', exact: true }).click();
  await expect(hist.locator('.stat').first()).toContainText(/expense/);
  await expect(hist.getByRole('link', { name: 'Open expenses' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('POS quick add: best sellers, recent products and favourites', async ({ page, request }) => {
  const p = await call(request, 'product.save', { name: `Quick add cable ${Date.now()}`, sale_price: 120 });
  await call(request, 'purchase.create', { items: [{ product_id: p.id, qty: 5, cost: 80 }], payments: [{ account_id: cash, amount: 400 }] });
  await call(request, 'sale.create', { items: [{ product_id: p.id, qty: 1, price: 120 }], payments: [{ account_id: cash, amount: 120 }], send_sms: false });
  await page.goto('/#/pos');
  const picks = page.locator('.quick-picks');
  await expect(picks.locator('.qp-tile').first()).toBeVisible(); // best sellers from the last 60 days
  const search = page.getByRole('combobox', { name: 'Search product' });
  await search.fill(p.name); await search.press('Enter');
  await expect(page.locator('.cart tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /Clear cart/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await picks.getByRole('tab', { name: 'Recent' }).click();
  await picks.getByRole('button', { name: `Add ${p.name} to favourites`, exact: true }).click();
  await picks.getByRole('tab', { name: 'Favourites' }).click();
  await page.reload();
  await expect(page.locator('.quick-picks').getByRole('tab', { name: 'Favourites' })).toHaveAttribute('aria-selected', 'true');
  await page.locator('.quick-picks').getByRole('button', { name: `Add ${p.name}`, exact: true }).click();
  await expect(page.locator('.cart tbody tr')).toHaveCount(1);
  await expect(page.locator('.quick-picks')).toHaveCount(0);
});

test('day close: count the drawer, explain a shortage, then the day shows as closed', async ({ page, request }) => {
  const acc = await call(request, 'account.save', { name: `Drawer ${Date.now()}`, type: 'cash', opening_balance: 1000 });
  await page.goto('/#/shifts');
  await page.getByRole('tab', { name: 'Day close' }).click();
  await page.getByLabel('Account to close').selectOption(acc.id);
  await expect(page.locator('.dc-big').first()).toContainText('Tk 1,000');
  await page.getByLabel('Number of Tk 500', { exact: true }).fill('1');
  await page.getByLabel('Number of Tk 100', { exact: true }).fill('4');
  await expect(page.getByLabel('Counted total')).toHaveValue('900');
  await expect(page.locator('.dc-diff')).toContainText('Short by');
  const close = page.getByRole('button', { name: 'Close the day' });
  await expect(close).toBeDisabled();
  await page.getByPlaceholder(/Gave change/).fill('Paid the tea boy');
  await close.click();
  await expect(page.getByText('Closed · locked', { exact: true })).toBeVisible();
  await expect(page.locator('.dc-hist')).toContainText('Paid the tea boy');
  expect((await call(request, 'accounts.list')).find((a) => a.id === acc.id).balance).toBe(900);
});

test('reports hub shows a profit & loss statement and a balance sheet', async ({ page }) => {
  await page.goto('/#/reports?type=profit_loss');
  const st = page.locator('.statement');
  await expect(st.getByRole('heading', { name: /Profit & loss/ })).toBeVisible();
  await expect(st.locator('.st-grand')).toContainText('Net profit');
  await page.getByRole('combobox', { name: 'Report' }).selectOption('balance_sheet');
  await expect(page.locator('.statement').getByRole('heading', { name: /Balance sheet/ })).toBeVisible();
  const grand = page.locator('.st-grand td.r');
  await expect(grand).toHaveCount(2);
  expect(await grand.nth(0).textContent()).toBe(await grand.nth(1).textContent()); // assets = liabilities + equity
});

test('shop logo shows in the menu and on the sign-in screen; invoices carry a QR code', async ({ page, request, browser }) => {
  await call(request, 'settings.save', { values: { shop_logo: LOGO, invoice_qr: 'true' } });
  await page.goto('/#/');
  await expect(page.locator('.brand-logo')).toHaveAttribute('src', LOGO);
  const html = await page.evaluate(async () => {
    const { api } = await import('/src/lib/api.js'); const docs = await import('/src/lib/salesDocs.js');
    const list = await api('sales.list', {}); const rows = list.rows || list;
    return rows.length ? docs.saleDocHtml(await api('sale.detail', { id: rows[0].id })) : '';
  });
  if (html) { expect(html).toContain('class="inv-qr"'); expect(html).toContain(LOGO); }
  // A new tab without a session: the sign-in screen greets with the shop's name and logo.
  const ctx = await browser.newContext(); const fresh = await ctx.newPage();
  await fresh.goto('/');
  await fresh.evaluate((endpoint) => localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })), endpoint);
  await fresh.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('karvio_brand:')); if (!k) localStorage.setItem('karvio_brand:http://localhost:8787', JSON.stringify({ name: 'Logo Test Shop', logo: '' })); });
  await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('karvio_brand:'))).then((entries) => fresh.evaluate((e) => e.forEach(([k, v]) => localStorage.setItem(k, v)), entries));
  await fresh.reload();
  await expect(fresh.locator('.auth.branded .auth-shop-logo')).toHaveAttribute('src', LOGO);
  await expect(fresh.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await ctx.close();
  await call(request, 'settings.save', { values: { shop_logo: '' } });
});

test('empty and loading states are shaped, not blank', async ({ page }) => {
  await page.route(endpoint, async (route) => {
    if (route.request().postDataJSON().action === 'sales.list') await new Promise((r) => setTimeout(r, 1200));
    return route.continue();
  });
  await page.goto('/#/sales');
  await expect(page.locator('.sk-row').first()).toBeVisible();
  await expect(page.locator('.sk-row')).toHaveCount(0, { timeout: 8000 });
  await page.goto('/#/stock');
  await page.getByLabel('Exact stock qty').fill('987654');
  await expect(page.locator('.empty .empty-ic')).toBeVisible();
  await expect(page.getByText('No products match these filters')).toBeVisible();
});

test('browser tab title is the open page name in capitals', async ({ page }) => {
  await page.goto('/#/barcodes');
  await expect(page).toHaveTitle('BARCODE LABELS');
  await page.goto('/#/accounts?tab=dayclose'); // Day close moved to Shift & day close
  await expect(page).toHaveTitle('SHIFT & DAY CLOSE');
  await page.goto('/#/');
  await expect(page).toHaveTitle('DASHBOARD');
});
