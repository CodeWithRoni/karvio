import { test, expect } from '@playwright/test';

// The invoice template (Settings → Invoice) is used by every A4 document: purchase invoice, purchase return, sales
// return / exchange, warranty claim, customer / supplier statement, quotation and the repair job card. POS stays as it is.
const endpoint = 'http://localhost:8787';
const shots = process.env.KARVIO_SHOTS || 'test-results';
const T = Date.now().toString().slice(-6), SN = (n) => `DT${T}SN${n}`;
let token, ids = {};
async function call(request, action, payload = {}) {
  const r = await request.post(endpoint, { data: { action, payload, token } });
  const body = await r.json();
  expect(body.ok, `${action}: ${body.error}`).toBe(true);
  return body.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  const boot = await call(request, 'bootstrap'), cash = boot.accounts.find((a) => a.type === 'cash') || boot.accounts[0];
  ids.saved = boot.settings.invoice_template || 'classic';
  const router = await call(request, 'product.save', { name: `DT ROUTER ${T}`, has_warranty: true, warranty_type: 'serial', warranty_days: 365 });
  const mouse = await call(request, 'product.save', { name: `DT MOUSE ${T}` });
  const sup = await call(request, 'supplier.save', { name: `DT Supplier ${T}`, phones: ['01711000071'], address: 'Elephant Road, Dhaka' });
  const cust = await call(request, 'customer.save', { name: `DT Karim ${T}`, phones: ['01811000071'] });
  const p = await call(request, 'purchase.create', { supplier_id: sup.id, supplier_invoice: `SUP-${T}`, items: [
    { product_id: router.id, qty: 3, cost: 2000, sale_price: 2600, serials: [SN(1), SN(2), SN(3)] }, { product_id: mouse.id, qty: 10, cost: 300, sale_price: 450 }], payments: [{ account_id: cash.id, amount: 5000 }] });
  const s = await call(request, 'sale.create', { customer_id: cust.id, items: [{ product_id: router.id, qty: 1, price: 2600, serials: [SN(1)] }, { product_id: mouse.id, qty: 2, price: 450 }], payments: [{ account_id: cash.id, amount: 3500 }] });
  const sr = await call(request, 'sreturn.create', { sale_id: s.sale.id, items: [{ sale_item_id: s.items[1].id, qty: 1 }], refund: { mode: 'cash', account_id: cash.id, amount: 450 }, type: 'return' });
  const pr = await call(request, 'preturn.create', { purchase_id: p.purchase.id, items: [{ purchase_item_id: p.items[0].id, qty: 1, serials: [SN(3)] }], refund: { mode: 'adjust' } });
  const cl = await call(request, 'claim.create', { sale_id: s.sale.id, sale_item_id: s.items[0].id, serial: SN(1), issue: 'No power' });
  const job = await call(request, 'repair.save', { customer_name: `DT Rahim ${T}`, phone: '01911000071', device: 'HP laptop', serial: 'HP-15', problem: 'No display', accessories: 'Charger', advance: 500, account_id: cash.id, estimate: 2500 });
  Object.assign(ids, { p, s, sr, pr, cl, job, cust, sup });
});
test.afterAll(async ({ request }) => { await call(request, 'settings.save', { values: { invoice_template: ids.saved } }); });
test.beforeEach(async ({ page }) => page.addInitScript(({ endpoint, token }) => {
  localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint }));
  localStorage.setItem('erp_token', token);
  window.__printed = [];
  const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { const w = d.get.call(this); if (w && !w.__h) { w.__h = 1; w.print = () => { window.__printed.push(w.document.documentElement.outerHTML); }; } return w; } });
}, { endpoint, token }));

for (const tpl of ['business', 'modern']) test(`every A4 document follows the ${tpl} template`, async ({ page, request, browser }) => {
  test.setTimeout(120000);
  await call(request, 'settings.save', { values: { invoice_template: tpl } });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/#/');
  await expect(page.locator('.page-head h1')).toBeVisible();
  // build / print each document with the app's own code (the same functions the pages call)
  const out = await page.evaluate(async (ids) => {
    const { api } = await import('/src/lib/api.js');
    const P = await import('/src/lib/purchaseDocs.js'), S = await import('/src/lib/salesDocs.js'), R = await import('/src/lib/receipt.js'), J = await import('/src/pages/Repairs.jsx');
    const doc = async (type, id) => (await api('history.doc', { type, id })).detail;
    const html = {
      purchase: P.purchaseDocHtml(await doc('purchase', ids.p.purchase.id)),
      preturn: P.purchaseReturnDocHtml(await doc('preturn', ids.pr.return.id)),
      sreturn: S.salesReturnDocHtml(await doc('sreturn', ids.sr.return.id)),
      claim: S.claimDocHtml(await doc('claim', ids.cl.id))
    };
    const st = await api('customer.statement', { customer_id: ids.cust.id });
    await R.printStatement('customer', st, '', '');
    await R.printQuotation({ title: 'Gaming PC', customer: 'Rahim', phone: '01711000000', lines: [{ group: 'CPU', name: 'Ryzen 5', qty: 1, price: 15000, warranty: '3 years' }, { group: 'RAM', name: '16 GB', qty: 2, price: 3500, warranty: '1 year' }], discount: 500, validDays: 7, no: 'Q-1' });
    await J.printJobSlip(ids.job);
    await new Promise((r) => setTimeout(r, 1500));
    return { ...html, statement: window.__printed[0], quotation: window.__printed[1], jobcard: window.__printed[2] };
  }, ids);
  const titles = { purchase: ['Purchase Invoice', 'PURCHASE INVOICE'], preturn: ['Purchase Return', 'PURCHASE RETURN'], sreturn: ['Sales Return', 'SALES RETURN'], claim: ['Warranty Claim', 'WARRANTY CLAIM'],
    statement: ['Customer Statement', 'CUSTOMER STATEMENT'], quotation: ['Quotation', 'QUOTATION'], jobcard: ['Repair Job Card', 'REPAIR JOB CARD'] };
  const view = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  for (const [k, h] of Object.entries(out)) {
    expect(h, k).toBeTruthy();
    await view.setContent(h.startsWith('<html') ? h : `<!doctype html><html><body style="width:186mm;margin:12mm auto">${h}</body></html>`);
    if (tpl === 'business') {
      await expect(view.locator('.bdoc'), k).toHaveCount(1);
      await expect(view.locator('.bdoc .bbar'), k).toHaveText(titles[k][0]);
      await expect(view.locator('.sdoc'), k).toHaveCount(0);
    } else {
      await expect(view.locator('.sdoc.tpl-modern'), k).toHaveCount(1);
      await expect(view.locator('.sdoc h2'), k).toHaveText(titles[k][1]);
    }
    await view.screenshot({ path: `${shots}/doc-${tpl}-${k}.png`, fullPage: true });
  }
  await view.close();
});
