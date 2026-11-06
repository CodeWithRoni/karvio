// Serial picking at the POS (many serials, scanner, quantity follows the serials), the mouse wheel on quantity
// boxes, the Profit page and dashboard row, and the Administrator-only database reset.
// The file name sorts last on purpose: the final test empties the in-memory test database.
import { test, expect } from '@playwright/test';

const endpoint = 'http://localhost:8787';
let token, cash, router, cable;
const SERIALS = ['RT-1001', 'RT-1002', 'RT-1003', 'RT-1004', 'RT-1005'];
async function call(request, action, payload = {}, tk = token) {
  const r = await request.post(endpoint, { data: { action, payload, token: tk } });
  const body = await r.json();
  expect(body.ok, body.error).toBe(true);
  return body.data;
}
const signIn = (page, tk) => page.addInitScript(({ endpoint, tk }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', tk);
  localStorage.removeItem('erp_pos_draft');
}, { endpoint, tk });

test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap');
  cash = boot.accounts[0];
  // a retried worker runs this again on the same in-memory server: reuse what is already there
  router = boot.products.find((p) => p.name === 'Router Serial Test C54');
  cable = boot.products.find((p) => p.name === 'Wheel Test Cable');
  if (router) return;
  router = await call(request, 'product.save', { name: 'Router Serial Test C54', unit: 'pcs', sale_price: 2200, has_warranty: true, warranty_type: 'serial', warranty_days: 300 });
  cable = await call(request, 'product.save', { name: 'Wheel Test Cable', unit: 'pcs', sale_price: 100 });
  await call(request, 'purchase.create', { items: [{ product_id: router.id, qty: 5, cost: 1800, serials: SERIALS }, { product_id: cable.id, qty: 20, cost: 60 }], payments: [{ account_id: cash.id, amount: 10200 }] });
});

test('serial product: pick many serials by click and scanner, quantity follows the serials', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, token);
  await page.goto('/#/pos');
  const search = page.getByRole('combobox', { name: 'Search product' });
  await search.fill('Router Serial Test');
  await search.press('Enter');
  const dialog = page.locator('.modal').filter({ hasText: 'Serial numbers — Router Serial Test C54' });
  await expect(dialog).toBeVisible();
  const scan = dialog.getByRole('textbox', { name: 'Scan or type a serial number' });
  await expect(scan).toBeFocused(); // ready for the barcode scanner
  // click several serials — more than one is allowed
  for (const s of ['RT-1001', 'RT-1002', 'RT-1003']) await dialog.getByRole('button', { name: s, exact: true }).click();
  await expect(dialog.locator('.serial-status')).toContainText('3 picked of 5 in stock');
  // scanner: types the serial and presses Enter
  await scan.fill('rt-1005'); await scan.press('Enter');
  await expect(dialog.locator('.serial-note')).toHaveText('RT-1005 added');
  await expect(scan).toHaveValue('');
  await scan.fill('RT-1005'); await scan.press('Enter');
  await expect(dialog.locator('.serial-note')).toHaveText('RT-1005 is already picked');
  await scan.fill('NOT-A-SERIAL'); await scan.press('Enter');
  await expect(dialog.locator('.serial-note')).toHaveText('NOT-A-SERIAL — not in stock for this product');
  await expect(dialog.locator('.serial-status')).toContainText('4 picked');
  // click again to unpick
  await dialog.getByRole('button', { name: 'RT-1002', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'RT-1002', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await dialog.getByRole('button', { name: 'Done' }).click();

  const row = page.locator('.cart tbody tr').filter({ hasText: 'Router Serial Test C54' });
  const qty = row.getByRole('button', { name: /^Quantity 3 — pick serial numbers/ });
  await expect(qty).toHaveText('3');
  await expect(row.locator('input[aria-label="Quantity"]')).toHaveCount(0); // no typed quantity for serial products
  await expect(row.locator('.serial-ok')).toHaveText('S/N: RT-1001, RT-1003, RT-1005');
  await expect(row.locator('td[data-label="Amount"]')).toContainText('6,600');

  // scanning a serial in the main search box adds it to the same line
  await search.fill('RT-1004'); await search.press('Enter');
  await expect(row.getByRole('button', { name: /^Quantity 4 — pick serial numbers/ })).toBeVisible();
  await expect(row.locator('td[data-label="Amount"]')).toContainText('8,800');
  // searching the product by name again opens the picker instead of adding a serial-less unit
  await search.fill('Router Serial Test'); await search.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.serial-status')).toContainText('4 picked');
  await dialog.getByRole('button', { name: 'RT-1004', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(row.getByRole('button', { name: /^Quantity 3/ })).toBeVisible();

  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.locator('.modal').filter({ hasText: 'Sale completed' })).toBeVisible();
  const sales = await call(request, 'sales.list', {});
  const list = Array.isArray(sales) ? sales : sales.rows;
  const detail = await call(request, 'sale.detail', { id: list.find((s) => s.total === 6600).id });
  expect(detail.items[0].qty).toBe(3);
  expect(detail.items[0].serials.split(',').sort()).toEqual(['RT-1001', 'RT-1003', 'RT-1005']);
  expect(errors).toEqual([]);
});

test('a serial line with no serials picked blocks the sale and shows what to do', async ({ page }) => {
  await signIn(page, token);
  await page.goto('/#/pos');
  const search = page.getByRole('combobox', { name: 'Search product' });
  await search.fill('Router Serial Test'); await search.press('Enter');
  await page.locator('.modal').getByRole('button', { name: 'Done' }).click();
  const row = page.locator('.cart tbody tr').filter({ hasText: 'Router Serial Test C54' });
  await expect(row.getByRole('button', { name: /^Quantity 0/ })).toBeVisible();
  await expect(row.locator('.serial-need')).toHaveText('Pick serial numbers');
  await expect(page.locator('.pos-right .note')).toHaveText('Pick the serial numbers for Router Serial Test C54');
  // the quantity button opens the picker
  await row.getByRole('button', { name: /^Quantity 0/ }).click();
  await expect(page.locator('.modal .serial-status')).toContainText('0 picked of 2 in stock');
});

test('an old saved cart with a typed serial quantity is corrected to the serials picked', async ({ page }) => {
  await page.addInitScript(({ endpoint, token, id }) => {
    localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
    localStorage.setItem('erp_token', token);
    localStorage.setItem('erp_pos_draft', JSON.stringify({ cart: [{ product_id: id, qty: 2, price: 2200, serials: [], warranty_days: 300 }], customerId: '', discount: '' }));
  }, { endpoint, token, id: router.id });
  await page.goto('/#/pos');
  const row = page.locator('.cart tbody tr').filter({ hasText: 'Router Serial Test C54' });
  await expect(row.getByRole('button', { name: /^Quantity 0/ })).toBeVisible();
  await expect(row.locator('.serial-need')).toHaveText('Pick serial numbers (2 planned)');
  await expect(row.locator('td[data-label="Amount"]')).toContainText('0');
});

test('the mouse wheel does not change quantity boxes', async ({ page }) => {
  await signIn(page, token);
  await page.goto('/#/pos');
  const search = page.getByRole('combobox', { name: 'Search product' });
  await search.fill('Wheel Test Cable'); await search.press('Enter');
  const box = page.locator('.cart tbody tr').filter({ hasText: 'Wheel Test Cable' }).locator('input[aria-label="Quantity"]');
  await box.fill('5');
  await box.focus();
  await box.hover();
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(80); } // without the guard this would make it 9
  await expect(box).toHaveValue('5');
  // typing still works
  await box.fill('7');
  await expect(box).toHaveValue('7');
});

