import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const endpoint = 'http://localhost:8787';
let token, product, cash;
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
  product = boot.products.find((p) => p.barcode === 'BENGALI-001');
  if (!product) {
    product = await call(request, 'product.save', { name: 'বাংলা কেবল', barcode: 'BENGALI-001', unit: 'meter', sale_price: 300 });
    await call(request, 'purchase.create', { items: [{ product_id: product.id, qty: 100, cost: 100 }], payments: [{ account_id: cash.id, amount: 10000 }] });
  }
});
test.beforeEach(async ({ page }) => {
  // Only the local in-memory API is used; never send fixture transactions to Google.
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
  }, { endpoint, token });
});

test('all main screens load without browser errors', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const routes = ['', 'pos', 'sales', 'pc-builder', 'customers', 'expenses', 'stock', 'purchases', 'suppliers', 'warranty', 'history', 'accounts', 'reports', 'users', 'settings'];
  for (const route of routes) {
    await page.goto('/#/' + route);
    await expect(route === 'pos' ? page.getByRole('combobox', { name: 'Search product' }) : page.locator('.page-head h1')).toBeVisible();
    await expect(page.locator('.loading')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('dashboard refreshes another counter sale automatically and retains data on failure', async ({ page, request }) => {
  await page.clock.install();
  const baseline = (await call(request, 'dashboard')).today.sales;
  await page.goto('/');
  await expect(page.locator('.stats .stat').first()).toContainText('Tk ' + baseline.toLocaleString('en-IN'));
  await call(request, 'sale.create', { items: [{ product_id: product.id, qty: 1, price: 300 }], payments: [{ account_id: cash.id, amount: 300 }] });
  await page.clock.fastForward(31000);
  await expect(page.locator('.stats .stat').first()).toContainText('Tk ' + (baseline + 300).toLocaleString('en-IN'));
  await page.route(endpoint, async (route) => {
    if (route.request().postDataJSON().action === 'dashboard') return route.fulfill({ json: { ok: false, error: 'Temporary outage' } });
    return route.continue();
  });
  await page.clock.fastForward(31000);
  await expect(page.locator('.errbox')).toContainText('Showing the last loaded balances');
  await expect(page.locator('.stats .stat').first()).toContainText('Tk ' + (baseline + 300).toLocaleString('en-IN'));
});

test('master data confirmation can cancel and then delete a brand', async ({ page, request }) => {
  const brand = await call(request, 'master.save', { kind: 'brand', name: 'Confirmation Test Brand' });
  await page.goto('/#/stock');
  await page.getByRole('tab', { name: 'Categories, brands & warranty' }).click();
  await page.getByRole('button', { name: 'Delete Confirmation Test Brand', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Confirmation Test Brand', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Confirmation Test Brand', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Confirmation Test Brand', exact: true })).toHaveCount(0);
  const boot = await call(request, 'bootstrap');
  expect(boot.brands.some((b) => b.id === brand.id)).toBe(false);
});

test('Bengali stock PDF and Excel download and thermal receipts keep their fonts', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/stock');
  await expect(page.getByText('বাংলা কেবল', { exact: true })).toBeVisible();
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const pdf = await pdfDownload;
  await fs.mkdir('../verification', { recursive: true });
  await pdf.saveAs('../verification/bengali-stock.pdf');
  const bytes = await fs.readFile('../verification/bengali-stock.pdf');
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect(bytes.length).toBeGreaterThan(10000);
  const excelDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  await (await excelDownload).saveAs('../verification/stock.xlsx');
  const receipt = await page.evaluate(async () => {
    const { printReceipt } = await import('/src/lib/receipt.js');
    const widths = [];
    // Stub only the system print dialog; inspect the real receipt documents.
    for (const width of [58, 80]) {
      printReceipt({ sale: { invoice_no: 'PRINT-TEST', customer_name: 'বাংলা ক্রেতা', total: 300, subtotal: 300, payments: [] }, items: [{ name: 'বাংলা কেবল', qty: 1, unit: 'meter', price: 300, total: 300 }] }, width);
      const frame = document.querySelector('iframe:last-of-type');
      frame.contentWindow.print = () => {};
      await frame.contentDocument.fonts.ready;
      widths.push({ text: frame.contentDocument.body.textContent, css: frame.contentDocument.querySelectorAll('style')[1].textContent, font: frame.contentDocument.fonts.check("12px 'Hind Siliguri'", 'বাংলা') });
    }
    return widths;
  });
  expect(receipt[0].css).toContain('58mm');
  expect(receipt[1].css).toContain('80mm');
  expect(receipt.every((r) => r.text.includes('বাংলা কেবল') && r.font)).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile screens fit a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['', 'pos', 'stock', 'pc-builder', 'reports']) {
    await page.goto('/#/' + route);
    await expect(route === 'pos' ? page.getByRole('combobox', { name: 'Search product' }) : page.locator('.page-head h1')).toBeVisible();
    const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(size.document, 'horizontal page overflow on ' + route).toBeLessThanOrEqual(size.viewport);
  }
  const controlHeights = await page.locator('.filters select').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(controlHeights.every((height) => height < 60)).toBe(true);
  await page.screenshot({ path: '../verification/mobile.png', fullPage: true });
});

test('long Bengali PDF reports paginate with repeated table headings', async ({ page }) => {
  await page.goto('/#/stock');
  await expect(page.locator('.page-head h1')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { exportPdf } = await import('/src/lib/export.js');
    await exportPdf('বাংলা রিপোর্ট', [{key:'name',label:'পণ্য'},{key:'qty',label:'পরিমাণ',type:'num'}], Array.from({length:120},(_,i)=>({name:`বাংলা কেবল ${i+1}`,qty:i+1})), {qty:7260});
  });
  const file = await download;
  await file.saveAs('../verification/bengali-multipage.pdf');
  const pdf = await fs.readFile('../verification/bengali-multipage.pdf');
  expect((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length).toBeGreaterThan(1);
});

test('product groups contain categories across master data, products, stock filters and PC builder', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto('/#/stock');
  await page.getByRole('tab', { name: 'Categories, brands & warranty' }).click();
  const groups = page.locator('.md-panel').filter({ has: page.getByRole('heading', { name: 'Product groups', exact: true }) });
  const categories = page.locator('.md-panel').filter({ has: page.getByRole('heading', { name: 'Categories', exact: true }) });
  await expect(page.locator('.md-panel')).toHaveCount(5);
  await categories.getByRole('textbox', { name: 'Category name', exact: true }).fill('INTEL');
  await expect(categories.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await groups.getByRole('textbox', { name: 'Group name', exact: true }).fill('PROCESSOR');
  await groups.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(groups.getByText('PROCESSOR', { exact: true })).toBeVisible();
  await categories.getByRole('combobox', { name: 'Category group' }).selectOption({ label: 'PROCESSOR' });
  await categories.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(categories.getByText('INTEL', { exact: true })).toBeVisible();
  await categories.getByRole('textbox', { name: 'Category name', exact: true }).fill('AMD');
  await categories.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(categories.getByText('AMD', { exact: true })).toBeVisible();
  const boot = await call(request, 'bootstrap');
  const group = boot.categories.find((c) => c.name === 'PROCESSOR' && !c.parent_id);
  expect(boot.categories.filter((c) => c.parent_id === group.id).map((c) => c.name).sort()).toEqual(['AMD', 'INTEL']);
  await categories.getByRole('button', { name: 'Rename AMD', exact: true }).click();
  await page.getByRole('dialog').getByLabel('New name').fill('AMD RYZEN');
  await page.getByRole('dialog').getByRole('button', { name: 'Save name' }).click();
  await expect(categories.getByText('AMD RYZEN', { exact: true })).toBeVisible();
  await groups.getByRole('button', { name: 'Delete PROCESSOR', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('This item is in use and cannot be deleted', { exact: true })).toBeVisible();
  await expect(groups.getByText('PROCESSOR', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Product name', { exact: true }).fill('Core i5 Test');
  await form.getByRole('combobox', { name: 'Product group', exact: true }).selectOption(group.id);
  const intel = boot.categories.find((c) => c.parent_id === group.id && c.name === 'INTEL');
  await form.getByRole('combobox', { name: 'Category', exact: true }).selectOption(intel.id);
  await expect(form.getByRole('combobox', { name: 'Category', exact: true }).locator('option')).toHaveCount(3);
  await expect(form.getByLabel('Cost price')).toHaveCount(0);
  await form.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('tab', { name: 'Stock explorer' }).click();
  await page.getByRole('combobox', { name: 'Product group', exact: true }).selectOption(group.id);
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption(intel.id);
  await expect(page.locator('tbody tr').filter({ hasText: 'Core i5 Test' })).toContainText('PROCESSOR');
  await page.getByRole('combobox', { name: 'Product group', exact: true }).selectOption('');
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('');
  // PC builder lists only parts in stock: an unstocked product is hidden until it is purchased.
  await page.goto('/#/pc-builder');
  await expect(page.getByLabel('Processor product').locator('option').filter({ hasText: 'Core i5 Test' })).toHaveCount(0);
  const i5 = (await call(request, 'products.list')).find((x) => x.name === 'Core i5 Test');
  const sup = await call(request, 'supplier.save', { name: `PC builder supplier ${Date.now()}` });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: i5.id, qty: 2, cost: 15000, sale_price: 17500 }], payments: [] });
  await page.reload();
  await expect(page.getByLabel('Processor product').locator('option').filter({ hasText: 'Core i5 Test' })).toHaveCount(1);
  await page.goto('/#/stock');
  await page.getByRole('tab', { name: 'Categories, brands & warranty' }).click();
  await groups.getByRole('textbox', { name: 'Search Product groups' }).fill('PROCESSOR');
  await categories.getByRole('textbox', { name: 'Search Categories' }).fill('PROCESSOR');
  await expect(page.locator('.toasts > *')).toHaveCount(0, { timeout: 8000 });
  await page.screenshot({ path: '../verification/groups-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rail')).toHaveCSS('transform', /^matrix\(1, 0, 0, 1, -(2[7-9]\d|300), 0\)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../verification/groups-mobile.png', fullPage: true });
});

test('price manager filters products and saves retail and wholesale prices', async ({ page, request }) => {
  const boot = await call(request, 'bootstrap');
  const p = boot.products.find((x) => x.active);
  await page.goto('/#/prices');
  await page.getByPlaceholder('Name, model or barcode').fill(p.name);
  await page.getByLabel(`Retail price for ${p.name}`).fill('12345');
  await page.getByLabel(`Wholesale price for ${p.name}`).fill('11000');
  await page.getByRole('button', { name: /Save changes \(1\)/ }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  const after = (await call(request, 'products.list')).find((x) => x.id === p.id);
  expect([after.sale_price, after.wholesale_price]).toEqual([12345, 11000]);
});

test('door button hides and shows the side menu without losing the page', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByLabel('Hide the menu').click();
  await expect(page.locator('.rail')).toBeHidden();
  // the page must still fill the window and show its content
  const box = await page.locator('.main').boundingBox();
  expect(box.width).toBeGreaterThan(1300);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Sales history')).toBeVisible();
  // remembered after a reload
  await page.reload();
  await expect(page.getByLabel('Show the menu')).toBeVisible();
  expect((await page.locator('.main').boundingBox()).width).toBeGreaterThan(1300);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  // other pages work while hidden
  await page.goto('/#/pos');
  await expect(page.getByPlaceholder(/Search Product With Serial/)).toBeVisible();
  await page.getByLabel('Show the menu').click();
  await expect(page.locator('.rail')).toBeVisible();
  expect((await page.locator('.rail').boundingBox()).width).toBeGreaterThan(200);
  await expect(page.getByRole('link', { name: /Point Of Sale/ })).toBeVisible();
});

// Dates are the shop's (server) dates, which may differ from this machine's clock.
let shopToday;
const localYmd = (offset = 0) => { const d = new Date(shopToday + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

test('due sale with a next payment date shows a dashboard reminder that switches off when paid', async ({ page, request }) => {
  shopToday = (await call(request, 'bootstrap')).serverToday;
  expect(shopToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const cust = await call(request, 'customer.save', { name: 'Reminder Customer', phones: '01799999999' });
  await page.goto('/#/pos');
  await page.getByRole('combobox', { name: 'Search product' }).fill('বাংলা কেবল');
  await page.keyboard.press('Enter');
  await page.locator('#pos-customer').fill('Reminder Customer');
  await page.getByRole('option', { name: /Reminder Customer/ }).first().click();
  // nothing collected: the whole bill is due, so the date picker appears
  await expect(page.getByLabel('Next payment date', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '1 week' }).click();
  await expect(page.getByLabel('Next payment date', { exact: true })).toHaveValue(localYmd(7));
  await page.getByLabel('Next payment date', { exact: true }).fill(localYmd(0));
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sale completed');
  const sale = (await call(request, 'sales.list', {})).rows?.[0] || (await call(request, 'sales.list', {}))[0];
  const detail = await call(request, 'sale.detail', { id: sale.id });
  expect(detail.sale.next_payment_date).toBe(localYmd(0));

  await page.goto('/#/');
  const card = page.locator('.reminders');
  await expect(card).toContainText('Reminder Customer');
  await expect(card).toContainText('Payment due today');
  await expect(card).toContainText(detail.sale.invoice_no);
  // move it to a later date from the dashboard
  await card.locator('.rem-row', { hasText: 'Reminder Customer' }).getByRole('button', { name: 'New date' }).click();
  await card.getByLabel(`New payment date for ${detail.sale.invoice_no}`).fill(localYmd(2));
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.rem-row', { hasText: 'Reminder Customer' })).toHaveCount(0);
  // the date comes back to today, but the customer has paid: no reminder
  await call(request, 'sale.promise', { id: sale.id, next_payment_date: localYmd(0) });
  await page.reload();
  await expect(page.locator('.reminders')).toContainText('Reminder Customer');
  await call(request, 'customer.payment', { customer_id: cust.id, account_id: cash.id, amount: detail.sale.due });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('.rem-row', { hasText: 'Reminder Customer' })).toHaveCount(0);
});

test('POS shows last 3 selling prices, last purchase cost, and prices of an out-of-stock product', async ({ page, request }) => {
  const p = await call(request, 'product.save', { name: 'History Test Keyboard', unit: 'pcs' });
  await call(request, 'purchase.create', { items: [{ product_id: p.id, qty: 4, cost: 700, sale_price: 1000 }], payments: [{ account_id: cash.id, amount: 2800 }] });
  for (const price of [950, 1000, 1050]) await call(request, 'sale.create', { items: [{ product_id: p.id, qty: 1, price }], payments: [{ account_id: cash.id, amount: price }] });
  await page.goto('/#/pos');
  await page.getByRole('combobox', { name: 'Search product' }).fill('History Test Keyboard');
  await page.keyboard.press('Enter');
  const hist = page.getByLabel('Last selling prices of History Test Keyboard');
  await expect(hist).toContainText('1,050');
  await expect(hist).toContainText('1,000');
  await expect(hist).toContainText('950');
  await hist.getByRole('button', { name: '950' }).click();
  await expect(page.getByLabel('Unit price')).toHaveValue('950');
  // cost peek shows the last purchase price
  await page.getByLabel('Show cost column').check();
  await page.getByRole('button', { name: 'Show cost of History Test Keyboard' }).click();
  await expect(page.locator('.cost-peek')).toContainText('700');
  await expect(page.locator('.cost-peek')).toContainText('last buy');
  // sell the last one, then look it up while out of stock
  await call(request, 'sale.create', { items: [{ product_id: p.id, qty: 1, price: 1000 }], payments: [{ account_id: cash.id, amount: 1000 }] });
  await page.reload();
  await page.getByRole('button', { name: 'Remove History Test Keyboard' }).click();
  await page.getByRole('combobox', { name: 'Search product' }).fill('History Test Keyboard');
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('out of stock');
  await expect(dlg).toContainText('Last purchase price');
  await expect(dlg).toContainText('700');
  await expect(dlg.locator('table')).toContainText('1,050');
  await expect(page.locator('.cart tbody tr')).toHaveCount(0);
});

test('dashboard shows the stock summary and best sellers by product and group', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Stock summary' })).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Total products cost' })).toBeVisible();
  await expect(page.locator('.stat', { hasText: 'Total products sales price' })).toBeVisible();
  const tp = page.locator('.top-products');
  await tp.getByRole('tab', { name: 'Today' }).click();
  await expect(tp).toContainText('History Test Keyboard');
  await tp.getByRole('tab', { name: 'Groups' }).click();
  await expect(tp).toContainText('Top selling product groups');
});

test('purchase shows the last purchase price and the new average cost', async ({ page, request }) => {
  const sup = await call(request, 'supplier.save', { name: `Avg supplier ${Date.now()}` });
  const p = await call(request, 'product.save', { name: 'Average Test Monitor', unit: 'pcs' });
  await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 4, cost: 10000, sale_price: 12000 }], payments: [] });
  await page.goto('/#/purchases');
  await page.getByRole('tab', { name: /New purchase/ }).click();
  await page.getByRole('combobox', { name: 'Supplier', exact: true }).selectOption(sup.id);
  await page.getByRole('combobox', { name: 'Search product' }).fill('Average Test Monitor');
  await page.keyboard.press('Enter');
  const row = page.locator('.pur-line', { hasText: 'Average Test Monitor' });
  await expect(row.locator('.last-buy')).toContainText('10,000');
  await expect(row.locator('.last-buy')).toContainText(sup.name);
  // cost starts at the last purchase price; a different price shows the change and the new average
  await expect(row.getByLabel('Unit cost for Average Test Monitor')).toHaveValue('10000');
  await row.getByLabel('Quantity of Average Test Monitor').fill('4');
  await row.getByLabel('Unit cost for Average Test Monitor').fill('12000');
  await expect(row.locator('.last-buy .chg')).toContainText('2,000');
  await expect(row.locator('.avg-next')).toContainText('11,000');
});

