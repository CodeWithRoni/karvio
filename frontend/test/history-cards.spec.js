// Advance Search: product / purchase / sale / sales return / purchase return / warranty cards for a serial, a product
// and an invoice; every number opens the full document (the sale invoice exactly as the POS prints it) and prints it.
import { test, expect } from '@playwright/test';

const endpoint = 'http://localhost:8787';
let token, staffToken, ids = {};
const T = Date.now().toString(36).slice(-5).toUpperCase(); // a fresh tag each time the data is made
const SN = (n) => `HC${T}-${n}`;
async function call(request, action, payload = {}, tk = token) {
  const r = await request.post(endpoint, { data: { action, payload, token: tk } });
  const b = await r.json();
  expect(b.ok, `${action}: ${b.error}`).toBe(true);
  return b.data;
}
const signIn = (page, tk = token) => page.addInitScript(({ endpoint, tk }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', tk);
  window.__printed = null;
  const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { const w = d.get.call(this); if (w && !w.__h) { w.__h = 1; w.print = () => { window.__printed = w.document.documentElement.outerHTML; }; } return w; } });
}, { endpoint, tk });

test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' }, null)).token;
  const boot = await call(request, 'bootstrap');
  const cash = boot.accounts[0];
  await call(request, 'settings.save', { values: { invoice_paper: '80' } });
  const grp = await call(request, 'master.save', { kind: 'group', name: `HC NETWORKING ${T}` });
  const brand = await call(request, 'master.save', { kind: 'brand', name: `HC-LINK ${T}` });
  const router = await call(request, 'product.save', { name: `HC ROUTER AX23 ${T}`, sku: `HCAX23${T}`, category_id: grp.id, brand_id: brand.id, has_warranty: true, warranty_type: 'serial', warranty_days: 365 });
  const mouse = await call(request, 'product.save', { name: `HC MOUSE OP-620D ${T}`, sku: `HCOP620${T}` });
  await call(request, 'product.save', { name: `HC MOUSE WIRELESS G3 ${T}` });
  const sup = await call(request, 'supplier.save', { name: `HC Global Brand ${T}`, phones: ['01711000001'] });
  const cust = await call(request, 'customer.save', { name: `HC Karim ${T}`, phones: ['01811000001'] });
  const p1 = await call(request, 'purchase.create', { supplier_id: sup.id, supplier_invoice: `HCGB-${T}`, items: [
    { product_id: router.id, qty: 3, cost: 2000, sale_price: 2600, serials: [SN(1), SN(2), SN(3)] },
    { product_id: mouse.id, qty: 10, cost: 300, sale_price: 450 }], payments: [{ account_id: cash.id, amount: 9000 }] });
  const s1 = await call(request, 'sale.create', { customer_id: cust.id, items: [{ product_id: router.id, qty: 1, price: 2600, serials: [SN(1)] }, { product_id: mouse.id, qty: 2, price: 450 }], payments: [{ account_id: cash.id, amount: 3500 }] });
  const s2 = await call(request, 'sale.create', { customer_id: cust.id, items: [{ product_id: router.id, qty: 1, price: 2700, serials: [SN(2)] }], payments: [{ account_id: cash.id, amount: 2700 }] });
  const sr = await call(request, 'sreturn.create', { sale_id: s1.sale.id, items: [{ sale_item_id: s1.items[1].id, qty: 1 }], refund: { mode: 'cash', account_id: cash.id, amount: 450 }, type: 'return' });
  const pr = await call(request, 'preturn.create', { purchase_id: p1.purchase.id, items: [{ purchase_item_id: p1.items[0].id, qty: 1, serials: [SN(3)] }], refund: { mode: 'adjust' } });
  const cl = await call(request, 'claim.create', { sale_id: s2.sale.id, sale_item_id: s2.items[0].id, serial: SN(2), issue: 'No power' });
  Object.assign(ids, { router, mouse, p1, s1, s2, sr, pr, cl });
  await call(request, 'user.save', { name: 'HC Staff', username: `hcstaff${T.toLowerCase()}`, password: 'staff123', role: 'sales' });
  staffToken = (await call(request, 'login', { username: `hcstaff${T.toLowerCase()}`, password: 'staff123' }, null)).token;
});

const search = async (page, text) => {
  await page.getByRole('textbox', { name: 'Search' }).fill(text);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
};
const card = (page, name) => page.getByRole('region', { name });