test('Profit page and the dashboard profit row', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, token);
  const dash = await call(request, 'dashboard');
  await page.goto('/');
  const head = page.locator('section .card-head h2');
  await expect(head.filter({ hasText: /^Profit$/ })).toBeVisible();
  const titles = await head.allTextContents();
  expect(titles.indexOf('Profit')).toBe(titles.indexOf('Live balances') + 1); // the row sits right under Live balances
  const tiles = page.locator('.profit-stat');
  await expect(tiles).toHaveCount(4);
  await expect(tiles.locator('> span')).toHaveText(['Today', 'This week', 'This month', 'Last 6 months']);
  // compact tiles (a class clash once stretched them to ~1800px)
  for (const box of await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeLessThan(220);
  await expect(tiles.first()).toContainText('Net profit');
  await expect(tiles.first()).toContainText('Gross profit');
  await expect(tiles.first()).toContainText('Tk ' + dash.profit[0].gross.toLocaleString('en-IN'));

  // nav: Profit sits above Expenses under Money & Reports
  const navText = await page.locator('nav a, .nav a').allTextContents();
  const clean = navText.map((t) => t.replace(/Alt\s*\d/, '').trim());
  expect(clean.indexOf('Profit')).toBe(clean.indexOf('Expenses') - 1);
  await page.locator('nav a, .nav a').filter({ hasText: /^Profit/ }).first().click();
  await expect(page.locator('.page-head h1')).toHaveText('Profit');
  const rep = await call(request, 'profit.report', {});
  await expect(page.locator('.profit-summary .stat').filter({ hasText: 'Gross profit' })).toContainText('Tk ' + rep.summary.gross.toLocaleString('en-IN'));
  await expect(page.locator('.profit-summary .stat').filter({ hasText: 'Net profit' })).toContainText(rep.summary.net.toLocaleString('en-IN'));
  await page.getByRole('tab', { name: 'By product' }).click();
  await expect(page.locator('table').filter({ hasText: 'Router Serial Test C54' })).toBeVisible();
  await page.getByRole('tab', { name: 'Last 6 months' }).click();
  await expect(page.locator('.profit-summary')).toBeVisible();
  await page.getByRole('tab', { name: 'Custom' }).click();
  await expect(page.getByLabel('From date')).toBeVisible();
  expect(errors).toEqual([]);
});

