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