test('a serial: six cards, and every number opens its document', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.goto('/#/history');
  await search(page, SN(2).toLowerCase());
  // the cards, in order
  await expect(page.locator('.hcard h2')).toHaveText(['Product', 'Purchased from', 'Sold to', 'Sales returns', 'Purchase returns', 'Warranty claims']);
  const prod = card(page, 'Product');
  await expect(prod).toContainText(`HC ROUTER AX23 ${T}`);
  await expect(prod.locator('.hc-sn')).toHaveText(SN(2));
  await expect(prod).toContainText('365 days left');
  await expect(prod).toContainText(`HC-LINK ${T}`);
  await expect(prod).toContainText(`HC NETWORKING ${T}`);
  await expect(card(page, 'Purchased from')).toContainText(`HC Global Brand ${T}`);
  await expect(card(page, 'Purchased from').locator('.hc-count')).toHaveText('1');
  await expect(card(page, 'Purchased from')).toContainText('2,000'); // 1 router of the 3 on that line
  await expect(card(page, 'Sold to')).toContainText(`HC Karim ${T}`);
  await expect(card(page, 'Sold to')).toContainText(ids.s2.sale.invoice_no);
  await expect(card(page, 'Sales returns')).toContainText('No sales return');
  await expect(card(page, 'Warranty claims')).toContainText(ids.cl.claim_no);
  await expect(card(page, 'Warranty claims')).toContainText('Pending');

  // the sale invoice, exactly as the POS prints it (80 mm receipt), then printed
  await card(page, 'Sold to').getByRole('button', { name: ids.s2.sale.invoice_no }).click();
  const modal = page.locator('.modal');
  await expect(modal.locator('.modal-head h2')).toHaveText(`Sale invoice ${ids.s2.sale.invoice_no}`);
  const frame = page.frameLocator('.doc-frame');
  await expect(frame.locator('body')).toContainText(`Invoice: ${ids.s2.sale.invoice_no}`);
  await expect(frame.locator('body')).toContainText(`S/N: ${SN(2)}`);
  await expect(frame.locator('body')).toContainText('Served by');
  await modal.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => page.evaluate(() => window.__printed || '')).toContain(`Invoice: <b>${ids.s2.sale.invoice_no}</b>`);
  const printed = await page.evaluate(() => window.__printed);
  expect(printed).toContain('@page{size:80mm'); // the same 80 mm receipt the POS prints
  expect(printed).not.toContain('#dfe5ec'); // the grey desk is only on screen
  await modal.locator('.modal-foot').getByRole('button', { name: 'Close' }).click();
  await expect(modal).toHaveCount(0);

  // the purchase invoice
  await card(page, 'Purchased from').getByRole('button', { name: ids.p1.purchase.invoice_no }).click();
  await expect(modal.locator('.modal-head h2')).toHaveText(`Purchase invoice ${ids.p1.purchase.invoice_no}`);
  await expect(frame.locator('body')).toContainText('PURCHASE INVOICE');
  await expect(frame.locator('body')).toContainText(`HCGB-${T}`);
  await page.keyboard.press('Escape');

  // the warranty claim, and the invoice it belongs to
  await card(page, 'Warranty claims').getByRole('button', { name: ids.cl.claim_no }).click();
  await expect(frame.locator('body')).toContainText('WARRANTY CLAIM');
  await expect(frame.locator('body')).toContainText('No power');
  await page.keyboard.press('Escape');
  await card(page, 'Warranty claims').getByRole('button', { name: ids.s2.sale.invoice_no }).click();
  await expect(modal.locator('.modal-head h2')).toHaveText(`Sale invoice ${ids.s2.sale.invoice_no}`);
  await page.keyboard.press('Escape');

  // a number in the timeline opens too
  await page.locator('.timeline').getByRole('button', { name: ids.p1.purchase.invoice_no }).first().click();
  await expect(modal.locator('.modal-head h2')).toHaveText(`Purchase invoice ${ids.p1.purchase.invoice_no}`);
  await page.keyboard.press('Escape');

  // HCRX-3 went back to the supplier
  await search(page, SN(3));
  await expect(card(page, 'Purchase returns')).toContainText(ids.pr.return.return_no);
  await card(page, 'Purchase returns').getByRole('button', { name: ids.pr.return.return_no }).click();
  await expect(frame.locator('body')).toContainText('PURCHASE RETURN');
  await expect(frame.locator('body')).toContainText(SN(3));
  await expect(frame.locator('body')).toContainText('Adjusted to supplier balance');
  await page.keyboard.press('Escape');
  await expect(card(page, 'Sold to')).toContainText('Not sold yet');
  expect(errors).toEqual([]);
});