test('database backup downloads every table and restore brings it back exactly', async ({ page, request }, info) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page, token);
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Database', exact: true }).click();
  const overview = page.locator('.db-overview');
  await expect(overview).toContainText('Last backup');
  await expect(overview.locator('.db-stamp').first()).toContainText('Never');
  const productsBefore = (await call(request, 'products.list')).length;
  await expect(overview.locator('.db-tables div').filter({ hasText: /^Products/ })).toContainText(String(productsBefore));

  // backup (export)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^Karvio-backup-[A-Za-z0-9-]+-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const file = info.outputPath('backup.json');
  await download.saveAs(file);
  const fs = await import('node:fs');
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(backup.format).toBe('Karvio database backup');
  expect(backup.counts.Products).toBe(productsBefore);
  await expect(page.locator('.db-card .reset-done')).toContainText('Saved: ' + download.suggestedFilename());
  await expect(overview.locator('.db-stamp').first()).toContainText('Today');

  // change the data after the backup
  await call(request, 'product.save', { name: 'Made After Backup' });
  expect((await call(request, 'products.list')).length).toBe(productsBefore + 1);

  // a damaged file is refused in the browser already
  const broken = info.outputPath('broken.json');
  fs.writeFileSync(broken, JSON.stringify({ ...backup, tables: { ...backup.tables, Products: { ...backup.tables.Products, rows: [] } } }));
  const fileBox = page.getByLabel('Backup file');
  await fileBox.setInputFiles(broken);
  await expect(page.locator('.db-card .errbox')).toHaveText('This file is damaged or was edited — it cannot be restored.');
  await expect(page.getByRole('button', { name: 'Restore database' })).toHaveCount(0);
  fs.writeFileSync(broken, 'not json');
  await fileBox.setInputFiles(broken);
  await expect(page.locator('.db-card .errbox')).toHaveText('This is not a Karvio database backup file.');

  // restore (import)
  await fileBox.setInputFiles(file);
  const preview = page.locator('.db-preview');
  await expect(preview.locator('.db-badge')).toHaveText('✓ File verified');
  await expect(preview).toContainText('Backup made');
  await expect(preview.locator('.db-tables div').filter({ hasText: /^Products/ })).toContainText(String(productsBefore));
  const go = page.getByRole('button', { name: 'Restore database' });
  await expect(go).toBeDisabled();
  await page.getByLabel('Administrator password').first().fill('wrong-pass');
  await page.getByLabel('Type RESTORE to confirm').fill('RESTORE');
  await go.click();
  await expect(page.locator('.toast-err')).toContainText('Incorrect password — nothing was restored');
  expect((await call(request, 'products.list')).length).toBe(productsBefore + 1); // nothing changed
  await page.getByLabel('Administrator password').first().fill('admin123');
  await go.click();
  await expect(page.locator('.db-card .reset-done').filter({ hasText: 'Restored' })).toContainText('Karvio backup before restore');
  const after = await call(request, 'products.list');
  expect(after.length).toBe(productsBefore);
  expect(after.some((p) => p.name === 'Made After Backup')).toBe(false);
  await expect(overview.locator('.db-stamp').nth(1)).not.toContainText('—');
  // phone width: nothing spills sideways
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('database reset: only the Administrator sees it, and it leaves a fresh shop', async ({ page, request, browser }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  // another admin does not see the tab
  await call(request, 'user.save', { name: 'Second Admin', username: 'second', password: 'second1', role: 'admin' });
  const second = (await call(request, 'login', { username: 'second', password: 'second1' }, null)).token;
  const other = await browser.newPage();
  await signIn(other, second);
  await other.goto('/#/settings');
  await expect(other.getByRole('tab', { name: 'My password' })).toBeVisible();
  await expect(other.getByRole('tab', { name: 'Database', exact: true })).toHaveCount(0);
  await other.close();

  await signIn(page, token);
  await page.goto('/#/settings');
  await page.getByRole('tab', { name: 'Database', exact: true }).click();
  const go = page.getByRole('button', { name: 'Reset database' });
  await expect(go).toBeDisabled();
  await page.getByLabel('Administrator password').fill('wrong-pass');
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await go.click();
  await expect(page.locator('.toast')).toContainText('Incorrect password');
  expect((await call(request, 'products.list')).length).toBeGreaterThan(0); // nothing deleted
  await page.getByLabel('Administrator password').fill('admin123');
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  await go.click();
  await expect(page.locator('.reset-done')).toContainText('Karvio is fresh');
  await expect(page.locator('.reset-done')).toContainText('Karvio backup before reset');
  expect((await call(request, 'products.list')).length).toBe(0);
  expect((await call(request, 'users.list')).map((u) => u.username)).toEqual(['admin']);
  // the dashboard shows an empty shop and the session is still signed in
  await page.goto('/');
  await expect(page.locator('.profit-stat').first()).toContainText('Tk 0');
  expect(errors).toEqual([]); // a refused reset (wrong password) is a message, not a page error
});