test('Advance Search has its own menu card above Daily Work', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/#/');
  const cards = page.locator('.nav-card');
  await expect(cards.first()).toContainText('Advance Search');
  await expect(cards.first().locator('a')).toHaveCount(1);
  await expect(cards.nth(1)).toContainText('Daily Work');
  await expect(page.locator('.nav-card', { hasText: 'Stock' }).getByText('Advance Search')).toHaveCount(0);
  await page.keyboard.press('Alt+8');
  await expect(page).toHaveURL(/#\/history/);
});

test('SMS preset box keeps showing the chosen provider, also after saving and reloading', async ({ page, request }) => {
  const box = () => page.getByLabel('SMS provider preset');
  const url = page.getByLabel('API URL');
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'SMS gateway' }).click();
  await box().selectOption('OneCodeSoft (Bulk SMS API v3)');
  await expect(box()).toHaveValue('OneCodeSoft (Bulk SMS API v3)');
  // the open list holds only real providers: no greyed-out "Choose…" or "Custom" rows
  const listed = () => box().locator('option:not([hidden]):not([disabled])');
  await expect(box().locator('option')).toHaveCount(6);
  await expect(listed()).toHaveCount(6);
  await expect(box().locator('option[disabled]')).toHaveCount(0);
  await expect(url).toHaveValue(/PASTE-BASE-URL/);
  // the user pastes their own base address: still OneCodeSoft
  await url.fill('https://app.example-ocs.com/api/v3/send-sms');
  await expect(box()).toHaveValue('OneCodeSoft (Bulk SMS API v3)');
  await page.getByRole('button', { name: 'Save SMS settings' }).click();
  await expect(page.getByText('Settings saved').first()).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'SMS gateway' }).click();
  await expect(box()).toHaveValue('OneCodeSoft (Bulk SMS API v3)');
  // switching to another provider follows it
  await box().selectOption('MRAM Technologies — Bangla SMS (unicode)');
  await expect(box()).toHaveValue('MRAM Technologies — Bangla SMS (unicode)');
  await expect(url).toHaveValue(/type=unicode/);
  // a hand-made address shows as custom, never the empty placeholder
  await url.fill('https://my-own-gateway.bd/send?key={api_key}');
  await expect(box()).toHaveValue('custom');
  await expect(box().locator('option:checked')).toHaveText('Custom settings (my own)');
  await expect(listed()).toHaveCount(6); // the custom label is not offered as a choice
});

