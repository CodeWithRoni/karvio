import { test, expect } from '@playwright/test';

// Purchase edit (yellow Edit beside Cancel purchase), supplier warranty link only when not set,
// and the product form's required name parts.
const endpoint = 'http://localhost:8787';
let token, cash;
async function call(request, action, payload = {}) {
  const r = await (await request.post(endpoint, { data: { action, payload, token } })).json();
  expect(r.ok, r.error).toBe(true);
  return r.data;
}
test.beforeAll(async ({ request }) => {
  token = (await call(request, 'login', { username: 'admin', password: 'admin123' })).token;
  cash = (await call(request, 'bootstrap')).accounts.find((a) => a.type === 'cash').id;
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ endpoint, token }) => { try { localStorage.setItem('erp_api_config', JSON.stringify({ scriptUrl: endpoint })); localStorage.setItem('erp_token', token); } catch { /* about:blank */ } }, { endpoint, token });
});

test('edit a purchase: same number, new quantity and cost', async ({ page, request }) => {
  const stamp = Date.now();
  const p = await call(request, 'product.save', { name: `Edit cable ${stamp}`, sale_price: 100 });
  const sup = await call(request, 'supplier.save', { name: `Edit supplier ${stamp}` });
  const pur = await call(request, 'purchase.create', { supplier_id: sup.id, items: [{ product_id: p.id, qty: 5, cost: 50, supplier_warranty_expiry: '2027-11-16' }], payments: [] });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/purchases');
  await page.getByRole('cell', { name: pur.purchase.invoice_no, exact: true }).click();
  const dlg = page.getByRole('dialog', { name: `Purchase ${pur.purchase.invoice_no}` });
  await expect(dlg.getByRole('button', { name: 'Set supplier warranty' })).toHaveCount(0);
  const btns = await dlg.locator('.modal-foot button').allInnerTexts();
  expect(btns.indexOf('✎ Edit')).toBe(btns.indexOf('Cancel purchase') + 1);
  await dlg.getByRole('button', { name: '✎ Edit' }).click();
  const ed = page.getByRole('dialog', { name: `Edit purchase ${pur.purchase.invoice_no}` });
  await ed.getByLabel(`Quantity of ${p.name}`).fill('7');
  await ed.getByLabel(`Unit cost of ${p.name}`).fill('55');
  await ed.getByLabel('Admin password').fill('admin123');
  await page.screenshot({ path: '/tmp/purchase-edit.png' });
  await ed.getByRole('button', { name: 'Save changes' }).click();
  await expect(ed).toHaveCount(0);
  const d = await call(request, 'purchase.detail', { id: pur.purchase.invoice_no });
  expect(d.purchase.total).toBe(385);
  expect(d.items[0].supplier_warranty_expiry).toBe('2027-11-16');
});

test('a new stock product needs group, category, brand, model and unit', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/products');
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Add product' });
  for (const l of ['Product group', 'Category', 'Brand', 'SKU / model', 'Selling unit']) await expect(dlg.locator('.field-label', { hasText: l }).locator('.req')).toHaveText('*');
  await dlg.getByLabel('Product name').fill('ACCESSORIES ONLY');
  await dlg.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dlg.locator('.field-error').first()).toHaveText('Required');
  await page.screenshot({ path: '/tmp/product-required.png' });
  await expect(dlg).toBeVisible();
});