test('a product by part of its name, an invoice, and the sales return document', async ({ page, request }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.goto('/#/history');
  await search(page, `hc mouse op-620d ${T}`.slice(0, 9));
  await expect(page.getByRole('heading', { name: 'Which product?' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`HC MOUSE OP-620D ${T}`) }).click();
  await expect(card(page, 'Product')).toContainText(`HC MOUSE OP-620D ${T}`);
  await expect(card(page, 'Product')).toContainText('Model');
  await expect(card(page, 'Product')).toContainText(`HCOP620${T}`);
  await expect(card(page, 'Purchased from')).toContainText(ids.p1.purchase.invoice_no);
  await expect(card(page, 'Sold to')).toContainText(ids.s1.sale.invoice_no);
  await expect(card(page, 'Sales returns')).toContainText(ids.sr.return.return_no);
  // the sales return document
  await card(page, 'Sales returns').getByRole('button', { name: ids.sr.return.return_no }).click();
  const frame = page.frameLocator('.doc-frame');
  await expect(frame.locator('body')).toContainText('SALES RETURN');
  await expect(frame.locator('body')).toContainText(`HC Karim ${T}`);
  await expect(frame.locator('body')).toContainText(ids.s1.sale.invoice_no);
  await expect(frame.locator('body')).toContainText('Refunded');
  await page.keyboard.press('Escape');

  // the invoice: its products, its serial and its return; a serial chip searches that serial
  await search(page, ids.s1.sale.invoice_no);
  const prods = card(page, 'Products');
  await expect(prods.locator('.hc-row')).toHaveCount(2);
  await expect(prods).toContainText(`HC ROUTER AX23 ${T}`);
  await expect(card(page, 'Sold to')).toContainText('Paid');
  await expect(card(page, 'Purchased from')).toContainText('last purchase before this sale');
  await expect(card(page, 'Sales returns')).toContainText(ids.sr.return.return_no);
  await prods.getByRole('button', { name: SN(1) }).click();
  await expect(card(page, 'Product').locator('.hc-sn')).toHaveText(SN(1));
  await expect(page.getByRole('textbox', { name: 'Search' })).toHaveValue(SN(1));

  // A4 invoice paper: the sale invoice opens as the A4 page
  await call(request, 'settings.save', { values: { invoice_paper: 'a4' } });
  await page.reload();
  await search(page, ids.s1.sale.invoice_no);
  await card(page, 'Sold to').getByRole('button', { name: ids.s1.sale.invoice_no }).click();
  await expect(page.frameLocator('.doc-frame').locator('.sdoc, .bdoc')).toHaveCount(1);
  await expect(page.frameLocator('.doc-frame').locator('body')).toContainText(ids.s1.sale.invoice_no);
  await page.keyboard.press('Escape');
  await call(request, 'settings.save', { values: { invoice_paper: '80' } });
  expect(errors).toEqual([]);
});

test('staff: only what they may open, and the phone layout', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, staffToken);
  await page.goto('/#/history');
  await search(page, SN(2));
  await expect(card(page, 'Product')).toContainText(`HC ROUTER AX23 ${T}`);
  // purchases: no permission → the number is plain text and no money is shown
  await expect(card(page, 'Purchased from').locator('.hc-no-off')).toHaveText(ids.p1.purchase.invoice_no);
  await expect(card(page, 'Purchased from').getByRole('button')).toHaveCount(0);
  await expect(card(page, 'Purchased from')).not.toContainText('2,000');
  // another staff member's sale is hidden
  await expect(card(page, 'Sold to')).toContainText('Not sold yet');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // their own sale opens and the page fits the phone
  const boot = await (await page.request.post(endpoint, { data: { action: 'bootstrap', token: staffToken } })).json();
  const own = await (await page.request.post(endpoint, { data: { action: 'sale.create', token: staffToken, payload: { items: [{ product_id: ids.mouse.id, qty: 1, price: 450 }], payments: [{ account_id: boot.data.accounts[0].id, amount: 450 }] } } })).json();
  expect(own.ok).toBe(true);
  await search(page, own.data.sale.invoice_no);
  await card(page, 'Sold to').getByRole('button', { name: own.data.sale.invoice_no }).click();
  const frame = page.locator('.doc-frame');
  await expect(page.frameLocator('.doc-frame').locator('body')).toContainText(own.data.sale.invoice_no);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const box = await frame.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

// the document inside the viewer: nothing cut off on the right
const docFits = (page) => page.locator('.doc-frame').evaluate((f) => {
  const d = f.contentDocument, z = Number(d.documentElement.style.zoom || 1);
  return { zoom: z, overflow: d.body.getBoundingClientRect().width * z - f.clientWidth };
});
test('phone: an A4 page and a receipt shrink to fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto('/#/history');
  await search(page, ids.p1.purchase.invoice_no);
  await card(page, 'Purchased from').getByRole('button', { name: ids.p1.purchase.invoice_no }).click();
  await expect(page.frameLocator('.doc-frame').locator('body')).toContainText('PURCHASE INVOICE');
  await expect.poll(async () => (await docFits(page)).zoom).toBeLessThan(0.6);
  expect((await docFits(page)).overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  await card(page, 'Sold to').getByRole('button', { name: ids.s1.sale.invoice_no }).click();
  await expect(page.frameLocator('.doc-frame').locator('body')).toContainText(`Invoice: ${ids.s1.sale.invoice_no}`);
  await expect.poll(async () => (await docFits(page)).overflow).toBeLessThanOrEqual(0);
});