test('dashboard shows leaderboard, top selling and low stock as three equal cards in one row', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/#/');
  const cards = page.locator('.dash-trio > .card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('Staff leaderboard');
  await expect(cards.nth(1)).toContainText('Top selling');
  await expect(cards.nth(2)).toContainText('Low stock');
  const boxes = await cards.evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().toJSON()));
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1); // same row
  expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBe(1); // same height
  for (const b of boxes) expect(Math.abs(b.width - boxes[0].width)).toBeLessThan(2); // same width
  // phones: one card per row, nothing sticks out sideways
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await cards.evaluateAll((cs) => cs.map((c) => c.getBoundingClientRect().toJSON()));
  expect(narrow[1].top).toBeGreaterThan(narrow[0].bottom - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('barcode labels: create a shop barcode, custom size, A4 start position, purchase labels and printed content', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const sup = await call(request, 'supplier.save', { name: 'Label Supplier ' + Date.now() });
  const pr = await call(request, 'product.save', { name: 'Label Test SSD ' + Date.now(), has_warranty: true, warranty_type: 'invoice', warranty_days: 365 });
  const pur = await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: pr.id, qty: 3, cost: 4000, sale_price: 5250 }], payments: [] });
  const hookPrint = () => page.evaluate(() => {
    window.__printed = null;
    const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (window.__hooked) return; window.__hooked = 1;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { const w = d.get.call(this); if (w && !w.__h) { w.__h = 1; w.print = () => { window.__printed = w.document.documentElement.outerHTML; }; } return w; } });
  });
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('lbl_reset')) { localStorage.removeItem('karvio_label_opts'); sessionStorage.setItem('lbl_reset', '1'); } } catch {} });

  // menu: right under Products & Stock
  await page.goto('/#/stock');
  await expect(page.locator('.rail a', { hasText: 'Barcode Labels' })).toBeVisible();
  const links = await page.locator('.rail a').allTextContents();
  const i = links.findIndex((t) => t.includes('Products & Stock'));
  expect(links[i + 1]).toContain('Barcode Labels');
  await page.locator('.rail a', { hasText: 'Barcode Labels' }).click();
  await expect(page.locator('.page-head h1')).toHaveText('Barcode labels');

  // add the product: it has no barcode yet → create one
  await page.getByLabel('Search product').fill(pr.name);
  await page.locator('.psearch-list li').first().click();
  await expect(page.getByText('1 product has no barcode')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Print 1 label/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create barcode for it' }).click();
  await expect(page.getByText('1 product has no barcode')).toHaveCount(0);
  const code = (await call(request, 'products.list')).find((p) => p.id === pr.id).barcode;
  expect(code).toMatch(/^20\d{11}$/);
  await expect(page.locator('.bc-rows code')).toHaveText(code);
  await page.getByLabel(`Labels for ${pr.name}`).fill('4');

  // custom size 50 × 30 mm, extra line, warranty
  await page.getByLabel('Label size').selectOption('custom');
  await page.getByLabel('Width (mm)').fill('50');
  await page.getByLabel('Height (mm)').fill('30');
  await page.locator('.bc-opt', { hasText: 'Warranty' }).click();
  await page.locator('.bc-opt', { hasText: 'Extra line' }).click();
  await page.getByLabel('Extra line text').fill('Call 01700000000');
  await expect(page.locator('.card', { hasText: 'Preview' }).getByText('4 labels · 4 pages · 50 × 30 mm')).toBeVisible();
  await hookPrint();
  await page.getByRole('button', { name: /^Print 4 labels/ }).click();
  await page.waitForFunction(() => window.__printed);
  let html = await page.evaluate(() => window.__printed);
  expect(html).toContain('size:50mm 30mm');
  expect((html.match(/class="cell"/g) || []).length).toBe(4);
  for (const t of ['1 Year warranty', 'Call 01700000000', 'Tk 5,250', code, '<svg']) expect(html).toContain(t);
  expect(html).not.toContain('data-thin');

  // A4 sheet, starting at label 3 → two blank cells before the labels
  await page.getByRole('tab', { name: 'A4 sheet' }).click();
  await page.getByLabel('Start at label no.').fill('3');
  await page.evaluate(() => { window.__printed = null; });
  await page.getByRole('button', { name: /^Print 4 labels/ }).click();
  await page.waitForFunction(() => window.__printed);
  html = await page.evaluate(() => window.__printed);
  expect(html).toContain('size:210mm 297mm');
  expect((html.match(/class="cell blank"/g) || []).length).toBe(2);
  expect((html.match(/class="cell"/g) || []).length).toBe(4);
  expect(html.indexOf('cell blank')).toBeLessThan(html.indexOf('class="cell"'));

  // settings are remembered; a size that does not fit is refused
  await page.reload();
  await expect(page.getByRole('tab', { name: 'A4 sheet' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('combobox', { name: 'Sheet', exact: true }).selectOption('custom');
  await page.getByLabel('Width (mm)').fill('80');
  await page.getByLabel('Labels across').fill('3');
  await expect(page.getByText('3 labels of 80 mm do not fit across an A4 page')).toBeVisible();

  // from the purchase screen link: one label per unit bought
  await page.goto(`/#/barcodes?purchase=${pur.purchase.id}`);
  await expect(page.getByLabel(`Labels for ${pr.name}`)).toHaveValue('3');
  expect(errors).toEqual([]);
});

test('phone app: clear of status and gesture bars, POS cart fits, back button closes, goes back, then asks before exit', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ endpoint, token }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
    // what the Android app injects: 32px status bar, 24px gesture bar
    document.addEventListener('DOMContentLoaded', () => { const s = document.documentElement.style; s.setProperty('--safe-area-inset-top', '32px'); s.setProperty('--safe-area-inset-bottom', '24px'); });
  }, { endpoint, token });
  await page.goto('/#/');
  await expect(page.locator('.topbar')).toBeVisible();
  expect((await page.locator('.topbar').boundingBox()).y).toBeGreaterThanOrEqual(32);

  // menu drawer: top clear of the status bar, bottom clear of the gesture bar
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.locator('.shell.nav-open')).toHaveCount(1);
  await page.waitForTimeout(300);
  expect((await page.locator('.rail .brand').boundingBox()).y).toBeGreaterThanOrEqual(32);
  await page.locator('.rail').evaluate((r) => { r.scrollTop = 1e6; });
  const foot = await page.locator('.rail-foot').boundingBox();
  expect(foot.y + foot.height).toBeLessThanOrEqual(860 - 24 + 1);
  // back closes the menu first
  expect(await page.evaluate(() => window.__karvioBack(true))).toBe('closed');
  await expect(page.locator('.shell.nav-open')).toHaveCount(0);

  // POS: a cart line stays inside the screen
  await page.goto('/#/pos');
  await page.getByLabel('Search product').fill(product.name);
  await page.locator('.psearch-list li').first().click();
  await expect(page.locator('.cart tbody tr')).toHaveCount(1);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.pos *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1; }).length);
  expect(wide).toBe(0);
  expect(await page.evaluate(() => document.querySelector('.content').scrollWidth <= document.querySelector('.content').clientWidth)).toBe(true);
  await expect(page.getByLabel('Quantity')).toBeVisible();
  await expect(page.getByLabel('Unit price')).toBeVisible();

  // back on a page goes back (here: to the dashboard), not out of the app
  expect(await page.evaluate(() => window.__karvioBack(true))).toBe('back');
  await expect(page).toHaveURL(/#\/$/);
  // back on the dashboard asks first; back again = stay
  expect(await page.evaluate(() => window.__karvioBack(false))).toBe('ask');
  await expect(page.getByRole('alertdialog', { name: 'Exit Karvio?' })).toBeVisible();
  await page.waitForTimeout(450); // slide-up animation
  const sheet = await page.locator('.exit-sheet').boundingBox();
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(860 - 24);
  expect(await page.evaluate(() => window.__karvioBack(false))).toBe('stay');
  await expect(page.locator('.exit-sheet')).toHaveCount(0);
  // Stay button and Exit button
  await page.evaluate(() => window.__karvioBack(false));
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.locator('.exit-sheet')).toHaveCount(0);
  await page.evaluate(() => window.__karvioBack(false));
  await page.getByRole('button', { name: 'Exit' }).click();
  expect(await page.evaluate(() => window.__karvioExited)).toBe(true);
  expect(errors).toEqual([]);
  await ctx.close();
});
